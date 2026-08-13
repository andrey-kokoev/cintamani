import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { readFrontier, readResearchTopics } from '../scripts/generate-domain-snapshots.mjs'
import {
  buildRevisionPayload,
  criticismFocusOptions,
  detailFormPlaceholders,
} from '../src/scripts/proposal-detail.mjs'
import { detailFieldPlaceholders, focusFirstInvalid } from '../src/scripts/proposal-new.mjs'
import { contributorLabel, samePublicContributor } from '../src/scripts/public-api.mjs'
import { conjectureRelationKinds, researchTopicLoci, researchTopicRelationKinds } from '../src/lib/proposals.mjs'

const testRoot = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(testRoot, '..')
const readJson = (relative) => JSON.parse(readFileSync(resolve(siteRoot, relative), 'utf8'))

test('tracked snapshots preserve the ordered search space and scientific boundary', () => {
  const dimensions = readJson('src/data/dimensions.json')
  assert.deepEqual(
    dimensions.items.map((axis) => [axis.dimension_order, axis.dimension_key, axis.dimension_role]),
    [
      [1, 'theoretical-model', 'original-three-dimensional-axis'],
      [2, 'physical-material', 'original-three-dimensional-axis'],
      [3, 'physical-calculation-mechanism', 'original-three-dimensional-axis'],
      [4, 'observation-interface', 'later-added-fourth-dimension'],
    ],
  )
  for (const axis of dimensions.items) {
    assert.equal(axis.member_count, axis.members.length)
    axis.members.forEach((member, index) => {
      assert.equal(member.member_order, index + 1)
      assert.ok(member.current_assessment_id)
      assert.ok(member.current_assessment_revision)
      assert.ok(member.current_assessment_status)
      assert.ok(member.assessment_rationale)
      assert.ok(member.assessment_scope)
      assert.ok(member.source_admission_id)
    })
  }
  const litao3 = dimensions.items[1].members.find(
    (member) => member.member_id === 'thin-film-litao3-candidate',
  )
  assert.equal(litao3.current_assessment_status, 'unvalidated-candidate')

  const frontier = readJson('src/data/frontier.json')
  assert.equal(frontier.item_count, frontier.items.length)
  assert.equal(frontier.items.filter((item) => item.classification === 'gap').length, 2)
  assert.equal(frontier.items.filter((item) => item.classification === 'admitted-cell').length, 2)
  assert.ok(frontier.items.every((item) => item.coordinate_key && item.validation_generation))

  const summary = readJson('src/data/registry-summary.json')
  assert.equal(summary.snapshot_mode, 'build-time-static')
  assert.equal(summary.mutable_edge_registry, false)
  assert.equal(summary.check_status, 'passed')
  assert.equal(summary.integrity, 'ok')
  assert.ok(Object.values(summary.invariant_counts).every((count) => count === 0))
})

test('research-topic snapshot pagination rejects repeated identities and cursors', () => {
  const pages = [
    { collection: 'research-topics', items: [{ topic_id: 'topic-a' }], next_cursor: 'cursor-a' },
    { collection: 'research-topics', items: [{ topic_id: 'topic-b' }], next_cursor: null },
  ]
  const history = { items: [], next_cursor: null }
  const why = { collection: 'research-topics', provenance: [], bounded_limit: 100 }
  let index = 0
  const items = readResearchTopics((command) => command === 'list' ? pages[index++] : (command === 'history' ? history : why))
  assert.deepEqual(items.map((item) => item.topic_id), ['topic-a', 'topic-b'])

  assert.throws(
    () => {
      let page = 0
      return readResearchTopics((command) => command === 'list'
        ? { collection: 'research-topics', items: [{ topic_id: `topic-${page += 1}` }], next_cursor: 'same' }
        : (command === 'history' ? history : why), { maxPages: 3 })
    },
    /repeated a cursor/u,
  )
})

test('snapshot generator check mode is byte-deterministic and fail-closed', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-domain-snapshots.mjs', '--check'], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /snapshots: verified/)
})

