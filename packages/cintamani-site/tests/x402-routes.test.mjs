import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { encodePaymentSignatureHeader } from '@x402/core/http'
import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import worker from '../worker/index.mjs'
import { csrfForSession, sha256Hex } from '../worker/security.mjs'
import { SQLiteD1 } from './helpers/sqlite-d1.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const publicOrigin = 'https://canonical.cintamani.test'
const payer = '0x1111111111111111111111111111111111111111'

function proposal(overrides = {}) {
  return {
    kind: 'theoretical-model-member', title: 'Route-level paid proposal',
    summary: 'A bounded route test for accountless publication.',
    rationale: 'Payment is flood friction and has no epistemic meaning.', scope: 'This route test only.',
    detail: {
      member_id: 'route-paid-model', member_name: 'Route paid model',
      model_definition: 'A finite test transition system.', computational_claim: 'The HTTP saga completes once.',
      initial_epistemic_status: 'candidate',
    },
    evidence: [], references: [], ...overrides,
  }
}

function harness({ verify = async () => ({ isValid: true, payer }), settle = async () => ({ success: true, payer, transaction: '0xabc', network: 'eip155:84532' }) } = {}) {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  let verifyCalls = 0
  let settleCalls = 0
  const env = {
    PROPOSALS_DB: database,
    ASSETS: { fetch: async () => new Response('asset') },
    ENVIRONMENT: 'test', TEST_NOW: new Date().toISOString(),
    PUBLIC_ORIGIN: publicOrigin, X402_ENABLED: 'true', X402_MODE: 'testnet',
    BASE_SEPOLIA_RPC_URL: 'https://rpc.example.invalid',
    X402_PAY_TO: '0x2222222222222222222222222222222222222222',
    IP_HASH_SECRET: 'ip-hash-secret-never-stores-raw-address',
    IDENTITY_HMAC_SECRET: 'identity-hmac-secret-for-route-tests',
    X402_ENVELOPE_SECRET: 'envelope-secret-for-route-tests-0001',
    CSRF_SECRET: 'csrf-secret-for-route-tests-0000001',
    TEST_SIWX_EVM_VERIFIER: (args) => verifyMessage(args),
    TEST_X402_FACILITATOR: {
      async verify(...args) { verifyCalls += 1; return verify(...args) },
      async settle(...args) { settleCalls += 1; return settle(...args) },
    },
  }
  const call = (path, { body, key = 'route-paid-key-0001', payment, headers = {} } = {}) => {
    const requestHeaders = new Headers({ 'content-type': 'application/json', 'idempotency-key': key, 'cf-connecting-ip': '203.0.113.8', ...headers })
    if (payment) requestHeaders.set('payment-signature', payment)
    return worker.fetch(new Request(`https://attacker-host.invalid${path}`, {
      method: 'POST', headers: requestHeaders, body: JSON.stringify(body ?? proposal()),
    }), env)
  }
  return { database, env, call, counts: () => ({ verifyCalls, settleCalls }) }
}

function signature(value = '0x01') {
  return encodePaymentSignatureHeader({
    x402Version: 2,
    resource: { url: `${publicOrigin}/api/x402/proposals` },
    accepted: {
      scheme: 'exact', network: 'eip155:84532', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      amount: '10000', payTo: '0x2222222222222222222222222222222222222222', maxTimeoutSeconds: 300, extra: {},
    },
    payload: { signature: value },
  })
}

test('x402 disabled fails closed and validation happens before challenge reservation', async () => {
  const h = harness()
  h.env.X402_ENABLED = 'false'
  let response = await h.call('/api/x402/proposals')
  assert.equal(response.status, 503)
  h.env.X402_ENABLED = 'true'
  response = await h.call('/api/x402/proposals', { body: { title: '' }, key: 'invalid-route-key' })
  assert.equal(response.status, 400)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM x402_prechallenge_events').get().count, 0)
})

