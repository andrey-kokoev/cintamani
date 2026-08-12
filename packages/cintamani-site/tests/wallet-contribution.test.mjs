import assert from 'node:assert/strict'
import test from 'node:test'
import {
  pendingPaidProposal,
  publishPaidProposal,
} from '../src/scripts/wallet-contribution.mjs'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

test('paid browser retry preserves exact body/key and never invokes payment wrapper after a retry reference', async () => {
  const storage = memoryStorage()
  const body = { kind: 'theoretical-model-member', title: 'Stable paid body' }
  const paidRequests = []
  const retryRequests = []
  const paidFetch = async (path, options) => {
    paidRequests.push({ path, options })
    return Response.json({ error: { code: 'settled_finalization_pending', message: 'Retry.' }, retry_reference: 'x402-retry-opaque' }, { status: 503 })
  }
  await assert.rejects(
    publishPaidProposal({}, body, { storage, paidFetch, fetchImpl: async () => assert.fail('ordinary fetch must not run first') }),
    (error) => error.retryWithoutPayment === true,
  )
  const first = paidRequests[0]
  await publishPaidProposal({}, body, {
    storage,
    paidFetch: async () => assert.fail('payment wrapper must not run during recovery'),
    fetchImpl: async (path, options) => {
      retryRequests.push({ path, options })
      return Response.json({ proposal_id: 'proposal-recovered' })
    },
  })
  assert.equal(retryRequests[0].path, '/api/x402/proposals/retry/x402-retry-opaque')
  assert.equal(retryRequests[0].options.body, first.options.body)
  assert.equal(retryRequests[0].options.headers['idempotency-key'], first.options.headers['idempotency-key'])
  assert.equal(storage.getItem('cintamani:x402:pending-proposal:v1'), null)
})

test('pending paid proposal survives reload-like reuse and blocks content drift', () => {
  const storage = memoryStorage()
  const original = { title: 'Exact original' }
  const first = pendingPaidProposal(original, storage)
  const restored = pendingPaidProposal({ title: 'Exact original' }, storage)
  assert.deepEqual(restored, first)
  assert.throws(
    () => pendingPaidProposal({ title: 'Changed content' }, storage),
    /already pending/u,
  )
})

test('definitive terminal response clears pending state so a new attempt is possible', async () => {
  const storage = memoryStorage()
  const body = { title: 'Terminal attempt' }
  await assert.rejects(publishPaidProposal({}, body, {
    storage,
    paidFetch: async () => Response.json({
      error: { code: 'payment_attempt_terminal', message: 'Use a new attempt.' },
    }, { status: 409 }),
  }))
  assert.equal(storage.getItem('cintamani:x402:pending-proposal:v1'), null)
  assert.doesNotThrow(() => pendingPaidProposal({ title: 'Corrected attempt' }, storage))
})

test('definitive post-payment rejection clears the pending browser attempt immediately', async () => {
  const storage = memoryStorage()
  await assert.rejects(publishPaidProposal({}, { title: 'Rejected settlement' }, {
    storage,
    paidFetch: async () => Response.json({
      error: { code: 'settlement_rejected', message: 'Rejected.' },
    }, { status: 402 }),
  }))
  assert.equal(storage.getItem('cintamani:x402:pending-proposal:v1'), null)
})

test('expired attempt clears pending browser state for a new idempotency key', async () => {
  const storage = memoryStorage()
  await assert.rejects(publishPaidProposal({}, { title: 'Expired attempt' }, {
    storage,
    paidFetch: async () => Response.json({
      error: { code: 'payment_attempt_expired', message: 'Expired.' },
    }, { status: 409 }),
  }))
  assert.equal(storage.getItem('cintamani:x402:pending-proposal:v1'), null)
})
