import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeAgentProposal, authorizeMutation, csrfForSession, sha256Hex } from '../worker/security.mjs'

const origin = 'https://cintamani.test'
const secrets = {
  ENVIRONMENT: 'test',
  TEST_NOW: '2026-08-11T18:00:00.000Z',
  TURNSTILE_TEST_BYPASS: 'enabled-for-local-tests',
  CSRF_SECRET: 'csrf-secret-is-distinct-from-state-0002',
  IP_HASH_SECRET: 'ip-hash-secret-never-stores-raw-address',
  PUBLIC_WRITE_LIMIT_PER_HOUR: '30',
}

async function environment(authKind, transport, token) {
  const csrf = transport === 'browser-cookie' ? await csrfForSession(secrets, token) : null
  const row = {
    account_id: `principal-${authKind}`,
    csrf_token_sha256: csrf ? await sha256Hex(csrf) : null,
    created_at: secrets.TEST_NOW,
    expires_at: '2026-08-12T18:00:00.000Z',
    revoked_at: null,
    auth_kind: authKind,
    transport,
    scope: 'public-write',
    principal_kind: authKind === 'github' ? 'github' : 'base-wallet',
    public_pseudonym: authKind,
    github_login: authKind === 'github' ? 'author' : null,
    github_profile_url: null,
    github_avatar_url: null,
    is_operator: 0,
  }
  return {
    ...secrets,
    PROPOSALS_DB: {
      prepare(sql) {
        return {
          bind() { return this },
          async first(column) {
            if (sql.includes('FROM public_sessions')) return row
            if (sql.includes('FROM current_principal_locks')) return null
            if (sql.includes('FROM quota_events')) return column === 'count' ? 0 : { count: 0 }
            throw new Error(`unexpected SQL: ${sql}`)
          },
        }
      },
    },
  }
}

function mutationRequest(token, transport, { originHeader = false, csrf = null } = {}) {
  const headers = new Headers({ 'cf-connecting-ip': '203.0.113.10' })
  if (transport === 'agent-bearer') headers.set('authorization', `Bearer ${token}`)
  else headers.set('cookie', `__Host-cintamani_session=${token}`)
  if (originHeader) headers.set('origin', origin)
  if (csrf) headers.set('x-csrf-token', csrf)
  return new Request(`${origin}/api/proposals`, { method: 'POST', headers, body: '{}' })
}

test('wallet browser cookies retain Origin/CSRF but omit Turnstile', async () => {
  const token = 'wallet-browser-token-with-enough-randomness'
  const env = await environment('siwx', 'browser-cookie', token)
  const csrf = await csrfForSession(env, token)
  const authorization = await authorizeMutation(
    mutationRequest(token, 'browser-cookie', { originHeader: true, csrf }),
    env,
    {},
    'proposal',
  )
  assert.equal(authorization.session.principal_kind, 'base-wallet')
})

test('agent bearer writes omit browser Origin/CSRF and Turnstile but retain quotas', async () => {
  const token = 'wallet-agent-bearer-token-with-enough-randomness'
  const env = await environment('siwx', 'agent-bearer', token)
  const authorization = await authorizeMutation(
    mutationRequest(token, 'agent-bearer'),
    env,
    {},
    'proposal',
  )
  assert.match(authorization.ip_hash, /^[0-9a-f]{64}$/u)
})

test('free agent proposal authorization requires a SIWX wallet bearer', async () => {
  const bearerToken = 'wallet-agent-bearer-token-with-enough-randomness'
  const bearerEnv = await environment('siwx', 'agent-bearer', bearerToken)
  const authorization = await authorizeAgentProposal(
    mutationRequest(bearerToken, 'agent-bearer'),
    bearerEnv,
    {},
  )
  assert.equal(authorization.session.principal_kind, 'base-wallet')

  const cookieToken = 'wallet-browser-token-with-enough-randomness'
  const cookieEnv = await environment('siwx', 'browser-cookie', cookieToken)
  const csrf = await csrfForSession(cookieEnv, cookieToken)
  await assert.rejects(
    authorizeAgentProposal(
      mutationRequest(cookieToken, 'browser-cookie', { originHeader: true, csrf }),
      cookieEnv,
      {},
    ),
    (error) => error.code === 'agent_bearer_required',
  )

  const githubToken = 'github-agent-bearer-token-with-enough-randomness'
  const githubEnv = await environment('github', 'agent-bearer', githubToken)
  await assert.rejects(
    authorizeAgentProposal(mutationRequest(githubToken, 'agent-bearer'), githubEnv, {}),
    (error) => error.code === 'agent_bearer_required',
  )
})

test('GitHub cookie writes still require Turnstile', async () => {
  const token = 'github-browser-token-with-enough-randomness'
  const env = await environment('github', 'browser-cookie', token)
  const csrf = await csrfForSession(env, token)
  await assert.rejects(
    authorizeMutation(
      mutationRequest(token, 'browser-cookie', { originHeader: true, csrf }),
      env,
      {},
      'proposal',
    ),
    (error) => error.code === 'turnstile_rejected',
  )
})
