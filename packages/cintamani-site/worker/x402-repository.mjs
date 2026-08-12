import { validateProposal } from '../src/lib/proposals.mjs'
import { canonicalize, completeRevisionStatements } from './repository.mjs'
import { currentContributorLock, hmacHex, nowIso, randomToken, requiredSecret, ResponseError, sha256Hex } from './security.mjs'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function eventStatement(db, intent, sequence, from, to, reason, current, actor = 'resource-server') {
  return db.prepare(
    `INSERT INTO x402_payment_events (
      payment_intent_id, event_sequence, payment_event_id, from_state, to_state,
      actor_kind, reason_code, detail, source_timestamp, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(intent, sequence, `payment-event-${randomToken(18)}`, from, to, actor, reason, current, current)
}

async function encryptionKey(env) {
  const material = encoder.encode(requiredSecret(env, 'X402_ENVELOPE_SECRET'))
  const digest = await crypto.subtle.digest('SHA-256', material)
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptX402Envelope(env, value) {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = encoder.encode(canonicalize(value))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, await encryptionKey(env), plaintext)
  return { ciphertext: base64url(new Uint8Array(ciphertext)), nonce: base64url(nonce) }
}

async function decryptX402Envelope(env, ciphertext, nonce) {
  const decode = (value) => Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/')),
    (char) => char.charCodeAt(0),
  )
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(nonce) },
    await encryptionKey(env),
    decode(ciphertext),
  )
  return JSON.parse(decoder.decode(plaintext))
}

export async function reserveX402Intent(env, {
  idempotencyKey,
  normalizedRequest,
  requirements,
  ipHash,
  mode,
  current = nowIso(env),
}) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new ResponseError(400, 'idempotency_key_required', 'A bounded Idempotency-Key header is required')
  }
  const normalizedJson = canonicalize(normalizedRequest)
  const [keyHash, requestHash, configurationHash] = await Promise.all([
    sha256Hex(idempotencyKey),
    sha256Hex(normalizedJson),
    sha256Hex(canonicalize(requirements)),
  ])
  const existing = await env.PROPOSALS_DB.prepare(
    `SELECT intent.payment_intent_id, intent.request_sha256, intent.current_state,
            entitlement.public_retry_reference
     FROM x402_payment_intents intent
     LEFT JOIN x402_retry_entitlements entitlement USING (payment_intent_id)
     WHERE idempotency_key_sha256 = ?`,
  ).bind(keyHash).first()
  if (existing) {
    if (existing.request_sha256 !== requestHash) {
      throw new ResponseError(409, 'idempotency_conflict', 'The idempotency key was used for different content')
    }
    return { ...existing, replay: true, request_sha256: requestHash }
  }
  await recordReplayChallenge(env, { ipHash, mode, current })
  const intent = `payment-intent-${randomToken(18)}`
  const expires = new Date(Date.parse(current) + 10 * 60 * 1000).toISOString()
  await env.PROPOSALS_DB.batch([
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_payment_intents (
        payment_intent_id, idempotency_key_sha256, request_sha256, normalized_request_json,
        x402_mode, network, asset, amount_atomic, payment_configuration_sha256,
        payment_requirements_json, created_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(intent, keyHash, requestHash, normalizedJson, mode, requirements.network,
      requirements.asset, requirements.amount, configurationHash, canonicalize(requirements), current, expires, current),
    eventStatement(env.PROPOSALS_DB, intent, 1, null, 'reserved', 'valid-request-reserved', current),
  ])
  return { payment_intent_id: intent, current_state: 'reserved', request_sha256: requestHash, replay: false }
}

export async function recordReplayChallenge(env, { ipHash, mode, current = nowIso(env) }) {
  const cutoff = new Date(Date.parse(current) - 60 * 60 * 1000).toISOString()
  const ipLimit = Number.parseInt(env.X402_PRECHALLENGE_IP_LIMIT_PER_HOUR ?? '30', 10)
  const globalLimit = Number.parseInt(env.X402_PRECHALLENGE_GLOBAL_LIMIT_PER_HOUR ?? '300', 10)
  const result = await env.PROPOSALS_DB.prepare(
    `INSERT INTO x402_prechallenge_events (challenge_event_id, ip_hmac_sha256, x402_mode, recorded_at)
     SELECT ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM x402_prechallenge_events WHERE ip_hmac_sha256 = ? AND recorded_at >= ?) < ?
       AND (SELECT COUNT(*) FROM x402_prechallenge_events WHERE recorded_at >= ?) < ?`,
  ).bind(`challenge-${randomToken(18)}`, ipHash, mode, current, ipHash, cutoff, ipLimit, cutoff, globalLimit).run()
  if (result.meta?.changes !== 1) {
    throw new ResponseError(429, 'x402_prechallenge_quota', 'The bounded payment-challenge quota has been reached')
  }
}

export async function expireX402IntentIfNeeded(env, paymentIntentId, current = nowIso(env)) {
  const intent = await env.PROPOSALS_DB.prepare(
    `SELECT current_state, current_event_sequence, expires_at
     FROM x402_payment_intents WHERE payment_intent_id = ?`,
  ).bind(paymentIntentId).first()
  if (!intent) throw new ResponseError(404, 'payment_intent_not_found', 'Payment intent does not exist')
  if (intent.expires_at > current || !['reserved', 'verifying', 'verified'].includes(intent.current_state)) {
    return { expired: intent.current_state === 'expired', state: intent.current_state }
  }
  const statements = [eventStatement(
    env.PROPOSALS_DB, paymentIntentId, intent.current_event_sequence + 1,
    intent.current_state, 'expired', 'payment-attempt-expired', current,
  )]
  if (intent.current_state === 'verified') {
    const entitlement = await env.PROPOSALS_DB.prepare(
      `SELECT retry_entitlement_id FROM x402_retry_entitlements WHERE payment_intent_id = ?`,
    ).bind(paymentIntentId).first()
    if (entitlement) statements.push(env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_retry_entitlement_events
       (retry_entitlement_id, event_sequence, entitlement_event_id, from_state, to_state,
        reason_code, source_timestamp, recorded_at)
       VALUES (?, 2, ?, 'pending-settlement', 'cancelled', 'payment-attempt-expired', ?, ?)`,
    ).bind(entitlement.retry_entitlement_id, `entitlement-event-${randomToken(18)}`, current, current))
  }
  try { await env.PROPOSALS_DB.batch(statements) } catch (error) {
    let raced
    try { raced = await paymentResumeState(env, paymentIntentId) } catch { throw error }
    if (raced.payment_state === 'expired') return { expired: true, state: 'expired' }
    if (['settling', 'settlement-unknown', 'settled', 'finalizing', 'finalized', 'rejected'].includes(raced.payment_state)) {
      return { expired: false, state: raced.payment_state }
    }
    throw error
  }
  return { expired: true, state: 'expired' }
}

