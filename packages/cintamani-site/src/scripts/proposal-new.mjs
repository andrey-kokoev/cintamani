import {
  announce,
  element,
  loadSessionWithStatus,
  readJson,
  renderTurnstileSlots,
  turnstileToken,
  writeJson,
} from './public-api.mjs'
import {
  authenticateWallet,
  baseSmartWalletProvider,
  connectWallet,
  discoverWallets,
  publishPaidProposal,
} from './wallet-contribution.mjs'
import { conjectureRelationKinds, researchTopicRelationKinds } from '../lib/proposals.mjs'

const fieldContracts = {
  'theoretical-model-member': [
    { name: 'member_id', label: 'Member identifier', kind: 'slug', max: 120, help: 'A stable lowercase identifier, for example delay-line-model.' },
    { name: 'member_name', label: 'Member name', kind: 'input', max: 160, help: 'The readable name shown in the search-space dimension.' },
    { name: 'model_definition', label: 'Model definition', kind: 'textarea', max: 12000, rows: 6, help: 'Define the model precisely enough to distinguish it from neighboring computation models.' },
    { name: 'computational_claim', label: 'Bounded computational claim', kind: 'textarea', max: 8000, rows: 5, help: 'State the narrow capability being proposed, including the regime where it may fail.' },
    { name: 'initial_epistemic_status', label: 'Initial assessment status', kind: 'enum', values: ['unspecified', 'candidate', 'rejected'], help: 'This is a non-evidentiary starting classification, not a score.' },
  ],
  'physical-material-member': [
    { name: 'member_id', label: 'Member identifier', kind: 'slug', max: 120, help: 'A stable lowercase identifier, for example thin-film-material-candidate.' },
    { name: 'member_name', label: 'Member name', kind: 'input', max: 160, help: 'The readable material name shown in the second dimension.' },
    { name: 'material_classification', label: 'Material classification', kind: 'enum', values: ['abstract-normalized-medium', 'candidate-physical-material', 'validated-physical-material'], help: 'Choose only the strongest classification justified by the proposal itself.' },
    { name: 'composition_or_structure', label: 'Composition or structure', kind: 'textarea', max: 4000, rows: 4, help: 'Describe the proposed composition, geometry, or abstract normalized medium.' },
    { name: 'physical_evidence_boundary', label: 'Physical evidence boundary', kind: 'textarea', max: 8000, rows: 5, help: 'Say exactly which material or device properties remain unvalidated.' },
    { name: 'initial_epistemic_status', label: 'Initial assessment status', kind: 'enum', values: ['abstract-placeholder', 'not-material-instantiated', 'unvalidated-candidate', 'rejected'], help: 'A candidate is not a validated material or device.' },
  ],
  'physical-calculation-mechanism-member': [
    { name: 'member_id', label: 'Member identifier', kind: 'slug', max: 120, help: 'A stable lowercase identifier, for example coherent-path-interference.' },
    { name: 'member_name', label: 'Member name', kind: 'input', max: 160, help: 'The readable process name shown in the third dimension.' },
    { name: 'physical_process', label: 'Physical process', kind: 'textarea', max: 8000, rows: 5, help: 'Describe how the physical evolution performs the proposed calculation.' },
    { name: 'state_or_signal_carrier', label: 'State or signal carrier', kind: 'textarea', max: 4000, rows: 4, help: 'Name what carries state or signal through the process.' },
    { name: 'initial_epistemic_status', label: 'Initial assessment status', kind: 'enum', values: ['candidate', 'unimplemented', 'rejected'], help: 'This administrative proposal does not establish implementation.' },
  ],
  'observation-interface-member': [
    { name: 'member_id', label: 'Member identifier', kind: 'slug', max: 120, help: 'A stable lowercase identifier, for example normalized-quadrature-readout.' },
    { name: 'member_name', label: 'Member name', kind: 'input', max: 160, help: 'The readable interface name shown in the fourth dimension.' },
    { name: 'observation_kind', label: 'Observation kind', kind: 'enum', values: ['intensity', 'coherent-quadrature', 'joint', 'abstract'], help: 'Choose the measured observable, not an assumed detector implementation.' },
    { name: 'units', label: 'Observation units', kind: 'input', max: 80, help: 'Use explicit units such as normalized amplitude or dimensionless intensity.' },
    { name: 'observation_boundary', label: 'Observation boundary', kind: 'textarea', max: 8000, rows: 5, help: 'Separate modeled readout from detector calibration and physical-device claims.' },
    { name: 'initial_epistemic_status', label: 'Initial assessment status', kind: 'enum', values: ['candidate', 'unimplemented', 'rejected'], help: 'This status is non-evidentiary and may be criticized.' },
  ],
  'existing-member-assessment': [
    { name: 'target_dimension', label: 'Target dimension', kind: 'axis', help: 'Choose the canonical axis containing the assessed member.' },
    { name: 'target_member_id', label: 'Existing member', kind: 'member', help: 'The assessment will target this exact canonical member.' },
    { name: 'proposed_assessment_status', label: 'Proposed assessment status', kind: 'slug', max: 120, help: 'Use a lowercase status identifier compatible with the member family.' },
    { name: 'proposed_assessment_detail', label: 'Assessment detail', kind: 'textarea', max: 4000, rows: 4, optional: true, help: 'Optional: add family-specific classification or observation detail.' },
    { name: 'assessment_rationale', label: 'Assessment rationale', kind: 'textarea', max: 12000, rows: 6, help: 'Explain what criticism or evidence warrants this assessment.' },
    { name: 'assessment_scope', label: 'Assessment scope', kind: 'textarea', max: 4000, rows: 4, help: 'Bound where the assessment applies and what remains open.' },
  ],
  'existing-member-correction': [
    { name: 'target_dimension', label: 'Target dimension', kind: 'axis', help: 'Choose the canonical axis containing the record to correct.' },
    { name: 'target_member_id', label: 'Existing member', kind: 'member', help: 'The correction will target this exact canonical member.' },
    { name: 'corrected_name', label: 'Corrected name', kind: 'input', max: 160, optional: true, help: 'Optional: supply a replacement readable name.' },
    { name: 'corrected_definition', label: 'Corrected definition', kind: 'textarea', max: 12000, rows: 6, optional: true, help: 'Optional: state the complete corrected definition.' },
    { name: 'corrected_assessment_status', label: 'Corrected assessment status', kind: 'input', max: 120, optional: true, help: 'Optional: state a replacement status.' },
    { name: 'corrected_assessment_detail', label: 'Corrected assessment detail', kind: 'textarea', max: 4000, rows: 4, optional: true, help: 'Optional: state replacement family-specific detail.' },
    { name: 'correction_rationale', label: 'Correction rationale', kind: 'textarea', max: 12000, rows: 6, help: 'Explain the error and why the proposed correction is preferable.' },
  ],
  'ontology-change': [
    { name: 'change_kind', label: 'Change kind', kind: 'enum', values: ['add-dimension', 'revise-dimension-definition', 'add-status-vocabulary', 'revise-relation', 'other-explicit'], help: 'Choose the narrowest structural change that fits.' },
    { name: 'target_key', label: 'Target key', kind: 'input', max: 160, optional: true, help: 'Optional: name the existing dimension, vocabulary, or relation affected.' },
    { name: 'proposed_definition', label: 'Proposed definition', kind: 'textarea', max: 12000, rows: 6, help: 'State the proposed ontology definition in clear prose.' },
    { name: 'compatibility_effect', label: 'Compatibility effect', kind: 'textarea', max: 8000, rows: 5, help: 'Explain how existing identities, paths, and records would be interpreted.' },
    { name: 'migration_requirements', label: 'Migration requirements', kind: 'textarea', max: 8000, rows: 5, help: 'Describe the bounded data or tooling migration needed.' },
  ],
  'explanatory-conjecture': [
    { name: 'problem_statement', label: 'Problem', kind: 'textarea', max: 12000, rows: 5, help: 'State the problem the conjecture is meant to solve, not merely its topic.' },
    { name: 'explanatory_claim', label: 'Explanatory claim', kind: 'textarea', max: 12000, rows: 6, help: 'State what the conjecture says happens and why it matters.' },
    { name: 'essential_mechanism', label: 'Essential mechanism', kind: 'textarea', max: 12000, rows: 6, help: 'Name the causal or computational mechanism without hiding it behind a label.' },
    { name: 'explanation_scope', label: 'Explanation scope', kind: 'textarea', max: 8000, rows: 4, help: 'Bound the regimes and claims the explanation covers.' },
    { name: 'failure_condition', label: 'Failure condition', kind: 'textarea', max: 12000, rows: 5, help: 'Describe an observation or criticism that would show the explanation fails.' },
    { name: 'assumptions', label: 'Unresolved assumptions', kind: 'textarea', max: 12000, rows: 5, help: 'Enter one unresolved assumption per line. At least one is required.' },
  ],
  'research-topic': [
    { name: 'open_problem', label: 'Open problem', kind: 'textarea', max: 12000, rows: 5, help: 'State the unresolved problem rather than only naming a field.' },
    { name: 'why_open', label: 'Why it remains open', kind: 'textarea', max: 12000, rows: 5, help: 'Name the missing explanation, criticism, observation, or discriminating test.' },
    { name: 'topic_scope', label: 'Topic scope', kind: 'textarea', max: 4000, rows: 4, help: 'Bound the systems, regimes, and exact versions this prompt concerns.' },
    { name: 'next_discriminating_criticism_or_test', label: 'Next discriminating criticism or test', kind: 'textarea', max: 12000, rows: 5, help: 'Describe the next result that would distinguish live alternatives or expose a failure.' },
    { name: 'non_claims', label: 'Explicit non-claims', kind: 'textarea', max: 12000, rows: 5, help: 'Say what publication does not establish, including evidence and roadmap authority.' },
  ],
}