test('frontier pagination rejects repeated coordinates, cursors, and unbounded traversal', () => {
  const item = (suffix) => ({
    coordinate_key: `coordinate-${suffix}`,
    model_id: `model-${suffix}`,
    material_id: 'material',
    mechanism_id: 'mechanism',
    interface_id: 'interface',
  })
  assert.throws(
    () =>
      readFrontier((command, args) => {
        assert.equal(command, 'frontier')
        return args.includes('--cursor')
          ? { collection: 'frontier', items: [item('a')], next_cursor: null }
          : { collection: 'frontier', items: [item('a')], next_cursor: 'cursor-a' }
      }),
    /repeated coordinate/,
  )

  let cursorCall = 0
  assert.throws(
    () =>
      readFrontier(() => {
        cursorCall += 1
        return {
          collection: 'frontier',
          items: [item(cursorCall)],
          next_cursor: 'same-cursor',
        }
      }),
    /repeated a cursor/,
  )

  let boundCall = 0
  assert.throws(
    () =>
      readFrontier(
        () => {
          boundCall += 1
          return {
            collection: 'frontier',
            items: [item(boundCall)],
            next_cursor: `cursor-${boundCall}`,
          }
        },
        { maxPages: 2, maxRows: 10 },
      ),
    /exceeded the 2-page safety bound/,
  )
})

test('Astro page and Worker config state the canonical/public authority boundary', () => {
  const page = readFileSync(resolve(siteRoot, 'src/pages/index.astro'), 'utf8')
  for (const statement of [
    'No LiTaO3 validation.',
    'No physical detector calibration.',
    'No replicated nonlinear computation.',
    'No Conjecture 5 or connected-region claim.',
    'A separate public D1 plane',
    'it cannot mutate the',
  ]) {
    assert.ok(page.includes(statement), `missing UI boundary: ${statement}`)
  }
  const wrangler = readJson('wrangler.jsonc')
  assert.equal(wrangler.name, 'cintamani')
  assert.equal(wrangler.main, 'worker/index.mjs')
  assert.equal(wrangler.assets.directory, './dist')
  assert.equal(wrangler.assets.not_found_handling, '404-page')
  assert.equal(wrangler.assets.binding, 'ASSETS')
  assert.deepEqual(wrangler.assets.run_worker_first, ['/api/*'])
  assert.equal(wrangler.d1_databases[0].binding, 'PROPOSALS_DB')
  assert.equal(wrangler.d1_databases[0].database_name, 'cintamani-public-proposals')
  assert.equal(wrangler.vars.X402_ENABLED, 'false')
  assert.equal(wrangler.vars.X402_MODE, 'testnet')
  assert.equal(wrangler.vars.X402_PRECHALLENGE_IP_LIMIT_PER_HOUR, '30')
  assert.equal(wrangler.vars.X402_PRECHALLENGE_GLOBAL_LIMIT_PER_HOUR, '300')
  assert.equal(wrangler.vars.X402_PAY_TO, undefined)
  for (const secret of ['X402_ENVELOPE_SECRET', 'CDP_API_KEY_ID', 'CDP_API_KEY_SECRET']) {
    assert.equal(wrangler.vars[secret], undefined, `${secret} must not be committed as a Worker var`)
  }
  const astro = readFileSync(resolve(siteRoot, 'astro.config.mjs'), 'utf8')
  assert.match(astro, /output: 'static'/)
  assert.match(astro, /PUBLIC_SITE_URL/)
})

