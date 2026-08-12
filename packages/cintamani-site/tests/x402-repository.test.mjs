import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { validateProposal } from '../src/lib/proposals.mjs'
import { listProposals, readProposal } from '../worker/repository.mjs'
import { hmacHex } from '../worker/security.mjs'
import {
  decryptX402EnvelopeForTest,
  beginVerification,
  finalizePaidProposal,
  loadVerifiedSettlementContext,
  paymentResumeState,
  recordUnpersistedSettlementSuccess,
  recordSettlementOutcome,
  recordVerifiedPayment,
  resumePaidProposal,
  reserveX402Intent,
  retryStatus,
  beginSettlement,
  expireX402IntentIfNeeded,
} from '../worker/x402-repository.mjs'
import { SQLiteD1 } from './helpers/sqlite-d1.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const current = '2026-08-11T18:00:00.000Z'
const payer = '0x1111111111111111111111111111111111111111'
const requirements = {
  scheme: 'exact', network: 'eip155:84532',
  asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: '10000',
  payTo: '0x2222222222222222222222222222222222222222', maxTimeoutSeconds: 300, extra: {},
}

function proposal(overrides = {}) {
  return {
    kind: 'theoretical-model-member',
    title: 'Paid candidate model',
    summary: 'A bounded accountless proposal entering as submitted and unreviewed.',
    rationale: 'The payment is flood friction and carries no epistemic weight.',
    scope: 'This exact public revision only.',
    detail: {
      member_id: 'paid-model', member_name: 'Paid candidate',
      model_definition: 'A finite transition system.',
      computational_claim: 'A defeasible input-output conjecture.', initial_epistemic_status: 'candidate',
    },
    evidence: [{ evidence_kind: 'argument', summary: 'A defeasible argument.' }],
    references: [{ reference_kind: 'context', label: 'Context', https_url: 'https://example.org/context' }],
    ...overrides,
  }
}

function harness() {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  return {
    database,
    env: {
      PROPOSALS_DB: database, TEST_NOW: current,
      IDENTITY_HMAC_SECRET: 'identity-hmac-secret-for-x402-tests',
      X402_ENVELOPE_SECRET: 'envelope-secret-for-x402-tests-0001',
      PUBLIC_WRITE_LIMIT_PER_HOUR: '30', PUBLIC_GLOBAL_WRITE_LIMIT_PER_HOUR: '300',
    },
  }
}

async function settled(h, raw = proposal(), key = 'paid-proposal-0001') {
  const ipHash = await hmacHex(h.env.IDENTITY_HMAC_SECRET, 'ip:203.0.113.4')
  const normalized = validateProposal(raw)
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: key, normalizedRequest: normalized, requirements, ipHash, mode: 'testnet', current,
  })
  const payload = { x402Version: 2, payload: { authorization: { from: payer } } }
  await beginVerification(h.env, reservation.payment_intent_id, current)
  const verified = await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id, paymentPayload: payload, payer, ipHash, current,
  })
  await beginSettlement(h.env, reservation.payment_intent_id, current)
  const settlement = { success: true, payer, transaction: '0xabc', network: requirements.network }
  const outcome = await recordSettlementOutcome(h.env, {
    paymentIntentId: reservation.payment_intent_id, outcome: 'settled', settlement,
    paymentResponseHeader: 'encoded-payment-response', current,
  })
  return { ipHash, raw, normalized, reservation, verified, outcome, payload }
}

test('reservation is idempotent, bounded before challenge, and conflicting content is rejected', async () => {
  const h = harness()
  const ipHash = 'a'.repeat(64)
  const normalized = validateProposal(proposal())
  const first = await reserveX402Intent(h.env, {
    idempotencyKey: 'same-key-0001', normalizedRequest: normalized, requirements, ipHash, mode: 'testnet', current,
  })
  const replay = await reserveX402Intent(h.env, {
    idempotencyKey: 'same-key-0001', normalizedRequest: normalized, requirements, ipHash, mode: 'testnet', current,
  })
  assert.equal(replay.payment_intent_id, first.payment_intent_id)
  assert.equal(replay.replay, true)
  await assert.rejects(
    reserveX402Intent(h.env, {
      idempotencyKey: 'same-key-0001', normalizedRequest: validateProposal(proposal({ title: 'Different paid model' })),
      requirements, ipHash, mode: 'testnet', current,
    }),
    (error) => error.code === 'idempotency_conflict',
  )
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM x402_prechallenge_events').get().count, 1)
})