export const detailFieldPlaceholders = Object.freeze({
  'theoretical-model-member': Object.freeze({
    member_id: 'e.g., bounded-delay-state-model',
    member_name: 'e.g., Bounded delay-state model',
    model_definition: 'e.g., A finite-dimensional recurrent state updated once per normalized time step from the prior state and current scalar input.',
    computational_claim: 'e.g., May retain linear input history for delays 1–4 under one declared normalized readout and test protocol.',
    initial_epistemic_status: 'Choose an initial assessment status…',
  }),
  'physical-material-member': Object.freeze({
    member_id: 'e.g., normalized-dielectric-medium-candidate',
    member_name: 'e.g., Normalized dielectric medium candidate',
    material_classification: 'Choose a material classification…',
    composition_or_structure: 'e.g., A bounded anisotropic dielectric model with normalized coefficients; no fabrication stack is claimed.',
    physical_evidence_boundary: 'e.g., No measured loss, dispersion, thermal stability, fabrication tolerance, or device calibration is supplied.',
    initial_epistemic_status: 'Choose an initial assessment status…',
  }),
  'physical-calculation-mechanism-member': Object.freeze({
    member_id: 'e.g., coherent-path-interference',
    member_name: 'e.g., Coherent path interference',
    physical_process: 'e.g., Phase-coherent paths recombine so relative phase changes the normalized output amplitude.',
    state_or_signal_carrier: 'e.g., Normalized complex field amplitudes assigned to declared paths.',
    initial_epistemic_status: 'Choose an initial assessment status…',
  }),
  'observation-interface-member': Object.freeze({
    member_id: 'e.g., normalized-quadrature-readout',
    member_name: 'e.g., Normalized quadrature readout',
    observation_kind: 'Choose an observation kind…',
    units: 'e.g., normalized amplitude',
    observation_boundary: 'e.g., Additive observation noise is applied after state evolution; no photodiode model or detector calibration is assumed.',
    initial_epistemic_status: 'Choose an initial assessment status…',
  }),
  'existing-member-assessment': Object.freeze({
    target_dimension: 'Choose a canonical dimension…',
    target_member_id: 'Choose an existing member…',
    proposed_assessment_status: 'e.g., candidate',
    proposed_assessment_detail: 'e.g., Normalized observation-noise boundary; no physical detector mapping.',
    assessment_rationale: 'e.g., The current record identifies a bounded candidate but does not establish a fabricated implementation.',
    assessment_scope: 'e.g., Applies only to the named member and declared normalized regime; other materials and interfaces remain open.',
  }),
  'existing-member-correction': Object.freeze({
    target_dimension: 'Choose a canonical dimension…',
    target_member_id: 'Choose an existing member…',
    corrected_name: 'e.g., Normalized coherent-quadrature interface',
    corrected_definition: 'e.g., A readout of one declared field quadrature after state evolution, expressed in normalized units.',
    corrected_assessment_status: 'e.g., candidate',
    corrected_assessment_detail: 'e.g., Observation kind: coherent-quadrature; units: normalized amplitude.',
    correction_rationale: 'e.g., The existing wording conflates normalized observation noise with calibrated detector noise.',
  }),
  'ontology-change': Object.freeze({
    change_kind: 'Choose a change kind…',
    target_key: 'e.g., observation-interface',
    proposed_definition: 'e.g., Observation interface denotes the declared map from modeled state to reported observable, separate from physical detector implementation.',
    compatibility_effect: 'e.g., Existing interface identities remain stable; records gain the revised definition without changing their evidence status.',
    migration_requirements: 'e.g., Append a versioned definition event and rebuild derived views; preserve prior admissions byte-for-byte.',
  }),
  'explanatory-conjecture': Object.freeze({
    problem_statement: 'e.g., The current model does not explain why phase-sensitive readout preserves a lag-4 advantage under normalized observation noise.',
    explanatory_claim: 'e.g., Kerr mixing distributes recent inputs across observable quadratures in a way the disabled control cannot reproduce.',
    essential_mechanism: 'e.g., Driven nonlinear phase rotation couples amplitude history into the selected output quadrature before observation noise is added.',
    explanation_scope: 'e.g., The declared normalized model, linear-memory targets, and frozen readout protocol only.',
    failure_condition: 'e.g., The matched Kerr-minus-disabled lower envelope is nonpositive under the predeclared bounded parameter region.',
    assumptions: 'e.g., The normalized state equation remains an adequate abstraction in the tested regime.\ne.g., The chosen quadrature is available without adding state information.',
  }),
  'research-topic': Object.freeze({
    open_problem: 'e.g., Can the proposed local rewrite be stated without a hidden global selector?',
    why_open: 'e.g., Existing observations do not supply a typed local rule or establish conditional locality.',
    topic_scope: 'e.g., Exact public conjecture revision 1 and bounded finite defect graphs only.',
    next_discriminating_criticism_or_test: 'e.g., Find matched local inputs whose outputs differ only with remote graph context.',
    non_claims: 'e.g., No physical realization, canonical coordinate, truth, priority, or interaction-net computation is claimed.',
  }),
})

