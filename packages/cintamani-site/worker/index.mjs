import { axisMetadata, proposalKinds, text } from '../src/lib/proposals.mjs'
import {
  changeOperatorRole,
  createAppeal,
  createCriticism,
  createInterpretation,
  createMaintainerExport,
  createModerationAction,
  createProposal,
  createReply,
  createRevision,
  createTestReport,
  githubIdentityDigest,
  listProposals,
  readMaintainerExport,
  readProposal,
  recordAdmissionLink,
  transitionAppeal,
  transitionProposal,
  withdrawProposal,
} from './repository.mjs'
import {
  authorizeMutation,
  clearOAuthCookie,
  clearSessionCookie,
  createOAuthState,
  csrfForSession,
  currentAccountLock,
  enforceCsrf,
  enforceSameOrigin,
  findSession,
  normalizeError,
  nowIso,
  oauthSetCookie,
  randomToken,
  readBoundedJson,
  requireSession,
  requiredSecret,
  ResponseError,
  sessionSetCookie,
  sha256Hex,
  verifyOAuthState,
} from './security.mjs'

const apiHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

function json(body, status = 200, extraHeaders = undefined) {
  return new Response(JSON.stringify(body), { status, headers: { ...apiHeaders, ...extraHeaders } })
}

function resultResponse(result) {
  if (result instanceof Response) return result
  return json(result.body, result.status, result.replayed ? { 'idempotency-replayed': 'true' } : undefined)
}

