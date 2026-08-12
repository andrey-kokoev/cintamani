import { wrapFetchWithPaymentFromConfig } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm'
import { privateKeyToAccount } from 'viem/accounts'
import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateProposal } from '../src/lib/proposals.mjs'

const expected = Object.freeze({
  network: 'eip155:84532', amount: '10000', price: '$0.01',
  assets: Object.freeze({
    'eip155:84532': '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    'eip155:8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
})

export function selectPaymentRequirement(version, accepts, network, expectedReceiver) {
  if (version !== 2) throw new Error('agent fixture accepts only x402 v2')
  const asset = expected.assets[network]
  const match = accepts.find((item) =>
    item.network === network && item.amount === expected.amount && item.scheme === 'exact' &&
    item.asset === asset && item.payTo?.toLowerCase() === expectedReceiver.toLowerCase())
  if (!match) throw new Error('payment requirements failed the explicit network, cost, asset, or receiver guard')
  return match
}

function jsonHeaders(extra = {}) {
  return { 'content-type': 'application/json', accept: 'application/json', ...extra }
}

async function body(response) {
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(value?.error?.message ?? `HTTP ${response.status}`), { response, body: value })
  return value
}

function proposalFromEnvironment(env) {
  if (env.X402_AGENT_PROPOSAL_JSON) return JSON.parse(env.X402_AGENT_PROPOSAL_JSON)
  return {
    kind: 'theoretical-model-member',
    title: '[AGENT FIXTURE] Accountless x402 submission',
    summary: 'An explicit disposable fixture submission for the accountless payment path.',
    rationale: 'Exercise payment, wallet authentication, revision, and withdrawal without epistemic promotion.',
    scope: 'Disposable end-to-end fixture only.',
    detail: {
      member_id: 'x402-agent-fixture', member_name: 'x402 agent fixture',
      model_definition: 'A bounded HTTP client interaction.',
      computational_claim: 'The declared API lifecycle can complete exactly once.', initial_epistemic_status: 'candidate',
    },
    evidence: [{ evidence_kind: 'other-explicit', summary: 'Executable transport fixture only.' }],
    references: [],
  }
}

export function explanatoryConjectureTemplate(config, coordinateKey = null) {
  const coordinate = coordinateKey
    ? config.frontier?.items?.find((item) => item.coordinate_key === coordinateKey)
    : null
  if (coordinateKey && !coordinate) throw new Error('requested coordinate is not in the bounded server frontier')
  return {
    kind: 'explanatory-conjecture',
    title: '[AGENT TEMPLATE] Bounded explanatory conjecture',
    summary: 'A problem-led conjecture template for exact criticism; no scientific result is asserted.',
    rationale: 'Expose the explanation, assumptions, failure condition, and any conjectural coordinate framing.',
    scope: 'Template only; public submission remains unreviewed and canonical admission remains separate.',
    detail: {
      problem_statement: 'What bounded problem should this conjecture explain?',
      explanatory_claim: 'Replace this text with the proposed explanation.',
      essential_mechanism: 'Replace this text with the mechanism essential to the explanation.',
      explanation_scope: 'State the exact regime and claim family.',
      failure_condition: 'State what would show that the explanation fails.',
    },
    assumptions: ['Replace this text with an unresolved assumption.'],
    framings: coordinate ? [{
      coordinate_key: coordinate.coordinate_key,
      validation_generation: coordinate.validation_generation,
      framing_rationale: 'Explain why this coordinate is a useful conjectural frame.',
    }] : [],
    relations: [], evidence: [], references: [],
  }
}

function requirePrivateKey(env) {
  const value = env.X402_AGENT_PRIVATE_KEY
  if (!/^0x[0-9a-fA-F]{64}$/u.test(value ?? '')) throw new Error('X402_AGENT_PRIVATE_KEY must be an env-only 32-byte hex key')
  return value
}

function assertDiscovery(config, requestedNetwork) {
  if (config?.x402?.enabled !== true) throw new Error('x402 is not enabled by the server')
  const payment = config.x402
  const network = requestedNetwork ?? expected.network
  if (payment.network !== network || payment.amount_atomic !== expected.amount || payment.price_usd !== expected.price) {
    throw new Error('x402 network/cost guard rejected server configuration')
  }
  return network
}

async function authenticateWallet(baseUrl, account, network, fetchImpl) {
  const challenge = await body(await fetchImpl(`${baseUrl}/api/auth/wallet/challenge?purpose=session&transport=agent-bearer`, {
    method: 'GET', headers: { accept: 'application/json' },
  }))
  if (challenge.chain_id !== network) throw new Error('SIWX challenge network differs from discovery')
  const selected = challenge.extension?.supportedChains?.find((entry) => entry.chainId === network)
  if (!selected) throw new Error('SIWX challenge does not support the selected network')
  const proof = await createSIWxPayload({ ...challenge.extension.info, ...selected }, account)
  const verified = await body(await fetchImpl(challenge.extension.info.uri, {
    method: 'POST',
    headers: { accept: 'application/json', 'sign-in-with-x': encodeSIWxHeader(proof) },
  }))
  if (typeof verified.bearer_token !== 'string') throw new Error('SIWX did not issue an agent bearer token')
  return verified.bearer_token
}

export async function runAgentFixture({ env = process.env, argv = process.argv.slice(2), fetchImpl = fetch, write = console.log } = {}) {
  const baseUrl = (env.CINTAMANI_URL ?? 'http://127.0.0.1:8787').replace(/\/$/u, '')
  const pay = argv.includes('--pay')
  const config = await body(await fetchImpl(`${baseUrl}/api/config`, { headers: { accept: 'application/json' } }))
  const health = await body(await fetchImpl(`${baseUrl}/api/health`, { headers: { accept: 'application/json' } }))
  write(JSON.stringify({ mode: pay ? 'paid' : 'discovery-only', x402: config.x402, health: health.status }))
  if (!pay) return { mode: 'discovery-only', config, health }

  const network = assertDiscovery(config, env.X402_AGENT_NETWORK)
  const expectedReceiver = env.X402_AGENT_PAY_TO
  if (!/^0x[0-9a-fA-F]{40}$/u.test(expectedReceiver ?? '')) {
    throw new Error('X402_AGENT_PAY_TO is required as the exact expected receiver')
  }
  const account = privateKeyToAccount(requirePrivateKey(env))
  const proposal = validateProposal(
    env.X402_AGENT_PROPOSAL_KIND === 'explanatory-conjecture'
      ? explanatoryConjectureTemplate(config, env.X402_AGENT_COORDINATE_KEY ?? null)
      : proposalFromEnvironment(env),
  )
  const canonicalBody = JSON.stringify(proposal)
  const idempotencyKey = env.X402_AGENT_IDEMPOTENCY_KEY
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new Error('X402_AGENT_IDEMPOTENCY_KEY is required so retries use the same key and body')
  }
  const paidFetch = wrapFetchWithPaymentFromConfig(fetchImpl, {
    schemes: [{ network, client: new ExactEvmScheme(account) }],
    paymentRequirementsSelector(version, accepts) {
      return selectPaymentRequirement(version, accepts, network, expectedReceiver)
    },
  })
  let response = await paidFetch(`${baseUrl}/api/x402/proposals`, {
    method: 'POST', headers: jsonHeaders({ 'idempotency-key': idempotencyKey }), body: canonicalBody,
  })
  let result = await response.json().catch(() => ({}))
  if (response.status === 503 && result.retry_reference) {
    response = await fetchImpl(`${baseUrl}/api/x402/proposals/retry/${encodeURIComponent(result.retry_reference)}`, {
      method: 'POST', headers: jsonHeaders({ 'idempotency-key': idempotencyKey }), body: canonicalBody,
    })
    result = await body(response)
  } else if (!response.ok) {
    throw Object.assign(new Error(result?.error?.message ?? `HTTP ${response.status}`), { response, body: result })
  }
  if (!response.headers.get('payment-response')) {
    throw new Error('successful paid submission omitted PAYMENT-RESPONSE')
  }
  const proposalId = result.proposal_id
  if (!proposalId) throw new Error('paid submission did not return proposal_id')

  const bearer = await authenticateWallet(baseUrl, account, network, fetchImpl)
  const authorization = { authorization: `Bearer ${bearer}` }
  const revision = { ...proposal, title: `${proposal.title} — verified revision`, rationale: `${proposal.rationale} The bearer-authorized revision path also completed.` }
  await body(await fetchImpl(`${baseUrl}/api/proposals/${encodeURIComponent(proposalId)}/revisions`, {
    method: 'POST', headers: jsonHeaders({ ...authorization, 'idempotency-key': `${idempotencyKey}-revision` }), body: JSON.stringify(revision),
  }))
  await body(await fetchImpl(`${baseUrl}/api/proposals/${encodeURIComponent(proposalId)}/withdrawal`, {
    method: 'POST', headers: jsonHeaders({ ...authorization, 'idempotency-key': `${idempotencyKey}-withdrawal` }),
    body: JSON.stringify({ rationale: 'Disposable x402 agent fixture completed successfully.' }),
  }))
  write(JSON.stringify({ mode: 'paid', proposal_id: proposalId, revised: true, withdrawn: true }))
  return { mode: 'paid', proposal_id: proposalId }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAgentFixture().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