function labelText(value) {
  return value.replaceAll('-', ' ')
}

function requiredMarker(optional) {
  return element('span', {
    className: optional ? 'optional-marker' : 'required-marker',
    text: optional ? 'Optional' : 'Required',
  })
}

function chooseOption(text) {
  return element('option', {
    text,
    attributes: { value: '', disabled: '', selected: '' },
  })
}

function fieldNode(contract, config, proposalKind) {
  const { name, label, kind, values, max, rows, optional = false, help } = contract
  const placeholder = detailFieldPlaceholders[proposalKind][name]
  const id = `detail-${name}`
  const helpId = `${id}-help`
  const wrapper = element('div', { className: 'form-field' })
  const fieldLabel = element('label', { attributes: { for: id } })
  fieldLabel.append(`${label} `, requiredMarker(optional))
  let control
  if (kind === 'axis') {
    control = element('select', { attributes: { id, name } })
    control.append(chooseOption(placeholder))
    for (const axis of config.dimensions) {
      control.append(element('option', { text: axis.dimension_name, attributes: { value: axis.dimension_key } }))
    }
  } else if (kind === 'member') {
    control = element('select', { attributes: { id, name } })
    control.append(chooseOption(placeholder))
  } else if (kind === 'enum') {
    control = element('select', { attributes: { id, name } })
    control.append(chooseOption(placeholder))
    for (const value of values) {
      control.append(element('option', { text: labelText(value), attributes: { value } }))
    }
  } else if (kind === 'textarea') {
    control = element('textarea', { attributes: { id, name, rows: String(rows ?? 4), placeholder } })
  } else {
    control = element('input', { attributes: { id, name, type: 'text', placeholder } })
    if (kind === 'slug') {
      control.pattern = '[a-z0-9]+(?:-[a-z0-9]+)*'
      control.autocapitalize = 'none'
      control.spellcheck = false
    }
  }
  control.required = !optional
  if (max) control.maxLength = max
  if (kind === 'member') control.dataset.placeholder = placeholder
  control.dataset.detail = 'true'
  control.setAttribute('aria-describedby', helpId)
  const helpNode = element('p', { className: 'form-field-help', text: help, attributes: { id: helpId } })
  const error = element('p', {
    className: 'form-field-error',
    attributes: { 'data-field-error-for': name, hidden: '' },
  })
  wrapper.append(fieldLabel, control, helpNode, error)
  return wrapper
}

