PRAGMA defer_foreign_keys = TRUE;

-- Views are removed dependency-first so every schema object remains parseable while the legacy
-- tables are replaced. The whole migration must execute as one D1 batch transaction.
DROP VIEW IF EXISTS public_schema_violations;
DROP VIEW IF EXISTS public_proposal_summaries;
DROP VIEW IF EXISTS current_account_locks;
DROP VIEW IF EXISTS current_principal_locks;
DROP VIEW IF EXISTS current_account_roles;
DROP VIEW IF EXISTS current_principal_roles;
DROP VIEW IF EXISTS public_contributor_profiles;
DROP VIEW IF EXISTS proposal_cache_drift;
DROP VIEW IF EXISTS proposal_revision_detail_counts;
DROP VIEW IF EXISTS current_listing_moderation;

DROP TRIGGER IF EXISTS public_accounts_create_principal;
DROP TRIGGER IF EXISTS principal_identity_link_events_require_contiguous;
DROP TRIGGER IF EXISTS principal_identity_link_events_require_initial_verified;
DROP TRIGGER IF EXISTS principal_identity_link_events_require_stable_pair;
DROP TRIGGER IF EXISTS principal_identity_link_events_require_alternation;
DROP TRIGGER IF EXISTS principal_identity_link_events_one_active_github;
DROP TRIGGER IF EXISTS principal_identity_link_events_no_update;
DROP TRIGGER IF EXISTS principal_identity_link_events_no_delete;
DROP TRIGGER IF EXISTS principal_session_events_require_contiguous;
DROP TRIGGER IF EXISTS principal_session_events_require_initial_issued;
DROP TRIGGER IF EXISTS principal_session_events_require_open_session;
DROP TRIGGER IF EXISTS principal_session_events_require_principal;
DROP TRIGGER IF EXISTS principal_session_events_no_update;
DROP TRIGGER IF EXISTS principal_session_events_no_delete;

DROP TRIGGER IF EXISTS proposals_identity_immutable;
DROP TRIGGER IF EXISTS proposals_no_delete;
DROP TRIGGER IF EXISTS proposal_revisions_require_submitted;
DROP TRIGGER IF EXISTS proposal_revisions_require_contiguous;
DROP TRIGGER IF EXISTS proposal_revisions_require_author;
DROP TRIGGER IF EXISTS proposal_revisions_update_cache;
DROP TRIGGER IF EXISTS proposal_state_events_require_contiguous;
DROP TRIGGER IF EXISTS proposal_state_events_require_initial_submitted;
DROP TRIGGER IF EXISTS proposal_state_events_require_current_from_state;
DROP TRIGGER IF EXISTS proposal_state_events_require_allowed_transition;
DROP TRIGGER IF EXISTS proposal_state_events_update_cache;
DROP TRIGGER IF EXISTS appeal_state_events_require_contiguous;
DROP TRIGGER IF EXISTS appeal_state_events_require_initial_submitted;
DROP TRIGGER IF EXISTS appeal_state_events_require_current_from_state;
DROP TRIGGER IF EXISTS appeal_state_events_require_allowed_transition;

DROP TRIGGER IF EXISTS theoretical_model_details_kind;
DROP TRIGGER IF EXISTS physical_material_details_kind;
DROP TRIGGER IF EXISTS physical_mechanism_details_kind;
DROP TRIGGER IF EXISTS observation_interface_details_kind;
DROP TRIGGER IF EXISTS existing_member_assessment_details_kind;
DROP TRIGGER IF EXISTS existing_member_correction_details_kind;
DROP TRIGGER IF EXISTS ontology_change_details_kind;

DROP TRIGGER IF EXISTS theoretical_model_details_no_update;
DROP TRIGGER IF EXISTS theoretical_model_details_no_delete;
DROP TRIGGER IF EXISTS physical_material_details_no_update;
DROP TRIGGER IF EXISTS physical_material_details_no_delete;
DROP TRIGGER IF EXISTS physical_mechanism_details_no_update;
DROP TRIGGER IF EXISTS physical_mechanism_details_no_delete;
DROP TRIGGER IF EXISTS observation_interface_details_no_update;
DROP TRIGGER IF EXISTS observation_interface_details_no_delete;
DROP TRIGGER IF EXISTS existing_member_assessment_details_no_update;
DROP TRIGGER IF EXISTS existing_member_assessment_details_no_delete;
DROP TRIGGER IF EXISTS existing_member_correction_details_no_update;
DROP TRIGGER IF EXISTS existing_member_correction_details_no_delete;
DROP TRIGGER IF EXISTS ontology_change_details_no_update;
DROP TRIGGER IF EXISTS ontology_change_details_no_delete;
DROP TRIGGER IF EXISTS proposal_references_no_update;
DROP TRIGGER IF EXISTS proposal_references_no_delete;
DROP TRIGGER IF EXISTS criticism_references_no_update;
DROP TRIGGER IF EXISTS criticism_references_no_delete;
DROP TRIGGER IF EXISTS test_report_references_no_update;
DROP TRIGGER IF EXISTS test_report_references_no_delete;

DROP TRIGGER IF EXISTS proposal_revisions_no_update;
DROP TRIGGER IF EXISTS proposal_revisions_no_delete;
DROP TRIGGER IF EXISTS proposal_state_events_no_update;
DROP TRIGGER IF EXISTS proposal_state_events_no_delete;
DROP TRIGGER IF EXISTS proposal_evidence_no_update;
DROP TRIGGER IF EXISTS proposal_evidence_no_delete;
DROP TRIGGER IF EXISTS criticisms_no_update;
DROP TRIGGER IF EXISTS criticisms_no_delete;
DROP TRIGGER IF EXISTS criticism_replies_no_update;
DROP TRIGGER IF EXISTS criticism_replies_no_delete;
DROP TRIGGER IF EXISTS scoped_test_reports_no_update;
DROP TRIGGER IF EXISTS scoped_test_reports_no_delete;
DROP TRIGGER IF EXISTS competing_interpretations_no_update;
DROP TRIGGER IF EXISTS competing_interpretations_no_delete;
DROP TRIGGER IF EXISTS moderation_actions_no_update;
DROP TRIGGER IF EXISTS moderation_actions_no_delete;
DROP TRIGGER IF EXISTS appeals_no_update;
DROP TRIGGER IF EXISTS appeals_no_delete;
DROP TRIGGER IF EXISTS appeal_state_events_no_update;
DROP TRIGGER IF EXISTS appeal_state_events_no_delete;
DROP TRIGGER IF EXISTS maintainer_exports_no_update;
DROP TRIGGER IF EXISTS maintainer_exports_no_delete;
DROP TRIGGER IF EXISTS admission_links_no_update;
DROP TRIGGER IF EXISTS admission_links_no_delete;

