PRAGMA foreign_keys = ON;

-- Generic contributor identity is rooted independently of any authentication mechanism. Public
-- pseudonyms are namespaced: GitHub principals retain their already-public login, while Base
-- wallets use a bounded lowercase HMAC prefix whose deterministic collision extension is chosen
-- before insertion. The full wallet-address HMAC remains private in the subtype table.
CREATE TABLE IF NOT EXISTS contributor_principals (
  principal_id TEXT PRIMARY KEY CHECK (length(principal_id) BETWEEN 1 AND 160),
  principal_kind TEXT NOT NULL CHECK (principal_kind IN ('github', 'base-wallet')),
  public_pseudonym TEXT NOT NULL UNIQUE,
  pseudonym_key_version INTEGER NOT NULL CHECK (pseudonym_key_version >= 1),
  created_at TEXT NOT NULL,
  UNIQUE (principal_id, principal_kind),
  CHECK (
    (principal_kind = 'github'
      AND substr(public_pseudonym, 1, 3) = 'gh:'
      AND length(public_pseudonym) BETWEEN 4 AND 42)
    OR
    (principal_kind = 'base-wallet'
      AND substr(public_pseudonym, 1, 5) = 'base:'
      AND length(public_pseudonym) BETWEEN 17 AND 69
      AND substr(public_pseudonym, 6) = lower(substr(public_pseudonym, 6))
      AND substr(public_pseudonym, 6) NOT GLOB '*[^0-9a-f]*')
  )
) STRICT;

INSERT INTO contributor_principals (
  principal_id, principal_kind, public_pseudonym, pseudonym_key_version, created_at
)
SELECT account_id, 'github', 'gh:' || lower(github_login), 1, created_at
FROM public_accounts
WHERE 1
ON CONFLICT(principal_id) DO NOTHING;

CREATE TRIGGER IF NOT EXISTS contributor_principals_no_update
BEFORE UPDATE ON contributor_principals
BEGIN
  SELECT RAISE(ABORT, 'immutable contributor principal');
END;

CREATE TRIGGER IF NOT EXISTS contributor_principals_no_delete
BEFORE DELETE ON contributor_principals
BEGIN
  SELECT RAISE(ABORT, 'immutable contributor principal');
END;

-- This compatibility trigger deliberately runs after the legacy Task #4 OAuth insert. Immediate
-- foreign keys are checked after AFTER triggers, so the 0006 GitHub subtype can create its root
-- without changing the existing Worker INSERT/UPSERT statement.
CREATE TRIGGER IF NOT EXISTS public_accounts_create_principal
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

CREATE TABLE IF NOT EXISTS base_wallet_identities (
  principal_id TEXT PRIMARY KEY,
  principal_kind TEXT NOT NULL DEFAULT 'base-wallet' CHECK (principal_kind = 'base-wallet'),
  address_hmac_sha256 TEXT NOT NULL UNIQUE CHECK (length(address_hmac_sha256) = 64),
  created_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL CHECK (last_verified_at >= created_at),
  UNIQUE (principal_id, principal_kind),
  FOREIGN KEY (principal_id, principal_kind)
    REFERENCES contributor_principals(principal_id, principal_kind)
) STRICT;

CREATE TRIGGER IF NOT EXISTS base_wallet_identities_identity_immutable
BEFORE UPDATE ON base_wallet_identities
WHEN OLD.principal_id != NEW.principal_id
  OR OLD.principal_kind != NEW.principal_kind
  OR OLD.address_hmac_sha256 != NEW.address_hmac_sha256
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'wallet identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS base_wallet_identities_no_delete
BEFORE DELETE ON base_wallet_identities
BEGIN
  SELECT RAISE(ABORT, 'wallet identity cannot be deleted');
END;

