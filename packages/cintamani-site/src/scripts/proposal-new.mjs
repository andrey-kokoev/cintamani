import {
  announce,
  element,
  loadSessionWithStatus,
  readJson,
  renderTurnstileSlots,
  turnstileToken,
  writeJson,
} from './public-api.mjs'

const fieldContracts = {
  'theoretical-model-member': [
    { name: 'member_id', label: 'Member identifier', kind: 'slug', max: 120, help: 'A stable lowercase identifier, for example delay-line-model.' },
    { name: 'member_name', label: 'Member name', kind: 'input', max: 160, help: 'The readable name shown in the siege-space dimension.' },
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

function proposalBody(form, parent) {
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
    turnstile_token: turnstileToken(form),
  }
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

  if (session.session_unavailable) {
    announce(pageStatus, 'Submission remains closed because the GitHub session check failed. Public records are still readable.', 'error')
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

  form.hidden = false
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
  renderTurnstileSlots(form, config.turnstile_site_key)

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
      const created = await writeJson('/api/proposals', proposalBody(form, parent), session)
      const success = root.querySelector('[data-submit-success]')
      success.querySelector('[data-success-id]').textContent = created.proposal_id
      success.querySelector('[data-view-proposal]').href =
        `/proposals/detail/?proposal=${encodeURIComponent(created.proposal_id)}`
      form.hidden = true
      success.hidden = false
      success.focus()
      published = true
    } catch (error) {
      announce(status, `Publication failed: ${error.message}`, 'error')
      const invalid = serverInvalid(form, error)
      if (invalid.length > 0) {
        renderErrorSummary(form, invalid)
        focusFirstInvalid(invalid)
      } else {
        renderErrorSummary(form, [], error.message)
      }
      globalThis.turnstile?.reset()
    } finally {
      if (!published) {
        button.disabled = false
        label.textContent = 'Publish submitted · unreviewed'
        form.removeAttribute('aria-busy')
      }
    }
  })
}
