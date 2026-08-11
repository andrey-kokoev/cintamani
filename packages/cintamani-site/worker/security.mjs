import { InputError, publicMutationKinds } from '../src/lib/proposals.mjs'

const encoder = new TextEncoder()
const sessionCookie = '__Host-cintamani_session'
const oauthCookie = '__Host-cintamani_oauth'

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

export function randomToken(size = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(size)))
}

export async function sha256Hex(value) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))
}

async function hmacBytes(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))
}

export async function hmacHex(secret, value) {
  return bytesToHex(await hmacBytes(secret, value))
}

export async function hmacBase64Url(secret, value) {
  return bytesToBase64Url(await hmacBytes(secret, value))
}

function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

export function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=')
        return separator < 0
          ? [decodeURIComponent(part), '']
          : [decodeURIComponent(part.slice(0, separator)), decodeURIComponent(part.slice(separator + 1))]
      }),
  )
}

function secureCookie(name, value, { maxAge, httpOnly = true } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'Secure', 'SameSite=Lax']
  if (httpOnly) parts.push('HttpOnly')
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`)
  return parts.join('; ')
}

export function sessionSetCookie(token, maxAgeSeconds) {
  return secureCookie(sessionCookie, token, { maxAge: maxAgeSeconds })
}

export function clearSessionCookie() {
  return secureCookie(sessionCookie, '', { maxAge: 0 })
}

export function oauthSetCookie(nonce) {
  return secureCookie(oauthCookie, nonce, { maxAge: 600 })
}

export function clearOAuthCookie() {
  return secureCookie(oauthCookie, '', { maxAge: 0 })
}

export async function createOAuthState(env) {
  const nonce = randomToken()
  const signature = await hmacBase64Url(requiredSecret(env, 'OAUTH_STATE_SECRET'), nonce)
  return { nonce, state: `${nonce}.${signature}`, digest: await sha256Hex(nonce) }
}

export async function verifyOAuthState(request, env, state) {
  if (typeof state !== 'string') return null
  const [nonce, suppliedSignature, extra] = state.split('.')
  if (!nonce || !suppliedSignature || extra !== undefined) return null
  const cookieNonce = parseCookies(request)[oauthCookie]
  if (!constantTimeEqual(nonce, cookieNonce)) return null
  const expectedSignature = await hmacBase64Url(requiredSecret(env, 'OAUTH_STATE_SECRET'), nonce)
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null
  return { nonce, digest: await sha256Hex(nonce) }
}

export async function csrfForSession(env, sessionToken) {
  return hmacBase64Url(requiredSecret(env, 'CSRF_SECRET'), `csrf:${sessionToken}`)
}

export function requiredSecret(env, name) {
  const value = env[name]
  if (typeof value !== 'string' || value.length < 24) throw new Error(`${name} is not configured`)
  return value
}

export function nowIso(env) {
  return env.TEST_NOW ?? new Date().toISOString()
}

export async function findSession(request, env) {
  const token = parseCookies(request)[sessionCookie]
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const current = nowIso(env)
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT s.account_id, s.csrf_token_sha256, s.expires_at, s.revoked_at,
            a.github_login, a.github_profile_url, a.github_avatar_url,
            EXISTS(
              SELECT 1 FROM current_account_roles role
              WHERE role.account_id = s.account_id AND role.role = 'operator'
            ) AS is_operator
     FROM public_sessions s JOIN public_accounts a USING (account_id)
     WHERE s.session_token_sha256 = ?`,
  )
    .bind(tokenHash)
    .first()
  if (!row || row.revoked_at !== null || row.expires_at <= current) return null
  const csrf = await csrfForSession(env, token)
  if (!constantTimeEqual(await sha256Hex(csrf), row.csrf_token_sha256)) return null
  return {
    account_id: row.account_id,
    github_login: row.github_login,
    github_profile_url: row.github_profile_url,
    github_avatar_url: row.github_avatar_url,
    operator: row.is_operator === 1,
    csrf,
    session_token: token,
    session_token_sha256: tokenHash,
  }
}

export async function requireSession(request, env) {
  const session = await findSession(request, env)
  if (!session) throw new ResponseError(401, 'authentication_required', 'GitHub authentication is required')
  return session
}

