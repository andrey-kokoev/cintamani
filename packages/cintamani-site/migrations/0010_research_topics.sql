-- Problem-derived public research-topic proposals. Topic framing is organizational,
-- never an admission, scientific result, or epistemic assessment.
PRAGMA defer_foreign_keys = TRUE;

DROP VIEW IF EXISTS public_schema_violations;
DROP VIEW IF EXISTS public_proposal_summaries;
DROP VIEW IF EXISTS proposal_cache_drift;
DROP VIEW IF EXISTS proposal_revision_detail_counts;

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
DROP TRIGGER IF EXISTS theoretical_model_details_kind;
DROP TRIGGER IF EXISTS physical_material_details_kind;
DROP TRIGGER IF EXISTS physical_mechanism_details_kind;
DROP TRIGGER IF EXISTS observation_interface_details_kind;
DROP TRIGGER IF EXISTS existing_member_assessment_details_kind;
DROP TRIGGER IF EXISTS existing_member_correction_details_kind;
DROP TRIGGER IF EXISTS ontology_change_details_kind;
DROP TRIGGER IF EXISTS proposal_payment_sources_require_author;

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
DROP TRIGGER IF EXISTS criticism_references_no_update;
DROP TRIGGER IF EXISTS criticism_references_no_delete;
DROP TRIGGER IF EXISTS scoped_test_reports_no_update;
DROP TRIGGER IF EXISTS scoped_test_reports_no_delete;
DROP TRIGGER IF EXISTS test_report_references_no_update;
DROP TRIGGER IF EXISTS test_report_references_no_delete;
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
DROP TRIGGER IF EXISTS proposal_payment_sources_no_update;
DROP TRIGGER IF EXISTS proposal_payment_sources_no_delete;
DROP TRIGGER IF EXISTS proposal_payment_sources_require_finalizing;
DROP TRIGGER IF EXISTS explanatory_conjecture_details_kind;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_kind;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_kind;
DROP TRIGGER IF EXISTS conjecture_relations_exact_kinds;
DROP TRIGGER IF EXISTS criticisms_exact_focus;
DROP TRIGGER IF EXISTS explanatory_conjecture_details_no_update;
DROP TRIGGER IF EXISTS explanatory_conjecture_details_no_delete;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_no_update;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_no_delete;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_no_update;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_no_delete;
DROP TRIGGER IF EXISTS conjecture_relations_no_update;
DROP TRIGGER IF EXISTS conjecture_relations_no_delete;
DROP TRIGGER IF EXISTS research_topic_details_kind;
DROP TRIGGER IF EXISTS research_topic_loci_kind;
DROP TRIGGER IF EXISTS research_topic_origins_kind;
DROP TRIGGER IF EXISTS research_topic_relations_exact_kinds;
DROP TRIGGER IF EXISTS research_topic_details_no_update;
DROP TRIGGER IF EXISTS research_topic_details_no_delete;
DROP TRIGGER IF EXISTS research_topic_loci_no_update;
DROP TRIGGER IF EXISTS research_topic_loci_no_delete;
DROP TRIGGER IF EXISTS research_topic_origins_no_update;
DROP TRIGGER IF EXISTS research_topic_origins_no_delete;
DROP TRIGGER IF EXISTS research_topic_relations_no_update;
DROP TRIGGER IF EXISTS research_topic_relations_no_delete;

-- Holding tables make the destructive cutover one transactional, lossless unit.
CREATE TABLE IF NOT EXISTS _v6_hold_proposals AS SELECT * FROM proposals;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_revisions AS SELECT * FROM proposal_revisions;
CREATE TABLE IF NOT EXISTS _v6_hold_theoretical_model_details AS SELECT * FROM theoretical_model_details;
CREATE TABLE IF NOT EXISTS _v6_hold_physical_material_details AS SELECT * FROM physical_material_details;
CREATE TABLE IF NOT EXISTS _v6_hold_physical_mechanism_details AS SELECT * FROM physical_mechanism_details;
CREATE TABLE IF NOT EXISTS _v6_hold_observation_interface_details AS SELECT * FROM observation_interface_details;
CREATE TABLE IF NOT EXISTS _v6_hold_existing_member_assessment_details AS SELECT * FROM existing_member_assessment_details;
CREATE TABLE IF NOT EXISTS _v6_hold_existing_member_correction_details AS SELECT * FROM existing_member_correction_details;
CREATE TABLE IF NOT EXISTS _v6_hold_ontology_change_details AS SELECT * FROM ontology_change_details;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_references AS SELECT * FROM proposal_references;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_evidence AS SELECT * FROM proposal_evidence;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_state_events AS SELECT * FROM proposal_state_events;
CREATE TABLE IF NOT EXISTS _v6_hold_criticisms AS SELECT * FROM criticisms;
CREATE TABLE IF NOT EXISTS _v6_hold_criticism_replies AS SELECT * FROM criticism_replies;
CREATE TABLE IF NOT EXISTS _v6_hold_criticism_references AS SELECT * FROM criticism_references;
CREATE TABLE IF NOT EXISTS _v6_hold_scoped_test_reports AS SELECT * FROM scoped_test_reports;
CREATE TABLE IF NOT EXISTS _v6_hold_test_report_references AS SELECT * FROM test_report_references;
CREATE TABLE IF NOT EXISTS _v6_hold_competing_interpretations AS SELECT * FROM competing_interpretations;
CREATE TABLE IF NOT EXISTS _v6_hold_moderation_actions AS SELECT * FROM moderation_actions;
CREATE TABLE IF NOT EXISTS _v6_hold_appeals AS SELECT * FROM appeals;
CREATE TABLE IF NOT EXISTS _v6_hold_appeal_state_events AS SELECT * FROM appeal_state_events;
CREATE TABLE IF NOT EXISTS _v6_hold_maintainer_exports AS SELECT * FROM maintainer_exports;
CREATE TABLE IF NOT EXISTS _v6_hold_admission_links AS SELECT * FROM admission_links;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_payment_sources AS SELECT * FROM proposal_payment_sources;
CREATE TABLE IF NOT EXISTS _v6_hold_explanatory_conjecture_details AS SELECT * FROM explanatory_conjecture_details;
CREATE TABLE IF NOT EXISTS _v6_hold_explanatory_conjecture_assumptions AS SELECT * FROM explanatory_conjecture_assumptions;
CREATE TABLE IF NOT EXISTS _v6_hold_proposal_coordinate_framings AS SELECT * FROM proposal_coordinate_framings;
CREATE TABLE IF NOT EXISTS _v6_hold_conjecture_relations AS SELECT * FROM conjecture_relations;

