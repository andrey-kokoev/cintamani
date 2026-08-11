PRAGMA foreign_keys = ON;

CREATE TABLE public_schema_metadata (
  metadata_key TEXT PRIMARY KEY,
  metadata_value TEXT NOT NULL
) STRICT;

INSERT INTO public_schema_metadata (metadata_key, metadata_value) VALUES
  ('projection_kind', 'cintamani-public-proposals'),
  ('schema_version', '1');

-- GitHub is the authentication authority. The stable GitHub numeric identity is stored only as
-- a keyed digest; the public API may expose login/profile/avatar, never the digest or an email.
CREATE TABLE public_accounts (
  account_id TEXT PRIMARY KEY,
  github_identity_hmac_sha256 TEXT NOT NULL UNIQUE CHECK (length(github_identity_hmac_sha256) = 64),
  github_login TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(github_login) BETWEEN 1 AND 39),
  github_profile_url TEXT NOT NULL CHECK (github_profile_url LIKE 'https://github.com/%'),
  github_avatar_url TEXT CHECK (github_avatar_url IS NULL OR github_avatar_url LIKE 'https://%'),
  created_at TEXT NOT NULL,
  last_authenticated_at TEXT NOT NULL
) STRICT;

-- Operational security rows are deliberately separate from immutable public scientific records.
CREATE TABLE oauth_state_nonces (
  state_digest_sha256 TEXT PRIMARY KEY CHECK (length(state_digest_sha256) = 64),
  redirect_path TEXT NOT NULL CHECK (redirect_path LIKE '/%' AND instr(redirect_path, '//') = 0),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  CHECK (expires_at > created_at),
  CHECK (consumed_at IS NULL OR consumed_at >= created_at)
) STRICT;