function syncMemberSelect(container, config) {
  const axisSelect = container.querySelector('[name="target_dimension"]')
  const memberSelect = container.querySelector('[name="target_member_id"]')
  if (!axisSelect || !memberSelect) return
  const render = () => {
    memberSelect.replaceChildren()
    memberSelect.append(chooseOption(memberSelect.dataset.placeholder))
    const axis = config.dimensions.find((item) => item.dimension_key === axisSelect.value)
    for (const member of axis?.members ?? []) {
      memberSelect.append(element('option', { text: member.member_name, attributes: { value: member.member_id } }))
    }
  }
  axisSelect.addEventListener('change', render)
  render()
}

function syncConditionalSections(form) {
  const sections = [
    form.querySelector('[data-conjecture-framings]'),
    form.querySelector('[data-topic-fields]'),
    form.querySelector('[data-conjecture-relations]'),
  ].filter(Boolean)
  for (const section of sections) {
    for (const control of section.querySelectorAll('input, select, textarea, button')) {
      control.disabled = Boolean(control.closest('[hidden]'))
    }
  }
}

function renderDetailFields(form, config) {
  const container = form.querySelector('[data-detail-fields]')
  const kind = form.elements.kind.value
  if (!kind) {
    container.replaceChildren(
      element('p', { className: 'form-section-help', text: 'Choose a proposal kind to reveal its required fields.' }),
    )
    return
  }
  container.replaceChildren(...fieldContracts[kind].map((contract) => fieldNode(contract, config, kind)))
  syncMemberSelect(container, config)
  form.querySelector('[data-conjecture-framings]').hidden = !['explanatory-conjecture', 'research-topic'].includes(kind)
  form.querySelector('[data-topic-fields]').hidden = kind !== 'research-topic'
  form.querySelector('[data-conjecture-relations]').hidden = kind !== 'explanatory-conjecture'
  syncConditionalSections(form)
}

function coordinateLabel(item) {
  const classification = item.classification === 'gap' ? 'gap' : `admitted cell · ${item.status ?? 'unassessed'}`
  return `${item.model_name} / ${item.material_name} / ${item.mechanism_name} / ${item.interface_name} — ${classification}`
}

function appendFraming(form, config, selectedKey = '') {
  const list = form.querySelector('[data-framing-list]')
  if (list.children.length >= 32) return
  const row = element('fieldset', { className: 'coordinate-framing-row' })
  const select = element('select', { attributes: { name: 'coordinate_key', required: '' } })
  select.append(chooseOption('Choose a current frontier coordinate…'))
  for (const item of config.frontier.items) {
    const option = element('option', { text: coordinateLabel(item), attributes: { value: item.coordinate_key } })
    if (item.coordinate_key === selectedKey) option.selected = true
    select.append(option)
  }
  const selectLabel = element('label', { className: 'form-field form-field--wide' })
  selectLabel.append('Coordinate ', requiredMarker(false), select)
  const rationale = element('textarea', {
    attributes: {
      name: 'framing_rationale',
      rows: '3',
      maxlength: '4000',
      required: '',
      placeholder: 'e.g., This coordinate frames where the explanation is conjectured to apply; it does not assert that the coordinate is physically realizable.',
    },
  })
  const rationaleLabel = element('label', { className: 'form-field form-field--wide' })
  rationaleLabel.append('Framing rationale ', requiredMarker(false), rationale)
  const remove = element('button', { className: 'text-button', text: 'Remove framing', attributes: { type: 'button' } })
  remove.addEventListener('click', () => row.remove())
  row.append(selectLabel, rationaleLabel, remove)
  list.append(row)
}

