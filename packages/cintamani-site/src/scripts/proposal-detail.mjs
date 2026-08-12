import {
  announce,
  contributorLabel,
  element,
  loadSessionWithStatus,
  publicAuthor,
  readJson,
  renderTurnstileSlots,
  samePublicContributor,
  turnstileToken,
  writeJson,
} from './public-api.mjs'

function label(value) {
  return String(value ?? '—').replaceAll('-', ' ')
}

const withdrawableStates = new Set(['submitted', 'triaged', 'under-review', 'selected-for-export'])

export const detailFormPlaceholders = Object.freeze({
  revision: Object.freeze({
    title: 'e.g., Clarify the normalized observation boundary',
    summary: 'e.g., Separates state evolution from observation noise in the public definition.',
    rationale: 'e.g., The prior wording could be read as a calibrated detector claim.',
    scope: 'e.g., Definition-only revision; no new evidence or canonical admission.',
    detail_json: 'e.g., {"observation_kind":"coherent-quadrature","units":"normalized amplitude"}',
  }),
  criticism: Object.freeze({
    title: 'e.g., Observation noise is not detector calibration',
    criticism: 'e.g., The revision maps normalized additive noise to a physical detector claim without a calibration model.',
    scope: 'e.g., Targets revision 2 wording only; it does not refute the normalized simulation result.',
  }),
  scoped_test: Object.freeze({
    test_name: 'e.g., Matched Kerr-disabled lag-4 comparison',
    protocol: 'e.g., Run the predeclared seed set with common observation-noise draws and unchanged readout settings.',
    result: 'e.g., Report each seed, paired difference, uncertainty, and any failed decision gate.',
    interpretation: 'e.g., A positive paired difference would survive this bounded test but would not establish a physical detector.',
  }),
  interpretation: Object.freeze({
    title: 'e.g., Advantage may arise from observable choice',
    interpretation: 'e.g., The reported difference could reflect the phase-sensitive readout rather than broader computational capacity.',
    scope: 'e.g., Applies to this revision and target family; nonlinear targets remain untested.',
  }),
  reply: 'e.g., The criticism is accepted for physical wording; the normalized protocol claim remains unchanged.',
  appeal: 'e.g., The listing restriction appears broader than the cited revision-specific issue; please review the exact target.',
  appeal_rationale: 'e.g., The appeal identifies a revision-target mismatch; keep the exact record public while review continues.',
  withdrawal_rationale: 'e.g., Withdrawn to replace an ambiguous detector claim with a separately scoped proposal.',
  administrative: Object.freeze({
    selected_revision: 'e.g., 2',
    rationale: 'e.g., Revision 2 is selected for maintainer export review; selection is not admission.',
  }),
  moderation: Object.freeze({
    reason_code: 'e.g., scope-boundary',
    explanation: 'e.g., Hidden from listings while the exact revision’s material-claim boundary is reviewed; history remains public.',
  }),
  export_scope: 'e.g., Candidate interface identity and revision 2 only; exclude evidence-bearing or physical-device status.',
})

function appendTerm(list, term, value) {
  const row = element('div')
  row.append(element('dt', { text: term }), element('dd', { text: value ?? '—' }))
  list.append(row)
}

function publicByline(record, prefix = 'by') {
  const line = element('p', { className: 'proposal-author' })
  line.append(`${prefix} `, publicAuthor(record), ` · ${record.source_timestamp ?? record.recorded_at ?? ''}`)
  return line
}

function visibilityFor(data, targetKind, target) {
  return data.listing_moderation.find((item) => {
    if (item.target_kind !== targetKind) return false
    switch (targetKind) {
      case 'proposal-revision':
        return item.target_proposal_id === target.proposal_id && item.target_revision === target.revision
      case 'criticism':
        return item.target_criticism_id === target
      case 'reply':
        return item.target_reply_id === target
      case 'test-report':
        return item.target_test_report_id === target
      case 'interpretation':
        return item.target_interpretation_id === target
      default:
        return false
    }
  })
}

function moderationTombstone(data, targetKind, target) {
  const visibility = visibilityFor(data, targetKind, target)
  if (visibility?.listing_visibility !== 'hidden') return null
  return element('p', {
    className: 'moderation-tombstone',
    text: `Hidden from collection listings by ordered moderation action ${visibility.action_sequence}; this exact record and its history remain public.`,
  })
}