test('the public site presents VRC prominently as the originating open conjecture', () => {
  const home = readFileSync(resolve(siteRoot, 'src/pages/index.astro'), 'utf8')
  const vrc = readFileSync(resolve(siteRoot, 'src/pages/volumetric-recurrent-computing.astro'), 'utf8')
  assert.match(home, /The originating conjecture/u)
  assert.match(home, /Volumetric Recurrent Computing started this search/u)
  assert.match(home, /\/volumetric-recurrent-computing\//u)
  assert.match(vrc, /The conjecture that started this effort/u)
  assert.match(vrc, /fixed configurable nonlinear 3D physical operator/u)
  assert.match(vrc, /first selected simulated regime failed/u)
  assert.match(vrc, /falsified the\s+selected substrate-and-training regime/u)
  assert.doesNotMatch(vrc, /proved|validated architecture|established that VRC works/iu)
})

test('public proposal UI exposes accessible typed, history, criticism, test, and review surfaces without voting', () => {
  const hub = readFileSync(resolve(siteRoot, 'src/pages/proposals/index.astro'), 'utf8')
  const submission = readFileSync(resolve(siteRoot, 'src/pages/proposals/new.astro'), 'utf8')
  const detail = readFileSync(resolve(siteRoot, 'src/pages/proposals/detail.astro'), 'utf8')
  const scripts = [
    readFileSync(resolve(siteRoot, 'src/scripts/proposal-hub.mjs'), 'utf8'),
    readFileSync(resolve(siteRoot, 'src/scripts/proposal-new.mjs'), 'utf8'),
    readFileSync(resolve(siteRoot, 'src/scripts/proposal-detail.mjs'), 'utf8'),
    readFileSync(resolve(siteRoot, 'src/scripts/public-api.mjs'), 'utf8'),
  ].join('\n')
  for (const statement of [
    'submitted · unreviewed',
    'Submit proposal',
    'Search-space overlay',
    'no votes',
  ]) {
    assert.ok(hub.includes(statement), `missing proposal-hub boundary: ${statement}`)
  }
  for (const statement of [
    'Choose the proposal kind',
    'Give it a clear identity',
    'Explain the problem, rationale, and boundary',
    'Add kind-specific detail',
    'Optional evidence and references',
    'View published proposal',
  ]) {
    assert.ok(submission.includes(statement), `missing focused proposal-submission surface: ${statement}`)
  }
  for (const statement of [
    'Public revisions',
    'Criticism and replies',
    'Test reports',
    'Competing interpretations',
    'Moderation history',
    'Audited review',
  ]) {
    assert.ok(detail.includes(statement), `missing proposal-detail surface: ${statement}`)
  }
  assert.match(hub, /<noscript>/)
  assert.match(submission, /<noscript>/)
  assert.match(detail, /<noscript>/)
  assert.doesNotMatch(`${hub}\n${submission}\n${detail}`, /type="(?:button|submit)"[^>]*>[^<]*(?:vote|rank)/iu)
  assert.doesNotMatch(scripts, /\.innerHTML\s*=/u)
  assert.match(scripts, /textContent/u)
  assert.match(detail, /aria-live="polite"/)
  assert.match(detail, /data-operator-panel hidden/u)
  for (const contract of [
    '/withdrawal',
    'data-moderation-form',
    'target_github_login',
    'target_public_pseudonym',
    '/api/admin/appeals/',
    'contributor_locked',
    'moderation-tombstone',
  ]) {
    assert.ok(scripts.includes(contract), `missing practical moderation UI contract: ${contract}`)
  }
  assert.doesNotMatch(scripts, /target_account_id/u)
})

test('header utility has compact stable session states without persistent authentication success styling', () => {
  const component = readFileSync(resolve(siteRoot, 'src/components/HeaderSession.astro'), 'utf8')
  const layout = readFileSync(resolve(siteRoot, 'src/layouts/SiteLayout.astro'), 'utf8')
  const api = readFileSync(resolve(siteRoot, 'src/scripts/public-api.mjs'), 'utf8')
  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')
  const pages = ['index.astro', 'detail.astro', 'new.astro'].map((name) =>
    readFileSync(resolve(siteRoot, `src/pages/proposals/${name}`), 'utf8'),
  )

  assert.match(component, /data-session-checking>/u)
  assert.match(component, /data-session-signed-out[\s\S]*?hidden/u)
  assert.match(component, /data-session-signed-in hidden/u)
  assert.match(component, /data-session-error hidden role="alert"/u)
  assert.match(component, /Checking contributor session…/u)
  assert.match(component, /session-skeleton/u)
  assert.match(component, /class="github-mark"[\s\S]*?aria-hidden="true"/u)
  assert.match(component, /data-operator-state hidden>Operator/u)
  assert.match(component, /data-lock-state hidden>Locked/u)
  assert.match(component, /data-logout>Sign out/u)
  assert.doesNotMatch(component, /GitHub sign-in succeeded|session-state--success/u)
  assert.match(layout, /<HeaderSession \/>/u)
  assert.match(layout, /loadSessionWithStatus\(\)/u)
  for (const page of pages) assert.doesNotMatch(page, /PublicSessionStrip|public-auth-strip/u)
  assert.match(api, /renderContributorSessionError/u)
  assert.ok(api.includes("strip.querySelector('[data-operator-state]').hidden = !session.operator"))
  assert.ok(api.includes("strip.querySelector('[data-lock-state]').hidden = !session.contributor_locked"))
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/su)
  assert.match(css, /\.header-session\s*\{[^}]*width:\s*15rem;/su)
  assert.match(css, /\.header-sign-in \.github-mark\s*\{[^}]*width:\s*15px;[^}]*height:\s*15px;/su)
  assert.doesNotMatch(css, /\.public-auth-strip|\.session-state--success/u)
})

