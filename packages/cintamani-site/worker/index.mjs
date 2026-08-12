import frontier from '../src/data/frontier.json' with { type: 'json' }
import admittedTopics from '../src/data/research-topics.json' with { type: 'json' }
import illustrativeTopics from '../src/data/research-topic-fixture.json' with { type: 'json' }
import { axisMetadata, proposalKinds, researchTopicLoci, text, validateProposal } from '../src/lib/proposals.mjs'
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
  currentContributorLock,
  enforceCsrf,
  enforceSameOrigin,
  findSession,
  hmacHex,
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
import { createSIWxChallenge, verifySIWxChallenge } from './siwx.mjs'
import {
  X402_AMOUNT_ATOMIC,
  X402_PRICE_USD,
  createX402Facilitator,
  paymentRequiredHeader,
  paymentRequirements,
  readPaymentSignature,
  settlePayment,
  verifyPayment,
  x402Configuration,
  x402Readiness,
  X402ProtocolError,
} from './x402-protocol.mjs'
import {
  beginSettlement,
  expireX402IntentIfNeeded,
  beginVerification,
  finalizePaidProposal,
  loadVerifiedSettlementContext,
  paymentResumeState,
  recordSettlementOutcome,
  recordReplayChallenge,
  recordUnpersistedSettlementSuccess,
  recordVerifiedPayment,
  rejectVerification,
  reserveX402Intent,
  resumePaidProposal,
  retryStatus,
} from './x402-repository.mjs'

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
  headers.set('cross-origin-opener-policy', 'same-origin-allow-popups')
  headers.set(
    'content-security-policy',
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self' https://challenges.cloudflare.com https://github.com https://rpc.wallet.coinbase.com https://chain-proxy.wallet.coinbase.com; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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
      `INSERT INTO public_sessions (
        session_token_sha256, csrf_token_sha256, account_id,
        created_at, expires_at, revoked_at, rotated_to_sha256
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`,
    ).bind(sessionHash, csrfHash, accountId, current, expires),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO principal_session_events (
        session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
        rotated_to_sha256, rationale, source_timestamp, recorded_at
      ) VALUES (?, 1, ?, ?, 'issued', NULL, 'GitHub OAuth session issued', ?, ?)`,
    ).bind(sessionHash, `github-issued:${sessionHash}`, accountId, current, current),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO principal_session_events (
        session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
        rotated_to_sha256, rationale, source_timestamp, recorded_at
      )
      SELECT s.session_token_sha256,
        COALESCE((SELECT MAX(e.event_sequence) + 1 FROM principal_session_events e
          WHERE e.session_token_sha256 = s.session_token_sha256), 1),
        'github-rotated:' || s.session_token_sha256 || ':' || ?, s.account_id, 'rotated', ?,
        'Replaced by a new GitHub OAuth session', ?, ?
      FROM public_sessions s
      WHERE s.account_id = ? AND s.session_token_sha256 != ?
        AND s.revoked_at IS NULL AND s.expires_at > ?`,
    ).bind(sessionHash, sessionHash, current, current, accountId, sessionHash, current),
    env.PROPOSALS_DB.prepare(
      `UPDATE public_sessions SET revoked_at = ?, rotated_to_sha256 = ?
       WHERE account_id = ? AND session_token_sha256 != ?
         AND revoked_at IS NULL AND expires_at > ?`,
    ).bind(current, sessionHash, accountId, sessionHash, current),
  ])
  const headers = new Headers({ location: redirectPath, 'cache-control': 'no-store' })
  headers.append('set-cookie', sessionSetCookie(sessionToken, 7 * 24 * 60 * 60))
  headers.append('set-cookie', clearOAuthCookie())
  return new Response(null, { status: 302, headers })
}

async function sessionResponse(request, env) {
  const session = await findSession(request, env)
  if (!session) return json({ authenticated: false })
  const lock = await currentContributorLock(env, session.account_id)
  return json({
    authenticated: true,
    contributor: {
      principal_kind: session.principal_kind,
      public_pseudonym: session.public_pseudonym,
      github_login: session.github_login,
      github_profile_url: session.github_profile_url,
      github_avatar_url: session.github_avatar_url,
    },
    transport: session.transport,
    operator: session.operator,
    contributor_locked: lock !== null,
    lock_moderation_action_id: lock?.moderation_action_id ?? null,
    csrf_token: session.csrf,
  })
}