test('expiry transition storage failure fails closed unless authoritative state proves a race', async () => {
  const h = harness()
  const normalized = validateProposal(proposal())
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'expiry-batch-failure', normalizedRequest: normalized, requirements,
    ipHash: 'a'.repeat(64), mode: 'testnet', current,
  })
  const originalBatch = h.env.PROPOSALS_DB.batch.bind(h.env.PROPOSALS_DB)
  h.env.PROPOSALS_DB.batch = async () => { throw new Error('injected expiry batch failure') }
  await assert.rejects(
    expireX402IntentIfNeeded(h.env, reservation.payment_intent_id, '2026-08-11T18:10:00.000Z'),
    /injected expiry batch failure/u,
  )
  assert.equal((await paymentResumeState(h.env, reservation.payment_intent_id)).payment_state, 'reserved')

  h.env.PROPOSALS_DB.batch = async (statements) => {
    await originalBatch(statements)
    throw new Error('lost response after concurrent expiry commit')
  }
  const converged = await expireX402IntentIfNeeded(
    h.env, reservation.payment_intent_id, '2026-08-11T18:10:00.000Z',
  )
  assert.deepEqual(converged, { expired: true, state: 'expired' })
})

test('verified payment creates HMAC-only wallet identity and encrypted envelopes', async () => {
  const h = harness()
  const flow = await settled(h)
  const wallet = h.database.database.prepare(
    `SELECT principal.public_pseudonym, wallet.address_hmac_sha256
     FROM contributor_principals principal JOIN base_wallet_identities wallet USING (principal_id)`,
  ).get()
  assert.match(wallet.public_pseudonym, /^base:[0-9a-f]{12,64}$/u)
  assert.equal(JSON.stringify(wallet).includes(payer), false)
  const intent = h.database.database.prepare(
    'SELECT payment_payload_ciphertext, payment_payload_nonce_base64url FROM x402_payment_intents',
  ).get()
  assert.equal(JSON.stringify(intent).includes(payer), false)
  assert.deepEqual(await decryptX402EnvelopeForTest(h.env, {
    ciphertext: intent.payment_payload_ciphertext, nonce: intent.payment_payload_nonce_base64url,
  }), flow.payload)
  const states = h.database.database.prepare(
    'SELECT to_state FROM x402_payment_events ORDER BY event_sequence',
  ).all().map((row) => row.to_state)
  assert.deepEqual(states, ['reserved', 'verifying', 'verified', 'settling', 'settled'])
})

test('settled entitlement finalizes one proposal atomically and replays without a second payment', async () => {
  const h = harness()
  const flow = await settled(h)
  const result = await finalizePaidProposal(h.env, {
    paymentIntentId: flow.reservation.payment_intent_id,
    publicRetryReference: flow.verified.public_retry_reference,
    rawBody: flow.raw, ipHash: flow.ipHash, paymentResponseHeader: 'encoded-payment-response', current,
  })
  assert.equal(result.status, 201)
  assert.equal(result.body.administrative_state, 'submitted')
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM proposal_payment_sources').get().count, 1)
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_payment_intents').get().current_state, 'finalized')
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_retry_entitlements').get().current_state, 'consumed')
  const replay = await resumePaidProposal(h.env, {
    publicRetryReference: flow.verified.public_retry_reference,
    idempotencyKey: 'paid-proposal-0001', rawBody: flow.raw, ipHash: flow.ipHash, current,
  })
  assert.equal(replay.status, 200)
  assert.equal(replay.body.proposal_id, result.body.proposal_id)
})

test('paid wallet proposal is anonymously listed and readable only through its public pseudonym', async () => {
  const h = harness()
  const flow = await settled(h, proposal(), 'public-wallet-proposal-0001')
  const created = await finalizePaidProposal(h.env, {
    paymentIntentId: flow.reservation.payment_intent_id,
    publicRetryReference: flow.verified.public_retry_reference,
    rawBody: flow.raw,
    ipHash: flow.ipHash,
    current,
  })
  assert.equal(created.status, 201)

  const listing = await listProposals(h.env, new URL('https://cintamani.example/api/proposals'))
  assert.equal(listing.body.items.length, 1)
  assert.equal(listing.body.items[0].principal_kind, 'base-wallet')
  assert.match(listing.body.items[0].public_pseudonym, /^base:[0-9a-f]{12,64}$/u)
  assert.equal(listing.body.items[0].github_login, null)

  const detail = await readProposal(h.env, created.body.proposal_id)
  assert.equal(detail.body.proposal.principal_kind, 'base-wallet')
  assert.equal(detail.body.revisions[0].public_pseudonym, listing.body.items[0].public_pseudonym)
  const serialized = JSON.stringify({ listing: listing.body, detail: detail.body })
  assert.equal(serialized.includes(payer), false)
  assert.doesNotMatch(serialized, /address_hmac|payer_principal|payment_intent|settlement_receipt/u)
})

