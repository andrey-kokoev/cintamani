import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalize } from '../worker/repository.mjs'

function option(name, { required = true } = {}) {
  const index = process.argv.indexOf(`--${name}`)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  if (required && (!value || value.startsWith('--'))) throw new Error(`--${name} is required`)
  return value
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function provenance(targetKind, targetId, provenanceKind, claimText, suffix) {
  return {
    kind: 'provenance-claim',
    provenance_id: `public-export-${targetId}-${suffix}`,
    provenance_kind: provenanceKind,
    ledger_link_id: null,
    claim_text: claimText,
    target: { target_kind: targetKind, target_id: targetId },
  }
}

function axisChanges(canonical, contentHash) {
  const kind = canonical.proposal.proposal_kind
  const detail = canonical.selected_revision.detail
  const occurredAt = canonical.selected_revision.source_timestamp
  const rationale = canonical.selected_revision.rationale
  const scope = canonical.selected_revision.scope
  let identity
  let assessment
  let identityTarget
  let assessmentTarget
  let identityId
  let assessmentId
  switch (kind) {
    case 'theoretical-model-member': {
      identityId = detail.member_id
      assessmentId = `${detail.member_id}-initial-assessment`
      identityTarget = 'theoretical-model'
      assessmentTarget = 'theoretical-model-assessment'
      identity = {
        kind: 'theoretical-model',
        model_id: detail.member_id,
        name: detail.member_name,
        description: `${detail.model_definition}\n\nBounded computational claim: ${detail.computational_claim}`,
      }
      assessment = {
        kind: 'theoretical-model-assessment',
        assessment_id: assessmentId,
        model_id: detail.member_id,
        revision: 1,
        event_kind: 'assessment',
        occurred_at: occurredAt,
        epistemic_status: detail.initial_epistemic_status,
        rationale,
        scope,
      }
      break
    }
    case 'physical-material-member': {
      identityId = detail.member_id
      assessmentId = `${detail.member_id}-initial-assessment`
      identityTarget = 'material'
      assessmentTarget = 'material-assessment'
      identity = {
        kind: 'material',
        material_id: detail.member_id,
        name: detail.member_name,
        description: [
          `Classification proposed by public revision: ${detail.material_classification}.`,
          detail.composition_or_structure,
          `Physical evidence boundary: ${detail.physical_evidence_boundary}`,
        ].join('\n\n'),
      }
      assessment = {
        kind: 'material-assessment',
        assessment_id: assessmentId,
        material_id: detail.member_id,
        revision: 1,
        event_kind: 'assessment',
        occurred_at: occurredAt,
        material_classification: detail.material_classification,
        epistemic_status: detail.initial_epistemic_status,
        rationale,
        scope,
      }
      break
    }
    case 'physical-calculation-mechanism-member': {
      identityId = detail.member_id
      assessmentId = `${detail.member_id}-initial-assessment`
      identityTarget = 'mechanism'
      assessmentTarget = 'mechanism-assessment'
      identity = {
        kind: 'physical-mechanism',
        mechanism_id: detail.member_id,
        name: detail.member_name,
        description: `${detail.physical_process}\n\nState or signal carrier: ${detail.state_or_signal_carrier}`,
      }
      assessment = {
        kind: 'mechanism-assessment',
        assessment_id: assessmentId,
        mechanism_id: detail.member_id,
        revision: 1,
        event_kind: 'assessment',
        occurred_at: occurredAt,
        epistemic_status: detail.initial_epistemic_status,
        rationale,
        scope,
      }
      break
    }
    case 'observation-interface-member': {
      identityId = detail.member_id
      assessmentId = `${detail.member_id}-initial-assessment`
      identityTarget = 'interface'
      assessmentTarget = 'interface-assessment'
      identity = {
        kind: 'interface',
        interface_id: detail.member_id,
        name: detail.member_name,
        observation_kind: detail.observation_kind,
        units: detail.units,
        description: detail.observation_boundary,
      }
      assessment = {
        kind: 'interface-assessment',
        assessment_id: assessmentId,
        interface_id: detail.member_id,
        revision: 1,
        event_kind: 'assessment',
        occurred_at: occurredAt,
        epistemic_status: detail.initial_epistemic_status,
        rationale,
        scope,
      }
      break
    }
    default:
      return null
  }
  return [
    identity,
    assessment,
    provenance(
      identityTarget,
      identityId,
      'definition',
      `Definition selected from public proposal ${canonical.proposal.proposal_id} revision ${canonical.selected_revision.revision}, export SHA-256 ${contentHash}.`,
      'definition',
    ),
    provenance(
      assessmentTarget,
      assessmentId,
      'limitation',
      `Initial assessment preserves public proposal ${canonical.proposal.proposal_id} revision ${canonical.selected_revision.revision}, export SHA-256 ${contentHash}; it does not claim independent evidence.`,
      'assessment-limitation',
    ),
  ]
}

function assessmentChanges(canonical, contentHash, revisionNumber, materialClassification, eventKind) {
  const detail = canonical.selected_revision.detail
  const common = {
    assessment_id: `${canonical.proposal.proposal_id}-assessment-r${revisionNumber}`,
    revision: revisionNumber,
    event_kind: eventKind,
    occurred_at: canonical.selected_revision.source_timestamp,
    epistemic_status: detail.proposed_assessment_status,
    rationale: detail.assessment_rationale,
    scope: detail.assessment_scope,
  }
  if (!['assessment', 'correction', 'supersession'].includes(eventKind)) {
    throw new Error('--assessment-event-kind must be assessment, correction, or supersession')
  }
  if (
    ['implemented-normalized-model', 'validated-device-evidence', 'implemented-normalized-interface'].includes(
      detail.proposed_assessment_status,
    )
  ) {
    throw new Error('evidence-bearing assessment status requires an explicit same-admission Ledger evidence mapping')
  }
  let assessment
  let targetKind
  switch (detail.target_dimension) {
    case 'theoretical-model':
      assessment = { kind: 'theoretical-model-assessment', model_id: detail.target_member_id, ...common }
      targetKind = 'theoretical-model-assessment'
      break
    case 'physical-material':
      if (!materialClassification) {
        throw new Error('--material-classification is required for a material assessment; the bridge will not invent it')
      }
      assessment = {
        kind: 'material-assessment',
        material_id: detail.target_member_id,
        material_classification: materialClassification,
        ...common,
      }
      targetKind = 'material-assessment'
      break
    case 'physical-calculation-mechanism':
      assessment = { kind: 'mechanism-assessment', mechanism_id: detail.target_member_id, ...common }
      targetKind = 'mechanism-assessment'
      break
    case 'observation-interface':
      assessment = { kind: 'interface-assessment', interface_id: detail.target_member_id, ...common }
      targetKind = 'interface-assessment'
      break
    default:
      throw new Error(`unsupported assessment target dimension: ${detail.target_dimension}`)
  }
  return [
    assessment,
    provenance(
      targetKind,
      common.assessment_id,
      'limitation',
      `Assessment selected from public proposal ${canonical.proposal.proposal_id} revision ${canonical.selected_revision.revision}, export SHA-256 ${contentHash}; no independent evidence is added by selection.`,
      'assessment-limitation',
    ),
  ]
}

function safeId(value) {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-').replaceAll(/^-+|-+$/gu, '').slice(0, 72)
}

function explanatoryConjectureChanges(canonical, contentHash) {
  const revision = canonical.selected_revision
  const detail = revision.detail
  const identity = safeId(canonical.proposal.proposal_id)
  const problemId = `problem-${identity}`
  const problemVersionId = `${problemId}-version-1`
  const conjectureId = `conjecture-${identity}`
  const conjectureVersionId = `${conjectureId}-version-1`
  const dispositionId = `${conjectureId}-disposition-1`
  const occurredAt = revision.source_timestamp
  const changes = [
    { kind: 'problem', problem_id: problemId, label: revision.title },
    {
      kind: 'problem-version', problem_version_id: problemVersionId, problem_id: problemId,
      revision: 1, event_kind: 'definition', occurred_at: occurredAt,
      problem_statement: detail.problem_statement, rationale: revision.rationale, scope: revision.scope,
    },
    { kind: 'conjecture', conjecture_id: conjectureId, problem_id: problemId, label: revision.title },
    {
      kind: 'conjecture-version', conjecture_version_id: conjectureVersionId, conjecture_id: conjectureId,
      revision: 1, event_kind: 'definition', occurred_at: occurredAt,
      statement: detail.explanatory_claim,
      rationale: `${revision.rationale}\n\nEssential mechanism: ${detail.essential_mechanism}\n\nUnresolved assumptions:\n${detail.assumptions.map((item) => `- ${item.assumption_text}`).join('\n')}`,
      scope: `${detail.explanation_scope}\n\nFailure condition: ${detail.failure_condition}`,
    },
  ]
  for (const framing of detail.framings) {
    changes.push({
      kind: 'conjecture-framing', framing_id: `${conjectureVersionId}-framing-${framing.framing_order}`,
      conjecture_version_id: conjectureVersionId, framing_order: framing.framing_order,
      coordinate_key_version: framing.coordinate_key_version, coordinate_key: framing.coordinate_key,
      validation_generation: framing.validation_generation, model_id: framing.model_id,
      material_id: framing.material_id, mechanism_id: framing.mechanism_id,
      interface_id: framing.interface_id, coordinate_classification: framing.coordinate_classification,
      cell_id: framing.cell_id, framing_rationale: framing.framing_rationale,
    })
  }
  changes.push({
    kind: 'conjecture-disposition', disposition_id: dispositionId, conjecture_id: conjectureId,
    conjecture_version_id: conjectureVersionId, revision: 1, event_kind: 'decision',
    occurred_at: occurredAt, status: 'open',
    rationale: 'Candidate public conjecture selected for governed review; no scientific test or survival is implied.',
    scope: revision.scope,
  })
  for (const [targetKind, targetId, suffix, claim] of [
    ['problem', problemId, 'problem-definition', `Problem definition selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['problem-version', problemVersionId, 'problem-version-definition', `Exact candidate problem version selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['conjecture', conjectureId, 'conjecture-definition', `Explanatory conjecture selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['conjecture-version', conjectureVersionId, 'conjecture-version-definition', `Exact candidate conjecture version selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['conjecture-disposition', dispositionId, 'open-limitation', 'Open is a non-evidentiary disposition; public selection is not survival, truth, or admission.'],
  ]) {
    changes.push(provenance(targetKind, targetId, suffix === 'open-limitation' ? 'limitation' : 'definition', `${claim} Export SHA-256 ${contentHash}.`, suffix))
  }
  for (const framing of changes.filter((change) => change.kind === 'conjecture-framing')) {
    changes.push(provenance(
      'conjecture-framing', framing.framing_id, 'limitation',
      `Coordinate framing selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}; it is conjectural organization, not an epistemic assessment. Export SHA-256 ${contentHash}.`,
      `framing-${framing.framing_order}-limitation`,
    ))
  }
  return changes
}

export function verifyExport(document) {
  const canonical = document.canonical ?? document
  const expectedHash = document.content_sha256
  if (!expectedHash) throw new Error('export wrapper must carry content_sha256')
  assert.equal(canonical.export_contract, 'cintamani-public-proposal-export@v1')
  assert.equal(canonical.criticisms_non_exhaustive, true)
  assert.equal(canonical.selected_state_event.to_state, 'selected-for-export')
  assert.equal(canonical.selected_state_event.selected_revision, canonical.selected_revision.revision)
  assert.equal(canonical.selected_revision.proposal_id, canonical.proposal.proposal_id)
  const observedHash = sha256(canonicalize(canonical))
  assert.equal(observedHash, expectedHash, 'public export content hash mismatch')
  if (document.export_id) assert.equal(document.export_id, `sha256-${observedHash}`)
  return { canonical, contentHash: observedHash }
}

export function prepareAdmission(document, options) {
  const { canonical, contentHash } = verifyExport(document)
  const kind = canonical.proposal.proposal_kind
  let changes = axisChanges(canonical, contentHash)
  if (!changes && kind === 'explanatory-conjecture') {
    changes = explanatoryConjectureChanges(canonical, contentHash)
  }
  if (!changes && kind === 'existing-member-assessment') {
    if (!Number.isInteger(options.assessmentRevision) || options.assessmentRevision < 1) {
      throw new Error('--assessment-revision is required for an existing-member assessment')
    }
    changes = assessmentChanges(
      canonical,
      contentHash,
      options.assessmentRevision,
      options.materialClassification,
      options.assessmentEventKind,
    )
  }
  if (!changes) {
    throw new Error(
      `${kind} requires an explicit maintainer-authored correction or ontology migration; no automatic admission mapping exists`,
    )
  }
  return {
    record_id: options.recordId,
    schema_version: 2,
    admitted_at: options.admittedAt,
    description: [
      `Maintainer-selected public proposal ${canonical.proposal.proposal_id} revision ${canonical.selected_revision.revision}.`,
      `Verified public export SHA-256 ${contentHash}.`,
      'This draft remains subject to canonical admission validation, preview, authority, and promotion; public selection is not scientific admission.',
    ].join(' '),
    changes,
  }
}

function main() {
  const inputPath = resolve(option('export'))
  const outputPath = resolve(option('out'))
  const recordId = option('record-id')
  const admittedAt = option('admitted-at')
  const assessmentRevisionText = option('assessment-revision', { required: false })
  const admission = prepareAdmission(JSON.parse(readFileSync(inputPath, 'utf8')), {
    recordId,
    admittedAt,
    assessmentRevision: assessmentRevisionText ? Number.parseInt(assessmentRevisionText, 10) : undefined,
    assessmentEventKind: option('assessment-event-kind', { required: false }),
    materialClassification: option('material-classification', { required: false }),
  })
  writeFileSync(outputPath, `${JSON.stringify(admission, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  process.stdout.write(`${JSON.stringify({ draft: outputPath, record_id: recordId, ready_for_domain_preview: true })}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
