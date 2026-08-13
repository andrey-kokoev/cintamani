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

function researchTopicChanges(canonical, contentHash) {
  const revision = canonical.selected_revision
  const detail = revision.detail
  const identity = safeId(canonical.proposal.proposal_id)
  const topicId = `topic-${identity}`
  const topicVersionId = `${topicId}-version-1`
  const workflowEventId = `${topicId}-workflow-1`
  const occurredAt = revision.source_timestamp
  const changes = [
    { kind: 'research-topic', topic_id: topicId, label: revision.title },
    {
      kind: 'research-topic-version',
      topic_version_id: topicVersionId,
      topic_id: topicId,
      revision: 1,
      event_kind: 'definition',
      occurred_at: occurredAt,
      title: revision.title,
      open_problem: detail.open_problem,
      why_open: detail.why_open,
      scope: detail.topic_scope,
      next_discriminating_criticism_or_test: detail.next_discriminating_criticism_or_test,
      non_claims: detail.non_claims,
    },
    {
      kind: 'research-topic-workflow-event',
      workflow_event_id: workflowEventId,
      topic_id: topicId,
      revision: 1,
      event_kind: 'administrative-workflow',
      occurred_at: occurredAt,
      status: 'active',
      rationale: 'Maintainer selected a bounded fallible research prompt for governed admission review.',
      scope: revision.scope,
    },
  ]
  for (const [index, locus] of detail.loci.entries()) {
    changes.push({
      kind: 'research-topic-locus',
      locus_id: `${topicVersionId}-locus-${index + 1}`,
      topic_version_id: topicVersionId,
      locus_order: index + 1,
      locus_kind: locus.locus_kind ?? locus,
    })
  }
  for (const [index, origin] of detail.origins.entries()) {
    if (origin.origin_kind === 'public-explanatory-conjecture-revision') {
      throw new Error(
        'a public-only conjecture origin must first be admitted; the bridge will not invent canonical problem/conjecture identity',
      )
    }
    changes.push({
      kind: 'research-topic-origin',
      origin_id: `${topicVersionId}-origin-${index + 1}`,
      topic_version_id: topicVersionId,
      origin_order: index + 1,
      origin_kind: origin.origin_kind === 'canonical-problem-version' ? 'problem-version' : 'conjecture-version',
      problem_version_id: origin.canonical_problem_version_id,
      conjecture_version_id: origin.canonical_conjecture_version_id,
      relationship: origin.relationship,
      rationale: origin.origin_rationale,
    })
  }
  for (const framing of detail.framings) {
    throw new Error(
      `topic coordinate ${framing.coordinate_key} needs an exact admitted conjecture framing link; the bridge will not create a prospective coordinate`,
    )
  }
  for (const relation of detail.topic_relations) {
    throw new Error(
      `public topic relation ${relation.topic_relation_id ?? relation.relation_kind} needs both governed exact topic versions before admission`,
    )
  }
  for (const [targetKind, targetId, suffix, provenanceKind, claim] of [
    ['research-topic', topicId, 'identity-definition', 'definition', `Research-topic identity selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['research-topic-version', topicVersionId, 'version-definition', 'definition', `Exact fallible topic revision selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}.`],
    ['research-topic-workflow-event', workflowEventId, 'workflow-limitation', 'limitation', 'Active is an administrative discoverability state, not truth, importance, confidence, priority, consensus, or roadmap authority.'],
  ]) {
    changes.push(provenance(targetKind, targetId, provenanceKind, `${claim} Export SHA-256 ${contentHash}.`, suffix))
  }
  return changes
}

function experimentChanges(canonical, contentHash) {
  const revision = canonical.selected_revision
  const detail = revision.detail
  const unresolvedTargets = detail.targets.filter((target) =>
    !['problem-version', 'conjecture-version', 'research-topic-version'].includes(target.target_kind),
  )
  if (unresolvedTargets.length > 0) {
    const kinds = [...new Set(unresolvedTargets.map((target) => target.target_kind))].join(', ')
    throw new Error(
      `proposed experiment contains unresolved public-only or prospective target kinds (${kinds}); admit canonical targets before export`,
    )
  }
  const experimentId = detail.experiment_id
  const versionId = `${experimentId}-version-${detail.experiment_version}`
  const changes = [
    { kind: 'experiment', experiment_id: experimentId, label: revision.title },
    {
      kind: 'experiment-version',
      experiment_version_id: versionId,
      experiment_id: experimentId,
      revision: detail.experiment_version,
      event_kind: detail.experiment_version === 1 ? 'definition' : 'correction',
      occurred_at: revision.source_timestamp,
      title: revision.title,
      experiment_kind: detail.experiment_kind,
      intent: detail.intent,
      targets: detail.targets.map((target, index) => ({
        target_id: target.target_id ?? `${versionId}-target-${index + 1}`,
        target_order: index + 1,
        target_kind: target.target_kind,
        target_id_value: target.target_id_value ?? target.target_id,
        target_revision: target.target_revision,
        target_label: target.target_label,
      })),
      protocols: detail.protocols.map((protocol, index) => ({ ...protocol, protocol_order: index + 1 })),
      controls: detail.controls.map((control, index) => ({ ...control, control_order: index + 1 })),
      observables: detail.observables.map((observable, index) => ({ ...observable, observable_order: index + 1 })),
      calibrations: detail.calibration.map((calibration, index) => ({ ...calibration, calibration_order: index + 1 })),
      repetition: detail.repetitions,
      uncertainty: detail.uncertainty,
      criteria: detail.criteria.map((criterion, index) => ({ ...criterion, criterion_order: index + 1 })),
      confounds: detail.confounds.map((confound, index) => ({ ...confound, confound_order: index + 1 })),
      raw_artifacts: detail.raw_artifacts.map((artifact, index) => ({ ...artifact, artifact_order: index + 1 })),
      non_claims: detail.nonclaims,
      dependencies: detail.dependencies.map((dependency, index) => ({ ...dependency, dependency_order: index + 1 })),
      relations: detail.relations,
      equipment_requirements: detail.equipment_requirements.map((requirement, index) => ({ ...requirement, group_order: requirement.group_order ?? index + 1 })),
      topic_links: detail.topic_links,
    },
    provenance('experiment', experimentId, 'definition', `Proposed experiment identity selected from public proposal ${canonical.proposal.proposal_id} revision ${revision.revision}; no run or result is admitted. Export SHA-256 ${contentHash}.`, 'identity-definition'),
    provenance('experiment-version', versionId, 'limitation', `Exact proposed experiment version selected from public proposal ${canonical.proposal.proposal_id}; it remains a criticizable definition without evidence. Export SHA-256 ${contentHash}.`, 'version-limitation'),
  ]
  for (const target of detail.targets) {
    const targetId = target.target_id ?? target.target_id_value
    changes.push(provenance('experiment-target', targetId, 'limitation', `Exact target retained from public experiment proposal ${canonical.proposal.proposal_id}; target type and revision are not an outcome.`, `target-${safeId(targetId)}`))
  }
  return changes
}

function equipmentTypeChanges(canonical, contentHash) {
  const revision = canonical.selected_revision
  const detail = revision.detail
  const equipmentTypeId = detail.equipment_type_id
  const versionId = `${equipmentTypeId}-version-${detail.equipment_type_version}`
  return [
    { kind: 'equipment-type', equipment_type_id: equipmentTypeId, label: detail.title },
    {
      kind: 'equipment-type-version',
      equipment_type_version_id: versionId,
      equipment_type_id: equipmentTypeId,
      revision: detail.equipment_type_version,
      event_kind: detail.equipment_type_version === 1 ? 'definition' : 'correction',
      occurred_at: revision.source_timestamp,
      title: detail.title,
      description: detail.description,
      capabilities: detail.capabilities.map((capability, index) => ({ ...capability, capability_order: index + 1 })),
      operating_limits: detail.operating_limits.map((limit, index) => ({ ...limit, limit_order: index + 1 })),
      calibrations: detail.calibrations.map((calibration, index) => ({ ...calibration, calibration_order: index + 1 })),
      safety_requirements: detail.safety_requirements.map((safety, index) => ({ ...safety, safety_order: index + 1 })),
      interface_requirements: detail.interface_requirements.map((item, index) => ({ ...item, interface_order: index + 1 })),
      non_claims: detail.nonclaims,
    },
    provenance('equipment-type', equipmentTypeId, 'definition', `Capability-based equipment type selected from public proposal ${canonical.proposal.proposal_id}; this is not inventory or procurement. Export SHA-256 ${contentHash}.`, 'identity-definition'),
    provenance('equipment-type-version', versionId, 'limitation', `Exact capability type version selected from public proposal ${canonical.proposal.proposal_id}; availability and vendors are not claimed. Export SHA-256 ${contentHash}.`, 'version-limitation'),
  ]
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
  if (!changes && kind === 'research-topic') {
    changes = researchTopicChanges(canonical, contentHash)
  }
  if (!changes && kind === 'proposed-experiment') {
    changes = experimentChanges(canonical, contentHash)
  }
  if (!changes && kind === 'equipment-type-proposal') {
    changes = equipmentTypeChanges(canonical, contentHash)
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