test('config and health report enabled lane prerequisites before any challenge', async () => {
  const h = harness()
  delete h.env.X402_ENVELOPE_SECRET
  let response = await worker.fetch(new Request(`${publicOrigin}/api/config`), h.env)
  const config = await response.json()
  assert.equal(config.x402.enabled, false)
  assert.equal(config.x402.configuration_status, 'invalid')
  assert.ok(config.x402.readiness_reason_codes.includes('missing_x402_envelope_secret'))
  assert.equal(JSON.stringify(config).includes('identity-hmac-secret'), false)
  response = await worker.fetch(new Request(`${publicOrigin}/api/health`), h.env)
  assert.equal((await response.json()).status, 'degraded')
  response = await h.call('/api/x402/proposals')
  assert.equal(response.status, 503)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM x402_prechallenge_events').get().count, 0)
})

test('same-key unsigned challenge replays consume the bounded challenge quota', async () => {
  const h = harness()
  h.env.X402_PRECHALLENGE_IP_LIMIT_PER_HOUR = '2'
  let response = await h.call('/api/x402/proposals', { key: 'bounded-challenge-key' })
  assert.equal(response.status, 402)
  response = await h.call('/api/x402/proposals', { key: 'bounded-challenge-key' })
  assert.equal(response.status, 402)
  response = await h.call('/api/x402/proposals', { key: 'bounded-challenge-key' })
  assert.equal(response.status, 429)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM x402_prechallenge_events').get().count, 2)
})

test('concurrent unsigned challenge replays cannot exceed the challenge quota', async () => {
  const h = harness()
  h.env.X402_PRECHALLENGE_IP_LIMIT_PER_HOUR = '2'
  await h.call('/api/x402/proposals', { key: 'concurrent-challenge-key' })
  const responses = await Promise.all([
    h.call('/api/x402/proposals', { key: 'concurrent-challenge-key' }),
    h.call('/api/x402/proposals', { key: 'concurrent-challenge-key' }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [402, 429])
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM x402_prechallenge_events').get().count, 2)
})

test('concurrent distinct-key reservations share the atomic challenge quota gate', async () => {
  const h = harness()
  h.env.X402_PRECHALLENGE_IP_LIMIT_PER_HOUR = '1'
  const responses = await Promise.all([
    h.call('/api/x402/proposals', { key: 'distinct-challenge-key-a' }),
    h.call('/api/x402/proposals', { key: 'distinct-challenge-key-b' }),
  ])
  assert.deepEqual(responses.map((response) => response.status).sort(), [402, 429])
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM x402_prechallenge_events').get().count, 1)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM x402_payment_intents').get().count, 1)
})

test('reserved and verifying attempts expire at the exact boundary without facilitator or settlement', async () => {
  const reserved = harness()
  await reserved.call('/api/x402/proposals', { key: 'reserved-expiry-key' })
  reserved.env.TEST_NOW = new Date(Date.parse(reserved.env.TEST_NOW) + 10 * 60 * 1000).toISOString()
  let response = await reserved.call('/api/x402/proposals', { key: 'reserved-expiry-key', payment: signature() })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'payment_attempt_expired')
  assert.deepEqual(reserved.counts(), { verifyCalls: 0, settleCalls: 0 })

  const verifying = harness({ verify: async () => { throw new TypeError('temporary verify network failure') } })
  await verifying.call('/api/x402/proposals', { key: 'verifying-expiry-key' })
  response = await verifying.call('/api/x402/proposals', { key: 'verifying-expiry-key', payment: signature() })
  assert.equal(response.status, 503)
  verifying.env.TEST_NOW = new Date(Date.parse(verifying.env.TEST_NOW) + 10 * 60 * 1000).toISOString()
  response = await verifying.call('/api/x402/proposals', { key: 'verifying-expiry-key', payment: signature() })
  assert.equal(response.status, 409)
  assert.deepEqual(verifying.counts(), { verifyCalls: 1, settleCalls: 0 })

  let crossingEnv
  const crossing = harness({ verify: async () => {
    crossingEnv.TEST_NOW = new Date(Date.parse(crossingEnv.TEST_NOW) + 10 * 60 * 1000).toISOString()
    return { isValid: true, payer }
  } })
  crossingEnv = crossing.env
  await crossing.call('/api/x402/proposals', { key: 'crossing-expiry-key' })
  response = await crossing.call('/api/x402/proposals', { key: 'crossing-expiry-key', payment: signature() })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'payment_attempt_expired')
  assert.deepEqual(crossing.counts(), { verifyCalls: 1, settleCalls: 0 })
})

