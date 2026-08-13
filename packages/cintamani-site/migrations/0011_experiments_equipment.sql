-- Proposed experiments and capability-based equipment type proposals.
-- This migration extends the public proposal envelope only. It never admits a
-- scientific result, creates a run, populates production D1, or turns an
-- illustrative fixture into evidence.
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
DROP TRIGGER IF EXISTS proposal_revisions_no_update;
DROP TRIGGER IF EXISTS proposal_revisions_no_delete;
DROP TRIGGER IF EXISTS criticisms_exact_focus;
DROP TRIGGER IF EXISTS criticisms_no_update;
DROP TRIGGER IF EXISTS criticisms_no_delete;
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
DROP TRIGGER IF EXISTS explanatory_conjecture_details_kind;
DROP TRIGGER IF EXISTS research_topic_details_kind;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_kind;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_kind;
DROP TRIGGER IF EXISTS research_topic_loci_kind;
DROP TRIGGER IF EXISTS research_topic_origins_kind;
DROP TRIGGER IF EXISTS research_topic_relations_exact_kinds;
DROP TRIGGER IF EXISTS conjecture_relations_exact_kinds;
DROP TRIGGER IF EXISTS proposal_payment_sources_require_author;
DROP TRIGGER IF EXISTS proposed_experiment_details_kind;
DROP TRIGGER IF EXISTS proposed_experiment_details_no_update;
DROP TRIGGER IF EXISTS proposed_experiment_details_no_delete;
DROP TRIGGER IF EXISTS equipment_type_proposal_details_kind;
DROP TRIGGER IF EXISTS equipment_type_proposal_details_no_update;
DROP TRIGGER IF EXISTS equipment_type_proposal_details_no_delete;

-- The core proposal tables have many immutable child records. Hold and restore
-- those rows around the constraint-changing cutover; relying on
-- PRAGMA foreign_keys=OFF is not safe inside Wrangler D1's transaction.
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
DROP TRIGGER IF EXISTS proposal_evidence_no_update;
DROP TRIGGER IF EXISTS proposal_evidence_no_delete;
DROP TRIGGER IF EXISTS proposal_state_events_no_update;
DROP TRIGGER IF EXISTS proposal_state_events_no_delete;
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
DROP TRIGGER IF EXISTS explanatory_conjecture_details_no_update;
DROP TRIGGER IF EXISTS explanatory_conjecture_details_no_delete;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_no_update;
DROP TRIGGER IF EXISTS explanatory_conjecture_assumptions_no_delete;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_no_update;
DROP TRIGGER IF EXISTS proposal_coordinate_framings_no_delete;
DROP TRIGGER IF EXISTS conjecture_relations_no_update;
DROP TRIGGER IF EXISTS conjecture_relations_no_delete;
DROP TRIGGER IF EXISTS research_topic_details_no_update;
DROP TRIGGER IF EXISTS research_topic_details_no_delete;
DROP TRIGGER IF EXISTS research_topic_loci_no_update;
DROP TRIGGER IF EXISTS research_topic_loci_no_delete;
DROP TRIGGER IF EXISTS research_topic_origins_no_update;
DROP TRIGGER IF EXISTS research_topic_origins_no_delete;
DROP TRIGGER IF EXISTS research_topic_relations_no_update;
DROP TRIGGER IF EXISTS research_topic_relations_no_delete;