-- Only digests cross the persistence boundary. Origin and URI are fixed into each signed request,
-- and the URI must remain at or below its exact HTTPS origin.
CREATE TABLE IF NOT EXISTS siwx_nonces (
  nonce_digest_sha256 TEXT PRIMARY KEY CHECK (length(nonce_digest_sha256) = 64),
  purpose TEXT NOT NULL CHECK (purpose IN ('session', 'link', 'revoke')),
  transport TEXT NOT NULL DEFAULT 'browser-cookie' CHECK (transport IN ('browser-cookie', 'agent-bearer')),
  bound_github_principal_id TEXT REFERENCES contributor_principals(principal_id),
  origin TEXT NOT NULL CHECK (
    origin LIKE 'https://%'
    AND length(origin) BETWEEN 9 AND 300
    AND instr(substr(origin, 9), '/') = 0
  ),
  uri TEXT NOT NULL CHECK (
    length(uri) BETWEEN 9 AND 2048
    AND (uri = origin OR uri LIKE origin || '/%')
  ),
  network TEXT NOT NULL CHECK (network IN ('base-mainnet', 'base-sepolia')),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  verified_principal_id TEXT REFERENCES contributor_principals(principal_id),
  message_sha256 TEXT CHECK (message_sha256 IS NULL OR length(message_sha256) = 64),
  signature_sha256 TEXT CHECK (signature_sha256 IS NULL OR length(signature_sha256) = 64),
  CHECK (expires_at > issued_at),
  CHECK (
    (purpose = 'session' AND bound_github_principal_id IS NULL)
    OR (purpose IN ('link', 'revoke') AND transport = 'browser-cookie'
      AND bound_github_principal_id IS NOT NULL)
  ),
  CHECK (consumed_at IS NULL OR (consumed_at >= issued_at AND consumed_at <= expires_at)),
  CHECK (
    (consumed_at IS NULL AND verified_principal_id IS NULL
      AND message_sha256 IS NULL AND signature_sha256 IS NULL)
    OR
    (consumed_at IS NOT NULL AND verified_principal_id IS NOT NULL
      AND message_sha256 IS NOT NULL AND signature_sha256 IS NOT NULL)
  )
) STRICT;

CREATE TRIGGER IF NOT EXISTS siwx_nonces_require_unconsumed_insert
BEFORE INSERT ON siwx_nonces
WHEN NEW.consumed_at IS NOT NULL
  OR NEW.verified_principal_id IS NOT NULL
  OR NEW.message_sha256 IS NOT NULL
  OR NEW.signature_sha256 IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SIWX nonce must be inserted unconsumed');
END;

CREATE TRIGGER IF NOT EXISTS siwx_nonces_challenge_immutable
BEFORE UPDATE ON siwx_nonces
WHEN OLD.nonce_digest_sha256 != NEW.nonce_digest_sha256
  OR OLD.purpose != NEW.purpose
  OR OLD.transport != NEW.transport
  OR OLD.bound_github_principal_id IS NOT NEW.bound_github_principal_id
  OR OLD.origin != NEW.origin
  OR OLD.uri != NEW.uri
  OR OLD.network != NEW.network
  OR OLD.issued_at != NEW.issued_at
  OR OLD.expires_at != NEW.expires_at
BEGIN
  SELECT RAISE(ABORT, 'SIWX challenge is immutable');
END;

CREATE TRIGGER IF NOT EXISTS siwx_nonces_consume_once
BEFORE UPDATE ON siwx_nonces
WHEN OLD.consumed_at IS NOT NULL OR NEW.consumed_at IS NULL
BEGIN
  SELECT RAISE(ABORT, 'SIWX nonce may be consumed exactly once');
END;

CREATE TRIGGER IF NOT EXISTS siwx_nonces_no_delete
BEFORE DELETE ON siwx_nonces
BEGIN
  SELECT RAISE(ABORT, 'SIWX nonce cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS principal_identity_link_events (
  link_id TEXT NOT NULL CHECK (length(link_id) BETWEEN 1 AND 160),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  link_event_id TEXT NOT NULL UNIQUE CHECK (length(link_event_id) BETWEEN 1 AND 200),
  github_principal_id TEXT NOT NULL,
  github_principal_kind TEXT NOT NULL DEFAULT 'github' CHECK (github_principal_kind = 'github'),
  wallet_principal_id TEXT NOT NULL,
  wallet_principal_kind TEXT NOT NULL DEFAULT 'base-wallet' CHECK (wallet_principal_kind = 'base-wallet'),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('verified', 'revoked')),
  actor_principal_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  siwx_message_sha256 TEXT NOT NULL CHECK (length(siwx_message_sha256) = 64),
  signature_sha256 TEXT NOT NULL CHECK (length(signature_sha256) = 64),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (link_id, event_sequence),
  FOREIGN KEY (github_principal_id, github_principal_kind)
    REFERENCES contributor_principals(principal_id, principal_kind),
  FOREIGN KEY (wallet_principal_id, wallet_principal_kind)
    REFERENCES contributor_principals(principal_id, principal_kind),
  FOREIGN KEY (github_principal_id) REFERENCES public_accounts(account_id),
  FOREIGN KEY (wallet_principal_id) REFERENCES base_wallet_identities(principal_id)
) STRICT;

CREATE INDEX IF NOT EXISTS principal_identity_link_events_wallet_sequence
ON principal_identity_link_events(wallet_principal_id, event_sequence);