function renderRevision(revision, data) {
  const article = element('article', { className: 'revision-card' })
  const heading = element('header')
  heading.append(
    element('span', { className: 'revision-index', text: `Revision ${revision.revision}` }),
    element('code', { text: revision.content_sha256 }),
  )
  const detail = element('dl', { className: 'typed-detail-list' })
  for (const [key, value] of Object.entries(revision.detail)) {
    if (Array.isArray(value)) continue
    appendTerm(detail, label(key), value)
  }
  article.append(
    heading,
    element('h3', { text: revision.title }),
    element('p', { text: revision.summary }),
    element('h4', { text: 'Rationale' }),
    element('p', { text: revision.rationale }),
    element('h4', { text: 'Scope' }),
    element('p', { text: revision.scope }),
    detail,
    publicByline(revision, 'authored by'),
  )
  if (revision.detail.assumptions?.length) {
    const assumptions = element('ol', { className: 'evidence-list' })
    for (const item of revision.detail.assumptions) assumptions.append(element('li', { text: item.assumption_text }))
    article.append(element('h4', { text: 'Unresolved assumptions' }), assumptions)
  }
  if (revision.detail.framings?.length) {
    const framings = element('ul', { className: 'evidence-list' })
    for (const item of revision.detail.framings) {
      framings.append(element('li', {
        text: `${label(item.coordinate_classification)} · ${item.model_id} / ${item.material_id} / ${item.mechanism_id} / ${item.interface_id}: ${item.framing_rationale}`,
      }))
    }
    article.append(element('h4', { text: 'Conjectural coordinate framings' }), framings)
  }
  if (revision.detail.relations?.length) {
    const relations = element('ul', { className: 'evidence-list' })
    for (const item of revision.detail.relations) {
      relations.append(element('li', { text: `${label(item.relation_kind)} ${item.target_proposal_id} revision ${item.target_revision}: ${item.relation_claim}` }))
    }
    article.append(element('h4', { text: 'Inter-conjecture claims' }), relations)
  }
  const tombstone = moderationTombstone(data, 'proposal-revision', {
    proposal_id: revision.proposal_id,
    revision: revision.revision,
  })
  if (tombstone) article.prepend(tombstone)
  if (revision.evidence.length) {
    const evidence = element('ul', { className: 'evidence-list' })
    for (const item of revision.evidence) {
      evidence.append(element('li', { text: `${label(item.evidence_kind)}: ${item.summary}` }))
    }
    article.append(element('h4', { text: 'Typed evidence (not a verdict)' }), evidence)
  }
  if (revision.references.length) {
    const references = element('ul', { className: 'reference-list' })
    for (const item of revision.references) {
      const listItem = element('li')
      listItem.append(
        element('a', { text: item.label, attributes: { href: item.https_url, rel: 'noreferrer', target: '_blank' } }),
      )
      references.append(listItem)
    }
    article.append(element('h4', { text: 'References' }), references)
  }
  return article
}

function turnstileSlot() {
  return element('div', { className: 'turnstile-slot', attributes: { 'aria-label': 'Human verification' } })
}

function formStatus() {
  return element('p', { className: 'form-status', attributes: { role: 'status', 'aria-live': 'polite', hidden: '' } })
}

function chooseOption(text) {
  return element('option', {
    text,
    attributes: { value: '', disabled: '', selected: '' },
  })
}

function selectField(name, title, options) {
  const wrapper = element('label', { className: 'form-field form-field--wide' })
  const select = element('select', { attributes: { name, required: '' } })
  for (const option of options) {
    select.append(element('option', { text: option.label, attributes: { value: option.value } }))
  }
  wrapper.append(element('span', { text: title }), select)
  return wrapper
}

function field(name, title, { area = true, required = true, placeholder } = {}) {
  const wrapper = element('label', { className: 'form-field form-field--wide' })
  wrapper.append(element('span', { text: title }))
  const input = area
    ? element('textarea', { attributes: { name, rows: '3', placeholder } })
    : element('input', { attributes: { name, placeholder } })
  input.required = required
  wrapper.append(input)
  return wrapper
}