export async function currentAccountLock(env, accountId) {
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT moderation_action_id, action_sequence, action_kind, is_locked,
            reason_code, explanation, source_timestamp, recorded_at
     FROM current_account_locks WHERE target_account_id = ?`,
  )
    .bind(accountId)
    .first()
  return row?.is_locked === 1 ? row : null
}

export function enforceSameOrigin(request) {
  const origin = request.headers.get('origin')
  const expected = new URL(request.url).origin
  if (!origin || origin !== expected) {
    throw new ResponseError(403, 'origin_rejected', 'The request origin is not allowed')
  }
}

export function enforceCsrf(request, session) {
  const supplied = request.headers.get('x-csrf-token')
  if (!constantTimeEqual(supplied, session.csrf)) {
    throw new ResponseError(403, 'csrf_rejected', 'The session-bound CSRF token is missing or invalid')
  }
}

export async function verifyTurnstile(request, env, token) {
  if (env.ENVIRONMENT !== 'production' && env.TURNSTILE_TEST_BYPASS === 'enabled-for-local-tests') {
    if (token === 'test-pass') return
    throw new ResponseError(403, 'turnstile_rejected', 'Turnstile verification failed')
  }
  const secret = requiredSecret(env, 'TURNSTILE_SECRET_KEY')
  const form = new FormData()
  form.set('secret', secret)
  form.set('response', typeof token === 'string' ? token : '')
  const remoteIp = request.headers.get('cf-connecting-ip')
  if (remoteIp) form.set('remoteip', remoteIp)
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  })
  const body = await result.json()
  if (!result.ok || body.success !== true) {
    throw new ResponseError(403, 'turnstile_rejected', 'Turnstile verification failed')
  }
}

export async function authorizeMutation(request, env, body, mutationKind, { operator = false } = {}) {
  if (!publicMutationKinds.includes(mutationKind) && !operator) {
    throw new Error(`unsupported mutation kind: ${mutationKind}`)
  }
  enforceSameOrigin(request)
  const session = await requireSession(request, env)
  enforceCsrf(request, session)
  if (operator) {
    if (!session.operator) throw new ResponseError(403, 'operator_required', 'Operator authorization is required')
    return { session }
  }
  if (mutationKind !== 'appeal') {
    const lock = await currentAccountLock(env, session.account_id)
    if (lock) {
      throw new ResponseError(
        423,
        'contributor_locked',
        'This contributor is locked from ordinary public mutations; reads, logout, and appeals remain available',
        { moderation_action_id: lock.moderation_action_id },
      )
    }
  }
  await verifyTurnstile(request, env, body.turnstile_token)
  const ipAddress = request.headers.get('cf-connecting-ip') ?? 'unavailable'
  const ipHash = await hmacHex(requiredSecret(env, 'IP_HASH_SECRET'), ipAddress)
  const cutoff = new Date(Date.parse(nowIso(env)) - 60 * 60 * 1000).toISOString()
  const accountCount = await env.PROPOSALS_DB.prepare(
    'SELECT COUNT(*) AS count FROM quota_events WHERE account_id = ? AND recorded_at >= ?',
  )
    .bind(session.account_id, cutoff)
    .first('count')
  const ipCount = await env.PROPOSALS_DB.prepare(
    'SELECT COUNT(*) AS count FROM quota_events WHERE ip_hmac_sha256 = ? AND recorded_at >= ?',
  )
    .bind(ipHash, cutoff)
    .first('count')
  const limit = Number.parseInt(env.PUBLIC_WRITE_LIMIT_PER_HOUR ?? '30', 10)
  if (accountCount >= limit || ipCount >= limit) {
    throw new ResponseError(429, 'quota_exceeded', 'The bounded public write quota has been reached')
  }
  return { session, ip_hash: ipHash }
}

export async function readBoundedJson(request, maxBytes = 65536) {
  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '0', 10)
  if (contentLength > maxBytes) throw new ResponseError(413, 'payload_too_large', 'The request body is too large')
  const textBody = await request.text()
  if (encoder.encode(textBody).byteLength > maxBytes) {
    throw new ResponseError(413, 'payload_too_large', 'The request body is too large')
  }
  try {
    const parsed = JSON.parse(textBody)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    return parsed
  } catch {
    throw new ResponseError(400, 'invalid_json', 'The request body must be a JSON object')
  }
}

export async function idempotencyContext(request, env, accountId, operation, body) {
  const key = request.headers.get('idempotency-key')
  if (!key || key.length < 8 || key.length > 200) {
    throw new ResponseError(400, 'idempotency_key_required', 'A bounded Idempotency-Key header is required')
  }
  const keyHash = await sha256Hex(key)
  const requestHash = await sha256Hex(JSON.stringify(body))
  const existing = await env.PROPOSALS_DB.prepare(
    `SELECT request_sha256, response_status, response_json
     FROM write_idempotency_keys WHERE account_id = ? AND operation = ? AND key_sha256 = ?`,
  )
    .bind(accountId, operation, keyHash)
    .first()
  if (existing) {
    if (!constantTimeEqual(existing.request_sha256, requestHash)) {
      throw new ResponseError(409, 'idempotency_conflict', 'The idempotency key was used for different content')
    }
    return {
      replay: new Response(existing.response_json, {
        status: existing.response_status,
        headers: { 'content-type': 'application/json; charset=utf-8', 'idempotency-replayed': 'true' },
      }),
    }
  }
  return { key_hash: keyHash, request_hash: requestHash }
}

export function idempotencyStatement(database, context, accountId, operation, response, current) {
  const expires = new Date(Date.parse(current) + 24 * 60 * 60 * 1000).toISOString()
  return database
    .prepare(
      `INSERT INTO write_idempotency_keys (
        account_id, operation, key_sha256, request_sha256, response_status,
        response_json, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      accountId,
      operation,
      context.key_hash,
      context.request_hash,
      response.status,
      JSON.stringify(response.body),
      current,
      expires,
    )
}

export class ResponseError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message)
    this.name = 'ResponseError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export function normalizeError(error) {
  if (error instanceof ResponseError) return error
  if (error instanceof InputError) return new ResponseError(400, 'invalid_input', error.message, { field: error.field })
  return error
}
