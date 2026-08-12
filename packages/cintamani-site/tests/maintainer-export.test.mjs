import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { prepareAdmission, verifyExport } from '../scripts/prepare-domain-admission.mjs'
import { canonicalize } from '../worker/repository.mjs'

const testRoot = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(testRoot, '..')
const repositoryRoot = resolve(siteRoot, '../..')

function wrapper(kind, detail) {
  const canonical = {
    export_contract: 'cintamani-public-proposal-export@v1',
    scope: 'Exact selected revision and recorded public discourse.',
    criticisms_non_exhaustive: true,
    proposal: {
      proposal_id: `proposal-${kind}`,
      proposal_kind: kind,
      parent_proposal_id: null,
      parent_revision: null,
      created_at: '2026-08-11T18:00:00.000Z',
      author: {
        github_login: 'author',
        github_profile_url: 'https://github.com/author',
        github_avatar_url: null,
      },
    },
    selected_revision: {
      proposal_id: `proposal-${kind}`,
      revision: 1,
      revision_id: `proposal-${kind}-revision-1`,
      title: 'Selected public proposal',
      summary: 'A bounded summary.',
      rationale: 'A defeasible rationale.',
      scope: 'This revision only.',
      content_sha256: 'a'.repeat(64),
      source_timestamp: '2026-08-11T18:00:00.000Z',
      recorded_at: '2026-08-11T18:00:00.000Z',
      github_login: 'author',
      github_profile_url: 'https://github.com/author',
      github_avatar_url: null,
      detail,
      evidence: [],
      references: [],
    },
    selected_state_event: {
      proposal_id: `proposal-${kind}`,
      event_sequence: 3,
      state_event_id: `state-${kind}-3`,
      from_state: 'under-review',
      to_state: 'selected-for-export',
      selected_revision: 1,
      rationale: 'Exact revision selected for a maintainer decision.',
      source_timestamp: '2026-08-11T18:02:00.000Z',
      recorded_at: '2026-08-11T18:02:00.000Z',
      github_login: 'operator',
      github_profile_url: 'https://github.com/operator',
      github_avatar_url: null,
    },
    criticisms: [],
    scoped_tests: [],
    competing_interpretations: [],
  }
  const canonicalJson = canonicalize(canonical)
  const contentHash = createHash('sha256').update(canonicalJson).digest('hex')
  return { export_id: `sha256-${contentHash}`, content_sha256: contentHash, canonical }
}

const commonOptions = { recordId: 'admission-public-proposal-example', admittedAt: '2026-08-11' }

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

test('bridge verifies the content address and maps all four axis-member kinds without inventing units', () => {
  const cases = [
    [
      'theoretical-model-member',
      {
        member_id: 'public-model',
        member_name: 'Public model',
        model_definition: 'Formal definition.',
        computational_claim: 'Bounded claim.',
        initial_epistemic_status: 'candidate',
      },
      'theoretical-model',
    ],
    [
      'physical-material-member',
      {
        member_id: 'public-material',
        member_name: 'Public material',
        material_classification: 'candidate-physical-material',
        composition_or_structure: 'Declared structure.',
        physical_evidence_boundary: 'No device validation.',
        initial_epistemic_status: 'unvalidated-candidate',
      },
      'material',
    ],
    [
      'physical-calculation-mechanism-member',
      {
        member_id: 'public-mechanism',
        member_name: 'Public mechanism',
        physical_process: 'Declared physical process.',
        state_or_signal_carrier: 'Declared carrier.',
        initial_epistemic_status: 'candidate',
      },
      'physical-mechanism',
    ],
    [
      'observation-interface-member',
      {
        member_id: 'public-interface',
        member_name: 'Public interface',
        observation_kind: 'coherent-quadrature',
        units: 'normalized',
        observation_boundary: 'Post-state observation only.',
        initial_epistemic_status: 'candidate',
      },
      'interface',
    ],
  ]
  for (const [kind, detail, domainKind] of cases) {
    const admission = prepareAdmission(wrapper(kind, detail), commonOptions)
    assert.equal(admission.schema_version, 2)
    assert.equal(admission.changes.length, 4)
    assert.equal(admission.changes[0].kind, domainKind)
    assert.match(admission.changes[1].kind, /assessment$/)
    assert.deepEqual(admission.changes.slice(2).map((change) => change.kind), ['provenance-claim', 'provenance-claim'])
    if (kind === 'observation-interface-member') assert.equal(admission.changes[0].units, 'normalized')
  }
})

