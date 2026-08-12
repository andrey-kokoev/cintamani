-- A current direct GitHub↔wallet link grants future author-route access without rewriting
-- the proposal's stored author or any prior revision. Revocation removes this exception.
DROP TRIGGER IF EXISTS proposal_revisions_require_author;

CREATE TRIGGER proposal_revisions_require_author
BEFORE INSERT ON proposal_revisions
WHEN (SELECT current_admin_state FROM proposals WHERE proposal_id = NEW.proposal_id) = 'submitted'
  AND NEW.revision = COALESCE(
    (SELECT MAX(revision) FROM proposal_revisions WHERE proposal_id = NEW.proposal_id), 0
  ) + 1
  AND NEW.author_account_id != (
    SELECT author_account_id FROM proposals WHERE proposal_id = NEW.proposal_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM current_principal_identity_links link
    WHERE (
      link.github_principal_id = (
        SELECT author_account_id FROM proposals WHERE proposal_id = NEW.proposal_id
      )
      AND link.wallet_principal_id = NEW.author_account_id
    ) OR (
      link.wallet_principal_id = (
        SELECT author_account_id FROM proposals WHERE proposal_id = NEW.proposal_id
      )
      AND link.github_principal_id = NEW.author_account_id
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'only the proposal author or current direct counterpart may revise while submitted');
END;

UPDATE public_schema_metadata
SET metadata_value = '4'
WHERE metadata_key = 'schema_version';