async function walletIdentity(env, payer, current) {
  const normalized = payer.toLowerCase()
  if (!/^0x[0-9a-f]{40}$/u.test(normalized)) throw new ResponseError(402, 'invalid_payer', 'Facilitator returned an invalid Base payer')
  const digest = await hmacHex(requiredSecret(env, 'IDENTITY_HMAC_SECRET'), `base-wallet:${normalized}`)
  const found = await env.PROPOSALS_DB.prepare(
    'SELECT principal_id FROM base_wallet_identities WHERE address_hmac_sha256 = ?',
  ).bind(digest).first()
  if (found) return { principalId: found.principal_id, digest, statements: [] }
  let pseudonym
  for (let length = 12; length <= 64; length += 4) {
    const candidate = `base:${digest.slice(0, length)}`
    const collision = await env.PROPOSALS_DB.prepare(
      'SELECT principal_id FROM contributor_principals WHERE public_pseudonym = ?',
    ).bind(candidate).first()
    if (!collision) { pseudonym = candidate; break }
  }
  if (!pseudonym) throw new Error('wallet pseudonym namespace exhausted')
  const principalId = `principal-wallet-${digest.slice(0, 32)}`
  return {
    principalId,
    digest,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO contributor_principals
         (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
         VALUES (?, 'base-wallet', ?, 1, ?)`,
      ).bind(principalId, pseudonym, current),
      env.PROPOSALS_DB.prepare(
        `INSERT INTO base_wallet_identities
         (principal_id, address_hmac_sha256, created_at, last_verified_at) VALUES (?, ?, ?, ?)`,
      ).bind(principalId, digest, current, current),
    ],
  }
}

async function enforcePayerSettlementBoundary(env, principalId, ipHash, current) {
  const lock = await currentContributorLock(env, principalId)
  if (lock) throw new ResponseError(423, 'contributor_locked', 'This payer is locked from public writes')
  const cutoff = new Date(Date.parse(current) - 60 * 60 * 1000).toISOString()
  const [payerCount, ipCount, globalCount] = await Promise.all([
    env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM quota_events WHERE account_id = ? AND recorded_at >= ?').bind(principalId, cutoff).first('count'),
    env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM quota_events WHERE ip_hmac_sha256 = ? AND recorded_at >= ?').bind(ipHash, cutoff).first('count'),
    env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM quota_events WHERE recorded_at >= ?').bind(cutoff).first('count'),
  ])
  const limit = Number.parseInt(env.PUBLIC_WRITE_LIMIT_PER_HOUR ?? '30', 10)
  const globalLimit = Number.parseInt(env.PUBLIC_GLOBAL_WRITE_LIMIT_PER_HOUR ?? '300', 10)
  if (payerCount >= limit || ipCount >= limit || globalCount >= globalLimit) {
    throw new ResponseError(429, 'quota_exceeded', 'The bounded public write quota has been reached')
  }
}

export async function recordVerifiedPayment(env, {
  paymentIntentId,
  paymentPayload,
  payer,
  ipHash,
  expectedPayerPrincipalId = null,
  current = nowIso(env),
}) {
  const intent = await env.PROPOSALS_DB.prepare(
    'SELECT current_state, current_event_sequence, request_sha256, expires_at FROM x402_payment_intents WHERE payment_intent_id = ?',
  ).bind(paymentIntentId).first()
  if (!intent) throw new ResponseError(404, 'payment_intent_not_found', 'Payment intent does not exist')
  if (intent.current_state !== 'verifying') throw new ResponseError(409, 'payment_state_conflict', 'Payment intent is not verifying')
  if (intent.expires_at <= current) {
    await expireX402IntentIfNeeded(env, paymentIntentId, current)
    throw new ResponseError(409, 'payment_attempt_expired', 'This payment attempt expired; submit again with a new idempotency key')
  }
  const wallet = await walletIdentity(env, payer, current)
  if (expectedPayerPrincipalId && wallet.principalId !== expectedPayerPrincipalId) {
    throw new ResponseError(409, 'wallet_session_payer_mismatch', 'The paying wallet differs from the authenticated wallet; switch wallets or sign in again')
  }
  await enforcePayerSettlementBoundary(env, wallet.principalId, ipHash, current)
  const envelope = await encryptX402Envelope(env, paymentPayload)
  const payloadHash = await sha256Hex(canonicalize(paymentPayload))
  const retryId = `retry-entitlement-${randomToken(18)}`
  const retryReference = `x402-retry-${randomToken(24)}`
  const sequence = intent.current_event_sequence
  await env.PROPOSALS_DB.batch([
    ...wallet.statements,
    env.PROPOSALS_DB.prepare(
      `UPDATE x402_payment_intents SET payment_payload_sha256 = ?, payment_payload_ciphertext = ?,
       payment_payload_nonce_base64url = ?, payer_principal_id = ? WHERE payment_intent_id = ?`,
    ).bind(payloadHash, envelope.ciphertext, envelope.nonce, wallet.principalId, paymentIntentId),
    eventStatement(env.PROPOSALS_DB, paymentIntentId, sequence + 1, 'verifying', 'verified', 'facilitator-verification-succeeded', current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_retry_entitlements
       (retry_entitlement_id, public_retry_reference, payment_intent_id, payer_principal_id, request_sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(retryId, retryReference, paymentIntentId, wallet.principalId, intent.request_sha256, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_retry_entitlement_events
       (retry_entitlement_id, event_sequence, entitlement_event_id, from_state, to_state, reason_code, source_timestamp, recorded_at)
       VALUES (?, 1, ?, NULL, 'pending-settlement', 'verified-payment-reserved', ?, ?)`,
    ).bind(retryId, `entitlement-event-${randomToken(18)}`, current, current),
  ])
  return { payer_principal_id: wallet.principalId, retry_entitlement_id: retryId, public_retry_reference: retryReference }
}