-- A persisted prefix is a valid retry input. The holding copies are created
-- once and remain the immutable source for the rest of the cutover.
CREATE TABLE IF NOT EXISTS _v7_hold_proposals AS SELECT * FROM proposals;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_revisions AS SELECT * FROM proposal_revisions;
CREATE TABLE IF NOT EXISTS _v7_hold_criticisms AS SELECT * FROM criticisms;
CREATE TABLE IF NOT EXISTS _v7_hold_theoretical_model_details AS SELECT * FROM theoretical_model_details;
CREATE TABLE IF NOT EXISTS _v7_hold_physical_material_details AS SELECT * FROM physical_material_details;
CREATE TABLE IF NOT EXISTS _v7_hold_physical_mechanism_details AS SELECT * FROM physical_mechanism_details;
CREATE TABLE IF NOT EXISTS _v7_hold_observation_interface_details AS SELECT * FROM observation_interface_details;
CREATE TABLE IF NOT EXISTS _v7_hold_existing_member_assessment_details AS SELECT * FROM existing_member_assessment_details;
CREATE TABLE IF NOT EXISTS _v7_hold_existing_member_correction_details AS SELECT * FROM existing_member_correction_details;
CREATE TABLE IF NOT EXISTS _v7_hold_ontology_change_details AS SELECT * FROM ontology_change_details;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_references AS SELECT * FROM proposal_references;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_evidence AS SELECT * FROM proposal_evidence;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_state_events AS SELECT * FROM proposal_state_events;
CREATE TABLE IF NOT EXISTS _v7_hold_criticism_replies AS SELECT * FROM criticism_replies;
CREATE TABLE IF NOT EXISTS _v7_hold_criticism_references AS SELECT * FROM criticism_references;
CREATE TABLE IF NOT EXISTS _v7_hold_scoped_test_reports AS SELECT * FROM scoped_test_reports;
CREATE TABLE IF NOT EXISTS _v7_hold_test_report_references AS SELECT * FROM test_report_references;
CREATE TABLE IF NOT EXISTS _v7_hold_competing_interpretations AS SELECT * FROM competing_interpretations;
CREATE TABLE IF NOT EXISTS _v7_hold_moderation_actions AS SELECT * FROM moderation_actions;
CREATE TABLE IF NOT EXISTS _v7_hold_appeals AS SELECT * FROM appeals;
CREATE TABLE IF NOT EXISTS _v7_hold_appeal_state_events AS SELECT * FROM appeal_state_events;
CREATE TABLE IF NOT EXISTS _v7_hold_maintainer_exports AS SELECT * FROM maintainer_exports;
CREATE TABLE IF NOT EXISTS _v7_hold_admission_links AS SELECT * FROM admission_links;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_payment_sources AS SELECT * FROM proposal_payment_sources;
CREATE TABLE IF NOT EXISTS _v7_hold_explanatory_conjecture_details AS SELECT * FROM explanatory_conjecture_details;
CREATE TABLE IF NOT EXISTS _v7_hold_explanatory_conjecture_assumptions AS SELECT * FROM explanatory_conjecture_assumptions;
CREATE TABLE IF NOT EXISTS _v7_hold_proposal_coordinate_framings AS SELECT * FROM proposal_coordinate_framings;
CREATE TABLE IF NOT EXISTS _v7_hold_conjecture_relations AS SELECT * FROM conjecture_relations;
CREATE TABLE IF NOT EXISTS _v7_hold_research_topic_details AS SELECT * FROM research_topic_details;
CREATE TABLE IF NOT EXISTS _v7_hold_research_topic_loci AS SELECT * FROM research_topic_loci;
CREATE TABLE IF NOT EXISTS _v7_hold_research_topic_origins AS SELECT * FROM research_topic_origins;
CREATE TABLE IF NOT EXISTS _v7_hold_research_topic_relations AS SELECT * FROM research_topic_relations;

DROP TABLE IF EXISTS _v7_criticisms;
DROP TABLE IF EXISTS _v7_proposal_revisions;
DROP TABLE IF EXISTS _v7_proposals;