function bindPublicForm(form, session, path, buildBody, after) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = form.querySelector('.form-status')
    try {
      const body = buildBody(new FormData(form))
      body.turnstile_token = turnstileToken(form)
      announce(status, 'Publishing immutable public record…')
      const result = await writeJson(path, body, session)
      announce(status, 'Published.', 'success')
      await after?.(result)
    } catch (error) {
      announce(status, error.message, 'error')
    }
  })
}

export function criticismFocusOptions(revisionDetail) {
  const options = [
    { value: 'whole-proposal|', label: 'Whole proposal revision' },
    { value: 'other-explicit|', label: 'Other explicit focus' },
  ]
  if (!revisionDetail || typeof revisionDetail.problem_statement !== 'string') return options
  options.splice(
    1,
    0,
    { value: 'problem-statement|', label: 'Problem statement' },
    { value: 'explanatory-claim|', label: 'Explanatory claim' },
    { value: 'essential-mechanism|', label: 'Essential mechanism' },
    { value: 'explanation-scope|', label: 'Explanation scope' },
    { value: 'failure-condition|', label: 'Failure condition' },
    ...(revisionDetail.assumptions ?? []).map((item) => ({
      value: `assumption|${item.assumption_id}`,
      label: `Assumption ${item.assumption_order}`,
    })),
    ...(revisionDetail.framings ?? []).map((item) => ({
      value: `coordinate-framing|${item.framing_id}`,
      label: `Coordinate framing ${item.framing_order}`,
    })),
    ...(revisionDetail.relations ?? []).map((item) => ({
      value: `conjecture-relation|${item.relation_id}`,
      label: `Relation ${label(item.relation_kind)}`,
    })),
  )
  return options
}

function criticismForm(session, proposalId, revision, revisionDetail, reload) {
  const form = element('form', { className: 'compact-public-form' })
  const focusOptions = criticismFocusOptions(revisionDetail)
  form.append(
    element('h3', { text: 'Criticize this exact revision' }),
    selectField('focus', 'Focused target', focusOptions),
    field('title', 'Criticism title', { area: false, placeholder: detailFormPlaceholders.criticism.title }),
    field('criticism', 'Criticism', { placeholder: detailFormPlaceholders.criticism.criticism }),
    field('scope', 'Scope', { placeholder: detailFormPlaceholders.criticism.scope }),
    turnstileSlot(),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Publish criticism', attributes: { type: 'submit' } }),
  )
  bindPublicForm(
    form,
    session,
    `/api/proposals/${encodeURIComponent(proposalId)}/revisions/${revision}/criticisms`,
    (values) => {
      const [focus_kind, focus_ref] = String(values.get('focus')).split('|')
      return { title: values.get('title'), criticism: values.get('criticism'), scope: values.get('scope'), focus_kind, focus_ref: focus_ref || null }
    },
    reload,
  )
  return form
}

function testForm(session, proposalId, revision, reload) {
  const form = element('form', { className: 'compact-public-form' })
  const relation = element('select', { attributes: { name: 'test_relation', required: '' } })
  relation.append(chooseOption('Choose relation to the claim…'))
  for (const value of ['survives-test', 'falsifies', 'criticizes', 'inconclusive', 'mixed']) {
    relation.append(element('option', { text: label(value), attributes: { value } }))
  }
  const relationField = element('label', { className: 'form-field form-field--wide' })
  relationField.append(element('span', { text: 'Relation to the claim' }), relation)
  form.append(
    element('h3', { text: 'Report a scoped test' }),
    field('test_name', 'Test name', { area: false, placeholder: detailFormPlaceholders.scoped_test.test_name }),
    field('protocol', 'Protocol', { placeholder: detailFormPlaceholders.scoped_test.protocol }),
    field('result', 'Observed result', { placeholder: detailFormPlaceholders.scoped_test.result }),
    field('interpretation', 'Interpretation', { placeholder: detailFormPlaceholders.scoped_test.interpretation }),
    relationField,
    turnstileSlot(),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Publish test report', attributes: { type: 'submit' } }),
  )
  bindPublicForm(
    form,
    session,
    `/api/proposals/${encodeURIComponent(proposalId)}/revisions/${revision}/tests`,
    (values) => ({
      test_name: values.get('test_name'),
      protocol: values.get('protocol'),
      result: values.get('result'),
      interpretation: values.get('interpretation'),
      test_relation: values.get('test_relation'),
    }),
    reload,
  )
  return form
}

