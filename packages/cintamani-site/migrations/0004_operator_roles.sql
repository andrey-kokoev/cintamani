-- Runtime authority is stored as append-only D1 history. GitHub logins remain mutable
-- public attribution; role identity is therefore bound to the stable internal account id.
CREATE TABLE account_role_events (
  role_event_sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  role_event_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES public_accounts(account_id),
  role TEXT NOT NULL CHECK (role = 'operator'),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('granted', 'revoked')),
  actor_account_id TEXT REFERENCES public_accounts(account_id),
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

CREATE INDEX account_role_events_account_role_sequence
ON account_role_events(account_id, role, role_event_sequence);

CREATE VIEW current_account_roles AS
SELECT
  event.role_event_sequence,
  event.role_event_id,
  event.account_id,
  event.role,
  event.actor_account_id,
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
    SELECT 1 FROM current_account_roles
    WHERE account_id = NEW.actor_account_id AND role = 'operator'
  )
BEGIN
  SELECT RAISE(ABORT, 'operator role changes require an active operator actor');
END;

CREATE TRIGGER account_role_events_no_duplicate_grant
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'granted'
  AND EXISTS (
    SELECT 1 FROM current_account_roles
    WHERE account_id = NEW.account_id AND role = NEW.role
  )
BEGIN
  SELECT RAISE(ABORT, 'account already has this active role');
END;

CREATE TRIGGER account_role_events_no_inactive_revoke
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'revoked'
  AND NOT EXISTS (
    SELECT 1 FROM current_account_roles
    WHERE account_id = NEW.account_id AND role = NEW.role
  )
BEGIN
  SELECT RAISE(ABORT, 'account does not have this active role');
END;

CREATE TRIGGER account_role_events_keep_operator
BEFORE INSERT ON account_role_events
WHEN NEW.action_kind = 'revoked'
  AND (SELECT COUNT(*) FROM current_account_roles WHERE role = 'operator') <= 1
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

UPDATE public_schema_metadata
SET metadata_value = '2'
WHERE metadata_key = 'schema_version';
