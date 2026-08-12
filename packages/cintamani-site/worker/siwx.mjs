import {
  createSIWxMessage,
  declareSIWxExtension,
  parseSIWxHeader,
  validateSIWxMessage,
  verifySIWxSignature,
} from '@x402/extensions/sign-in-with-x'
import { createPublicClient, getAddress, http } from 'viem'
import { base, baseSepolia } from 'viem/chains'
import {
  csrfForSession,
  enforceCsrf,
  enforceSameOrigin,
  findSession,
  hmacHex,
  nowIso,
  randomToken,
  requiredSecret,
  sessionSetCookie,
  sha256Hex,
  ResponseError,
} from './security.mjs'

const MAX_CHALLENGE_AGE_MS = 5 * 60 * 1000
const BROWSER_SESSION_SECONDS = 7 * 24 * 60 * 60
const AGENT_SESSION_SECONDS = 24 * 60 * 60
const purposes = new Set(['session', 'link', 'revoke'])

function siwxNonce() {
  return [...crypto.getRandomValues(new Uint8Array(24))]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

function networkConfig(env) {
  const testnet = (env.X402_MODE ?? 'testnet') === 'testnet'
  return testnet
    ? { caip: 'eip155:84532', stored: 'base-sepolia', chain: baseSepolia, rpc: env.BASE_SEPOLIA_RPC_URL }
    : { caip: 'eip155:8453', stored: 'base-mainnet', chain: base, rpc: env.BASE_RPC_URL }
}

function rpcUrl(env, network) {
  const value = network.stored === 'base-sepolia' ? env.BASE_SEPOLIA_RPC_URL : env.BASE_RPC_URL
  let parsed
  try { parsed = new URL(value) } catch { /* handled below */ }
  if (!parsed || parsed.protocol !== 'https:') {
    throw new ResponseError(503, 'siwx_rpc_unavailable', `An explicit HTTPS RPC binding for ${network.stored} is required`)
  }
  return parsed.href
}

function exactOrigin(request, env) {
  const url = new URL(env.PUBLIC_ORIGIN ?? request.url)
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new ResponseError(400, 'siwx_https_required', 'Wallet authentication requires HTTPS')
  }
  return url.origin
}

function challengeUri(origin, purpose, transport) {
  const uri = new URL('/api/auth/wallet/verify', origin)
  uri.searchParams.set('purpose', purpose)
  uri.searchParams.set('transport', transport)
  return uri.href
}

function normalizeAddress(address) {
  try {
    return getAddress(address).toLowerCase()
  } catch {
    throw new ResponseError(400, 'invalid_wallet_address', 'Use a valid EVM wallet address')
  }
}

async function challengeIdentity(request, env, purpose) {
  if (purpose === 'session') return null
  const session = await findSession(request, env)
  if (!session || session.principal_kind !== 'github') {
    throw new ResponseError(401, 'github_session_required', 'A current GitHub session is required to link or revoke a wallet')
  }
  enforceSameOrigin(request)
  enforceCsrf(request, session)
  return session
}