CREATE VIEW IF NOT EXISTS current_principal_identity_links AS
SELECT
  event.link_id,
  event.event_sequence,
  event.link_event_id,
  event.github_principal_id,
  event.wallet_principal_id,
  event.actor_principal_id,
  event.siwx_message_sha256,
  event.signature_sha256,
  event.rationale,
  event.source_timestamp,
  event.recorded_at
FROM principal_identity_link_events event
WHERE event.action_kind = 'verified'
  AND NOT EXISTS (
    SELECT 1
    FROM principal_identity_link_events newer
    WHERE newer.link_id = event.link_id
      AND newer.event_sequence > event.event_sequence
  );

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_require_contiguous
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM principal_identity_link_events WHERE link_id = NEW.link_id),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'identity link events must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_require_initial_verified
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence = 1 AND NEW.action_kind != 'verified'
BEGIN
  SELECT RAISE(ABORT, 'first identity link event must be verified');
END;

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_require_stable_pair
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

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_require_alternation
BEFORE INSERT ON principal_identity_link_events
WHEN NEW.event_sequence > 1
  AND NEW.action_kind = (
    SELECT action_kind FROM principal_identity_link_events
    WHERE link_id = NEW.link_id ORDER BY event_sequence DESC LIMIT 1
  )
BEGIN
  SELECT RAISE(ABORT, 'identity link actions must alternate');
END;

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_one_active_github
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

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_no_update
BEFORE UPDATE ON principal_identity_link_events
BEGIN
  SELECT RAISE(ABORT, 'immutable identity link event');
END;

CREATE TRIGGER IF NOT EXISTS principal_identity_link_events_no_delete
BEFORE DELETE ON principal_identity_link_events
BEGIN
  SELECT RAISE(ABORT, 'immutable identity link event');
END;

CREATE TABLE IF NOT EXISTS principal_session_events (
  session_token_sha256 TEXT NOT NULL REFERENCES public_sessions(session_token_sha256),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  session_event_id TEXT NOT NULL UNIQUE CHECK (length(session_event_id) BETWEEN 1 AND 240),
  principal_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('issued', 'rotated', 'revoked', 'expired')),
  rotated_to_sha256 TEXT REFERENCES public_sessions(session_token_sha256),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 4000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (session_token_sha256, event_sequence),
  CHECK ((event_kind = 'rotated') = (rotated_to_sha256 IS NOT NULL))
) STRICT;

CREATE TRIGGER IF NOT EXISTS principal_session_events_require_contiguous
BEFORE INSERT ON principal_session_events
WHEN NEW.event_sequence != COALESCE(
  (SELECT MAX(event_sequence) FROM principal_session_events
   WHERE session_token_sha256 = NEW.session_token_sha256),
  0
) + 1
BEGIN
  SELECT RAISE(ABORT, 'principal session events must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS principal_session_events_require_initial_issued
BEFORE INSERT ON principal_session_events
WHEN NEW.event_sequence = 1 AND NEW.event_kind != 'issued'
BEGIN
  SELECT RAISE(ABORT, 'first principal session event must be issued');
END;

CREATE TRIGGER IF NOT EXISTS principal_session_events_require_open_session
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

CREATE TRIGGER IF NOT EXISTS principal_session_events_require_principal
BEFORE INSERT ON principal_session_events
WHEN NEW.principal_id != (
  SELECT account_id FROM public_sessions
  WHERE session_token_sha256 = NEW.session_token_sha256
)
BEGIN
  SELECT RAISE(ABORT, 'principal session event identity mismatch');
END;

CREATE TRIGGER IF NOT EXISTS principal_session_events_no_update
BEFORE UPDATE ON principal_session_events
BEGIN
  SELECT RAISE(ABORT, 'immutable principal session event');
END;

CREATE TRIGGER IF NOT EXISTS principal_session_events_no_delete
BEFORE DELETE ON principal_session_events
BEGIN
  SELECT RAISE(ABORT, 'immutable principal session event');
END;

INSERT INTO principal_session_events (
  session_token_sha256, event_sequence, session_event_id, principal_id, event_kind,
  rotated_to_sha256, rationale, source_timestamp, recorded_at
)
SELECT
  session_token_sha256,
  1,
  'legacy-issued:' || session_token_sha256,
  account_id,
  'issued',
  NULL,
  'Backfilled Task 4 session issuance',
  created_at,
  created_at
FROM public_sessions
WHERE 1
ON CONFLICT(session_token_sha256, event_sequence) DO NOTHING;

-- Expansion is intentionally version-neutral. The principal-FK cutover in 0006 also leaves
-- schema_version at 2; the complete Task #5 payment saga advances it only in the final migration.