function configureFramings(root, form, config) {
  const url = new URL(globalThis.location.href)
  const selected = url.searchParams.get('coordinate') ?? ''
  const generation = url.searchParams.get('generation')
  if (selected) {
    const coordinate = config.frontier.items.find((item) => item.coordinate_key === selected)
    if (coordinate && (!generation || generation === coordinate.validation_generation)) {
      const requestedKind = url.searchParams.get('kind')
      form.elements.kind.value = requestedKind === 'research-topic' ? requestedKind : 'explanatory-conjecture'
      renderDetailFields(form, config)
      appendFraming(form, config, selected)
    }
  }
  root.querySelector('[data-add-framing]').addEventListener('click', () => appendFraming(form, config))
  root.querySelector('[data-add-relation]').addEventListener('click', () => {
    const list = form.querySelector('[data-relation-list]')
    if (list.children.length >= 16) return
    const row = element('fieldset', { className: 'conjecture-relation-row' })
    const kind = element('select', { attributes: { name: 'relation_kind', required: '' } })
    kind.append(chooseOption('Choose a relation…'))
    for (const value of conjectureRelationKinds) {
      kind.append(element('option', { text: labelText(value), attributes: { value } }))
    }
    const kindLabel = element('label', { className: 'form-field form-field--wide' })
    kindLabel.append('Relation ', requiredMarker(false), kind)
    const fields = [
      ['target_proposal_id', 'Target proposal ID', 'input', 'e.g., proposal-AbCdEf123456'],
      ['target_revision', 'Target revision', 'number', 'e.g., 1'],
      ['relation_claim', 'Relation claim', 'textarea', 'e.g., Both conjectures address the same memory mechanism but predict incompatible observation dependence.'],
      ['relation_scope', 'Relation scope', 'textarea', 'e.g., These exact public revisions and their declared normalized regime only.'],
    ]
    row.append(kindLabel)
    for (const [name, label, type, placeholder] of fields) {
      const control = type === 'textarea'
        ? element('textarea', { attributes: { name, rows: '3', maxlength: name === 'relation_claim' ? '12000' : '4000', placeholder, required: '' } })
        : element('input', { attributes: { name, type: type === 'number' ? 'number' : 'text', min: type === 'number' ? '1' : undefined, placeholder, required: '' } })
      const wrapper = element('label', { className: 'form-field form-field--wide' })
      wrapper.append(`${label} `, requiredMarker(false), control)
      row.append(wrapper)
    }
    const remove = element('button', { className: 'text-button', text: 'Remove relation', attributes: { type: 'button' } })
    remove.addEventListener('click', () => row.remove())
    row.append(remove)
    list.append(row)
  })
  syncConditionalSections(form)
}

function appendTopicOrigin(form) {
  const list = form.querySelector('[data-topic-origin-list]')
  if (list.children.length >= 32) return
  const row = element('fieldset', { className: 'topic-origin-row' })
  const kind = element('select', { attributes: { name: 'topic_origin_kind', required: '' } })
  kind.append(chooseOption('Choose an exact origin kind…'))
  for (const value of ['canonical-problem-version', 'canonical-conjecture-version', 'public-explanatory-conjecture-revision']) {
    kind.append(element('option', { text: labelText(value), attributes: { value } }))
  }
  const identifier = element('input', {
    attributes: { name: 'topic_origin_id', required: '', placeholder: 'e.g., conjecture-example-version-1' },
  })
  const targetRevision = element('input', {
    attributes: { name: 'topic_origin_revision', type: 'number', min: '1', placeholder: 'e.g., 1' },
  })
  const relationship = element('select', { attributes: { name: 'topic_origin_relationship', required: '' } })
  relationship.append(chooseOption('Choose an origin relation…'))
  for (const value of ['derived-from', 'motivated-by', 'criticizes', 'tests']) {
    relationship.append(element('option', { text: labelText(value), attributes: { value } }))
  }
  const rationale = element('textarea', {
    attributes: {
      name: 'topic_origin_rationale',
      rows: '3',
      maxlength: '4000',
      required: '',
      placeholder: 'e.g., This exact conjecture revision motivates the bounded open problem without supplying evidence.',
    },
  })
  for (const [label, control, optional] of [
    ['Origin kind', kind, false],
    ['Exact version ID or public proposal ID', identifier, false],
    ['Public target revision (public origin only)', targetRevision, true],
    ['Relationship', relationship, false],
    ['Origin rationale', rationale, false],
  ]) {
    const wrapper = element('label', { className: 'form-field form-field--wide' })
    wrapper.append(`${label} `, requiredMarker(optional), control)
    row.append(wrapper)
  }
  const remove = element('button', { className: 'text-button', text: 'Remove origin', attributes: { type: 'button' } })
  remove.addEventListener('click', () => row.remove())
  row.append(remove)
  list.append(row)
}

function appendTopicRelation(form) {
  const list = form.querySelector('[data-topic-relation-list]')
  if (list.children.length >= 16) return
  const row = element('fieldset', { className: 'topic-relation-row' })
  const kind = element('select', { attributes: { name: 'topic_relation_kind', required: '' } })
  kind.append(chooseOption('Choose a topic relation…'))
  for (const value of researchTopicRelationKinds) {
    kind.append(element('option', { text: labelText(value), attributes: { value } }))
  }
  const kindWrapper = element('label', { className: 'form-field form-field--wide' })
  kindWrapper.append('Relation ', requiredMarker(false), kind)
  row.append(kindWrapper)
  for (const [name, label, type, placeholder] of [
    ['topic_target_proposal_id', 'Target topic proposal ID', 'text', 'e.g., proposal-AbCdEf123456'],
    ['topic_target_revision', 'Target revision', 'number', 'e.g., 1'],
    ['topic_relation_claim', 'Relation claim', 'textarea', 'e.g., This topic depends on the exact formal-fragment topic because its simulator consumes that rule set.'],
    ['topic_relation_scope', 'Relation scope', 'textarea', 'e.g., These exact public revisions only; neither record is merged or replaced.'],
  ]) {
    const control = type === 'textarea'
      ? element('textarea', { attributes: { name, rows: '3', maxlength: name === 'topic_relation_claim' ? '12000' : '4000', placeholder, required: '' } })
      : element('input', { attributes: { name, type, min: type === 'number' ? '1' : undefined, placeholder, required: '' } })
    const wrapper = element('label', { className: 'form-field form-field--wide' })
    wrapper.append(`${label} `, requiredMarker(false), control)
    row.append(wrapper)
  }
  const remove = element('button', { className: 'text-button', text: 'Remove topic relation', attributes: { type: 'button' } })
  remove.addEventListener('click', () => row.remove())
  row.append(remove)
  list.append(row)
}