export async function beginVerification(env, paymentIntentId, current = nowIso(env)) {
  const intent = await env.PROPOSALS_DB.prepare(
    "SELECT current_event_sequence, expires_at FROM x402_payment_intents WHERE payment_intent_id = ? AND current_state = 'reserved'",
  ).bind(paymentIntentId).first()
  if (!intent) {
    const existing = await env.PROPOSALS_DB.prepare(
      'SELECT current_state FROM x402_payment_intents WHERE payment_intent_id = ?',
    ).bind(paymentIntentId).first()
    if (existing?.current_state === 'verifying') return { state: 'verifying', replay: true }
    throw new ResponseError(409, 'payment_state_conflict', 'Payment intent is not reserved')
  }
  if (intent.expires_at <= current) {
    await expireX402IntentIfNeeded(env, paymentIntentId, current)
    throw new ResponseError(409, 'payment_attempt_expired', 'This payment attempt expired; submit again with a new idempotency key')
  }
  try {
    await env.PROPOSALS_DB.batch([
      eventStatement(env.PROPOSALS_DB, paymentIntentId, intent.current_event_sequence + 1, 'reserved', 'verifying', 'facilitator-verification-started', current),
    ])
  } catch (error) {
    const raced = await env.PROPOSALS_DB.prepare(
      'SELECT current_state FROM x402_payment_intents WHERE payment_intent_id = ?',
    ).bind(paymentIntentId).first()
    if (raced?.current_state === 'verifying') return { state: 'verifying', replay: true }
    throw error
  }
  return { state: 'verifying', replay: false }
}

