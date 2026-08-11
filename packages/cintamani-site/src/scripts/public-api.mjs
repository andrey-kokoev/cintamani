export function element(tagName, options = {}) {
  const node = document.createElement(tagName)
  if (options.className) node.className = options.className
  if (options.text !== undefined) node.textContent = String(options.text)
  if (options.attributes) {
    for (const [name, value] of Object.entries(options.attributes)) {
      if (value !== null && value !== undefined) node.setAttribute(name, String(value))
    }
  }
  return node
}

export async function readJson(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options })
  const body = await response.json()
  if (!response.ok) {
    const error = new Error(body.error?.message ?? `Request failed (${response.status})`)
    error.code = body.error?.code
    error.details = body.error?.details
    throw error
  }
  return body
}

export async function loadSession() {
  return readJson('/api/session')
}

let sessionRequest

function requestSession() {
  sessionRequest ??= loadSession()
  return sessionRequest
}

function sessionStrip(root) {
  return root.querySelector?.('[data-session-strip]') ?? null
}

function showOnlySessionState(strip, active) {
  for (const state of strip.querySelectorAll('[data-session-checking], [data-session-signed-out], [data-session-signed-in], [data-session-error]')) {
    state.hidden = state !== active
  }
}

function currentReturnTo() {
  const path = globalThis.location?.pathname ?? '/proposals/'
  const search = globalThis.location?.search ?? ''
  return `${path}${search}`
}

export function renderContributorSession(root, session) {
  const strip = sessionStrip(root)
  if (!strip) return
  const signedOut = strip.querySelector('[data-session-signed-out]')
  const signedIn = strip.querySelector('[data-session-signed-in]')
  for (const link of strip.querySelectorAll('[data-sign-in]')) {
    link.href = `/api/auth/github/start?return_to=${encodeURIComponent(currentReturnTo())}`
  }
  if (!session.authenticated) {
    showOnlySessionState(strip, signedOut)
    return
  }
  strip.querySelector('[data-login-name]').textContent = `@${session.contributor.github_login}`
  strip.querySelector('[data-operator-state]').hidden = !session.operator
  strip.querySelector('[data-lock-state]').hidden = !session.contributor_locked
  showOnlySessionState(strip, signedIn)
}

export function renderContributorSessionError(root, error) {
  const strip = sessionStrip(root)
  if (!strip) return
  const errorState = strip.querySelector('[data-session-error]')
  errorState.querySelector('[data-session-error-message]').textContent =
    error?.message ?? 'The session endpoint did not respond.'
  showOnlySessionState(strip, errorState)
}

export async function loadSessionWithStatus(root = document) {
  const strip = sessionStrip(root)
  for (const link of strip?.querySelectorAll('[data-sign-in]') ?? []) {
    link.href = `/api/auth/github/start?return_to=${encodeURIComponent(currentReturnTo())}`
  }
  try {
    const session = await requestSession()
    renderContributorSession(root, session)
    const logout = strip?.querySelector('[data-logout]')
    if (logout && !logout.dataset.sessionBound) {
      logout.dataset.sessionBound = 'true'
      logout.addEventListener('click', async () => {
        logout.disabled = true
        try {
          await writeJson('/api/session/logout', {}, session)
          globalThis.location?.reload()
        } catch (error) {
          logout.disabled = false
          renderContributorSessionError(root, error)
        }
      })
    }
    return session
  } catch (error) {
    renderContributorSessionError(root, error)
    return {
      authenticated: false,
      contributor_locked: false,
      operator: false,
      session_unavailable: true,
    }
  }
}

export async function writeJson(path, body, session) {
  if (!session?.authenticated) throw new Error('Sign in with GitHub before publishing.')
  return readJson(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': session.csrf_token,
      'idempotency-key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  })
}

export function announce(node, message, kind = 'neutral') {
  node.textContent = message
  node.dataset.kind = kind
  node.hidden = false
}

export function turnstileToken(form) {
  const token = form.querySelector('[name="cf-turnstile-response"]')?.value
  if (!token) throw new Error('Complete the Turnstile check before publishing.')
  return token
}

export function renderTurnstileSlots(root, siteKey) {
  if (!siteKey) {
    for (const slot of root.querySelectorAll('.turnstile-slot')) {
      slot.textContent = 'Turnstile is not provisioned; public writes remain closed.'
      slot.classList.add('form-warning')
    }
    return
  }
  let attempts = 0
  const render = () => {
    attempts += 1
    if (window.turnstile) {
      for (const slot of root.querySelectorAll('.turnstile-slot:not([data-rendered])')) {
        window.turnstile.render(slot, { sitekey: siteKey, theme: 'dark', appearance: 'interaction-only' })
        slot.dataset.rendered = 'true'
      }
      return
    }
    if (attempts < 40) window.setTimeout(render, 100)
  }
  render()
}

export function publicAuthor(record) {
  const link = element('a', {
    text: `@${record.github_login}`,
    attributes: { href: record.github_profile_url, rel: 'noreferrer', target: '_blank' },
  })
  return link
}