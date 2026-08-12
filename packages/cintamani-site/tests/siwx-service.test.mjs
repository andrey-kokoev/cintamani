import assert from 'node:assert/strict'
import test from 'node:test'
import { createSIWxMessage } from '@x402/extensions/sign-in-with-x'
import { privateKeyToAccount } from 'viem/accounts'
import { verifyMessage } from 'viem'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x'
import { createSIWxChallenge, verifySIWxChallenge } from '../worker/siwx.mjs'
import { SQLiteD1 } from './helpers/sqlite-d1.mjs'

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const origin = 'https://cintamani.example'

function environment(database) {
  return {
    PROPOSALS_DB: database,
    ENVIRONMENT: 'test',
    X402_MODE: 'testnet',
    BASE_SEPOLIA_RPC_URL: 'https://rpc.example.invalid',
    IDENTITY_HMAC_SECRET: 'identity-hmac-secret-for-siwx-tests',
    CSRF_SECRET: 'csrf-secret-for-siwx-tests-000000',
    TEST_NOW: new Date().toISOString(),
    TEST_SIWX_EVM_VERIFIER: (args) => verifyMessage(args),
  }
}

test('SIWX defaults coherently to Base Sepolia testnet', async () => {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  const env = environment(database)
  delete env.X402_MODE
  const response = await createSIWxChallenge(
    new Request(`${origin}/api/auth/wallet/challenge?purpose=session`), env,
  )
  assert.equal(response.status, 200)
  assert.equal((await response.json()).chain_id, 'eip155:84532')
})

async function signedSession(env, account, transport = 'agent-bearer') {
  const challengeResponse = await createSIWxChallenge(
    new Request(`${origin}/api/auth/wallet/challenge?purpose=session&transport=${transport}`), env,
  )
  const challenge = await challengeResponse.json()
  const selected = challenge.extension.supportedChains.find((item) => item.chainId === challenge.chain_id)
  const payload = await createSIWxPayload({ ...challenge.extension.info, ...selected }, account)
  const request = new Request(challenge.extension.info.uri, {
    method: 'POST', headers: { 'sign-in-with-x': encodeSIWxHeader(payload) },
  })
  return { challenge, payload, request }
}

function captureDatabase() {
  const rows = []
  return {
    rows,
    prepare(sql) {
      return {
        bind(...values) {
          return { run: async () => { rows.push({ sql, values }); return { success: true } } }
        },
      }
    },
  }
}

test('SIWX session challenge stores and returns the same exact origin, URI, nonce, and Base binding', async () => {
  const database = captureDatabase()
  const response = await createSIWxChallenge(
    new Request('https://cintamani.example/api/auth/wallet/challenge?purpose=session'),
    { PROPOSALS_DB: database, X402_MODE: 'production', TEST_NOW: '2026-08-11T18:00:00.000Z' },
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  const info = body.extension.info
  assert.equal(body.chain_id, 'eip155:8453')
  assert.equal(info.domain, 'cintamani.example')
  assert.equal(info.uri, 'https://cintamani.example/api/auth/wallet/verify?purpose=session&transport=browser-cookie')
  assert.equal(info.expirationTime, '2026-08-11T18:05:00.000Z')
  assert.match(info.nonce, /^[0-9a-f]{48}$/u)
  assert.equal(database.rows.length, 1)
  assert.deepEqual(database.rows[0].values.slice(1, 7), [
    'session',
    'browser-cookie',
    null,
    'https://cintamani.example',
    info.uri,
    'base-mainnet',
  ])
  assert.equal(database.rows[0].values[0].length, 64)
})

test('official SIWX message is signable by an EOA without disclosing a private key', async () => {
  const account = privateKeyToAccount(`0x${'11'.repeat(32)}`)
  const info = {
    domain: 'cintamani.example',
    uri: 'https://cintamani.example/api/auth/wallet/verify?purpose=session&transport=browser-cookie',
    statement: 'Authenticate to contribute.',
    version: '1',
    nonce: 'fixedtestnonce1234',
    issuedAt: '2026-08-11T18:00:00.000Z',
    expirationTime: '2026-08-11T18:05:00.000Z',
    chainId: 'eip155:8453',
    type: 'eip191',
  }
  const message = createSIWxMessage(info, account.address)
  const signature = await account.signMessage({ message })
  assert.match(message, /cintamani\.example wants you to sign in/u)
  assert.match(signature, /^0x[0-9a-f]{130}$/u)
})

test('verified SIWX issues one bearer session atomically and exposes no internal identity IDs', async (context) => {
  const database = new SQLiteD1(); context.after(() => database.close()); database.migrate(siteRoot)
  const env = environment(database)
  const signed = await signedSession(env, privateKeyToAccount(`0x${'22'.repeat(32)}`))
  const response = await verifySIWxChallenge(signed.request, env)
  assert.equal(response.status, 201)
  const result = await response.json()
  assert.equal(result.transport, 'agent-bearer')
  assert.match(result.bearer_token, /^[A-Za-z0-9_-]{32,}$/u)
  assert.match(result.contributor.public_pseudonym, /^base:[0-9a-f]{12,64}$/u)
  assert.equal(JSON.stringify(result).includes('principal-wallet-'), false)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM public_sessions').get().count, 1)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM siwx_nonces WHERE consumed_at IS NOT NULL').get().count, 1)
})