test('expiry batch failure fails closed before facilitator verification or settlement', async () => {
  const h = harness()
  await h.call('/api/x402/proposals', { key: 'expiry-storage-failure-key' })
  h.env.TEST_NOW = new Date(Date.parse(h.env.TEST_NOW) + 10 * 60 * 1000).toISOString()
  const originalBatch = h.env.PROPOSALS_DB.batch.bind(h.env.PROPOSALS_DB)
  h.env.PROPOSALS_DB.batch = async () => { throw new Error('injected expiry storage failure') }
  const response = await h.call('/api/x402/proposals', {
    key: 'expiry-storage-failure-key', payment: signature(),
  })
  h.env.PROPOSALS_DB.batch = originalBatch
  assert.equal(response.status, 500)
  assert.deepEqual(h.counts(), { verifyCalls: 0, settleCalls: 0 })
  assert.equal(h.database.database.prepare(
    "SELECT current_state FROM x402_payment_intents WHERE idempotency_key_sha256 IS NOT NULL",
  ).get().current_state, 'reserved')
})

test('challenge uses canonical PUBLIC_ORIGIN and successful replay settles exactly once', async () => {
  const h = harness()
  const first = await h.call('/api/x402/proposals')
  assert.equal(first.status, 402)
  const required = JSON.parse(Buffer.from(first.headers.get('payment-required'), 'base64').toString('utf8'))
  assert.equal(required.resource.url, `${publicOrigin}/api/x402/proposals`)
  assert.equal(required.accepts[0].amount, '10000')
  const paid = await h.call('/api/x402/proposals', { payment: signature() })
  assert.equal(paid.status, 201, await paid.clone().text())
  assert.ok(paid.headers.get('payment-response'))
  const created = await paid.json()
  assert.equal(created.administrative_state, 'submitted')
  const replay = await h.call('/api/x402/proposals', { payment: signature() })
  assert.equal(replay.status, 200)
  assert.ok(replay.headers.get('payment-response'))
  assert.deepEqual(h.counts(), { verifyCalls: 1, settleCalls: 1 })
})

test('concurrent verified requests dispatch settlement at most once', async () => {
  let releaseSettlement
  let settlementStarted
  const started = new Promise((resolve) => { settlementStarted = resolve })
  const gate = new Promise((resolve) => { releaseSettlement = resolve })
  const h = harness({ settle: async () => {
    settlementStarted()
    await gate
    return { success: true, payer, transaction: '0xabc', network: 'eip155:84532' }
  } })
  await h.call('/api/x402/proposals', { key: 'concurrent-settlement-key' })
  const first = h.call('/api/x402/proposals', { key: 'concurrent-settlement-key', payment: signature() })
  await started
  const second = await h.call('/api/x402/proposals', { key: 'concurrent-settlement-key', payment: signature() })
  releaseSettlement()
  const firstResponse = await first
  assert.equal(second.status, 503)
  assert.equal(firstResponse.status, 503)
  assert.ok(firstResponse.headers.get('payment-response'))
  assert.deepEqual(h.counts(), { verifyCalls: 1, settleCalls: 1 })
})

test('verification transport failure can reacquire a challenge and recover the same attempt', async () => {
  let verificationCalls = 0
  const h = harness({ verify: async () => {
    verificationCalls += 1
    if (verificationCalls === 1) throw new TypeError('verification network unavailable')
    return { isValid: true, payer }
  } })
  await h.call('/api/x402/proposals', { key: 'verify-recovery-key' })
  let response = await h.call('/api/x402/proposals', { key: 'verify-recovery-key', payment: signature() })
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'payment_verification_unavailable')
  response = await h.call('/api/x402/proposals', { key: 'verify-recovery-key' })
  assert.equal(response.status, 402)
  assert.ok(response.headers.get('payment-required'))
  response = await h.call('/api/x402/proposals', { key: 'verify-recovery-key', payment: signature() })
  assert.equal(response.status, 201, await response.clone().text())
  assert.deepEqual(h.counts(), { verifyCalls: 2, settleCalls: 1 })
})