function interpretationForm(session, proposalId, revision, reload) {
  const form = element('form', { className: 'compact-public-form' })
  form.append(
    element('h3', { text: 'Add a competing interpretation' }),
    field('title', 'Interpretation title', { area: false, placeholder: detailFormPlaceholders.interpretation.title }),
    field('interpretation', 'Interpretation', { placeholder: detailFormPlaceholders.interpretation.interpretation }),
    field('scope', 'Scope', { placeholder: detailFormPlaceholders.interpretation.scope }),
    turnstileSlot(),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Publish interpretation', attributes: { type: 'submit' } }),
  )
  bindPublicForm(
    form,
    session,
    `/api/proposals/${encodeURIComponent(proposalId)}/revisions/${revision}/interpretations`,
    (values) => ({ title: values.get('title'), interpretation: values.get('interpretation'), scope: values.get('scope') }),
    reload,
  )
  return form
}

function replyForm(session, criticismId, reload) {
  const form = element('form', { className: 'inline-reply-form' })
  form.append(
    field('reply', 'Reply to this criticism', { placeholder: detailFormPlaceholders.reply }),
    turnstileSlot(),
    formStatus(),
  )
  form.append(element('button', { className: 'text-button', text: 'Publish reply', attributes: { type: 'submit' } }))
  bindPublicForm(
    form,
    session,
    `/api/criticisms/${encodeURIComponent(criticismId)}/replies`,
    (values) => ({ reply: values.get('reply') }),
    reload,
  )
  return form
}

function appealForm(session, moderationActionId, reload) {
  const form = element('form', { className: 'inline-reply-form' })
  form.append(
    field('appeal', 'Appeal this administrative action', { placeholder: detailFormPlaceholders.appeal }),
    turnstileSlot(),
    formStatus(),
  )
  form.append(element('button', { className: 'text-button', text: 'Publish appeal', attributes: { type: 'submit' } }))
  bindPublicForm(
    form,
    session,
    `/api/moderation/actions/${encodeURIComponent(moderationActionId)}/appeals`,
    (values) => ({ appeal: values.get('appeal') }),
    reload,
  )
  return form
}

function appealTransitionForm(session, appeal, currentState, reload) {
  const allowed =
    currentState === 'submitted'
      ? ['under-review', 'withdrawn']
      : currentState === 'under-review'
        ? ['upheld', 'granted', 'withdrawn']
        : []
  if (allowed.length === 0) return null
  const form = element('form', { className: 'inline-reply-form operator-appeal-form' })
  form.append(
    selectField(
      'to_state',
      'Resolve appeal state',
      allowed.map((value) => ({ value, label: label(value) })),
    ),
    field('rationale', 'Appeal-state rationale', { placeholder: detailFormPlaceholders.appeal_rationale }),
    formStatus(),
    element('button', { className: 'text-button', text: 'Record appeal transition', attributes: { type: 'submit' } }),
  )
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = form.querySelector('.form-status')
    const values = new FormData(form)
    try {
      await writeJson(
        `/api/admin/appeals/${encodeURIComponent(appeal.appeal_id)}/state`,
        { to_state: values.get('to_state'), rationale: values.get('rationale') },
        session,
      )
      announce(status, 'Appeal transition recorded.', 'success')
      await reload()
    } catch (error) {
      announce(status, error.message, 'error')
    }
  })
  return form
}

