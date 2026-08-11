import dimensions from '../data/dimensions.json' with { type: 'json' }

export const proposalKinds = Object.freeze([
  'theoretical-model-member',
  'physical-material-member',
  'physical-calculation-mechanism-member',
  'observation-interface-member',
  'existing-member-assessment',
  'existing-member-correction',
  'ontology-change',
])

export const publicMutationKinds = Object.freeze([
  'proposal',
  'revision',
  'criticism',
  'reply',
  'test-report',
  'interpretation',
  'appeal',
  'withdrawal',
])

export const testRelations = Object.freeze([
  'survives-test',
  'falsifies',
  'criticizes',
  'inconclusive',
  'mixed',
])

export const administrativeStates = Object.freeze([
  'submitted',
  'triaged',
  'under-review',
  'selected-for-export',
  'declined',
  'withdrawn',
  'superseded',
  'admitted-link-recorded',
])

export const axisMetadata = Object.freeze(
  dimensions.items.map((axis) => ({
    dimension_key: axis.dimension_key,
    dimension_name: axis.dimension_name,
    dimension_order: axis.dimension_order,
    dimension_role: axis.dimension_role,
    members: axis.members.map((member) => ({ member_id: member.member_id, member_name: member.member_name })),
  })),
)

const memberKeys = new Set(
  axisMetadata.flatMap((axis) => axis.members.map((member) => `${axis.dimension_key}:${member.member_id}`)),
)
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const controlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

export class InputError extends Error {
  constructor(message, field = undefined) {
    super(message)
    this.name = 'InputError'
    this.field = field
  }
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputError(`${field} must be an object`, field)
  }
  return value
}

export function text(value, field, { min = 1, max, nullable = false } = {}) {
  if (nullable && (value === null || value === undefined || value === '')) return null
  if (typeof value !== 'string') throw new InputError(`${field} must be text`, field)
  const normalized = value.trim().replace(/\r\n?/gu, '\n')
  if (controlPattern.test(normalized)) throw new InputError(`${field} contains control characters`, field)
  if (normalized.length < min || normalized.length > max) {
    throw new InputError(`${field} must contain ${min}-${max} characters`, field)
  }
  return normalized
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new InputError(`${field} is not supported`, field)
  return value
}

function slug(value, field) {
  const normalized = text(value, field, { max: 120 })
  if (!slugPattern.test(normalized)) throw new InputError(`${field} must be a lowercase kebab-case identifier`, field)
  return normalized
}

export function httpsReference(value, field = 'url') {
  const candidate = text(value, field, { max: 2048 })
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new InputError(`${field} must be a valid URL`, field)
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new InputError(`${field} must be HTTPS without user information`, field)
  }
  return parsed.href
}