test('concurrent verification retries still settle at most once', async () => {
  let releaseFirst
  let firstStarted
  let calls = 0
  const started = new Promise((resolve) => { firstStarted = resolve })
  const gate = new Promise((resolve) => { releaseFirst = resolve })
  const h = harness({ verify: async () => {
    calls += 1
    if (calls === 1) { firstStarted(); await gate }
    return { isValid: true, payer }
  } })
  await h.call('/api/x402/proposals', { key: 'concurrent-verify-key' })
  const first = h.call('/api/x402/proposals', { key: 'concurrent-verify-key', payment: signature() })
  await started
  const second = await h.call('/api/x402/proposals', { key: 'concurrent-verify-key', payment: signature() })
  releaseFirst()
  const firstResponse = await first
  assert.equal(second.status, 201)
  assert.equal(firstResponse.status, 409)
  assert.deepEqual(h.counts(), { verifyCalls: 2, settleCalls: 1 })
})

test('legacy header, settlement rejection, and indeterminate settlement retain exact protocol semantics', async () => {
  const legacy = harness()
  let response = await legacy.call('/api/x402/proposals', { headers: { 'x-payment': 'legacy' } })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'legacy_x402_header')

  const privateFacilitatorText = 'Denied payer 0x9999999999999999999999999999999999999999 tx 0xprivate'
  const rejected = harness({ settle: async () => ({ success: false, errorReason: 'denied', errorMessage: privateFacilitatorText, transaction: '', network: 'eip155:84532' }) })
  await rejected.call('/api/x402/proposals', { key: 'rejected-route-key' })
  response = await rejected.call('/api/x402/proposals', { key: 'rejected-route-key', payment: signature() })
  assert.equal(response.status, 402)
  assert.ok(response.headers.get('payment-response'))
  assert.equal((await response.clone().text()).includes(privateFacilitatorText), false)
  assert.equal(rejected.database.database.prepare('SELECT COUNT(*) AS count FROM x402_settlement_receipts').get().count, 0)
  response = await rejected.call('/api/x402/proposals', { key: 'rejected-route-key', payment: signature() })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'payment_attempt_terminal')

  const unknown = harness({ settle: async () => { throw new TypeError('network lost after dispatch') } })
  await unknown.call('/api/x402/proposals', { key: 'unknown-route-key' })
  response = await unknown.call('/api/x402/proposals', { key: 'unknown-route-key', payment: signature() })
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('payment-response'), null)
  assert.match((await response.json()).retry_reference, /^x402-retry-/u)
})

test('opaque status and retry bind exact key/body, hide intent IDs, and never repay', async () => {
  const h = harness()
  await h.call('/api/x402/proposals')
  const paid = await h.call('/api/x402/proposals', { payment: signature() })
  assert.equal(paid.status, 201)
  const reference = h.database.database.prepare('SELECT public_retry_reference FROM x402_retry_entitlements').get().public_retry_reference
  let response = await h.call(`/api/x402/proposals/status/${reference}`)
  assert.equal(response.status, 200)
  const status = await response.json()
  assert.equal(status.payment_state, 'finalized')
  assert.equal(JSON.stringify(status).includes('payment-intent-'), false)
  response = await h.call(`/api/x402/proposals/retry/${reference}`)
  assert.equal(response.status, 200)
  assert.ok(response.headers.get('payment-response'))
  assert.deepEqual(h.counts(), { verifyCalls: 1, settleCalls: 1 })
  response = await h.call(`/api/x402/proposals/status/${reference}`, { key: 'wrong-route-key' })
  assert.equal(response.status, 409)
  h.env.X402_ENABLED = 'false'
  delete h.env.X402_PAY_TO
  h.env.TEST_NOW = new Date(Date.parse(h.env.TEST_NOW) + 24 * 60 * 60 * 1000).toISOString()
  response = await h.call(`/api/x402/proposals/status/${reference}`)
  assert.equal(response.status, 200)
  response = await h.call(`/api/x402/proposals/retry/${reference}`)
  assert.equal(response.status, 200)
  assert.deepEqual(h.counts(), { verifyCalls: 1, settleCalls: 1 })
})