function renderDiscussion(root, data, session, reload) {
  const criticismRoot = root.querySelector('[data-criticisms]')
  criticismRoot.replaceChildren()
  for (const criticism of data.criticisms) {
    const article = element('article', { className: 'discussion-card' })
    const criticismTombstone = moderationTombstone(data, 'criticism', criticism.criticism_id)
    if (criticismTombstone) article.append(criticismTombstone)
    article.append(
      element('p', { className: 'revision-index', text: `Targets revision ${criticism.target_revision}` }),
      element('p', { className: 'scope-note', text: `Focus: ${label(criticism.focus_kind)}${criticism.focus_ref ? ` · ${criticism.focus_ref}` : ''}` }),
      element('h3', { text: criticism.title }),
      element('p', { text: criticism.criticism }),
      element('p', { className: 'scope-note', text: `Scope: ${criticism.scope}` }),
      publicByline(criticism),
    )
    for (const reply of criticism.replies) {
      const replyNode = element('blockquote', { className: 'criticism-reply' })
      const replyTombstone = moderationTombstone(data, 'reply', reply.reply_id)
      if (replyTombstone) replyNode.append(replyTombstone)
      replyNode.append(element('p', { text: reply.reply }), publicByline(reply, 'reply by'))
      article.append(replyNode)
    }
    if (session.authenticated) article.append(replyForm(session, criticism.criticism_id, reload))
    criticismRoot.append(article)
  }
  if (!data.criticisms.length) criticismRoot.append(element('p', { text: 'No criticism has been published yet.' }))

  const tests = root.querySelector('[data-tests]')
  tests.replaceChildren()
  for (const report of data.tests) {
    const article = element('article', { className: 'discussion-card' })
    const reportTombstone = moderationTombstone(data, 'test-report', report.test_report_id)
    if (reportTombstone) article.append(reportTombstone)
    article.append(
      element('p', { className: 'revision-index', text: `Revision ${report.target_revision} · ${label(report.test_relation)}` }),
      element('h3', { text: report.test_name }),
      element('h4', { text: 'Protocol' }),
      element('p', { text: report.protocol }),
      element('h4', { text: 'Result' }),
      element('p', { text: report.result }),
      element('h4', { text: 'Interpretation' }),
      element('p', { text: report.interpretation }),
      publicByline(report),
    )
    tests.append(article)
  }
  if (!data.tests.length) tests.append(element('p', { text: 'No scoped test report has been published yet.' }))

  const interpretations = root.querySelector('[data-interpretations]')
  interpretations.replaceChildren()
  for (const record of data.competing_interpretations) {
    const article = element('article', { className: 'discussion-card' })
    const interpretationTombstone = moderationTombstone(data, 'interpretation', record.interpretation_id)
    if (interpretationTombstone) article.append(interpretationTombstone)
    article.append(
      element('p', { className: 'revision-index', text: `Targets revision ${record.target_revision}` }),
      element('h3', { text: record.title }),
      element('p', { text: record.interpretation }),
      element('p', { className: 'scope-note', text: `Scope: ${record.scope}` }),
      publicByline(record),
    )
    interpretations.append(article)
  }
  if (!data.competing_interpretations.length) {
    interpretations.append(element('p', { text: 'No competing interpretation has been published yet.' }))
  }
}

function renderModeration(root, data, session, reload) {
  const moderation = root.querySelector('[data-moderation-history]')
  moderation.replaceChildren()
  for (const action of data.moderation) {
    const article = element('article', { className: 'discussion-card' })
    article.append(
      element('p', {
        className: 'revision-index',
        text: `Action ${action.action_sequence} · ${label(action.action_kind)} · ${label(action.target_kind)}${
          action.current_effective ? ' · current effective action' : ''
        }`,
      }),
      element('h3', { text: action.reason_code }),
      element('p', { text: action.explanation }),
      publicByline(action, 'moderated by'),
    )
    for (const appeal of action.appeals) {
      const appealNode = element('blockquote', { className: 'criticism-reply' })
      const current = appeal.state_history.at(-1)
      appealNode.append(
        element('p', { text: appeal.appeal }),
        element('p', { className: 'scope-note', text: `Appeal state: ${label(current?.to_state)}` }),
        publicByline(appeal, 'appealed by'),
      )
      if (session.operator) {
        const resolver = appealTransitionForm(session, appeal, current?.to_state, reload)
        if (resolver) appealNode.append(resolver)
      }
      article.append(appealNode)
    }
    if (session.authenticated) article.append(appealForm(session, action.moderation_action_id, reload))
    moderation.append(article)
  }
  if (!data.moderation.length) moderation.append(element('p', { text: 'No moderation action is recorded.' }))
}

export function buildRevisionPayload(proposalKind, values) {
  const typed = JSON.parse(values.get('detail_json'))
  const body = {
    title: values.get('title'),
    summary: values.get('summary'),
    rationale: values.get('rationale'),
    scope: values.get('scope'),
    detail: typed,
    evidence: [],
    references: [],
  }
  if (proposalKind !== 'explanatory-conjecture') return body

  const { assumptions = [], framings = [], relations = [], ...detail } = typed
  body.detail = detail
  body.assumptions = assumptions.map((item) =>
    typeof item === 'string' ? item : item.assumption_text,
  )
  body.framings = framings.map((item) => ({
    coordinate_key: item.coordinate_key,
    validation_generation: item.validation_generation,
    framing_rationale: item.framing_rationale,
  }))
  body.relations = relations.map((item) => ({
    relation_kind: item.relation_kind,
    target_proposal_id: item.target_proposal_id,
    target_revision: item.target_revision,
    relation_claim: item.relation_claim,
    relation_scope: item.relation_scope,
  }))
  return body
}