CREATE TABLE _v7_proposals (
  proposal_id TEXT PRIMARY KEY,
  proposal_kind TEXT NOT NULL CHECK (proposal_kind IN (
    'theoretical-model-member', 'physical-material-member',
    'physical-calculation-mechanism-member', 'observation-interface-member',
    'existing-member-assessment', 'existing-member-correction', 'ontology-change',
    'explanatory-conjecture', 'research-topic', 'proposed-experiment',
    'equipment-type-proposal'
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
    REFERENCES _v7_proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE _v7_proposal_revisions (
  proposal_id TEXT NOT NULL REFERENCES _v7_proposals(proposal_id),
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

CREATE TABLE _v7_criticisms (
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
    'topic-origin', 'topic-coordinate-framing', 'topic-relation',
    'experiment-target', 'experiment-protocol', 'experiment-control',
    'experiment-observable', 'experiment-calibration', 'experiment-repetition',
    'experiment-uncertainty', 'experiment-criterion', 'experiment-confound',
    'experiment-raw-artifact', 'experiment-nonclaim', 'experiment-dependency',
    'experiment-relation', 'experiment-equipment-requirement',
    'equipment-capability', 'equipment-operating-limit', 'equipment-calibration',
    'equipment-safety', 'equipment-interface', 'equipment-nonclaim', 'other-explicit'
  )),
  focus_ref TEXT,
  UNIQUE (criticism_id, proposal_id, target_revision),
  CHECK (
    (focus_kind IN (
      'assumption', 'coordinate-framing', 'conjecture-relation', 'topic-locus',
      'topic-origin', 'topic-coordinate-framing', 'topic-relation',
      'experiment-target', 'experiment-protocol', 'experiment-control',
      'experiment-observable', 'experiment-calibration', 'experiment-repetition',
      'experiment-uncertainty', 'experiment-criterion', 'experiment-confound',
      'experiment-raw-artifact', 'experiment-nonclaim', 'experiment-dependency',
      'experiment-relation', 'experiment-equipment-requirement',
      'equipment-capability', 'equipment-operating-limit', 'equipment-calibration',
      'equipment-safety', 'equipment-interface', 'equipment-nonclaim'
    ) AND focus_ref IS NOT NULL)
    OR (focus_kind NOT IN (
      'assumption', 'coordinate-framing', 'conjecture-relation', 'topic-locus',
      'topic-origin', 'topic-coordinate-framing', 'topic-relation',
      'experiment-target', 'experiment-protocol', 'experiment-control',
      'experiment-observable', 'experiment-calibration', 'experiment-repetition',
      'experiment-uncertainty', 'experiment-criterion', 'experiment-confound',
      'experiment-raw-artifact', 'experiment-nonclaim', 'experiment-dependency',
      'experiment-relation', 'experiment-equipment-requirement',
      'equipment-capability', 'equipment-operating-limit', 'equipment-calibration',
      'equipment-safety', 'equipment-interface', 'equipment-nonclaim'
    ) AND focus_ref IS NULL)
  ),
  FOREIGN KEY (proposal_id, target_revision)
    REFERENCES _v7_proposal_revisions(proposal_id, revision)
) STRICT;

INSERT OR IGNORE INTO _v7_proposals SELECT * FROM _v7_hold_proposals;
INSERT OR IGNORE INTO _v7_proposal_revisions SELECT * FROM _v7_hold_proposal_revisions;
INSERT OR IGNORE INTO _v7_criticisms (
  criticism_id, proposal_id, target_revision, author_account_id, title,
  criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
)
SELECT criticism_id, proposal_id, target_revision, author_account_id, title,
       criticism, scope, source_timestamp, recorded_at, focus_kind, focus_ref
FROM _v7_hold_criticisms;

-- Empty every referencing table before replacing the constrained core tables.
-- The hold copies above make this lossless and make a replay after a persisted
-- prefix deterministic.
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
DELETE FROM research_topic_relations;
DELETE FROM research_topic_origins;
DELETE FROM research_topic_loci;
DELETE FROM research_topic_details;
DELETE FROM conjecture_relations;
DELETE FROM proposal_coordinate_framings;
DELETE FROM explanatory_conjecture_assumptions;
DELETE FROM explanatory_conjecture_details;
DELETE FROM theoretical_model_details;
DELETE FROM physical_material_details;
DELETE FROM physical_mechanism_details;
DELETE FROM observation_interface_details;
DELETE FROM existing_member_assessment_details;
DELETE FROM existing_member_correction_details;
DELETE FROM ontology_change_details;
DELETE FROM proposal_state_events;
UPDATE proposals SET parent_proposal_id = NULL, parent_revision = NULL
WHERE parent_proposal_id IS NOT NULL;
DELETE FROM proposal_revisions;
DELETE FROM proposals;

DROP TABLE IF EXISTS criticisms;
DROP TABLE IF EXISTS proposal_revisions;
DROP TABLE IF EXISTS proposals;
ALTER TABLE _v7_proposals RENAME TO proposals;
ALTER TABLE _v7_proposal_revisions RENAME TO proposal_revisions;
ALTER TABLE _v7_criticisms RENAME TO criticisms;

CREATE TABLE IF NOT EXISTS proposed_experiment_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  experiment_id TEXT NOT NULL CHECK (length(experiment_id) BETWEEN 1 AND 160),
  experiment_version INTEGER NOT NULL CHECK (experiment_version > 0),
  experiment_kind TEXT NOT NULL CHECK (experiment_kind IN ('physical', 'simulation', 'analytical', 'hybrid')),
  intent TEXT NOT NULL CHECK (intent IN ('falsification', 'discrimination', 'characterization', 'calibration', 'replication')),
  targets_json TEXT NOT NULL CHECK (json_valid(targets_json)),
  protocols_json TEXT NOT NULL CHECK (json_valid(protocols_json)),
  controls_json TEXT NOT NULL CHECK (json_valid(controls_json)),
  observables_json TEXT NOT NULL CHECK (json_valid(observables_json)),
  calibration_json TEXT NOT NULL CHECK (json_valid(calibration_json)),
  repetitions_json TEXT NOT NULL CHECK (json_valid(repetitions_json)),
  uncertainty_json TEXT NOT NULL CHECK (json_valid(uncertainty_json)),
  criteria_json TEXT NOT NULL CHECK (json_valid(criteria_json)),
  confounds_json TEXT NOT NULL CHECK (json_valid(confounds_json)),
  raw_artifacts_json TEXT NOT NULL CHECK (json_valid(raw_artifacts_json)),
  nonclaims_json TEXT NOT NULL CHECK (json_valid(nonclaims_json)),
  dependencies_json TEXT NOT NULL CHECK (json_valid(dependencies_json)),
  relations_json TEXT NOT NULL CHECK (json_valid(relations_json)),
  equipment_requirements_json TEXT NOT NULL CHECK (json_valid(equipment_requirements_json)),
  topic_links_json TEXT NOT NULL CHECK (json_valid(topic_links_json)),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_type_proposal_details (
  proposal_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  equipment_type_id TEXT NOT NULL CHECK (length(equipment_type_id) BETWEEN 1 AND 160),
  equipment_type_version INTEGER NOT NULL CHECK (equipment_type_version > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 12000),
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
  operating_limits_json TEXT NOT NULL CHECK (json_valid(operating_limits_json)),
  calibrations_json TEXT NOT NULL CHECK (json_valid(calibrations_json)),
  safety_requirements_json TEXT NOT NULL CHECK (json_valid(safety_requirements_json)),
  interface_requirements_json TEXT NOT NULL CHECK (json_valid(interface_requirements_json)),
  nonclaims_json TEXT NOT NULL CHECK (json_valid(nonclaims_json)),
  PRIMARY KEY (proposal_id, revision),
  FOREIGN KEY (proposal_id, revision) REFERENCES proposal_revisions(proposal_id, revision)
) STRICT;

CREATE INDEX IF NOT EXISTS proposed_experiment_kind_intent
  ON proposed_experiment_details(experiment_kind, intent);
CREATE INDEX IF NOT EXISTS proposed_experiment_id_version
  ON proposed_experiment_details(experiment_id, experiment_version);
CREATE INDEX IF NOT EXISTS equipment_type_proposal_id_version
  ON equipment_type_proposal_details(equipment_type_id, equipment_type_version);

CREATE VIEW proposal_revision_detail_counts AS
SELECT r.proposal_id, r.revision, p.proposal_kind,
  EXISTS(SELECT 1 FROM theoretical_model_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM physical_material_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM physical_mechanism_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM observation_interface_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM existing_member_assessment_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM existing_member_correction_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM ontology_change_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM explanatory_conjecture_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM research_topic_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM proposed_experiment_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
  + EXISTS(SELECT 1 FROM equipment_type_proposal_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
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
    WHEN 'proposed-experiment' THEN EXISTS(SELECT 1 FROM proposed_experiment_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
    WHEN 'equipment-type-proposal' THEN EXISTS(SELECT 1 FROM equipment_type_proposal_details d WHERE d.proposal_id=r.proposal_id AND d.revision=r.revision)
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
  AND NOT EXISTS (SELECT 1 FROM explanatory_conjecture_assumptions a WHERE a.proposal_id=r.proposal_id AND a.revision=r.revision)
UNION ALL
SELECT violation_kind, record_id
FROM (
  SELECT 'research-topic-missing-locus' AS violation_kind, r.proposal_id || ':' || r.revision AS record_id
  FROM proposal_revisions r JOIN proposals p USING (proposal_id)
  WHERE p.proposal_kind='research-topic'
    AND NOT EXISTS (SELECT 1 FROM research_topic_loci l WHERE l.proposal_id=r.proposal_id AND l.revision=r.revision)
  UNION ALL
  SELECT 'research-topic-missing-origin', r.proposal_id || ':' || r.revision
  FROM proposal_revisions r JOIN proposals p USING (proposal_id)
  WHERE p.proposal_kind='research-topic'
    AND NOT EXISTS (SELECT 1 FROM research_topic_origins o WHERE o.proposal_id=r.proposal_id AND o.revision=r.revision)
  UNION ALL
  SELECT 'experiment-proposal-missing-decisive-fields', d.proposal_id || ':' || d.revision
  FROM proposed_experiment_details d
  WHERE json_array_length(d.targets_json)=0 OR json_array_length(d.protocols_json)=0
     OR json_array_length(d.observables_json)=0 OR json_array_length(d.criteria_json)=0
     OR NOT EXISTS (SELECT 1 FROM json_each(d.criteria_json) WHERE json_extract(value,'$.criterion_kind')='success')
     OR NOT EXISTS (SELECT 1 FROM json_each(d.criteria_json) WHERE json_extract(value,'$.criterion_kind')='falsifier')
     OR json_array_length(d.nonclaims_json)=0 OR json_array_length(d.equipment_requirements_json)=0
  UNION ALL
  SELECT 'equipment-proposal-missing-capability', d.proposal_id || ':' || d.revision
  FROM equipment_type_proposal_details d
  WHERE json_array_length(d.capabilities_json)=0 OR json_array_length(d.safety_requirements_json)=0
     OR json_array_length(d.nonclaims_json)=0
) AS content_violations;

INSERT OR IGNORE INTO proposal_state_events SELECT * FROM _v7_hold_proposal_state_events;
INSERT OR IGNORE INTO theoretical_model_details SELECT * FROM _v7_hold_theoretical_model_details;
INSERT OR IGNORE INTO physical_material_details SELECT * FROM _v7_hold_physical_material_details;
INSERT OR IGNORE INTO physical_mechanism_details SELECT * FROM _v7_hold_physical_mechanism_details;
INSERT OR IGNORE INTO observation_interface_details SELECT * FROM _v7_hold_observation_interface_details;
INSERT OR IGNORE INTO existing_member_assessment_details SELECT * FROM _v7_hold_existing_member_assessment_details;
INSERT OR IGNORE INTO existing_member_correction_details SELECT * FROM _v7_hold_existing_member_correction_details;
INSERT OR IGNORE INTO ontology_change_details SELECT * FROM _v7_hold_ontology_change_details;
INSERT OR IGNORE INTO explanatory_conjecture_details SELECT * FROM _v7_hold_explanatory_conjecture_details;
INSERT OR IGNORE INTO explanatory_conjecture_assumptions SELECT * FROM _v7_hold_explanatory_conjecture_assumptions;
INSERT OR IGNORE INTO proposal_coordinate_framings SELECT * FROM _v7_hold_proposal_coordinate_framings;
INSERT OR IGNORE INTO conjecture_relations SELECT * FROM _v7_hold_conjecture_relations;
INSERT OR IGNORE INTO research_topic_details SELECT * FROM _v7_hold_research_topic_details;
INSERT OR IGNORE INTO research_topic_loci SELECT * FROM _v7_hold_research_topic_loci;
INSERT OR IGNORE INTO research_topic_origins SELECT * FROM _v7_hold_research_topic_origins;
INSERT OR IGNORE INTO research_topic_relations SELECT * FROM _v7_hold_research_topic_relations;
INSERT OR IGNORE INTO proposal_references SELECT * FROM _v7_hold_proposal_references;
INSERT OR IGNORE INTO proposal_evidence SELECT * FROM _v7_hold_proposal_evidence;
INSERT OR IGNORE INTO proposal_payment_sources SELECT * FROM _v7_hold_proposal_payment_sources;
INSERT OR IGNORE INTO scoped_test_reports SELECT * FROM _v7_hold_scoped_test_reports;
INSERT OR IGNORE INTO test_report_references SELECT * FROM _v7_hold_test_report_references;
INSERT OR IGNORE INTO competing_interpretations SELECT * FROM _v7_hold_competing_interpretations;
INSERT OR IGNORE INTO criticism_replies SELECT * FROM _v7_hold_criticism_replies;
INSERT OR IGNORE INTO criticism_references SELECT * FROM _v7_hold_criticism_references;
INSERT OR IGNORE INTO moderation_actions SELECT * FROM _v7_hold_moderation_actions;
INSERT OR IGNORE INTO appeals SELECT * FROM _v7_hold_appeals;
INSERT OR IGNORE INTO appeal_state_events SELECT * FROM _v7_hold_appeal_state_events;
INSERT OR IGNORE INTO maintainer_exports SELECT * FROM _v7_hold_maintainer_exports;
INSERT OR IGNORE INTO admission_links SELECT * FROM _v7_hold_admission_links;

DROP TABLE IF EXISTS _v7_hold_research_topic_relations;
DROP TABLE IF EXISTS _v7_hold_criticisms;
DROP TABLE IF EXISTS _v7_hold_proposal_revisions;
DROP TABLE IF EXISTS _v7_hold_proposals;
DROP TABLE IF EXISTS _v7_hold_theoretical_model_details;
DROP TABLE IF EXISTS _v7_hold_physical_material_details;
DROP TABLE IF EXISTS _v7_hold_physical_mechanism_details;
DROP TABLE IF EXISTS _v7_hold_observation_interface_details;
DROP TABLE IF EXISTS _v7_hold_existing_member_assessment_details;
DROP TABLE IF EXISTS _v7_hold_existing_member_correction_details;
DROP TABLE IF EXISTS _v7_hold_ontology_change_details;
DROP TABLE IF EXISTS _v7_hold_proposal_references;
DROP TABLE IF EXISTS _v7_hold_proposal_evidence;
DROP TABLE IF EXISTS _v7_hold_proposal_state_events;
DROP TABLE IF EXISTS _v7_hold_criticism_replies;
DROP TABLE IF EXISTS _v7_hold_criticism_references;
DROP TABLE IF EXISTS _v7_hold_scoped_test_reports;
DROP TABLE IF EXISTS _v7_hold_test_report_references;
DROP TABLE IF EXISTS _v7_hold_competing_interpretations;
DROP TABLE IF EXISTS _v7_hold_moderation_actions;
DROP TABLE IF EXISTS _v7_hold_appeals;
DROP TABLE IF EXISTS _v7_hold_appeal_state_events;
DROP TABLE IF EXISTS _v7_hold_maintainer_exports;
DROP TABLE IF EXISTS _v7_hold_admission_links;
DROP TABLE IF EXISTS _v7_hold_proposal_payment_sources;
DROP TABLE IF EXISTS _v7_hold_explanatory_conjecture_details;
DROP TABLE IF EXISTS _v7_hold_explanatory_conjecture_assumptions;
DROP TABLE IF EXISTS _v7_hold_proposal_coordinate_framings;
DROP TABLE IF EXISTS _v7_hold_conjecture_relations;
DROP TABLE IF EXISTS _v7_hold_research_topic_details;
DROP TABLE IF EXISTS _v7_hold_research_topic_loci;
DROP TABLE IF EXISTS _v7_hold_research_topic_origins;
DROP TABLE IF EXISTS _v7_hold_research_topic_relations;

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
CREATE TRIGGER proposal_revisions_no_update BEFORE UPDATE ON proposal_revisions
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_revisions_no_delete BEFORE DELETE ON proposal_revisions
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;

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
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='theoretical-model-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER physical_material_details_kind BEFORE INSERT ON physical_material_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='physical-material-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER physical_mechanism_details_kind BEFORE INSERT ON physical_mechanism_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='physical-calculation-mechanism-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER observation_interface_details_kind BEFORE INSERT ON observation_interface_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='observation-interface-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER existing_member_assessment_details_kind BEFORE INSERT ON existing_member_assessment_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='existing-member-assessment'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER existing_member_correction_details_kind BEFORE INSERT ON existing_member_correction_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='existing-member-correction'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER ontology_change_details_kind BEFORE INSERT ON ontology_change_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='ontology-change'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER explanatory_conjecture_details_kind BEFORE INSERT ON explanatory_conjecture_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='explanatory-conjecture'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER research_topic_details_kind BEFORE INSERT ON research_topic_details
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='research-topic'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;
CREATE TRIGGER explanatory_conjecture_assumptions_kind BEFORE INSERT ON explanatory_conjecture_assumptions
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='explanatory-conjecture'
BEGIN SELECT RAISE(ABORT, 'assumptions require an explanatory conjecture revision'); END;
CREATE TRIGGER proposal_coordinate_framings_kind BEFORE INSERT ON proposal_coordinate_framings
WHEN COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'') NOT IN ('explanatory-conjecture','research-topic')
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
CREATE TRIGGER proposal_payment_sources_require_author BEFORE INSERT ON proposal_payment_sources
WHEN NEW.payer_principal_id IS NOT (SELECT author_account_id FROM proposals WHERE proposal_id=NEW.proposal_id)
BEGIN SELECT RAISE(ABORT, 'x402 proposal source payer must be the proposal author'); END;

CREATE TRIGGER proposed_experiment_details_kind BEFORE INSERT ON proposed_experiment_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='proposed-experiment'
BEGIN SELECT RAISE(ABORT, 'experiment detail requires a proposed-experiment revision'); END;
CREATE TRIGGER proposed_experiment_details_no_update BEFORE UPDATE ON proposed_experiment_details
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposed_experiment_details_no_delete BEFORE DELETE ON proposed_experiment_details
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER equipment_type_proposal_details_kind BEFORE INSERT ON equipment_type_proposal_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING(proposal_id)
               WHERE r.proposal_id=NEW.proposal_id AND r.revision=NEW.revision),'')!='equipment-type-proposal'
BEGIN SELECT RAISE(ABORT, 'equipment detail requires an equipment-type-proposal revision'); END;
CREATE TRIGGER equipment_type_proposal_details_no_update BEFORE UPDATE ON equipment_type_proposal_details
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER equipment_type_proposal_details_no_delete BEFORE DELETE ON equipment_type_proposal_details
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;

CREATE TRIGGER criticisms_exact_focus BEFORE INSERT ON criticisms
WHEN (NEW.focus_kind IN (
        'problem-statement','explanatory-claim','essential-mechanism','explanation-scope','failure-condition',
        'assumption','coordinate-framing','conjecture-relation'
      ) AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='explanatory-conjecture')
   OR (NEW.focus_kind IN (
        'topic-open-problem','topic-why-open','topic-scope','topic-next-test','topic-non-claims',
        'topic-locus','topic-origin','topic-coordinate-framing','topic-relation'
      ) AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='research-topic')
   OR (NEW.focus_kind LIKE 'experiment-%' AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='proposed-experiment')
   OR (NEW.focus_kind LIKE 'equipment-%' AND COALESCE((SELECT proposal_kind FROM proposals WHERE proposal_id=NEW.proposal_id),'')!='equipment-type-proposal')
   OR (NEW.focus_kind='experiment-target' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.targets_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.target_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-protocol' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.protocols_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.protocol_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-control' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.controls_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.control_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-observable' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.observables_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.observable_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-calibration' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.calibration_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.calibration_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-repetition' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision
          AND json_extract(d.repetitions_json,'$.repetition_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-uncertainty' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision
          AND json_extract(d.uncertainty_json,'$.uncertainty_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-criterion' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.criteria_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.criterion_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-confound' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.confounds_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.confound_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-raw-artifact' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.raw_artifacts_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.raw_artifact_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-nonclaim' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.nonclaims_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND x.key=CAST(NEW.focus_ref AS INTEGER)))
   OR (NEW.focus_kind='experiment-dependency' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.dependencies_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.dependency_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-relation' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.relations_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.relation_id')=NEW.focus_ref))
   OR (NEW.focus_kind='experiment-equipment-requirement' AND NOT EXISTS (
        SELECT 1 FROM proposed_experiment_details d, json_each(d.equipment_requirements_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.requirement_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-capability' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.capabilities_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.capability_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-operating-limit' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.operating_limits_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.operating_limit_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-calibration' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.calibrations_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.equipment_calibration_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-safety' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.safety_requirements_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.safety_requirement_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-interface' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.interface_requirements_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND json_extract(x.value,'$.interface_requirement_id')=NEW.focus_ref))
   OR (NEW.focus_kind='equipment-nonclaim' AND NOT EXISTS (
        SELECT 1 FROM equipment_type_proposal_details d, json_each(d.nonclaims_json) x
        WHERE d.proposal_id=NEW.proposal_id AND d.revision=NEW.target_revision AND x.key=CAST(NEW.focus_ref AS INTEGER)))
   OR (NEW.focus_kind='assumption' AND NOT EXISTS (
        SELECT 1 FROM explanatory_conjecture_assumptions a
        WHERE a.assumption_id=NEW.focus_ref AND a.proposal_id=NEW.proposal_id AND a.revision=NEW.target_revision))
   OR (NEW.focus_kind='coordinate-framing' AND NOT EXISTS (
        SELECT 1 FROM proposal_coordinate_framings f
        WHERE f.framing_id=NEW.focus_ref AND f.proposal_id=NEW.proposal_id AND f.revision=NEW.target_revision))
   OR (NEW.focus_kind='conjecture-relation' AND NOT EXISTS (
        SELECT 1 FROM conjecture_relations rel
        WHERE rel.relation_id=NEW.focus_ref AND rel.source_proposal_id=NEW.proposal_id AND rel.source_revision=NEW.target_revision))
   OR (NEW.focus_kind='topic-locus' AND NOT EXISTS (
        SELECT 1 FROM research_topic_loci l
        WHERE l.topic_locus_id=NEW.focus_ref AND l.proposal_id=NEW.proposal_id AND l.revision=NEW.target_revision))
   OR (NEW.focus_kind='topic-origin' AND NOT EXISTS (
        SELECT 1 FROM research_topic_origins o
        WHERE o.topic_origin_id=NEW.focus_ref AND o.proposal_id=NEW.proposal_id AND o.revision=NEW.target_revision))
   OR (NEW.focus_kind='topic-coordinate-framing' AND NOT EXISTS (
        SELECT 1 FROM proposal_coordinate_framings f
        WHERE f.framing_id=NEW.focus_ref AND f.proposal_id=NEW.proposal_id AND f.revision=NEW.target_revision))
   OR (NEW.focus_kind='topic-relation' AND NOT EXISTS (
        SELECT 1 FROM research_topic_relations rel
        WHERE rel.topic_relation_id=NEW.focus_ref AND rel.source_proposal_id=NEW.proposal_id AND rel.source_revision=NEW.target_revision))
BEGIN SELECT RAISE(ABORT, 'criticism focus must target an exact item in the exact proposal revision'); END;
CREATE TRIGGER criticisms_no_update BEFORE UPDATE ON criticisms
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER criticisms_no_delete BEFORE DELETE ON criticisms
BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;

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
CREATE TRIGGER proposal_state_events_no_update BEFORE UPDATE ON proposal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_state_events_no_delete BEFORE DELETE ON proposal_state_events BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_evidence_no_update BEFORE UPDATE ON proposal_evidence BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
CREATE TRIGGER proposal_evidence_no_delete BEFORE DELETE ON proposal_evidence BEGIN SELECT RAISE(ABORT, 'immutable public record'); END;
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

UPDATE public_schema_metadata SET metadata_value='7' WHERE metadata_key='schema_version';