test('indeterminate settlement opens reconciliation and does not create a proposal', async () => {
  const h = harness()
  const ipHash = 'b'.repeat(64)
  const raw = proposal()
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'unknown-key-0001', normalizedRequest: validateProposal(raw), requirements, ipHash, mode: 'testnet', current,
  })
  await beginVerification(h.env, reservation.payment_intent_id, current)
  const verified = await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id, paymentPayload: { x402Version: 2 }, payer, ipHash, current,
  })
  await beginSettlement(h.env, reservation.payment_intent_id, current)
  const result = await recordSettlementOutcome(h.env, {
    paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate', current,
  })
  assert.equal(result.public_retry_reference, verified.public_retry_reference)
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_payment_intents').get().current_state, 'settlement-unknown')
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_reconciliation_cases').get().current_state, 'open')
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM proposals').get().count, 0)
})

test('failed atomic finalization returns durable retry reference and preserves PAYMENT-RESPONSE', async () => {
  const h = harness()
  const raw = proposal()
  const flow = await settled(h, raw, 'failed-finalize-0001')
  h.env.PROPOSALS_DB.batch = async () => { throw new Error('injected D1 finalization failure') }
  const result = await finalizePaidProposal(h.env, {
    paymentIntentId: flow.reservation.payment_intent_id,
    publicRetryReference: flow.verified.public_retry_reference,
    rawBody: raw, ipHash: flow.ipHash, paymentResponseHeader: 'encoded-payment-response', current,
  })
  assert.equal(result.status, 503)
  assert.equal(result.body.retry_reference, flow.verified.public_retry_reference)
  assert.equal(result.payment_response_header, 'encoded-payment-response')
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_payment_intents').get().current_state, 'settled')
  assert.equal(h.database.database.prepare('SELECT current_state FROM x402_retry_entitlements').get().current_state, 'available')
  h.env.PROPOSALS_DB.batch = SQLiteD1.prototype.batch.bind(h.database)
  const resumed = await resumePaidProposal(h.env, {
    publicRetryReference: flow.verified.public_retry_reference,
    idempotencyKey: 'failed-finalize-0001', rawBody: raw, ipHash: flow.ipHash, current,
  })
  assert.equal(resumed.status, 201)
  assert.equal(resumed.payment_response_header, 'encoded-payment-response')
})

test('retry status is opaque, binds original key/body, and reports unknown without settlement calls', async () => {
  const h = harness()
  const ipHash = 'c'.repeat(64)
  const raw = proposal()
  const normalized = validateProposal(raw)
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'status-key-0001', normalizedRequest: normalized, requirements, ipHash, mode: 'testnet', current,
  })
  await beginVerification(h.env, reservation.payment_intent_id, current)
  const verified = await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id, paymentPayload: { x402Version: 2 }, payer, ipHash, current,
  })
  await beginSettlement(h.env, reservation.payment_intent_id, current)
  await recordSettlementOutcome(h.env, { paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate', current })
  const status = await retryStatus(h.env, {
    publicRetryReference: verified.public_retry_reference,
    idempotencyKey: 'status-key-0001', normalizedRequest: normalized,
  })
  assert.equal(status.payment_state, 'settlement-unknown')
  assert.equal(status.retryable_without_payment, false)
  const resumed = await resumePaidProposal(h.env, {
    publicRetryReference: verified.public_retry_reference,
    idempotencyKey: 'status-key-0001', rawBody: raw, ipHash, current,
  })
  assert.equal(resumed.status, 503)
  await assert.rejects(
    retryStatus(h.env, {
      publicRetryReference: verified.public_retry_reference,
      idempotencyKey: 'wrong-key-0001', normalizedRequest: normalized,
    }),
    (error) => error.code === 'paid_request_conflict',
  )
  await assert.rejects(
    retryStatus(h.env, {
      publicRetryReference: verified.public_retry_reference,
      idempotencyKey: 'status-key-0001', normalizedRequest: validateProposal(proposal({ title: 'Wrong body' })),
    }),
    (error) => error.code === 'paid_request_conflict',
  )
})