function configureTopics(root, form) {
  root.querySelector('[data-add-topic-origin]').addEventListener('click', () => {
    appendTopicOrigin(form)
    syncConditionalSections(form)
  })
  root.querySelector('[data-add-topic-relation]').addEventListener('click', () => {
    appendTopicRelation(form)
    syncConditionalSections(form)
  })
}

function clearFieldErrors(form) {
  for (const control of form.querySelectorAll('[aria-invalid="true"]')) control.removeAttribute('aria-invalid')
  for (const error of form.querySelectorAll('[data-field-error-for]')) {
    error.textContent = ''
    error.hidden = true
  }
}

function invalidMessage(control) {
  if (control.validity?.valueMissing) return `${control.labels?.[0]?.textContent?.replace('Required', '').trim() ?? 'This field'} is required.`
  if (control.validity?.patternMismatch) return 'Use the requested format shown in the helper text.'
  if (control.validity?.typeMismatch) return 'Enter a valid value in the requested format.'
  if (control.validity?.tooLong) return `Use no more than ${control.maxLength} characters.`
  return control.validationMessage || 'Review this field.'
}

function addInvalid(invalid, control, message) {
  if (invalid.some((item) => item.control === control)) return
  invalid.push({ control, message })
}

export function validateProposalForm(form) {
  clearFieldErrors(form)
  const invalid = []
  for (const control of form.querySelectorAll('input, select, textarea')) {
    if (!control.checkValidity()) addInvalid(invalid, control, invalidMessage(control))
  }

  if (form.elements.kind.value === 'existing-member-correction') {
    const correctionNames = [
      'corrected_name',
      'corrected_definition',
      'corrected_assessment_status',
      'corrected_assessment_detail',
    ]
    if (correctionNames.every((name) => !form.elements[name].value.trim())) {
      addInvalid(invalid, form.elements.corrected_name, 'Provide at least one explicit corrected field.')
    }
  }
  if (form.elements.reference_url.value && !form.elements.reference_label.value.trim()) {
    addInvalid(invalid, form.elements.reference_label, 'Add a readable label for this reference URL.')
  }
  if (form.elements.kind.value === 'research-topic') {
    const loci = [...form.querySelectorAll('[name="topic_locus"]:checked')]
    if (loci.length === 0) {
      addInvalid(invalid, form.querySelector('[name="topic_locus"]'), 'Choose at least one research locus.')
    }
    if (form.querySelectorAll('[data-topic-origin-list] .topic-origin-row').length === 0) {
      addInvalid(invalid, form.querySelector('[data-add-topic-origin]'), 'Add at least one exact problem or conjecture origin.')
    }
  }

  for (const { control, message } of invalid) {
    control.setAttribute('aria-invalid', 'true')
    const error = form.querySelector(`[data-field-error-for="${control.name}"]`)
    if (error) {
      error.id ||= `${control.id}-error`
      control.setAttribute('aria-errormessage', error.id)
      error.textContent = message
      error.hidden = false
    }
  }
  return invalid
}

function renderErrorSummary(form, invalid, fallbackMessage = null) {
  const summary = form.querySelector('[data-error-summary]')
  const list = summary.querySelector('[data-error-summary-list]')
  list.replaceChildren()
  if (fallbackMessage) {
    list.append(element('li', { text: fallbackMessage }))
  } else {
    for (const { control, message } of invalid) {
      const item = element('li')
      const link = element('a', { text: message, attributes: { href: `#${control.id}` } })
      link.addEventListener('click', () => control.focus())
      item.append(link)
      list.append(item)
    }
  }
  summary.hidden = false
  summary.focus()
}

export function focusFirstInvalid(invalid) {
  invalid[0]?.control.focus()
}

function serverInvalid(form, error) {
  const field = error.details?.field
  if (!field) return []
  let name = field
  if (field.startsWith('detail.')) name = field.slice('detail.'.length)
  else if (field.includes('evidence')) name = 'evidence_summary'
  else if (field.includes('references') && field.endsWith('.label')) name = 'reference_label'
  else if (field.includes('references')) name = 'reference_url'
  const control = form.elements[name]
  if (!control?.focus) return []
  const invalid = [{ control, message: error.message }]
  control.setAttribute('aria-invalid', 'true')
  const fieldError = form.querySelector(`[data-field-error-for="${control.name}"]`)
  if (fieldError) {
    fieldError.id ||= `${control.id}-error`
    control.setAttribute('aria-errormessage', fieldError.id)
    fieldError.textContent = error.message
    fieldError.hidden = false
  }
  return invalid
}

function clearSingleError(form, control) {
  control.removeAttribute('aria-invalid')
  const error = form.querySelector(`[data-field-error-for="${control.name}"]`)
  if (error) {
    error.textContent = ''
    error.hidden = true
  }
}