test('Worker SIWX routes bind PUBLIC_ORIGIN and link, replay, then revoke one GitHub-wallet pair', async () => {
  const h = harness()
  const githubId = 'account-link-route'
  const token = 'github-link-route-session-token-with-randomness'
  const csrf = await csrfForSession(h.env, token)
  h.database.database.prepare(
    `INSERT INTO public_accounts (
      account_id, github_identity_hmac_sha256, github_login, github_profile_url,
      github_avatar_url, created_at, last_authenticated_at
    ) VALUES (?, ?, 'linker', 'https://github.com/linker', NULL, ?, ?)`,
  ).run(githubId, '7'.repeat(64), h.env.TEST_NOW, h.env.TEST_NOW)
  const tokenHash = await sha256Hex(token)
  h.database.database.prepare(
    `INSERT INTO public_sessions (
      session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
      revoked_at, rotated_to_sha256, auth_kind, transport, scope
    ) VALUES (?, ?, ?, ?, '2026-08-18T18:00:00.000Z', NULL, NULL, 'github', 'browser-cookie', 'public-contributor')`,
  ).run(tokenHash, await sha256Hex(csrf), githubId, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO principal_session_events (
      session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
      rotated_to_sha256, rationale, source_timestamp, recorded_at
    ) VALUES (?, 1, 'link-route-session-issued', ?, 'issued', NULL, 'Test link session', ?, ?)`,
  ).run(tokenHash, githubId, h.env.TEST_NOW, h.env.TEST_NOW)
  const account = privateKeyToAccount(`0x${'88'.repeat(32)}`)
  const authHeaders = {
    cookie: `__Host-cintamani_session=${token}`,
    origin: publicOrigin,
    'x-csrf-token': csrf,
  }
  async function mutate(purpose) {
    const challengeResponse = await worker.fetch(new Request(
      `${publicOrigin}/api/auth/wallet/challenge?purpose=${purpose}`,
      { method: 'POST', headers: authHeaders },
    ), h.env)
    assert.equal(challengeResponse.status, 200, await challengeResponse.clone().text())
    const challenge = await challengeResponse.json()
    assert.equal(new URL(challenge.extension.info.uri).origin, publicOrigin)
    const selected = challenge.extension.supportedChains.find((item) => item.chainId === challenge.chain_id)
    const proof = await createSIWxPayload({ ...challenge.extension.info, ...selected }, account)
    return worker.fetch(new Request(challenge.extension.info.uri, {
      method: 'POST',
      headers: { ...authHeaders, 'sign-in-with-x': encodeSIWxHeader(proof) },
    }), h.env)
  }
  let response = await mutate('link')
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await response.json()).linked, true)
  response = await mutate('link')
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM current_principal_identity_links').get().count, 1)
  response = await mutate('revoke')
  assert.equal(response.status, 200, await response.clone().text())
  assert.equal((await response.json()).linked, false)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM current_principal_identity_links').get().count, 0)
})

test('agent bearer SIWX logout needs no browser Origin or CSRF and appends revocation', async () => {
  const h = harness()
  const account = privateKeyToAccount(`0x${'99'.repeat(32)}`)
  const challengeResponse = await worker.fetch(new Request(
    `${publicOrigin}/api/auth/wallet/challenge?purpose=session&transport=agent-bearer`,
  ), h.env)
  const challenge = await challengeResponse.json()
  const selected = challenge.extension.supportedChains.find((item) => item.chainId === challenge.chain_id)
  const proof = await createSIWxPayload({ ...challenge.extension.info, ...selected }, account)
  const verified = await worker.fetch(new Request(challenge.extension.info.uri, {
    method: 'POST', headers: { 'sign-in-with-x': encodeSIWxHeader(proof) },
  }), h.env)
  const session = await verified.json()
  const response = await worker.fetch(new Request(`${publicOrigin}/api/session/logout`, {
    method: 'POST',
    headers: { authorization: `Bearer ${session.bearer_token}`, 'content-type': 'application/json' },
    body: '{}',
  }), h.env)
  assert.equal(response.status, 200, await response.clone().text())
  const events = h.database.database.prepare(
    'SELECT event_kind, session_event_id FROM principal_session_events ORDER BY event_sequence',
  ).all()
  assert.deepEqual(events.map((event) => event.event_kind), ['issued', 'revoked'])
  assert.equal(JSON.stringify(events).includes(session.bearer_token), false)
})

test('paid route applies a current lock through the wallet direct-link boundary', async () => {
  const h = harness()
  await h.call('/api/x402/proposals', { key: 'seed-wallet-key' })
  const seeded = await h.call('/api/x402/proposals', { key: 'seed-wallet-key', payment: signature() })
  assert.equal(seeded.status, 201)
  const walletId = h.database.database.prepare(
    "SELECT principal_id FROM contributor_principals WHERE principal_kind = 'base-wallet'",
  ).get().principal_id
  const githubId = 'linked-locked-github'
  h.database.database.prepare(
    `INSERT INTO public_accounts (account_id, github_identity_hmac_sha256, github_login,
      github_profile_url, github_avatar_url, created_at, last_authenticated_at)
     VALUES (?, ?, 'locked-github', 'https://github.com/locked-github', NULL, ?, ?)`,
  ).run(githubId, '6'.repeat(64), h.env.TEST_NOW, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO principal_identity_link_events (
      link_id, event_sequence, link_event_id, github_principal_id, github_principal_kind,
      wallet_principal_id, wallet_principal_kind, action_kind, actor_principal_id,
      siwx_message_sha256, signature_sha256, rationale, source_timestamp, recorded_at
    ) VALUES ('paid-lock-link', 1, 'paid-lock-link-1', ?, 'github', ?, 'base-wallet',
      'verified', ?, ?, ?, 'Verified lock test link', ?, ?)`,
  ).run(githubId, walletId, githubId, '4'.repeat(64), '5'.repeat(64), h.env.TEST_NOW, h.env.TEST_NOW)
  const moderation = `INSERT INTO moderation_actions (
    moderation_action_id, moderator_account_id, action_kind, target_kind,
    target_account_id, reason_code, explanation, source_timestamp, recorded_at
  ) VALUES (?, ?, ?, 'account', ?, 'linked-paid-lock', ?, ?, ?)`
  h.database.database.prepare(moderation).run(
    'paid-linked-lock', githubId, 'lock-contributor', githubId,
    'Lock propagates to the paid wallet route.', h.env.TEST_NOW, h.env.TEST_NOW,
  )
  const blockedBody = proposal({
    title: 'Blocked linked wallet',
    detail: { ...proposal().detail, member_id: 'linked-wallet-route-model', member_name: 'Linked wallet route model' },
  })
  const linkedSignature = signature('0x02')
  await h.call('/api/x402/proposals', { key: 'blocked-linked-wallet-key', body: blockedBody })
  let response = await h.call('/api/x402/proposals', {
    key: 'blocked-linked-wallet-key', body: blockedBody, payment: linkedSignature,
  })
  assert.equal(response.status, 423)
  assert.deepEqual(h.counts(), { verifyCalls: 2, settleCalls: 1 })
  h.database.database.prepare(moderation).run(
    'paid-linked-unlock', githubId, 'unlock-contributor', githubId,
    'Unlock restores the paid wallet route.', h.env.TEST_NOW, h.env.TEST_NOW,
  )
  response = await h.call('/api/x402/proposals', {
    key: 'blocked-linked-wallet-key', body: blockedBody, payment: linkedSignature,
  })
  assert.equal(response.status, 201, await response.clone().text())
  assert.deepEqual(h.counts(), { verifyCalls: 3, settleCalls: 2 })
})

test('wallet-authenticated paid route rejects a different payer before settlement', async () => {
  const h = harness()
  const account = privateKeyToAccount(`0x${'77'.repeat(32)}`)
  const challengeResponse = await worker.fetch(new Request(
    `${publicOrigin}/api/auth/wallet/challenge?purpose=session&transport=browser-cookie`,
  ), h.env)
  const challenge = await challengeResponse.json()
  const selected = challenge.extension.supportedChains.find((item) => item.chainId === challenge.chain_id)
  const proof = await createSIWxPayload({ ...challenge.extension.info, ...selected }, account)
  const verified = await worker.fetch(new Request(challenge.extension.info.uri, {
    method: 'POST', headers: { 'sign-in-with-x': encodeSIWxHeader(proof) },
  }), h.env)
  const cookie = verified.headers.get('set-cookie').split(';')[0]
  await h.call('/api/x402/proposals', { key: 'payer-binding-key', headers: { cookie } })
  const response = await h.call('/api/x402/proposals', {
    key: 'payer-binding-key', payment: signature('0x03'), headers: { cookie },
  })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'wallet_session_payer_mismatch')
  assert.deepEqual(h.counts(), { verifyCalls: 1, settleCalls: 0 })
})
