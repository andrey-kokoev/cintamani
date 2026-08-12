import assert from 'node:assert/strict'
import test from 'node:test'
import { FacilitatorTimeoutError, HTTPFacilitatorClient, encodePaymentSignatureHeader } from '@x402/core/http'
import {
  X402_AMOUNT_ATOMIC,
  X402ProtocolError,
  createX402Facilitator,
  isIndeterminateSettlement,
  paymentRequiredHeader,
  paymentRequirements,
  readPaymentSignature,
  settlePayment,
  verifyPayment,
  x402Configuration,
  x402Enabled,
  x402Readiness,
} from '../worker/x402-protocol.mjs'

const address = '0x1111111111111111111111111111111111111111'

test('x402 is disabled by default and pins exact one-cent Base USDC modes', () => {
  assert.equal(x402Enabled({}), false)
  assert.equal(x402Enabled({ X402_ENABLED: 'true' }), true)
  const testnet = x402Configuration({ X402_MODE: 'testnet', X402_PAY_TO: address })
  assert.deepEqual([testnet.scheme, testnet.network, testnet.amount], ['exact', 'eip155:84532', X402_AMOUNT_ATOMIC])
  const production = x402Configuration({ X402_MODE: 'production', X402_PAY_TO: address })
  assert.equal(production.network, 'eip155:8453')
  assert.equal(production.asset.toLowerCase(), '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
})

test('x402 readiness is disabled-safe and checks every mode-specific prerequisite', () => {
  assert.deepEqual(x402Readiness({}), { requested: false, ready: false, reason_codes: ['disabled'] })
  const base = {
    X402_ENABLED: 'true', X402_MODE: 'testnet', X402_PAY_TO: address,
    PUBLIC_ORIGIN: 'https://cintamani.test', BASE_SEPOLIA_RPC_URL: 'https://rpc.example.test',
    IP_HASH_SECRET: 'i'.repeat(24), IDENTITY_HMAC_SECRET: 'h'.repeat(24), X402_ENVELOPE_SECRET: 'e'.repeat(24),
  }
  assert.equal(x402Readiness(base).ready, true)
  const missing = x402Readiness({ X402_ENABLED: 'true', X402_MODE: 'testnet' })
  assert.equal(missing.ready, false)
  assert.ok(missing.reason_codes.includes('missing_ip_hash_secret'))
  assert.ok(missing.reason_codes.includes('invalid_base_sepolia_rpc_url'))
  const production = x402Readiness({ ...base, X402_MODE: 'production', BASE_RPC_URL: 'https://rpc.example.test' })
  assert.equal(production.ready, false)
  assert.ok(production.reason_codes.includes('missing_cdp_credentials'))
  assert.equal(x402Readiness({ ...base, X402_MODE: 'production', BASE_RPC_URL: 'https://rpc.example.test', CDP_API_KEY_ID: 'id', CDP_API_KEY_SECRET: 'secret' }).ready, true)
})

test('facilitator selection is explicit and production fails closed without CDP credentials', () => {
  const injected = { verify: async () => ({}), settle: async () => ({}) }
  assert.equal(createX402Facilitator({ ENVIRONMENT: 'test', TEST_X402_FACILITATOR: injected }), injected)
  const testnet = createX402Facilitator({ X402_MODE: 'testnet' })
  assert.equal(testnet.url, 'https://x402.org/facilitator')
  assert.throws(() => createX402Facilitator({ X402_MODE: 'production' }), /CDP facilitator credentials/u)
})

test('real HTTP facilitator structured 4xx errors are definitive while 5xx remain indeterminate', async () => {
  const originalFetch = globalThis.fetch
  const client = new HTTPFacilitatorClient({ url: 'https://facilitator.example' })
  const payload = { x402Version: 2, payload: { signature: '0x01' } }
  const requirements = paymentRequirements(
    { X402_MODE: 'testnet', X402_PAY_TO: address }, 'https://example.test/api/x402/proposals',
  )
  try {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith('/verify')) return Response.json({
        isValid: false, invalidReason: 'bad', invalidMessage: `private ${address}`, payer: address,
      }, { status: 402 })
      return Response.json({
        success: false, errorReason: 'rejected', errorMessage: `private ${address}`,
        payer: address, transaction: '0xprivate', network: requirements.network,
      }, { status: 402 })
    }
    await assert.rejects(verifyPayment(client, payload, requirements), (error) =>
      error instanceof X402ProtocolError && error.code === 'payment_not_verified' && !error.message.includes(address))
    const rejected = await settlePayment(client, { payload, requirements, payer: address })
    assert.equal(rejected.outcome, 'rejected')
    assert.ok(rejected.headers['payment-response'])

    globalThis.fetch = async (url) => Response.json(
      String(url).endsWith('/verify')
        ? { isValid: false, invalidReason: 'upstream', invalidMessage: 'temporary' }
        : { success: false, errorReason: 'upstream', errorMessage: 'temporary', network: requirements.network },
      { status: 503 },
    )
    await assert.rejects(verifyPayment(client, payload, requirements), (error) => error.statusCode === 503)
    assert.equal((await settlePayment(client, { payload, requirements, payer: address })).outcome, 'indeterminate')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('v2 headers round trip while legacy and oversized signatures are rejected', () => {
  const env = { X402_MODE: 'testnet', X402_PAY_TO: address }
  const requirements = paymentRequirements(env, 'https://example.test/api/x402/proposals')
  assert.ok(paymentRequiredHeader(requirements, 'https://example.test/api/x402/proposals').length > 20)
  const payload = { x402Version: 2, resource: { url: 'https://example.test/api/x402/proposals' }, accepted: requirements, payload: { signature: '0x01' } }
  const encoded = encodePaymentSignatureHeader(payload)
  assert.deepEqual(readPaymentSignature(new Request('https://example.test', { headers: { 'payment-signature': encoded } })), payload)
  assert.throws(() => readPaymentSignature(new Request('https://example.test', { headers: { 'x-payment': 'old' } })), X402ProtocolError)
  assert.throws(() => readPaymentSignature(new Request('https://example.test', { headers: { 'payment-signature': 'a'.repeat(16_385) } })), /too large/u)
})

test('payer capture is request-local and settlement has explicit terminal classifications', async () => {
  const requirements = { scheme: 'exact' }
  const payload = { x402Version: 2 }
  const verified = await verifyPayment({ verify: async () => ({ isValid: true, payer: address }) }, payload, requirements)
  assert.equal(verified.payer, address)
  const settled = await settlePayment({ settle: async () => ({ success: true, payer: address, transaction: '0xabc', network: 'eip155:84532' }) }, verified)
  assert.equal(settled.outcome, 'settled')
  assert.ok(settled.headers['payment-response'])
  const rejected = await settlePayment({ settle: async () => ({ success: false, errorReason: 'invalid', transaction: '', network: 'eip155:84532' }) }, verified)
  assert.equal(rejected.outcome, 'rejected')
  assert.ok(rejected.headers['payment-response'])
})

test('timeouts, aborts, network failures, and facilitator 5xx are indeterminate', () => {
  assert.equal(isIndeterminateSettlement(new FacilitatorTimeoutError('settle', 1000)), true)
  assert.equal(isIndeterminateSettlement(new DOMException('aborted', 'AbortError')), true)
  assert.equal(isIndeterminateSettlement(new TypeError('fetch failed')), true)
  assert.equal(isIndeterminateSettlement(new Error('definitive local failure')), false)
})