function validateDetail(kind, raw) {
  const detail = object(raw, 'detail')
  switch (kind) {
    case 'theoretical-model-member':
      return {
        member_id: slug(detail.member_id, 'detail.member_id'),
        member_name: text(detail.member_name, 'detail.member_name', { max: 160 }),
        model_definition: text(detail.model_definition, 'detail.model_definition', { max: 12000 }),
        computational_claim: text(detail.computational_claim, 'detail.computational_claim', { max: 8000 }),
        initial_epistemic_status: oneOf(detail.initial_epistemic_status, 'detail.initial_epistemic_status', [
          'unspecified',
          'candidate',
          'rejected',
        ]),
      }
    case 'physical-material-member':
      return {
        member_id: slug(detail.member_id, 'detail.member_id'),
        member_name: text(detail.member_name, 'detail.member_name', { max: 160 }),
        material_classification: oneOf(detail.material_classification, 'detail.material_classification', [
          'abstract-normalized-medium',
          'candidate-physical-material',
          'validated-physical-material',
        ]),
        composition_or_structure: text(detail.composition_or_structure, 'detail.composition_or_structure', {
          max: 4000,
        }),
        physical_evidence_boundary: text(
          detail.physical_evidence_boundary,
          'detail.physical_evidence_boundary',
          { max: 8000 },
        ),
        initial_epistemic_status: oneOf(detail.initial_epistemic_status, 'detail.initial_epistemic_status', [
          'abstract-placeholder',
          'not-material-instantiated',
          'unvalidated-candidate',
          'rejected',
        ]),
      }
    case 'physical-calculation-mechanism-member':
      return {
        member_id: slug(detail.member_id, 'detail.member_id'),
        member_name: text(detail.member_name, 'detail.member_name', { max: 160 }),
        physical_process: text(detail.physical_process, 'detail.physical_process', { max: 8000 }),
        state_or_signal_carrier: text(detail.state_or_signal_carrier, 'detail.state_or_signal_carrier', {
          max: 4000,
        }),
        initial_epistemic_status: oneOf(detail.initial_epistemic_status, 'detail.initial_epistemic_status', [
          'candidate',
          'unimplemented',
          'rejected',
        ]),
      }
    case 'observation-interface-member':
      return {
        member_id: slug(detail.member_id, 'detail.member_id'),
        member_name: text(detail.member_name, 'detail.member_name', { max: 160 }),
        observation_kind: oneOf(detail.observation_kind, 'detail.observation_kind', [
          'intensity',
          'coherent-quadrature',
          'joint',
          'abstract',
        ]),
        units: text(detail.units, 'detail.units', { max: 80 }),
        observation_boundary: text(detail.observation_boundary, 'detail.observation_boundary', { max: 8000 }),
        initial_epistemic_status: oneOf(detail.initial_epistemic_status, 'detail.initial_epistemic_status', [
          'candidate',
          'unimplemented',
          'rejected',
        ]),
      }
    case 'existing-member-assessment': {
      const targetDimension = oneOf(
        detail.target_dimension,
        'detail.target_dimension',
        axisMetadata.map((axis) => axis.dimension_key),
      )
      const targetMember = slug(detail.target_member_id, 'detail.target_member_id')
      if (!memberKeys.has(`${targetDimension}:${targetMember}`)) {
        throw new InputError('assessment target must be a current canonical registry member', 'detail.target_member_id')
      }
      return {
        target_dimension: targetDimension,
        target_member_id: targetMember,
        proposed_assessment_status: slug(
          detail.proposed_assessment_status,
          'detail.proposed_assessment_status',
        ),
        proposed_assessment_detail: text(
          detail.proposed_assessment_detail,
          'detail.proposed_assessment_detail',
          { max: 4000, nullable: true },
        ),
        assessment_rationale: text(detail.assessment_rationale, 'detail.assessment_rationale', { max: 12000 }),
        assessment_scope: text(detail.assessment_scope, 'detail.assessment_scope', { max: 4000 }),
      }
    }
    case 'existing-member-correction': {
      const targetDimension = oneOf(
        detail.target_dimension,
        'detail.target_dimension',
        axisMetadata.map((axis) => axis.dimension_key),
      )
      const targetMember = slug(detail.target_member_id, 'detail.target_member_id')
      if (!memberKeys.has(`${targetDimension}:${targetMember}`)) {
        throw new InputError('correction target must be a current canonical registry member', 'detail.target_member_id')
      }
      const corrected = {
        corrected_name: text(detail.corrected_name, 'detail.corrected_name', { max: 160, nullable: true }),
        corrected_definition: text(detail.corrected_definition, 'detail.corrected_definition', {
          max: 12000,
          nullable: true,
        }),
        corrected_assessment_status: text(
          detail.corrected_assessment_status,
          'detail.corrected_assessment_status',
          { max: 120, nullable: true },
        ),
        corrected_assessment_detail: text(
          detail.corrected_assessment_detail,
          'detail.corrected_assessment_detail',
          { max: 4000, nullable: true },
        ),
      }
      if (Object.values(corrected).every((value) => value === null)) {
        throw new InputError('a correction must provide at least one explicit corrected field', 'detail')
      }
      return {
        target_dimension: targetDimension,
        target_member_id: targetMember,
        ...corrected,
        correction_rationale: text(detail.correction_rationale, 'detail.correction_rationale', { max: 12000 }),
      }
    }
    case 'ontology-change':
      return {
        change_kind: oneOf(detail.change_kind, 'detail.change_kind', [
          'add-dimension',
          'revise-dimension-definition',
          'add-status-vocabulary',
          'revise-relation',
          'other-explicit',
        ]),
        target_key: text(detail.target_key, 'detail.target_key', { max: 160, nullable: true }),
        proposed_definition: text(detail.proposed_definition, 'detail.proposed_definition', { max: 12000 }),
        compatibility_effect: text(detail.compatibility_effect, 'detail.compatibility_effect', { max: 8000 }),
        migration_requirements: text(detail.migration_requirements, 'detail.migration_requirements', {
          max: 8000,
        }),
      }
    default:
      throw new InputError('proposal kind is not supported', 'kind')
  }
}

