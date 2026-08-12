import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createBaseAccountSDK } from '@base-org/account'
import { createFacilitatorConfig } from '@coinbase/x402'
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
  x402HTTPResourceServer,
} from '@x402/core/http'
import {
  FacilitatorResponseError,
  FacilitatorTimeoutError,
  x402ResourceServer,
} from '@x402/core/server'
import { ExactEvmScheme as ExactEvmClientScheme } from '@x402/evm/exact/client'
import { ExactEvmScheme as ExactEvmServerScheme } from '@x402/evm/exact/server'
import {
  createSIWxMessage,
  encodeSIWxHeader,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from '@x402/extensions/sign-in-with-x'
import { wrapFetchWithPayment, x402Client } from '@x402/fetch'
import { getAddress, verifyMessage } from 'viem'

const testRoot = dirname(fileURLToPath(import.meta.url))
const packageRoot = resolve(testRoot, '..')
const payerA = '0x1111111111111111111111111111111111111111'
const payerB = '0x3333333333333333333333333333333333333333'
const payTo = '0x2222222222222222222222222222222222222222'
const network = 'eip155:84532'
const asset = '0x036CbD53842c5426634e7929541eC2318f3dCF7e'

function packageVersion(name) {
  return JSON.parse(
    readFileSync(resolve(packageRoot, 'node_modules', ...name.split('/'), 'package.json'), 'utf8'),
  ).version
}

function adapter(paymentSignature = undefined) {
  return {
    verifiedPayer: null,
    getHeader: (name) =>
      name.toLowerCase() === 'payment-signature' ? paymentSignature : undefined,
    getMethod: () => 'POST',
    getPath: () => '/api/x402/proposals',
    getUrl: () => 'https://cintamani.test/api/x402/proposals',
    getAcceptHeader: () => 'application/json',
    getUserAgent: () => 'cintamani-contract-test',
    getBody: () => ({ title: 'Validated before challenge' }),
    captureVerifiedPayer(value) {
      this.verifiedPayer = value
    },
  }
}

async function protocol({ settle = undefined } = {}) {
  const facilitator = {
    async getSupported() {
      return {
        kinds: [
          {
            x402Version: 2,
            scheme: 'exact',
            network,
            extra: { paymentFlow: 'authorization', assetTransferMethod: 'eip3009' },
          },
        ],
        extensions: [],
        signers: {},
      }
    },
    async verify(paymentPayload) {
      return { isValid: true, payer: paymentPayload.payload.payer }
    },
    async settle(paymentPayload) {
      if (settle) return settle(paymentPayload)
      return {
        success: true,
        payer: paymentPayload.payload.payer,
        transaction: '0xabc123',
        network,
      }
    },
  }
  const resource = new x402ResourceServer(facilitator).register(
    network,
    new ExactEvmServerScheme(),
  )
  resource.onAfterVerify(async (context) => {
    context.transportContext?.request?.adapter?.captureVerifiedPayer?.(context.result.payer)
  })
  const http = new x402HTTPResourceServer(resource, {
    'POST /api/x402/proposals': {
      accepts: {
        scheme: 'exact',
        network,
        payTo,
        price: { amount: '10000', asset, extra: { name: 'USDC', version: '2' } },
        maxTimeoutSeconds: 300,
      },
      resource: 'https://cintamani.test/api/x402/proposals',
      mimeType: 'application/json',
    },
  })
  await http.initialize()
  return http
}

async function challenge(http) {
  const requestAdapter = adapter()
  const result = await http.processHTTPRequest({
    adapter: requestAdapter,
    path: requestAdapter.getPath(),
    method: 'POST',
  })
  assert.equal(result.type, 'payment-error')
  assert.equal(result.response.status, 402)
  assert.ok(result.response.headers['PAYMENT-REQUIRED'])
  assert.equal(result.response.headers['X-PAYMENT'], undefined)
  return decodePaymentRequiredHeader(result.response.headers['PAYMENT-REQUIRED'])
}

async function verified(http, requirement, payer) {
  const payment = encodePaymentSignatureHeader({
    x402Version: 2,
    accepted: requirement,
    payload: { payer, signature: '0x00' },
  })
  const requestAdapter = adapter(payment)
  const context = {
    adapter: requestAdapter,
    path: requestAdapter.getPath(),
    method: 'POST',
  }
  const result = await http.processHTTPRequest(context)
  assert.equal(result.type, 'payment-verified')
  return { result, context, captured: requestAdapter.verifiedPayer }
}

test('official SDK packages are pinned and expose the exact v2 surfaces', () => {
  for (const name of ['@x402/core', '@x402/evm', '@x402/fetch', '@x402/extensions']) {
    assert.equal(packageVersion(name), '2.22.0')
  }
  assert.equal(packageVersion('@coinbase/x402'), '2.1.0')
  assert.equal(packageVersion('viem'), '2.55.13')
  assert.equal(packageVersion('@base-org/account'), '2.5.9')
  ;[
    x402ResourceServer,
    x402HTTPResourceServer,
    ExactEvmServerScheme,
    ExactEvmClientScheme,
    wrapFetchWithPayment,
    x402Client,
    createSIWxMessage,
    encodeSIWxHeader,
    parseSIWxHeader,
    validateSIWxMessage,
    verifySIWxSignature,
    createBaseAccountSDK,
    getAddress,
    verifyMessage,
  ].forEach((value) => assert.equal(typeof value, 'function'))
})

test('official HTTP server emits v2 challenge and request-local payer plus settlement receipt', async () => {
  const http = await protocol()
  const required = await challenge(http)
  assert.equal(required.x402Version, 2)
  assert.deepEqual(
    {
      scheme: required.accepts[0].scheme,
      network: required.accepts[0].network,
      amount: required.accepts[0].amount,
      asset: required.accepts[0].asset,
      payTo: required.accepts[0].payTo,
    },
    { scheme: 'exact', network, amount: '10000', asset, payTo },
  )

  const paid = await verified(http, required.accepts[0], payerA)
  assert.equal(paid.captured, payerA)
  const settlement = await http.processSettlement(
    paid.result.paymentPayload,
    paid.result.paymentRequirements,
    paid.result.declaredExtensions,
    { request: paid.context },
  )
  assert.equal(settlement.success, true)
  assert.ok(settlement.headers['PAYMENT-RESPONSE'])
  assert.deepEqual(decodePaymentResponseHeader(settlement.headers['PAYMENT-RESPONSE']), {
    success: true,
    payer: payerA,
    transaction: '0xabc123',
    network,
  })
})

test('concurrent verification keeps payer capture request-local', async () => {
  const http = await protocol()
  const required = await challenge(http)
  const [left, right] = await Promise.all([
    verified(http, required.accepts[0], payerA),
    verified(http, required.accepts[0], payerB),
  ])
  assert.equal(left.captured, payerA)
  assert.equal(right.captured, payerB)
})

test('structured settlement rejection retains the standard PAYMENT-RESPONSE', async () => {
  const http = await protocol({
    settle: async (paymentPayload) => ({
      success: false,
      errorReason: 'facilitator_rejected',
      errorMessage: 'The facilitator rejected this payment.',
      payer: paymentPayload.payload.payer,
      transaction: '',
      network,
    }),
  })
  const required = await challenge(http)
  const paid = await verified(http, required.accepts[0], payerA)
  const settlement = await http.processSettlement(
    paid.result.paymentPayload,
    paid.result.paymentRequirements,
    paid.result.declaredExtensions,
    { request: paid.context },
  )
  assert.equal(settlement.success, false)
  assert.ok(settlement.headers['PAYMENT-RESPONSE'])
  assert.equal(settlement.response.status, 402)
})

test('indeterminate facilitator error classes remain distinguishable from rejection', () => {
  const timeout = new FacilitatorTimeoutError('settle', 30_000)
  assert.ok(timeout instanceof FacilitatorResponseError)
  assert.equal(timeout.operation, 'settle')
  assert.equal(timeout.timeoutMs, 30_000)
  const malformed = new FacilitatorResponseError('malformed facilitator response')
  assert.ok(malformed instanceof FacilitatorResponseError)
})

test('CDP config is explicit and never relies on its environment fallback', async () => {
  const config = createFacilitatorConfig('organizations/test/apiKeys/key', 'private-key-material')
  assert.equal(config.url, 'https://api.cdp.coinbase.com/platform/v2/x402')
  assert.equal(typeof config.createAuthHeaders, 'function')
})