async function logout(request, env) {
  await readBoundedJson(request, 1024)
  const session = await requireSession(request, env)
  if (session.transport === 'browser-cookie') {
    enforceSameOrigin(request)
    enforceCsrf(request, session)
  }
  const current = nowIso(env)
  await env.PROPOSALS_DB.batch([
    env.PROPOSALS_DB.prepare(
      `INSERT INTO principal_session_events (
        session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
        rotated_to_sha256, rationale, source_timestamp, recorded_at
      ) VALUES (?,
        COALESCE((SELECT MAX(event_sequence) + 1 FROM principal_session_events
          WHERE session_token_sha256 = ?), 1),
        ?, ?, 'revoked', NULL, 'Contributor logout', ?, ?)`,
    ).bind(
      session.session_token_sha256, session.session_token_sha256,
      `logout-revoked:${session.session_token_sha256}`, session.principal_id, current, current,
    ),
    env.PROPOSALS_DB.prepare(
      `UPDATE public_sessions SET revoked_at = ?
       WHERE session_token_sha256 = ? AND revoked_at IS NULL`,
    ).bind(current, session.session_token_sha256),
  ])
  return json({ authenticated: false }, 200, { 'set-cookie': clearSessionCookie() })
}

async function health(env) {
  const metadata = await env.PROPOSALS_DB.prepare(
    'SELECT metadata_key, metadata_value FROM public_schema_metadata ORDER BY metadata_key',
  ).all()
  const violations = await env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM public_schema_violations').first('count')
  const x402Violations = await env.PROPOSALS_DB.prepare('SELECT COUNT(*) AS count FROM x402_schema_violations').first('count')
  const x402 = publicX402Configuration(env)
  const degraded = violations !== 0 || x402Violations !== 0 || (x402.requested_enabled && !x402.enabled)
  return json({
    status: degraded ? 'degraded' : 'ok',
    public_plane: 'separate-d1',
    canonical_registry_writes: false,
    schema: Object.fromEntries(metadata.results.map((row) => [row.metadata_key, row.metadata_value])),
    invariant_violations: violations,
    x402_invariant_violations: x402Violations,
    x402_configuration: x402.configuration_status,
  }, degraded ? 503 : 200)
}

function publicX402Configuration(env) {
  const readiness = x402Readiness(env)
  const requested = readiness.requested
  const mode = env.X402_MODE ?? 'testnet'
  const fallbackNetwork = mode === 'production' ? 'eip155:8453' : 'eip155:84532'
  try {
    const configured = requested ? x402Configuration(env) : null
    return {
      enabled: readiness.ready,
      requested_enabled: requested,
      configuration_status: readiness.ready ? 'ready' : (requested ? 'invalid' : 'disabled'),
      readiness_reason_codes: readiness.reason_codes,
      mode,
      network: configured?.network ?? fallbackNetwork,
      scheme: 'exact',
      asset: 'USDC',
      amount_atomic: X402_AMOUNT_ATOMIC,
      price_usd: X402_PRICE_USD,
      payment_is_publication_friction_only: true,
      epistemic_standing: false,
    }
  } catch {
    return {
      enabled: false,
      requested_enabled: requested,
      configuration_status: 'invalid',
      mode,
      network: fallbackNetwork,
      scheme: 'exact',
      asset: 'USDC',
      amount_atomic: X402_AMOUNT_ATOMIC,
      price_usd: X402_PRICE_USD,
      payment_is_publication_friction_only: true,
      epistemic_standing: false,
    }
  }
}

function captures(pathname, pattern) {
  const match = pathname.match(pattern)
  return match ? match.slice(1).map((value) => decodeURIComponent(value)) : null
}

function topicCursorState(url) {
  return Object.fromEntries(['locus', 'status', 'origin', 'coordinate', 'q'].map((key) => [key, url.searchParams.get(key) ?? '']))
}