DROP TRIGGER IF EXISTS account_role_events_bootstrap_once;
DROP TRIGGER IF EXISTS account_role_events_require_operator_actor;
DROP TRIGGER IF EXISTS account_role_events_no_duplicate_grant;
DROP TRIGGER IF EXISTS account_role_events_no_inactive_revoke;
DROP TRIGGER IF EXISTS account_role_events_keep_operator;
DROP TRIGGER IF EXISTS account_role_events_no_update;
DROP TRIGGER IF EXISTS account_role_events_no_delete;

CREATE TABLE _v3_public_accounts (
  account_id TEXT PRIMARY KEY,
  github_identity_hmac_sha256 TEXT NOT NULL UNIQUE CHECK (length(github_identity_hmac_sha256) = 64),
  github_login TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(github_login) BETWEEN 1 AND 39),
  github_profile_url TEXT NOT NULL CHECK (github_profile_url LIKE 'https://github.com/%'),
  github_avatar_url TEXT CHECK (github_avatar_url IS NULL OR github_avatar_url LIKE 'https://%'),
  created_at TEXT NOT NULL,
  last_authenticated_at TEXT NOT NULL,
  principal_kind TEXT NOT NULL DEFAULT 'github' CHECK (principal_kind = 'github'),
  UNIQUE (account_id, principal_kind),
  FOREIGN KEY (account_id, principal_kind)
    REFERENCES contributor_principals(principal_id, principal_kind)
) STRICT;

INSERT INTO _v3_public_accounts (
  account_id, github_identity_hmac_sha256, github_login, github_profile_url,
  github_avatar_url, created_at, last_authenticated_at, principal_kind
)
SELECT
  account_id, github_identity_hmac_sha256, github_login, github_profile_url,
  github_avatar_url, created_at, last_authenticated_at, 'github'
FROM public_accounts;

CREATE TABLE _v3_public_sessions (
  session_token_sha256 TEXT PRIMARY KEY CHECK (length(session_token_sha256) = 64),
  csrf_token_sha256 TEXT CHECK (csrf_token_sha256 IS NULL OR length(csrf_token_sha256) = 64),
  account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_to_sha256 TEXT REFERENCES _v3_public_sessions(session_token_sha256),
  auth_kind TEXT NOT NULL DEFAULT 'github' CHECK (auth_kind IN ('github', 'siwx')),
  transport TEXT NOT NULL DEFAULT 'browser-cookie' CHECK (
    transport IN ('browser-cookie', 'agent-bearer')
  ),
  scope TEXT NOT NULL DEFAULT 'public-contributor' CHECK (length(scope) BETWEEN 1 AND 400),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (rotated_to_sha256 IS NULL OR revoked_at IS NOT NULL),
  CHECK (
    (transport = 'browser-cookie' AND csrf_token_sha256 IS NOT NULL)
    OR (transport = 'agent-bearer' AND csrf_token_sha256 IS NULL)
  )
) STRICT;

INSERT INTO _v3_public_sessions (
  session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
  revoked_at, rotated_to_sha256, auth_kind, transport, scope
)
SELECT
  session_token_sha256, csrf_token_sha256, account_id, created_at, expires_at,
  revoked_at, rotated_to_sha256, 'github', 'browser-cookie', 'public-contributor'
FROM public_sessions;

CREATE TABLE _v3_proposals (
  proposal_id TEXT PRIMARY KEY,
  proposal_kind TEXT NOT NULL CHECK (proposal_kind IN (
    'theoretical-model-member',
    'physical-material-member',
    'physical-calculation-mechanism-member',
    'observation-interface-member',
    'existing-member-assessment',
    'existing-member-correction',
    'ontology-change'
  )),
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  parent_proposal_id TEXT,
  parent_revision INTEGER,
  created_at TEXT NOT NULL,
  current_revision INTEGER,
  current_state_event_sequence INTEGER,
  current_admin_state TEXT CHECK (current_admin_state IS NULL OR current_admin_state IN (
    'submitted', 'triaged', 'under-review', 'selected-for-export',
    'declined', 'withdrawn', 'superseded', 'admitted-link-recorded'
  )),
  CHECK ((parent_proposal_id IS NULL) = (parent_revision IS NULL)),
  CHECK ((current_state_event_sequence IS NULL) = (current_admin_state IS NULL)),
  FOREIGN KEY (parent_proposal_id, parent_revision)
    REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE _v3_proposal_revisions (
  proposal_id TEXT NOT NULL REFERENCES _v3_proposals(proposal_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  revision_id TEXT NOT NULL UNIQUE,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, revision),
  UNIQUE (proposal_id, revision, revision_id)
) STRICT;

INSERT INTO _v3_proposals (
  proposal_id, proposal_kind, author_account_id, parent_proposal_id, parent_revision,
  created_at, current_revision, current_state_event_sequence, current_admin_state
)
SELECT
  proposal_id, proposal_kind, author_account_id, parent_proposal_id, parent_revision,
  created_at, current_revision, current_state_event_sequence, current_admin_state
FROM proposals;

INSERT INTO _v3_proposal_revisions (
  proposal_id, revision, revision_id, author_account_id, title, summary,
  rationale, scope, content_sha256, source_timestamp, recorded_at
)
SELECT
  proposal_id, revision, revision_id, author_account_id, title, summary,
  rationale, scope, content_sha256, source_timestamp, recorded_at
FROM proposal_revisions;

CREATE TABLE _v3_proposal_evidence (
  evidence_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'empirical-result', 'simulation-result', 'argument', 'criticism-response', 'other-explicit'
  )),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  FOREIGN KEY (proposal_id, revision) REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_proposal_evidence (
  evidence_id, proposal_id, revision, evidence_kind, summary,
  source_timestamp, recorded_at, author_account_id
)
SELECT
  evidence_id, proposal_id, revision, evidence_kind, summary,
  source_timestamp, recorded_at, author_account_id
FROM proposal_evidence;