export async function createSIWxChallenge(request, env) {
  const url = new URL(request.url)
  const purpose = url.searchParams.get('purpose') ?? 'session'
  if (!purposes.has(purpose)) throw new ResponseError(400, 'invalid_siwx_purpose', 'Unknown wallet authentication purpose')
  const requestedTransport = url.searchParams.get('transport') ?? 'browser-cookie'
  if (!['browser-cookie', 'agent-bearer'].includes(requestedTransport)) {
    throw new ResponseError(400, 'invalid_siwx_transport', 'Unknown wallet session transport')
  }
  if (purpose !== 'session' && requestedTransport !== 'browser-cookie') {
    throw new ResponseError(400, 'invalid_siwx_transport', 'Identity links require a browser-cookie session')
  }
  const github = await challengeIdentity(request, env, purpose)
  const origin = exactOrigin(request, env)
  const current = nowIso(env)
  const expiresAt = new Date(Date.parse(current) + MAX_CHALLENGE_AGE_MS).toISOString()
  const nonce = siwxNonce()
  const digest = await sha256Hex(nonce)
  const network = networkConfig(env)
  const uri = challengeUri(origin, purpose, requestedTransport)
  const declaration = declareSIWxExtension({
    network: network.caip,
    statement: purpose === 'session'
      ? 'Authenticate to contribute to Cintamani. This signature does not submit a proposal or authorize payment.'
      : `${purpose === 'link' ? 'Link' : 'Revoke'} this wallet and the signed-in GitHub contributor identity.`,
    expirationSeconds: MAX_CHALLENGE_AGE_MS / 1000,
  })['sign-in-with-x']
  const info = {
    ...declaration.info,
    domain: new URL(origin).host,
    uri,
    nonce,
    issuedAt: current,
    expirationTime: expiresAt,
    requestId: `siwx-${purpose}-${digest.slice(0, 24)}`,
    resources: [`${origin}/proposals/`],
  }
  await env.PROPOSALS_DB.prepare(
    `INSERT INTO siwx_nonces (
      nonce_digest_sha256, purpose, transport, bound_github_principal_id, origin, uri, network, issued_at, expires_at,
      consumed_at, verified_principal_id, message_sha256, signature_sha256
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`,
  ).bind(digest, purpose, requestedTransport, github?.principal_id ?? null, origin, uri, network.stored, current, expiresAt).run()
  return json({ extension: { ...declaration, info }, chain_id: network.caip, purpose, transport: requestedTransport })
}

async function walletIdentity(env, address, current) {
  const addressDigest = await hmacHex(requiredSecret(env, 'IDENTITY_HMAC_SECRET'), `base-wallet:${address}`)
  const existing = await env.PROPOSALS_DB.prepare(
    `SELECT identity.principal_id, principal.public_pseudonym
     FROM base_wallet_identities identity
     JOIN contributor_principals principal USING (principal_id)
     WHERE identity.address_hmac_sha256 = ?`,
  ).bind(addressDigest).first()
  if (existing) return { ...existing, addressDigest, isNew: false }

  let suffixLength = 12
  while (suffixLength <= 64) {
    const pseudonym = `base:${addressDigest.slice(0, suffixLength)}`
    const collision = await env.PROPOSALS_DB.prepare(
      'SELECT principal_id FROM contributor_principals WHERE public_pseudonym = ?',
    ).bind(pseudonym).first()
    if (!collision) {
      return {
        principal_id: `principal-wallet-${addressDigest.slice(0, 32)}`,
        public_pseudonym: pseudonym,
        addressDigest,
        isNew: true,
        current,
      }
    }
    suffixLength += 4
  }
  throw new ResponseError(409, 'wallet_pseudonym_collision', 'The wallet identity could not be assigned a public pseudonym')
}

async function verifyProof(request, env) {
  const encoded = request.headers.get('sign-in-with-x')
  if (!encoded) throw new ResponseError(400, 'siwx_proof_required', 'SIGN-IN-WITH-X is required')
  let payload
  try {
    payload = parseSIWxHeader(encoded)
  } catch {
    throw new ResponseError(400, 'invalid_siwx_proof', 'The wallet proof is malformed')
  }
  const nonceDigest = await sha256Hex(payload.nonce)
  const challenge = await env.PROPOSALS_DB.prepare('SELECT * FROM siwx_nonces WHERE nonce_digest_sha256 = ?')
    .bind(nonceDigest).first()
  if (!challenge || challenge.consumed_at !== null) {
    throw new ResponseError(409, 'siwx_nonce_unavailable', 'The wallet challenge is unknown or has already been used')
  }
  const origin = exactOrigin(request, env)
  const network = networkConfig(env)
  if (challenge.origin !== origin || challenge.uri !== payload.uri || challenge.network !== network.stored || payload.chainId !== network.caip) {
    throw new ResponseError(403, 'siwx_binding_mismatch', 'The wallet proof does not match its stored challenge')
  }
  const validation = await validateSIWxMessage(payload, new URL(origin), {
    maxAge: MAX_CHALLENGE_AGE_MS,
    checkNonce: (nonce) => nonce === payload.nonce && sha256Hex(nonce).then((value) => value === nonceDigest),
  })
  if (!validation.isValid) throw new ResponseError(403, 'siwx_message_invalid', 'The wallet sign-in message is invalid')
  const configuredRpc = rpcUrl(env, network)
  const client = createPublicClient({ chain: network.chain, transport: http(configuredRpc) })
  const verifier = env.ENVIRONMENT === 'test' && typeof env.TEST_SIWX_EVM_VERIFIER === 'function'
    ? env.TEST_SIWX_EVM_VERIFIER
    : client.verifyMessage.bind(client)
  const verified = await verifySIWxSignature(payload, { evmVerifier: verifier })
  if (!verified.isValid) throw new ResponseError(403, 'siwx_signature_invalid', 'The wallet signature is invalid')
  const address = normalizeAddress(verified.payer)
  if (address !== normalizeAddress(payload.address)) {
    throw new ResponseError(403, 'siwx_signer_mismatch', 'The recovered signer does not match the claimed wallet')
  }
  return { payload, challenge, nonceDigest, address, encoded }
}

