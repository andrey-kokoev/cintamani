import {
  administrativeStates,
  InputError,
  text,
  validateAppeal,
  validateCriticism,
  validateInterpretation,
  validateProposal,
  validateProposalRevision,
  validateReply,
  validateTestReport,
} from '../src/lib/proposals.mjs'
import {
  hmacHex,
  idempotencyContext,
  idempotencyStatement,
  nowIso,
  randomToken,
  requiredSecret,
  ResponseError,
  sha256Hex,
} from './security.mjs'

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const detailTables = Object.freeze({
  'theoretical-model-member': {
    table: 'theoretical_model_details',
    fields: ['member_id', 'member_name', 'model_definition', 'computational_claim', 'initial_epistemic_status'],
  },
  'physical-material-member': {
    table: 'physical_material_details',
    fields: [
      'member_id',
      'member_name',
      'material_classification',
      'composition_or_structure',
      'physical_evidence_boundary',
      'initial_epistemic_status',
    ],
  },
  'physical-calculation-mechanism-member': {
    table: 'physical_mechanism_details',
    fields: ['member_id', 'member_name', 'physical_process', 'state_or_signal_carrier', 'initial_epistemic_status'],
  },
  'observation-interface-member': {
    table: 'observation_interface_details',
    fields: ['member_id', 'member_name', 'observation_kind', 'units', 'observation_boundary', 'initial_epistemic_status'],
  },
  'existing-member-assessment': {
    table: 'existing_member_assessment_details',
    fields: [
      'target_dimension',
      'target_member_id',
      'proposed_assessment_status',
      'proposed_assessment_detail',
      'assessment_rationale',
      'assessment_scope',
    ],
  },
  'existing-member-correction': {
    table: 'existing_member_correction_details',
    fields: [
      'target_dimension',
      'target_member_id',
      'corrected_name',
      'corrected_definition',
      'corrected_assessment_status',
      'corrected_assessment_detail',
      'correction_rationale',
    ],
  },
  'ontology-change': {
    table: 'ontology_change_details',
    fields: [
      'change_kind',
      'target_key',
      'proposed_definition',
      'compatibility_effect',
      'migration_requirements',
    ],
  },
  'explanatory-conjecture': {
    table: 'explanatory_conjecture_details',
    fields: [
      'problem_statement',
      'explanatory_claim',
      'essential_mechanism',
      'explanation_scope',
      'failure_condition',
    ],
  },
})

function insertDetail(database, proposalId, revision, kind, detail) {
  const contract = detailTables[kind]
  const fields = ['proposal_id', 'revision', ...contract.fields]
  return database
    .prepare(
      `INSERT INTO ${contract.table} (${fields.join(', ')})
       VALUES (${fields.map(() => '?').join(', ')})`,
    )
    .bind(proposalId, revision, ...contract.fields.map((field) => detail[field] ?? null))
}

