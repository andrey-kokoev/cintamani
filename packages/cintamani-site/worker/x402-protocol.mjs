import { createFacilitatorConfig } from '@coinbase/x402'
import {
  FacilitatorResponseError,
  FacilitatorTimeoutError,
  HTTPFacilitatorClient,
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from '@x402/core/http'
import { SettleError, VerifyError } from '@x402/core/types'

export const X402_VERSION = 2
export const X402_PRICE_USD = '$0.01'
export const X402_AMOUNT_ATOMIC = '10000'
export const X402_SIGNATURE_MAX_BYTES = 16_384

const modes = Object.freeze({
  testnet: Object.freeze({
    network: 'eip155:84532',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    facilitator: Object.freeze({ url: 'https://x402.org/facilitator', timeoutMs: 15_000 }),
  }),
  production: Object.freeze({
    network: 'eip155:8453',
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
})

function configuredMode(env) {
  const mode = env.X402_MODE ?? 'testnet'
  if (!(mode in modes)) throw new Error('X402_MODE must be testnet or production')
  return mode
}

export function x402Enabled(env) {
  return env.X402_ENABLED === 'true'
}

export function x402Readiness(env) {
  const requested = x402Enabled(env)
  if (!requested) return Object.freeze({ requested: false, ready: false, reason_codes: ['disabled'] })
  const reasons = []
  let mode
  try { mode = configuredMode(env) } catch { reasons.push('invalid_mode') }
  try { x402Configuration(env) } catch { reasons.push('invalid_pay_to') }
  try {
    const origin = new URL(env.PUBLIC_ORIGIN)
    if (origin.protocol !== 'https:' || origin.origin !== env.PUBLIC_ORIGIN) reasons.push('invalid_public_origin')
  } catch { reasons.push('invalid_public_origin') }
  for (const name of ['IP_HASH_SECRET', 'IDENTITY_HMAC_SECRET', 'X402_ENVELOPE_SECRET']) {
    if (typeof env[name] !== 'string' || env[name].length < 24) reasons.push(`missing_${name.toLowerCase()}`)
  }
  const rpcName = mode === 'production' ? 'BASE_RPC_URL' : 'BASE_SEPOLIA_RPC_URL'
  try {
    const rpc = new URL(env[rpcName])
    if (rpc.protocol !== 'https:') reasons.push(`invalid_${rpcName.toLowerCase()}`)
  } catch { reasons.push(`invalid_${rpcName.toLowerCase()}`) }
  if (mode === 'production' && (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET)) reasons.push('missing_cdp_credentials')
  return Object.freeze({ requested: true, ready: reasons.length === 0, reason_codes: Object.freeze([...new Set(reasons)]) })
}

export function x402Configuration(env) {
  const mode = configuredMode(env)
  const base = modes[mode]
  const payTo = env.X402_PAY_TO
  if (!/^0x[0-9a-fA-F]{40}$/u.test(payTo ?? '')) throw new Error('X402_PAY_TO must be a Base address')
  return Object.freeze({
    mode,
    scheme: 'exact',
    network: base.network,
    asset: base.asset,
    amount: X402_AMOUNT_ATOMIC,
    price: X402_PRICE_USD,
    payTo,
    maxTimeoutSeconds: 300,
  })
}

export function createX402Facilitator(env) {
  if (
    env.ENVIRONMENT === 'test' &&
    env.TEST_X402_FACILITATOR &&
    typeof env.TEST_X402_FACILITATOR.verify === 'function' &&
    typeof env.TEST_X402_FACILITATOR.settle === 'function'
  ) {
    return env.TEST_X402_FACILITATOR
  }
  const mode = configuredMode(env)
  if (mode === 'testnet') return new HTTPFacilitatorClient(modes.testnet.facilitator)
  if (!env.CDP_API_KEY_ID || !env.CDP_API_KEY_SECRET) {
    throw new Error('CDP facilitator credentials are required in production mode')
  }
  return new HTTPFacilitatorClient({
    ...createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET),
    timeoutMs: 15_000,
  })
}

export function paymentRequirements(env, resourceUrl) {
  const config = x402Configuration(env)
  return Object.freeze({
    scheme: config.scheme,
    network: config.network,
    asset: config.asset,
    amount: config.amount,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    extra: Object.freeze({ name: 'USD Coin', version: '2' }),
    resource: resourceUrl,
  })
}

export function paymentRequiredHeader(requirements, resourceUrl, error = undefined) {
  return encodePaymentRequiredHeader({
    x402Version: X402_VERSION,
    ...(error ? { error } : {}),
    resource: { url: resourceUrl, description: 'Publish one submitted, unreviewed Cintamani proposal', mimeType: 'application/json' },
    accepts: [requirements],
  })
}

export function readPaymentSignature(request) {
  if (request.headers.has('x-payment') || request.headers.has('x-payment-response')) {
    throw new X402ProtocolError(400, 'legacy_x402_header', 'Legacy x402 v1 headers are not accepted')
  }
  const encoded = request.headers.get('payment-signature')
  if (!encoded) return null
  if (new TextEncoder().encode(encoded).byteLength > X402_SIGNATURE_MAX_BYTES) {
    throw new X402ProtocolError(413, 'payment_signature_too_large', 'PAYMENT-SIGNATURE is too large')
  }
  let payload
  try {
    payload = decodePaymentSignatureHeader(encoded)
  } catch {
    throw new X402ProtocolError(400, 'invalid_payment_signature', 'PAYMENT-SIGNATURE is not valid x402 v2 data')
  }
  if (payload?.x402Version !== X402_VERSION) {
    throw new X402ProtocolError(400, 'unsupported_x402_version', 'Only x402 v2 is accepted')
  }
  return payload
}

export async function verifyPayment(facilitator, payload, requirements) {
  let result
  try {
    result = await facilitator.verify(payload, requirements)
  } catch (error) {
    if (error instanceof VerifyError && error.statusCode >= 400 && error.statusCode < 500) {
      throw new X402ProtocolError(402, 'payment_not_verified', 'Payment could not be verified')
    }
    throw error
  }
  if (!result?.isValid || typeof result.payer !== 'string') {
    throw new X402ProtocolError(402, 'payment_not_verified', 'Payment could not be verified')
  }
  // Payer is captured from this verification result and must be carried only in
  // the request-local authorization context; never cache it at module scope.
  return { payload, requirements, payer: result.payer, verification: result }
}

export async function settlePayment(facilitator, verified) {
  try {
    const settlement = await facilitator.settle(verified.payload, verified.requirements)
    if (!settlement?.success) {
      return {
        outcome: 'rejected',
        settlement,
        headers: { 'payment-response': encodePaymentResponseHeader(settlement) },
      }
    }
    return {
      outcome: 'settled',
      payer: settlement.payer ?? verified.payer,
      settlement,
      headers: { 'payment-response': encodePaymentResponseHeader(settlement) },
    }
  } catch (error) {
    if (error instanceof SettleError && error.statusCode >= 400 && error.statusCode < 500) {
      const settlement = {
        success: false,
        errorReason: error.errorReason,
        errorMessage: error.errorMessage,
        payer: error.payer,
        transaction: error.transaction,
        network: error.network,
      }
      return {
        outcome: 'rejected',
        settlement,
        headers: { 'payment-response': encodePaymentResponseHeader(settlement) },
      }
    }
    if (error instanceof SettleError && error.statusCode >= 500) return { outcome: 'indeterminate', error }
    if (isIndeterminateSettlement(error)) return { outcome: 'indeterminate', error }
    throw error
  }
}

export function isIndeterminateSettlement(error) {
  if (error instanceof FacilitatorTimeoutError) return true
  if (error instanceof TypeError) return true // fetch/network failure after dispatch
  if (error instanceof FacilitatorResponseError) {
    return error.status === undefined || error.status >= 500
  }
  return error?.name === 'AbortError'
}

export class X402ProtocolError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'X402ProtocolError'
    this.status = status
    this.code = code
  }
}
