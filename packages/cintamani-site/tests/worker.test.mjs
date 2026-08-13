import assert from 'node:assert/strict'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import worker from '../worker/index.mjs'
import { canonicalize, isCurrentAuthorPrincipal } from '../worker/repository.mjs'
import { csrfForSession, sha256Hex } from '../worker/security.mjs'
import { SQLiteD1 } from './helpers/sqlite-d1.mjs'

const testRoot = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(testRoot, '..')
const origin = 'https://cintamani.test'

function baseEnvironment(database) {
  return {
    PROPOSALS_DB: database,
    ASSETS: { fetch: async () => new Response('<!doctype html><title>Cintamani</title>', { headers: { 'content-type': 'text/html' } }) },
    ENVIRONMENT: 'test',
    TEST_NOW: '2026-08-11T18:00:00.000Z',
    TURNSTILE_TEST_BYPASS: 'enabled-for-local-tests',
    PUBLIC_WRITE_LIMIT_PER_HOUR: '100',
    OAUTH_STATE_SECRET: 'oauth-state-secret-is-distinct-0001',
    CSRF_SECRET: 'csrf-secret-is-distinct-from-state-0002',
    IP_HASH_SECRET: 'ip-hash-secret-never-stores-raw-address',
    IDENTITY_HMAC_SECRET: 'github-identity-secret-is-private-0003',
    GITHUB_CLIENT_ID: 'github-client-id-test',
    GITHUB_CLIENT_SECRET: 'github-client-secret-for-tests-0004',
    TURNSTILE_SECRET_KEY: 'turnstile-secret-for-tests-0005',
    TURNSTILE_SITE_KEY: 'turnstile-public-test-key',
  }
}