test('bridge requires exact assessment revision/classification and refuses automatic correction or ontology mapping', () => {
  const materialAssessment = wrapper('existing-member-assessment', {
    target_dimension: 'physical-material',
    target_member_id: 'thin-film-litao3-candidate',
    proposed_assessment_status: 'unvalidated-candidate',
    proposed_assessment_detail: 'No material instantiation.',
    assessment_rationale: 'Normalized-model evidence only.',
    assessment_scope: 'This member only.',
  })
  assert.throws(() => prepareAdmission(materialAssessment, commonOptions), /assessment-revision/)
  assert.throws(
    () =>
      prepareAdmission(materialAssessment, {
        ...commonOptions,
        assessmentRevision: 2,
        assessmentEventKind: 'assessment',
      }),
    /material-classification/,
  )
  const admission = prepareAdmission(materialAssessment, {
    ...commonOptions,
    assessmentRevision: 2,
    assessmentEventKind: 'assessment',
    materialClassification: 'unvalidated-candidate',
  })
  assert.equal(admission.changes[0].kind, 'material-assessment')
  assert.equal(admission.changes[0].revision, 2)

  for (const kind of ['existing-member-correction', 'ontology-change']) {
    const document = wrapper(kind, {})
    assert.throws(() => prepareAdmission(document, commonOptions), /maintainer-authored correction or ontology migration/)
  }
})