function configureParentLink(root) {
  const url = new URL(globalThis.location.href)
  const parentProposal = url.searchParams.get('parent_proposal')
  const parentRevision = Number.parseInt(url.searchParams.get('parent_revision') ?? '', 10)
  const signIn = root.querySelector('[data-new-sign-in]')
  signIn.href = `/api/auth/github/start?return_to=${encodeURIComponent(`${url.pathname}${url.search}`)}`
  if (!parentProposal || !Number.isInteger(parentRevision)) return null
  const note = root.querySelector('[data-parent-note]')
  note.hidden = false
  note.textContent = `This will be a new proposal linked to ${parentProposal} revision ${parentRevision}; the prior record will not be rewritten.`
  return { proposal_id: parentProposal, revision: parentRevision }
}

function proposalBody(form, parent, { includeTurnstile = true } = {}) {
  const values = new FormData(form)
  const problem = values.get('problem').trim()
  const rationale = values.get('rationale').trim()
  const body = {
    kind: values.get('kind'),
    title: values.get('title'),
    summary: values.get('summary'),
    rationale: `Problem being addressed:\n${problem}\n\nRationale:\n${rationale}`,
    scope: values.get('scope'),
    detail: Object.fromEntries(
      [...form.querySelectorAll('[data-detail]')]
        .map((control) => [control.name, control.value])
        .filter(([, value]) => value !== ''),
    ),
    evidence: values.get('evidence_summary')
      ? [{ evidence_kind: values.get('evidence_kind'), summary: values.get('evidence_summary') }]
      : [],
    references: values.get('reference_url')
      ? [{
          reference_kind: values.get('reference_kind'),
          label: values.get('reference_label'),
          https_url: values.get('reference_url'),
        }]
      : [],
  }
  if (body.kind === 'explanatory-conjecture') {
    body.assumptions = String(body.detail.assumptions ?? '').split('\n').map((value) => value.trim()).filter(Boolean)
    delete body.detail.assumptions
    body.framings = [...form.querySelectorAll('[data-framing-list] .coordinate-framing-row')].map((row) => {
      const coordinate = row.querySelector('[name="coordinate_key"]').value
      const match = form._frontierItems.find((item) => item.coordinate_key === coordinate)
      return {
        coordinate_key: coordinate,
        validation_generation: match?.validation_generation ?? '',
        framing_rationale: row.querySelector('[name="framing_rationale"]').value,
      }
    })
    body.relations = [...form.querySelectorAll('[data-relation-list] .conjecture-relation-row')].map((row) => ({
      relation_kind: row.querySelector('[name="relation_kind"]').value,
      target_proposal_id: row.querySelector('[name="target_proposal_id"]').value,
      target_revision: Number.parseInt(row.querySelector('[name="target_revision"]').value, 10),
      relation_claim: row.querySelector('[name="relation_claim"]').value,
      relation_scope: row.querySelector('[name="relation_scope"]').value,
    }))
  }
  if (body.kind === 'research-topic') {
    body.loci = [...form.querySelectorAll('[name="topic_locus"]:checked')].map((control) => control.value)
    body.origins = [...form.querySelectorAll('[data-topic-origin-list] .topic-origin-row')].map((row) => {
      const kind = row.querySelector('[name="topic_origin_kind"]').value
      const id = row.querySelector('[name="topic_origin_id"]').value
      const origin = {
        origin_kind: kind,
        relationship: row.querySelector('[name="topic_origin_relationship"]').value,
        origin_rationale: row.querySelector('[name="topic_origin_rationale"]').value,
      }
      if (kind === 'canonical-problem-version') origin.canonical_problem_version_id = id
      else if (kind === 'canonical-conjecture-version') origin.canonical_conjecture_version_id = id
      else {
        origin.target_proposal_id = id
        origin.target_revision = Number.parseInt(row.querySelector('[name="topic_origin_revision"]').value, 10)
      }
      return origin
    })
    body.framings = [...form.querySelectorAll('[data-framing-list] .coordinate-framing-row')].map((row) => {
      const coordinate = row.querySelector('[name="coordinate_key"]').value
      const match = form._frontierItems.find((item) => item.coordinate_key === coordinate)
      return {
        coordinate_key: coordinate,
        validation_generation: match?.validation_generation ?? '',
        framing_rationale: row.querySelector('[name="framing_rationale"]').value,
      }
    })
    body.topic_relations = [...form.querySelectorAll('[data-topic-relation-list] .topic-relation-row')].map((row) => ({
      relation_kind: row.querySelector('[name="topic_relation_kind"]').value,
      target_proposal_id: row.querySelector('[name="topic_target_proposal_id"]').value,
      target_revision: Number.parseInt(row.querySelector('[name="topic_target_revision"]').value, 10),
      relation_claim: row.querySelector('[name="topic_relation_claim"]').value,
      relation_scope: row.querySelector('[name="topic_relation_scope"]').value,
    }))
  }
  if (includeTurnstile) body.turnstile_token = turnstileToken(form)
  if (parent) body.parent = parent
  return body
}