CREATE TABLE _v3_criticisms (
  criticism_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  criticism TEXT NOT NULL CHECK (length(criticism) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (criticism_id, proposal_id, target_revision),
  FOREIGN KEY (proposal_id, target_revision) REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_criticisms (
  criticism_id, proposal_id, target_revision, author_account_id, title,
  criticism, scope, source_timestamp, recorded_at
)
SELECT
  criticism_id, proposal_id, target_revision, author_account_id, title,
  criticism, scope, source_timestamp, recorded_at
FROM criticisms;

CREATE TABLE _v3_criticism_replies (
  reply_id TEXT PRIMARY KEY,
  criticism_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  reply TEXT NOT NULL CHECK (length(reply) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (criticism_id, proposal_id, target_revision)
    REFERENCES _v3_criticisms(criticism_id, proposal_id, target_revision)
) STRICT;

INSERT INTO _v3_criticism_replies (
  reply_id, criticism_id, proposal_id, target_revision, author_account_id,
  reply, source_timestamp, recorded_at
)
SELECT
  reply_id, criticism_id, proposal_id, target_revision, author_account_id,
  reply, source_timestamp, recorded_at
FROM criticism_replies;

CREATE TABLE _v3_scoped_test_reports (
  test_report_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  test_name TEXT NOT NULL CHECK (length(test_name) BETWEEN 1 AND 200),
  protocol TEXT NOT NULL CHECK (length(protocol) BETWEEN 1 AND 12000),
  result TEXT NOT NULL CHECK (length(result) BETWEEN 1 AND 12000),
  interpretation TEXT NOT NULL CHECK (length(interpretation) BETWEEN 1 AND 12000),
  test_relation TEXT NOT NULL CHECK (
    test_relation IN ('survives-test', 'falsifies', 'criticizes', 'inconclusive', 'mixed')
  ),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, target_revision) REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_scoped_test_reports (
  test_report_id, proposal_id, target_revision, author_account_id, test_name,
  protocol, result, interpretation, test_relation, source_timestamp, recorded_at
)
SELECT
  test_report_id, proposal_id, target_revision, author_account_id, test_name,
  protocol, result, interpretation, test_relation, source_timestamp, recorded_at
FROM scoped_test_reports;

CREATE TABLE _v3_competing_interpretations (
  interpretation_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  interpretation TEXT NOT NULL CHECK (length(interpretation) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, target_revision) REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_competing_interpretations (
  interpretation_id, proposal_id, target_revision, author_account_id,
  title, interpretation, scope, source_timestamp, recorded_at
)
SELECT
  interpretation_id, proposal_id, target_revision, author_account_id,
  title, interpretation, scope, source_timestamp, recorded_at
FROM competing_interpretations;

CREATE TABLE _v3_proposal_state_events (
  proposal_id TEXT NOT NULL REFERENCES _v3_proposals(proposal_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  state_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'submitted', 'triaged', 'under-review', 'selected-for-export',
    'declined', 'withdrawn', 'superseded', 'admitted-link-recorded'
  )),
  selected_revision INTEGER,
  actor_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, event_sequence),
  UNIQUE (proposal_id, event_sequence, selected_revision),
  CHECK ((to_state = 'selected-for-export') = (selected_revision IS NOT NULL)),
  FOREIGN KEY (proposal_id, selected_revision)
    REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_proposal_state_events (
  proposal_id, event_sequence, state_event_id, from_state, to_state,
  selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
)
SELECT
  proposal_id, event_sequence, state_event_id, from_state, to_state,
  selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
FROM proposal_state_events;

CREATE TABLE _v3_moderation_actions (
  action_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  moderation_action_id TEXT NOT NULL UNIQUE,
  moderator_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  action_kind TEXT NOT NULL CHECK (action_kind IN (
    'label', 'hide-from-listing', 'restore-to-listing',
    'lock-contributor', 'unlock-contributor'
  )),
  target_kind TEXT NOT NULL CHECK (target_kind IN (
    'proposal-revision', 'criticism', 'reply', 'test-report',
    'interpretation', 'account'
  )),
  target_proposal_id TEXT,
  target_revision INTEGER,
  target_criticism_id TEXT REFERENCES _v3_criticisms(criticism_id),
  target_reply_id TEXT REFERENCES _v3_criticism_replies(reply_id),
  target_test_report_id TEXT REFERENCES _v3_scoped_test_reports(test_report_id),
  target_interpretation_id TEXT REFERENCES _v3_competing_interpretations(interpretation_id),
  target_account_id TEXT REFERENCES contributor_principals(principal_id),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 80),
  explanation TEXT NOT NULL CHECK (length(explanation) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (
    (target_kind = 'proposal-revision' AND target_proposal_id IS NOT NULL AND target_revision IS NOT NULL
      AND target_criticism_id IS NULL AND target_reply_id IS NULL AND target_test_report_id IS NULL
      AND target_interpretation_id IS NULL AND target_account_id IS NULL)
    OR
    (target_kind = 'criticism' AND target_proposal_id IS NULL AND target_revision IS NULL
      AND target_criticism_id IS NOT NULL AND target_reply_id IS NULL AND target_test_report_id IS NULL
      AND target_interpretation_id IS NULL AND target_account_id IS NULL)
    OR
    (target_kind = 'reply' AND target_proposal_id IS NULL AND target_revision IS NULL
      AND target_criticism_id IS NULL AND target_reply_id IS NOT NULL AND target_test_report_id IS NULL
      AND target_interpretation_id IS NULL AND target_account_id IS NULL)
    OR
    (target_kind = 'test-report' AND target_proposal_id IS NULL AND target_revision IS NULL
      AND target_criticism_id IS NULL AND target_reply_id IS NULL AND target_test_report_id IS NOT NULL
      AND target_interpretation_id IS NULL AND target_account_id IS NULL)
    OR
    (target_kind = 'interpretation' AND target_proposal_id IS NULL AND target_revision IS NULL
      AND target_criticism_id IS NULL AND target_reply_id IS NULL AND target_test_report_id IS NULL
      AND target_interpretation_id IS NOT NULL AND target_account_id IS NULL)
    OR
    (target_kind = 'account' AND target_proposal_id IS NULL AND target_revision IS NULL
      AND target_criticism_id IS NULL AND target_reply_id IS NULL AND target_test_report_id IS NULL
      AND target_interpretation_id IS NULL AND target_account_id IS NOT NULL)
  ),
  CHECK (
    action_kind = 'label'
    OR (action_kind IN ('hide-from-listing', 'restore-to-listing') AND target_kind != 'account')
    OR (action_kind IN ('lock-contributor', 'unlock-contributor') AND target_kind = 'account')
  ),
  FOREIGN KEY (target_proposal_id, target_revision)
    REFERENCES _v3_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT INTO _v3_moderation_actions (
  action_sequence, moderation_action_id, moderator_account_id, action_kind, target_kind,
  target_proposal_id, target_revision, target_criticism_id, target_reply_id,
  target_test_report_id, target_interpretation_id, target_account_id,
  reason_code, explanation, source_timestamp, recorded_at
)
SELECT
  action_sequence, moderation_action_id, moderator_account_id, action_kind, target_kind,
  target_proposal_id, target_revision, target_criticism_id, target_reply_id,
  target_test_report_id, target_interpretation_id, target_account_id,
  reason_code, explanation, source_timestamp, recorded_at
FROM moderation_actions;

CREATE TABLE _v3_appeals (
  appeal_id TEXT PRIMARY KEY,
  moderation_action_id TEXT NOT NULL REFERENCES _v3_moderation_actions(moderation_action_id),
  appellant_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  appeal TEXT NOT NULL CHECK (length(appeal) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;

INSERT INTO _v3_appeals (
  appeal_id, moderation_action_id, appellant_account_id, appeal, source_timestamp, recorded_at
)
SELECT
  appeal_id, moderation_action_id, appellant_account_id, appeal, source_timestamp, recorded_at
FROM appeals;

CREATE TABLE _v3_appeal_state_events (
  appeal_id TEXT NOT NULL REFERENCES _v3_appeals(appeal_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  appeal_state_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'submitted', 'under-review', 'upheld', 'granted', 'withdrawn'
  )),
  actor_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (appeal_id, event_sequence)
) STRICT;

INSERT INTO _v3_appeal_state_events (
  appeal_id, event_sequence, appeal_state_event_id, from_state, to_state,
  actor_account_id, rationale, source_timestamp, recorded_at
)
SELECT
  appeal_id, event_sequence, appeal_state_event_id, from_state, to_state,
  actor_account_id, rationale, source_timestamp, recorded_at
FROM appeal_state_events;

CREATE TABLE _v3_write_idempotency_keys (
  account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 80),
  key_sha256 TEXT NOT NULL CHECK (length(key_sha256) = 64),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
  response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 599),
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (account_id, operation, key_sha256),
  CHECK (expires_at > created_at),
  CHECK (json_valid(response_json))
) STRICT;

INSERT INTO _v3_write_idempotency_keys (
  account_id, operation, key_sha256, request_sha256, response_status,
  response_json, created_at, expires_at
)
SELECT
  account_id, operation, key_sha256, request_sha256, response_status,
  response_json, created_at, expires_at
FROM write_idempotency_keys;

CREATE TABLE _v3_quota_events (
  quota_event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  ip_hmac_sha256 TEXT NOT NULL CHECK (length(ip_hmac_sha256) = 64),
  mutation_kind TEXT NOT NULL CHECK (mutation_kind IN (
    'proposal', 'revision', 'criticism', 'reply', 'test-report',
    'interpretation', 'appeal', 'withdrawal', 'x402-proposal',
    'wallet-session', 'identity-link', 'identity-revoke'
  )),
  recorded_at TEXT NOT NULL
) STRICT;

INSERT INTO _v3_quota_events (
  quota_event_id, account_id, ip_hmac_sha256, mutation_kind, recorded_at
)
SELECT quota_event_id, account_id, ip_hmac_sha256, mutation_kind, recorded_at
FROM quota_events;

CREATE TABLE _v3_maintainer_exports (
  export_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  selected_revision INTEGER NOT NULL,
  selected_state_event_sequence INTEGER NOT NULL,
  export_scope TEXT NOT NULL CHECK (length(export_scope) BETWEEN 1 AND 4000),
  criticisms_non_exhaustive INTEGER NOT NULL DEFAULT 1 CHECK (criticisms_non_exhaustive = 1),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  content_sha256 TEXT NOT NULL UNIQUE CHECK (length(content_sha256) = 64),
  created_by_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, selected_revision)
    REFERENCES _v3_proposal_revisions(proposal_id, revision),
  FOREIGN KEY (proposal_id, selected_state_event_sequence, selected_revision)
    REFERENCES _v3_proposal_state_events(proposal_id, event_sequence, selected_revision)
) STRICT;

INSERT INTO _v3_maintainer_exports (
  export_id, proposal_id, selected_revision, selected_state_event_sequence,
  export_scope, criticisms_non_exhaustive, canonical_json, content_sha256,
  created_by_account_id, recorded_at
)
SELECT
  export_id, proposal_id, selected_revision, selected_state_event_sequence,
  export_scope, criticisms_non_exhaustive, canonical_json, content_sha256,
  created_by_account_id, recorded_at
FROM maintainer_exports;

CREATE TABLE _v3_admission_links (
  admission_link_id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL REFERENCES _v3_maintainer_exports(export_id),
  canonical_admission_id TEXT NOT NULL,
  canonical_entry_id TEXT NOT NULL,
  canonical_commit_sha TEXT NOT NULL CHECK (length(canonical_commit_sha) = 40),
  linked_by_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (export_id, canonical_admission_id, canonical_entry_id)
) STRICT;

INSERT INTO _v3_admission_links (
  admission_link_id, export_id, canonical_admission_id, canonical_entry_id,
  canonical_commit_sha, linked_by_account_id, source_timestamp, recorded_at
)
SELECT
  admission_link_id, export_id, canonical_admission_id, canonical_entry_id,
  canonical_commit_sha, linked_by_account_id, source_timestamp, recorded_at
FROM admission_links;

CREATE TABLE _v3_account_role_events (
  role_event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  role_event_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  role TEXT NOT NULL CHECK (role = 'operator'),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('granted', 'revoked')),
  actor_account_id TEXT REFERENCES contributor_principals(principal_id),
  authority_kind TEXT NOT NULL CHECK (authority_kind IN ('operator', 'deployment-bootstrap')),
  authority_ref TEXT NOT NULL CHECK (length(authority_ref) BETWEEN 1 AND 400),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (
    (authority_kind = 'deployment-bootstrap' AND actor_account_id IS NULL AND action_kind = 'granted')
    OR
    (authority_kind = 'operator' AND actor_account_id IS NOT NULL)
  )
) STRICT;

INSERT INTO _v3_account_role_events (
  role_event_sequence, role_event_id, account_id, role, action_kind, actor_account_id,
  authority_kind, authority_ref, rationale, source_timestamp, recorded_at
)
SELECT
  role_event_sequence, role_event_id, account_id, role, action_kind, actor_account_id,
  authority_kind, authority_ref, rationale, source_timestamp, recorded_at
FROM account_role_events;

-- Untouched child tables must not retain live references while their populated parents are
-- dropped. Holding copies are transaction-local in effect (ordinary tables that are removed
-- before commit) so the operation remains compatible with D1's SQL surface.
CREATE TABLE _hold_theoretical_model_details AS SELECT * FROM theoretical_model_details;
CREATE TABLE _hold_physical_material_details AS SELECT * FROM physical_material_details;
CREATE TABLE _hold_physical_mechanism_details AS SELECT * FROM physical_mechanism_details;
CREATE TABLE _hold_observation_interface_details AS SELECT * FROM observation_interface_details;
CREATE TABLE _hold_existing_member_assessment_details AS SELECT * FROM existing_member_assessment_details;
CREATE TABLE _hold_existing_member_correction_details AS SELECT * FROM existing_member_correction_details;
CREATE TABLE _hold_ontology_change_details AS SELECT * FROM ontology_change_details;
CREATE TABLE _hold_proposal_references AS SELECT * FROM proposal_references;
CREATE TABLE _hold_criticism_references AS SELECT * FROM criticism_references;
CREATE TABLE _hold_test_report_references AS SELECT * FROM test_report_references;
CREATE TABLE _hold_principal_identity_link_events AS SELECT * FROM principal_identity_link_events;
CREATE TABLE _hold_principal_session_events AS SELECT * FROM principal_session_events;

DELETE FROM proposal_references;
DELETE FROM criticism_references;
DELETE FROM test_report_references;
DELETE FROM theoretical_model_details;
DELETE FROM physical_material_details;
DELETE FROM physical_mechanism_details;
DELETE FROM observation_interface_details;
DELETE FROM existing_member_assessment_details;
DELETE FROM existing_member_correction_details;
DELETE FROM ontology_change_details;
DELETE FROM principal_identity_link_events;
DELETE FROM principal_session_events;

-- Empty each rebuilt source child-first before DROP. Parent proposal links are nulled only in the
-- disposable legacy copy after their original values have been captured in _v3_proposals.
DELETE FROM admission_links;
DELETE FROM maintainer_exports;
DELETE FROM appeal_state_events;
DELETE FROM appeals;
DELETE FROM moderation_actions;
DELETE FROM criticism_replies;
DELETE FROM criticisms;
DELETE FROM scoped_test_reports;
DELETE FROM competing_interpretations;
DELETE FROM proposal_evidence;
DELETE FROM proposal_state_events;
UPDATE proposals SET parent_proposal_id = NULL, parent_revision = NULL
WHERE parent_proposal_id IS NOT NULL;
DELETE FROM proposal_revisions;
DELETE FROM proposals;
DELETE FROM public_sessions;
DELETE FROM write_idempotency_keys;
DELETE FROM quota_events;
DELETE FROM account_role_events;
DELETE FROM public_accounts;

-- Drop original tables child-first. Names are never changed before the replacement exists, because
-- renaming a legacy parent would rewrite foreign-key targets in untouched child tables.
DROP TABLE admission_links;
DROP TABLE maintainer_exports;
DROP TABLE appeal_state_events;
DROP TABLE appeals;
DROP TABLE moderation_actions;
DROP TABLE criticism_replies;
DROP TABLE criticisms;
DROP TABLE scoped_test_reports;
DROP TABLE competing_interpretations;
DROP TABLE proposal_evidence;
DROP TABLE proposal_state_events;
DROP TABLE proposal_revisions;
DROP TABLE proposals;
DROP TABLE public_sessions;
DROP TABLE write_idempotency_keys;
DROP TABLE quota_events;
DROP TABLE account_role_events;
DROP TABLE public_accounts;

-- Restore final names parent-first. The session rotation FK is the only self-reference and points
-- at its shadow name so SQLite rewrites it during this rename.
ALTER TABLE _v3_public_accounts RENAME TO public_accounts;
ALTER TABLE _v3_proposals RENAME TO proposals;
ALTER TABLE _v3_proposal_revisions RENAME TO proposal_revisions;
ALTER TABLE _v3_proposal_evidence RENAME TO proposal_evidence;
ALTER TABLE _v3_criticisms RENAME TO criticisms;
ALTER TABLE _v3_criticism_replies RENAME TO criticism_replies;
ALTER TABLE _v3_scoped_test_reports RENAME TO scoped_test_reports;
ALTER TABLE _v3_competing_interpretations RENAME TO competing_interpretations;
ALTER TABLE _v3_proposal_state_events RENAME TO proposal_state_events;
ALTER TABLE _v3_moderation_actions RENAME TO moderation_actions;
ALTER TABLE _v3_appeals RENAME TO appeals;
ALTER TABLE _v3_appeal_state_events RENAME TO appeal_state_events;
ALTER TABLE _v3_maintainer_exports RENAME TO maintainer_exports;
ALTER TABLE _v3_admission_links RENAME TO admission_links;
ALTER TABLE _v3_public_sessions RENAME TO public_sessions;
ALTER TABLE _v3_write_idempotency_keys RENAME TO write_idempotency_keys;
ALTER TABLE _v3_quota_events RENAME TO quota_events;
ALTER TABLE _v3_account_role_events RENAME TO account_role_events;

INSERT INTO theoretical_model_details SELECT * FROM _hold_theoretical_model_details;
INSERT INTO physical_material_details SELECT * FROM _hold_physical_material_details;
INSERT INTO physical_mechanism_details SELECT * FROM _hold_physical_mechanism_details;
INSERT INTO observation_interface_details SELECT * FROM _hold_observation_interface_details;
INSERT INTO existing_member_assessment_details SELECT * FROM _hold_existing_member_assessment_details;
INSERT INTO existing_member_correction_details SELECT * FROM _hold_existing_member_correction_details;
INSERT INTO ontology_change_details SELECT * FROM _hold_ontology_change_details;
INSERT INTO proposal_references SELECT * FROM _hold_proposal_references;
INSERT INTO criticism_references SELECT * FROM _hold_criticism_references;
INSERT INTO test_report_references SELECT * FROM _hold_test_report_references;
INSERT INTO principal_identity_link_events SELECT * FROM _hold_principal_identity_link_events;
INSERT INTO principal_session_events SELECT * FROM _hold_principal_session_events;

DROP TABLE _hold_theoretical_model_details;
DROP TABLE _hold_physical_material_details;
DROP TABLE _hold_physical_mechanism_details;
DROP TABLE _hold_observation_interface_details;
DROP TABLE _hold_existing_member_assessment_details;
DROP TABLE _hold_existing_member_correction_details;
DROP TABLE _hold_ontology_change_details;
DROP TABLE _hold_proposal_references;
DROP TABLE _hold_criticism_references;
DROP TABLE _hold_test_report_references;
DROP TABLE _hold_principal_identity_link_events;
DROP TABLE _hold_principal_session_events;

CREATE INDEX account_role_events_account_role_sequence
ON account_role_events(account_id, role, role_event_sequence);

CREATE VIEW proposal_revision_detail_counts AS
SELECT
  r.proposal_id,
  r.revision,
  p.proposal_kind,
  EXISTS(SELECT 1 FROM theoretical_model_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM physical_material_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM physical_mechanism_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM observation_interface_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM existing_member_assessment_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM existing_member_correction_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    + EXISTS(SELECT 1 FROM ontology_change_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    AS detail_count,
  CASE p.proposal_kind
    WHEN 'theoretical-model-member' THEN EXISTS(SELECT 1 FROM theoretical_model_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'physical-material-member' THEN EXISTS(SELECT 1 FROM physical_material_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'physical-calculation-mechanism-member' THEN EXISTS(SELECT 1 FROM physical_mechanism_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'observation-interface-member' THEN EXISTS(SELECT 1 FROM observation_interface_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'existing-member-assessment' THEN EXISTS(SELECT 1 FROM existing_member_assessment_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'existing-member-correction' THEN EXISTS(SELECT 1 FROM existing_member_correction_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    WHEN 'ontology-change' THEN EXISTS(SELECT 1 FROM ontology_change_details d WHERE d.proposal_id = r.proposal_id AND d.revision = r.revision)
    ELSE 0
  END AS matching_detail_count
FROM proposal_revisions r
JOIN proposals p USING (proposal_id);

CREATE VIEW proposal_cache_drift AS
SELECT p.proposal_id, 'current-revision' AS drift_kind
FROM proposals p
WHERE p.current_revision IS NOT (
  SELECT MAX(r.revision) FROM proposal_revisions r WHERE r.proposal_id = p.proposal_id
)
UNION ALL
SELECT p.proposal_id, 'current-state-sequence'
FROM proposals p
WHERE p.current_state_event_sequence IS NOT (
  SELECT MAX(e.event_sequence) FROM proposal_state_events e WHERE e.proposal_id = p.proposal_id
)
UNION ALL
SELECT p.proposal_id, 'current-state-value'
FROM proposals p
WHERE p.current_admin_state IS NOT (
  SELECT e.to_state FROM proposal_state_events e
  WHERE e.proposal_id = p.proposal_id ORDER BY e.event_sequence DESC LIMIT 1
);

CREATE VIEW current_listing_moderation AS
SELECT
  m.action_sequence,
  m.moderation_action_id,
  m.action_kind,
  CASE m.action_kind WHEN 'hide-from-listing' THEN 'hidden' ELSE 'listed' END AS listing_visibility,
  m.target_kind,
  m.target_proposal_id,
  m.target_revision,
  m.target_criticism_id,
  m.target_reply_id,
  m.target_test_report_id,
  m.target_interpretation_id,
  m.reason_code,
  m.explanation,
  m.source_timestamp,
  m.recorded_at
FROM moderation_actions m
WHERE m.action_kind IN ('hide-from-listing', 'restore-to-listing')
  AND NOT EXISTS (
    SELECT 1
    FROM moderation_actions newer
    WHERE newer.action_sequence > m.action_sequence
      AND newer.action_kind IN ('hide-from-listing', 'restore-to-listing')
      AND newer.target_kind = m.target_kind
      AND newer.target_proposal_id IS m.target_proposal_id
      AND newer.target_revision IS m.target_revision
      AND newer.target_criticism_id IS m.target_criticism_id
      AND newer.target_reply_id IS m.target_reply_id
      AND newer.target_test_report_id IS m.target_test_report_id
      AND newer.target_interpretation_id IS m.target_interpretation_id
  );

CREATE VIEW current_principal_locks AS
SELECT
  m.action_sequence,
  m.moderation_action_id,
  m.target_account_id AS target_principal_id,
  m.action_kind,
  CASE m.action_kind WHEN 'lock-contributor' THEN 1 ELSE 0 END AS is_locked,
  m.reason_code,
  m.explanation,
  m.source_timestamp,
  m.recorded_at
FROM moderation_actions m
WHERE m.action_kind IN ('lock-contributor', 'unlock-contributor')
  AND NOT EXISTS (
    SELECT 1
    FROM moderation_actions newer
    WHERE newer.action_sequence > m.action_sequence
      AND newer.action_kind IN ('lock-contributor', 'unlock-contributor')
      AND newer.target_account_id = m.target_account_id
  );

CREATE VIEW current_account_locks AS
SELECT
  action_sequence,
  moderation_action_id,
  target_principal_id AS target_account_id,
  action_kind,
  is_locked,
  reason_code,
  explanation,
  source_timestamp,
  recorded_at
FROM current_principal_locks;

CREATE VIEW current_principal_roles AS
SELECT
  event.role_event_sequence,
  event.role_event_id,
  event.account_id AS principal_id,
  event.role,
  event.actor_account_id AS actor_principal_id,
  event.authority_kind,
  event.authority_ref,
  event.rationale,
  event.source_timestamp,
  event.recorded_at
FROM account_role_events event
WHERE event.action_kind = 'granted'
  AND NOT EXISTS (
    SELECT 1
    FROM account_role_events newer
    WHERE newer.account_id = event.account_id
      AND newer.role = event.role
      AND newer.role_event_sequence > event.role_event_sequence
  );

CREATE VIEW current_account_roles AS
SELECT
  role_event_sequence,
  role_event_id,
  principal_id AS account_id,
  role,
  actor_principal_id AS actor_account_id,
  authority_kind,
  authority_ref,
  rationale,
  source_timestamp,
  recorded_at
FROM current_principal_roles;

CREATE VIEW public_contributor_profiles AS
SELECT
  principal.principal_id,
  principal.principal_kind,
  principal.public_pseudonym,
  account.github_login,
  account.github_profile_url,
  account.github_avatar_url,
  principal.created_at
FROM contributor_principals principal
LEFT JOIN public_accounts account
  ON account.account_id = principal.principal_id
 AND account.principal_kind = principal.principal_kind;

CREATE VIEW public_proposal_summaries AS
SELECT
  p.proposal_id,
  p.proposal_kind,
  p.created_at,
  p.current_revision,
  p.current_admin_state,
  p.current_state_event_sequence,
  r.title,
  r.summary,
  profile.github_login,
  profile.github_profile_url,
  profile.github_avatar_url,
  profile.principal_kind,
  profile.public_pseudonym,
  p.parent_proposal_id,
  p.parent_revision
FROM proposals p
JOIN proposal_revisions r
  ON r.proposal_id = p.proposal_id AND r.revision = p.current_revision
JOIN public_contributor_profiles profile ON profile.principal_id = p.author_account_id
WHERE NOT EXISTS (
  SELECT 1
  FROM current_listing_moderation visibility
  WHERE visibility.target_kind = 'proposal-revision'
    AND visibility.target_proposal_id = p.proposal_id
    AND visibility.target_revision = p.current_revision
    AND visibility.listing_visibility = 'hidden'
);

CREATE VIEW public_schema_violations AS
SELECT 'proposal-cache-drift' AS violation_kind, proposal_id AS record_id
FROM proposal_cache_drift
UNION ALL
SELECT 'proposal-detail-cardinality', proposal_id || ':' || revision
FROM proposal_revision_detail_counts
WHERE detail_count != 1 OR matching_detail_count != 1
UNION ALL
SELECT 'proposal-missing-state', proposal_id
FROM proposals
WHERE current_state_event_sequence IS NULL OR current_admin_state IS NULL;

CREATE TRIGGER public_accounts_create_principal
AFTER INSERT ON public_accounts
WHEN NOT EXISTS (
  SELECT 1 FROM contributor_principals WHERE principal_id = NEW.account_id
)
BEGIN
  INSERT INTO contributor_principals (
    principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at
  ) VALUES (
    NEW.account_id, 'github', 'gh:' || lower(NEW.github_login), 1, NEW.created_at
  )
  ON CONFLICT(principal_id) DO NOTHING;
END;

CREATE TRIGGER principal_identity_link_events_require_contiguous
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM principal_identity_link_events WHERE link_id = NEW.link_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'identity link events must be contiguous');
END;

CREATE TRIGGER principal_identity_link_events_require_initial_verified
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence = 1 AND NEW.action_kind != 'verified'
BEGIN
  SELECT RAISE(ABORT, 'first identity link event must be verified');
END;

CREATE TRIGGER principal_identity_link_events_require_stable_pair
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence > 1
  AND (
    NEW.github_principal_id != (
      SELECT github_principal_id FROM principal_identity_link_events
      WHERE link_id = NEW.link_id ORDER BY event_sequence DESC LIMIT 1
    )
    OR NEW.wallet_principal_id != (
      SELECT wallet_principal_id FROM principal_identity_link_events
      WHERE link_id = NEW.link_id ORDER BY event_sequence DESC LIMIT 1
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'identity link principal pair is immutable');
END;

CREATE TRIGGER principal_identity_link_events_require_alternation
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence > 1
  AND NEW.action_kind = (
    SELECT action_kind FROM principal_identity_link_events
    WHERE link_id = NEW.link_id ORDER BY event_sequence DESC LIMIT 1
  )
BEGIN
  SELECT RAISE(ABORT, 'identity link actions must alternate');
END;

CREATE TRIGGER principal_identity_link_events_one_active_github
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.action_kind = 'verified'
  AND EXISTS (
    SELECT 1 FROM current_principal_identity_links current
    WHERE current.wallet_principal_id = NEW.wallet_principal_id
      AND current.link_id != NEW.link_id
  )
BEGIN
  SELECT RAISE(ABORT, 'wallet already has an active GitHub link');
END;

CREATE TRIGGER principal_identity_link_events_no_update
BEFORE UPDATE ON principal_identity_link_events
BEGIN
  SELECT RAISE(ABORT, 'immutable identity link event');
END;

CREATE TRIGGER principal_identity_link_events_no_delete
BEFORE DELETE ON principal_identity_link_events
BEGIN
  SELECT RAISE(ABORT, 'immutable identity link event');
END;

CREATE TRIGGER principal_session_events_require_contiguous
BEFORE INSERT ON principal_session_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM principal_session_events
   WHERE session_token_sha256 = NEW.session_token_sha256),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'principal session events must be contiguous');
END;

CREATE TRIGGER principal_session_events_require_initial_issued
BEFORE INSERT ON principal_session_events
WHEN NEW.event_sequence = 1 AND NEW.event_kind != 'issued'
BEGIN
  SELECT RAISE(ABORT, 'first principal session event must be issued');
END;

CREATE TRIGGER principal_session_events_require_open_session
BEFORE INSERT ON principal_session_events
WHEN NEW.event_sequence > 1
  AND (
    SELECT event_kind FROM principal_session_events
    WHERE session_token_sha256 = NEW.session_token_sha256
    ORDER BY event_sequence DESC LIMIT 1
  ) != 'issued'
BEGIN
  SELECT RAISE(ABORT, 'principal session already has a terminal event');
END;

CREATE TRIGGER principal_session_events_require_principal
BEFORE INSERT ON principal_session_events
WHEN NEW.principal_id != (
  SELECT account_id FROM public_sessions
  WHERE session_token_sha256 = NEW.session_token_sha256
)
BEGIN
  SELECT RAISE(ABORT, 'principal session event identity mismatch');
END;

CREATE TRIGGER principal_session_events_no_update
BEFORE UPDATE ON principal_session_events
BEGIN
  SELECT RAISE(ABORT, 'immutable principal session event');
END;

CREATE TRIGGER principal_session_events_no_delete
BEFORE DELETE ON principal_session_events
BEGIN
  SELECT RAISE(ABORT, 'immutable principal session event');
END;

-- Legacy proposal, revision, and state invariants are restored verbatim against the generalized
-- principal foreign keys.
CREATE TRIGGER proposals_identity_immutable
BEFORE UPDATE ON proposals
WHEN OLD.proposal_kind != NEW.proposal_kind
  OR OLD.author_account_id != NEW.author_account_id
  OR OLD.parent_proposal_id IS NOT NEW.parent_proposal_id
  OR OLD.parent_revision IS NOT NEW.parent_revision
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'proposal identity is immutable');
END;

CREATE TRIGGER proposals_no_delete
BEFORE DELETE ON proposals
BEGIN
  SELECT RAISE(ABORT, 'public proposals cannot be deleted');
END;

CREATE TRIGGER proposal_revisions_require_submitted
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) != 'submitted'
BEGIN
  SELECT RAISE(ABORT, 'revisions are allowed only while submitted');
END;

CREATE TRIGGER proposal_revisions_require_contiguous
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) = 'submitted'
  AND NEW.revision != COALESCE(
    (SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
BEGIN
  SELECT RAISE(ABORT, 'proposal revisions must be contiguous');
END;

CREATE TRIGGER proposal_revisions_require_author
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) = 'submitted'
  AND NEW.revision = COALESCE(
    (SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
  AND NEW.author_account_id != (
    SELECT author_account_id FROM proposals WHERE proposal_id = NEW.proposal_id
  )
BEGIN
  SELECT RAISE(ABORT, 'only the proposal author may revise while submitted');
END;

CREATE TRIGGER proposal_revisions_update_cache
AFTER INSERT ON proposal_revisions
BEGIN
  UPDATE proposals SET current_revision = NEW.revision WHERE proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER proposal_state_events_require_contiguous
BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT current_state_event_sequence FROM proposals WHERE proposal_id = NEW.proposal_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'proposal state events must be contiguous');
END;

CREATE TRIGGER proposal_state_events_require_initial_submitted
BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT current_state_event_sequence FROM proposals WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
  AND NEW.event_sequence = 1
  AND (NEW.from_state IS NOT NULL OR NEW.to_state != 'submitted')
BEGIN
  SELECT RAISE(ABORT, 'first proposal state must be submitted');
END;

CREATE TRIGGER proposal_state_events_require_current_from_state
BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT current_state_event_sequence FROM proposals WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
  AND NEW.event_sequence > 1
  AND NEW.from_state IS NOT (
    SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id
  )
BEGIN
  SELECT RAISE(ABORT, 'proposal state from_state does not match current state');
END;

CREATE TRIGGER proposal_state_events_require_allowed_transition
BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT current_state_event_sequence FROM proposals WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
  AND NEW.event_sequence > 1
  AND NEW.from_state IS (
    SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id
  )
  AND NOT EXISTS (
    SELECT 1 FROM allowed_proposal_state_transitions
    WHERE from_state = NEW.from_state AND to_state = NEW.to_state
  )
BEGIN
  SELECT RAISE(ABORT, 'proposal state transition is not allowed');
END;

CREATE TRIGGER proposal_state_events_update_cache
AFTER INSERT ON proposal_state_events
BEGIN
  UPDATE proposals
  SET current_state_event_sequence = NEW.event_sequence, current_admin_state = NEW.to_state
  WHERE proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER appeal_state_events_require_contiguous
BEFORE INSERT ON appeal_state_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM appeal_state_events WHERE appeal_id = NEW.appeal_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'appeal state events must be contiguous');
END;

CREATE TRIGGER appeal_state_events_require_initial_submitted
BEFORE INSERT ON appeal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT MAX(event_sequence) FROM appeal_state_events WHERE appeal_id = NEW.appeal_id),
    0
  ) + 1
  AND NEW.event_sequence = 1
  AND (NEW.from_state IS NOT NULL OR NEW.to_state != 'submitted')
BEGIN
  SELECT RAISE(ABORT, 'first appeal state must be submitted');
END;

CREATE TRIGGER appeal_state_events_require_current_from_state
BEFORE INSERT ON appeal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT MAX(event_sequence) FROM appeal_state_events WHERE appeal_id = NEW.appeal_id),
    0
  ) + 1
  AND NEW.event_sequence > 1
  AND NEW.from_state IS NOT (
    SELECT to_state FROM appeal_state_events
    WHERE appeal_id = NEW.appeal_id ORDER BY event_sequence DESC LIMIT 1
  )
BEGIN
  SELECT RAISE(ABORT, 'appeal from_state does not match current state');
END;

CREATE TRIGGER appeal_state_events_require_allowed_transition
BEFORE INSERT ON appeal_state_events
WHEN NEW.event_sequence = COALESCE(
    (SELECT MAX(event_sequence) FROM appeal_state_events WHERE appeal_id = NEW.appeal_id),
    0
  ) + 1
  AND NEW.event_sequence > 1
  AND NEW.from_state IS (
    SELECT to_state FROM appeal_state_events
    WHERE appeal_id = NEW.appeal_id ORDER BY event_sequence DESC LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM allowed_appeal_state_transitions
    WHERE from_state = NEW.from_state AND to_state = NEW.to_state
  )
BEGIN
  SELECT RAISE(ABORT, 'appeal state transition is not allowed');
END;

CREATE TRIGGER theoretical_model_details_kind
BEFORE INSERT ON theoretical_model_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'theoretical-model-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER physical_material_details_kind
BEFORE INSERT ON physical_material_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'physical-material-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER physical_mechanism_details_kind
BEFORE INSERT ON physical_mechanism_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'physical-calculation-mechanism-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER observation_interface_details_kind
BEFORE INSERT ON observation_interface_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'observation-interface-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER existing_member_assessment_details_kind
BEFORE INSERT ON existing_member_assessment_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'existing-member-assessment'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER existing_member_correction_details_kind
BEFORE INSERT ON existing_member_correction_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'existing-member-correction'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER ontology_change_details_kind
BEFORE INSERT ON ontology_change_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'ontology-change'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

-- Append-only and operator-authority triggers follow.
CREATE TRIGGER theoretical_model_details_no_update BEFORE UPDATE ON theoretical_model_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER theoretical_model_details_no_delete BEFORE DELETE ON theoretical_model_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER physical_material_details_no_update BEFORE UPDATE ON physical_material_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER physical_material_details_no_delete BEFORE DELETE ON physical_material_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER physical_mechanism_details_no_update BEFORE UPDATE ON physical_mechanism_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER physical_mechanism_details_no_delete BEFORE DELETE ON physical_mechanism_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER observation_interface_details_no_update BEFORE UPDATE ON observation_interface_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER observation_interface_details_no_delete BEFORE DELETE ON observation_interface_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER existing_member_assessment_details_no_update BEFORE UPDATE ON existing_member_assessment_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER existing_member_assessment_details_no_delete BEFORE DELETE ON existing_member_assessment_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER existing_member_correction_details_no_update BEFORE UPDATE ON existing_member_correction_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER existing_member_correction_details_no_delete BEFORE DELETE ON existing_member_correction_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER ontology_change_details_no_update BEFORE UPDATE ON ontology_change_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER ontology_change_details_no_delete BEFORE DELETE ON ontology_change_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_references_no_update BEFORE UPDATE ON proposal_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_references_no_delete BEFORE DELETE ON proposal_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticism_references_no_update BEFORE UPDATE ON criticism_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticism_references_no_delete BEFORE DELETE ON criticism_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER test_report_references_no_update BEFORE UPDATE ON test_report_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER test_report_references_no_delete BEFORE DELETE ON test_report_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_revisions_no_update BEFORE UPDATE ON proposal_revisions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_revisions_no_delete BEFORE DELETE ON proposal_revisions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_state_events_no_update BEFORE UPDATE ON proposal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_state_events_no_delete BEFORE DELETE ON proposal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_evidence_no_update BEFORE UPDATE ON proposal_evidence BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_evidence_no_delete BEFORE DELETE ON proposal_evidence BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticisms_no_update BEFORE UPDATE ON criticisms BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticisms_no_delete BEFORE DELETE ON criticisms BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticism_replies_no_update BEFORE UPDATE ON criticism_replies BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticism_replies_no_delete BEFORE DELETE ON criticism_replies BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER scoped_test_reports_no_update BEFORE UPDATE ON scoped_test_reports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER scoped_test_reports_no_delete BEFORE DELETE ON scoped_test_reports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER competing_interpretations_no_update BEFORE UPDATE ON competing_interpretations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER competing_interpretations_no_delete BEFORE DELETE ON competing_interpretations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER moderation_actions_no_update BEFORE UPDATE ON moderation_actions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER moderation_actions_no_delete BEFORE DELETE ON moderation_actions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER appeals_no_update BEFORE UPDATE ON appeals BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER appeals_no_delete BEFORE DELETE ON appeals BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER appeal_state_events_no_update BEFORE UPDATE ON appeal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER appeal_state_events_no_delete BEFORE DELETE ON appeal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER maintainer_exports_no_update BEFORE UPDATE ON maintainer_exports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER maintainer_exports_no_delete BEFORE DELETE ON maintainer_exports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER admission_links_no_update BEFORE UPDATE ON admission_links BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER admission_links_no_delete BEFORE DELETE ON admission_links BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;

CREATE TRIGGER account_role_events_bootstrap_once
BEFORE INSERT ON account_role_events
WHEN NEW.authority_kind = 'deployment-bootstrap'
  AND EXISTS (SELECT 1 FROM account_role_events WHERE role = NEW.role)
BEGIN
  SELECT RAISE(ABORT, 'operator bootstrap is allowed only before the first role event');
END;

CREATE TRIGGER account_role_events_require_operator_actor
BEFORE INSERT ON account_role_events
WHEN NEW.authority_kind = 'operator'
  AND NOT EXISTS (
    SELECT 1 FROM current_principal_roles
    WHERE principal_id = NEW.actor_account_id AND role = 'operator'
  )
BEGIN
  SELECT RAISE(ABORT, 'operator role changes require an active operator actor');
END;

CREATE TRIGGER account_role_events_no_duplicate_grant
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'granted'
  AND EXISTS (
    SELECT 1 FROM current_principal_roles
    WHERE principal_id = NEW.account_id AND role = NEW.role
  )
BEGIN
  SELECT RAISE(ABORT, 'account already has this active role');
END;

CREATE TRIGGER account_role_events_no_inactive_revoke
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'revoked'
  AND NOT EXISTS (
    SELECT 1 FROM current_principal_roles
    WHERE principal_id = NEW.account_id AND role = NEW.role
  )
BEGIN
  SELECT RAISE(ABORT, 'account does not have this active role');
END;

CREATE TRIGGER account_role_events_keep_operator
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'revoked'
  AND (SELECT COUNT(*) FROM current_principal_roles WHERE role = 'operator') <= 1
BEGIN
  SELECT RAISE(ABORT, 'the final active operator cannot be revoked');
END;

CREATE TRIGGER account_role_events_no_update
BEFORE UPDATE ON account_role_events
BEGIN
  SELECT RAISE(ABORT, 'immutable public record');
END;

CREATE TRIGGER account_role_events_no_delete
BEFORE DELETE ON account_role_events
BEGIN
  SELECT RAISE(ABORT, 'immutable public record');
END;

-- Deliberately no schema_version update here. The replay-safe final Task #5 payment migration owns
-- the only transition from version 2 to version 3 after the complete schema is present.