test('SIWX rejects replay, expiry, and unsigned transport/request changes', async (context) => {
  const database = new SQLiteD1(); context.after(() => database.close()); database.migrate(siteRoot)
  const env = environment(database)
  const account = privateKeyToAccount(`0x${'33'.repeat(32)}`)
  const replay = await signedSession(env, account)
  assert.equal((await verifySIWxChallenge(replay.request.clone(), env)).status, 201)
  await assert.rejects(() => verifySIWxChallenge(replay.request.clone(), env), /unknown or has already been used/u)

  const wrong = await signedSession(env, account)
  const changed = new Request(wrong.challenge.extension.info.uri.replace('agent-bearer', 'browser-cookie'), {
    method: 'POST', headers: wrong.request.headers,
  })
  await assert.rejects(() => verifySIWxChallenge(changed, env), /verification request differs/u)

  const expired = await signedSession(env, account)
  env.TEST_NOW = new Date(Date.parse(env.TEST_NOW) + 6 * 60 * 1000).toISOString()
  await assert.rejects(() => verifySIWxChallenge(expired.request, env), /expired/u)
})

test('concurrent SIWX replay converges to one atomic session', async (context) => {
  const database = new SQLiteD1(); context.after(() => database.close()); database.migrate(siteRoot)
  const env = environment(database)
  const signed = await signedSession(env, privateKeyToAccount(`0x${'44'.repeat(32)}`))
  const results = await Promise.allSettled([
    verifySIWxChallenge(signed.request.clone(), env),
    verifySIWxChallenge(signed.request.clone(), env),
  ])
  assert.deepEqual(results.map((item) => item.status).sort(), ['fulfilled', 'rejected'])
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM public_sessions').get().count, 1)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM contributor_principals').get().count, 1)
})

test('a failed session issuance rolls back identity and nonce consumption together', async (context) => {
  const database = new SQLiteD1(); context.after(() => database.close()); database.migrate(siteRoot)
  const env = environment(database)
  const signed = await signedSession(env, privateKeyToAccount(`0x${'77'.repeat(32)}`))
  database.database.exec(`
    CREATE TRIGGER test_reject_siwx_session
    BEFORE INSERT ON principal_session_events
    BEGIN SELECT RAISE(ABORT, 'test session failure'); END;
  `)
  await assert.rejects(() => verifySIWxChallenge(signed.request, env), /test session failure/u)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM contributor_principals').get().count, 0)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM public_sessions').get().count, 0)
  assert.equal(database.database.prepare('SELECT COUNT(*) count FROM siwx_nonces WHERE consumed_at IS NOT NULL').get().count, 0)
})

test('smart-wallet verifier is invoked and missing explicit RPC binding fails closed', async (context) => {
  const database = new SQLiteD1(); context.after(() => database.close()); database.migrate(siteRoot)
  const env = environment(database)
  let calls = 0
  env.TEST_SIWX_EVM_VERIFIER = async ({ address, signature }) => {
    calls += 1
    assert.match(address, /^0x/u)
    assert.match(signature, /^0x/u)
    return true
  }
  const signed = await signedSession(env, privateKeyToAccount(`0x${'55'.repeat(32)}`))
  assert.equal((await verifySIWxChallenge(signed.request, env)).status, 201)
  assert.equal(calls, 1)

  const absent = await signedSession(env, privateKeyToAccount(`0x${'66'.repeat(32)}`))
  delete env.BASE_SEPOLIA_RPC_URL
  await assert.rejects(() => verifySIWxChallenge(absent.request, env), /explicit HTTPS RPC binding/u)
})