function revisionForm(session, proposal, current, reload) {
  const form = element('form', { className: 'compact-public-form' })
  const fields = [
    field('title', 'Revision title', { area: false, placeholder: detailFormPlaceholders.revision.title }),
    field('summary', 'Summary', { placeholder: detailFormPlaceholders.revision.summary }),
    field('rationale', 'Rationale', { placeholder: detailFormPlaceholders.revision.rationale }),
    field('scope', 'Scope', { placeholder: detailFormPlaceholders.revision.scope }),
    field('detail_json', 'Typed detail JSON', { placeholder: detailFormPlaceholders.revision.detail_json }),
  ]
  fields[0].querySelector('input').value = current.title
  fields[1].querySelector('textarea').value = current.summary
  fields[2].querySelector('textarea').value = current.rationale
  fields[3].querySelector('textarea').value = current.scope
  fields[4].querySelector('textarea').value = JSON.stringify(current.detail, null, 2)
  form.append(
    element('h3', { text: 'Append a revision while submitted' }),
    element('p', { className: 'scope-note', text: 'The prior revision remains public. Typed detail is validated server-side.' }),
    ...fields,
    turnstileSlot(),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Append immutable revision', attributes: { type: 'submit' } }),
  )
  bindPublicForm(
    form,
    session,
    `/api/proposals/${encodeURIComponent(proposal.proposal_id)}/revisions`,
    (values) => buildRevisionPayload(proposal.proposal_kind, values),
    reload,
  )
  return form
}

function withdrawalForm(session, proposal, reload) {
  const form = element('form', { className: 'compact-public-form withdrawal-form' })
  form.append(
    element('h3', { text: 'Withdraw this proposal' }),
    element('p', {
      className: 'scope-note',
      text: 'Only the author can append this administrative event. The proposal, revisions, criticism, and history remain public.',
    }),
    field('rationale', 'Withdrawal rationale', { placeholder: detailFormPlaceholders.withdrawal_rationale }),
    turnstileSlot(),
    formStatus(),
    element('button', { className: 'text-button', text: 'Record withdrawal', attributes: { type: 'submit' } }),
  )
  bindPublicForm(
    form,
    session,
    `/api/proposals/${encodeURIComponent(proposal.proposal_id)}/withdrawal`,
    (values) => ({ rationale: values.get('rationale') }),
    reload,
  )
  return form
}