function securityHeaders(response) {
  const headers = new Headers(response.headers)
  headers.set('x-content-type-options', 'nosniff')
  headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  headers.set('cross-origin-opener-policy', 'same-origin')
  headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://github.com; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  )
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

function returnPath(value) {
  if (value === null) return '/proposals/'
  const normalized = text(value, 'return_to', { max: 500 })
  if (!normalized.startsWith('/') || normalized.startsWith('//') || normalized.includes('\\')) {
    throw new ResponseError(400, 'invalid_return_path', 'The OAuth return path must be site-local')
  }
  return normalized
}

function githubClientId(env) {
  if (typeof env.GITHUB_CLIENT_ID !== 'string' || env.GITHUB_CLIENT_ID.length < 8) {
    throw new Error('GITHUB_CLIENT_ID is not configured')
  }
  return env.GITHUB_CLIENT_ID
}

async function beginGithubOAuth(request, env) {
  requiredSecret(env, 'OAUTH_STATE_SECRET')
  const url = new URL(request.url)
  const redirectPath = returnPath(url.searchParams.get('return_to'))
  const state = await createOAuthState(env)
  const current = nowIso(env)
  const expires = new Date(Date.parse(current) + 10 * 60 * 1000).toISOString()
  await env.PROPOSALS_DB.prepare(
    `INSERT INTO oauth_state_nonces
     (state_digest_sha256, redirect_path, created_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, NULL)`,
  )
    .bind(state.digest, redirectPath, current, expires)
    .run()
  const callback = `${url.origin}/api/auth/github/callback`
  const github = new URL('https://github.com/login/oauth/authorize')
  github.searchParams.set('client_id', githubClientId(env))
  github.searchParams.set('redirect_uri', callback)
  github.searchParams.set('scope', 'read:user')
  github.searchParams.set('state', state.state)
  return new Response(null, {
    status: 302,
    headers: { location: github.href, 'set-cookie': oauthSetCookie(state.nonce), 'cache-control': 'no-store' },
  })
}

async function consumeOAuthNonce(request, env, stateValue) {
  const verified = await verifyOAuthState(request, env, stateValue)
  if (!verified) throw new ResponseError(403, 'oauth_state_rejected', 'The OAuth state is invalid')
  const current = nowIso(env)
  const row = await env.PROPOSALS_DB.prepare(
    `UPDATE oauth_state_nonces SET consumed_at = ?
     WHERE state_digest_sha256 = ? AND consumed_at IS NULL AND expires_at > ?
     RETURNING redirect_path`,
  )
    .bind(current, verified.digest, current)
    .first()
  if (!row) {
    const prior = await env.PROPOSALS_DB.prepare(
      'SELECT expires_at, consumed_at FROM oauth_state_nonces WHERE state_digest_sha256 = ?',
    )
      .bind(verified.digest)
      .first()
    if (prior?.consumed_at) throw new ResponseError(403, 'oauth_state_replayed', 'The OAuth state was already consumed')
    if (prior?.expires_at <= current) throw new ResponseError(403, 'oauth_state_expired', 'The OAuth state expired')
    throw new ResponseError(403, 'oauth_state_rejected', 'The OAuth state could not be consumed')
  }
  return row.redirect_path
}

async function completeGithubOAuth(request, env) {
  const url = new URL(request.url)
  const redirectPath = await consumeOAuthNonce(request, env, url.searchParams.get('state'))
  const code = url.searchParams.get('code')
  if (!code) throw new ResponseError(400, 'oauth_code_missing', 'GitHub did not return an authorization code')
  const callback = `${url.origin}/api/auth/github/callback`
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: githubClientId(env),
      client_secret: requiredSecret(env, 'GITHUB_CLIENT_SECRET'),
      code,
      redirect_uri: callback,
    }),
  })
  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok || typeof tokenBody.access_token !== 'string') {
    throw new ResponseError(502, 'github_oauth_failed', 'GitHub authentication could not be completed')
  }
  const userResponse = await fetch('https://api.github.com/user', {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${tokenBody.access_token}`,
      'user-agent': 'cintamani-public-proposals',
      'x-github-api-version': '2022-11-28',
    },
  })
  const user = await userResponse.json()
  if (!userResponse.ok || !Number.isInteger(user.id) || typeof user.login !== 'string') {
    throw new ResponseError(502, 'github_identity_failed', 'GitHub identity could not be loaded')
  }
  const current = nowIso(env)
  const identityDigest = await githubIdentityDigest(env, user.id)
  const accountId = `account-${identityDigest.slice(0, 32)}`
  const profileUrl = `https://github.com/${user.login}`
  const avatarUrl = typeof user.avatar_url === 'string' && user.avatar_url.startsWith('https://') ? user.avatar_url : null
  await env.PROPOSALS_DB.prepare(
    `INSERT INTO public_accounts (
      account_id, github_identity_hmac_sha256, github_login, github_profile_url,
      github_avatar_url, created_at, last_authenticated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(github_identity_hmac_sha256) DO UPDATE SET
      github_login = excluded.github_login,
      github_profile_url = excluded.github_profile_url,
      github_avatar_url = excluded.github_avatar_url,
      last_authenticated_at = excluded.last_authenticated_at`,
  )
    .bind(accountId, identityDigest, user.login, profileUrl, avatarUrl, current, current)
    .run()

  const sessionToken = randomToken()
  const csrfToken = await csrfForSession(env, sessionToken)
  const sessionHash = await sha256Hex(sessionToken)
  const csrfHash = await sha256Hex(csrfToken)
  const expires = new Date(Date.parse(current) + 7 * 24 * 60 * 60 * 1000).toISOString()
  await env.PROPOSALS_DB.batch([
    env.PROPOSALS_DB.prepare(
      `UPDATE public_sessions SET revoked_at = ?
       WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?`,
    ).bind(current, accountId, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO public_sessions (
        session_token_sha256, csrf_token_sha256, account_id,
        created_at, expires_at, revoked_at, rotated_to_sha256
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    ).bind(sessionHash, csrfHash, accountId, current, expires),
  ])
  const headers = new Headers({ location: redirectPath, 'cache-control': 'no-store' })
  headers.append('set-cookie', sessionSetCookie(sessionToken, 7 * 24 * 60 * 60))
  headers.append('set-cookie', clearOAuthCookie())
  return new Response(null, { status: 302, headers })
}

async function sessionResponse(request, env) {
  const session = await findSession(request, env)
  if (!session) return json({ authenticated: false })
  const lock = await currentAccountLock(env, session.account_id)
  return json({
    authenticated: true,
    contributor: {
      github_login: session.github_login,
      github_profile_url: session.github_profile_url,
      github_avatar_url: session.github_avatar_url,
    },
    operator: session.operator,
    contributor_locked: lock !== null,
    lock_moderation_action_id: lock?.moderation_action_id ?? null,
    csrf_token: session.csrf,
  })
}

async function logout(request, env) {
  await readBoundedJson(request, 1024)
  enforceSameOrigin(request)
  const session = await requireSession(request, env)
  enforceCsrf(request, session)
  const current = nowIso(env)
  await env.PROPOSALS_DB.prepare(
    `UPDATE public_sessions SET revoked_at = ?
     WHERE session_token_sha256 = ? AND revoked_at IS NULL`,
  )
    .bind(current, session.session_token_sha256)
    .run()
  return json({ authenticated: false }, 200, { 'set-cookie': clearSessionCookie() })
}

async function health(env) {
  const metadata = await env.PROPOSALS_DB.prepare(
    'SELECT metadata_key, metadata_value FROM public_schema_metadata ORDER BY metadata_key',
  ).all()
  const violations = await env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM public_schema_violations').first('count')
  return json({
    status: violations === 0 ? 'ok' : 'degraded',
    public_plane: 'separate-d1',
    canonical_registry_writes: false,
    schema: Object.fromEntries(metadata.results.map((row) => [row.metadata_key, row.metadata_value])),
    invariant_violations: violations,
  }, violations === 0 ? 200 : 503)
}

function captures(pathname, pattern) {
  const match = pathname.match(pattern)
  return match ? match.slice(1).map((value) => decodeURIComponent(value)) : null
}

async function publicMutation(request, env, mutationKind, handler) {
  const body = await readBoundedJson(request)
  const authorization = await authorizeMutation(request, env, body, mutationKind)
  return resultResponse(await handler(body, authorization))
}

async function operatorMutation(request, env, handler) {
  const body = await readBoundedJson(request)
  const { session } = await authorizeMutation(request, env, body, 'operator', { operator: true })
  return resultResponse(await handler(body, session))
}

async function routeApi(request, env) {
  const url = new URL(request.url)
  const { pathname } = url
  if (request.method === 'GET' && pathname === '/api/health') return health(env)
  if (request.method === 'GET' && pathname === '/api/config') {
    return json({
      proposal_kinds: proposalKinds,
      dimensions: axisMetadata,
      turnstile_site_key: env.TURNSTILE_SITE_KEY ?? null,
      authentication: 'github-required-for-writes',
      immediate_visibility: 'submitted-unreviewed',
      voting: false,
      epistemic_ranking: false,
    })
  }
  if (request.method === 'GET' && pathname === '/api/auth/github/start') return beginGithubOAuth(request, env)
  if (request.method === 'GET' && pathname === '/api/auth/github/callback') return completeGithubOAuth(request, env)
  if (request.method === 'GET' && pathname === '/api/session') return sessionResponse(request, env)
  if (request.method === 'POST' && pathname === '/api/session/logout') return logout(request, env)
  if (request.method === 'GET' && pathname === '/api/proposals') return resultResponse(await listProposals(env, url))
  if (request.method === 'POST' && pathname === '/api/proposals') {
    return publicMutation(request, env, 'proposal', (body, authorization) =>
      createProposal(request, env, authorization, body),
    )
  }

  let values = captures(pathname, /^\/api\/proposals\/([^/]+)$/u)
  if (request.method === 'GET' && values) return resultResponse(await readProposal(env, values[0]))
  values = captures(pathname, /^\/api\/proposals\/([^/]+)\/revisions$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'revision', (body, authorization) =>
      createRevision(request, env, authorization, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/proposals\/([^/]+)\/withdrawal$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'withdrawal', (body, authorization) =>
      withdrawProposal(request, env, authorization, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/proposals\/([^/]+)\/revisions\/(\d+)\/criticisms$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'criticism', (body, authorization) =>
      createCriticism(request, env, authorization, values[0], Number(values[1]), body),
    )
  }
  values = captures(pathname, /^\/api\/proposals\/([^/]+)\/revisions\/(\d+)\/tests$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'test-report', (body, authorization) =>
      createTestReport(request, env, authorization, values[0], Number(values[1]), body),
    )
  }
  values = captures(pathname, /^\/api\/proposals\/([^/]+)\/revisions\/(\d+)\/interpretations$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'interpretation', (body, authorization) =>
      createInterpretation(request, env, authorization, values[0], Number(values[1]), body),
    )
  }
  values = captures(pathname, /^\/api\/criticisms\/([^/]+)\/replies$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'reply', (body, authorization) =>
      createReply(request, env, authorization, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/moderation\/actions\/([^/]+)\/appeals$/u)
  if (request.method === 'POST' && values) {
    return publicMutation(request, env, 'appeal', (body, authorization) =>
      createAppeal(request, env, authorization, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/exports\/([^/]+)$/u)
  if (request.method === 'GET' && values) return resultResponse(await readMaintainerExport(env, values[0]))

  if (request.method === 'POST' && pathname === '/api/admin/operator-roles') {
    return operatorMutation(request, env, (body, operator) =>
      changeOperatorRole(request, env, operator, body),
    )
  }
  values = captures(pathname, /^\/api\/admin\/proposals\/([^/]+)\/state$/u)
  if (request.method === 'POST' && values) {
    return operatorMutation(request, env, (body, operator) =>
      transitionProposal(request, env, operator, values[0], body),
    )
  }
  if (request.method === 'POST' && pathname === '/api/admin/moderation-actions') {
    return operatorMutation(request, env, (body, operator) =>
      createModerationAction(request, env, operator, body),
    )
  }
  values = captures(pathname, /^\/api\/admin\/appeals\/([^/]+)\/state$/u)
  if (request.method === 'POST' && values) {
    return operatorMutation(request, env, (body, operator) =>
      transitionAppeal(request, env, operator, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/admin\/proposals\/([^/]+)\/exports$/u)
  if (request.method === 'POST' && values) {
    return operatorMutation(request, env, (body, operator) =>
      createMaintainerExport(request, env, operator, values[0], body),
    )
  }
  values = captures(pathname, /^\/api\/admin\/exports\/([^/]+)\/admission-links$/u)
  if (request.method === 'POST' && values) {
    return operatorMutation(request, env, (body, operator) =>
      recordAdmissionLink(request, env, operator, values[0], body),
    )
  }
  return json({ error: { code: 'api_not_found', message: 'The API route does not exist' } }, 404)
}

export default {
  async fetch(request, env) {
    try {
      const response = new URL(request.url).pathname.startsWith('/api/')
        ? await routeApi(request, env)
        : await env.ASSETS.fetch(request)
      return securityHeaders(response)
    } catch (caught) {
      const error = normalizeError(caught)
      if (error instanceof ResponseError) {
        return securityHeaders(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status))
      }
      console.error('unhandled request failure', error)
      return securityHeaders(json({ error: { code: 'internal_error', message: 'The request could not be completed' } }, 500))
    }
  },
}