async function addActor(database, env, login, { operator = false } = {}) {
  const token = `session-token-${login}-with-enough-randomness`
  const accountId = `account-${login}`
  const csrf = await csrfForSession(env, token)
  const identity = await sha256Hex(`identity:${login}`)
  database.database
    .prepare(
      `INSERT INTO public_accounts (
        account_id, github_identity_hmac_sha256, github_login,
        github_profile_url, github_avatar_url, created_at, last_authenticated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(accountId, identity, login, `https://github.com/${login}`, env.TEST_NOW, env.TEST_NOW)
  const sessionHash = await sha256Hex(token)
  database.database
    .prepare(
      `INSERT INTO public_sessions (
        session_token_sha256, csrf_token_sha256, account_id, created_at,
        expires_at, revoked_at, rotated_to_sha256
      ) VALUES (?, ?, ?, ?, '2026-08-18T18:00:00.000Z', NULL, NULL)`,
    )
    .run(sessionHash, await sha256Hex(csrf), accountId, env.TEST_NOW)
  database.database
    .prepare(
      `INSERT INTO principal_session_events (
        session_token_sha256, event_sequence, session_event_id, principal_id,
        event_kind, rotated_to_sha256, rationale, source_timestamp, recorded_at
      ) VALUES (?, 1, ?, ?, 'issued', NULL, 'Issued by test harness', ?, ?)`,
    )
    .run(sessionHash, `session-event-${login}-1`, accountId, env.TEST_NOW, env.TEST_NOW)
  if (operator) {
    database.database
      .prepare(
        `INSERT INTO account_role_events (
          role_event_id, account_id, role, action_kind, actor_account_id,
          authority_kind, authority_ref, rationale, source_timestamp, recorded_at
        ) VALUES (?, ?, 'operator', 'granted', NULL, 'deployment-bootstrap', ?,
                  'Initial test operator', ?, ?)`,
      )
      .run(`role-event-bootstrap-${login}`, accountId, `test-bootstrap:${login}`, env.TEST_NOW, env.TEST_NOW)
  }
  return { accountId, login, token, csrf }
}

async function harness() {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  const env = baseEnvironment(database)
  const author = await addActor(database, env, 'author')
  const operator = await addActor(database, env, 'operator', { operator: true })
  const outsider = await addActor(database, env, 'outsider')
  let keySequence = 0
  const call = async (
    path,
    { method = 'GET', body = undefined, actor = undefined, key = undefined, headers = {}, requestOrigin = origin } = {},
  ) => {
    const requestHeaders = new Headers()
    if (body !== undefined) {
      requestHeaders.set('content-type', 'application/json')
      requestHeaders.set('origin', requestOrigin)
      requestHeaders.set('idempotency-key', key ?? `idempotency-${(keySequence += 1).toString().padStart(4, '0')}`)
      requestHeaders.set('cf-connecting-ip', '203.0.113.9')
    }
    if (actor) {
      requestHeaders.set('cookie', `__Host-cintamani_session=${actor.token}`)
      requestHeaders.set('x-csrf-token', actor.csrf)
    }
    new Headers(headers).forEach((value, name) => requestHeaders.set(name, value))
    return worker.fetch(
      new Request(`${origin}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
    )
  }
  return { database, env, author, operator, outsider, call }
}

function detail(kind, suffix = 'candidate') {
  switch (kind) {
    case 'theoretical-model-member':
      return {
        member_id: `model-${suffix}`,
        member_name: 'Candidate theoretical model',
        model_definition: 'A bounded formal state-transition model.',
        computational_claim: 'This proposes a testable finite input-output relation.',
        initial_epistemic_status: 'candidate',
      }
    case 'physical-material-member':
      return {
        member_id: `material-${suffix}`,
        member_name: 'Candidate physical material',
        material_classification: 'candidate-physical-material',
        composition_or_structure: 'A declared composition requiring measurement.',
        physical_evidence_boundary: 'No device validation or physical calibration is claimed.',
        initial_epistemic_status: 'unvalidated-candidate',
      }
    case 'physical-calculation-mechanism-member':
      return {
        member_id: `mechanism-${suffix}`,
        member_name: 'Candidate physical mechanism',
        physical_process: 'A proposed phase-dependent transformation.',
        state_or_signal_carrier: 'A bounded field amplitude.',
        initial_epistemic_status: 'candidate',
      }
    case 'observation-interface-member':
      return {
        member_id: `interface-${suffix}`,
        member_name: 'Candidate observation interface',
        observation_kind: 'coherent-quadrature',
        units: 'normalized',
        observation_boundary: 'Noise is applied only after state evolution.',
        initial_epistemic_status: 'candidate',
      }
    case 'existing-member-assessment':
      return {
        target_dimension: 'physical-material',
        target_member_id: 'thin-film-litao3-candidate',
        proposed_assessment_status: 'unvalidated-candidate',
        proposed_assessment_detail: 'Still not material-instantiated.',
        assessment_rationale: 'The cited evidence remains a normalized model result.',
        assessment_scope: 'This registry member and no physical device.',
      }
    case 'existing-member-correction':
      return {
        target_dimension: 'physical-material',
        target_member_id: 'thin-film-litao3-candidate',
        corrected_definition: 'A corrected, explicitly unvalidated candidate definition.',
        correction_rationale: 'The prior wording could be read too strongly.',
      }
    case 'ontology-change':
      return {
        change_kind: 'revise-relation',
        target_key: 'morphism',
        proposed_definition: 'A typed relation with explicit compatible endpoints.',
        compatibility_effect: 'Existing paths require review; no silent migration.',
        migration_requirements: 'A maintainer-authored schema migration would be required.',
      }
    case 'explanatory-conjecture':
      return {
        problem_statement: 'Why does a bounded phase-sensitive readout retain local linear memory?',
        explanatory_claim: 'The nonlinear phase rotation distributes input history into the selected quadrature.',
        essential_mechanism: 'Driven Kerr phase mixing before the observation boundary.',
        explanation_scope: 'The normalized local model and linear-memory target family only.',
        failure_condition: 'A predeclared matched control eliminates the positive lower-envelope advantage.',
      }
    case 'research-topic':
      return {
        open_problem: 'Which bounded criticism would distinguish local rewriting from external selection?',
        why_open: 'The exact motivating conjecture has not survived a conditional-locality test.',
        topic_scope: 'One exact public conjecture revision and bounded finite graphs.',
        next_discriminating_criticism_or_test: 'Vary remote context while holding the local pair and boundary fixed.',
        non_claims: 'No evidence, canonical coordinate, priority, or interaction-net realization is claimed.',
      }
    case 'proposed-experiment':
      return {
        experiment_id: `experiment-${suffix}`,
        experiment_version: 1,
        experiment_kind: 'physical',
        intent: 'falsification',
        targets: [{
          target_id: `external-target-${suffix}`,
          target_kind: 'external-reference',
          target_label: 'A bounded operator-supplied target',
        }],
        protocols: [{
          protocol_id: `protocol-${suffix}`,
          protocol_name: 'Minimal decisive protocol',
          minimal_decisive_test: 'Run the smallest matched test with raw artifacts retained.',
          steps: ['Calibrate the readout.', 'Run matched and ablated trials.', 'Compare with the exact reference.'],
          decision_rule: 'Use the predeclared success and falsifier thresholds.',
          boundary: 'This applies only to the named finite setup and version.',
        }],
        controls: [{
          control_id: `control-${suffix}`,
          control_kind: 'ablated',
          description: 'Remove the proposed interaction while preserving readout.',
          controlled_variable: 'interaction path',
          expected_relation: 'The decisive signature should disappear.',
        }],
        observables: [{
          observable_id: `observable-${suffix}`,
          name: 'normalized output error',
          units: 'dimensionless',
          measurement: 'Decoded output compared with the exact reference.',
          aggregation: 'per trial and aggregate block',
          uncertainty_reporting: 'Report calibration and detector uncertainty.',
        }],
        calibration: [{
          calibration_id: `calibration-${suffix}`,
          quantity: 'detector linearity',
          units: 'fraction',
          method: 'Traceable input sweep.',
          acceptance: 'Residual error remains below the declared budget.',
        }],
        repetitions: {
          repetition_id: `repetition-${suffix}`,
          replicate_unit: 'independently prepared trial',
          minimum_repetitions: 10,
          independent_repetitions: 5,
          randomization: 'Randomize trial order and inputs.',
          stopping_rule: 'Complete all blocks unless a safety stop applies.',
        },
        uncertainty: {
          uncertainty_id: `uncertainty-${suffix}`,
          sources: 'Preparation, readout, and environmental drift.',
          propagation: 'Propagate the calibrated covariance through decoding.',
          reporting: 'Publish per-trial values and exclusions.',
        },
        criteria: [
          {
            criterion_id: `success-${suffix}`,
            criterion_kind: 'success',
            statement: 'The decoded output agrees with the exact reference.',
            metric: 'relative error',
            comparator: '<=',
            threshold_text: 'predeclared error budget',
            units: 'dimensionless',
          },
          {
            criterion_id: `falsifier-${suffix}`,
            criterion_kind: 'falsifier',
            statement: 'The same signature remains after the interaction is ablated.',
            metric: 'ablated signal',
            comparator: '>=',
            threshold_text: 'predeclared leakage threshold',
            units: 'fraction',
          },
        ],
        confounds: [{
          confound_id: `confound-${suffix}`,
          confound: 'Readout drift could mimic the signature.',
          detection_control: 'Interleave calibration references.',
          mitigation: 'Lock and remeasure the readout.',
        }],
        raw_artifacts: [{
          raw_artifact_id: `raw-${suffix}`,
          artifact_kind: 'raw-spectrum',
          format: 'binary data plus JSON metadata',
          retention: 'Retain the original files and immutable hash.',
        }],
        nonclaims: ['No run, result, evidence, canonical admission, or equipment availability is claimed.'],
        dependencies: [],
        relations: [],
        equipment_requirements: [{
          requirement_id: `equipment-${suffix}`,
          group_id: `readout-${suffix}`,
          group_order: 1,
          group_kind: 'required',
          selection_rule: 'any-one',
          quantity: 1,
          capability: 'calibrated readout',
          units: 'system',
          specification: 'Retain raw values and calibration traceability.',
        }],
        topic_links: [],
      }
    case 'equipment-type-proposal':
      return {
        equipment_type_id: `equipment-${suffix}`,
        equipment_type_version: 1,
        title: 'Calibrated capability type',
        description: 'A capability description, not an inventory record.',
        capabilities: [{
          capability_id: `capability-${suffix}`,
          capability: 'Calibrated readout',
          units: 'system',
          specification: 'Declared dynamic range and raw artifact retention.',
        }],
        operating_limits: [],
        calibrations: [],
        safety_requirements: [{
          safety_requirement_id: `safety-${suffix}`,
          hazard: 'Stored energy',
          requirement: 'Use a bounded operating procedure.',
          mitigation: 'Verify interlocks before operation.',
        }],
        interface_requirements: [],
        nonclaims: ['This does not claim equipment existence, availability, vendor, procurement, or budget.'],
      }
    default:
      throw new Error(`unknown kind ${kind}`)
  }
}

function proposal(kind, suffix = 'candidate') {
  const record = {
    kind,
    title: `Proposal for ${kind}`,
    summary: 'A bounded public proposal, immediately visible and unreviewed.',
    rationale: 'This conjecture is presented with an explicit criticism surface.',
    scope: 'This exact public revision only.',
    detail: detail(kind, suffix),
    evidence: [{ evidence_kind: 'argument', summary: 'A defeasible argument, not a verdict.' }],
    references: [
      { reference_kind: 'context', label: 'Context', https_url: 'https://example.org/context' },
    ],
    turnstile_token: 'test-pass',
  }
  if (kind === 'explanatory-conjecture') {
    record.assumptions = ['The selected quadrature remains a declared observable.']
    record.framings = []
    record.relations = []
  }
  if (kind === 'research-topic') {
    record.loci = ['theoretical', 'simulation']
    record.origins = [{
      origin_kind: 'canonical-conjecture-version',
      canonical_conjecture_version_id: 'conjecture-kerr-quadrature-linear-memory-lead-v1',
      relationship: 'criticizes',
      origin_rationale: 'This exact admitted conjecture version supplies the bounded motivating question.',
    }]
    record.framings = []
    record.topic_relations = []
  }
  return record
}

async function responseJson(response) {
  return { response, body: await response.json() }
}

async function createOne(h, kind = 'theoretical-model-member', suffix = 'candidate', options = {}) {
  const { response, body } = await responseJson(
    await h.call('/api/proposals', {
      method: 'POST',
      actor: h.author,
      body: { ...proposal(kind, suffix), ...(options.body ?? {}) },
      key: options.key,
    }),
  )
  assert.equal(response.status, 201, JSON.stringify(body))
  return body
}

test('anonymous reads stay diagnostic with absent production secrets and carry security headers', async () => {
  const database = new SQLiteD1()
  database.migrate(siteRoot)
  const env = { PROPOSALS_DB: database, ASSETS: baseEnvironment(database).ASSETS }
  const health = await worker.fetch(new Request(`${origin}/api/health`), env)
  assert.equal(health.status, 200)
  assert.equal((await health.json()).canonical_registry_writes, false)
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/)
  assert.equal(health.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups')
  assert.match(health.headers.get('content-security-policy'), /connect-src[^;]*https:\/\/rpc\.wallet\.coinbase\.com[^;]*https:\/\/chain-proxy\.wallet\.coinbase\.com/u)
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff')

  const list = await worker.fetch(new Request(`${origin}/api/proposals`), env)
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).items, [])
  const asset = await worker.fetch(new Request(`${origin}/`), env)
  assert.equal(asset.status, 200)
  assert.match(asset.headers.get('content-security-policy'), /challenges\.cloudflare\.com/)

  const write = await worker.fetch(
    new Request(`${origin}/api/proposals`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'idempotency-key': 'anonymous-write' },
      body: JSON.stringify(proposal('theoretical-model-member')),
    }),
    env,
  )
  assert.equal(write.status, 401)
  assert.equal((await write.json()).error.code, 'authentication_required')
  database.close()
})

test('operator authority is derived from append-only D1 role events', async () => {
  const h = await harness()

  const operatorSession = await responseJson(await h.call('/api/session', { actor: h.operator }))
  assert.equal(operatorSession.body.operator, true)
  const authorSession = await responseJson(await h.call('/api/session', { actor: h.author }))
  assert.equal(authorSession.body.operator, false)

  const unauthorized = await responseJson(
    await h.call('/api/admin/operator-roles', {
      method: 'POST',
      actor: h.author,
      body: {
        target_github_login: 'outsider',
        action: 'grant',
        rationale: 'An ordinary contributor cannot grant authority.',
      },
    }),
  )
  assert.equal(unauthorized.response.status, 403)
  assert.equal(unauthorized.body.error.code, 'operator_required')

  const key = 'operator-grant-outsider-0001'
  const grant = await responseJson(
    await h.call('/api/admin/operator-roles', {
      method: 'POST',
      actor: h.operator,
      key,
      body: {
        target_github_login: 'outsider',
        action: 'grant',
        rationale: 'Add a second operator through the audited API.',
      },
    }),
  )
  assert.equal(grant.response.status, 201, JSON.stringify(grant.body))
  assert.equal(grant.body.action, 'granted')
  const replay = await responseJson(
    await h.call('/api/admin/operator-roles', {
      method: 'POST',
      actor: h.operator,
      key,
      body: {
        target_github_login: 'outsider',
        action: 'grant',
        rationale: 'Add a second operator through the audited API.',
      },
    }),
  )
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true')

  const outsiderSession = await responseJson(await h.call('/api/session', { actor: h.outsider }))
  assert.equal(outsiderSession.body.operator, true)
  const revoke = await responseJson(
    await h.call('/api/admin/operator-roles', {
      method: 'POST',
      actor: h.outsider,
      body: {
        target_github_login: 'operator',
        action: 'revoke',
        rationale: 'Transfer operating authority to the second account.',
      },
    }),
  )
  assert.equal(revoke.response.status, 201, JSON.stringify(revoke.body))
  assert.equal(revoke.body.action, 'revoked')

  const formerOperatorSession = await responseJson(await h.call('/api/session', { actor: h.operator }))
  assert.equal(formerOperatorSession.body.operator, false)
  const finalRevoke = await responseJson(
    await h.call('/api/admin/operator-roles', {
      method: 'POST',
      actor: h.outsider,
      body: {
        target_github_login: 'outsider',
        action: 'revoke',
        rationale: 'This must fail because one operator must remain.',
      },
    }),
  )
  assert.equal(finalRevoke.response.status, 409)
  assert.equal(finalRevoke.body.error.code, 'concurrent_write_conflict')
  h.database.close()
})

test('all eleven typed proposal kinds publish immediately as submitted and unreviewed', async () => {
  const h = await harness()
  const kinds = [
    'theoretical-model-member',
    'physical-material-member',
    'physical-calculation-mechanism-member',
    'observation-interface-member',
    'existing-member-assessment',
    'existing-member-correction',
    'ontology-change',
    'explanatory-conjecture',
    'research-topic',
    'proposed-experiment',
    'equipment-type-proposal',
  ]
  for (const [index, kind] of kinds.entries()) {
    const created = await createOne(h, kind, `candidate-${index}`)
    assert.equal(created.administrative_state, 'submitted')
    assert.equal(created.review_status, 'unreviewed')
    assert.equal(created.public, true)
  }
  const list = await responseJson(await h.call('/api/proposals?limit=20'))
  assert.equal(list.response.status, 200)
  assert.deepEqual(new Set(list.body.items.map((item) => item.proposal_kind)), new Set(kinds))
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM public_schema_violations').get().count, 0)
  h.database.close()
})

test('experiment and equipment proposals round-trip through D1 and accept exact nested criticism', async () => {
  const h = await harness()
  const created = await createOne(h, 'proposed-experiment', 'nested')
  const read = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(read.response.status, 200)
  assert.equal(read.body.revisions[0].detail.experiment_id, 'experiment-nested')
  assert.equal(read.body.revisions[0].detail.observables[0].units, 'dimensionless')
  assert.equal(read.body.revisions[0].detail.criteria.some((item) => item.criterion_kind === 'falsifier'), true)
  const criticism = await responseJson(await h.call(
    `/api/proposals/${created.proposal_id}/revisions/1/criticisms`,
    {
      method: 'POST',
      actor: h.outsider,
      body: {
        title: 'The ablation boundary needs stronger controls',
        criticism: 'The proposed control may not isolate the interaction from readout drift.',
        scope: 'The exact experiment observable and revision only.',
        focus_kind: 'experiment-observable',
        focus_ref: 'observable-nested',
        turnstile_token: 'test-pass',
      },
      key: 'experiment-focused-criticism-1',
    },
  ))
  assert.equal(criticism.response.status, 201, JSON.stringify(criticism.body))

  const equipment = await createOne(h, 'equipment-type-proposal', 'nested-equipment')
  const equipmentRead = await responseJson(await h.call(`/api/proposals/${equipment.proposal_id}`))
  assert.equal(equipmentRead.response.status, 200)
  assert.equal(equipmentRead.body.revisions[0].detail.capabilities[0].capability, 'Calibrated readout')
  const experimentApi = await responseJson(await h.call('/api/experiments?q=graphene&limit=2'))
  assert.equal(experimentApi.response.status, 200)
  assert.ok(experimentApi.body.items.length > 0)
  assert.equal(experimentApi.body.canonical_admission, false)
  const experimentExact = await responseJson(await h.call(`/api/experiments/${experimentApi.body.items[0].experiment_id}`))
  assert.equal(experimentExact.response.status, 200)
  assert.equal(experimentExact.body.canonical_admission, false)
  assert.equal(experimentExact.body.evidence_claim, false)
  const history = await responseJson(await h.call(`/api/experiments/${experimentApi.body.items[0].experiment_id}/history`))
  assert.equal(history.response.status, 200)
  assert.equal(history.body.items[0].history_family, 'experiment-version')
  const provenance = await responseJson(await h.call(`/api/experiments/${experimentApi.body.items[0].experiment_id}/provenance`))
  assert.equal(provenance.response.status, 200)
  assert.ok(Array.isArray(provenance.body.exact_targets))
  const equipmentApi = await responseJson(await h.call('/api/equipment-types?q=calibrated'))
  assert.equal(equipmentApi.response.status, 200)
  assert.ok(equipmentApi.body.items.length > 0)
  assert.equal(equipmentApi.body.inventory, false)
  h.database.close()
})

test('explanatory conjectures derive frontier framing metadata and support exact focused criticism', async () => {
  const h = await harness()
  const config = await responseJson(await h.call('/api/config'))
  const gap = config.body.frontier.items.find((item) => item.classification === 'gap')
  assert.ok(gap)
  const body = proposal('explanatory-conjecture')
  body.framings = [{
    coordinate_key: gap.coordinate_key,
    validation_generation: gap.validation_generation,
    framing_rationale: 'This gap is a conjectural application frame, not an admitted cell.',
  }]
  const created = await responseJson(await h.call('/api/proposals', {
    method: 'POST', actor: h.author, body, key: 'explanatory-framing-1',
  }))
  assert.equal(created.response.status, 201, JSON.stringify(created.body))
  const read = await responseJson(await h.call(`/api/proposals/${created.body.proposal_id}`))
  assert.equal(read.response.status, 200)
  const detail = read.body.revisions[0].detail
  assert.equal(detail.framings[0].coordinate_classification, 'gap')
  assert.equal(detail.framings[0].cell_id, null)
  assert.equal(detail.framings[0].model_id, gap.model_id)
  assert.equal(detail.assumptions.length, 1)

  const criticism = await responseJson(await h.call(
    `/api/proposals/${created.body.proposal_id}/revisions/1/criticisms`,
    {
      method: 'POST',
      actor: h.outsider,
      body: {
        title: 'The framing may not constrain the mechanism',
        criticism: 'The explanation has not shown that this exact coordinate is essential.',
        scope: 'The first coordinate framing of revision 1 only.',
        focus_kind: 'coordinate-framing',
        focus_ref: detail.framings[0].framing_id,
        turnstile_token: 'test-pass',
      },
      key: 'focused-criticism-1',
    },
  ))
  assert.equal(criticism.response.status, 201, JSON.stringify(criticism.body))
  const filtered = await responseJson(await h.call(`/api/proposals?coordinate_key=${encodeURIComponent(gap.coordinate_key)}`))
  assert.deepEqual(filtered.body.items.map((item) => item.proposal_id), [created.body.proposal_id])

  const revisionBody = structuredClone(body)
  delete revisionBody.kind
  revisionBody.title = 'A narrower exact-version explanation'
  revisionBody.detail.explanatory_claim = 'The revised claim is confined to the same declared gap framing.'
  revisionBody.relations = [{
    relation_kind: 'supersedes',
    target_proposal_id: created.body.proposal_id,
    target_revision: 1,
    relation_claim: 'Revision 2 narrows rather than replaces the exact first-revision explanation.',
    relation_scope: 'This proposal and these two immutable revisions only.',
  }]
  const revised = await responseJson(await h.call(`/api/proposals/${created.body.proposal_id}/revisions`, {
    method: 'POST', actor: h.author, body: revisionBody, key: 'explanatory-revision-2',
  }))
  assert.equal(revised.response.status, 201, JSON.stringify(revised.body))
  assert.equal(revised.body.revision, 2)
  const reread = await responseJson(await h.call(`/api/proposals/${created.body.proposal_id}`))
  assert.equal(reread.body.revisions.length, 2)
  assert.equal(reread.body.revisions[0].detail.relations.length, 0)
  assert.equal(reread.body.revisions[1].detail.relations[0].target_revision, 1)
  assert.equal(reread.body.revisions[1].detail.framings[0].coordinate_key, gap.coordinate_key)

  const drifted = structuredClone(body)
  drifted.framings[0].validation_generation = 'stale-generation'
  const rejected = await responseJson(await h.call('/api/proposals', {
    method: 'POST', actor: h.author, body: drifted, key: 'explanatory-framing-drift',
  }))
  assert.equal(rejected.response.status, 400)
  assert.match(JSON.stringify(rejected.body), /framing generation does not match/u)
  h.database.close()
})

test('research topics preserve typed origins, multi-locus framing, exact relations, and focused criticism', async () => {
  const h = await harness()
  const motivating = await createOne(h, 'explanatory-conjecture', 'topic-origin', { key: 'topic-origin-key' })
  const targetBody = proposal('research-topic', 'target-topic')
  targetBody.origins = [{
    origin_kind: 'public-explanatory-conjecture-revision',
    target_proposal_id: motivating.proposal_id,
    target_revision: 1,
    relationship: 'derived-from',
    origin_rationale: 'The exact public conjecture revision supplies the unvalidated motivating problem.',
  }]
  const target = await createOne(h, 'research-topic', 'target-topic', { body: targetBody, key: 'target-topic-key' })

  const sourceBody = structuredClone(targetBody)
  sourceBody.title = 'A related bounded research topic'
  sourceBody.topic_relations = [{
    relation_kind: 'depends-on',
    target_proposal_id: target.proposal_id,
    target_revision: 1,
    relation_claim: 'This exact simulation topic consumes the exact formal topic definition.',
    relation_scope: 'These exact public revisions only.',
  }]
  const source = await createOne(h, 'research-topic', 'source-topic', { body: sourceBody, key: 'source-topic-key' })
  const exact = await responseJson(await h.call(`/api/proposals/${source.proposal_id}`))
  assert.equal(exact.response.status, 200)
  const detail = exact.body.revisions[0].detail
  assert.deepEqual(detail.loci.map((item) => item.locus_kind), ['theoretical', 'simulation'])
  assert.equal(detail.origins[0].target_proposal_id, motivating.proposal_id)
  assert.equal(detail.topic_relations[0].target_revision, 1)
  assert.equal(detail.topic_relations[0].relation_kind, 'depends-on')

  const criticism = await responseJson(await h.call(
    `/api/proposals/${source.proposal_id}/revisions/1/criticisms`,
    {
      method: 'POST',
      actor: h.outsider,
      key: 'topic-focus-key',
      body: {
        title: 'The simulation locus may be premature',
        criticism: 'No executable simulator is identified for this exact revision.',
        scope: 'The simulation locus of revision 1 only.',
        focus_kind: 'topic-locus',
        focus_ref: detail.loci[1].topic_locus_id,
        turnstile_token: 'test-pass',
      },
    },
  ))
  assert.equal(criticism.response.status, 201, JSON.stringify(criticism.body))
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM public_schema_violations').get().count, 0)
  h.database.close()
})

test('published topic API is bounded, filter-bound paginated, and exposes detail history provenance', async () => {
  const h = await harness()
  const first = await responseJson(await h.call('/api/research-topics?limit=2'))
  assert.equal(first.response.status, 200)
  assert.equal(first.body.items.length, 2)
  assert.ok(first.body.next_cursor)

  const second = await responseJson(await h.call(`/api/research-topics?limit=2&cursor=${first.body.next_cursor}`))
  assert.equal(second.response.status, 200)
  assert.equal(new Set([...first.body.items, ...second.body.items].map((item) => item.topic_id)).size,
    first.body.items.length + second.body.items.length)
  const wrongFilter = await responseJson(await h.call(`/api/research-topics?limit=2&locus=simulation&cursor=${first.body.next_cursor}`))
  assert.equal(wrongFilter.response.status, 400)
  assert.equal(wrongFilter.body.error.code, 'invalid_topic_cursor')

  const topicId = first.body.items[0].topic_id
  const detailResponse = await responseJson(await h.call(`/api/research-topics/${topicId}`))
  const history = await responseJson(await h.call(`/api/research-topics/${topicId}/history`))
  const provenance = await responseJson(await h.call(`/api/research-topics/${topicId}/provenance`))
  assert.equal(detailResponse.response.status, 200)
  assert.equal(history.body.bounded, true)
  assert.ok(history.body.items.length >= 2)
  assert.equal(provenance.body.bounded, true)
  assert.equal(provenance.body.canonical_admission, false)
  assert.ok(provenance.body.exact_origins.length >= 1)
  h.database.close()
})

test('typed inter-conjecture relations target exact immutable explanatory revisions', async () => {
  const h = await harness()
  const target = await createOne(h, 'explanatory-conjecture', 'relation-target', { key: 'relation-target-key' })
  const sourceBody = proposal('explanatory-conjecture', 'relation-source')
  sourceBody.relations = [{
    relation_kind: 'rival-to',
    target_proposal_id: target.proposal_id,
    target_revision: 1,
    relation_claim: 'The two explanations make incompatible claims about the essential observable.',
    relation_scope: 'These exact first revisions only.',
  }]
  const source = await responseJson(await h.call('/api/proposals', {
    method: 'POST', actor: h.author, body: sourceBody, key: 'relation-source-key',
  }))
  assert.equal(source.response.status, 201, JSON.stringify(source.body))
  const read = await responseJson(await h.call(`/api/proposals/${source.body.proposal_id}`))
  assert.equal(read.body.revisions[0].detail.relations[0].target_proposal_id, target.proposal_id)
  assert.equal(read.body.revisions[0].detail.relations[0].target_revision, 1)

  const invalid = structuredClone(sourceBody)
  invalid.title = 'Invalid cross-kind relation'
  invalid.relations[0].target_proposal_id = (await createOne(h, 'theoretical-model-member', 'relation-wrong-kind')).proposal_id
  const rejected = await responseJson(await h.call('/api/proposals', {
    method: 'POST', actor: h.author, body: invalid, key: 'relation-invalid-key',
  }))
  assert.equal(rejected.response.status, 409)
  assert.equal(rejected.body.error.code, 'concurrent_write_conflict')
  assert.equal(h.database.database.prepare('SELECT COUNT(*) count FROM proposals').get().count, 3)
  h.database.close()
})

test('origin, CSRF, Turnstile, bounded URL, and account/IP quotas fail closed', async () => {
  const h = await harness()
  const body = proposal('theoretical-model-member')
  let result = await h.call('/api/proposals', { method: 'POST', actor: h.author, body, requestOrigin: 'https://evil.test' })
  assert.equal(result.status, 403)
  assert.equal((await result.json()).error.code, 'origin_rejected')

  result = await h.call('/api/proposals', {
    method: 'POST',
    actor: h.author,
    body,
    headers: { 'x-csrf-token': 'wrong-token' },
  })
  assert.equal(result.status, 403)
  assert.equal((await result.json()).error.code, 'csrf_rejected')

  result = await h.call('/api/proposals', {
    method: 'POST',
    actor: h.author,
    body: { ...body, turnstile_token: 'test-fail' },
  })
  assert.equal(result.status, 403)
  assert.equal((await result.json()).error.code, 'turnstile_rejected')

  result = await h.call('/api/proposals', {
    method: 'POST',
    actor: h.author,
    body: { ...body, references: [{ reference_kind: 'context', label: 'Bad', https_url: 'https://user@example.org' }] },
  })
  assert.equal(result.status, 400)
  assert.equal((await result.json()).error.details.field, 'references[0].https_url')

  h.env.PUBLIC_WRITE_LIMIT_PER_HOUR = '1'
  assert.equal((await h.call('/api/proposals', { method: 'POST', actor: h.outsider, body })).status, 201)
  result = await h.call('/api/proposals', {
    method: 'POST',
    actor: h.outsider,
    body: proposal('physical-material-member'),
  })
  assert.equal(result.status, 429)
  assert.equal((await result.json()).error.code, 'quota_exceeded')
  assert.equal(h.database.database.prepare('SELECT COUNT(*) AS count FROM quota_events').get().count, 1)
  h.database.close()
})

test('every public content route requires Turnstile and missing production secrets fail closed', async () => {
  const h = await harness()
  const created = await createOne(h)
  const paths = [
    '/api/proposals',
    `/api/proposals/${created.proposal_id}/revisions`,
    `/api/proposals/${created.proposal_id}/withdrawal`,
    `/api/proposals/${created.proposal_id}/revisions/1/criticisms`,
    '/api/criticisms/not-reached/replies',
    `/api/proposals/${created.proposal_id}/revisions/1/tests`,
    `/api/proposals/${created.proposal_id}/revisions/1/interpretations`,
    '/api/moderation/actions/not-reached/appeals',
  ]
  for (const path of paths) {
    const response = await h.call(path, {
      method: 'POST',
      actor: h.author,
      body: { turnstile_token: 'test-fail' },
    })
    assert.equal(response.status, 403, path)
    assert.equal((await response.json()).error.code, 'turnstile_rejected', path)
  }

  h.env.ENVIRONMENT = 'production'
  delete h.env.TURNSTILE_TEST_BYPASS
  delete h.env.TURNSTILE_SECRET_KEY
  const originalConsoleError = console.error
  console.error = () => {}
  const missingSecret = await h
    .call('/api/proposals', {
      method: 'POST',
      actor: h.author,
      body: proposal('physical-material-member', 'missing-secret'),
    })
    .finally(() => {
      console.error = originalConsoleError
    })
  assert.equal(missingSecret.status, 500)
  assert.equal((await missingSecret.json()).error.code, 'internal_error')
  const health = await h.call('/api/health')
  assert.equal(health.status, 200)
  h.database.close()
})

test('idempotency replays the same digest, rejects conflicting content, and converges concurrent duplicates', async () => {
  const h = await harness()
  const body = proposal('theoretical-model-member')
  const first = await responseJson(
    await h.call('/api/proposals', { method: 'POST', actor: h.author, body, key: 'stable-key-0001' }),
  )
  const replay = await responseJson(
    await h.call('/api/proposals', { method: 'POST', actor: h.author, body, key: 'stable-key-0001' }),
  )
  assert.equal(first.response.status, 201)
  assert.equal(replay.response.status, 201)
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true')
  assert.equal(replay.body.proposal_id, first.body.proposal_id)

  const conflict = await responseJson(
    await h.call('/api/proposals', {
      method: 'POST',
      actor: h.author,
      body: { ...body, title: 'Different content' },
      key: 'stable-key-0001',
    }),
  )
  assert.equal(conflict.response.status, 409)
  assert.equal(conflict.body.error.code, 'idempotency_conflict')

  const concurrentBody = proposal('physical-material-member', 'concurrent')
  const concurrent = await Promise.all([
    h.call('/api/proposals', { method: 'POST', actor: h.outsider, body: concurrentBody, key: 'concurrent-key-1' }),
    h.call('/api/proposals', { method: 'POST', actor: h.outsider, body: concurrentBody, key: 'concurrent-key-1' }),
  ])
  const parsed = await Promise.all(concurrent.map(responseJson))
  assert.deepEqual(parsed.map((item) => item.response.status), [201, 201])
  assert.equal(parsed[0].body.proposal_id, parsed[1].body.proposal_id)

  const adminBody = { to_state: 'triaged', rationale: 'Administrative triage only.' }
  const adminFirst = await responseJson(
    await h.call(`/api/admin/proposals/${first.body.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: adminBody,
      key: 'stable-admin-key-0001',
    }),
  )
  const adminReplay = await responseJson(
    await h.call(`/api/admin/proposals/${first.body.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: adminBody,
      key: 'stable-admin-key-0001',
    }),
  )
  assert.equal(adminFirst.response.status, 201)
  assert.equal(adminReplay.response.status, 201)
  assert.equal(adminReplay.response.headers.get('idempotency-replayed'), 'true')
  assert.equal(adminReplay.body.event_sequence, adminFirst.body.event_sequence)

  const adminConflict = await responseJson(
    await h.call(`/api/admin/proposals/${first.body.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: { ...adminBody, rationale: 'A different administrative rationale.' },
      key: 'stable-admin-key-0001',
    }),
  )
  assert.equal(adminConflict.response.status, 409)
  assert.equal(adminConflict.body.error.code, 'idempotency_conflict')
  h.database.close()
})

test('submitted revisions append, triage closes editing, and concurrent transitions do not silently overwrite', async () => {
  const h = await harness()
  const created = await createOne(h)
  const revisionBody = { ...proposal('theoretical-model-member', 'revision-2') }
  delete revisionBody.kind
  const competingRevision = { ...proposal('theoretical-model-member', 'competing-revision-2') }
  delete competingRevision.kind
  const revisionRace = await Promise.all([
    h.call(`/api/proposals/${created.proposal_id}/revisions`, {
      method: 'POST',
      actor: h.author,
      body: revisionBody,
    }),
    h.call(`/api/proposals/${created.proposal_id}/revisions`, {
      method: 'POST',
      actor: h.author,
      body: competingRevision,
    }),
  ])
  assert.deepEqual(
    revisionRace.map((response) => response.status).sort((a, b) => a - b),
    [201, 409],
  )

  const transitionBody = { to_state: 'triaged', rationale: 'The proposal is ready for bounded review.' }
  const transitions = await Promise.all([
    h.call(`/api/admin/proposals/${created.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: transitionBody,
    }),
    h.call(`/api/admin/proposals/${created.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: transitionBody,
    }),
  ])
  assert.deepEqual(
    transitions.map((response) => response.status).sort((a, b) => a - b),
    [201, 409],
  )
  const result = await responseJson(
    await h.call(`/api/proposals/${created.proposal_id}/revisions`, {
      method: 'POST',
      actor: h.author,
      body: revisionBody,
    }),
  )
  assert.equal(result.response.status, 409)
  assert.equal(result.body.error.code, 'follow_up_required')

  const followUp = await createOne(h, 'theoretical-model-member', 'follow-up', {
    body: { parent: { proposal_id: created.proposal_id, revision: 2 } },
  })
  const detailResult = await responseJson(await h.call(`/api/proposals/${followUp.proposal_id}`))
  assert.equal(detailResult.body.proposal.parent_proposal_id, created.proposal_id)
  assert.equal(detailResult.body.proposal.parent_revision, 2)
  h.database.close()
})

test('only the author can idempotently withdraw a nonterminal proposal without erasing its public history', async () => {
  const h = await harness()
  const created = await createOne(h)
  const path = `/api/proposals/${created.proposal_id}/withdrawal`
  const body = { rationale: 'The author withdraws this proposal without retracting its public history.', turnstile_token: 'test-pass' }

  let result = await responseJson(await h.call(path, { method: 'POST', actor: h.outsider, body }))
  assert.equal(result.response.status, 403)
  assert.equal(result.body.error.code, 'proposal_author_required')

  result = await responseJson(
    await h.call(path, {
      method: 'POST',
      actor: h.author,
      body: { ...body, to_state: 'admitted-link-recorded' },
    }),
  )
  assert.equal(result.response.status, 400)
  assert.equal(result.body.error.details.field, 'to_state')

  const operatorAttempt = await responseJson(
    await h.call(`/api/admin/proposals/${created.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: { to_state: 'withdrawn', rationale: 'Operators cannot impersonate author withdrawal.' },
    }),
  )
  assert.equal(operatorAttempt.response.status, 400)
  assert.equal(operatorAttempt.body.error.details.field, 'to_state')

  const first = await responseJson(
    await h.call(path, { method: 'POST', actor: h.author, body, key: 'author-withdrawal-key-0001' }),
  )
  const replay = await responseJson(
    await h.call(path, { method: 'POST', actor: h.author, body, key: 'author-withdrawal-key-0001' }),
  )
  assert.equal(first.response.status, 201)
  assert.equal(first.body.administrative_state, 'withdrawn')
  assert.equal(replay.response.status, 201)
  assert.equal(replay.response.headers.get('idempotency-replayed'), 'true')
  assert.equal(replay.body.event_sequence, first.body.event_sequence)

  const detailResult = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(detailResult.response.status, 200)
  assert.equal(detailResult.body.proposal.current_admin_state, 'withdrawn')
  assert.equal(detailResult.body.revisions.length, 1)
  assert.equal(detailResult.body.state_history.at(-1).github_login, 'author')
  assert.equal(detailResult.body.state_history.at(-1).to_state, 'withdrawn')
  const list = await responseJson(await h.call('/api/proposals'))
  assert.ok(list.body.items.some((item) => item.proposal_id === created.proposal_id))
  assert.equal(
    h.database.database.prepare("SELECT COUNT(*) AS count FROM quota_events WHERE mutation_kind = 'withdrawal'").get().count,
    1,
  )
  h.database.close()
})

test('exact-revision criticism, reply, scoped test, interpretation, moderation, and appeal remain public', async () => {
  const h = await harness()
  const created = await createOne(h, 'observation-interface-member')
  const base = `/api/proposals/${created.proposal_id}/revisions/1`
  const criticism = await responseJson(
    await h.call(`${base}/criticisms`, {
      method: 'POST',
      actor: h.outsider,
      body: {
        title: 'Boundary criticism',
        criticism: 'The observation boundary could admit another interpretation.',
        scope: 'Revision 1 only.',
        turnstile_token: 'test-pass',
      },
    }),
  )
  assert.equal(criticism.response.status, 201)
  const reply = await h.call(`/api/criticisms/${criticism.body.criticism_id}/replies`, {
    method: 'POST',
    actor: h.author,
    body: { reply: 'The boundary is explicit in the typed detail.', turnstile_token: 'test-pass' },
  })
  assert.equal(reply.status, 201)
  const report = await h.call(`${base}/tests`, {
    method: 'POST',
    actor: h.outsider,
    body: {
      test_name: 'Boundary perturbation',
      protocol: 'Apply a frozen observation-boundary perturbation.',
      result: 'The alternate readout differs.',
      interpretation: 'This narrows but does not rank the proposal.',
      test_relation: 'criticizes',
      turnstile_token: 'test-pass',
    },
  })
  assert.equal(report.status, 201)
  const interpretation = await h.call(`${base}/interpretations`, {
    method: 'POST',
    actor: h.outsider,
    body: {
      title: 'Competing reading',
      interpretation: 'The observed effect may be a readout artifact.',
      scope: 'Revision 1 only.',
      turnstile_token: 'test-pass',
    },
  })
  assert.equal(interpretation.status, 201)

  const deniedModeration = await h.call('/api/admin/moderation-actions', {
    method: 'POST',
    actor: h.outsider,
    body: {
      action_kind: 'label',
      target_kind: 'proposal-revision',
      proposal_id: created.proposal_id,
      revision: 1,
      reason_code: 'scope-note',
      explanation: 'A neutral scope label.',
    },
  })
  assert.equal(deniedModeration.status, 403)
  const moderation = await responseJson(
    await h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: {
        action_kind: 'label',
        target_kind: 'proposal-revision',
        proposal_id: created.proposal_id,
        revision: 1,
        reason_code: 'scope-note',
        explanation: 'A neutral administrative scope label.',
      },
    }),
  )
  assert.equal(moderation.response.status, 201)
  const appeal = await responseJson(
    await h.call(`/api/moderation/actions/${moderation.body.moderation_action_id}/appeals`, {
      method: 'POST',
      actor: h.author,
      body: { appeal: 'Please review whether this label is necessary.', turnstile_token: 'test-pass' },
    }),
  )
  assert.equal(appeal.response.status, 201)
  const appealReview = await h.call(`/api/admin/appeals/${appeal.body.appeal_id}/state`, {
    method: 'POST',
    actor: h.operator,
    body: { to_state: 'under-review', rationale: 'A operator accepted the appeal for review.' },
  })
  assert.equal(appealReview.status, 201)

  const invalidTarget = await h.call(`/api/proposals/${created.proposal_id}/revisions/99/criticisms`, {
    method: 'POST',
    actor: h.outsider,
    body: {
      title: 'No target',
      criticism: 'This revision does not exist.',
      scope: 'Invalid.',
      turnstile_token: 'test-pass',
    },
  })
  assert.equal(invalidTarget.status, 404)

  const detailResponse = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(detailResponse.body.criticisms[0].target_revision, 1)
  assert.equal(detailResponse.body.criticisms[0].replies.length, 1)
  assert.equal(detailResponse.body.tests[0].target_revision, 1)
  assert.equal(detailResponse.body.competing_interpretations[0].target_revision, 1)
  assert.equal(detailResponse.body.moderation.length, 1)
  h.database.close()
})

test('ordered moderation derives listing visibility and contributor locks while exact records and appeals remain public', async () => {
  const h = await harness()
  const created = await createOne(h)
  const proposalTarget = {
    target_kind: 'proposal-revision',
    proposal_id: created.proposal_id,
    revision: 1,
  }
  const hideBody = {
    action_kind: 'hide-from-listing',
    ...proposalTarget,
    reason_code: 'listing-safety',
    explanation: 'Hide this exact revision from collection listings while retaining its exact history.',
  }
  const hidden = await responseJson(
    await h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: hideBody,
      key: 'stable-hide-key-0001',
    }),
  )
  const hideReplay = await responseJson(
    await h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: hideBody,
      key: 'stable-hide-key-0001',
    }),
  )
  assert.equal(hidden.response.status, 201)
  assert.equal(hideReplay.response.headers.get('idempotency-replayed'), 'true')
  let list = await responseJson(await h.call('/api/proposals'))
  assert.ok(!list.body.items.some((item) => item.proposal_id === created.proposal_id))

  let exact = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(exact.response.status, 200)
  assert.equal(exact.body.proposal_listing_visibility, 'hidden')
  assert.equal(exact.body.moderation_tombstones[0].moderation_action_id, hidden.body.moderation_action_id)
  assert.equal(exact.body.moderation[0].current_effective, true)
  assert.equal(exact.body.revisions.length, 1)

  const revisionBody = { ...proposal('theoretical-model-member', 'visible-revision-2') }
  delete revisionBody.kind
  const revision = await h.call(`/api/proposals/${created.proposal_id}/revisions`, {
    method: 'POST',
    actor: h.author,
    body: revisionBody,
  })
  assert.equal(revision.status, 201, await revision.text())
  list = await responseJson(await h.call('/api/proposals'))
  assert.ok(list.body.items.some((item) => item.proposal_id === created.proposal_id))
  exact = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(exact.body.proposal_listing_visibility, 'listed')
  assert.equal(exact.body.listing_moderation[0].target_revision, 1)
  assert.equal(exact.body.listing_moderation[0].listing_visibility, 'hidden')

  const criticism = await responseJson(
    await h.call(`/api/proposals/${created.proposal_id}/revisions/2/criticisms`, {
      method: 'POST',
      actor: h.outsider,
      body: {
        title: 'Still exact and public',
        criticism: 'This content will receive a listing tombstone but will not be deleted.',
        scope: 'Revision 2 only.',
        turnstile_token: 'test-pass',
      },
    }),
  )
  const hiddenCriticism = await h.call('/api/admin/moderation-actions', {
    method: 'POST',
    actor: h.operator,
    body: {
      action_kind: 'hide-from-listing',
      target_kind: 'criticism',
      criticism_id: criticism.body.criticism_id,
      reason_code: 'content-listing-safety',
      explanation: 'Keep the exact criticism public with a moderation tombstone.',
    },
  })
  assert.equal(hiddenCriticism.status, 201)
  exact = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(exact.body.criticisms[0].criticism_id, criticism.body.criticism_id)
  assert.ok(exact.body.moderation_tombstones.some((item) => item.target_criticism_id === criticism.body.criticism_id))

  const currentTarget = { ...proposalTarget, revision: 2 }
  const concurrentActions = await Promise.all([
    h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: {
        action_kind: 'hide-from-listing',
        ...currentTarget,
        reason_code: 'concurrent-hide',
        explanation: 'One ordered concurrent action.',
      },
    }),
    h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: {
        action_kind: 'restore-to-listing',
        ...currentTarget,
        reason_code: 'concurrent-restore',
        explanation: 'The other ordered concurrent action.',
      },
    }),
  ])
  assert.deepEqual(concurrentActions.map((response) => response.status), [201, 201])
  exact = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  const currentVisibility = exact.body.listing_moderation.find(
    (item) => item.target_proposal_id === created.proposal_id && item.target_revision === 2,
  )
  const currentActions = exact.body.moderation.filter(
    (item) => item.target_proposal_id === created.proposal_id && item.target_revision === 2,
  )
  assert.equal(currentActions.at(-1).moderation_action_id, currentVisibility.moderation_action_id)
  assert.ok(currentActions.at(-1).action_sequence > currentActions[0].action_sequence)
  list = await responseJson(await h.call('/api/proposals'))
  assert.equal(
    list.body.items.some((item) => item.proposal_id === created.proposal_id),
    currentVisibility.listing_visibility === 'listed',
  )

  const restored = await h.call('/api/admin/moderation-actions', {
    method: 'POST',
    actor: h.operator,
    body: {
      action_kind: 'restore-to-listing',
      ...currentTarget,
      reason_code: 'explicit-restore',
      explanation: 'Restore the exact current revision after reviewing the ordered history.',
    },
  })
  assert.equal(restored.status, 201)
  list = await responseJson(await h.call('/api/proposals'))
  assert.ok(list.body.items.some((item) => item.proposal_id === created.proposal_id))

  const internalAccountTarget = await h.call('/api/admin/moderation-actions', {
    method: 'POST',
    actor: h.operator,
    body: {
      action_kind: 'lock-contributor',
      target_kind: 'account',
      target_account_id: h.author.accountId,
      reason_code: 'invalid-internal-target',
      explanation: 'Internal identifiers must not be accepted from public clients.',
    },
  })
  assert.equal(internalAccountTarget.status, 400)

  const lock = await responseJson(
    await h.call('/api/admin/moderation-actions', {
      method: 'POST',
      actor: h.operator,
      body: {
        action_kind: 'lock-contributor',
        target_kind: 'account',
        target_github_login: 'author',
        reason_code: 'bounded-contributor-lock',
        explanation: 'Block ordinary public writes while leaving reads, logout, and this action appealable.',
      },
    }),
  )
  assert.equal(lock.response.status, 201)
  let session = await responseJson(await h.call('/api/session', { actor: h.author }))
  assert.equal(session.body.contributor_locked, true)
  assert.equal(session.body.lock_moderation_action_id, lock.body.moderation_action_id)
  const blocked = await responseJson(
    await h.call(`/api/proposals/${created.proposal_id}/revisions/2/interpretations`, {
      method: 'POST',
      actor: h.author,
      body: {
        title: 'Blocked ordinary write',
        interpretation: 'This must not be stored while the lock is effective.',
        scope: 'Lock test only.',
        turnstile_token: 'test-pass',
      },
    }),
  )
  assert.equal(blocked.response.status, 423)
  assert.equal(blocked.body.error.code, 'contributor_locked')

  const appeal = await responseJson(
    await h.call(`/api/moderation/actions/${lock.body.moderation_action_id}/appeals`, {
      method: 'POST',
      actor: h.author,
      body: { appeal: 'The locked contributor can still appeal the exact action.', turnstile_token: 'test-pass' },
    }),
  )
  assert.equal(appeal.response.status, 201)
  for (const [toState, rationale] of [
    ['under-review', 'A operator begins review of the appeal.'],
    ['granted', 'The operator grants the appeal and will separately record an unlock.'],
  ]) {
    const transition = await h.call(`/api/admin/appeals/${appeal.body.appeal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body: { to_state: toState, rationale },
    })
    assert.equal(transition.status, 201, await transition.text())
  }

  const unlock = await h.call('/api/admin/moderation-actions', {
    method: 'POST',
    actor: h.operator,
    body: {
      action_kind: 'unlock-contributor',
      target_kind: 'account',
      target_github_login: 'author',
      reason_code: 'appeal-granted',
      explanation: 'The latest ordered account action restores ordinary contribution access.',
    },
  })
  assert.equal(unlock.status, 201)
  session = await responseJson(await h.call('/api/session', { actor: h.author }))
  assert.equal(session.body.contributor_locked, false)
  const unblocked = await h.call(`/api/proposals/${created.proposal_id}/revisions/2/interpretations`, {
    method: 'POST',
    actor: h.author,
    body: {
      title: 'Write after ordered unlock',
      interpretation: 'The effective account action is now unlock-contributor.',
      scope: 'Lock lifecycle test only.',
      turnstile_token: 'test-pass',
    },
  })
  assert.equal(unblocked.status, 201)
  const logout = await h.call('/api/session/logout', { method: 'POST', actor: h.author, body: {} })
  assert.equal(logout.status, 200)

  exact = await responseJson(await h.call(`/api/proposals/${created.proposal_id}`))
  assert.equal(exact.body.contributor_lock.is_locked, false)
  assert.equal(exact.body.contributor_lock.action_kind, 'unlock-contributor')
  assert.equal(exact.body.proposal.proposal_id, created.proposal_id)
  assert.equal(exact.body.revisions.length, 2)
  assert.equal(exact.body.criticisms.length, 1)
  assert.equal(exact.body.moderation.filter((item) => item.action_kind === 'lock-contributor').length, 1)
  assert.equal(exact.body.moderation.filter((item) => item.action_kind === 'unlock-contributor').length, 1)
  assert.deepEqual(exact.body.moderation.map((item) => item.action_sequence), [...exact.body.moderation.map((item) => item.action_sequence)].sort((a, b) => a - b))
  h.database.close()
})

test('selected-only export is byte deterministic, discloses criticism limits, and admission linking is operator-only', async () => {
  const h = await harness()
  const created = await createOne(h, 'existing-member-assessment')
  let exportAttempt = await h.call(`/api/admin/proposals/${created.proposal_id}/exports`, {
    method: 'POST',
    actor: h.operator,
    body: { scope: 'Exact revision and public discourse.' },
  })
  assert.equal(exportAttempt.status, 409)

  for (const body of [
    { to_state: 'triaged', rationale: 'Triage is administrative only.' },
    { to_state: 'selected-for-export', selected_revision: 1, rationale: 'Select exact revision 1.' },
  ]) {
    const transition = await h.call(`/api/admin/proposals/${created.proposal_id}/state`, {
      method: 'POST',
      actor: h.operator,
      body,
    })
    assert.equal(transition.status, 201, await transition.text())
  }
  const exportBody = { scope: 'Exact revision and public discourse.' }
  const first = await responseJson(
    await h.call(`/api/admin/proposals/${created.proposal_id}/exports`, {
      method: 'POST',
      actor: h.operator,
      body: exportBody,
    }),
  )
  const second = await responseJson(
    await h.call(`/api/admin/proposals/${created.proposal_id}/exports`, {
      method: 'POST',
      actor: h.operator,
      body: exportBody,
    }),
  )
  assert.equal(first.response.status, 201)
  assert.equal(first.body.content_sha256, second.body.content_sha256)
  assert.equal(canonicalize(first.body.canonical), canonicalize(second.body.canonical))
  assert.equal(first.body.canonical.criticisms_non_exhaustive, true)
  assert.equal(first.body.canonical.selected_revision.revision, 1)
  assert.equal(first.body.canonical.selected_state_event.to_state, 'selected-for-export')
  assert.ok(!canonicalize(first.body.canonical).includes('exported_at'))

  const publicExport = await responseJson(await h.call(`/api/exports/${first.body.export_id}`))
  assert.equal(publicExport.response.status, 200)
  assert.equal(publicExport.body.content_sha256, first.body.content_sha256)

  const linkBody = {
    canonical_admission_id: 'admission-example',
    canonical_entry_id: 'entry-example',
    canonical_commit_sha: 'a'.repeat(40),
  }
  const denied = await h.call(`/api/admin/exports/${first.body.export_id}/admission-links`, {
    method: 'POST',
    actor: h.author,
    body: linkBody,
  })
  assert.equal(denied.status, 403)
  const linked = await h.call(`/api/admin/exports/${first.body.export_id}/admission-links`, {
    method: 'POST',
    actor: h.operator,
    body: linkBody,
  })
  assert.equal(linked.status, 201)
  h.database.close()
})

test('public responses expose handles but no email, numeric GitHub ID, identity digest, or internal account ID', async () => {
  const h = await harness()
  const created = await createOne(h)
  const detailResponse = await h.call(`/api/proposals/${created.proposal_id}`)
  const serialized = await detailResponse.text()
  assert.match(serialized, /"github_login":"author"/)
  assert.doesNotMatch(serialized, /author_account_id|actor_account_id|moderator_account_id|github_identity|github_numeric|email/)
  assert.doesNotMatch(serialized, /account-author/)
  h.database.close()
})

test('OAuth state is cookie-bound, expiring, and single-use; session rotation, logout, and expiry invalidate access', async () => {
  const h = await harness()
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    if (String(url).includes('/login/oauth/access_token')) {
      return Response.json({ access_token: 'ephemeral-token' })
    }
    if (String(url).includes('api.github.com/user')) {
      return Response.json({ id: 4242, login: 'oauth-user', avatar_url: 'https://avatars.githubusercontent.com/u/4242' })
    }
    throw new Error(`unexpected fetch: ${url}`)
  }
  const login = async () => {
    const start = await h.call('/api/auth/github/start?return_to=%2Fproposals%2F')
    assert.equal(start.status, 302)
    const state = new URL(start.headers.get('location')).searchParams.get('state')
    const oauthCookie = start.headers.get('set-cookie').split(';')[0]
    const callbackRequest = new Request(`${origin}/api/auth/github/callback?code=test-code&state=${encodeURIComponent(state)}`, {
      headers: { cookie: oauthCookie },
    })
    return { state, oauthCookie, callbackRequest, response: await worker.fetch(callbackRequest.clone(), h.env) }
  }
  try {
    const first = await login()
    assert.equal(first.response.status, 302)
    const replay = await worker.fetch(first.callbackRequest.clone(), h.env)
    assert.equal(replay.status, 403)
    assert.equal((await replay.json()).error.code, 'oauth_state_replayed')

    const firstSessionCookie = first.response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-cintamani_session='))
      .split(';')[0]
    const second = await login()
    const secondSessionCookie = second.response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('__Host-cintamani_session='))
      .split(';')[0]
    const firstHash = await sha256Hex(firstSessionCookie.split('=')[1])
    const secondHash = await sha256Hex(secondSessionCookie.split('=')[1])
    const sessionEvents = h.database.database.prepare(
      `SELECT session_token_sha256, event_sequence, event_kind, rotated_to_sha256
       FROM principal_session_events
       WHERE session_token_sha256 IN (?, ?)
       ORDER BY session_token_sha256, event_sequence`,
    ).all(firstHash, secondHash)
    assert.equal(sessionEvents.length, 3)
    assert.deepEqual(
      sessionEvents.filter((event) => event.session_token_sha256 === firstHash).map((event) => event.event_kind),
      ['issued', 'rotated'],
    )
    assert.equal(sessionEvents.find((event) => event.event_kind === 'rotated').rotated_to_sha256, secondHash)
    assert.deepEqual(
      sessionEvents.filter((event) => event.session_token_sha256 === secondHash).map((event) => event.event_kind),
      ['issued'],
    )
    let session = await worker.fetch(new Request(`${origin}/api/session`, { headers: { cookie: firstSessionCookie } }), h.env)
    assert.equal((await session.json()).authenticated, false)
    session = await worker.fetch(new Request(`${origin}/api/session`, { headers: { cookie: secondSessionCookie } }), h.env)
    const sessionBody = await session.json()
    assert.equal(sessionBody.authenticated, true)
    assert.equal(sessionBody.contributor.github_login, 'oauth-user')

    const logout = await worker.fetch(
      new Request(`${origin}/api/session/logout`, {
        method: 'POST',
        headers: {
          cookie: secondSessionCookie,
          origin,
          'x-csrf-token': sessionBody.csrf_token,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      h.env,
    )
    assert.equal(logout.status, 200)
    const logoutEvents = h.database.database.prepare(
      'SELECT event_kind, session_event_id FROM principal_session_events WHERE session_token_sha256 = ? ORDER BY event_sequence',
    ).all(secondHash)
    assert.deepEqual(logoutEvents.map((event) => event.event_kind), ['issued', 'revoked'])
    assert.equal(JSON.stringify(logoutEvents).includes(secondSessionCookie.split('=')[1]), false)
    session = await worker.fetch(new Request(`${origin}/api/session`, { headers: { cookie: secondSessionCookie } }), h.env)
    assert.equal((await session.json()).authenticated, false)

    const expiringStart = await h.call('/api/auth/github/start')
    const expiringState = new URL(expiringStart.headers.get('location')).searchParams.get('state')
    const expiringCookie = expiringStart.headers.get('set-cookie').split(';')[0]
    h.env.TEST_NOW = '2026-08-11T18:11:00.000Z'
    const expiredState = await worker.fetch(
      new Request(`${origin}/api/auth/github/callback?code=x&state=${encodeURIComponent(expiringState)}`, {
        headers: { cookie: expiringCookie },
      }),
      h.env,
    )
    assert.equal(expiredState.status, 403)
    assert.equal((await expiredState.json()).error.code, 'oauth_state_expired')

    h.env.TEST_NOW = '2026-08-19T18:00:00.000Z'
    session = await worker.fetch(
      new Request(`${origin}/api/session`, { headers: { cookie: `__Host-cintamani_session=${h.author.token}` } }),
      h.env,
    )
    assert.equal((await session.json()).authenticated, false)
  } finally {
    globalThis.fetch = originalFetch
    h.database.close()
  }
})

test('moderation resolves exactly one public GitHub or wallet handle and rejects internal IDs', async () => {
  const h = await harness()
  const walletId = 'principal-wallet-moderation-test'
  const pseudonym = 'base:123456789abc'
  h.database.database.prepare(
    `INSERT INTO contributor_principals
     (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
     VALUES (?, 'base-wallet', ?, 1, ?)`,
  ).run(walletId, pseudonym, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO base_wallet_identities
     (principal_id, address_hmac_sha256, created_at, last_verified_at) VALUES (?, ?, ?, ?)`,
  ).run(walletId, 'f'.repeat(64), h.env.TEST_NOW, h.env.TEST_NOW)

  const walletLock = await responseJson(await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: {
      action_kind: 'lock-contributor', target_kind: 'account', target_public_pseudonym: pseudonym,
      reason_code: 'wallet-lock-test', explanation: 'Resolve an exact public wallet pseudonym.',
    },
  }))
  assert.equal(walletLock.response.status, 201)
  assert.equal(JSON.stringify(walletLock.body).includes(walletId), false)
  assert.equal(
    h.database.database.prepare('SELECT target_account_id FROM moderation_actions WHERE moderation_action_id = ?')
      .get(walletLock.body.moderation_action_id).target_account_id,
    walletId,
  )

  const githubLock = await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: {
      action_kind: 'lock-contributor', target_kind: 'account', target_github_login: 'outsider',
      reason_code: 'github-lock-test', explanation: 'Resolve a public GitHub login.',
    },
  })
  assert.equal(githubLock.status, 201)

  const ambiguous = await responseJson(await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: {
      action_kind: 'lock-contributor', target_kind: 'account',
      target_github_login: 'author', target_public_pseudonym: pseudonym,
      reason_code: 'ambiguous', explanation: 'Must reject two lookup keys.',
    },
  }))
  assert.equal(ambiguous.response.status, 400)
  assert.equal(ambiguous.body.error.code, 'contributor_lookup_ambiguous')

  for (const internalField of ['target_account_id', 'target_principal_id']) {
    const rejected = await h.call('/api/admin/moderation-actions', {
      method: 'POST', actor: h.operator,
      body: {
        action_kind: 'lock-contributor', target_kind: 'account', [internalField]: walletId,
        reason_code: 'internal-id', explanation: 'Internal IDs are not public lookup keys.',
      },
    })
    assert.equal(rejected.status, 400)
  }
  const missing = await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: {
      action_kind: 'lock-contributor', target_kind: 'account', target_public_pseudonym: 'base:000000000000',
      reason_code: 'missing', explanation: 'Unknown public handle.',
    },
  })
  assert.equal(missing.status, 404)
})

test('direct current identity links grant author access, propagate locks, and revoke future access', async () => {
  const h = await harness()
  const created = await createOne(h)
  const walletId = 'principal-wallet-linked-author'
  const walletToken = 'linked-wallet-agent-bearer-token-with-enough-randomness'
  const walletTokenHash = await sha256Hex(walletToken)
  h.database.database.prepare(
    `INSERT INTO contributor_principals
     (principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at)
     VALUES (?, 'base-wallet', 'base:abcdef123456', 1, ?)`,
  ).run(walletId, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO base_wallet_identities
     (principal_id, address_hmac_sha256, created_at, last_verified_at) VALUES (?, ?, ?, ?)`,
  ).run(walletId, 'a'.repeat(64), h.env.TEST_NOW, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO public_sessions (
      session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
      revoked_at, rotated_to_sha256, auth_kind, transport, scope
    ) VALUES (?, NULL, ?, ?, '2026-08-18T18:00:00.000Z', NULL, NULL, 'siwx', 'agent-bearer', 'public-contributor')`,
  ).run(walletTokenHash, walletId, h.env.TEST_NOW)
  h.database.database.prepare(
    `INSERT INTO principal_session_events (
      session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
      rotated_to_sha256, rationale, source_timestamp, recorded_at
    ) VALUES (?, 1, ?, ?, 'issued', NULL, 'Linked author test session', ?, ?)`,
  ).run(walletTokenHash, 'linked-wallet-session-issued', walletId, h.env.TEST_NOW, h.env.TEST_NOW)
  const linkSql = `INSERT INTO principal_identity_link_events (
    link_id, event_sequence, link_event_id, github_principal_id, github_principal_kind,
    wallet_principal_id, wallet_principal_kind, action_kind, actor_principal_id,
    siwx_message_sha256, signature_sha256, rationale, source_timestamp, recorded_at
  ) VALUES ('link-author-wallet', ?, ?, ?, 'github', ?, 'base-wallet', ?, ?, ?, ?, ?, ?, ?)`
  h.database.database.prepare(linkSql).run(
    1, 'link-author-wallet-1', h.author.accountId, walletId, 'verified', h.author.accountId,
    'b'.repeat(64), 'c'.repeat(64), 'Verified direct link', h.env.TEST_NOW, h.env.TEST_NOW,
  )
  assert.equal(await isCurrentAuthorPrincipal(h.database, h.author.accountId, walletId), true)
  assert.equal(await isCurrentAuthorPrincipal(h.database, h.outsider.accountId, walletId), false)

  const lock = await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: { action_kind: 'lock-contributor', target_kind: 'account', target_github_login: 'author', reason_code: 'linked-lock', explanation: 'Lock propagates across the direct link.' },
  })
  assert.equal(lock.status, 201)
  const linkedHeaders = { authorization: `Bearer ${walletToken}` }
  const blocked = await h.call(`/api/proposals/${created.proposal_id}/revisions`, {
    method: 'POST', headers: linkedHeaders, body: proposal('theoretical-model-member', 'linked-blocked'),
  })
  assert.equal(blocked.status, 423)
  const unlock = await h.call('/api/admin/moderation-actions', {
    method: 'POST', actor: h.operator,
    body: { action_kind: 'unlock-contributor', target_kind: 'account', target_github_login: 'author', reason_code: 'linked-unlock', explanation: 'Restore linked author writes.' },
  })
  assert.equal(unlock.status, 201)
  const revision = await h.call(`/api/proposals/${created.proposal_id}/revisions`, {
    method: 'POST', headers: linkedHeaders,
    body: { ...proposal('theoretical-model-member', 'linked-revision'), kind: undefined },
  })
  assert.equal(revision.status, 201, await revision.text())
  assert.equal(h.database.database.prepare('SELECT author_account_id FROM proposals WHERE proposal_id = ?').get(created.proposal_id).author_account_id, h.author.accountId)

  h.database.database.prepare(linkSql).run(
    2, 'link-author-wallet-2', h.author.accountId, walletId, 'revoked', walletId,
    'd'.repeat(64), 'e'.repeat(64), 'Revoked direct link', h.env.TEST_NOW, h.env.TEST_NOW,
  )
  assert.equal(await isCurrentAuthorPrincipal(h.database, h.author.accountId, walletId), false)
  const denied = await h.call(`/api/proposals/${created.proposal_id}/withdrawal`, {
    method: 'POST', headers: linkedHeaders,
    body: { rationale: 'Revoked counterpart must no longer act as author.' },
  })
  assert.equal(denied.status, 403)
})