function operatorPanel(root, data, session, reload) {
  const panel = root.querySelector('[data-operator-panel]')
  const controls = panel.querySelector('[data-operator-controls]')
  controls.replaceChildren()
  if (!session.operator) {
    panel.hidden = true
    return
  }
  panel.hidden = false
  const stateForm = element('form', { className: 'compact-public-form', attributes: { 'data-state-form': '' } })
  stateForm.append(
    element('h3', { text: 'Record administrative transition' }),
    selectField(
      'to_state',
      'New state',
      ['triaged', 'under-review', 'selected-for-export', 'declined', 'superseded'].map((value) => ({
        value,
        label: label(value),
      })),
    ),
    field('selected_revision', 'Selected revision (required for export selection)', {
      area: false,
      required: false,
      placeholder: detailFormPlaceholders.administrative.selected_revision,
    }),
    field('rationale', 'Administrative rationale', { placeholder: detailFormPlaceholders.administrative.rationale }),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Record transition', attributes: { type: 'submit' } }),
  )
  stateForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const values = new FormData(stateForm)
    const body = { to_state: values.get('to_state'), rationale: values.get('rationale') }
    if (body.to_state === 'selected-for-export') body.selected_revision = Number(values.get('selected_revision'))
    const status = stateForm.querySelector('.form-status')
    try {
      await writeJson(`/api/admin/proposals/${encodeURIComponent(data.proposal.proposal_id)}/state`, body, session)
      announce(status, 'Administrative transition recorded.', 'success')
      await reload()
    } catch (error) {
      announce(status, error.message, 'error')
    }
  })

  const targets = [
    {
      label: `Proposal ${data.proposal.proposal_id} · current revision ${data.proposal.current_revision}`,
      body: {
        target_kind: 'proposal-revision',
        proposal_id: data.proposal.proposal_id,
        revision: data.proposal.current_revision,
      },
    },
    {
      label: `Contributor ${contributorLabel(data.proposal)}`,
      body: {
        target_kind: 'account',
        ...(data.proposal.principal_kind === 'base-wallet'
          ? { target_public_pseudonym: data.proposal.public_pseudonym }
          : { target_github_login: data.proposal.github_login }),
      },
    },
    ...data.criticisms.flatMap((criticism) => [
      { label: `Criticism ${criticism.criticism_id}`, body: { target_kind: 'criticism', criticism_id: criticism.criticism_id } },
      ...criticism.replies.map((reply) => ({
        label: `Reply ${reply.reply_id}`,
        body: { target_kind: 'reply', reply_id: reply.reply_id },
      })),
    ]),
    ...data.tests.map((report) => ({
      label: `Test report ${report.test_report_id}`,
      body: { target_kind: 'test-report', test_report_id: report.test_report_id },
    })),
    ...data.competing_interpretations.map((record) => ({
      label: `Interpretation ${record.interpretation_id}`,
      body: { target_kind: 'interpretation', interpretation_id: record.interpretation_id },
    })),
  ]
  const actionOptions = ['label', 'hide-from-listing', 'restore-to-listing', 'lock-contributor', 'unlock-contributor']
  const moderationForm = element('form', {
    className: 'compact-public-form',
    attributes: { 'data-moderation-form': '' },
  })
  const actionField = selectField(
    'action_kind',
    'Moderation action',
    actionOptions.map((value) => ({ value, label: label(value) })),
  )
  const targetField = selectField(
    'target_index',
    'Exact public target',
    targets.map((target, index) => ({ value: index, label: target.label })),
  )
  const actionSelect = actionField.querySelector('select')
  const targetSelect = targetField.querySelector('select')
  const syncActions = () => {
    const accountTarget = targets[Number(targetSelect.value)].body.target_kind === 'account'
    for (const option of actionSelect.options) {
      option.disabled = accountTarget
        ? ['hide-from-listing', 'restore-to-listing'].includes(option.value)
        : ['lock-contributor', 'unlock-contributor'].includes(option.value)
    }
    if (actionSelect.selectedOptions[0]?.disabled) actionSelect.value = 'label'
  }
  targetSelect.addEventListener('change', syncActions)
  syncActions()
  moderationForm.append(
    element('h3', { text: 'Create ordered moderation action' }),
    actionField,
    targetField,
    field('reason_code', 'Reason code', { area: false, placeholder: detailFormPlaceholders.moderation.reason_code }),
    field('explanation', 'Public explanation', { placeholder: detailFormPlaceholders.moderation.explanation }),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Record moderation action', attributes: { type: 'submit' } }),
  )
  moderationForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = moderationForm.querySelector('.form-status')
    const values = new FormData(moderationForm)
    const target = targets[Number(values.get('target_index'))]
    try {
      await writeJson(
        '/api/admin/moderation-actions',
        {
          action_kind: values.get('action_kind'),
          ...target.body,
          reason_code: values.get('reason_code'),
          explanation: values.get('explanation'),
        },
        session,
      )
      announce(status, 'Ordered moderation action recorded.', 'success')
      await reload()
    } catch (error) {
      announce(status, error.message, 'error')
    }
  })

  const exportForm = element('form', { className: 'compact-public-form', attributes: { 'data-export-form': '' } })
  exportForm.append(
    element('h3', { text: 'Create selected-revision export' }),
    field('scope', 'Export scope', { placeholder: detailFormPlaceholders.export_scope }),
    element('p', {
      className: 'scope-note',
      text: 'The hashed body pins the selected revision and state event and says criticism is non-exhaustive.',
    }),
    formStatus(),
    element('button', { className: 'primary-action', text: 'Create content-addressed export', attributes: { type: 'submit' } }),
  )
  exportForm.addEventListener('submit', async (event) => {
    event.preventDefault()
    const status = exportForm.querySelector('.form-status')
    try {
      const result = await writeJson(
        `/api/admin/proposals/${encodeURIComponent(data.proposal.proposal_id)}/exports`,
        { scope: new FormData(exportForm).get('scope') },
        session,
      )
      announce(status, `Export ${result.content_sha256} recorded. Selection is not admission.`, 'success')
    } catch (error) {
      announce(status, error.message, 'error')
    }
  })
  controls.append(stateForm, moderationForm, exportForm)
}