function validateEvidence(values) {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > 16) throw new InputError('evidence must contain at most 16 items', 'evidence')
  return values.map((raw, index) => {
    const item = object(raw, `evidence[${index}]`)
    return {
      evidence_kind: oneOf(item.evidence_kind, `evidence[${index}].evidence_kind`, [
        'empirical-result',
        'simulation-result',
        'argument',
        'criticism-response',
        'other-explicit',
      ]),
      summary: text(item.summary, `evidence[${index}].summary`, { max: 12000 }),
    }
  })
}

function validateReferences(values) {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > 16) {
    throw new InputError('references must contain at most 16 items', 'references')
  }
  return values.map((raw, index) => {
    const item = object(raw, `references[${index}]`)
    return {
      reference_kind: oneOf(item.reference_kind, `references[${index}].reference_kind`, [
        'primary-source',
        'dataset',
        'software',
        'criticism',
        'context',
        'other-explicit',
      ]),
      label: text(item.label, `references[${index}].label`, { max: 300 }),
      https_url: httpsReference(item.https_url, `references[${index}].https_url`),
      source_timestamp: text(item.source_timestamp, `references[${index}].source_timestamp`, {
        max: 40,
        nullable: true,
      }),
    }
  })
}

export function validateProposalRevision(kind, raw) {
  oneOf(kind, 'kind', proposalKinds)
  const input = object(raw, 'proposal')
  return {
    title: text(input.title, 'title', { max: 160 }),
    summary: text(input.summary, 'summary', { max: 2000 }),
    rationale: text(input.rationale, 'rationale', { max: 12000 }),
    scope: text(input.scope, 'scope', { max: 4000 }),
    detail: validateDetail(kind, input.detail),
    evidence: validateEvidence(input.evidence),
    references: validateReferences(input.references),
  }
}

export function validateProposal(raw) {
  const input = object(raw, 'proposal')
  const kind = oneOf(input.kind, 'kind', proposalKinds)
  const parent = input.parent ?? null
  let parentProposalId = null
  let parentRevision = null
  if (parent !== null) {
    const parsed = object(parent, 'parent')
    parentProposalId = text(parsed.proposal_id, 'parent.proposal_id', { max: 100 })
    if (!Number.isInteger(parsed.revision) || parsed.revision < 1) {
      throw new InputError('parent.revision must be a positive integer', 'parent.revision')
    }
    parentRevision = parsed.revision
  }
  return {
    kind,
    parent_proposal_id: parentProposalId,
    parent_revision: parentRevision,
    ...validateProposalRevision(kind, input),
  }
}

export function validateCriticism(raw) {
  const input = object(raw, 'criticism')
  return {
    title: text(input.title, 'title', { max: 160 }),
    criticism: text(input.criticism, 'criticism', { max: 12000 }),
    scope: text(input.scope, 'scope', { max: 4000 }),
    references: validateReferences(input.references),
  }
}

export function validateReply(raw) {
  return { reply: text(object(raw, 'reply').reply, 'reply', { max: 12000 }) }
}

export function validateTestReport(raw) {
  const input = object(raw, 'test report')
  return {
    test_name: text(input.test_name, 'test_name', { max: 200 }),
    protocol: text(input.protocol, 'protocol', { max: 12000 }),
    result: text(input.result, 'result', { max: 12000 }),
    interpretation: text(input.interpretation, 'interpretation', { max: 12000 }),
    test_relation: oneOf(input.test_relation, 'test_relation', testRelations),
    references: validateReferences(input.references),
  }
}

export function validateInterpretation(raw) {
  const input = object(raw, 'interpretation')
  return {
    title: text(input.title, 'title', { max: 200 }),
    interpretation: text(input.interpretation, 'interpretation', { max: 12000 }),
    scope: text(input.scope, 'scope', { max: 4000 }),
  }
}

export function validateAppeal(raw) {
  return { appeal: text(object(raw, 'appeal').appeal, 'appeal', { max: 12000 }) }
}