function insertRevisionStatements(database, { proposalId, revision, accountId, input, current }) {
  const revisionId = `${proposalId}-revision-${revision}`
  return [
    database
      .prepare(
        `INSERT INTO proposal_revisions (
          proposal_id, revision, revision_id, author_account_id, title, summary,
          rationale, scope, content_sha256, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        proposalId,
        revision,
        revisionId,
        accountId,
        input.title,
        input.summary,
        input.rationale,
        input.scope,
        '',
        current,
        current,
      ),
  ]
}

export async function completeRevisionStatements(database, options) {
  const content = {
    title: options.input.title,
    summary: options.input.summary,
    rationale: options.input.rationale,
    scope: options.input.scope,
    detail: options.input.detail,
    evidence: options.input.evidence,
    references: options.input.references,
    assumptions: options.input.assumptions,
    framings: options.input.framings,
    relations: options.input.relations,
  }
  const contentHash = await sha256Hex(canonicalize(content))
  const statements = insertRevisionStatements(database, options)
  statements[0] = database
    .prepare(
      `INSERT INTO proposal_revisions (
        proposal_id, revision, revision_id, author_account_id, title, summary,
        rationale, scope, content_sha256, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      options.proposalId,
      options.revision,
      `${options.proposalId}-revision-${options.revision}`,
      options.accountId,
      options.input.title,
      options.input.summary,
      options.input.rationale,
      options.input.scope,
      contentHash,
      options.current,
      options.current,
    )
  statements.push(insertDetail(database, options.proposalId, options.revision, options.kind, options.input.detail))
  for (const [index, assumption] of options.input.assumptions.entries()) {
    statements.push(
      database.prepare(
        `INSERT INTO explanatory_conjecture_assumptions (
          assumption_id, proposal_id, revision, assumption_order, assumption_text
        ) VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        `assumption-${randomToken(18)}`,
        options.proposalId,
        options.revision,
        index + 1,
        assumption,
      ),
    )
  }
  for (const framing of options.input.framings) {
    statements.push(
      database.prepare(
        `INSERT INTO proposal_coordinate_framings (
          framing_id, proposal_id, revision, framing_order, coordinate_key_version,
          coordinate_key, validation_generation, model_id, material_id, mechanism_id,
          interface_id, coordinate_classification, cell_id, framing_rationale
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `framing-${randomToken(18)}`,
        options.proposalId,
        options.revision,
        framing.framing_order,
        framing.coordinate_key_version,
        framing.coordinate_key,
        framing.validation_generation,
        framing.model_id,
        framing.material_id,
        framing.mechanism_id,
        framing.interface_id,
        framing.coordinate_classification,
        framing.cell_id,
        framing.framing_rationale,
      ),
    )
  }
  for (const relation of options.input.relations) {
    statements.push(
      database.prepare(
        `INSERT INTO conjecture_relations (
          relation_id, source_proposal_id, source_revision, target_proposal_id,
          target_revision, relation_kind, relation_claim, relation_scope,
          author_account_id, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `relation-${randomToken(18)}`,
        options.proposalId,
        options.revision,
        relation.target_proposal_id,
        relation.target_revision,
        relation.relation_kind,
        relation.relation_claim,
        relation.relation_scope,
        options.accountId,
        options.current,
        options.current,
      ),
    )
  }
  for (const item of options.input.evidence) {
    statements.push(
      database
        .prepare(
          `INSERT INTO proposal_evidence (
            evidence_id, proposal_id, revision, evidence_kind, summary,
            source_timestamp, recorded_at, author_account_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `evidence-${randomToken(18)}`,
          options.proposalId,
          options.revision,
          item.evidence_kind,
          item.summary,
          options.current,
          options.current,
          options.accountId,
        ),
    )
  }
  for (const item of options.input.references) {
    statements.push(
      database
        .prepare(
          `INSERT INTO proposal_references (
            reference_id, proposal_id, revision, reference_kind, label,
            https_url, source_timestamp, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          `reference-${randomToken(18)}`,
          options.proposalId,
          options.revision,
          item.reference_kind,
          item.label,
          item.https_url,
          item.source_timestamp,
          options.current,
        ),
    )
  }
  return statements
}

function quotaStatement(database, authorization, mutationKind, accountId, current) {
  return database
    .prepare(
      `INSERT INTO quota_events (
        quota_event_id, account_id, ip_hmac_sha256, mutation_kind, recorded_at
      ) VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(`quota-${randomToken(18)}`, accountId, authorization.ip_hash, mutationKind, current)
}

async function commitIdempotent(database, statements, context, accountId, operation) {
  try {
    await database.batch(statements)
  } catch (error) {
    const existing = await database
      .prepare(
        `SELECT request_sha256, response_status, response_json
         FROM write_idempotency_keys WHERE account_id = ? AND operation = ? AND key_sha256 = ?`,
      )
      .bind(accountId, operation, context.key_hash)
      .first()
    if (existing && existing.request_sha256 === context.request_hash) {
      return { status: existing.response_status, body: JSON.parse(existing.response_json), replayed: true }
    }
    if (/constraint|unique|revision|transition|contiguous|active role|active operator|operator bootstrap/iu.test(String(error?.message ?? error))) {
      throw new ResponseError(409, 'concurrent_write_conflict', 'The public record changed concurrently; retry explicitly')
    }
    throw error
  }
  return null
}

async function idempotentMutation({
  request,
  env,
  authorization,
  body,
  operation,
  mutationKind,
  response,
  statements,
  idempotency = undefined,
}) {
  const context =
    idempotency ??
    (await idempotencyContext(request, env, authorization.session.account_id, operation, body))
  if (context.replay) return context.replay
  const current = nowIso(env)
  statements.push(
    quotaStatement(env.PROPOSALS_DB, authorization, mutationKind, authorization.session.account_id, current),
    idempotencyStatement(
      env.PROPOSALS_DB,
      context,
      authorization.session.account_id,
      operation,
      response,
      current,
    ),
  )
  return (
    (await commitIdempotent(
      env.PROPOSALS_DB,
      statements,
      context,
      authorization.session.account_id,
      operation,
    )) ?? response
  )
}

async function idempotentAdminMutation({ request, env, actor, body, operation, response, statements }) {
  const context = await idempotencyContext(request, env, actor.account_id, operation, body)
  if (context.replay) return context.replay
  const current = nowIso(env)
  statements.push(idempotencyStatement(env.PROPOSALS_DB, context, actor.account_id, operation, response, current))
  return (
    (await commitIdempotent(env.PROPOSALS_DB, statements, context, actor.account_id, operation)) ?? response
  )
}

export async function createProposal(request, env, authorization, rawBody) {
  const input = validateProposal(rawBody)
  const proposalId = `proposal-${randomToken(18)}`
  const current = nowIso(env)
  const response = {
    status: 201,
    body: {
      proposal_id: proposalId,
      revision: 1,
      administrative_state: 'submitted',
      review_status: 'unreviewed',
      public: true,
    },
  }
  const statements = [
    env.PROPOSALS_DB.prepare(
      `INSERT INTO proposals (
        proposal_id, proposal_kind, author_account_id, parent_proposal_id,
        parent_revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      proposalId,
      input.kind,
      authorization.session.account_id,
      input.parent_proposal_id,
      input.parent_revision,
      current,
    ),
    env.PROPOSALS_DB.prepare(
      `INSERT INTO proposal_state_events (
        proposal_id, event_sequence, state_event_id, from_state, to_state,
        selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
      ) VALUES (?, 1, ?, NULL, 'submitted', NULL, ?, 'Immediate public submission; unreviewed', ?, ?)`,
    ).bind(
      proposalId,
      `state-${proposalId}-1`,
      authorization.session.account_id,
      current,
      current,
    ),
    ...(await completeRevisionStatements(env.PROPOSALS_DB, {
      proposalId,
      revision: 1,
      accountId: authorization.session.account_id,
      kind: input.kind,
      input,
      current,
    })),
  ]
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: 'create-proposal',
    mutationKind: 'proposal',
    response,
    statements,
  })
}

export async function isCurrentAuthorPrincipal(database, storedAuthorId, actingPrincipalId) {
  if (storedAuthorId === actingPrincipalId) return true
  const direct = await database.prepare(
    `SELECT 1 AS authorized
     FROM current_principal_identity_links
     WHERE (github_principal_id = ? AND wallet_principal_id = ?)
        OR (wallet_principal_id = ? AND github_principal_id = ?)
     LIMIT 1`,
  ).bind(storedAuthorId, actingPrincipalId, storedAuthorId, actingPrincipalId).first()
  return direct?.authorized === 1
}

export async function createRevision(request, env, authorization, proposalId, rawBody) {
  const proposal = await env.PROPOSALS_DB.prepare(
    `SELECT proposal_kind, author_account_id, current_revision, current_admin_state
     FROM proposals WHERE proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  if (!proposal) throw new ResponseError(404, 'proposal_not_found', 'The proposal does not exist')
  if (!(await isCurrentAuthorPrincipal(env.PROPOSALS_DB, proposal.author_account_id, authorization.session.account_id))) {
    throw new ResponseError(403, 'author_required', 'Only the proposal author may append a submitted revision')
  }
  if (proposal.current_admin_state !== 'submitted') {
    throw new ResponseError(
      409,
      'follow_up_required',
      'After triage, a change must be submitted as a new proposal linked to an exact prior revision',
    )
  }
  const input = validateProposalRevision(proposal.proposal_kind, rawBody)
  const revision = proposal.current_revision + 1
  const current = nowIso(env)
  const response = {
    status: 201,
    body: { proposal_id: proposalId, revision, administrative_state: 'submitted', public: true },
  }
  const statements = await completeRevisionStatements(env.PROPOSALS_DB, {
    proposalId,
    revision,
    accountId: authorization.session.account_id,
    kind: proposal.proposal_kind,
    input,
    current,
  })
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `revise:${proposalId}`,
    mutationKind: 'revision',
    response,
    statements,
  })
}

async function requireRevision(database, proposalId, revision) {
  const row = await database
    .prepare('SELECT 1 AS present FROM proposal_revisions WHERE proposal_id = ? AND revision = ?')
    .bind(proposalId, revision)
    .first()
  if (!row) throw new ResponseError(404, 'revision_not_found', 'The exact proposal revision does not exist')
}

export async function createCriticism(request, env, authorization, proposalId, revision, rawBody) {
  await requireRevision(env.PROPOSALS_DB, proposalId, revision)
  const input = validateCriticism(rawBody)
  const criticismId = `criticism-${randomToken(18)}`
  const current = nowIso(env)
  const response = { status: 201, body: { criticism_id: criticismId, proposal_id: proposalId, target_revision: revision } }
  const statements = [
    env.PROPOSALS_DB.prepare(
      `INSERT INTO criticisms (
        criticism_id, proposal_id, target_revision, author_account_id, title,
        criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      criticismId,
      proposalId,
      revision,
      authorization.session.account_id,
      input.title,
      input.criticism,
      input.scope,
      current,
      current,
      input.focus_kind,
      input.focus_ref,
    ),
  ]
  for (const reference of input.references) {
    statements.push(
      env.PROPOSALS_DB.prepare(
        `INSERT INTO criticism_references
         (reference_id, criticism_id, label, https_url, recorded_at) VALUES (?, ?, ?, ?, ?)`,
      ).bind(`reference-${randomToken(18)}`, criticismId, reference.label, reference.https_url, current),
    )
  }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `criticize:${proposalId}:${revision}`,
    mutationKind: 'criticism',
    response,
    statements,
  })
}

export async function createReply(request, env, authorization, criticismId, rawBody) {
  const criticism = await env.PROPOSALS_DB.prepare(
    'SELECT proposal_id, target_revision FROM criticisms WHERE criticism_id = ?',
  )
    .bind(criticismId)
    .first()
  if (!criticism) throw new ResponseError(404, 'criticism_not_found', 'The criticism does not exist')
  const input = validateReply(rawBody)
  const replyId = `reply-${randomToken(18)}`
  const current = nowIso(env)
  const response = { status: 201, body: { reply_id: replyId, criticism_id: criticismId } }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `reply:${criticismId}`,
    mutationKind: 'reply',
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO criticism_replies (
          reply_id, criticism_id, proposal_id, target_revision, author_account_id,
          reply, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        replyId,
        criticismId,
        criticism.proposal_id,
        criticism.target_revision,
        authorization.session.account_id,
        input.reply,
        current,
        current,
      ),
    ],
  })
}

export async function createTestReport(request, env, authorization, proposalId, revision, rawBody) {
  await requireRevision(env.PROPOSALS_DB, proposalId, revision)
  const input = validateTestReport(rawBody)
  const testReportId = `test-${randomToken(18)}`
  const current = nowIso(env)
  const response = {
    status: 201,
    body: { test_report_id: testReportId, proposal_id: proposalId, target_revision: revision },
  }
  const statements = [
    env.PROPOSALS_DB.prepare(
      `INSERT INTO scoped_test_reports (
        test_report_id, proposal_id, target_revision, author_account_id, test_name,
        protocol, result, interpretation, test_relation, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      testReportId,
      proposalId,
      revision,
      authorization.session.account_id,
      input.test_name,
      input.protocol,
      input.result,
      input.interpretation,
      input.test_relation,
      current,
      current,
    ),
  ]
  for (const reference of input.references) {
    statements.push(
      env.PROPOSALS_DB.prepare(
        `INSERT INTO test_report_references
         (reference_id, test_report_id, label, https_url, recorded_at) VALUES (?, ?, ?, ?, ?)`,
      ).bind(`reference-${randomToken(18)}`, testReportId, reference.label, reference.https_url, current),
    )
  }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `test:${proposalId}:${revision}`,
    mutationKind: 'test-report',
    response,
    statements,
  })
}

export async function createInterpretation(request, env, authorization, proposalId, revision, rawBody) {
  await requireRevision(env.PROPOSALS_DB, proposalId, revision)
  const input = validateInterpretation(rawBody)
  const interpretationId = `interpretation-${randomToken(18)}`
  const current = nowIso(env)
  const response = {
    status: 201,
    body: { interpretation_id: interpretationId, proposal_id: proposalId, target_revision: revision },
  }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `interpret:${proposalId}:${revision}`,
    mutationKind: 'interpretation',
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO competing_interpretations (
          interpretation_id, proposal_id, target_revision, author_account_id, title,
          interpretation, scope, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        interpretationId,
        proposalId,
        revision,
        authorization.session.account_id,
        input.title,
        input.interpretation,
        input.scope,
        current,
        current,
      ),
    ],
  })
}

export async function createAppeal(request, env, authorization, moderationActionId, rawBody) {
  const target = await env.PROPOSALS_DB.prepare(
    'SELECT 1 AS present FROM moderation_actions WHERE moderation_action_id = ?',
  )
    .bind(moderationActionId)
    .first()
  if (!target) throw new ResponseError(404, 'moderation_action_not_found', 'The moderation action does not exist')
  const input = validateAppeal(rawBody)
  const appealId = `appeal-${randomToken(18)}`
  const current = nowIso(env)
  const response = { status: 201, body: { appeal_id: appealId, state: 'submitted', public: true } }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation: `appeal:${moderationActionId}`,
    mutationKind: 'appeal',
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO appeals (
          appeal_id, moderation_action_id, appellant_account_id, appeal,
          source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(
        appealId,
        moderationActionId,
        authorization.session.account_id,
        input.appeal,
        current,
        current,
      ),
      env.PROPOSALS_DB.prepare(
        `INSERT INTO appeal_state_events (
          appeal_id, event_sequence, appeal_state_event_id, from_state, to_state,
          actor_account_id, rationale, source_timestamp, recorded_at
        ) VALUES (?, 1, ?, NULL, 'submitted', ?, 'Public appeal submitted', ?, ?)`,
      ).bind(appealId, `appeal-state-${appealId}-1`, authorization.session.account_id, current, current),
    ],
  })
}

const withdrawableProposalStates = new Set(['submitted', 'triaged', 'under-review', 'selected-for-export'])

export async function withdrawProposal(request, env, authorization, proposalId, rawBody) {
  const operation = `withdraw:${proposalId}`
  const idempotency = await idempotencyContext(
    request,
    env,
    authorization.session.account_id,
    operation,
    rawBody,
  )
  if (idempotency.replay) return idempotency.replay
  if (rawBody.to_state !== undefined) {
    throw new InputError('The contributor withdrawal route cannot select an arbitrary state', 'to_state')
  }
  const rationale = text(rawBody.rationale, 'rationale', { max: 4000 })
  const proposal = await env.PROPOSALS_DB.prepare(
    `SELECT author_account_id, current_admin_state, current_state_event_sequence
     FROM proposals WHERE proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  if (!proposal) throw new ResponseError(404, 'proposal_not_found', 'The proposal does not exist')
  if (!(await isCurrentAuthorPrincipal(env.PROPOSALS_DB, proposal.author_account_id, authorization.session.account_id))) {
    throw new ResponseError(403, 'proposal_author_required', 'Only the proposal author may withdraw it')
  }
  if (!withdrawableProposalStates.has(proposal.current_admin_state)) {
    throw new ResponseError(409, 'proposal_not_withdrawable', 'Only a nonterminal proposal may be withdrawn')
  }
  const sequence = proposal.current_state_event_sequence + 1
  const current = nowIso(env)
  const response = {
    status: 201,
    body: { proposal_id: proposalId, event_sequence: sequence, administrative_state: 'withdrawn' },
  }
  return idempotentMutation({
    request,
    env,
    authorization,
    body: rawBody,
    operation,
    mutationKind: 'withdrawal',
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO proposal_state_events (
          proposal_id, event_sequence, state_event_id, from_state, to_state,
          selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, 'withdrawn', NULL, ?, ?, ?, ?)`,
      ).bind(
        proposalId,
        sequence,
        `state-${proposalId}-${sequence}`,
        proposal.current_admin_state,
        authorization.session.account_id,
        rationale,
        current,
        current,
      ),
    ],
    idempotency,
  })
}