test('phase starts are idempotent and rejected settlement is a terminal safe status', async () => {
  const h = harness()
  const ipHash = 'd'.repeat(64)
  const raw = proposal()
  const normalized = validateProposal(raw)
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'rejected-key-0001', normalizedRequest: normalized, requirements, ipHash, mode: 'testnet', current,
  })
  assert.equal((await beginVerification(h.env, reservation.payment_intent_id, current)).replay, false)
  assert.equal((await beginVerification(h.env, reservation.payment_intent_id, current)).replay, true)
  const verified = await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id, paymentPayload: { x402Version: 2 }, payer, ipHash, current,
  })
  assert.equal((await beginSettlement(h.env, reservation.payment_intent_id, current)).replay, false)
  assert.equal((await beginSettlement(h.env, reservation.payment_intent_id, current)).replay, true)
  await recordSettlementOutcome(h.env, {
    paymentIntentId: reservation.payment_intent_id, outcome: 'rejected', settlement: { success: false }, current,
  })
  const status = await retryStatus(h.env, {
    publicRetryReference: verified.public_retry_reference,
    idempotencyKey: 'rejected-key-0001', normalizedRequest: normalized,
  })
  assert.equal(status.payment_state, 'rejected')
  assert.equal(status.terminal, true)
  const resumed = await resumePaidProposal(h.env, {
    publicRetryReference: verified.public_retry_reference,
    idempotencyKey: 'rejected-key-0001', rawBody: raw, ipHash, current,
  })
  assert.equal(resumed.status, 402)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM x402_settlement_receipts').get().count, 0)
})

test('verified crash reloads integrity-checked context while settling replay never redispatches', async () => {
  const h = harness()
  const ipHash = 'e'.repeat(64)
  const raw = proposal()
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'crash-boundary-0001', normalizedRequest: validateProposal(raw), requirements, ipHash, mode: 'testnet', current,
  })
  await beginVerification(h.env, reservation.payment_intent_id, current)
  const payload = { x402Version: 2, payload: { authorization: { from: payer } } }
  await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id, paymentPayload: payload, payer, ipHash, current,
  })
  const loaded = await loadVerifiedSettlementContext(h.env, reservation.payment_intent_id)
  assert.deepEqual(loaded.payload, payload)
  assert.deepEqual(loaded.requirements, requirements)
  assert.equal((await paymentResumeState(h.env, reservation.payment_intent_id)).action, 'load-and-settle')
  let settleCalls = 0
  await beginSettlement(h.env, reservation.payment_intent_id, current)
  const replay = await paymentResumeState(h.env, reservation.payment_intent_id)
  if (replay.action === 'load-and-settle') settleCalls += 1
  assert.equal(replay.action, 'mark-unknown-never-resettle')
  assert.equal(settleCalls, 0)
  const unknown = await recordSettlementOutcome(h.env, {
    paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate', current,
  })
  assert.ok(unknown.public_retry_reference)
})

test('successful settlement with failed receipt persistence preserves feedback and opens reconciliation', async () => {
  const h = harness()
  const flow = await settled(h, proposal(), 'receipt-failure-0001')
  // Rewind this fixture to the pre-outcome crash boundary without mutating immutable
  // history by creating a second independent intent.
  const ipHash = '9'.repeat(64)
  const raw = proposal({ title: 'Receipt persistence crash' })
  const reservation = await reserveX402Intent(h.env, {
    idempotencyKey: 'receipt-failure-0002', normalizedRequest: validateProposal(raw), requirements, ipHash, mode: 'testnet', current,
  })
  await beginVerification(h.env, reservation.payment_intent_id, current)
  await recordVerifiedPayment(h.env, {
    paymentIntentId: reservation.payment_intent_id,
    paymentPayload: { ...flow.payload, payload: { authorization: { from: payer, nonce: 'receipt-failure' } } },
    payer, ipHash, current,
  })
  await beginSettlement(h.env, reservation.payment_intent_id, current)
  const originalBatch = h.env.PROPOSALS_DB.batch.bind(h.env.PROPOSALS_DB)
  h.env.PROPOSALS_DB.batch = async () => { throw new Error('injected receipt persistence failure') }
  await assert.rejects(recordSettlementOutcome(h.env, {
    paymentIntentId: reservation.payment_intent_id, outcome: 'settled',
    settlement: { success: true, transaction: '0xdef', network: requirements.network },
    paymentResponseHeader: 'preserved-payment-response', current,
  }), /injected receipt/u)
  h.env.PROPOSALS_DB.batch = originalBatch
  const result = await recordUnpersistedSettlementSuccess(h.env, {
    paymentIntentId: reservation.payment_intent_id,
    paymentResponseHeader: 'preserved-payment-response', current,
  })
  assert.equal(result.status, 503)
  assert.equal(result.payment_response_header, 'preserved-payment-response')
  assert.equal((await paymentResumeState(h.env, reservation.payment_intent_id)).payment_state, 'settlement-unknown')
})