export async function rejectVerification(env, paymentIntentId, current = nowIso(env)) {
  const intent = await env.PROPOSALS_DB.prepare(
    "SELECT current_event_sequence FROM x402_payment_intents WHERE payment_intent_id = ? AND current_state = 'verifying'",
  ).bind(paymentIntentId).first()
  if (!intent) throw new ResponseError(409, 'payment_state_conflict', 'Payment intent is not verifying')
  await env.PROPOSALS_DB.batch([
    eventStatement(env.PROPOSALS_DB, paymentIntentId, intent.current_event_sequence + 1, 'verifying', 'rejected', 'facilitator-verification-rejected', current),
  ])
}

export async function beginSettlement(env, paymentIntentId, current = nowIso(env)) {
  const intent = await env.PROPOSALS_DB.prepare(
    "SELECT current_event_sequence, expires_at FROM x402_payment_intents WHERE payment_intent_id = ? AND current_state = 'verified'",
  ).bind(paymentIntentId).first()
  if (!intent) {
    const existing = await env.PROPOSALS_DB.prepare(
      'SELECT current_state FROM x402_payment_intents WHERE payment_intent_id = ?',
    ).bind(paymentIntentId).first()
    if (existing?.current_state === 'settling') return { state: 'settling', replay: true }
    throw new ResponseError(409, 'payment_state_conflict', 'Payment intent is not verified')
  }
  if (intent.expires_at <= current) {
    await expireX402IntentIfNeeded(env, paymentIntentId, current)
    throw new ResponseError(409, 'payment_attempt_expired', 'This payment attempt expired; submit again with a new idempotency key')
  }
  try {
    await env.PROPOSALS_DB.batch([
      eventStatement(env.PROPOSALS_DB, paymentIntentId, intent.current_event_sequence + 1, 'verified', 'settling', 'facilitator-settlement-started', current),
    ])
  } catch (error) {
    const raced = await env.PROPOSALS_DB.prepare(
      'SELECT current_state FROM x402_payment_intents WHERE payment_intent_id = ?',
    ).bind(paymentIntentId).first()
    if (raced?.current_state === 'settling') return { state: 'settling', replay: true }
    throw error
  }
  return { state: 'settling', replay: false }
}