CREATE TABLE public_sessions (
  session_token_sha256 TEXT PRIMARY KEY CHECK (length(session_token_sha256) = 64),
  csrf_token_sha256 TEXT NOT NULL CHECK (length(csrf_token_sha256) = 64),
  account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  rotated_to_sha256 TEXT REFERENCES public_sessions(session_token_sha256),
  CHECK (expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (rotated_to_sha256 IS NULL OR revoked_at IS NOT NULL)
) STRICT;

CREATE TABLE proposals (
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
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
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
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE proposal_revisions (
  proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  revision_id TEXT NOT NULL UNIQUE,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
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

CREATE TABLE theoretical_model_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  member_id TEXT NOT NULL CHECK (length(member_id) BETWEEN 1 AND 120),
  member_name TEXT NOT NULL CHECK (length(member_name) BETWEEN 1 AND 160),
  model_definition TEXT NOT NULL CHECK (length(model_definition) BETWEEN 1 AND 12000),
  computational_claim TEXT NOT NULL CHECK (length(computational_claim) BETWEEN 1 AND 8000),
  initial_epistemic_status TEXT NOT NULL CHECK (initial_epistemic_status IN ('unspecified', 'candidate', 'rejected')),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE physical_material_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  member_id TEXT NOT NULL CHECK (length(member_id) BETWEEN 1 AND 120),
  member_name TEXT NOT NULL CHECK (length(member_name) BETWEEN 1 AND 160),
  material_classification TEXT NOT NULL CHECK (material_classification IN (
    'abstract-normalized-medium', 'candidate-physical-material', 'validated-physical-material'
  )),
  composition_or_structure TEXT NOT NULL CHECK (length(composition_or_structure) BETWEEN 1 AND 4000),
  physical_evidence_boundary TEXT NOT NULL CHECK (length(physical_evidence_boundary) BETWEEN 1 AND 8000),
  initial_epistemic_status TEXT NOT NULL CHECK (initial_epistemic_status IN (
    'abstract-placeholder', 'not-material-instantiated', 'unvalidated-candidate', 'rejected'
  )),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE physical_mechanism_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  member_id TEXT NOT NULL CHECK (length(member_id) BETWEEN 1 AND 120),
  member_name TEXT NOT NULL CHECK (length(member_name) BETWEEN 1 AND 160),
  physical_process TEXT NOT NULL CHECK (length(physical_process) BETWEEN 1 AND 8000),
  state_or_signal_carrier TEXT NOT NULL CHECK (length(state_or_signal_carrier) BETWEEN 1 AND 4000),
  initial_epistemic_status TEXT NOT NULL CHECK (initial_epistemic_status IN ('candidate', 'unimplemented', 'rejected')),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE observation_interface_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  member_id TEXT NOT NULL CHECK (length(member_id) BETWEEN 1 AND 120),
  member_name TEXT NOT NULL CHECK (length(member_name) BETWEEN 1 AND 160),
  observation_kind TEXT NOT NULL CHECK (observation_kind IN ('intensity', 'coherent-quadrature', 'joint', 'abstract')),
  units TEXT NOT NULL CHECK (length(units) BETWEEN 1 AND 80),
  observation_boundary TEXT NOT NULL CHECK (length(observation_boundary) BETWEEN 1 AND 8000),
  initial_epistemic_status TEXT NOT NULL CHECK (initial_epistemic_status IN ('candidate', 'unimplemented', 'rejected')),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE existing_member_assessment_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  target_dimension TEXT NOT NULL CHECK (target_dimension IN (
    'theoretical-model', 'physical-material',
    'physical-calculation-mechanism', 'observation-interface'
  )),
  target_member_id TEXT NOT NULL CHECK (length(target_member_id) BETWEEN 1 AND 120),
  proposed_assessment_status TEXT NOT NULL CHECK (length(proposed_assessment_status) BETWEEN 1 AND 120),
  proposed_assessment_detail TEXT,
  assessment_rationale TEXT NOT NULL CHECK (length(assessment_rationale) BETWEEN 1 AND 12000),
  assessment_scope TEXT NOT NULL CHECK (length(assessment_scope) BETWEEN 1 AND 4000),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE existing_member_correction_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  target_dimension TEXT NOT NULL CHECK (target_dimension IN (
    'theoretical-model', 'physical-material',
    'physical-calculation-mechanism', 'observation-interface'
  )),
  target_member_id TEXT NOT NULL CHECK (length(target_member_id) BETWEEN 1 AND 120),
  corrected_name TEXT,
  corrected_definition TEXT,
  corrected_assessment_status TEXT,
  corrected_assessment_detail TEXT,
  correction_rationale TEXT NOT NULL CHECK (length(correction_rationale) BETWEEN 1 AND 12000),
  PRIMARY KEY (proposal_id, revision),
  CHECK (
    corrected_name IS NOT NULL OR corrected_definition IS NOT NULL OR
    corrected_assessment_status IS NOT NULL OR corrected_assessment_detail IS NOT NULL
  ),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE ontology_change_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  change_kind TEXT NOT NULL CHECK (change_kind IN (
    'add-dimension', 'revise-dimension-definition', 'add-status-vocabulary',
    'revise-relation', 'other-explicit'
  )),
  target_key TEXT,
  proposed_definition TEXT NOT NULL CHECK (length(proposed_definition) BETWEEN 1 AND 12000),
  compatibility_effect TEXT NOT NULL CHECK (length(compatibility_effect) BETWEEN 1 AND 8000),
  migration_requirements TEXT NOT NULL CHECK (length(migration_requirements) BETWEEN 1 AND 8000),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE proposal_evidence (
  evidence_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  evidence_kind TEXT NOT NULL CHECK (evidence_kind IN (
    'empirical-result', 'simulation-result', 'argument', 'criticism-response', 'other-explicit'
  )),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE proposal_references (
  reference_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  reference_kind TEXT NOT NULL CHECK (reference_kind IN (
    'primary-source', 'dataset', 'software', 'criticism', 'context', 'other-explicit'
  )),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  https_url TEXT NOT NULL CHECK (https_url LIKE 'https://%' AND length(https_url) <= 2048),
  source_timestamp TEXT,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE criticisms (
  criticism_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  criticism TEXT NOT NULL CHECK (length(criticism) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (criticism_id, proposal_id, target_revision),
  FOREIGN KEY (proposal_id, target_revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE criticism_replies (
  reply_id TEXT PRIMARY KEY,
  criticism_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  reply TEXT NOT NULL CHECK (length(reply) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (criticism_id, proposal_id, target_revision)
    REFERENCES criticisms(criticism_id, proposal_id, target_revision)
) STRICT;

CREATE TABLE scoped_test_reports (
  test_report_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  test_name TEXT NOT NULL CHECK (length(test_name) BETWEEN 1 AND 200),
  protocol TEXT NOT NULL CHECK (length(protocol) BETWEEN 1 AND 12000),
  result TEXT NOT NULL CHECK (length(result) BETWEEN 1 AND 12000),
  interpretation TEXT NOT NULL CHECK (length(interpretation) BETWEEN 1 AND 12000),
  test_relation TEXT NOT NULL CHECK (test_relation IN (
    'survives-test', 'falsifies', 'criticizes', 'inconclusive', 'mixed'
  )),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, target_revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE competing_interpretations (
  interpretation_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  interpretation TEXT NOT NULL CHECK (length(interpretation) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, target_revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE criticism_references (
  reference_id TEXT PRIMARY KEY,
  criticism_id TEXT NOT NULL REFERENCES criticisms(criticism_id),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  https_url TEXT NOT NULL CHECK (https_url LIKE 'https://%' AND length(https_url) <= 2048),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE test_report_references (
  reference_id TEXT PRIMARY KEY,
  test_report_id TEXT NOT NULL REFERENCES scoped_test_reports(test_report_id),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 300),
  https_url TEXT NOT NULL CHECK (https_url LIKE 'https://%' AND length(https_url) <= 2048),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE allowed_proposal_state_transitions (
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  PRIMARY KEY (from_state, to_state)
) STRICT;

INSERT INTO allowed_proposal_state_transitions (from_state, to_state) VALUES
  ('submitted', 'triaged'),
  ('submitted', 'declined'),
  ('submitted', 'withdrawn'),
  ('triaged', 'under-review'),
  ('triaged', 'selected-for-export'),
  ('triaged', 'declined'),
  ('triaged', 'withdrawn'),
  ('triaged', 'superseded'),
  ('under-review', 'selected-for-export'),
  ('under-review', 'declined'),
  ('under-review', 'withdrawn'),
  ('under-review', 'superseded'),
  ('selected-for-export', 'admitted-link-recorded'),
  ('selected-for-export', 'declined'),
  ('selected-for-export', 'withdrawn'),
  ('selected-for-export', 'superseded'),
  ('admitted-link-recorded', 'superseded');

CREATE TABLE proposal_state_events (
  proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  state_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'submitted', 'triaged', 'under-review', 'selected-for-export',
    'declined', 'withdrawn', 'superseded', 'admitted-link-recorded'
  )),
  selected_revision INTEGER,
  actor_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, event_sequence),
  UNIQUE (proposal_id, event_sequence, selected_revision),
  CHECK ((to_state = 'selected-for-export') = (selected_revision IS NOT NULL)),
  FOREIGN KEY (proposal_id, selected_revision)
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE moderation_actions (
  action_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  moderation_action_id TEXT NOT NULL UNIQUE,
  moderator_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
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
  target_criticism_id TEXT REFERENCES criticisms(criticism_id),
  target_reply_id TEXT REFERENCES criticism_replies(reply_id),
  target_test_report_id TEXT REFERENCES scoped_test_reports(test_report_id),
  target_interpretation_id TEXT REFERENCES competing_interpretations(interpretation_id),
  target_account_id TEXT REFERENCES public_accounts(account_id),
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
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE appeals (
  appeal_id TEXT PRIMARY KEY,
  moderation_action_id TEXT NOT NULL REFERENCES moderation_actions(moderation_action_id),
  appellant_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  appeal TEXT NOT NULL CHECK (length(appeal) BETWEEN 1 AND 12000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE allowed_appeal_state_transitions (
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  PRIMARY KEY (from_state, to_state)
) STRICT;

INSERT INTO allowed_appeal_state_transitions (from_state, to_state) VALUES
  ('submitted', 'under-review'),
  ('submitted', 'withdrawn'),
  ('under-review', 'upheld'),
  ('under-review', 'granted'),
  ('under-review', 'withdrawn');

CREATE TABLE appeal_state_events (
  appeal_id TEXT NOT NULL REFERENCES appeals(appeal_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  appeal_state_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT,
  to_state TEXT NOT NULL CHECK (to_state IN (
    'submitted', 'under-review', 'upheld', 'granted', 'withdrawn'
  )),
  actor_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (appeal_id, event_sequence)
) STRICT;

CREATE TABLE write_idempotency_keys (
  account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
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

CREATE TABLE quota_events (
  quota_event_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  ip_hmac_sha256 TEXT NOT NULL CHECK (length(ip_hmac_sha256) = 64),
  mutation_kind TEXT NOT NULL CHECK (mutation_kind IN (
    'proposal', 'revision', 'criticism', 'reply', 'test-report',
    'interpretation', 'appeal', 'withdrawal'
  )),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE TABLE maintainer_exports (
  export_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  selected_revision INTEGER NOT NULL,
  selected_state_event_sequence INTEGER NOT NULL,
  export_scope TEXT NOT NULL CHECK (length(export_scope) BETWEEN 1 AND 4000),
  criticisms_non_exhaustive INTEGER NOT NULL DEFAULT 1 CHECK (criticisms_non_exhaustive = 1),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  content_sha256 TEXT NOT NULL UNIQUE CHECK (length(content_sha256) = 64),
  created_by_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, selected_revision)
    REFERENCES proposal_revisions(proposal_id, revision),
  FOREIGN KEY (proposal_id, selected_state_event_sequence, selected_revision)
    REFERENCES proposal_state_events(proposal_id, event_sequence, selected_revision)
) STRICT;

CREATE TABLE admission_links (
  admission_link_id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL REFERENCES maintainer_exports(export_id),
  canonical_admission_id TEXT NOT NULL,
  canonical_entry_id TEXT NOT NULL,
  canonical_commit_sha TEXT NOT NULL CHECK (length(canonical_commit_sha) = 40),
  linked_by_account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (export_id, canonical_admission_id, canonical_entry_id)
) STRICT;