export async function changeOperatorRole(request, env, operator, rawBody) {
  if (rawBody.target_account_id !== undefined || rawBody.account_id !== undefined) {
    throw new InputError('Internal account identifiers are not accepted', 'target_github_login')
  }
  const targetLogin = text(rawBody.target_github_login, 'target_github_login', { max: 39 })
  const action = text(rawBody.action, 'action', { max: 10 })
  if (!['grant', 'revoke'].includes(action)) {
    throw new InputError('action must be grant or revoke', 'action')
  }
  const target = await env.PROPOSALS_DB.prepare(
    'SELECT account_id, github_login FROM public_accounts WHERE github_login = ? COLLATE NOCASE',
  )
    .bind(targetLogin)
    .first()
  if (!target) throw new ResponseError(404, 'contributor_not_found', 'The public GitHub contributor does not exist')

  const current = nowIso(env)
  const eventId = `role-event-${randomToken(18)}`
  const actionKind = action === 'grant' ? 'granted' : 'revoked'
  const response = {
    status: 201,
    body: {
      role_event_id: eventId,
      target_github_login: target.github_login,
      role: 'operator',
      action: actionKind,
      public: true,
    },
  }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: `admin-operator-role:${target.account_id}`,
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO account_role_events (
          role_event_id, account_id, role, action_kind, actor_account_id,
          authority_kind, authority_ref, rationale, source_timestamp, recorded_at
        ) VALUES (?, ?, 'operator', ?, ?, 'operator', ?, ?, ?, ?)`,
      ).bind(
        eventId,
        target.account_id,
        actionKind,
        operator.account_id,
        `worker-api:${eventId}`,
        text(rawBody.rationale, 'rationale', { max: 4000 }),
        current,
        current,
      ),
    ],
  })
}

export async function transitionProposal(request, env, operator, proposalId, rawBody) {
  const toState = text(rawBody.to_state, 'to_state', { max: 40 })
  if (!administrativeStates.includes(toState) || toState === 'submitted') {
    throw new InputError('to_state is not an available administrative transition', 'to_state')
  }
  if (toState === 'withdrawn') {
    throw new InputError('Withdrawal is reserved to the proposal author route', 'to_state')
  }
  const rationale = text(rawBody.rationale, 'rationale', { max: 4000 })
  const proposal = await env.PROPOSALS_DB.prepare(
    `SELECT current_admin_state, current_state_event_sequence, current_revision
     FROM proposals WHERE proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  if (!proposal) throw new ResponseError(404, 'proposal_not_found', 'The proposal does not exist')
  let selectedRevision = null
  if (toState === 'selected-for-export') {
    selectedRevision = rawBody.selected_revision
    if (!Number.isInteger(selectedRevision) || selectedRevision < 1 || selectedRevision > proposal.current_revision) {
      throw new InputError('selected_revision must identify an existing revision', 'selected_revision')
    }
  }
  const sequence = proposal.current_state_event_sequence + 1
  const current = nowIso(env)
  const response = {
    status: 201,
    body: { proposal_id: proposalId, event_sequence: sequence, administrative_state: toState },
  }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: `admin-state:${proposalId}`,
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
      `INSERT INTO proposal_state_events (
        proposal_id, event_sequence, state_event_id, from_state, to_state,
        selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        proposalId,
        sequence,
        `state-${proposalId}-${sequence}`,
        proposal.current_admin_state,
        toState,
        selectedRevision,
        operator.account_id,
        rationale,
        current,
        current,
      ),
    ],
  })
}

async function moderationTarget(database, rawBody) {
  const kind = text(rawBody.target_kind, 'target_kind', { max: 40 })
  const values = {
    target_proposal_id: null,
    target_revision: null,
    target_criticism_id: null,
    target_reply_id: null,
    target_test_report_id: null,
    target_interpretation_id: null,
    target_account_id: null,
  }
  switch (kind) {
    case 'proposal-revision':
      values.target_proposal_id = text(rawBody.proposal_id, 'proposal_id', { max: 100 })
      if (!Number.isInteger(rawBody.revision) || rawBody.revision < 1) {
        throw new InputError('revision must be a positive integer', 'revision')
      }
      values.target_revision = rawBody.revision
      break
    case 'criticism':
      values.target_criticism_id = text(rawBody.criticism_id, 'criticism_id', { max: 100 })
      break
    case 'reply':
      values.target_reply_id = text(rawBody.reply_id, 'reply_id', { max: 100 })
      break
    case 'test-report':
      values.target_test_report_id = text(rawBody.test_report_id, 'test_report_id', { max: 100 })
      break
    case 'interpretation':
      values.target_interpretation_id = text(rawBody.interpretation_id, 'interpretation_id', { max: 100 })
      break
    case 'account':
      if (
        rawBody.target_account_id !== undefined || rawBody.account_id !== undefined ||
        rawBody.target_principal_id !== undefined || rawBody.principal_id !== undefined
      ) {
        throw new InputError('Internal contributor identifiers are not accepted', 'target_github_login')
      }
      {
        const hasGithub = rawBody.target_github_login !== undefined
        const hasPseudonym = rawBody.target_public_pseudonym !== undefined
        if (hasGithub === hasPseudonym) {
          throw new ResponseError(
            400,
            'contributor_lookup_ambiguous',
            'Provide exactly one public GitHub login or exact wallet pseudonym',
          )
        }
        const profile = hasGithub
          ? await database.prepare(
            `SELECT principal_id FROM public_contributor_profiles
             WHERE principal_kind = 'github' AND github_login = ? COLLATE NOCASE`,
          ).bind(text(rawBody.target_github_login, 'target_github_login', { max: 39 })).first()
          : await database.prepare(
            `SELECT principal_id FROM public_contributor_profiles
             WHERE principal_kind = 'base-wallet' AND public_pseudonym = ?`,
          ).bind(text(rawBody.target_public_pseudonym, 'target_public_pseudonym', { max: 69 })).first()
        if (!profile) throw new ResponseError(404, 'contributor_not_found', 'The public contributor does not exist')
        values.target_account_id = profile.principal_id
      }
      break
    default:
      throw new InputError('target_kind is not supported', 'target_kind')
  }
  return { kind, ...values }
}

export async function createModerationAction(request, env, operator, rawBody) {
  const target = await moderationTarget(env.PROPOSALS_DB, rawBody)
  const actionKind = text(rawBody.action_kind, 'action_kind', { max: 40 })
  if (!['label', 'hide-from-listing', 'restore-to-listing', 'lock-contributor', 'unlock-contributor'].includes(actionKind)) {
    throw new InputError('action_kind is not supported', 'action_kind')
  }
  if (['hide-from-listing', 'restore-to-listing'].includes(actionKind) && target.kind === 'account') {
    throw new InputError('Listing actions must target a public proposal or content record', 'target_kind')
  }
  if (['lock-contributor', 'unlock-contributor'].includes(actionKind) && target.kind !== 'account') {
    throw new InputError('Contributor lock actions must target a public contributor handle', 'target_kind')
  }
  const actionId = `moderation-${randomToken(18)}`
  const current = nowIso(env)
  const response = { status: 201, body: { moderation_action_id: actionId, public: true } }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: 'admin-moderation-action',
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO moderation_actions (
          moderation_action_id, moderator_account_id, action_kind, target_kind,
          target_proposal_id, target_revision, target_criticism_id, target_reply_id,
          target_test_report_id, target_interpretation_id, target_account_id,
          reason_code, explanation, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        actionId,
        operator.account_id,
        actionKind,
        target.kind,
        target.target_proposal_id,
        target.target_revision,
        target.target_criticism_id,
        target.target_reply_id,
        target.target_test_report_id,
        target.target_interpretation_id,
        target.target_account_id,
        text(rawBody.reason_code, 'reason_code', { max: 80 }),
        text(rawBody.explanation, 'explanation', { max: 4000 }),
        current,
        current,
      ),
    ],
  })
}

export async function transitionAppeal(request, env, operator, appealId, rawBody) {
  const state = text(rawBody.to_state, 'to_state', { max: 40 })
  if (!['under-review', 'upheld', 'granted', 'withdrawn'].includes(state)) {
    throw new InputError('appeal state is not supported', 'to_state')
  }
  const latest = await env.PROPOSALS_DB.prepare(
    `SELECT event_sequence, to_state FROM appeal_state_events
     WHERE appeal_id = ? ORDER BY event_sequence DESC LIMIT 1`,
  )
    .bind(appealId)
    .first()
  if (!latest) throw new ResponseError(404, 'appeal_not_found', 'The appeal does not exist')
  const sequence = latest.event_sequence + 1
  const current = nowIso(env)
  const response = { status: 201, body: { appeal_id: appealId, event_sequence: sequence, state } }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: `admin-appeal-state:${appealId}`,
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO appeal_state_events (
          appeal_id, event_sequence, appeal_state_event_id, from_state, to_state,
          actor_account_id, rationale, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        appealId,
        sequence,
        `appeal-state-${appealId}-${sequence}`,
        latest.to_state,
        state,
        operator.account_id,
        text(rawBody.rationale, 'rationale', { max: 4000 }),
        current,
        current,
      ),
    ],
  })
}

function publicAccountColumns(alias = 'a') {
  return `${alias}.principal_kind, ${alias}.public_pseudonym, ${alias}.github_login, ${alias}.github_profile_url, ${alias}.github_avatar_url`
}

async function all(database, sql, ...bindings) {
  return (await database.prepare(sql).bind(...bindings).all()).results
}

export async function listProposals(env, url) {
  const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get('limit') ?? '20', 10) || 20, 1), 50)
  const cursor = url.searchParams.get('cursor') ?? ''
  const kind = url.searchParams.get('kind')
  const state = url.searchParams.get('state')
  const coordinateKey = url.searchParams.get('coordinate_key')
  if (kind && !detailTables[kind]) throw new InputError('kind filter is not supported', 'kind')
  if (state && !administrativeStates.includes(state)) throw new InputError('state filter is not supported', 'state')
  const clauses = ['p.proposal_id > ?']
  const bindings = [cursor]
  if (kind) {
    clauses.push('p.proposal_kind = ?')
    bindings.push(kind)
  }
  if (state) {
    clauses.push('p.current_admin_state = ?')
    bindings.push(state)
  }
  if (coordinateKey) {
    clauses.push(`EXISTS (
      SELECT 1 FROM proposal_coordinate_framings framing
      WHERE framing.proposal_id=p.proposal_id AND framing.revision=p.current_revision
        AND framing.coordinate_key=?
    )`)
    bindings.push(coordinateKey)
  }
  bindings.push(limit + 1)
  const rows = await all(
    env.PROPOSALS_DB,
    `SELECT p.proposal_id, p.proposal_kind, p.created_at, p.current_revision,
            p.current_admin_state, p.current_state_event_sequence, r.title, r.summary,
            ${publicAccountColumns()}, p.parent_proposal_id, p.parent_revision
     FROM proposals p
     JOIN proposal_revisions r ON r.proposal_id = p.proposal_id AND r.revision = p.current_revision
     JOIN public_contributor_profiles a ON a.principal_id = p.author_account_id
     WHERE ${clauses.join(' AND ')}
       AND NOT EXISTS (
         SELECT 1 FROM current_listing_moderation visibility
         WHERE visibility.target_kind = 'proposal-revision'
           AND visibility.target_proposal_id = p.proposal_id
           AND visibility.target_revision = p.current_revision
           AND visibility.listing_visibility = 'hidden'
       )
     ORDER BY p.proposal_id LIMIT ?`,
    ...bindings,
  )
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  return {
    status: 200,
    body: {
      items,
      next_cursor: hasMore ? items.at(-1).proposal_id : null,
      administrative_states_only: true,
      epistemic_ranking: false,
    },
  }
}

async function readDetail(database, kind, proposalId, revision) {
  const contract = detailTables[kind]
  const detail = await database
    .prepare(`SELECT ${contract.fields.join(', ')} FROM ${contract.table} WHERE proposal_id = ? AND revision = ?`)
    .bind(proposalId, revision)
    .first()
  if (kind === 'explanatory-conjecture' && detail) {
    detail.assumptions = await all(
      database,
      `SELECT assumption_id,assumption_order,assumption_text
       FROM explanatory_conjecture_assumptions
       WHERE proposal_id=? AND revision=? ORDER BY assumption_order`,
      proposalId,
      revision,
    )
    detail.framings = await all(
      database,
      `SELECT framing_id,framing_order,coordinate_key_version,coordinate_key,
              validation_generation,model_id,material_id,mechanism_id,interface_id,
              coordinate_classification,cell_id,framing_rationale
       FROM proposal_coordinate_framings
       WHERE proposal_id=? AND revision=? ORDER BY framing_order`,
      proposalId,
      revision,
    )
    detail.relations = await all(
      database,
      `SELECT relation_id,relation_kind,target_proposal_id,target_revision,
              relation_claim,relation_scope,source_timestamp,recorded_at
       FROM conjecture_relations
       WHERE source_proposal_id=? AND source_revision=? ORDER BY relation_id`,
      proposalId,
      revision,
    )
  }
  return detail
}

export async function readProposal(env, proposalId) {
  const proposal = await env.PROPOSALS_DB.prepare(
    `SELECT p.proposal_id, p.proposal_kind, p.parent_proposal_id, p.parent_revision,
            p.created_at, p.current_revision, p.current_state_event_sequence,
            p.current_admin_state, ${publicAccountColumns()}
     FROM proposals p JOIN public_contributor_profiles a ON a.principal_id = p.author_account_id
     WHERE p.proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  if (!proposal) throw new ResponseError(404, 'proposal_not_found', 'The proposal does not exist')
  const revisions = await all(
    env.PROPOSALS_DB,
    `SELECT r.proposal_id, r.revision, r.revision_id, r.title, r.summary,
            r.rationale, r.scope, r.content_sha256, r.source_timestamp, r.recorded_at,
            ${publicAccountColumns()}
     FROM proposal_revisions r JOIN public_contributor_profiles a ON a.principal_id = r.author_account_id
     WHERE r.proposal_id = ? ORDER BY r.revision`,
    proposalId,
  )
  for (const revision of revisions) {
    revision.detail = await readDetail(env.PROPOSALS_DB, proposal.proposal_kind, proposalId, revision.revision)
    revision.evidence = await all(
      env.PROPOSALS_DB,
      `SELECT e.evidence_id, e.evidence_kind, e.summary, e.source_timestamp, e.recorded_at,
              ${publicAccountColumns()}
       FROM proposal_evidence e JOIN public_contributor_profiles a ON a.principal_id = e.author_account_id
       WHERE e.proposal_id = ? AND e.revision = ? ORDER BY e.evidence_id`,
      proposalId,
      revision.revision,
    )
    revision.references = await all(
      env.PROPOSALS_DB,
      `SELECT reference_id, reference_kind, label, https_url, source_timestamp, recorded_at
       FROM proposal_references WHERE proposal_id = ? AND revision = ? ORDER BY reference_id`,
      proposalId,
      revision.revision,
    )
  }
  const stateHistory = await all(
    env.PROPOSALS_DB,
    `SELECT e.proposal_id, e.event_sequence, e.state_event_id, e.from_state, e.to_state,
            e.selected_revision, e.rationale, e.source_timestamp, e.recorded_at,
            ${publicAccountColumns()}
     FROM proposal_state_events e JOIN public_contributor_profiles a ON a.principal_id = e.actor_account_id
     WHERE e.proposal_id = ? ORDER BY e.event_sequence`,
    proposalId,
  )
  const criticisms = await all(
    env.PROPOSALS_DB,
    `SELECT c.criticism_id, c.proposal_id, c.target_revision, c.title, c.criticism,
            c.scope, c.focus_kind, c.focus_ref, c.source_timestamp, c.recorded_at, ${publicAccountColumns()}
     FROM criticisms c JOIN public_contributor_profiles a ON a.principal_id = c.author_account_id
     WHERE c.proposal_id = ? ORDER BY c.target_revision, c.criticism_id`,
    proposalId,
  )
  for (const criticism of criticisms) {
    criticism.replies = await all(
      env.PROPOSALS_DB,
      `SELECT r.reply_id, r.criticism_id, r.proposal_id, r.target_revision, r.reply,
              r.source_timestamp, r.recorded_at, ${publicAccountColumns()}
       FROM criticism_replies r JOIN public_contributor_profiles a ON a.principal_id = r.author_account_id
       WHERE r.criticism_id = ? ORDER BY r.reply_id`,
      criticism.criticism_id,
    )
    criticism.references = await all(
      env.PROPOSALS_DB,
      'SELECT * FROM criticism_references WHERE criticism_id = ? ORDER BY reference_id',
      criticism.criticism_id,
    )
  }
  const tests = await all(
    env.PROPOSALS_DB,
    `SELECT t.test_report_id, t.proposal_id, t.target_revision, t.test_name,
            t.protocol, t.result, t.interpretation, t.test_relation,
            t.source_timestamp, t.recorded_at, ${publicAccountColumns()}
     FROM scoped_test_reports t JOIN public_contributor_profiles a ON a.principal_id = t.author_account_id
     WHERE t.proposal_id = ? ORDER BY t.target_revision, t.test_report_id`,
    proposalId,
  )
  for (const report of tests) {
    report.references = await all(
      env.PROPOSALS_DB,
      'SELECT * FROM test_report_references WHERE test_report_id = ? ORDER BY reference_id',
      report.test_report_id,
    )
  }
  const interpretations = await all(
    env.PROPOSALS_DB,
    `SELECT i.interpretation_id, i.proposal_id, i.target_revision, i.title,
            i.interpretation, i.scope, i.source_timestamp, i.recorded_at,
            ${publicAccountColumns()}
     FROM competing_interpretations i JOIN public_contributor_profiles a ON a.principal_id = i.author_account_id
     WHERE i.proposal_id = ? ORDER BY i.target_revision, i.interpretation_id`,
    proposalId,
  )
  const moderation = await all(
    env.PROPOSALS_DB,
    `SELECT m.action_sequence, m.moderation_action_id, m.action_kind, m.target_kind,
            m.target_proposal_id, m.target_revision, m.target_criticism_id,
            m.target_reply_id, m.target_test_report_id, m.target_interpretation_id,
            ta.github_login AS target_github_login,
            ta.public_pseudonym AS target_public_pseudonym,
            ta.principal_kind AS target_principal_kind,
            m.reason_code, m.explanation,
            m.source_timestamp, m.recorded_at, ${publicAccountColumns()}
     FROM moderation_actions m
     JOIN public_contributor_profiles a ON a.principal_id = m.moderator_account_id
     LEFT JOIN public_contributor_profiles ta ON ta.principal_id = m.target_account_id
     WHERE m.target_proposal_id = ?
        OR m.target_criticism_id IN (SELECT criticism_id FROM criticisms WHERE proposal_id = ?)
        OR m.target_reply_id IN (SELECT reply_id FROM criticism_replies WHERE proposal_id = ?)
        OR m.target_test_report_id IN (SELECT test_report_id FROM scoped_test_reports WHERE proposal_id = ?)
        OR m.target_interpretation_id IN (SELECT interpretation_id FROM competing_interpretations WHERE proposal_id = ?)
        OR m.target_account_id = (SELECT author_account_id FROM proposals WHERE proposal_id = ?)
     ORDER BY m.action_sequence`,
    proposalId,
    proposalId,
    proposalId,
    proposalId,
    proposalId,
    proposalId,
  )
  const listingModeration = await all(
    env.PROPOSALS_DB,
    `SELECT action_sequence, moderation_action_id, action_kind, listing_visibility,
            target_kind, target_proposal_id, target_revision, target_criticism_id,
            target_reply_id, target_test_report_id, target_interpretation_id,
            reason_code, explanation, source_timestamp, recorded_at
     FROM current_listing_moderation
     WHERE target_proposal_id = ?
        OR target_criticism_id IN (SELECT criticism_id FROM criticisms WHERE proposal_id = ?)
        OR target_reply_id IN (SELECT reply_id FROM criticism_replies WHERE proposal_id = ?)
        OR target_test_report_id IN (SELECT test_report_id FROM scoped_test_reports WHERE proposal_id = ?)
        OR target_interpretation_id IN (SELECT interpretation_id FROM competing_interpretations WHERE proposal_id = ?)
     ORDER BY action_sequence`,
    proposalId,
    proposalId,
    proposalId,
    proposalId,
    proposalId,
  )
  const contributorLock = await env.PROPOSALS_DB.prepare(
    `SELECT lock.action_sequence, lock.moderation_action_id, lock.action_kind,
            lock.is_locked, lock.reason_code, lock.explanation,
            lock.source_timestamp, lock.recorded_at,
            account.github_login AS target_github_login,
            account.public_pseudonym AS target_public_pseudonym,
            account.principal_kind AS target_principal_kind
     FROM proposals proposal
     JOIN public_contributor_profiles account ON account.principal_id = proposal.author_account_id
     LEFT JOIN current_principal_locks lock ON lock.target_principal_id = proposal.author_account_id
     WHERE proposal.proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  const currentActionIds = new Set(listingModeration.map((item) => item.moderation_action_id))
  if (contributorLock?.moderation_action_id) currentActionIds.add(contributorLock.moderation_action_id)
  for (const action of moderation) action.current_effective = currentActionIds.has(action.moderation_action_id)
  for (const action of moderation) {
    action.appeals = await all(
      env.PROPOSALS_DB,
      `SELECT ap.appeal_id, ap.moderation_action_id, ap.appeal,
              ap.source_timestamp, ap.recorded_at, ${publicAccountColumns()}
       FROM appeals ap JOIN public_contributor_profiles a ON a.principal_id = ap.appellant_account_id
       WHERE ap.moderation_action_id = ? ORDER BY ap.appeal_id`,
      action.moderation_action_id,
    )
    for (const appeal of action.appeals) {
      appeal.state_history = await all(
        env.PROPOSALS_DB,
        `SELECT e.event_sequence, e.appeal_state_event_id, e.from_state, e.to_state,
                e.rationale, e.source_timestamp, e.recorded_at, ${publicAccountColumns()}
         FROM appeal_state_events e JOIN public_contributor_profiles a ON a.principal_id = e.actor_account_id
         WHERE e.appeal_id = ? ORDER BY e.event_sequence`,
        appeal.appeal_id,
      )
    }
  }
  return {
    status: 200,
    body: {
      proposal,
      revisions,
      state_history: stateHistory,
      criticisms,
      tests,
      competing_interpretations: interpretations,
      moderation,
      listing_moderation: listingModeration,
      moderation_tombstones: listingModeration.filter((item) => item.listing_visibility === 'hidden'),
      contributor_lock: contributorLock?.moderation_action_id
        ? {
            action_sequence: contributorLock.action_sequence,
            moderation_action_id: contributorLock.moderation_action_id,
            action_kind: contributorLock.action_kind,
            is_locked: contributorLock.is_locked === 1,
            reason_code: contributorLock.reason_code,
            explanation: contributorLock.explanation,
            source_timestamp: contributorLock.source_timestamp,
            recorded_at: contributorLock.recorded_at,
            target_github_login: contributorLock.target_github_login,
            target_public_pseudonym: contributorLock.target_public_pseudonym,
            target_principal_kind: contributorLock.target_principal_kind,
          }
        : null,
      proposal_listing_visibility:
        listingModeration.find(
          (item) =>
            item.target_kind === 'proposal-revision' &&
            item.target_proposal_id === proposalId &&
            item.target_revision === proposal.current_revision,
        )?.listing_visibility ?? 'listed',
      administrative_states_only: true,
      epistemic_ranking: false,
    },
  }
}

async function buildCanonicalExport(env, proposalId, selection, scope) {
  const full = (await readProposal(env, proposalId)).body
  const revision = full.revisions.find((item) => item.revision === selection.selected_revision)
  if (!revision) throw new ResponseError(409, 'selected_revision_missing', 'The selected revision no longer exists')
  const exactCriticisms = full.criticisms.filter((item) => item.target_revision === selection.selected_revision)
  const exactTests = full.tests.filter((item) => item.target_revision === selection.selected_revision)
  const exactInterpretations = full.competing_interpretations.filter(
    (item) => item.target_revision === selection.selected_revision,
  )
  return {
    export_contract: 'cintamani-public-proposal-export@v1',
    scope,
    criticisms_non_exhaustive: true,
    proposal: {
      proposal_id: full.proposal.proposal_id,
      proposal_kind: full.proposal.proposal_kind,
      parent_proposal_id: full.proposal.parent_proposal_id,
      parent_revision: full.proposal.parent_revision,
      created_at: full.proposal.created_at,
      author: {
        principal_kind: full.proposal.principal_kind,
        public_pseudonym: full.proposal.public_pseudonym,
        github_login: full.proposal.github_login,
        github_profile_url: full.proposal.github_profile_url,
        github_avatar_url: full.proposal.github_avatar_url,
      },
    },
    selected_revision: revision,
    selected_state_event: full.state_history.find(
      (item) => item.event_sequence === selection.current_state_event_sequence,
    ),
    criticisms: exactCriticisms,
    scoped_tests: exactTests,
    competing_interpretations: exactInterpretations,
  }
}

export async function createMaintainerExport(request, env, operator, proposalId, rawBody) {
  const scope = text(rawBody.scope, 'scope', { max: 4000 })
  const selection = await env.PROPOSALS_DB.prepare(
    `SELECT current_admin_state, current_state_event_sequence,
            (SELECT selected_revision FROM proposal_state_events e
             WHERE e.proposal_id = p.proposal_id AND e.event_sequence = p.current_state_event_sequence)
            AS selected_revision
     FROM proposals p WHERE proposal_id = ?`,
  )
    .bind(proposalId)
    .first()
  if (!selection) throw new ResponseError(404, 'proposal_not_found', 'The proposal does not exist')
  if (selection.current_admin_state !== 'selected-for-export' || !selection.selected_revision) {
    throw new ResponseError(409, 'proposal_not_selected', 'A operator must first select an exact revision for export')
  }
  const canonicalBody = await buildCanonicalExport(env, proposalId, selection, scope)
  const canonicalJson = canonicalize(canonicalBody)
  const contentHash = await sha256Hex(canonicalJson)
  const exportId = `sha256-${contentHash}`
  const current = nowIso(env)
  const existing = await env.PROPOSALS_DB.prepare(
    'SELECT export_id FROM maintainer_exports WHERE content_sha256 = ?',
  )
    .bind(contentHash)
    .first()
  const statements = []
  if (!existing) {
    statements.push(
      env.PROPOSALS_DB.prepare(
      `INSERT INTO maintainer_exports (
        export_id, proposal_id, selected_revision, selected_state_event_sequence,
        export_scope, criticisms_non_exhaustive, canonical_json, content_sha256,
        created_by_account_id, recorded_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
      .bind(
        exportId,
        proposalId,
        selection.selected_revision,
        selection.current_state_event_sequence,
        scope,
        canonicalJson,
        contentHash,
        operator.account_id,
        current,
      ),
    )
  }
  const response = {
    status: 201,
    body: { export_id: existing?.export_id ?? exportId, content_sha256: contentHash, canonical: canonicalBody },
  }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: `admin-export:${proposalId}`,
    response,
    statements,
  })
}