export async function loadVerifiedSettlementContext(env, paymentIntentId) {
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT current_state, payment_payload_sha256, payment_payload_ciphertext,
            payment_payload_nonce_base64url, payer_principal_id,
            payment_configuration_sha256, payment_requirements_json
     FROM x402_payment_intents WHERE payment_intent_id = ?`,
  ).bind(paymentIntentId).first()
  if (!row || row.current_state !== 'verified') {
    throw new ResponseError(409, 'payment_state_conflict', 'Only a verified payment can begin settlement')
  }
  const payload = await decryptX402Envelope(
    env, row.payment_payload_ciphertext, row.payment_payload_nonce_base64url,
  )
  const requirements = JSON.parse(row.payment_requirements_json)
  const [payloadHash, requirementsHash] = await Promise.all([
    sha256Hex(canonicalize(payload)), sha256Hex(canonicalize(requirements)),
  ])
  if (payloadHash !== row.payment_payload_sha256 || requirementsHash !== row.payment_configuration_sha256) {
    throw new Error('stored x402 settlement context failed integrity verification')
  }
  return { payload, requirements, payer: row.payer_principal_id }
}

export async function paymentResumeState(env, paymentIntentId) {
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT intent.current_state, entitlement.public_retry_reference
     FROM x402_payment_intents intent
     LEFT JOIN x402_retry_entitlements entitlement USING (payment_intent_id)
     WHERE intent.payment_intent_id = ?`,
  ).bind(paymentIntentId).first()
  if (!row) throw new ResponseError(404, 'payment_intent_not_found', 'Payment intent does not exist')
  const action = {
    reserved: 'verify',
    verifying: 'verify-same-signature',
    verified: 'load-and-settle',
    settling: 'mark-unknown-never-resettle',
    'settlement-unknown': 'await-reconciliation',
    settled: 'finalize-with-retry-credit',
    finalizing: 'inspect-finalization',
    finalized: 'return-finalized',
    rejected: 'return-rejected',
    expired: 'return-expired',
  }[row.current_state]
  return { payment_state: row.current_state, action, public_retry_reference: row.public_retry_reference ?? null }
}