-- A committed prefix can leave one or more shadow names behind. The holding
-- copies above are authoritative for this unrecorded migration, so recreate a
-- coherent shadow graph on every attempt.
DROP TABLE IF EXISTS _v6_criticisms;
DROP TABLE IF EXISTS _v6_proposal_revisions;
DROP TABLE IF EXISTS _v6_proposals;

CREATE TABLE IF NOT EXISTS _v6_proposals (
  proposal_id TEXT PRIMARY KEY,
  proposal_kind TEXT NOT NULL CHECK (proposal_kind IN (
    'theoretical-model-member', 'physical-material-member',
    'physical-calculation-mechanism-member', 'observation-interface-member',
    'existing-member-assessment', 'existing-member-correction', 'ontology-change',
    'explanatory-conjecture', 'research-topic'
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
    REFERENCES _v6_proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS _v6_proposal_revisions (
  proposal_id TEXT NOT NULL REFERENCES _v6_proposals(proposal_id),
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

CREATE TABLE IF NOT EXISTS _v6_criticisms (
  criticism_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  criticism TEXT NOT NULL CHECK (length(criticism) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  focus_kind TEXT NOT NULL DEFAULT 'whole-proposal' CHECK (focus_kind IN (
    'whole-proposal', 'problem-statement', 'explanatory-claim', 'essential-mechanism',
    'explanation-scope', 'failure-condition', 'assumption', 'coordinate-framing',
    'conjecture-relation', 'topic-open-problem', 'topic-why-open',
    'topic-scope', 'topic-next-test', 'topic-non-claims', 'topic-locus',
    'topic-origin', 'topic-coordinate-framing', 'topic-relation', 'other-explicit'
  )),
  focus_ref TEXT,
  UNIQUE (criticism_id, proposal_id, target_revision),
  CHECK (
    (focus_kind IN ('assumption', 'coordinate-framing', 'conjecture-relation',
                    'topic-locus', 'topic-origin', 'topic-coordinate-framing', 'topic-relation')
      AND focus_ref IS NOT NULL)
    OR (focus_kind NOT IN ('assumption', 'coordinate-framing', 'conjecture-relation',
                           'topic-locus', 'topic-origin', 'topic-coordinate-framing', 'topic-relation')
      AND focus_ref IS NULL)
  ),
  FOREIGN KEY (proposal_id, target_revision)
    REFERENCES _v6_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT OR IGNORE INTO _v6_proposals SELECT * FROM _v6_hold_proposals;
INSERT OR IGNORE INTO _v6_proposal_revisions SELECT * FROM _v6_hold_proposal_revisions;
INSERT OR IGNORE INTO _v6_criticisms (
  criticism_id, proposal_id, target_revision, author_account_id, title,
  criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
)
SELECT criticism_id, proposal_id, target_revision, author_account_id, title,
       criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
FROM _v6_hold_criticisms;

-- If an unrecorded remote execution persisted a destructive prefix, these short-lived
-- compatibility tables let the same migration resume from its immutable holding copy.
CREATE TABLE IF NOT EXISTS proposals (
  proposal_id TEXT PRIMARY KEY,
  proposal_kind TEXT NOT NULL CHECK (proposal_kind IN (
    'theoretical-model-member', 'physical-material-member',
    'physical-calculation-mechanism-member', 'observation-interface-member',
    'existing-member-assessment', 'existing-member-correction', 'ontology-change',
    'explanatory-conjecture', 'research-topic'
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
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;
CREATE TABLE IF NOT EXISTS proposal_revisions (
  proposal_id TEXT NOT NULL REFERENCES proposals(proposal_id),
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
CREATE TABLE IF NOT EXISTS criticisms (
  criticism_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  criticism TEXT NOT NULL CHECK (length(criticism) BETWEEN 1 AND 12000),
  scope TEXT NOT NULL CHECK (length(scope) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  focus_kind TEXT NOT NULL DEFAULT 'whole-proposal' CHECK (focus_kind IN (
    'whole-proposal', 'problem-statement', 'explanatory-claim', 'essential-mechanism',
    'explanation-scope', 'failure-condition', 'assumption', 'coordinate-framing',
    'conjecture-relation', 'topic-open-problem', 'topic-why-open',
    'topic-scope', 'topic-next-test', 'topic-non-claims', 'topic-locus',
    'topic-origin', 'topic-coordinate-framing', 'topic-relation', 'other-explicit'
  )),
  focus_ref TEXT,
  UNIQUE (criticism_id, proposal_id, target_revision),
  CHECK (
    (focus_kind IN ('assumption', 'coordinate-framing', 'conjecture-relation',
                    'topic-locus', 'topic-origin', 'topic-coordinate-framing', 'topic-relation')
      AND focus_ref IS NOT NULL)
    OR (focus_kind NOT IN ('assumption', 'coordinate-framing', 'conjecture-relation',
                           'topic-locus', 'topic-origin', 'topic-coordinate-framing', 'topic-relation')
      AND focus_ref IS NULL)
  ),
  FOREIGN KEY (proposal_id, target_revision)
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;
INSERT OR IGNORE INTO proposals SELECT * FROM _v6_hold_proposals;
INSERT OR IGNORE INTO proposal_revisions SELECT * FROM _v6_hold_proposal_revisions;
INSERT OR IGNORE INTO criticisms (
  criticism_id, proposal_id, target_revision, author_account_id, title,
  criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
)
SELECT criticism_id, proposal_id, target_revision, author_account_id, title,
       criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
FROM _v6_hold_criticisms;

DELETE FROM admission_links;
DELETE FROM maintainer_exports;
DELETE FROM appeal_state_events;
DELETE FROM appeals;
DELETE FROM moderation_actions;
DELETE FROM criticism_references;
DELETE FROM criticism_replies;
DELETE FROM criticisms;
DELETE FROM test_report_references;
DELETE FROM scoped_test_reports;
DELETE FROM competing_interpretations;
DELETE FROM proposal_evidence;
DELETE FROM proposal_payment_sources;
DELETE FROM proposal_references;
DELETE FROM theoretical_model_details;
DELETE FROM physical_material_details;
DELETE FROM physical_mechanism_details;
DELETE FROM observation_interface_details;
DELETE FROM existing_member_assessment_details;
DELETE FROM existing_member_correction_details;
DELETE FROM ontology_change_details;
DELETE FROM conjecture_relations;
DELETE FROM proposal_coordinate_framings;
DELETE FROM explanatory_conjecture_assumptions;
DELETE FROM explanatory_conjecture_details;
DELETE FROM proposal_state_events;
UPDATE proposals SET parent_proposal_id = NULL, parent_revision = NULL
WHERE parent_proposal_id IS NOT NULL;
DELETE FROM proposal_revisions;
DELETE FROM proposals;

DROP TABLE IF EXISTS criticisms;
DROP TABLE IF EXISTS proposal_revisions;
DROP TABLE IF EXISTS proposals;
ALTER TABLE _v6_proposals RENAME TO proposals;
ALTER TABLE _v6_proposal_revisions RENAME TO proposal_revisions;
ALTER TABLE _v6_criticisms RENAME TO criticisms;

INSERT INTO proposal_state_events SELECT * FROM _v6_hold_proposal_state_events;
INSERT INTO theoretical_model_details SELECT * FROM _v6_hold_theoretical_model_details;
INSERT INTO physical_material_details SELECT * FROM _v6_hold_physical_material_details;
INSERT INTO physical_mechanism_details SELECT * FROM _v6_hold_physical_mechanism_details;
INSERT INTO observation_interface_details SELECT * FROM _v6_hold_observation_interface_details;
INSERT INTO existing_member_assessment_details SELECT * FROM _v6_hold_existing_member_assessment_details;
INSERT INTO existing_member_correction_details SELECT * FROM _v6_hold_existing_member_correction_details;
INSERT INTO ontology_change_details SELECT * FROM _v6_hold_ontology_change_details;
INSERT INTO explanatory_conjecture_details SELECT * FROM _v6_hold_explanatory_conjecture_details;
INSERT INTO explanatory_conjecture_assumptions SELECT * FROM _v6_hold_explanatory_conjecture_assumptions;
INSERT INTO proposal_coordinate_framings SELECT * FROM _v6_hold_proposal_coordinate_framings;
INSERT INTO conjecture_relations SELECT * FROM _v6_hold_conjecture_relations;
INSERT INTO proposal_references SELECT * FROM _v6_hold_proposal_references;
INSERT INTO proposal_evidence SELECT * FROM _v6_hold_proposal_evidence;
INSERT INTO criticism_replies SELECT * FROM _v6_hold_criticism_replies;
INSERT INTO criticism_references SELECT * FROM _v6_hold_criticism_references;
INSERT INTO scoped_test_reports SELECT * FROM _v6_hold_scoped_test_reports;
INSERT INTO test_report_references SELECT * FROM _v6_hold_test_report_references;
INSERT INTO competing_interpretations SELECT * FROM _v6_hold_competing_interpretations;
INSERT INTO moderation_actions SELECT * FROM _v6_hold_moderation_actions;
INSERT INTO appeals SELECT * FROM _v6_hold_appeals;
INSERT INTO appeal_state_events SELECT * FROM _v6_hold_appeal_state_events;
INSERT INTO maintainer_exports SELECT * FROM _v6_hold_maintainer_exports;
INSERT INTO admission_links SELECT * FROM _v6_hold_admission_links;
INSERT INTO proposal_payment_sources SELECT * FROM _v6_hold_proposal_payment_sources;

DROP TABLE _v6_hold_theoretical_model_details;
DROP TABLE _v6_hold_physical_material_details;
DROP TABLE _v6_hold_physical_mechanism_details;
DROP TABLE _v6_hold_observation_interface_details;
DROP TABLE _v6_hold_existing_member_assessment_details;
DROP TABLE _v6_hold_existing_member_correction_details;
DROP TABLE _v6_hold_ontology_change_details;
DROP TABLE _v6_hold_proposal_references;
DROP TABLE _v6_hold_proposal_evidence;
DROP TABLE _v6_hold_proposal_state_events;
DROP TABLE _v6_hold_proposals;
DROP TABLE _v6_hold_proposal_revisions;
DROP TABLE _v6_hold_criticisms;
DROP TABLE _v6_hold_criticism_replies;
DROP TABLE _v6_hold_criticism_references;
DROP TABLE _v6_hold_scoped_test_reports;
DROP TABLE _v6_hold_test_report_references;
DROP TABLE _v6_hold_competing_interpretations;
DROP TABLE _v6_hold_moderation_actions;
DROP TABLE _v6_hold_appeals;
DROP TABLE _v6_hold_appeal_state_events;
DROP TABLE _v6_hold_maintainer_exports;
DROP TABLE _v6_hold_admission_links;
DROP TABLE _v6_hold_proposal_payment_sources;
DROP TABLE _v6_hold_explanatory_conjecture_details;
DROP TABLE _v6_hold_explanatory_conjecture_assumptions;
DROP TABLE _v6_hold_proposal_coordinate_framings;
DROP TABLE _v6_hold_conjecture_relations;

CREATE TABLE IF NOT EXISTS explanatory_conjecture_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  problem_statement TEXT NOT NULL CHECK (length(problem_statement) BETWEEN 1 AND 12000),
  explanatory_claim TEXT NOT NULL CHECK (length(explanatory_claim) BETWEEN 1 AND 12000),
  essential_mechanism TEXT NOT NULL CHECK (length(essential_mechanism) BETWEEN 1 AND 12000),
  explanation_scope TEXT NOT NULL CHECK (length(explanation_scope) BETWEEN 1 AND 4000),
  failure_condition TEXT NOT NULL CHECK (length(failure_condition) BETWEEN 1 AND 12000),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS explanatory_conjecture_assumptions (
  assumption_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  assumption_order INTEGER NOT NULL CHECK (assumption_order BETWEEN 1 AND 32),
  assumption_text TEXT NOT NULL CHECK (length(assumption_text) BETWEEN 1 AND 4000),
  UNIQUE (proposal_id, revision, assumption_order),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS proposal_coordinate_framings (
  framing_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  framing_order INTEGER NOT NULL CHECK (framing_order BETWEEN 1 AND 32),
  coordinate_key_version TEXT NOT NULL CHECK (coordinate_key_version = 'cintamani.coordinate-key.v1'),
  coordinate_key TEXT NOT NULL CHECK (length(coordinate_key) BETWEEN 1 AND 1000),
  validation_generation TEXT NOT NULL CHECK (length(validation_generation) BETWEEN 1 AND 160),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 120),
  material_id TEXT NOT NULL CHECK (length(material_id) BETWEEN 1 AND 120),
  mechanism_id TEXT NOT NULL CHECK (length(mechanism_id) BETWEEN 1 AND 120),
  interface_id TEXT NOT NULL CHECK (length(interface_id) BETWEEN 1 AND 120),
  coordinate_classification TEXT NOT NULL CHECK (coordinate_classification IN ('admitted-cell', 'gap')),
  cell_id TEXT,
  framing_rationale TEXT NOT NULL CHECK (length(framing_rationale) BETWEEN 1 AND 4000),
  UNIQUE (proposal_id, revision, framing_order),
  UNIQUE (proposal_id, revision, coordinate_key),
  CHECK (
    (coordinate_classification = 'admitted-cell' AND cell_id IS NOT NULL)
    OR (coordinate_classification = 'gap' AND cell_id IS NULL)
  ),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS conjecture_relations (
  relation_id TEXT PRIMARY KEY,
  source_proposal_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  target_proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  relation_kind TEXT NOT NULL CHECK (relation_kind IN (
    'rival-to', 'reclassifies', 'equivalent-to', 'incompatible-with',
    'supersedes', 'addresses-same-problem'
  )),
  relation_claim TEXT NOT NULL CHECK (length(relation_claim) BETWEEN 1 AND 12000),
  relation_scope TEXT NOT NULL CHECK (length(relation_scope) BETWEEN 1 AND 4000),
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (source_proposal_id, source_revision, target_proposal_id, target_revision, relation_kind),
  CHECK (source_proposal_id != target_proposal_id OR source_revision != target_revision),
  FOREIGN KEY (source_proposal_id, source_revision)
    REFERENCES proposal_revisions(proposal_id, revision),
  FOREIGN KEY (target_proposal_id, target_revision)
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS research_topic_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  open_problem TEXT NOT NULL CHECK (length(open_problem) BETWEEN 1 AND 12000),
  why_open TEXT NOT NULL CHECK (length(why_open) BETWEEN 1 AND 12000),
  topic_scope TEXT NOT NULL CHECK (length(topic_scope) BETWEEN 1 AND 4000),
  next_discriminating_criticism_or_test TEXT NOT NULL
    CHECK (length(next_discriminating_criticism_or_test) BETWEEN 1 AND 12000),
  non_claims TEXT NOT NULL CHECK (length(non_claims) BETWEEN 1 AND 12000),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS research_topic_loci (
  topic_locus_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  locus_order INTEGER NOT NULL CHECK (locus_order BETWEEN 1 AND 32),
  locus_kind TEXT NOT NULL CHECK (locus_kind IN (
    'theoretical', 'simulation', 'physical-material', 'mechanism',
    'observation', 'control-resource', 'experimental', 'ontology'
  )),
  UNIQUE (proposal_id, revision, locus_order),
  UNIQUE (proposal_id, revision, locus_kind),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS research_topic_origins (
  topic_origin_id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  origin_order INTEGER NOT NULL CHECK (origin_order BETWEEN 1 AND 32),
  origin_kind TEXT NOT NULL CHECK (origin_kind IN (
    'canonical-problem-version', 'canonical-conjecture-version',
    'public-explanatory-conjecture-revision'
  )),
  canonical_problem_version_id TEXT,
  canonical_conjecture_version_id TEXT,
  target_proposal_id TEXT,
  target_revision INTEGER CHECK (target_revision IS NULL OR target_revision >= 1),
  relationship TEXT NOT NULL CHECK (relationship IN (
    'derived-from', 'motivated-by', 'criticizes', 'tests'
  )),
  origin_rationale TEXT NOT NULL CHECK (length(origin_rationale) BETWEEN 1 AND 4000),
  UNIQUE (proposal_id, revision, origin_order),
  CHECK (
    (origin_kind='canonical-problem-version'
      AND canonical_problem_version_id IS NOT NULL
      AND canonical_conjecture_version_id IS NULL
      AND target_proposal_id IS NULL AND target_revision IS NULL)
    OR
    (origin_kind='canonical-conjecture-version'
      AND canonical_conjecture_version_id IS NOT NULL
      AND canonical_problem_version_id IS NULL
      AND target_proposal_id IS NULL AND target_revision IS NULL)
    OR
    (origin_kind='public-explanatory-conjecture-revision'
      AND canonical_problem_version_id IS NULL
      AND canonical_conjecture_version_id IS NULL
      AND target_proposal_id IS NOT NULL AND target_revision IS NOT NULL)
  ),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision),
  FOREIGN KEY (target_proposal_id, target_revision)
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS research_topic_relations (
  topic_relation_id TEXT PRIMARY KEY,
  source_proposal_id TEXT NOT NULL,
  source_revision INTEGER NOT NULL,
  target_proposal_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  relation_kind TEXT NOT NULL CHECK (relation_kind IN (
    'depends-on', 'rival-to', 'complements', 'refines',
    'reclassifies', 'addresses-same-problem'
  )),
  relation_claim TEXT NOT NULL CHECK (length(relation_claim) BETWEEN 1 AND 12000),
  relation_scope TEXT NOT NULL CHECK (length(relation_scope) BETWEEN 1 AND 4000),
  author_account_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (source_proposal_id != target_proposal_id OR source_revision != target_revision),
  UNIQUE (source_proposal_id, source_revision, target_proposal_id, target_revision, relation_kind),
  FOREIGN KEY (source_proposal_id, source_revision)
    REFERENCES proposal_revisions(proposal_id, revision),
  FOREIGN KEY (target_proposal_id, target_revision)
    REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE INDEX IF NOT EXISTS proposal_coordinate_framings_coordinate
ON proposal_coordinate_framings(coordinate_key, validation_generation);
CREATE INDEX IF NOT EXISTS conjecture_relations_source
ON conjecture_relations(source_proposal_id, source_revision, relation_id);
CREATE INDEX IF NOT EXISTS conjecture_relations_target
ON conjecture_relations(target_proposal_id, target_revision, relation_id);
CREATE INDEX IF NOT EXISTS research_topic_loci_filter
ON research_topic_loci(locus_kind, proposal_id, revision);
CREATE INDEX IF NOT EXISTS research_topic_origins_canonical_problem
ON research_topic_origins(canonical_problem_version_id, proposal_id, revision);
CREATE INDEX IF NOT EXISTS research_topic_origins_canonical_conjecture
ON research_topic_origins(canonical_conjecture_version_id, proposal_id, revision);
CREATE INDEX IF NOT EXISTS research_topic_origins_public_conjecture
ON research_topic_origins(target_proposal_id, target_revision, proposal_id, revision);
CREATE INDEX IF NOT EXISTS research_topic_relations_source
ON research_topic_relations(source_proposal_id, source_revision, topic_relation_id);
CREATE INDEX IF NOT EXISTS research_topic_relations_target
ON research_topic_relations(target_proposal_id, target_revision, topic_relation_id);

CREATE VIEW proposal_revision_detail_counts AS
SELECT
  r.proposal_id,
  r.revision,
  p.proposal_kind,
  EXISTS(SELECT 1 FROM theoretical_model_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM physical_material_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM physical_mechanism_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM observation_interface_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM existing_member_assessment_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM existing_member_correction_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM ontology_change_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM explanatory_conjecture_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    + EXISTS(SELECT 1 FROM research_topic_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    AS detail_count,
  CASE p.proposal_kind
    WHEN 'theoretical-model-member' THEN EXISTS(SELECT 1 FROM theoretical_model_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'physical-material-member' THEN EXISTS(SELECT 1 FROM physical_material_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'physical-calculation-mechanism-member' THEN EXISTS(SELECT 1 FROM physical_mechanism_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'observation-interface-member' THEN EXISTS(SELECT 1 FROM observation_interface_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'existing-member-assessment' THEN EXISTS(SELECT 1 FROM existing_member_assessment_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'existing-member-correction' THEN EXISTS(SELECT 1 FROM existing_member_correction_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'ontology-change' THEN EXISTS(SELECT 1 FROM ontology_change_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'explanatory-conjecture' THEN EXISTS(SELECT 1 FROM explanatory_conjecture_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'research-topic' THEN EXISTS(SELECT 1 FROM research_topic_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    ELSE 0
  END AS matching_detail_count
FROM proposal_revisions r JOIN proposals p USING (proposal_id);

CREATE VIEW proposal_cache_drift AS
SELECT p.proposal_id, 'current-revision' AS drift_kind
FROM proposals p
WHERE p.current_revision IS NOT (SELECT MAX(r.revision) FROM proposal_revisions r WHERE r.proposal_id=p.proposal_id)
UNION ALL
SELECT p.proposal_id, 'current-state-sequence'
FROM proposals p
WHERE p.current_state_event_sequence IS NOT (
  SELECT MAX(e.event_sequence) FROM proposal_state_events e WHERE e.proposal_id=p.proposal_id
)
UNION ALL
SELECT p.proposal_id, 'current-state-value'
FROM proposals p
WHERE p.current_admin_state IS NOT (
  SELECT e.to_state FROM proposal_state_events e
  WHERE e.proposal_id=p.proposal_id ORDER BY e.event_sequence DESC LIMIT 1
);

CREATE VIEW public_proposal_summaries AS
SELECT p.proposal_id, p.proposal_kind, p.created_at, p.current_revision,
       p.current_admin_state, p.current_state_event_sequence, r.title, r.summary,
       profile.github_login, profile.github_profile_url, profile.github_avatar_url,
       profile.principal_kind, profile.public_pseudonym,
       p.parent_proposal_id, p.parent_revision
FROM proposals p
JOIN proposal_revisions r ON r.proposal_id=p.proposal_id AND r.revision=p.current_revision
JOIN public_contributor_profiles profile ON profile.principal_id=p.author_account_id
WHERE NOT EXISTS (
  SELECT 1 FROM current_listing_moderation visibility
  WHERE visibility.target_kind='proposal-revision'
    AND visibility.target_proposal_id=p.proposal_id
    AND visibility.target_revision=p.current_revision
    AND visibility.listing_visibility='hidden'
);

CREATE VIEW public_schema_violations AS
SELECT 'proposal-cache-drift' AS violation_kind, proposal_id AS record_id FROM proposal_cache_drift
UNION ALL
SELECT 'proposal-detail-cardinality', proposal_id || ':' || revision
FROM proposal_revision_detail_counts WHERE detail_count != 1 OR matching_detail_count != 1
UNION ALL
SELECT 'proposal-missing-state', proposal_id FROM proposals
WHERE current_state_event_sequence IS NULL OR current_admin_state IS NULL
UNION ALL
SELECT 'explanatory-conjecture-missing-assumption', r.proposal_id || ':' || r.revision
FROM proposal_revisions r JOIN proposals p USING (proposal_id)
WHERE p.proposal_kind='explanatory-conjecture'
  AND NOT EXISTS (
    SELECT 1 FROM explanatory_conjecture_assumptions a
    WHERE a.proposal_id=r.proposal_id AND a.revision=r.revision
  )
UNION ALL
SELECT violation_kind, record_id
FROM (
  SELECT 'research-topic-missing-locus' AS violation_kind, r.proposal_id || ':' || r.revision AS record_id
  FROM proposal_revisions r JOIN proposals p USING (proposal_id)
  WHERE p.proposal_kind='research-topic'
    AND NOT EXISTS (
      SELECT 1 FROM research_topic_loci l
      WHERE l.proposal_id=r.proposal_id AND l.revision=r.revision
    )
  UNION ALL
  SELECT 'research-topic-missing-origin', r.proposal_id || ':' || r.revision
  FROM proposal_revisions r JOIN proposals p USING (proposal_id)
  WHERE p.proposal_kind='research-topic'
    AND NOT EXISTS (
      SELECT 1 FROM research_topic_origins o
      WHERE o.proposal_id=r.proposal_id AND o.revision=r.revision
    )
) AS research_topic_violations;

CREATE TRIGGER proposals_identity_immutable
BEFORE UPDATE ON proposals
WHEN OLD.proposal_kind != NEW.proposal_kind
  OR OLD.author_account_id != NEW.author_account_id
  OR OLD.parent_proposal_id IS NOT NEW.parent_proposal_id
  OR OLD.parent_revision IS NOT NEW.parent_revision
  OR OLD.created_at != NEW.created_at
BEGIN SELECT RAISE(ABORT, 'proposal identity is immutable'); END;
CREATE TRIGGER proposals_no_delete BEFORE DELETE ON proposals
BEGIN SELECT RAISE(ABORT, 'public proposals cannot be deleted'); END;

CREATE TRIGGER proposal_revisions_require_submitted BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id=NEW.proposal_id) != 'submitted'
BEGIN SELECT RAISE(ABORT, 'revisions are allowed only while submitted'); END;
CREATE TRIGGER proposal_revisions_require_contiguous BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id=NEW.proposal_id)='submitted'
 AND NEW.revision != COALESCE((SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id=NEW.proposal_id),0)+1
BEGIN SELECT RAISE(ABORT, 'proposal revisions must be contiguous'); END;
CREATE TRIGGER proposal_revisions_require_author BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id=NEW.proposal_id)='submitted'
  AND NEW.revision=COALESCE((SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id=NEW.proposal_id),0)+1
  AND NEW.author_account_id!=(SELECT author_account_id FROM proposals WHERE proposal_id=NEW.proposal_id)
  AND NOT EXISTS (
    SELECT 1 FROM current_principal_identity_links link
    WHERE (link.github_principal_id=(SELECT author_account_id FROM proposals WHERE proposal_id=NEW.proposal_id)
           AND link.wallet_principal_id=NEW.author_account_id)
       OR (link.wallet_principal_id=(SELECT author_account_id FROM proposals WHERE proposal_id=NEW.proposal_id)
           AND link.github_principal_id=NEW.author_account_id)
  )
BEGIN SELECT RAISE(ABORT, 'only the proposal author or current direct counterpart may revise while submitted'); END;
CREATE TRIGGER proposal_revisions_update_cache AFTER INSERT ON proposal_revisions
BEGIN UPDATE proposals SET current_revision=NEW.revision WHERE proposal_id=NEW.proposal_id; END;

CREATE TRIGGER proposal_state_events_require_contiguous BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence != COALESCE((SELECT current_state_event_sequence FROM proposals WHERE proposal_id=NEW.proposal_id),0)+1
BEGIN SELECT RAISE(ABORT, 'proposal state events must be contiguous'); END;
CREATE TRIGGER proposal_state_events_require_initial_submitted BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence=COALESCE((SELECT current_state_event_sequence FROM proposals WHERE proposal_id=NEW.proposal_id),0)+1
 AND NEW.event_sequence=1 AND (NEW.from_state IS NOT NULL OR NEW.to_state!='submitted')
BEGIN SELECT RAISE(ABORT, 'first proposal state must be submitted'); END;
CREATE TRIGGER proposal_state_events_require_current_from_state BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence=COALESCE((SELECT current_state_event_sequence FROM proposals WHERE proposal_id=NEW.proposal_id),0)+1
 AND NEW.event_sequence>1 AND NEW.from_state IS NOT (SELECT current_admin_state FROM proposals WHERE proposal_id=NEW.proposal_id)
BEGIN SELECT RAISE(ABORT, 'proposal state from_state does not match current state'); END;
CREATE TRIGGER proposal_state_events_require_allowed_transition BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence=COALESCE((SELECT current_state_event_sequence FROM proposals WHERE proposal_id=NEW.proposal_id),0)+1
 AND NEW.event_sequence>1 AND NEW.from_state IS (SELECT current_admin_state FROM proposals WHERE proposal_id=NEW.proposal_id)
 AND NOT EXISTS (SELECT 1 FROM allowed_proposal_state_transitions WHERE from_state=NEW.from_state AND to_state=NEW.to_state)
BEGIN SELECT RAISE(ABORT, 'proposal state transition is not allowed'); END;
CREATE TRIGGER proposal_state_events_update_cache AFTER INSERT ON proposal_state_events
BEGIN
  UPDATE proposals SET current_state_event_sequence=NEW.event_sequence,current_admin_state=NEW.to_state
  WHERE proposal_id=NEW.proposal_id;
END;

CREATE TRIGGER theoretical_model_details_kind BEFORE INSERT ON theoretical_model_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='theoretical-model-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER physical_material_details_kind BEFORE INSERT ON physical_material_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='physical-material-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER physical_mechanism_details_kind BEFORE INSERT ON physical_mechanism_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='physical-calculation-mechanism-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER observation_interface_details_kind BEFORE INSERT ON observation_interface_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='observation-interface-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER existing_member_assessment_details_kind BEFORE INSERT ON existing_member_assessment_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='existing-member-assessment'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER existing_member_correction_details_kind BEFORE INSERT ON existing_member_correction_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='existing-member-correction'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER ontology_change_details_kind BEFORE INSERT ON ontology_change_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='ontology-change'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER explanatory_conjecture_details_kind BEFORE INSERT ON explanatory_conjecture_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='explanatory-conjecture'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER research_topic_details_kind BEFORE INSERT ON research_topic_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='research-topic'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER explanatory_conjecture_assumptions_kind BEFORE INSERT ON explanatory_conjecture_assumptions
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='explanatory-conjecture'
BEGIN SELECT RAISE(ABORT, 'assumptions require an explanatory conjecture revision'); END;
CREATE TRIGGER proposal_coordinate_framings_kind BEFORE INSERT ON proposal_coordinate_framings
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')
               NOT IN ('explanatory-conjecture', 'research-topic')
BEGIN SELECT RAISE(ABORT, 'coordinate framings require a conjecture or research-topic revision'); END;
CREATE TRIGGER research_topic_loci_kind BEFORE INSERT ON research_topic_loci
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='research-topic'
BEGIN SELECT RAISE(ABORT, 'topic loci require an exact research-topic revision'); END;
CREATE TRIGGER research_topic_origins_kind BEFORE INSERT ON research_topic_origins
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='research-topic'
  OR (NEW.origin_kind='public-explanatory-conjecture-revision' AND
      COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.target_proposal_id),'')!='explanatory-conjecture')
BEGIN SELECT RAISE(ABORT, 'topic origins require an exact topic and compatible exact origin'); END;
CREATE TRIGGER research_topic_relations_exact_kinds BEFORE INSERT ON research_topic_relations
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.source_proposal_id),'')!='research-topic'
  OR COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.target_proposal_id),'')!='research-topic'
BEGIN SELECT RAISE(ABORT, 'topic relations require exact research-topic revisions'); END;
CREATE TRIGGER conjecture_relations_exact_kinds BEFORE INSERT ON conjecture_relations
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.source_proposal_id),'')!='explanatory-conjecture'
  OR COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.target_proposal_id),'')!='explanatory-conjecture'
BEGIN SELECT RAISE(ABORT, 'conjecture relations require exact explanatory-conjecture revisions'); END;
CREATE TRIGGER criticisms_exact_focus BEFORE INSERT ON criticisms
WHEN (NEW.focus_kind IN (
        'problem-statement','explanatory-claim','essential-mechanism',
        'explanation-scope','failure-condition','assumption','coordinate-framing','conjecture-relation'
      ) AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='explanatory-conjecture')
   OR (NEW.focus_kind IN (
        'topic-open-problem','topic-why-open','topic-scope','topic-next-test',
        'topic-non-claims','topic-locus','topic-origin','topic-coordinate-framing','topic-relation'
      ) AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='research-topic')
   OR (NEW.focus_kind='assumption' AND NOT EXISTS (
        SELECT 1 FROM explanatory_conjecture_assumptions a
        WHERE a.assumption_id=NEW.focus_ref AND a.proposal_id=NEW.proposal_id AND a.revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='coordinate-framing' AND NOT EXISTS (
        SELECT 1 FROM proposal_coordinate_framings f
        WHERE f.framing_id=NEW.focus_ref AND f.proposal_id=NEW.proposal_id AND f.revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='conjecture-relation' AND NOT EXISTS (
        SELECT 1 FROM conjecture_relations rel
        WHERE rel.relation_id=NEW.focus_ref
          AND rel.source_proposal_id=NEW.proposal_id AND rel.source_revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='topic-locus' AND NOT EXISTS (
        SELECT 1 FROM research_topic_loci l
        WHERE l.topic_locus_id=NEW.focus_ref
          AND l.proposal_id=NEW.proposal_id AND l.revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='topic-origin' AND NOT EXISTS (
        SELECT 1 FROM research_topic_origins o
        WHERE o.topic_origin_id=NEW.focus_ref
          AND o.proposal_id=NEW.proposal_id AND o.revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='topic-coordinate-framing' AND NOT EXISTS (
        SELECT 1 FROM proposal_coordinate_framings f
        WHERE f.framing_id=NEW.focus_ref
          AND f.proposal_id=NEW.proposal_id AND f.revision=NEW.target_revision
      ))
   OR (NEW.focus_kind='topic-relation' AND NOT EXISTS (
        SELECT 1 FROM research_topic_relations rel
        WHERE rel.topic_relation_id=NEW.focus_ref
          AND rel.source_proposal_id=NEW.proposal_id AND rel.source_revision=NEW.target_revision
      ))
BEGIN SELECT RAISE(ABORT, 'criticism focus must target an exact item in the exact proposal revision'); END;

CREATE TRIGGER proposal_payment_sources_require_author BEFORE INSERT ON proposal_payment_sources
WHEN NEW.payer_principal_id IS NOT (SELECT author_account_id FROM proposals WHERE proposal_id=NEW.proposal_id)
BEGIN SELECT RAISE(ABORT, 'x402 proposal source payer must be the proposal author'); END;
CREATE TRIGGER proposal_payment_sources_require_finalizing BEFORE INSERT ON proposal_payment_sources
WHEN (SELECT current_state FROM x402_payment_intents WHERE payment_intent_id=NEW.payment_intent_id)!='finalizing'
  OR (SELECT current_state FROM x402_retry_entitlements WHERE retry_entitlement_id=NEW.retry_entitlement_id)!='available'
BEGIN SELECT RAISE(ABORT, 'x402 proposal source requires finalizing intent and available entitlement'); END;

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
CREATE TRIGGER explanatory_conjecture_details_no_update BEFORE UPDATE ON explanatory_conjecture_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER explanatory_conjecture_details_no_delete BEFORE DELETE ON explanatory_conjecture_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER explanatory_conjecture_assumptions_no_update BEFORE UPDATE ON explanatory_conjecture_assumptions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER explanatory_conjecture_assumptions_no_delete BEFORE DELETE ON explanatory_conjecture_assumptions BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_coordinate_framings_no_update BEFORE UPDATE ON proposal_coordinate_framings BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_coordinate_framings_no_delete BEFORE DELETE ON proposal_coordinate_framings BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER conjecture_relations_no_update BEFORE UPDATE ON conjecture_relations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER conjecture_relations_no_delete BEFORE DELETE ON conjecture_relations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_details_no_update BEFORE UPDATE ON research_topic_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_details_no_delete BEFORE DELETE ON research_topic_details BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_loci_no_update BEFORE UPDATE ON research_topic_loci BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_loci_no_delete BEFORE DELETE ON research_topic_loci BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_origins_no_update BEFORE UPDATE ON research_topic_origins BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_origins_no_delete BEFORE DELETE ON research_topic_origins BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_relations_no_update BEFORE UPDATE ON research_topic_relations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER research_topic_relations_no_delete BEFORE DELETE ON research_topic_relations BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_references_no_update BEFORE UPDATE ON proposal_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_references_no_delete BEFORE DELETE ON proposal_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
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
CREATE TRIGGER criticism_references_no_update BEFORE UPDATE ON criticism_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticism_references_no_delete BEFORE DELETE ON criticism_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER scoped_test_reports_no_update BEFORE UPDATE ON scoped_test_reports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER scoped_test_reports_no_delete BEFORE DELETE ON scoped_test_reports BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER test_report_references_no_update BEFORE UPDATE ON test_report_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER test_report_references_no_delete BEFORE DELETE ON test_report_references BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
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
CREATE TRIGGER proposal_payment_sources_no_update BEFORE UPDATE ON proposal_payment_sources BEGIN SELECT RAISE(ABORT, 'immutable x402 proposal payment source'); END;
CREATE TRIGGER proposal_payment_sources_no_delete BEFORE DELETE ON proposal_payment_sources BEGIN SELECT RAISE(ABORT, 'immutable x402 proposal payment source'); END;

UPDATE public_schema_metadata SET metadata_value='6' WHERE metadata_key='schema_version';
