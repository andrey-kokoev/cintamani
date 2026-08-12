import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { explanatoryConjectureTemplate, runAgentFixture, selectPaymentRequirement } from '../scripts/x402-agent-fixture.mjs'
import frontier from '../src/data/frontier.json' with { type: 'json' }
import { validateProposal } from '../src/lib/proposals.mjs'

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

test('agent fixture is discovery-only by default and never needs a private key', async () => {
  const calls = []
  const output = []
  const result = await runAgentFixture({
    env: { CINTAMANI_URL: 'https://cintamani.test' }, argv: [], write: (line) => output.push(line),
    fetchImpl: async (url) => {
      calls.push(url)
      if (url.endsWith('/api/config')) return response({ x402: { enabled: false } })
      return response({ status: 'ok' })
    },
  })
  assert.equal(result.mode, 'discovery-only')
  assert.deepEqual(calls, ['https://cintamani.test/api/config', 'https://cintamani.test/api/health'])
  assert.doesNotMatch(output.join('\n'), /private|secret|0x[0-9a-f]{64}/iu)
})

test('explicit paid mode enforces server cost/network before reading the key', async () => {
  await assert.rejects(
    runAgentFixture({
      env: { CINTAMANI_URL: 'https://cintamani.test' }, argv: ['--pay'], write: () => {},
      fetchImpl: async (url) => url.endsWith('/api/config')
        ? response({ x402: { enabled: true, network: 'eip155:8453', amount_atomic: '20000', price_usd: '$0.02' } })
        : response({ status: 'ok' }),
    }),
    /network\/cost guard/u,
  )
})

test('fixture source never prints or serializes the private key', async () => {
  const source = await readFile(new URL('../scripts/x402-agent-fixture.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /write\([^\n]*privateKey|console\.(?:log|error)\([^\n]*privateKey/u)
  assert.match(source, /X402_AGENT_PRIVATE_KEY/u)
  assert.match(source, /wrapFetchWithPaymentFromConfig/u)
  assert.match(source, /validateProposal/u)
  assert.match(source, /successful paid submission omitted PAYMENT-RESPONSE/u)
  assert.match(source, /--pay/u)
  assert.match(source, /--submit-free/u)
  assert.match(source, /\/api\/agent\/proposals/u)
  assert.match(source, /config\.agent_submission\?\.free !== true/u)
})

test('agent payment selector rejects wrong asset and receiver before authorization', () => {
  const receiver = '0x2222222222222222222222222222222222222222'
  const valid = {
    scheme: 'exact', network: 'eip155:84532', amount: '10000',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: receiver,
  }
  assert.equal(selectPaymentRequirement(2, [valid], valid.network, receiver), valid)
  assert.throws(() => selectPaymentRequirement(2, [{ ...valid, asset: '0x0000000000000000000000000000000000000000' }], valid.network, receiver), /asset, or receiver guard/u)
  assert.throws(() => selectPaymentRequirement(2, [{ ...valid, payTo: '0x3333333333333333333333333333333333333333' }], valid.network, receiver), /asset, or receiver guard/u)
})

test('agent schema exposes unclassified and exact generation-pinned explanatory conjecture templates', () => {
  const config = { frontier }
  const general = validateProposal(explanatoryConjectureTemplate(config))
  assert.equal(general.kind, 'explanatory-conjecture')
  assert.deepEqual(general.framings, [])
  const coordinate = frontier.items.find((item) => item.classification === 'gap')
  const focused = validateProposal(explanatoryConjectureTemplate(config, coordinate.coordinate_key))
  assert.equal(focused.framings[0].coordinate_classification, 'gap')
  assert.equal(focused.framings[0].validation_generation, coordinate.validation_generation)
  assert.throws(() => explanatoryConjectureTemplate(config, 'missing-coordinate'), /bounded server frontier/u)
})