export async function recordSettlementOutcome(env, {
  paymentIntentId,
  outcome,
  settlement,
  paymentResponseHeader,
  current = nowIso(env),
}) {
  const intent = await env.PROPOSALS_DB.prepare(
    `SELECT intent.current_event_sequence, intent.payer_principal_id, intent.payment_payload_sha256,
            intent.network, intent.asset, intent.amount_atomic,
            entitlement.retry_entitlement_id, entitlement.public_retry_reference
     FROM x402_payment_intents intent JOIN x402_retry_entitlements entitlement USING (payment_intent_id)
     WHERE intent.payment_intent_id = ? AND intent.current_state = 'settling'`,
  ).bind(paymentIntentId).first()
  if (!intent) throw new ResponseError(409, 'payment_state_conflict', 'Payment intent is not settling')
  const next = intent.current_event_sequence + 1
  if (outcome === 'indeterminate') {
    const reconciliation = `reconciliation-${randomToken(18)}`
    await env.PROPOSALS_DB.batch([
      eventStatement(env.PROPOSALS_DB, paymentIntentId, next, 'settling', 'settlement-unknown', 'facilitator-outcome-indeterminate', current),
      env.PROPOSALS_DB.prepare(
        'INSERT INTO x402_reconciliation_cases (reconciliation_case_id, payment_intent_id, created_at) VALUES (?, ?, ?)',
      ).bind(reconciliation, paymentIntentId, current),
      env.PROPOSALS_DB.prepare(
        `INSERT INTO x402_reconciliation_events
         (reconciliation_case_id, event_sequence, reconciliation_event_id, from_state, to_state, reason_code, source_timestamp, recorded_at)
         VALUES (?, 1, ?, NULL, 'open', 'settlement-outcome-unknown', ?, ?)`,
      ).bind(reconciliation, `reconciliation-event-${randomToken(18)}`, current, current),
    ])
    return { outcome, public_retry_reference: intent.public_retry_reference }
  }
  if (outcome === 'rejected') {
    await env.PROPOSALS_DB.batch([
      eventStatement(env.PROPOSALS_DB, paymentIntentId, next, 'settling', 'rejected', 'facilitator-settlement-rejected', current),
      env.PROPOSALS_DB.prepare(
        `INSERT INTO x402_retry_entitlement_events
         (retry_entitlement_id, event_sequence, entitlement_event_id, from_state, to_state, reason_code, source_timestamp, recorded_at)
         VALUES (?, 2, ?, 'pending-settlement', 'cancelled', 'settlement-rejected', ?, ?)`,
      ).bind(intent.retry_entitlement_id, `entitlement-event-${randomToken(18)}`, current, current),
    ])
    return { outcome }
  }
  if (outcome !== 'settled' || !settlement || !paymentResponseHeader) throw new Error('invalid settled outcome')
  const envelope = await encryptX402Envelope(env, {
    settlement,
    payment_response_header: paymentResponseHeader,
  })
  const [responseHash, headerHash] = await Promise.all([
    sha256Hex(canonicalize(settlement)), sha256Hex(paymentResponseHeader),
  ])
  const receiptId = `settlement-receipt-${randomToken(18)}`
  await env.PROPOSALS_DB.batch([
    eventStatement(env.PROPOSALS_DB, paymentIntentId, next, 'settling', 'settled', 'facilitator-settlement-succeeded', current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_settlement_receipts (
        settlement_receipt_id, payment_intent_id, payer_principal_id, payment_payload_sha256,
        settlement_response_sha256, payment_response_header_sha256, receipt_ciphertext,
        receipt_nonce_base64url, network, asset, amount_atomic, settled_at, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(receiptId, paymentIntentId, intent.payer_principal_id, intent.payment_payload_sha256,
      responseHash, headerHash, envelope.ciphertext, envelope.nonce, intent.network, intent.asset,
      intent.amount_atomic, current, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_retry_entitlement_events
       (retry_entitlement_id, event_sequence, entitlement_event_id, from_state, to_state, reason_code, source_timestamp, recorded_at)
       VALUES (?, 2, ?, 'pending-settlement', 'available', 'settlement-receipt-stored', ?, ?)`,
    ).bind(intent.retry_entitlement_id, `entitlement-event-${randomToken(18)}`, current, current),
  ])
  return { outcome, settlement_receipt_id: receiptId, public_retry_reference: intent.public_retry_reference }
}

export async function recordUnpersistedSettlementSuccess(env, {
  paymentIntentId,
  paymentResponseHeader,
  current = nowIso(env),
}) {
  const result = await recordSettlementOutcome(env, {
    paymentIntentId, outcome: 'indeterminate', current,
  })
  return {
    status: 503,
    body: {
      error: {
        code: 'settlement_receipt_persistence_unknown',
        message: 'Settlement succeeded but durable receipt persistence requires reconciliation',
      },
      retry_reference: result.public_retry_reference,
    },
    payment_response_header: paymentResponseHeader,
  }
}

export async function finalizePaidProposal(env, {
  paymentIntentId,
  publicRetryReference,
  rawBody,
  ipHash,
  current = nowIso(env),
}) {
  const input = validateProposal(rawBody)
  const requestHash = await sha256Hex(canonicalize(input))
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT intent.current_event_sequence, intent.current_state, intent.request_sha256,
            intent.payer_principal_id, entitlement.retry_entitlement_id,
            entitlement.current_event_sequence AS entitlement_sequence,
            entitlement.current_state AS entitlement_state, receipt.settlement_receipt_id,
            receipt.receipt_ciphertext, receipt.receipt_nonce_base64url,
            receipt.payment_response_header_sha256, source.proposal_id
     FROM x402_payment_intents intent
     JOIN x402_retry_entitlements entitlement USING (payment_intent_id)
     JOIN x402_settlement_receipts receipt USING (payment_intent_id)
     LEFT JOIN proposal_payment_sources source USING (payment_intent_id)
     WHERE intent.payment_intent_id = ? AND entitlement.public_retry_reference = ?`,
  ).bind(paymentIntentId, publicRetryReference).first()
  if (!row) throw new ResponseError(404, 'retry_entitlement_not_found', 'Paid retry entitlement does not exist')
  if (row.request_sha256 !== requestHash) throw new ResponseError(409, 'paid_request_conflict', 'Paid retry content differs from the reserved request')
  const receipt = await decryptX402Envelope(env, row.receipt_ciphertext, row.receipt_nonce_base64url)
  const paymentResponseHeader = receipt?.payment_response_header
  if (typeof paymentResponseHeader !== 'string' || await sha256Hex(paymentResponseHeader) !== row.payment_response_header_sha256) {
    throw new Error('stored x402 PAYMENT-RESPONSE failed integrity verification')
  }
  if (row.proposal_id) return { status: 200, body: { proposal_id: row.proposal_id, replayed: true }, payment_response_header: paymentResponseHeader }
  if (row.current_state !== 'settled' || row.entitlement_state !== 'available') {
    throw new ResponseError(409, 'payment_state_conflict', 'Paid retry entitlement is not available')
  }
  await enforcePayerSettlementBoundary(env, row.payer_principal_id, ipHash, current)
  const proposalId = `proposal-${randomToken(18)}`
  const statements = [
    eventStatement(env.PROPOSALS_DB, paymentIntentId, row.current_event_sequence + 1, 'settled', 'finalizing', 'proposal-finalization-started', current, 'payer-retry'),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO proposals (proposal_id, proposal_kind, author_account_id, parent_proposal_id, parent_revision, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(proposalId, input.kind, row.payer_principal_id, input.parent_proposal_id, input.parent_revision, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO proposal_state_events (
       proposal_id, event_sequence, state_event_id, from_state, to_state, selected_revision,
       actor_account_id, rationale, source_timestamp, recorded_at)
       VALUES (?, 1, ?, NULL, 'submitted', NULL, ?, 'Immediate public submission; unreviewed', ?, ?)`,
    ).bind(proposalId, `state-${proposalId}-1`, row.payer_principal_id, current, current),
    ...(await completeRevisionStatements(env.PROPOSALS_DB, {
      proposalId, revision: 1, accountId: row.payer_principal_id, kind: input.kind, input, current,
    })),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO proposal_payment_sources
       (proposal_id, revision, payment_intent_id, settlement_receipt_id, retry_entitlement_id,
        payer_principal_id, source_kind, recorded_at)
       VALUES (?, 1, ?, ?, ?, ?, 'x402-exact-usdc', ?)`,
    ).bind(proposalId, paymentIntentId, row.settlement_receipt_id, row.retry_entitlement_id, row.payer_principal_id, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO x402_retry_entitlement_events
       (retry_entitlement_id, event_sequence, entitlement_event_id, from_state, to_state, reason_code, source_timestamp, recorded_at)
       VALUES (?, ?, ?, 'available', 'consumed', 'proposal-created', ?, ?)`,
    ).bind(row.retry_entitlement_id, row.entitlement_sequence + 1, `entitlement-event-${randomToken(18)}`, current, current),
    eventStatement(env.PROPOSALS_DB, paymentIntentId, row.current_event_sequence + 2, 'finalizing', 'finalized', 'proposal-created', current, 'payer-retry'),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO quota_events
       (quota_event_id, account_id, ip_hmac_sha256, mutation_kind, recorded_at)
       VALUES (?, ?, ?, 'x402-proposal', ?)`,
    ).bind(`quota-${randomToken(18)}`, row.payer_principal_id, ipHash, current),
  ]
  try {
    await env.PROPOSALS_DB.batch(statements)
  } catch (error) {
    // Settlement and entitlement were committed before this independent atomic
    // finalization. Preserve the retry reference and PAYMENT-RESPONSE verbatim.
    return {
      status: 503,
      body: { error: { code: 'paid_finalization_retry', message: 'Payment settled; retry without paying again' }, retry_reference: publicRetryReference },
      payment_response_header: paymentResponseHeader,
      cause: error,
    }
  }
  return {
    status: 201,
    body: { proposal_id: proposalId, revision: 1, administrative_state: 'submitted', review_status: 'unreviewed', public: true },
    payment_response_header: paymentResponseHeader,
  }
}

export async function retryStatus(env, {
  publicRetryReference,
  idempotencyKey,
  normalizedRequest,
}) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new ResponseError(400, 'idempotency_key_required', 'The original bounded Idempotency-Key is required')
  }
  const [keyHash, requestHash] = await Promise.all([
    sha256Hex(idempotencyKey), sha256Hex(canonicalize(normalizedRequest)),
  ])
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT intent.payment_intent_id, intent.idempotency_key_sha256, intent.request_sha256,
            intent.current_state AS payment_state, entitlement.current_state AS entitlement_state,
            source.proposal_id
     FROM x402_retry_entitlements entitlement
     JOIN x402_payment_intents intent USING (payment_intent_id)
     LEFT JOIN proposal_payment_sources source USING (payment_intent_id)
     WHERE entitlement.public_retry_reference = ?`,
  ).bind(publicRetryReference).first()
  if (!row) throw new ResponseError(404, 'retry_entitlement_not_found', 'Paid retry entitlement does not exist')
  if (row.idempotency_key_sha256 !== keyHash || row.request_sha256 !== requestHash) {
    throw new ResponseError(409, 'paid_request_conflict', 'Retry credentials or content differ from the reserved request')
  }
  return {
    payment_intent_id: row.payment_intent_id,
    payment_state: row.payment_state,
    entitlement_state: row.entitlement_state,
    proposal_id: row.proposal_id ?? null,
    retryable_without_payment: row.payment_state === 'settled' && row.entitlement_state === 'available',
    terminal: ['finalized', 'rejected'].includes(row.payment_state),
  }
}

export async function resumePaidProposal(env, {
  publicRetryReference,
  idempotencyKey,
  rawBody,
  ipHash,
  current = nowIso(env),
}) {
  const normalized = validateProposal(rawBody)
  const status = await retryStatus(env, {
    publicRetryReference, idempotencyKey, normalizedRequest: normalized,
  })
  if (status.payment_state === 'settlement-unknown') {
    return { status: 503, body: { payment_state: status.payment_state, retry_reference: publicRetryReference } }
  }
  if (status.payment_state === 'rejected') {
    return { status: 402, body: { payment_state: status.payment_state } }
  }
  if (!status.retryable_without_payment && status.payment_state !== 'finalized') {
    return { status: 409, body: { payment_state: status.payment_state, retry_reference: publicRetryReference } }
  }
  return finalizePaidProposal(env, {
    paymentIntentId: status.payment_intent_id,
    publicRetryReference,
    rawBody,
    ipHash,
    current,
  })
}

export async function decryptX402EnvelopeForTest(env, envelope) {
  return decryptX402Envelope(env, envelope.ciphertext, envelope.nonce)
}
