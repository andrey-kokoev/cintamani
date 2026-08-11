CREATE TRIGGER IF NOT EXISTS proposals_identity_immutable
BEFORE UPDATE ON proposals
WHEN OLD.proposal_kind != NEW.proposal_kind
  OR OLD.author_account_id != NEW.author_account_id
  OR OLD.parent_proposal_id IS NOT NEW.parent_proposal_id
  OR OLD.parent_revision IS NOT NEW.parent_revision
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'proposal identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS proposals_no_delete
BEFORE DELETE ON proposals
BEGIN
  SELECT RAISE(ABORT, 'public proposals cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS proposal_revisions_require_submitted
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) != 'submitted'
BEGIN
  SELECT RAISE(ABORT, 'revisions are allowed only while submitted');
END;

CREATE TRIGGER IF NOT EXISTS proposal_revisions_require_contiguous
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) = 'submitted'
  AND NEW.revision != COALESCE(
    (SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id = NEW.proposal_id),
    0
  ) + 1
BEGIN
  SELECT RAISE(ABORT, 'proposal revisions must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS proposal_revisions_require_author
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

CREATE TRIGGER IF NOT EXISTS proposal_revisions_update_cache
AFTER INSERT ON proposal_revisions
BEGIN
  UPDATE proposals SET current_revision = NEW.revision WHERE proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER IF NOT EXISTS proposal_state_events_require_contiguous
BEFORE INSERT ON proposal_state_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT current_state_event_sequence FROM proposals WHERE proposal_id = NEW.proposal_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'proposal state events must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS proposal_state_events_require_initial_submitted
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

CREATE TRIGGER IF NOT EXISTS proposal_state_events_require_current_from_state
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

CREATE TRIGGER IF NOT EXISTS proposal_state_events_require_allowed_transition
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

CREATE TRIGGER IF NOT EXISTS proposal_state_events_update_cache
AFTER INSERT ON proposal_state_events
BEGIN
  UPDATE proposals
  SET current_state_event_sequence = NEW.event_sequence, current_admin_state = NEW.to_state
  WHERE proposal_id = NEW.proposal_id;
END;

CREATE TRIGGER IF NOT EXISTS appeal_state_events_require_contiguous
BEFORE INSERT ON appeal_state_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM appeal_state_events WHERE appeal_id = NEW.appeal_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'appeal state events must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS appeal_state_events_require_initial_submitted
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

CREATE TRIGGER IF NOT EXISTS appeal_state_events_require_current_from_state
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

CREATE TRIGGER IF NOT EXISTS appeal_state_events_require_allowed_transition
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

CREATE TRIGGER IF NOT EXISTS theoretical_model_details_kind
BEFORE INSERT ON theoretical_model_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'theoretical-model-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS physical_material_details_kind
BEFORE INSERT ON physical_material_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'physical-material-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS physical_mechanism_details_kind
BEFORE INSERT ON physical_mechanism_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'physical-calculation-mechanism-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS observation_interface_details_kind
BEFORE INSERT ON observation_interface_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'observation-interface-member'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS existing_member_assessment_details_kind
BEFORE INSERT ON existing_member_assessment_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'existing-member-assessment'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS existing_member_correction_details_kind
BEFORE INSERT ON existing_member_correction_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'existing-member-correction'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE TRIGGER IF NOT EXISTS ontology_change_details_kind
BEFORE INSERT ON ontology_change_details
WHEN COALESCE((SELECT p.proposal_kind FROM proposal_revisions r JOIN proposals p USING (proposal_id)
               WHERE r.proposal_id = NEW.proposal_id AND r.revision = NEW.revision), '')
     != 'ontology-change'
BEGIN SELECT RAISE(ABORT, 'detail kind does not match proposal kind'); END;

CREATE VIEW IF NOT EXISTS proposal_revision_detail_counts AS
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

CREATE VIEW IF NOT EXISTS proposal_cache_drift AS
SELECT p.proposal_id, 'current-revision' AS drift_kind
FROM proposals p
WHERE p.current_revision IS NOT (SELECT MAX(r.revision) FROM proposal_revisions r WHERE r.proposal_id = p.proposal_id)
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

CREATE VIEW IF NOT EXISTS public_schema_violations AS
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

-- Listing and account-lock state are projections of the latest ordered action for an exact typed
-- target. Every prior action remains immutable and publicly auditable.
CREATE VIEW IF NOT EXISTS current_listing_moderation AS
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

CREATE VIEW IF NOT EXISTS current_account_locks AS
SELECT
  m.action_sequence,
  m.moderation_action_id,
  m.target_account_id,
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

CREATE VIEW IF NOT EXISTS public_proposal_summaries AS
SELECT
  p.proposal_id,
  p.proposal_kind,
  p.created_at,
  p.current_revision,
  p.current_admin_state,
  p.current_state_event_sequence,
  r.title,
  r.summary,
  a.github_login,
  a.github_profile_url,
  a.github_avatar_url,
  p.parent_proposal_id,
  p.parent_revision
FROM proposals p
JOIN proposal_revisions r
  ON r.proposal_id = p.proposal_id AND r.revision = p.current_revision
JOIN public_accounts a ON a.account_id = p.author_account_id
WHERE NOT EXISTS (
  SELECT 1
  FROM current_listing_moderation visibility
  WHERE visibility.target_kind = 'proposal-revision'
    AND visibility.target_proposal_id = p.proposal_id
    AND visibility.target_revision = p.current_revision
    AND visibility.listing_visibility = 'hidden'
);