export async function initializeProposalDetail(root = document) {
  const proposalId = new URL(location.href).searchParams.get('proposal')
  if (!proposalId) throw new Error('No proposal identifier was supplied.')
  const [config, session] = await Promise.all([readJson('/api/config'), loadSessionWithStatus(root)])
  let data
  const load = async () => {
    data = await readJson(`/api/proposals/${encodeURIComponent(proposalId)}`)
    root.querySelector('[data-proposal-title]').textContent = data.revisions.at(-1).title
    root.querySelector('[data-proposal-kind]').textContent = label(data.proposal.proposal_kind)
    root.querySelector('[data-proposal-state]').textContent = data.proposal.current_admin_state
    const author = root.querySelector('[data-proposal-author]')
    author.replaceChildren(publicAuthor(data.proposal))
    const listingNotice = root.querySelector('[data-listing-visibility]')
    listingNotice.hidden = data.proposal_listing_visibility !== 'hidden'
    listingNotice.textContent =
      data.proposal_listing_visibility === 'hidden'
        ? 'This proposal is hidden from collection and siege-overlay listings by the current ordered moderation action. Its exact record and history remain public here.'
        : ''
    root.querySelector('[data-revisions]').replaceChildren(...data.revisions.map((revision) => renderRevision(revision, data)))
    const states = root.querySelector('[data-state-history]')
    states.replaceChildren()
    for (const event of data.state_history) {
      const item = element('li')
      item.append(
        element('strong', { text: `${event.event_sequence}. ${label(event.to_state)}` }),
        element('p', { text: event.rationale }),
        publicByline(event, 'recorded by'),
      )
      states.append(item)
    }
    renderDiscussion(root, data, session, load)
    renderModeration(root, data, session, load)
    const authorTools = root.querySelector('[data-author-tools]')
    authorTools.replaceChildren()
    const isAuthor = session.authenticated && samePublicContributor(session.contributor, data.proposal)
    if (isAuthor && session.contributor_locked) {
      authorTools.append(
        element('p', {
          className: 'form-warning',
          text: 'Your contributor account is locked from ordinary public mutations. Reading, signing out, and appealing the recorded lock remain available.',
        }),
      )
    } else if (isAuthor && data.proposal.current_admin_state === 'submitted') {
      authorTools.append(
        revisionForm(session, data.proposal, data.revisions.at(-1), load),
        withdrawalForm(session, data.proposal, load),
      )
    } else if (isAuthor && withdrawableStates.has(data.proposal.current_admin_state)) {
      authorTools.append(withdrawalForm(session, data.proposal, load))
    }
    if (data.proposal.current_admin_state !== 'submitted' && !session.contributor_locked) {
      authorTools.append(
        element('a', {
          className: 'primary-action',
          text: 'Create linked follow-up proposal',
          attributes: {
            href: `/proposals/new/?parent_proposal=${encodeURIComponent(proposalId)}&parent_revision=${data.proposal.current_revision}`,
            target: '_blank',
            rel: 'noopener',
          },
        }),
      )
    }
    const contributionForms = root.querySelector('[data-contribution-forms]')
    contributionForms.replaceChildren()
    if (session.contributor_locked) {
      contributionForms.append(
        element('p', {
          className: 'form-warning',
          text: 'Ordinary public contribution forms are unavailable while this contributor lock is effective. Public reads and appeals remain available.',
        }),
      )
    } else if (session.authenticated) {
      contributionForms.append(
        criticismForm(session, proposalId, data.proposal.current_revision, data.revisions.at(-1).detail, load),
        testForm(session, proposalId, data.proposal.current_revision, load),
        interpretationForm(session, proposalId, data.proposal.current_revision, load),
      )
    } else {
      contributionForms.append(
        element('p', { text: 'Sign in with GitHub to publish criticism, replies, scoped tests, or interpretations.' }),
      )
    }
    operatorPanel(root, data, session, load)
    renderTurnstileSlots(root, config.turnstile_site_key)
  }
  await load()
}