function topicCursorEncode(after, filters) {
  return [...new TextEncoder().encode(JSON.stringify({ version: 1, filters, after }))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function topicCursorDecode(raw, filters) {
  if (!raw) return ''
  if (raw.length > 4_000 || raw.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(raw)) {
    throw new ResponseError(400, 'invalid_topic_cursor', 'The research-topic cursor is malformed')
  }
  try {
    const bytes = Uint8Array.from(raw.match(/../gu).map((pair) => Number.parseInt(pair, 16)))
    const parsed = JSON.parse(new TextDecoder().decode(bytes))
    if (parsed.version !== 1 || typeof parsed.after !== 'string' || JSON.stringify(parsed.filters) !== JSON.stringify(filters)) {
      throw new Error('cursor contract mismatch')
    }
    return parsed.after
  } catch {
    throw new ResponseError(400, 'invalid_topic_cursor', 'The research-topic cursor does not match this filter set')
  }
}

function boundedTopicCollection(url) {
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 50)
  const filterState = topicCursorState(url)
  const cursor = topicCursorDecode(url.searchParams.get('cursor') ?? '', filterState)
  const locus = url.searchParams.get('locus')
  const status = url.searchParams.get('status')
  const origin = url.searchParams.get('origin')
  const coordinate = url.searchParams.get('coordinate')
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  if (status && !['active', 'paused', 'retired'].includes(status)) {
    throw new ResponseError(400, 'invalid_topic_status', 'Topic status must be active, paused, or retired')
  }
  if (locus && !researchTopicLoci.includes(locus)) {
    throw new ResponseError(400, 'invalid_topic_locus', 'The research locus is not supported')
  }
  const canonical = admittedTopics.items.map((item) => ({
    ...item,
    authority: 'governed-domain-registry',
    canonical_admission: true,
  }))
  const fixture = illustrativeTopics.items.map((item) => ({
    ...item,
    status: illustrativeTopics.workflow_status,
    authority: illustrativeTopics.authority,
    canonical_admission: false,
    source_fixture: illustrativeTopics.fixture_schema,
  }))
  const items = [...canonical, ...fixture]
    .filter((item) => item.topic_id > cursor)
    .filter((item) => !locus || item.loci?.includes(locus))
    .filter((item) => !status || item.status === status)
    .filter((item) => !origin || item.origins?.some((candidate) =>
      candidate.id === origin || candidate.kind === origin || candidate.relationship === origin))
    .filter((item) => !coordinate || item.coordinate?.coordinate_key === coordinate ||
      item.coordinate_framings?.some((candidate) => candidate.coordinate_key === coordinate))
    .filter((item) => !query || [
      item.title,
      item.open_problem,
      item.why_open,
      item.scope,
      item.next_discriminating_criticism_or_test,
      item.non_claims,
    ].some((value) => value?.toLowerCase().includes(query)))
    .sort((left, right) => left.topic_id.localeCompare(right.topic_id))
  const page = items.slice(0, limit + 1)
  const hasMore = page.length > limit
  const selected = hasMore ? page.slice(0, limit) : page
  return {
    collection: 'research-topics',
    items: selected,
    next_cursor: hasMore ? topicCursorEncode(selected.at(-1).topic_id, filterState) : null,
    bounded: true,
    workflow_states_only: true,
    epistemic_ranking: false,
    fixture_authority: illustrativeTopics.authority,
  }
}

function exactTopic(topicId) {
  const canonical = admittedTopics.items.find((item) => item.topic_id === topicId)
  if (canonical) return { ...canonical, authority: 'governed-domain-registry', canonical_admission: true }
  const fixture = illustrativeTopics.items.find((item) => item.topic_id === topicId)
  if (!fixture) throw new ResponseError(404, 'research_topic_not_found', 'The research topic does not exist')
  return {
    ...fixture,
    status: illustrativeTopics.workflow_status,
    authority: illustrativeTopics.authority,
    canonical_admission: false,
    source_fixture: illustrativeTopics.fixture_schema,
    bounded_conjecture: illustrativeTopics.bounded_conjecture,
    sources: illustrativeTopics.sources,
    relations: illustrativeTopics.relations.filter((relation) =>
      relation.source.startsWith(`${topicId}@`) || relation.target.startsWith(`${topicId}@`)),
  }
}

function topicHistory(topicId) {
  const topic = exactTopic(topicId)
  if (topic.authority === 'governed-domain-registry') {
    return {
      collection: `research-topic-history:${topicId}`,
      items: topic.history ?? [],
      next_cursor: topic.history_next_cursor ?? null,
      bounded: true,
    }
  }
  return {
    collection: `research-topic-history:${topicId}`,
    items: [
      { history_family: 'version', revision: topic.revision, status: 'illustrative-unadmitted' },
      { history_family: 'administrative-workflow', revision: 1, status: topic.status },
    ],
    next_cursor: null,
    bounded: true,
    authority: topic.authority,
  }
}

function topicProvenance(topicId) {
  const topic = exactTopic(topicId)
  return {
    collection: `research-topic-provenance:${topicId}`,
    authority: topic.authority,
    canonical_admission: topic.canonical_admission,
    exact_origins: topic.origins ?? [],
    provenance: topic.provenance ?? [],
    sources: topic.sources ?? [],
    bounded: true,
  }
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

function canonicalPublicOrigin(env) {
  if (typeof env.PUBLIC_ORIGIN !== 'string') throw new ResponseError(503, 'x402_misconfigured', 'PUBLIC_ORIGIN is required')
  let url
  try { url = new URL(env.PUBLIC_ORIGIN) } catch { throw new ResponseError(503, 'x402_misconfigured', 'PUBLIC_ORIGIN is invalid') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ResponseError(503, 'x402_misconfigured', 'PUBLIC_ORIGIN must be an exact HTTPS origin')
  }
  return url.origin
}

function x402Json(result) {
  const headers = result.payment_response_header
    ? { 'payment-response': result.payment_response_header }
    : undefined
  return json(result.body, result.status, headers)
}

async function x402RequestContext(request, env, { newPayment = true } = {}) {
  if (newPayment) {
    const readiness = x402Readiness(env)
    if (!readiness.requested) throw new ResponseError(503, 'x402_disabled', 'Accountless paid submissions are disabled')
    if (!readiness.ready) throw new ResponseError(503, 'x402_misconfigured', 'The x402 payment lane is not ready')
  }
  const body = await readBoundedJson(request)
  const input = validateProposal(body)
  const idempotencyKey = request.headers.get('idempotency-key')
  const ipAddress = request.headers.get('cf-connecting-ip') ?? 'unavailable'
  const ipHash = await hmacHex(requiredSecret(env, 'IP_HASH_SECRET'), ipAddress)
  let resourceUrl = null
  let requirements = null
  if (newPayment) {
    const origin = canonicalPublicOrigin(env)
    resourceUrl = `${origin}/api/x402/proposals`
    try {
      requirements = paymentRequirements(env, resourceUrl)
    } catch {
      throw new ResponseError(503, 'x402_misconfigured', 'The x402 payment lane is not configured')
    }
  }
  return { body, input, idempotencyKey, ipHash, resourceUrl, requirements }
}

function paymentChallenge(requirements, resourceUrl, message = undefined) {
  return json(
    { error: { code: 'payment_required', message: message ?? 'A valid x402 v2 payment is required' } },
    402,
    { 'payment-required': paymentRequiredHeader(requirements, resourceUrl, message) },
  )
}

async function paidProposal(request, env) {
  const context = await x402RequestContext(request, env)
  const authenticated = await findSession(request, env)
  const expectedPayerPrincipalId = authenticated?.principal_kind === 'base-wallet'
    ? authenticated.principal_id
    : null
  const config = x402Configuration(env)
  const reservation = await reserveX402Intent(env, {
    idempotencyKey: context.idempotencyKey,
    normalizedRequest: context.input,
    requirements: context.requirements,
    ipHash: context.ipHash,
    mode: config.mode,
  })
  let state = await paymentResumeState(env, reservation.payment_intent_id)
  const expiry = await expireX402IntentIfNeeded(env, reservation.payment_intent_id)
  if (expiry.expired) {
    throw new ResponseError(409, 'payment_attempt_expired', 'This payment attempt expired; submit again with a new idempotency key')
  }
  if (expiry.state !== state.payment_state) state = await paymentResumeState(env, reservation.payment_intent_id)
  const signature = readPaymentSignature(request)

  if (state.payment_state === 'reserved' || state.payment_state === 'verifying') {
    if (!signature) {
      if (reservation.replay) await recordReplayChallenge(env, { ipHash: context.ipHash, mode: config.mode })
      return paymentChallenge(
        context.requirements,
        context.resourceUrl,
        state.payment_state === 'verifying' ? 'Payment authorization can be retried for this unchanged attempt' : undefined,
      )
    }
    if (state.payment_state === 'reserved') await beginVerification(env, reservation.payment_intent_id)
    const facilitator = createX402Facilitator(env)
    let verified
    try {
      verified = await verifyPayment(facilitator, signature, context.requirements)
    } catch (error) {
      if (error instanceof X402ProtocolError) {
        await rejectVerification(env, reservation.payment_intent_id)
        return paymentChallenge(context.requirements, context.resourceUrl, error.message)
      }
      return json({
        error: {
          code: 'payment_verification_unavailable',
          message: 'Payment verification is temporarily unavailable; retry the unchanged attempt',
        },
      }, 503)
    }
    await recordVerifiedPayment(env, {
      paymentIntentId: reservation.payment_intent_id,
      paymentPayload: signature,
      payer: verified.payer,
      ipHash: context.ipHash,
      expectedPayerPrincipalId,
    })
    state = await paymentResumeState(env, reservation.payment_intent_id)
  }

  if (state.payment_state === 'settling') {
    const unknown = await recordSettlementOutcome(env, {
      paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate',
    })
    return json({
      error: { code: 'settlement_unknown', message: 'Settlement dispatch may have completed and requires reconciliation' },
      retry_reference: unknown.public_retry_reference,
    }, 503)
  }

  if (state.payment_state === 'verified') {
    const verified = await loadVerifiedSettlementContext(env, reservation.payment_intent_id)
    const started = await beginSettlement(env, reservation.payment_intent_id)
    if (started.replay) {
      const unknown = await recordSettlementOutcome(env, {
        paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate',
      })
      return json({
        error: { code: 'settlement_unknown', message: 'Settlement dispatch may have completed and requires reconciliation' },
        retry_reference: unknown.public_retry_reference,
      }, 503)
    }
    const settlement = await settlePayment(createX402Facilitator(env), verified)
    if (settlement.outcome === 'indeterminate') {
      const unknown = await recordSettlementOutcome(env, {
        paymentIntentId: reservation.payment_intent_id, outcome: 'indeterminate',
      })
      return json({
        error: { code: 'settlement_unknown', message: 'Settlement outcome requires reconciliation' },
        retry_reference: unknown.public_retry_reference,
      }, 503)
    }
    if (settlement.outcome === 'rejected') {
      await recordSettlementOutcome(env, {
        paymentIntentId: reservation.payment_intent_id, outcome: 'rejected', settlement: settlement.settlement,
      })
      return json(
        { error: { code: 'settlement_rejected', message: 'Settlement was rejected' } },
        402,
        settlement.headers,
      )
    }
    let stored
    try {
      stored = await recordSettlementOutcome(env, {
        paymentIntentId: reservation.payment_intent_id,
        outcome: 'settled',
        settlement: settlement.settlement,
        paymentResponseHeader: settlement.headers['payment-response'],
      })
    } catch {
      try {
        return x402Json(await recordUnpersistedSettlementSuccess(env, {
          paymentIntentId: reservation.payment_intent_id,
          paymentResponseHeader: settlement.headers['payment-response'],
        }))
      } catch {
        return json({
          error: { code: 'settlement_receipt_persistence_unknown', message: 'Settlement succeeded but durable receipt persistence requires reconciliation' },
          retry_reference: state.public_retry_reference,
        }, 503, { 'payment-response': settlement.headers['payment-response'] })
      }
    }
    return x402Json(await finalizePaidProposal(env, {
      paymentIntentId: reservation.payment_intent_id,
      publicRetryReference: stored.public_retry_reference,
      rawBody: context.body,
      ipHash: context.ipHash,
    }))
  }

  if (state.payment_state === 'settled' || state.payment_state === 'finalized') {
    return x402Json(await resumePaidProposal(env, {
      publicRetryReference: state.public_retry_reference,
      idempotencyKey: context.idempotencyKey,
      rawBody: context.body,
      ipHash: context.ipHash,
    }))
  }
  if (state.payment_state === 'settlement-unknown') {
    return json({
      error: { code: 'settlement_unknown', message: 'Settlement requires reconciliation' },
      retry_reference: state.public_retry_reference,
    }, 503)
  }
  if (state.payment_state === 'rejected') {
    throw new ResponseError(409, 'payment_attempt_terminal', 'This payment attempt is terminal; submit again with a new idempotency key')
  }
  if (state.payment_state === 'expired') {
    throw new ResponseError(409, 'payment_attempt_expired', 'This payment attempt expired; submit again with a new idempotency key')
  }
  throw new ResponseError(409, 'payment_state_conflict', `Payment cannot continue from ${state.payment_state}`)
}

async function x402Status(request, env, publicRetryReference) {
  const context = await x402RequestContext(request, env, { newPayment: false })
  const status = await retryStatus(env, {
    publicRetryReference,
    idempotencyKey: context.idempotencyKey,
    normalizedRequest: context.input,
  })
  return json({
    payment_state: status.payment_state,
    entitlement_state: status.entitlement_state,
    proposal_id: status.proposal_id,
    retryable_without_payment: status.retryable_without_payment,
    terminal: status.terminal,
  })
}

async function x402Retry(request, env, publicRetryReference) {
  const context = await x402RequestContext(request, env, { newPayment: false })
  return x402Json(await resumePaidProposal(env, {
    publicRetryReference,
    idempotencyKey: context.idempotencyKey,
    rawBody: context.body,
    ipHash: context.ipHash,
  }))
}

async function routeApi(request, env) {
  const url = new URL(request.url)
  const { pathname } = url
  if (request.method === 'GET' && pathname === '/api/health') return health(env)
  if (request.method === 'GET' && pathname === '/api/config') {
    return json({
      proposal_kinds: proposalKinds,
      frontier: {
        coordinate_key_version: frontier.items[0]?.coordinate_key_version ?? null,
        validation_generation: frontier.items[0]?.validation_generation ?? null,
        items: frontier.items,
        bounded: true,
        derived: true,
      },
      dimensions: axisMetadata,
      turnstile_site_key: env.TURNSTILE_SITE_KEY ?? null,
      authentication: 'github-or-base-wallet',
      x402: publicX402Configuration(env),
      immediate_visibility: 'submitted-unreviewed',
      voting: false,
      epistemic_ranking: false,
    })
  }
  if (request.method === 'GET' && pathname === '/api/research-topics') {
    return json(boundedTopicCollection(url))
  }
  let topicValues = captures(pathname, /^\/api\/research-topics\/([^/]+)$/u)
  if (request.method === 'GET' && topicValues) return json(exactTopic(topicValues[0]))
  topicValues = captures(pathname, /^\/api\/research-topics\/([^/]+)\/history$/u)
  if (request.method === 'GET' && topicValues) return json(topicHistory(topicValues[0]))
  topicValues = captures(pathname, /^\/api\/research-topics\/([^/]+)\/provenance$/u)
  if (request.method === 'GET' && topicValues) return json(topicProvenance(topicValues[0]))
  if (request.method === 'GET' && pathname === '/api/auth/github/start') return beginGithubOAuth(request, env)
  if (request.method === 'GET' && pathname === '/api/auth/github/callback') return completeGithubOAuth(request, env)
  if (request.method === 'GET' && pathname === '/api/session') return sessionResponse(request, env)
  if (request.method === 'POST' && pathname === '/api/session/logout') return logout(request, env)
  if ((request.method === 'GET' || request.method === 'POST') && pathname === '/api/auth/wallet/challenge') return createSIWxChallenge(request, env)
  if (request.method === 'POST' && pathname === '/api/auth/wallet/verify') return verifySIWxChallenge(request, env)
  if (request.method === 'POST' && pathname === '/api/x402/proposals') return paidProposal(request, env)
  let x402Values = captures(pathname, /^\/api\/x402\/proposals\/status\/([^/]+)$/u)
  if (request.method === 'POST' && x402Values) return x402Status(request, env, x402Values[0])
  x402Values = captures(pathname, /^\/api\/x402\/proposals\/retry\/([^/]+)$/u)
  if (request.method === 'POST' && x402Values) return x402Retry(request, env, x402Values[0])
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
      if (caught instanceof X402ProtocolError) {
        return securityHeaders(json({ error: { code: caught.code, message: caught.message } }, caught.status))
      }
      const error = normalizeError(caught)
      if (error instanceof ResponseError) {
        return securityHeaders(json({ error: { code: error.code, message: error.message, details: error.details } }, error.status))
      }
      const safeName = new Set(['Error', 'TypeError', 'AbortError']).has(error?.name)
        ? error.name
        : 'UnexpectedError'
      console.error('unhandled request failure', { name: safeName })
      return securityHeaders(json({ error: { code: 'internal_error', message: 'The request could not be completed' } }, 500))
    }
  },
}