export async function readMaintainerExport(env, exportId) {
  const row = await env.PROPOSALS_DB.prepare(
    `SELECT export_id, proposal_id, selected_revision, selected_state_event_sequence,
            export_scope, criticisms_non_exhaustive, canonical_json, content_sha256, recorded_at
     FROM maintainer_exports WHERE export_id = ?`,
  )
    .bind(exportId)
    .first()
  if (!row) throw new ResponseError(404, 'export_not_found', 'The export does not exist')
  return {
    status: 200,
    body: { ...row, canonical: JSON.parse(row.canonical_json), canonical_json: undefined },
  }
}

export async function recordAdmissionLink(request, env, operator, exportId, rawBody) {
  const admissionId = text(rawBody.canonical_admission_id, 'canonical_admission_id', { max: 160 })
  const entryId = text(rawBody.canonical_entry_id, 'canonical_entry_id', { max: 160 })
  const commitSha = text(rawBody.canonical_commit_sha, 'canonical_commit_sha', { min: 40, max: 40 })
  if (!/^[0-9a-f]{40}$/u.test(commitSha)) throw new InputError('canonical_commit_sha must be a full Git SHA', 'canonical_commit_sha')
  const current = nowIso(env)
  const linkId = `admission-link-${randomToken(18)}`
  const operationTarget = (await sha256Hex(exportId)).slice(0, 32)
  const response = { status: 201, body: { admission_link_id: linkId, export_id: exportId } }
  return idempotentAdminMutation({
    request,
    env,
    actor: operator,
    body: rawBody,
    operation: `admin-admission-link:${operationTarget}`,
    response,
    statements: [
      env.PROPOSALS_DB.prepare(
        `INSERT INTO admission_links (
          admission_link_id, export_id, canonical_admission_id, canonical_entry_id,
          canonical_commit_sha, linked_by_account_id, source_timestamp, recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(linkId, exportId, admissionId, entryId, commitSha, operator.account_id, current, current),
    ],
  })
}

export async function githubIdentityDigest(env, githubNumericId) {
  return hmacHex(requiredSecret(env, 'IDENTITY_HMAC_SECRET'), String(githubNumericId))
}
