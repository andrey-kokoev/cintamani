import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

const viewport = Object.freeze({ width: 1440, height: 1000 })
const screenshotRoot = resolve('output/ux-audit')
const proposalKinds = [
  'theoretical-model-member',
  'physical-material-member',
  'physical-calculation-mechanism-member',
  'observation-interface-member',
  'existing-member-assessment',
  'existing-member-correction',
  'ontology-change',
]

async function mockSession(context, session) {
  await context.route('**/api/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    }),
  )
}

async function mockPublicReads(context, kinds = []) {
  const dimensions = JSON.parse(await readFile(resolve('src/data/dimensions.json'), 'utf8'))
  await context.route('**/api/config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ dimensions: dimensions.items, proposal_kinds: kinds, turnstile_site_key: null }),
    }),
  )
  await context.route(/\/api\/proposals(?:\?.*)?$/u, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], next_cursor: null }),
    }),
  )
  await context.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: 'globalThis.turnstile = undefined' }),
  )
}

async function waitForScreenshotReadiness(page) {
  await expect(page.locator('.overlay-axis')).toHaveCount(4)
  await expect(page.locator('[data-proposal-list]')).toHaveAttribute('data-settled', 'true')
  await page.evaluate(() => document.fonts.ready)
}

async function captureFullPage(page, filename) {
  await waitForScreenshotReadiness(page)
  await page.screenshot({
    path: resolve(screenshotRoot, filename),
    fullPage: true,
    animations: 'disabled',
  })
}

async function openHub(browser, baseURL, session) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' })
  await mockSession(context, session)
  await mockPublicReads(context)
  const page = await context.newPage()
  await page.goto(`${baseURL}/proposals/`, { waitUntil: 'networkidle' })
  return { context, page }
}

test('proposal hub is screenshot-ready and stable across signed-out and mocked signed-in header states', async ({
  browser,
}, testInfo) => {
  await mkdir(screenshotRoot, { recursive: true })
  const baseURL = testInfo.project.use.baseURL
  const signedOut = await openHub(browser, baseURL, {
    authenticated: false,
    operator: false,
    contributor_locked: false,
  })

  await expect(signedOut.page.locator('.public-auth-strip')).toHaveCount(0)
  await expect(signedOut.page.locator('[data-content-submit]')).toHaveCount(1)
  await expect(signedOut.page.locator('[data-session-signed-out]')).toBeVisible()
  await expect(signedOut.page.locator('[data-session-signed-in]')).toBeHidden()
  await expect(signedOut.page.getByText('Have a proposal?')).toHaveCount(0)
  const h1Size = await signedOut.page.locator('.public-hero h1').evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize),
  )
  const h2Size = await signedOut.page.locator('#overlay-title').evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize),
  )
  expect(h2Size).toBeLessThanOrEqual(45)
  expect(h1Size).toBeGreaterThan(h2Size)
  const signedOutUtility = await signedOut.page.locator('[data-session-strip]').boundingBox()
  const signedOutHeader = await signedOut.page.locator('.site-header').boundingBox()
  await captureFullPage(signedOut.page, 'proposals-signed-out.png')

  const signedIn = await openHub(browser, baseURL, {
    authenticated: true,
    contributor: {
      github_login: 'andrey-kokoev',
      github_profile_url: 'https://github.com/andrey-kokoev',
      avatar_url: null,
    },
    operator: true,
    contributor_locked: false,
    csrf_token: 'deterministic-visual-audit-token',
  })
  await expect(signedIn.page.locator('[data-session-signed-out]')).toBeHidden()
  await expect(signedIn.page.locator('[data-session-signed-in]')).toBeVisible()
  await expect(signedIn.page.locator('[data-login-name]')).toHaveText('@andrey-kokoev')
  await expect(signedIn.page.locator('[data-operator-state]')).toBeVisible()
  await expect(signedIn.page.locator('[data-lock-state]')).toBeHidden()
  await expect(signedIn.page.getByText('GitHub sign-in succeeded')).toHaveCount(0)
  const signedInUtility = await signedIn.page.locator('[data-session-strip]').boundingBox()
  const signedInHeader = await signedIn.page.locator('.site-header').boundingBox()
  expect(signedInUtility?.width).toBe(signedOutUtility?.width)
  expect(signedInHeader?.height).toBe(signedOutHeader?.height)
  await captureFullPage(signedIn.page, 'proposals-signed-in-mocked.png')

  await signedOut.context.close()
  await signedIn.context.close()
})

