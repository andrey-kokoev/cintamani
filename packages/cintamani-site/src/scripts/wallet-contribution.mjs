import { createSIWxPayload, encodeSIWxHeader } from '@x402/extensions/sign-in-with-x'
import { x402Client, wrapFetchWithPayment } from '@x402/fetch'
import { registerExactEvmScheme } from '@x402/evm/exact/client'
import { createWalletClient, custom } from 'viem'
import { base, baseSepolia } from 'viem/chains'

const providers = new Map()
let discoveryStarted = false

function beginDiscovery() {
  if (discoveryStarted || typeof window === 'undefined') return
  discoveryStarted = true
  window.addEventListener('eip6963:announceProvider', (event) => {
    const detail = event.detail
    if (detail?.info?.uuid && detail.provider?.request) providers.set(detail.info.uuid, detail)
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  if (window.ethereum?.request) {
    providers.set('legacy-injected', {
      info: { uuid: 'legacy-injected', name: 'Browser wallet', icon: '', rdns: 'injected' },
      provider: window.ethereum,
    })
  }
}

export function discoverWallets(waitMs = 250) {
  beginDiscovery()
  return new Promise((resolve) => window.setTimeout(() => resolve([...providers.values()]), waitMs))
}

export async function baseSmartWalletProvider() {
  const { createBaseAccountSDK } = await import('@base-org/account')
  return createBaseAccountSDK({
    appName: 'Cintamani',
    appChainIds: [8453, 84532],
    preference: { telemetry: false },
  }).getProvider()
}

export async function connectWallet(provider, chainId = 'eip155:8453') {
  const numericChain = Number(chainId.split(':')[1])
  const [address] = await provider.request({ method: 'eth_requestAccounts' })
  const current = await provider.request({ method: 'eth_chainId' })
  if (Number.parseInt(current, 16) !== numericChain) {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${numericChain.toString(16)}` }] })
  }
  const chain = numericChain === 84532 ? baseSepolia : base
  const walletClient = createWalletClient({ account: address, chain, transport: custom(provider) })
  return { address, chain, provider, walletClient }
}

export async function authenticateWallet(connection, { purpose = 'session', transport = 'browser-cookie', csrfToken = null } = {}) {
  const challengeMethod = purpose === 'session' ? 'GET' : 'POST'
  const challengeResponse = await fetch(`/api/auth/wallet/challenge?purpose=${encodeURIComponent(purpose)}&transport=${encodeURIComponent(transport)}`, {
    method: challengeMethod,
    credentials: 'same-origin',
    headers: purpose === 'session' ? {} : { 'x-csrf-token': csrfToken ?? '' },
  })
  const challenge = await challengeResponse.json()
  if (!challengeResponse.ok) throw new Error(challenge.error?.message ?? 'Wallet challenge could not be created.')
  const extension = challenge.extension
  const selected = extension.supportedChains.find((entry) => entry.chainId === challenge.chain_id)
  if (!selected) throw new Error('The connected wallet network is not accepted.')
  const payload = await createSIWxPayload({ ...extension.info, ...selected }, connection.walletClient)
  const response = await fetch(extension.info.uri, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'sign-in-with-x': encodeSIWxHeader(payload),
      ...(purpose === 'session' ? {} : { 'x-csrf-token': csrfToken ?? '' }),
    },
  })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error?.message ?? 'Wallet signature was not accepted.')
  return body
}

export function paymentFetch(connection) {
  const client = new x402Client()
  registerExactEvmScheme(client, {
    signer: connection.walletClient,
    networks: [`eip155:${connection.chain.id}`],
  })
  return wrapFetchWithPayment(fetch, client)
}

const pendingPaymentKey = 'cintamani:x402:pending-proposal:v1'

function paymentStorage(storage) {
  return storage ?? globalThis.sessionStorage
}

export function pendingPaidProposal(body, storage) {
  const target = paymentStorage(storage)
  const serializedBody = JSON.stringify(body)
  const saved = target.getItem(pendingPaymentKey)
  if (saved) {
    const pending = JSON.parse(saved)
    if (pending.serializedBody !== serializedBody) {
      throw new Error('A paid proposal is already pending. Restore its original content or clear it only after a safe terminal rejection.')
    }
    return pending
  }
  const pending = { idempotencyKey: crypto.randomUUID(), serializedBody, retryReference: null }
  target.setItem(pendingPaymentKey, JSON.stringify(pending))
  return pending
}

export function clearPendingPaidProposal(storage) {
  paymentStorage(storage).removeItem(pendingPaymentKey)
}

export async function publishPaidProposal(connection, body, { storage, fetchImpl = fetch, paidFetch } = {}) {
  const target = paymentStorage(storage)
  const pending = pendingPaidProposal(body, target)
  const requestFetch = pending.retryReference ? fetchImpl : (paidFetch ?? paymentFetch(connection))
  const path = pending.retryReference
    ? `/api/x402/proposals/retry/${encodeURIComponent(pending.retryReference)}`
    : '/api/x402/proposals'
  const response = await requestFetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'idempotency-key': pending.idempotencyKey },
    body: pending.serializedBody,
  })
  const result = await response.json()
  if (!response.ok) {
    if (response.status === 503 && result.retry_reference) {
      pending.retryReference = result.retry_reference
      target.setItem(pendingPaymentKey, JSON.stringify(pending))
    }
    if (
      (response.status === 409 && ['payment_attempt_terminal', 'payment_attempt_expired'].includes(result.error?.code)) ||
      (response.status === 402 && result.error?.code === 'settlement_rejected')
    ) {
      clearPendingPaidProposal(target)
    }
    const error = new Error(result.error?.message ?? `Paid publication failed (${response.status}).`)
    error.code = result.error?.code
    error.details = result.error?.details
    error.retryReference = pending.retryReference
    error.retryWithoutPayment = Boolean(pending.retryReference)
    throw error
  }
  clearPendingPaidProposal(target)
  return result
}