test('bridge maps a selected explanatory conjecture to a candidate problem, open disposition, framing, and exact provenance', () => {
  const frontier = JSON.parse(readFileSync(resolve(siteRoot, 'src/data/frontier.json'), 'utf8'))
  const coordinate = frontier.items.find((item) => item.classification === 'gap')
  const document = wrapper('explanatory-conjecture', {
    problem_statement: 'What mechanism could explain the bounded local memory difference?',
    explanatory_claim: 'Phase-sensitive mixing exposes history unavailable to the matched control.',
    essential_mechanism: 'Nonlinear phase rotation before the observation boundary.',
    explanation_scope: 'Normalized local linear-memory protocol only.',
    failure_condition: 'A predeclared matched comparison has a nonpositive lower envelope.',
    assumptions: [{ assumption_id: 'assumption-public-1', assumption_order: 1, assumption_text: 'The chosen quadrature remains observable.' }],
    framings: [{
      framing_id: 'public-framing-1', framing_order: 1,
      coordinate_key_version: coordinate.coordinate_key_version,
      coordinate_key: coordinate.coordinate_key,
      validation_generation: coordinate.validation_generation,
      model_id: coordinate.model_id, material_id: coordinate.material_id,
      mechanism_id: coordinate.mechanism_id, interface_id: coordinate.interface_id,
      coordinate_classification: coordinate.classification, cell_id: coordinate.cell_id,
      framing_rationale: 'A conjectural gap framing only.',
    }],
    relations: [],
  })
  const admission = prepareAdmission(document, {
    recordId: 'admission-public-explanatory-conjecture',
    admittedAt: '2026-08-12',
  })
  assert.deepEqual(admission.changes.slice(0, 4).map((change) => change.kind), [
    'problem', 'problem-version', 'conjecture', 'conjecture-version',
  ])
  assert.equal(admission.changes.find((change) => change.kind === 'conjecture-framing').coordinate_classification, 'gap')
  assert.equal(admission.changes.find((change) => change.kind === 'conjecture-disposition').status, 'open')
  assert.equal(admission.changes.filter((change) => change.kind === 'provenance-claim').length, 6)

  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'cintamani-problem-led-export-'))
  const draft = resolve(temporaryRoot, 'draft.json')
  writeFileSync(draft, `${JSON.stringify(admission, null, 2)}\n`)
  try {
    for (const command of ['validate', 'preview']) {
      const args = [
        'run', '--quiet', '--manifest-path', resolve(repositoryRoot, 'packages/cintamani-domain/Cargo.toml'), '--',
        '--workspace-root', repositoryRoot, '--format', 'json', 'admission', command, draft,
      ]
      if (command === 'preview') {
        const head = readFileSync(resolve(repositoryRoot, '.narada/kb/cintamani-domain/chain/HEAD'), 'utf8').trim()
        args.push('--admitted-by', 'public-export-test-maintainer', '--authority-kind', 'verified-public-proposal-export',
          '--authority-ref', document.export_id, '--expected-head', head)
      }
      const cargo = spawnSync('cargo', args, { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true })
      assert.equal(cargo.status, 0, `${cargo.stdout}\n${cargo.stderr}`)
      if (command === 'preview') {
        const result = JSON.parse(cargo.stdout)
        assert.equal(result.projection_valid, true)
        assert.equal(result.mutates_governed_head, false)
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('tampered export fails before draft creation and generated draft passes the Rust admission validator', () => {
  const document = wrapper('theoretical-model-member', {
    member_id: 'public-model-validation-fixture',
    member_name: 'Public model validation fixture',
    model_definition: 'A formal fixture definition.',
    computational_claim: 'A bounded fixture claim.',
    initial_epistemic_status: 'candidate',
  })
  const tampered = structuredClone(document)
  tampered.canonical.selected_revision.title = 'Tampered title'
  assert.throws(() => verifyExport(tampered), /content hash mismatch/)

  const admission = prepareAdmission(document, commonOptions)
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'cintamani-public-export-'))
  const draft = resolve(temporaryRoot, 'draft.json')
  writeFileSync(draft, `${JSON.stringify(admission, null, 2)}\n`)
  try {
    const cargo = spawnSync(
      'cargo',
      [
        'run',
        '--quiet',
        '--manifest-path',
        resolve(repositoryRoot, 'packages/cintamani-domain/Cargo.toml'),
        '--',
        '--workspace-root',
        repositoryRoot,
        '--format',
        'json',
        'admission',
        'validate',
        draft,
      ],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
    )
    assert.equal(cargo.status, 0, `${cargo.stdout}\n${cargo.stderr}`)
    const validated = JSON.parse(cargo.stdout)
    assert.equal(validated.record_id, commonOptions.recordId)
    assert.equal(validated.changes[0].kind, 'theoretical-model')
    assert.equal(validated.changes.length, 4)
    assert.deepEqual(JSON.parse(readFileSync(draft, 'utf8')), admission)

    const headPath = resolve(repositoryRoot, '.narada/kb/cintamani-domain/chain/HEAD')
    const headBefore = readFileSync(headPath, 'utf8')
    const preview = spawnSync(
      'cargo',
      [
        'run',
        '--quiet',
        '--manifest-path',
        resolve(repositoryRoot, 'packages/cintamani-domain/Cargo.toml'),
        '--',
        '--workspace-root',
        repositoryRoot,
        '--format',
        'json',
        'admission',
        'preview',
        draft,
        '--admitted-by',
        'public-export-test-maintainer',
        '--authority-kind',
        'verified-public-proposal-export',
        '--authority-ref',
        document.export_id,
        '--expected-head',
        headBefore.trim(),
      ],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
    )
    assert.equal(preview.status, 0, `${preview.stdout}\n${preview.stderr}`)
    const previewBody = JSON.parse(preview.stdout)
    assert.equal(previewBody.projection_valid, true)
    assert.equal(previewBody.mutates_governed_head, false)
    assert.equal(previewBody.relation_count_deltas.theoretical_models, 1)
    assert.equal(readFileSync(headPath, 'utf8'), headBefore)
    assert.equal(
      readFileSync(resolve(repositoryRoot, '.narada/kb/cintamani-domain/chain/HEAD'), 'utf8'),
      headBefore,
    )
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})

test('all four candidate-axis mappings pass real validate and preview without advancing HEAD or changing a preexisting projection', () => {
  const cases = [
    [
      'theoretical-model-member',
      {
        member_id: 'preview-public-model',
        member_name: 'Preview public model',
        model_definition: 'Preview-only formal definition.',
        computational_claim: 'Preview-only bounded claim.',
        initial_epistemic_status: 'candidate',
      },
      'theoretical_models',
    ],
    [
      'physical-material-member',
      {
        member_id: 'preview-public-material',
        member_name: 'Preview public material',
        material_classification: 'candidate-physical-material',
        composition_or_structure: 'Preview-only declared structure.',
        physical_evidence_boundary: 'No material or device validation.',
        initial_epistemic_status: 'unvalidated-candidate',
      },
      'materials',
    ],
    [
      'physical-calculation-mechanism-member',
      {
        member_id: 'preview-public-mechanism',
        member_name: 'Preview public mechanism',
        physical_process: 'Preview-only proposed physical process.',
        state_or_signal_carrier: 'Preview-only signal carrier.',
        initial_epistemic_status: 'candidate',
      },
      'physical_mechanisms',
    ],
    [
      'observation-interface-member',
      {
        member_id: 'preview-public-interface',
        member_name: 'Preview public interface',
        observation_kind: 'coherent-quadrature',
        units: 'normalized',
        observation_boundary: 'Preview-only post-state observation.',
        initial_epistemic_status: 'candidate',
      },
      'interfaces',
    ],
  ]
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), 'cintamani-axis-preview-'))
  const cargoManifest = resolve(repositoryRoot, 'packages/cintamani-domain/Cargo.toml')
  const headPath = resolve(repositoryRoot, '.narada/kb/cintamani-domain/chain/HEAD')
  const databasePath = resolve(temporaryRoot, 'cintamani-domain.sqlite')
  const headBefore = readFileSync(headPath, 'utf8')
  try {
    const rebuild = spawnSync(
      'cargo',
      [
        'run',
        '--quiet',
        '--manifest-path',
        cargoManifest,
        '--',
        '--workspace-root',
        repositoryRoot,
        '--database',
        databasePath,
        '--format',
        'json',
        'rebuild',
      ],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
    )
    assert.equal(rebuild.status, 0, `${rebuild.stdout}\n${rebuild.stderr}`)
    const databaseBefore = fileHash(databasePath)

    for (const [kind, detail, expectedTable] of cases) {
      const document = wrapper(kind, detail)
      const admission = prepareAdmission(document, {
        recordId: `admission-${detail.member_id}`,
        admittedAt: '2026-08-11',
      })
      assert.ok(
        admission.changes
          .filter((change) => change.kind === 'provenance-claim')
          .every((change) => change.claim_text.includes(document.content_sha256)),
      )
      const draft = resolve(temporaryRoot, `${kind}.json`)
      writeFileSync(draft, `${JSON.stringify(admission, null, 2)}\n`)
      const validate = spawnSync(
        'cargo',
        [
          'run',
          '--quiet',
          '--manifest-path',
          cargoManifest,
          '--',
          '--workspace-root',
          repositoryRoot,
          '--database',
          databasePath,
          '--format',
          'json',
          'admission',
          'validate',
          draft,
        ],
        { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
      )
      assert.equal(validate.status, 0, `${validate.stdout}\n${validate.stderr}`)
      const preview = spawnSync(
        'cargo',
        [
          'run',
          '--quiet',
          '--manifest-path',
          cargoManifest,
          '--',
          '--workspace-root',
          repositoryRoot,
          '--database',
          databasePath,
          '--format',
          'json',
          'admission',
          'preview',
          draft,
          '--admitted-by',
          'public-export-test-maintainer',
          '--authority-kind',
          'verified-public-proposal-export',
          '--authority-ref',
          document.export_id,
          '--expected-head',
          headBefore.trim(),
        ],
        { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
      )
      assert.equal(preview.status, 0, `${preview.stdout}\n${preview.stderr}`)
      const previewBody = JSON.parse(preview.stdout)
      assert.equal(previewBody.projection_valid, true)
      assert.equal(previewBody.mutates_governed_head, false)
      assert.equal(previewBody.relation_count_deltas[expectedTable], 1)
      assert.equal(
        existsSync(
          resolve(
            repositoryRoot,
            '.narada/kb/cintamani-domain/chain/generations',
            previewBody.proposed_generation,
          ),
        ),
        false,
      )
    }
    assert.equal(readFileSync(headPath, 'utf8'), headBefore)
    assert.equal(fileHash(databasePath), databaseBefore)
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
})