test('wallet contributors have pseudonymous attribution and exact public author matching', () => {
  const wallet = { principal_kind: 'base-wallet', public_pseudonym: 'base:0123456789ab' }
  const otherWallet = { principal_kind: 'base-wallet', public_pseudonym: 'base:abcdef012345' }
  const github = { principal_kind: 'github', github_login: 'andrey-kokoev' }
  assert.equal(contributorLabel(wallet), 'base:0123456789ab')
  assert.equal(contributorLabel(github), '@andrey-kokoev')
  assert.equal(samePublicContributor(wallet, { ...wallet }), true)
  assert.equal(samePublicContributor(wallet, otherWallet), false)
  assert.equal(samePublicContributor(github, { principal_kind: 'github', github_login: 'Andrey-Kokoev' }), true)
  assert.equal(samePublicContributor(wallet, github), false)
})

test('proposal hub visual contract keeps one content CTA, compact hierarchy, and deterministic screenshot readiness', () => {
  const hub = readFileSync(resolve(siteRoot, 'src/pages/proposals/index.astro'), 'utf8')
  const layout = readFileSync(resolve(siteRoot, 'src/layouts/SiteLayout.astro'), 'utf8')
  const controller = readFileSync(resolve(siteRoot, 'src/scripts/proposal-hub.mjs'), 'utf8')
  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')

  assert.equal(hub.match(/data-content-submit/gu)?.length, 1)
  assert.match(hub, /data-content-submit href="\/proposals\/new\/" target="_blank" rel="noopener"/u)
  assert.match(layout, /href="\/proposals\/new\/" target="_blank" rel="noopener">Submit/u)
  assert.doesNotMatch(hub, /Have a proposal\?|proposal-entry-callout|public-auth-strip/u)
  assert.match(hub, /<details>[\s\S]*Registry and admission boundary[\s\S]*<\/details>/u)
  assert.match(hub, /<h2 id="overlay-title">Canonical axes<\/h2>/u)
  assert.match(hub, /<h2 id="public-list-title">Proposals<\/h2>/u)
  assert.match(hub, /class="public-handoff-callout"/u)
  assert.doesNotMatch(hub, /class="snapshot-callout"/u)
  assert.match(controller, /list\.dataset\.settled = 'true'/u)
  assert.match(controller, /delete root\.querySelector\('\[data-proposal-list\]'\)\.dataset\.settled/u)
  assert.match(css, /\.public-hero\s*,[\s\S]*min-height:\s*420px;/u)
  assert.match(css, /\.public-hub-section \.section-heading h2\s*\{[^}]*font-size:\s*clamp\(1\.9rem,/su)
  assert.match(css, /\.empty-public-list\s*\{[^}]*padding:\s*20px;/su)
})

test('proposal hub delegates to a focused new-tab submission page with accessible failure and success behavior', () => {
  const hub = readFileSync(resolve(siteRoot, 'src/pages/proposals/index.astro'), 'utf8')
  const submission = readFileSync(resolve(siteRoot, 'src/pages/proposals/new.astro'), 'utf8')
  const controller = readFileSync(resolve(siteRoot, 'src/scripts/proposal-new.mjs'), 'utf8')
  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')

  assert.doesNotMatch(hub, /<form\b/u)
  assert.doesNotMatch(hub, /data-proposal-form|turnstile-slot/u)
  assert.match(hub, /href="\/proposals\/new\/" target="_blank" rel="noopener"/u)
  assert.match(submission, /<form[^>]*data-proposal-form[^>]*novalidate hidden>/u)
  assert.match(submission, /Publish with GitHub or a wallet/u)
  assert.match(submission, /\$0\.01 USDC/u)
  assert.match(submission, /data-wallet-connect/u)
  assert.match(submission, /data-base-wallet/u)
  assert.match(submission, /raw address is never published/u)
  assert.match(submission, /retry the same record without paying again/u)
  assert.match(submission, /Payment buys publication only/u)
  assert.match(submission, /data-error-summary role="alert" tabindex="-1" hidden/u)
  assert.match(submission, /data-submit-success role="status" tabindex="-1" hidden/u)
  assert.match(submission, /data-view-proposal[^>]*>View published proposal</u)
  assert.match(submission, /<details[^>]*data-optional-support>/u)
  assert.match(submission, /<label for="proposal-kind">/u)
  assert.match(submission, /Required<\/span>/u)
  assert.match(submission, /Optional<\/span>/u)
  assert.match(submission, /form-field-help/u)
  assert.doesNotMatch(submission, /name="detail"|name="json"/iu)

  const orderedSections = ['kind', 'core', 'framing', 'typed'].map((name) =>
    submission.indexOf(`data-form-section="${name}"`),
  )
  assert.ok(orderedSections.every((index) => index >= 0))
  assert.deepEqual([...orderedSections].sort((left, right) => left - right), orderedSections)
  assert.ok(controller.indexOf('if (!session.authenticated)') < controller.indexOf('renderTurnstileSlots(form'))
  assert.match(controller, /button\.disabled = true/u)
  assert.match(controller, /label\.textContent = 'Publishing…'/u)
  assert.match(controller, /success\.focus\(\)/u)
  assert.match(controller, /focusFirstInvalid\(invalid\)/u)
  assert.doesNotMatch(controller, /form\.reset\(\)/u)
  assert.match(controller, /fieldContracts\[kind\]\.map/u)
  assert.match(controller, /parent_proposal/u)
  assert.match(controller, /body\.parent = parent/u)
  for (const kind of [
    'theoretical-model-member',
    'physical-material-member',
    'physical-calculation-mechanism-member',
    'observation-interface-member',
    'existing-member-assessment',
    'existing-member-correction',
    'ontology-change',
  ]) {
    assert.ok(controller.includes(`'${kind}'`), `missing typed browser contract for ${kind}`)
  }
  assert.match(css, /\.proposal-new-shell\s*\{[^}]*width:\s*min\(46rem,/su)
  assert.match(css, /\.proposal-new-form \.typed-detail-fields\s*\{[^}]*grid-template-columns:\s*1fr;/su)

  let focused = false
  focusFirstInvalid([{ control: { focus: () => { focused = true } } }])
  assert.equal(focused, true)
})

test('proposal form follows deployment x402 enablement and does not advertise a missing logo asset', () => {
  const controller = readFileSync(resolve(siteRoot, 'src/scripts/proposal-new.mjs'), 'utf8')
  const wallet = readFileSync(resolve(siteRoot, 'src/scripts/wallet-contribution.mjs'), 'utf8')
  assert.match(controller, /config\.x402\?\.enabled === true/u)
  assert.match(controller, /Wallet publication is not enabled on this deployment; GitHub remains available\./u)
  assert.doesNotMatch(wallet, /favicon\.svg|appLogoUrl/u)
  assert.match(wallet, /preference:\s*\{ telemetry: false \}/u)
})

test('Worker failure logging is metadata-only and cannot serialize request or payment errors', () => {
  const source = readFileSync(resolve(siteRoot, 'worker/index.mjs'), 'utf8')
  assert.match(source, /console\.error\('unhandled request failure', \{ name: safeName \}\)/u)
  assert.doesNotMatch(source, /console\.error\('unhandled request failure', error\)/u)
})

test('public-write examples cover core, every typed family, and exact-revision contribution forms without becoming values', () => {
  const submission = readFileSync(resolve(siteRoot, 'src/pages/proposals/new.astro'), 'utf8')
  const newController = readFileSync(resolve(siteRoot, 'src/scripts/proposal-new.mjs'), 'utf8')
  const detailController = readFileSync(resolve(siteRoot, 'src/scripts/proposal-detail.mjs'), 'utf8')

  for (const [name, example] of Object.entries({
    title: 'e.g., Add normalized phase-sensitive readout as a candidate interface',
    summary: 'e.g., A bounded proposal to represent one normalized field quadrature separately from intensity, without claiming a physical detector implementation.',
    problem: 'e.g., The current coordinate cannot distinguish phase-sensitive observation from intensity-only readout.',
    rationale: 'e.g., Keeping the observation map explicit makes matched tests criticizable and prevents normalized noise from being mistaken for detector calibration.',
    scope: 'e.g., Limited to a normalized observation interface; no material, device, fabrication, nonlinear-target, or connected-region claim.',
  })) {
    assert.match(submission, new RegExp(`name="${name}"[\\s\\S]*?placeholder="${example.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&')}"`, 'u'))
  }
  assert.match(submission, /name="evidence_summary"[\s\S]*?placeholder="e\.g\., Predeclared matched-control protocol/u)
  assert.match(submission, /name="reference_label"[\s\S]*?placeholder="e\.g\., Protocol and raw-artifact manifest"/u)
  assert.match(submission, /name="reference_url"[\s\S]*?placeholder="e\.g\., https:\/\/example\.org\/cintamani\/protocol"/u)
  for (const match of submission.matchAll(/placeholder="([^"]+)"/gu)) {
    assert.match(match[1], /^e\.g\., (?!e\.g\., )/u, `text placeholder must have one exact prefix: ${match[1]}`)
  }

  const expectedKinds = {
    'theoretical-model-member': ['member_id', 'member_name', 'model_definition', 'computational_claim', 'initial_epistemic_status'],
    'physical-material-member': ['member_id', 'member_name', 'material_classification', 'composition_or_structure', 'physical_evidence_boundary', 'initial_epistemic_status'],
    'physical-calculation-mechanism-member': ['member_id', 'member_name', 'physical_process', 'state_or_signal_carrier', 'initial_epistemic_status'],
    'observation-interface-member': ['member_id', 'member_name', 'observation_kind', 'units', 'observation_boundary', 'initial_epistemic_status'],
    'existing-member-assessment': ['target_dimension', 'target_member_id', 'proposed_assessment_status', 'proposed_assessment_detail', 'assessment_rationale', 'assessment_scope'],
    'existing-member-correction': ['target_dimension', 'target_member_id', 'corrected_name', 'corrected_definition', 'corrected_assessment_status', 'corrected_assessment_detail', 'correction_rationale'],
    'ontology-change': ['change_kind', 'target_key', 'proposed_definition', 'compatibility_effect', 'migration_requirements'],
    'explanatory-conjecture': ['problem_statement', 'explanatory_claim', 'essential_mechanism', 'explanation_scope', 'failure_condition', 'assumptions'],
    'research-topic': ['open_problem', 'why_open', 'topic_scope', 'next_discriminating_criticism_or_test', 'non_claims'],
    'proposed-experiment': ['definition_json'],
    'equipment-type-proposal': ['definition_json'],
  }
  assert.deepEqual(Object.keys(detailFieldPlaceholders), Object.keys(expectedKinds))
  for (const [kind, fields] of Object.entries(expectedKinds)) {
    assert.deepEqual(Object.keys(detailFieldPlaceholders[kind]), fields, `${kind} must cover every typed control`)
    for (const [field, example] of Object.entries(detailFieldPlaceholders[kind])) {
      if (field === 'definition_json') {
        assert.ok(example.length > 0 && example.length <= 2000, `${kind} structured examples must stay bounded`)
        assert.doesNotThrow(() => JSON.parse(example), `${kind} structured examples must be valid JSON`)
        continue
      }
      assert.ok(example.length > 0 && example.length <= 180, `${kind} examples must stay bounded`)
      assert.doesNotMatch(example, /[<>]/u, `${kind} examples must remain plain attribute text`)
      if (example.startsWith('Choose ')) {
        assert.doesNotMatch(example, /^e\.g\., /u, `${kind} select prompts are options, not placeholders`)
      } else {
        assert.match(example, /^e\.g\., (?!e\.g\., )/u, `${kind} text placeholders need one exact prefix`)
      }
    }
  }
  assert.equal(detailFieldPlaceholders['theoretical-model-member'].member_id, 'e.g., bounded-delay-state-model')
  assert.equal(detailFieldPlaceholders['physical-material-member'].member_id, 'e.g., normalized-dielectric-medium-candidate')
  assert.equal(detailFieldPlaceholders['physical-calculation-mechanism-member'].member_id, 'e.g., coherent-path-interference')
  assert.equal(detailFieldPlaceholders['observation-interface-member'].units, 'e.g., normalized amplitude')
  assert.equal(detailFieldPlaceholders['existing-member-assessment'].proposed_assessment_status, 'e.g., candidate')
  assert.equal(detailFieldPlaceholders['existing-member-correction'].corrected_assessment_status, 'e.g., candidate')
  assert.equal(detailFieldPlaceholders['ontology-change'].target_key, 'e.g., observation-interface')

  for (const expected of [
    detailFormPlaceholders.revision.scope,
    detailFormPlaceholders.criticism.criticism,
    detailFormPlaceholders.reply,
    detailFormPlaceholders.scoped_test.protocol,
    detailFormPlaceholders.interpretation.interpretation,
    detailFormPlaceholders.appeal,
    detailFormPlaceholders.withdrawal_rationale,
    detailFormPlaceholders.administrative.rationale,
    detailFormPlaceholders.moderation.explanation,
    detailFormPlaceholders.export_scope,
  ]) {
    assert.ok(detailController.includes(expected), `missing exact-revision public-write example: ${expected}`)
    assert.match(expected, /^e\.g\., (?!e\.g\., )/u, `detail placeholder needs one exact prefix: ${expected}`)
  }
  assert.match(detailController, /chooseOption\('Choose relation to the claim…'\)/u)
  assert.doesNotMatch(detailController, /chooseOption\('e\.g\., /u)
  assert.match(newController, /attributes: \{ id, name, type: 'text', placeholder \}/u)
  assert.match(newController, /\.map\(\(control\) => \[control\.name, control\.value\]\)/u)
  assert.doesNotMatch(`${newController}\n${detailController}`, /\.value\s*=\s*[^\n]*placeholder/u)
})

test('research-topic UI contracts expose exact typed classification, focus, and non-epistemic publication boundaries', () => {
  assert.deepEqual(researchTopicLoci, [
    'theoretical', 'simulation', 'physical-material', 'mechanism',
    'observation', 'control-resource', 'experimental', 'ontology',
  ])
  assert.deepEqual(researchTopicRelationKinds, [
    'depends-on', 'rival-to', 'complements', 'refines', 'reclassifies', 'addresses-same-problem',
  ])
  const focus = criticismFocusOptions({
    open_problem: 'A bounded open problem.',
    loci: [{ topic_locus_id: 'locus-one', locus_kind: 'simulation' }],
    origins: [{ topic_origin_id: 'origin-one', origin_order: 1 }],
    framings: [{ framing_id: 'framing-one', framing_order: 1 }],
    topic_relations: [{ topic_relation_id: 'relation-one', relation_kind: 'rival-to' }],
  })
  assert.ok(focus.some((item) => item.value === 'topic-open-problem|'))
  assert.ok(focus.some((item) => item.value === 'topic-locus|locus-one'))
  assert.ok(focus.some((item) => item.value === 'topic-origin|origin-one'))
  assert.ok(focus.some((item) => item.value === 'topic-coordinate-framing|framing-one'))
  assert.ok(focus.some((item) => item.value === 'topic-relation|relation-one'))

  const collection = readFileSync(resolve(siteRoot, 'src/pages/research-topics/index.astro'), 'utf8')
  const detail = readFileSync(resolve(siteRoot, 'src/pages/research-topics/[topic_id].astro'), 'utf8')
  const fixture = readJson('src/data/research-topic-fixture.json')
  assert.match(collection, /not evidence, confidence,[\s\S]*roadmap authority/u)
  assert.match(collection, /data-topic-filters/u)
  assert.match(detail, /History and provenance/u)
  assert.equal(fixture.items.length, 6)
  assert.equal(fixture.canonical_admission, false)
  assert.equal(fixture.public_d1_seed, false)
  assert.ok(fixture.items.every((topic) => topic.coordinate === null))
  assert.match(fixture.sources[0].url, /arxiv\.org\/abs\/2410\.19293/u)
  assert.match(fixture.sources[1].url, /s41567-025-03107-0/u)
})

test('explanatory revision and criticism helpers preserve typed exact-version structure', () => {
  assert.deepEqual(conjectureRelationKinds, [
    'rival-to',
    'reclassifies',
    'equivalent-to',
    'incompatible-with',
    'supersedes',
    'addresses-same-problem',
  ])
  const ordinaryFocus = criticismFocusOptions({ member_id: 'model-a' })
  assert.deepEqual(ordinaryFocus.map((item) => item.value), ['whole-proposal|', 'other-explicit|'])

  const explanatory = {
    problem_statement: 'Why is the local readout difference present?',
    explanatory_claim: 'A bounded phase transformation carries the relevant history.',
    essential_mechanism: 'Phase mixing before the declared observation boundary.',
    explanation_scope: 'One normalized target family.',
    failure_condition: 'The matched control removes the predeclared advantage.',
    assumptions: [{ assumption_id: 'assumption-a', assumption_order: 1, assumption_text: 'The observable is stable.' }],
    framings: [{
      framing_id: 'framing-a',
      framing_order: 1,
      coordinate_key: 'coordinate-a',
      validation_generation: 'generation-a',
      framing_rationale: 'A conjectural frame only.',
      model_id: 'ignored-derived-model',
    }],
    relations: [{
      relation_id: 'relation-a',
      relation_kind: 'rival-to',
      target_proposal_id: 'proposal-a',
      target_revision: 1,
      relation_claim: 'The mechanisms differ.',
      relation_scope: 'These exact revisions.',
      recorded_at: 'ignored-derived-time',
    }],
  }
  const focus = criticismFocusOptions(explanatory)
  assert.ok(focus.some((item) => item.value === 'problem-statement|'))
  assert.ok(focus.some((item) => item.value === 'assumption|assumption-a'))
  assert.ok(focus.some((item) => item.value === 'coordinate-framing|framing-a'))
  assert.ok(focus.some((item) => item.value === 'conjecture-relation|relation-a'))

  const values = new FormData()
  values.set('title', 'Revision title')
  values.set('summary', 'Revision summary')
  values.set('rationale', 'Revision rationale')
  values.set('scope', 'Revision scope')
  values.set('detail_json', JSON.stringify(explanatory))
  const payload = buildRevisionPayload('explanatory-conjecture', values)
  assert.equal(payload.detail.problem_statement, explanatory.problem_statement)
  assert.equal('assumptions' in payload.detail, false)
  assert.deepEqual(payload.assumptions, ['The observable is stable.'])
  assert.deepEqual(payload.framings, [{
    coordinate_key: 'coordinate-a',
    validation_generation: 'generation-a',
    framing_rationale: 'A conjectural frame only.',
  }])
  assert.deepEqual(payload.relations, [{
    relation_kind: 'rival-to',
    target_proposal_id: 'proposal-a',
    target_revision: 1,
    relation_claim: 'The mechanisms differ.',
    relation_scope: 'These exact revisions.',
  }])
})

test('Narada ochre primary and semantic colors retain readable contrast', () => {
  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = (hex) => {
    const bytes = hex
      .slice(1)
      .match(/../g)
      .map((part) => Number.parseInt(part, 16))
    return 0.2126 * channel(bytes[0]) + 0.7152 * channel(bytes[1]) + 0.0722 * channel(bytes[2])
  }
  const contrast = (left, right) => {
    const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  }
  const pairs = [
    ['#ffae62', '#071117', 'ochre text on page ground'],
    ['#2b1606', '#ffae62', 'CTA foreground on ochre'],
    ['#72d6aa', '#071117', 'passed status on page ground'],
    ['#b4c4c6', '#1c3034', 'neutral status on its soft surface'],
    ['#dda5c2', '#3d2734', 'gap status on its soft surface'],
    ['#a9bfe4', '#1c283c', 'later-axis label on its panel'],
    ['#9db2b3', '#071117', 'body-muted copy on page ground'],
    ['#6f8387', '#091920', 'example placeholder on standard form control'],
    ['#6f8387', '#091820', 'example placeholder on dedicated proposal form control'],
  ]
  for (const [foreground, background, label] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} must meet WCAG AA`)
  }

  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')
  assert.equal(contrast('#6f8387', '#091920').toFixed(3), '4.500')
  assert.equal(contrast('#6f8387', '#091820').toFixed(3), '4.533')
  assert.match(css, /--placeholder: #6f8387/)
  assert.match(css, /--ochre: #ffae62/)
  assert.doesNotMatch(css, /mint|#68e0c3|rgb\(104 224 195/)
  assert.match(css, /outline: 2px solid var\(--ochre\)/)
})