export async function initializeProposalNew(root = document) {
  const parent = configureParentLink(root)
  const [config, session] = await Promise.all([readJson('/api/config'), loadSessionWithStatus(root)])
  const form = root.querySelector('[data-proposal-form]')
  const authRequired = root.querySelector('[data-submit-auth-required]')
  const locked = root.querySelector('[data-submit-locked]')
  const pageStatus = root.querySelector('[data-new-page-status]')
  let walletConnection = null
  const walletPublicationEnabled = config.x402?.enabled === true

  if (!walletPublicationEnabled) {
    for (const button of root.querySelectorAll('[data-wallet-connect], [data-base-wallet]')) button.disabled = true
    announce(
      root.querySelector('[data-wallet-status]'),
      'Wallet publication is not enabled on this deployment; GitHub remains available.',
      'error',
    )
  }

  const connect = async (provider) => {
    const status = root.querySelector('[data-wallet-status]')
    announce(status, 'Requesting wallet connection…')
    const chainId = config.x402?.network ?? config.x402_network ?? 'eip155:8453'
    walletConnection = await connectWallet(provider, chainId)
    announce(status, 'Confirm the sign-in message in your wallet. This does not authorize payment.')
    await authenticateWallet(walletConnection)
    announce(status, 'Wallet authenticated. Reloading the proposal form…', 'success')
    globalThis.location.reload()
  }

  const bindWalletButton = (selector, providerFactory) => {
    const button = root.querySelector(selector)
    button?.addEventListener('click', async () => {
      button.disabled = true
      try {
        await connect(await providerFactory())
      } catch (error) {
        announce(root.querySelector('[data-wallet-status]'), error.message, 'error')
        button.disabled = false
      }
    })
  }
  bindWalletButton('[data-wallet-connect]', async () => {
    const wallets = await discoverWallets()
    if (wallets.length === 0) throw new Error('No browser wallet was found. Install a wallet or use Base smart wallet.')
    return wallets[0].provider
  })
  bindWalletButton('[data-base-wallet]', baseSmartWalletProvider)

  if (session.session_unavailable) {
    announce(pageStatus, 'Submission remains closed because the contributor session check failed. Public records are still readable.', 'error')
    return
  }
  if (!session.authenticated) {
    authRequired.hidden = false
    return
  }
  if (session.contributor_locked) {
    locked.hidden = false
    return
  }

  if (session.contributor?.principal_kind === 'base-wallet' && !walletPublicationEnabled) {
    announce(pageStatus, 'Wallet publication is not enabled on this deployment. Sign out and use GitHub to publish.', 'error')
    return
  }

  form.hidden = false
  form._frontierItems = config.frontier.items
  const kindSelect = form.elements.kind
  kindSelect.append(
    element('option', {
      text: 'Choose a proposal kind…',
      attributes: { value: '', disabled: '', selected: '' },
    }),
  )
  for (const kind of config.proposal_kinds) {
    kindSelect.append(element('option', { text: labelText(kind), attributes: { value: kind } }))
  }
  kindSelect.addEventListener('change', () => {
    renderDetailFields(form, config)
    form.querySelector('[data-error-summary]').hidden = true
  })
  renderDetailFields(form, config)
  const requestedKind = new URL(globalThis.location.href).searchParams.get('kind')
  if (requestedKind && config.proposal_kinds.includes(requestedKind)) {
    kindSelect.value = requestedKind
    renderDetailFields(form, config)
  }
  configureFramings(root, form, config)
  configureTopics(root, form)
  const walletLane = session.contributor?.principal_kind === 'base-wallet'
  if (walletLane) {
    root.querySelector('[data-authenticated-turnstile]').hidden = true
    root.querySelector('[data-payment-disclosure]').hidden = false
  } else {
    renderTurnstileSlots(form, config.turnstile_site_key)
  }

  form.addEventListener('input', (event) => {
    if (event.target.matches('input, select, textarea')) clearSingleError(form, event.target)
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const summary = form.querySelector('[data-error-summary]')
    const status = form.querySelector('[data-submit-status]')
    const button = form.querySelector('[data-submit-button]')
    const label = button.querySelector('[data-submit-label]')
    summary.hidden = true
    status.hidden = true

    const invalid = validateProposalForm(form)
    if (invalid.length > 0) {
      renderErrorSummary(form, invalid)
      focusFirstInvalid(invalid)
      return
    }

    button.disabled = true
    label.textContent = 'Publishing…'
    form.setAttribute('aria-busy', 'true')
    let published = false
    try {
      let created
      if (walletLane) {
        if (!walletConnection) {
          const wallets = await discoverWallets()
          const provider = wallets[0]?.provider ?? await baseSmartWalletProvider()
          walletConnection = await connectWallet(provider, config.x402?.network ?? config.x402_network ?? 'eip155:8453')
        }
        label.textContent = 'Confirm $0.01 payment…'
        created = await publishPaidProposal(walletConnection, proposalBody(form, parent, { includeTurnstile: false }))
      } else {
        created = await writeJson('/api/proposals', proposalBody(form, parent), session)
      }
      const success = root.querySelector('[data-submit-success]')
      success.querySelector('[data-success-id]').textContent = created.proposal_id
      success.querySelector('[data-view-proposal]').href =
        `/proposals/detail/?proposal=${encodeURIComponent(created.proposal_id)}`
      form.hidden = true
      success.hidden = false
      success.focus()
      published = true
    } catch (error) {
      const recovery = error.retryWithoutPayment
        ? ' Your payment state is saved. Submit again to retry without paying again.'
        : ''
      announce(status, `Publication failed: ${error.message}${recovery}`, 'error')
      const invalid = serverInvalid(form, error)
      if (invalid.length > 0) {
        renderErrorSummary(form, invalid)
        focusFirstInvalid(invalid)
      } else {
        renderErrorSummary(form, [], error.message)
      }
      if (!walletLane) globalThis.turnstile?.reset()
    } finally {
      if (!published) {
        button.disabled = false
        label.textContent = 'Publish submitted · unreviewed'
        form.removeAttribute('aria-busy')
      }
    }
  })
}