async function proofDigests(proof) {
  const message = createSIWxMessage(proof.payload, proof.payload.address)
  return { messageDigest: await sha256Hex(message), signatureDigest: await sha256Hex(proof.payload.signature) }
}

function consumeNonceStatement(env, proof, principalId, current, digests) {
  return env.PROPOSALS_DB.prepare(
    `UPDATE siwx_nonces
     SET consumed_at = ?, verified_principal_id = ?, message_sha256 = ?, signature_sha256 = ?
     WHERE nonce_digest_sha256 = ?`,
  ).bind(
    current,
    principalId,
    digests.messageDigest,
    digests.signatureDigest,
    proof.nonceDigest,
  )
}

async function sessionMutation(env, identity, transport, current) {
  const token = randomToken()
  const tokenDigest = await sha256Hex(token)
  const csrf = transport === 'browser-cookie' ? await csrfForSession(env, token) : null
  const csrfDigest = csrf ? await sha256Hex(csrf) : null
  const seconds = transport === 'browser-cookie' ? BROWSER_SESSION_SECONDS : AGENT_SESSION_SECONDS
  const expiresAt = new Date(Date.parse(current) + seconds * 1000).toISOString()
  const statements = []
  if (identity.isNew) {
    statements.push(
      env.PROPOSALS_DB.prepare(
        `INSERT INTO contributor_principals
          (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
         VALUES (?, 'base-wallet', ?, 1, ?)`,
      ).bind(identity.principal_id, identity.public_pseudonym, current),
      env.PROPOSALS_DB.prepare(
        `INSERT INTO base_wallet_identities
          (principal_id, principal_kind, address_hmac_sha256, created_at, last_verified_at)
         VALUES (?, 'base-wallet', ?, ?, ?)`,
      ).bind(identity.principal_id, identity.addressDigest, current, current),
    )
  } else {
    statements.push(env.PROPOSALS_DB.prepare(
      'UPDATE base_wallet_identities SET last_verified_at = ? WHERE principal_id = ?',
    ).bind(current, identity.principal_id))
  }
  statements.push(
    env.PROPOSALS_DB.prepare(
      `INSERT INTO public_sessions (
        session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
        revoked_at, rotated_to_sha256, auth_kind, transport, scope
      ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 'siwx', ?, 'public-contributor')`,
    ).bind(tokenDigest, csrfDigest, identity.principal_id, current, expiresAt, transport),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO principal_session_events (
        session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
        rotated_to_sha256, rationale, source_timestamp, recorded_at
      ) VALUES (?, 1, ?, ?, 'issued', NULL, ?, ?, ?)`,
    ).bind(tokenDigest, `siwx-issued:${tokenDigest}`, identity.principal_id, `SIWX ${transport} issued`, current, current),
  )
  return { token, csrf, expiresAt, seconds, statements }
}

async function linkMutation(env, githubId, walletId, action, actorId, digests, current) {
  const active = await env.PROPOSALS_DB.prepare(
    `SELECT link_id, event_sequence FROM current_principal_identity_links
     WHERE github_principal_id = ? AND wallet_principal_id = ?`,
  ).bind(githubId, walletId).first()
  if (action === 'revoked' && !active) throw new ResponseError(409, 'identity_link_not_active', 'This identity link is not active')
  if (action === 'verified' && active) return { statement: null, linked: true, replay: true }
  const linkId = active?.link_id ?? `identity-link-${randomToken(18)}`
  const sequence = (active?.event_sequence ?? 0) + 1
  const statement = env.PROPOSALS_DB.prepare(
    `INSERT INTO principal_identity_link_events (
      link_id, event_sequence, link_event_id, github_principal_id, github_principal_kind,
      wallet_principal_id, wallet_principal_kind, action_kind, actor_principal_id,
      siwx_message_sha256, signature_sha256, rationale, source_timestamp, recorded_at
    ) VALUES (?, ?, ?, ?, 'github', ?, 'base-wallet', ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    linkId, sequence, `${linkId}:${sequence}`, githubId, walletId, action, actorId,
    digests.messageDigest, digests.signatureDigest,
    action === 'verified' ? 'Directly verified GitHub-wallet identity link' : 'Directly verified identity-link revocation',
    current, current,
  )
  return { statement, linked: action === 'verified' }
}

export async function verifySIWxChallenge(request, env) {
  const proof = await verifyProof(request, env)
  const purpose = proof.challenge.purpose
  const current = nowIso(env)
  if (proof.challenge.expires_at <= current) throw new ResponseError(403, 'siwx_expired', 'The wallet challenge expired')
  if (new URL(request.url).href !== proof.challenge.uri) {
    throw new ResponseError(403, 'siwx_request_binding_mismatch', 'The verification request differs from the signed challenge')
  }
  const identity = await walletIdentity(env, proof.address, current)
  const digests = await proofDigests(proof)

  if (purpose === 'session') {
    const transport = proof.challenge.transport
    const session = await sessionMutation(env, identity, transport, current)
    await env.PROPOSALS_DB.batch([
      ...session.statements.slice(0, identity.isNew ? 2 : 1),
      consumeNonceStatement(env, proof, identity.principal_id, current, digests),
      ...session.statements.slice(identity.isNew ? 2 : 1),
    ])
    const body = {
      authenticated: true,
      transport,
      contributor: { principal_kind: 'base-wallet', public_pseudonym: identity.public_pseudonym },
      expires_at: session.expiresAt,
      ...(transport === 'agent-bearer' ? { bearer_token: session.token } : { csrf_token: session.csrf }),
    }
    return json(body, 201, transport === 'browser-cookie'
      ? { 'set-cookie': sessionSetCookie(session.token, session.seconds) }
      : {})
  }

  const github = await challengeIdentity(request, env, purpose)
  const expectedGithub = proof.challenge.bound_github_principal_id
  if (github.principal_id !== expectedGithub) {
    throw new ResponseError(403, 'siwx_github_binding_mismatch', 'The GitHub session differs from the challenge issuer')
  }
  const identityStatements = identity.isNew
    ? [env.PROPOSALS_DB.prepare(
        `INSERT INTO contributor_principals
          (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
         VALUES (?, 'base-wallet', ?, 1, ?)`,
      ).bind(identity.principal_id, identity.public_pseudonym, current), env.PROPOSALS_DB.prepare(
        `INSERT INTO base_wallet_identities
          (principal_id, principal_kind, address_hmac_sha256, created_at, last_verified_at)
         VALUES (?, 'base-wallet', ?, ?, ?)`,
      ).bind(identity.principal_id, identity.addressDigest, current, current)]
    : [env.PROPOSALS_DB.prepare('UPDATE base_wallet_identities SET last_verified_at = ? WHERE principal_id = ?')
      .bind(current, identity.principal_id)]
  const link = await linkMutation(env, github.principal_id, identity.principal_id, purpose === 'link' ? 'verified' : 'revoked', github.principal_id, digests, current)
  await env.PROPOSALS_DB.batch([
    ...identityStatements,
    consumeNonceStatement(env, proof, identity.principal_id, current, digests),
    ...(link.statement ? [link.statement] : []),
  ])
  return json({ linked: link.linked, wallet_pseudonym: identity.public_pseudonym })
}