test('dedicated proposal form exposes bounded examples for core and all seven typed families without prefilling values', async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' })
  await mockSession(context, {
    authenticated: true,
    contributor: {
      github_login: 'andrey-kokoev',
      github_profile_url: 'https://github.com/andrey-kokoev',
      avatar_url: null,
    },
    operator: false,
    contributor_locked: false,
    csrf_token: 'deterministic-placeholder-audit-token',
  })
  await mockPublicReads(context, proposalKinds)
  const page = await context.newPage()
  await page.goto(`${testInfo.project.use.baseURL}/proposals/new/`, { waitUntil: 'networkidle' })
  await expect(page.locator('[data-proposal-form]')).toBeVisible()

  const core = {
    title: 'e.g., Add normalized phase-sensitive readout as a candidate interface',
    summary: 'e.g., A bounded proposal to represent one normalized field quadrature separately from intensity, without claiming a physical detector implementation.',
    problem: 'e.g., The current coordinate cannot distinguish phase-sensitive observation from intensity-only readout.',
    rationale: 'e.g., Keeping the observation map explicit makes matched tests criticizable and prevents normalized noise from being mistaken for detector calibration.',
    scope: 'e.g., Limited to a normalized observation interface; no material, device, fabrication, nonlinear-target, or connected-region claim.',
  }
  for (const [name, example] of Object.entries(core)) {
    const control = page.locator(`[name="${name}"]`)
    await expect(control).toHaveAttribute('placeholder', example)
    await expect(control).toHaveValue('')
  }

  const typedFamilies = {
    'theoretical-model-member': { count: 5, name: 'member_id', example: 'e.g., bounded-delay-state-model' },
    'physical-material-member': { count: 6, name: 'composition_or_structure', example: 'e.g., A bounded anisotropic dielectric model with normalized coefficients; no fabrication stack is claimed.' },
    'physical-calculation-mechanism-member': { count: 5, name: 'physical_process', example: 'e.g., Phase-coherent paths recombine so relative phase changes the normalized output amplitude.' },
    'observation-interface-member': { count: 6, name: 'observation_boundary', example: 'e.g., Additive observation noise is applied after state evolution; no photodiode model or detector calibration is assumed.' },
    'existing-member-assessment': { count: 6, name: 'assessment_rationale', example: 'e.g., The current record identifies a bounded candidate but does not establish a fabricated implementation.' },
    'existing-member-correction': { count: 7, name: 'correction_rationale', example: 'e.g., The existing wording conflates normalized observation noise with calibrated detector noise.' },
    'ontology-change': { count: 5, name: 'proposed_definition', example: 'e.g., Observation interface denotes the declared map from modeled state to reported observable, separate from physical detector implementation.' },
  }
  for (const [kind, contract] of Object.entries(typedFamilies)) {
    await page.locator('#proposal-kind').selectOption(kind)
    const controls = page.locator('[data-detail]')
    await expect(controls).toHaveCount(contract.count)
    await expect(page.locator(`[name="${contract.name}"]`)).toHaveAttribute('placeholder', contract.example)
    const missingExamples = await controls.evaluateAll((nodes) => nodes.filter((node) => {
      if (node instanceof HTMLSelectElement) {
        const first = node.options[0]
        return !first || first.value !== '' || !first.disabled || !first.textContent.startsWith('Choose ') || first.textContent.startsWith('e.g., ')
      }
      const placeholder = node.getAttribute('placeholder') ?? ''
      return !placeholder.startsWith('e.g., ') || placeholder.startsWith('e.g., e.g., ')
    }).length)
    expect(missingExamples).toBe(0)
    const submittedValues = await page.locator('[data-proposal-form]').evaluate((form) =>
      [...new FormData(form).values()].map(String),
    )
    expect(submittedValues).not.toContain(contract.example)
  }

  await expect(page.locator('[name="reference_label"]')).toHaveAttribute('placeholder', 'e.g., Protocol and raw-artifact manifest')
  await expect(page.locator('[name="reference_url"]')).toHaveAttribute('placeholder', 'e.g., https://example.org/cintamani/protocol')
  await context.close()
})
