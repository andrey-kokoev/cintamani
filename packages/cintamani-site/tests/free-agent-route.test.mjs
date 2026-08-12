import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import worker from '../worker/index.mjs'
import { sha256Hex } from '../worker/security.mjs'
import { SQLiteD1 } from './helpers/sqlite-d1.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'https://cintamani.test'

function proposal() {
  return {
    kind: 'theoretical-model-member',
    title: 'Free agent submission',
    summary: 'A bounded submission through the temporary authenticated agent lane.',
    rationale: 'Exercise the free lane without changing epistemic standing.',
    scope: 'Transport test only.',
    detail: {
      member_id: 'free-agent-model',
      member_name: 'Free agent model',
      model_definition: 'A finite test transition system.',
      computational_claim: 'The authenticated free route publishes exactly once.',
      initial_epistemic_status: 'candidate',
    },
    evidence: [],
    references: [],
  }
}

async function harness() {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  const token = 'free-agent-bearer-token-with-enough-randomness'
  const principalId = 'principal-free-agent'
  const current = '2026-08-12T12:00:00.000Z'
  database.database.prepare(
    `INSERT INTO contributor_principals
       (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
     VALUES (?, 'base-wallet', 'base:0123456789ab', 1, ?)`,
  ).run(principalId, current)
  database.database.prepare(
    `INSERT INTO base_wallet_identities
       (principal_id, principal_kind, address_hmac_sha256, created_at, last_verified_at)
     VALUES (?, 'base-wallet', ?, ?, ?)`,
  ).run(principalId, 'a'.repeat(64), current, current)
  database.database.prepare(
    `INSERT INTO public_sessions
       (session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
        revoked_at, rotated_to_sha256, auth_kind, transport, scope)
     VALUES (?, NULL, ?, ?, '2026-08-13T12:00:00.000Z', NULL, NULL,
             'siwx', 'agent-bearer', 'public-contributor')`,
  ).run(await sha256Hex(token), principalId, current)
  const env = {
    PROPOSALS_DB: database,
    ASSETS: { fetch: async () => new Response('asset') },
    ENVIRONMENT: 'test',
    TEST_NOW: current,
    PUBLIC_ORIGIN: origin,
    X402_ENABLED: 'false',
    IP_HASH_SECRET: 'ip-hash-secret-never-stores-raw-address',
    PUBLIC_WRITE_LIMIT_PER_HOUR: '30',
    PUBLIC_GLOBAL_WRITE_LIMIT_PER_HOUR: '300',
  }
  async function call({ suppliedToken = token, key = 'free-agent-key-0001' } = {}) {
    const headers = new Headers({
      'content-type': 'application/json',
      'idempotency-key': key,
      'cf-connecting-ip': '203.0.113.44',
    })
    if (suppliedToken) headers.set('authorization', `Bearer ${suppliedToken}`)
    return worker.fetch(new Request(`${origin}/api/agent/proposals`, {
      method: 'POST', headers, body: JSON.stringify(proposal()),
    }), env)
  }
  return { database, env, call }
}

test('authenticated agents publish free exactly once while x402 is disabled', async () => {
  const h = await harness()
  let response = await h.call()
  assert.equal(response.status, 201, await response.clone().text())
  const first = await response.json()
  assert.equal(first.administrative_state, 'submitted')
  assert.equal(first.review_status, 'unreviewed')
  response = await h.call()
  assert.equal(response.status, 201)
  assert.equal((await response.json()).proposal_id, first.proposal_id)
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM proposals').get().count, 1)
  assert.equal(h.database.database.prepare("SELECT COUNT(*) AS count FROM quota_events WHERE mutation_kind='proposal'").get().count, 1)
})

test('free agent lane rejects anonymous callers and closes when x402 activates', async () => {
  const h = await harness()
  let response = await h.call({ suppliedToken: null })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).error.code, 'authentication_required')

  h.env.X402_ENABLED = 'true'
  response = await h.call()
  assert.equal(response.status, 402)
  const closed = await response.json()
  assert.equal(closed.error.code, 'agent_payment_required')
  assert.equal(closed.error.details.paid_route, '/api/x402/proposals')
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM proposals').get().count, 0)
})

test('config discovery reports the temporary lane and its atomic closure', async () => {
  const h = await harness()
  let response = await worker.fetch(new Request(`${origin}/api/config`), h.env)
  let config = await response.json()
  assert.deepEqual(config.agent_submission, {
    route: '/api/agent/proposals',
    authentication: 'siwx-agent-bearer',
    free: true,
    paid_route: '/api/x402/proposals',
  })
  h.env.X402_ENABLED = 'true'
  response = await worker.fetch(new Request(`${origin}/api/config`), h.env)
  config = await response.json()
  assert.equal(config.agent_submission.free, false)
})
