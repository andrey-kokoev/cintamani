-- Accountless x402 submissions remain a separate operational payment plane. The only bridge
-- into the public scientific record is the immutable proposal_payment_sources row created in
-- the same transaction as revision 1. Payment, selection, and identity linking grant no
-- epistemic or operator standing.

CREATE TABLE IF NOT EXISTS x402_prechallenge_events (
  challenge_event_id TEXT PRIMARY KEY,
  ip_hmac_sha256 TEXT NOT NULL CHECK (length(ip_hmac_sha256) = 64),
  x402_mode TEXT NOT NULL CHECK (x402_mode IN ('testnet', 'production')),
  recorded_at TEXT NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS x402_prechallenge_events_ip_time
ON x402_prechallenge_events(ip_hmac_sha256, recorded_at);

CREATE INDEX IF NOT EXISTS x402_prechallenge_events_time
ON x402_prechallenge_events(recorded_at);

CREATE TRIGGER IF NOT EXISTS x402_prechallenge_events_no_update
BEFORE UPDATE ON x402_prechallenge_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 pre-challenge history');
END;

CREATE TRIGGER IF NOT EXISTS x402_prechallenge_events_no_delete
BEFORE DELETE ON x402_prechallenge_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 pre-challenge history');
END;

CREATE TABLE IF NOT EXISTS x402_payment_intents (
  payment_intent_id TEXT PRIMARY KEY,
  idempotency_key_sha256 TEXT NOT NULL UNIQUE CHECK (length(idempotency_key_sha256) = 64),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
  normalized_request_json TEXT NOT NULL CHECK (json_valid(normalized_request_json)),
  x402_mode TEXT NOT NULL CHECK (x402_mode IN ('testnet', 'production')),
  network TEXT NOT NULL CHECK (network IN ('eip155:84532', 'eip155:8453')),
  asset TEXT NOT NULL CHECK (
    length(asset) = 42 AND substr(asset, 1, 2) = '0x'
    AND substr(asset, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  amount_atomic TEXT NOT NULL CHECK (amount_atomic = '10000'),
  payment_configuration_sha256 TEXT NOT NULL CHECK (length(payment_configuration_sha256) = 64),
  payment_requirements_json TEXT CHECK (
    payment_requirements_json IS NULL OR json_valid(payment_requirements_json)
  ),
  payment_payload_sha256 TEXT UNIQUE CHECK (
    payment_payload_sha256 IS NULL OR length(payment_payload_sha256) = 64
  ),
  payment_payload_ciphertext TEXT,
  payment_payload_nonce_base64url TEXT,
  payer_principal_id TEXT REFERENCES contributor_principals(principal_id),
  current_event_sequence INTEGER,
  current_state TEXT CHECK (current_state IS NULL OR current_state IN (
    'reserved', 'verifying', 'verified', 'settling', 'settlement-unknown',
    'settled', 'finalizing', 'finalized', 'rejected', 'expired'
  )),
  lease_token_sha256 TEXT CHECK (lease_token_sha256 IS NULL OR length(lease_token_sha256) = 64),
  lease_expires_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (expires_at > created_at),
  CHECK ((current_event_sequence IS NULL) = (current_state IS NULL)),
  CHECK ((payment_payload_ciphertext IS NULL) = (payment_payload_nonce_base64url IS NULL)),
  CHECK ((lease_token_sha256 IS NULL) = (lease_expires_at IS NULL)),
  CHECK (x402_mode != 'testnet' OR network = 'eip155:84532'),
  CHECK (x402_mode != 'production' OR network = 'eip155:8453'),
  UNIQUE (payment_intent_id, payment_payload_sha256, payer_principal_id),
  UNIQUE (payment_intent_id, request_sha256, payer_principal_id)
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_payment_intents_identity_immutable
BEFORE UPDATE ON x402_payment_intents
WHEN OLD.payment_intent_id != NEW.payment_intent_id
  OR OLD.idempotency_key_sha256 != NEW.idempotency_key_sha256
  OR OLD.request_sha256 != NEW.request_sha256
  OR OLD.normalized_request_json != NEW.normalized_request_json
  OR OLD.x402_mode != NEW.x402_mode
  OR OLD.network != NEW.network
  OR OLD.asset != NEW.asset
  OR OLD.amount_atomic != NEW.amount_atomic
  OR OLD.payment_configuration_sha256 != NEW.payment_configuration_sha256
  OR OLD.payment_requirements_json IS NOT NEW.payment_requirements_json
  OR OLD.created_at != NEW.created_at
  OR OLD.expires_at != NEW.expires_at
BEGIN
  SELECT RAISE(ABORT, 'x402 payment intent identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_intents_payload_set_once
BEFORE UPDATE ON x402_payment_intents
WHEN (OLD.payment_payload_sha256 IS NOT NULL AND (
    OLD.payment_payload_sha256 IS NOT NEW.payment_payload_sha256
    OR OLD.payment_payload_ciphertext IS NOT NEW.payment_payload_ciphertext
    OR OLD.payment_payload_nonce_base64url IS NOT NEW.payment_payload_nonce_base64url
  ))
  OR (OLD.payer_principal_id IS NOT NULL
    AND OLD.payer_principal_id IS NOT NEW.payer_principal_id)
BEGIN
  SELECT RAISE(ABORT, 'x402 payment payload and payer are set once');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_intents_no_delete
BEFORE DELETE ON x402_payment_intents
BEGIN
  SELECT RAISE(ABORT, 'x402 payment intent cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS x402_payment_events (
  payment_intent_id TEXT NOT NULL REFERENCES x402_payment_intents(payment_intent_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  payment_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT CHECK (from_state IS NULL OR from_state IN (
    'reserved', 'verifying', 'verified', 'settling', 'settlement-unknown',
    'settled', 'finalizing', 'finalized', 'rejected', 'expired'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'reserved', 'verifying', 'verified', 'settling', 'settlement-unknown',
    'settled', 'finalizing', 'finalized', 'rejected', 'expired'
  )),
  actor_kind TEXT NOT NULL CHECK (actor_kind IN (
    'resource-server', 'payer-retry', 'reconciler'
  )),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 120),
  detail TEXT CHECK (detail IS NULL OR length(detail) <= 2000),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (payment_intent_id, event_sequence),
  UNIQUE (payment_intent_id, event_sequence, to_state)
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_contiguous
BEFORE INSERT ON x402_payment_events
WHEN NEW.event_sequence != COALESCE((
  SELECT current_event_sequence + 1
  FROM x402_payment_intents
  WHERE payment_intent_id = NEW.payment_intent_id
), 1)
BEGIN
  SELECT RAISE(ABORT, 'x402 payment event sequence must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_initial_reserved
BEFORE INSERT ON x402_payment_events
WHEN NEW.event_sequence = 1 AND (NEW.from_state IS NOT NULL OR NEW.to_state != 'reserved')
BEGIN
  SELECT RAISE(ABORT, 'x402 payment history must start at reserved');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_current_from_state
BEFORE INSERT ON x402_payment_events
WHEN NEW.event_sequence > 1 AND NEW.from_state IS NOT (
  SELECT current_state FROM x402_payment_intents
  WHERE payment_intent_id = NEW.payment_intent_id
)
BEGIN
  SELECT RAISE(ABORT, 'x402 payment event from_state must match current state');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_allowed_transition
BEFORE INSERT ON x402_payment_events
WHEN NEW.event_sequence > 1 AND NOT (
  (NEW.from_state = 'reserved' AND NEW.to_state IN ('verifying', 'rejected', 'expired')) OR
  (NEW.from_state = 'verifying' AND NEW.to_state IN ('verified', 'rejected', 'expired')) OR
  (NEW.from_state = 'verified' AND NEW.to_state IN ('settling', 'rejected', 'expired')) OR
  (NEW.from_state = 'settling' AND NEW.to_state IN ('settled', 'settlement-unknown', 'rejected')) OR
  (NEW.from_state = 'settlement-unknown' AND NEW.to_state IN ('settled', 'rejected')) OR
  (NEW.from_state = 'settled' AND NEW.to_state = 'finalizing') OR
  (NEW.from_state = 'finalizing' AND NEW.to_state IN ('finalized', 'settled'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid x402 payment state transition');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_update_cache
AFTER INSERT ON x402_payment_events
BEGIN
  UPDATE x402_payment_intents
  SET current_event_sequence = NEW.event_sequence,
      current_state = NEW.to_state,
      updated_at = NEW.recorded_at
  WHERE payment_intent_id = NEW.payment_intent_id;
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_no_update
BEFORE UPDATE ON x402_payment_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 payment history');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_no_delete
BEFORE DELETE ON x402_payment_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 payment history');
END;

CREATE TABLE IF NOT EXISTS x402_settlement_receipts (
  settlement_receipt_id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL UNIQUE REFERENCES x402_payment_intents(payment_intent_id),
  payer_principal_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  payment_payload_sha256 TEXT NOT NULL UNIQUE CHECK (length(payment_payload_sha256) = 64),
  settlement_response_sha256 TEXT NOT NULL CHECK (length(settlement_response_sha256) = 64),
  payment_response_header_sha256 TEXT NOT NULL CHECK (length(payment_response_header_sha256) = 64),
  receipt_ciphertext TEXT NOT NULL,
  receipt_nonce_base64url TEXT NOT NULL,
  network TEXT NOT NULL CHECK (network IN ('eip155:84532', 'eip155:8453')),
  asset TEXT NOT NULL CHECK (
    length(asset) = 42 AND substr(asset, 1, 2) = '0x'
    AND substr(asset, 3) NOT GLOB '*[^0-9A-Fa-f]*'
  ),
  amount_atomic TEXT NOT NULL CHECK (amount_atomic = '10000'),
  settled_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE (settlement_receipt_id, payment_intent_id, payer_principal_id),
  FOREIGN KEY (payment_intent_id, payment_payload_sha256, payer_principal_id)
    REFERENCES x402_payment_intents(
      payment_intent_id, payment_payload_sha256, payer_principal_id
    )
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_settlement_receipts_require_settled
BEFORE INSERT ON x402_settlement_receipts
WHEN (SELECT current_state FROM x402_payment_intents
      WHERE payment_intent_id = NEW.payment_intent_id) != 'settled'
BEGIN
  SELECT RAISE(ABORT, 'x402 receipt requires a definitively settled intent');
END;

CREATE TRIGGER IF NOT EXISTS x402_settlement_receipts_no_update
BEFORE UPDATE ON x402_settlement_receipts
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 settlement receipt');
END;

CREATE TRIGGER IF NOT EXISTS x402_settlement_receipts_no_delete
BEFORE DELETE ON x402_settlement_receipts
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 settlement receipt');
END;

CREATE TABLE IF NOT EXISTS x402_retry_entitlements (
  retry_entitlement_id TEXT PRIMARY KEY,
  public_retry_reference TEXT NOT NULL UNIQUE CHECK (
    length(public_retry_reference) BETWEEN 24 AND 120
  ),
  payment_intent_id TEXT NOT NULL UNIQUE REFERENCES x402_payment_intents(payment_intent_id),
  payer_principal_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64),
  current_event_sequence INTEGER,
  current_state TEXT CHECK (current_state IS NULL OR current_state IN (
    'pending-settlement', 'available', 'consumed', 'cancelled'
  )),
  created_at TEXT NOT NULL,
  CHECK ((current_event_sequence IS NULL) = (current_state IS NULL)),
  UNIQUE (retry_entitlement_id, payment_intent_id, payer_principal_id),
  FOREIGN KEY (payment_intent_id, request_sha256, payer_principal_id)
    REFERENCES x402_payment_intents(payment_intent_id, request_sha256, payer_principal_id)
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_retry_entitlements_require_verified_intent
BEFORE INSERT ON x402_retry_entitlements
WHEN COALESCE((
  SELECT current_state
  FROM x402_payment_intents
  WHERE payment_intent_id = NEW.payment_intent_id
), '') NOT IN ('verified', 'settling')
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement requires a verified intent');
END;

CREATE TRIGGER IF NOT EXISTS x402_retry_entitlements_identity_immutable
BEFORE UPDATE ON x402_retry_entitlements
WHEN OLD.retry_entitlement_id != NEW.retry_entitlement_id
  OR OLD.public_retry_reference != NEW.public_retry_reference
  OR OLD.payment_intent_id != NEW.payment_intent_id
  OR OLD.payer_principal_id != NEW.payer_principal_id
  OR OLD.request_sha256 != NEW.request_sha256
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS x402_retry_entitlements_no_delete
BEFORE DELETE ON x402_retry_entitlements
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS x402_retry_entitlement_events (
  retry_entitlement_id TEXT NOT NULL REFERENCES x402_retry_entitlements(retry_entitlement_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  entitlement_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT CHECK (from_state IS NULL OR from_state IN (
    'pending-settlement', 'available', 'consumed', 'cancelled'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'pending-settlement', 'available', 'consumed', 'cancelled'
  )),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 120),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (retry_entitlement_id, event_sequence)
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_contiguous
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.event_sequence != COALESCE((
  SELECT current_event_sequence + 1
  FROM x402_retry_entitlements
  WHERE retry_entitlement_id = NEW.retry_entitlement_id
), 1)
BEGIN
  SELECT RAISE(ABORT, 'x402 entitlement event sequence must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_initial_pending
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.event_sequence = 1 AND (
  NEW.from_state IS NOT NULL OR NEW.to_state != 'pending-settlement'
)
BEGIN
  SELECT RAISE(ABORT, 'x402 entitlement history must start pending settlement');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_current_from_state
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.event_sequence > 1 AND NEW.from_state IS NOT (
  SELECT current_state FROM x402_retry_entitlements
  WHERE retry_entitlement_id = NEW.retry_entitlement_id
)
BEGIN
  SELECT RAISE(ABORT, 'x402 entitlement from_state must match current state');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_allowed_transition
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.event_sequence > 1 AND NOT (
  (NEW.from_state = 'pending-settlement' AND NEW.to_state IN ('available', 'cancelled')) OR
  (NEW.from_state = 'available' AND NEW.to_state = 'consumed')
)
BEGIN
  SELECT RAISE(ABORT, 'invalid x402 entitlement state transition');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_settlement_before_available
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.to_state = 'available' AND (
  COALESCE((
    SELECT intent.current_state
    FROM x402_retry_entitlements entitlement
    JOIN x402_payment_intents intent USING (payment_intent_id)
    WHERE entitlement.retry_entitlement_id = NEW.retry_entitlement_id
  ), '') != 'settled'
  OR NOT EXISTS (
    SELECT 1
    FROM x402_retry_entitlements entitlement
    JOIN x402_settlement_receipts receipt USING (payment_intent_id)
    WHERE entitlement.retry_entitlement_id = NEW.retry_entitlement_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement requires a stored settlement receipt');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_source_before_consumed
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.to_state = 'consumed' AND NOT EXISTS (
  SELECT 1
  FROM proposal_payment_sources source
  WHERE source.retry_entitlement_id = NEW.retry_entitlement_id
)
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement consumption requires a proposal source');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_require_rejection_before_cancelled
BEFORE INSERT ON x402_retry_entitlement_events
WHEN NEW.to_state = 'cancelled' AND COALESCE((
  SELECT intent.current_state
  FROM x402_retry_entitlements entitlement
  JOIN x402_payment_intents intent USING (payment_intent_id)
  WHERE entitlement.retry_entitlement_id = NEW.retry_entitlement_id
), '') NOT IN ('rejected', 'expired')
BEGIN
  SELECT RAISE(ABORT, 'x402 retry entitlement cancellation requires a rejected intent');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_update_cache
AFTER INSERT ON x402_retry_entitlement_events
BEGIN
  UPDATE x402_retry_entitlements
  SET current_event_sequence = NEW.event_sequence,
      current_state = NEW.to_state
  WHERE retry_entitlement_id = NEW.retry_entitlement_id;
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_no_update
BEFORE UPDATE ON x402_retry_entitlement_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 entitlement history');
END;

CREATE TRIGGER IF NOT EXISTS x402_entitlement_events_no_delete
BEFORE DELETE ON x402_retry_entitlement_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 entitlement history');
END;

CREATE TABLE IF NOT EXISTS x402_reconciliation_cases (
  reconciliation_case_id TEXT PRIMARY KEY,
  payment_intent_id TEXT NOT NULL UNIQUE REFERENCES x402_payment_intents(payment_intent_id),
  current_event_sequence INTEGER,
  current_state TEXT CHECK (current_state IS NULL OR current_state IN (
    'open', 'reconciling', 'resolved-settled', 'resolved-rejected'
  )),
  created_at TEXT NOT NULL,
  CHECK ((current_event_sequence IS NULL) = (current_state IS NULL))
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_cases_require_unknown_settlement
BEFORE INSERT ON x402_reconciliation_cases
WHEN COALESCE((
  SELECT current_state
  FROM x402_payment_intents
  WHERE payment_intent_id = NEW.payment_intent_id
), '') != 'settlement-unknown'
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation requires an unknown settlement');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_cases_identity_immutable
BEFORE UPDATE ON x402_reconciliation_cases
WHEN OLD.reconciliation_case_id != NEW.reconciliation_case_id
  OR OLD.payment_intent_id != NEW.payment_intent_id
  OR OLD.created_at != NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_cases_no_delete
BEFORE DELETE ON x402_reconciliation_cases
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation record cannot be deleted');
END;

CREATE TABLE IF NOT EXISTS x402_reconciliation_events (
  reconciliation_case_id TEXT NOT NULL REFERENCES x402_reconciliation_cases(reconciliation_case_id),
  event_sequence INTEGER NOT NULL CHECK (event_sequence >= 1),
  reconciliation_event_id TEXT NOT NULL UNIQUE,
  from_state TEXT CHECK (from_state IS NULL OR from_state IN (
    'open', 'reconciling', 'resolved-settled', 'resolved-rejected'
  )),
  to_state TEXT NOT NULL CHECK (to_state IN (
    'open', 'reconciling', 'resolved-settled', 'resolved-rejected'
  )),
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 120),
  source_timestamp TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY (reconciliation_case_id, event_sequence)
) STRICT;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_contiguous
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.event_sequence != COALESCE((
  SELECT current_event_sequence + 1
  FROM x402_reconciliation_cases
  WHERE reconciliation_case_id = NEW.reconciliation_case_id
), 1)
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation event sequence must be contiguous');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_initial_open
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.event_sequence = 1 AND (NEW.from_state IS NOT NULL OR NEW.to_state != 'open')
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation history must start open');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_current_from_state
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.event_sequence > 1 AND NEW.from_state IS NOT (
  SELECT current_state FROM x402_reconciliation_cases
  WHERE reconciliation_case_id = NEW.reconciliation_case_id
)
BEGIN
  SELECT RAISE(ABORT, 'x402 reconciliation from_state must match current state');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_allowed_transition
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.event_sequence > 1 AND NOT (
  (NEW.from_state = 'open' AND NEW.to_state = 'reconciling') OR
  (NEW.from_state = 'reconciling' AND NEW.to_state IN (
    'open', 'resolved-settled', 'resolved-rejected'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid x402 reconciliation state transition');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_settled_resolution
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.to_state = 'resolved-settled' AND (
  COALESCE((
    SELECT intent.current_state
    FROM x402_reconciliation_cases reconciliation
    JOIN x402_payment_intents intent USING (payment_intent_id)
    WHERE reconciliation.reconciliation_case_id = NEW.reconciliation_case_id
  ), '') NOT IN ('settled', 'finalizing', 'finalized')
  OR NOT EXISTS (
    SELECT 1
    FROM x402_reconciliation_cases reconciliation
    JOIN x402_settlement_receipts receipt USING (payment_intent_id)
    WHERE reconciliation.reconciliation_case_id = NEW.reconciliation_case_id
  )
)
BEGIN
  SELECT RAISE(ABORT, 'x402 settled reconciliation requires a stored receipt');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_require_rejected_resolution
BEFORE INSERT ON x402_reconciliation_events
WHEN NEW.to_state = 'resolved-rejected' AND COALESCE((
  SELECT intent.current_state
  FROM x402_reconciliation_cases reconciliation
  JOIN x402_payment_intents intent USING (payment_intent_id)
  WHERE reconciliation.reconciliation_case_id = NEW.reconciliation_case_id
), '') != 'rejected'
BEGIN
  SELECT RAISE(ABORT, 'x402 rejected reconciliation requires a rejected intent');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_update_cache
AFTER INSERT ON x402_reconciliation_events
BEGIN
  UPDATE x402_reconciliation_cases
  SET current_event_sequence = NEW.event_sequence,
      current_state = NEW.to_state
  WHERE reconciliation_case_id = NEW.reconciliation_case_id;
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_no_update
BEFORE UPDATE ON x402_reconciliation_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 reconciliation history');
END;

CREATE TRIGGER IF NOT EXISTS x402_reconciliation_events_no_delete
BEFORE DELETE ON x402_reconciliation_events
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 reconciliation history');
END;

CREATE TABLE IF NOT EXISTS proposal_payment_sources (
  proposal_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision = 1),
  payment_intent_id TEXT NOT NULL UNIQUE,
  settlement_receipt_id TEXT NOT NULL UNIQUE,
  retry_entitlement_id TEXT NOT NULL UNIQUE,
  payer_principal_id TEXT NOT NULL REFERENCES contributor_principals(principal_id),
  source_kind TEXT NOT NULL CHECK (source_kind = 'x402-exact-usdc'),
  recorded_at TEXT NOT NULL,
  FOREIGN KEY (proposal_id, revision)
    REFERENCES proposal_revisions(proposal_id, revision),
  FOREIGN KEY (settlement_receipt_id, payment_intent_id, payer_principal_id)
    REFERENCES x402_settlement_receipts(
      settlement_receipt_id, payment_intent_id, payer_principal_id
    ),
  FOREIGN KEY (retry_entitlement_id, payment_intent_id, payer_principal_id)
    REFERENCES x402_retry_entitlements(
      retry_entitlement_id, payment_intent_id, payer_principal_id
    )
) STRICT;

CREATE TRIGGER IF NOT EXISTS proposal_payment_sources_require_author
BEFORE INSERT ON proposal_payment_sources
WHEN NEW.payer_principal_id IS NOT (
  SELECT author_account_id FROM proposals WHERE proposal_id = NEW.proposal_id
)
BEGIN
  SELECT RAISE(ABORT, 'x402 proposal source payer must be the proposal author');
END;

CREATE TRIGGER IF NOT EXISTS proposal_payment_sources_require_finalizing
BEFORE INSERT ON proposal_payment_sources
WHEN (SELECT current_state FROM x402_payment_intents
      WHERE payment_intent_id = NEW.payment_intent_id) != 'finalizing'
  OR (SELECT current_state FROM x402_retry_entitlements
      WHERE retry_entitlement_id = NEW.retry_entitlement_id) != 'available'
BEGIN
  SELECT RAISE(ABORT, 'x402 proposal source requires finalizing intent and available entitlement');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_receipt_before_finalizing
BEFORE INSERT ON x402_payment_events
WHEN NEW.to_state = 'finalizing' AND (
  NOT EXISTS (
    SELECT 1
    FROM x402_settlement_receipts receipt
    WHERE receipt.payment_intent_id = NEW.payment_intent_id
  )
  OR NOT EXISTS (
    SELECT 1
    FROM x402_retry_entitlements entitlement
    WHERE entitlement.payment_intent_id = NEW.payment_intent_id
      AND entitlement.current_state = 'available'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'x402 finalization requires a receipt and available entitlement');
END;

CREATE TRIGGER IF NOT EXISTS x402_payment_events_require_source_before_finalized
BEFORE INSERT ON x402_payment_events
WHEN NEW.to_state = 'finalized' AND (
  NOT EXISTS (
    SELECT 1
    FROM proposal_payment_sources source
    WHERE source.payment_intent_id = NEW.payment_intent_id
  )
  OR NOT EXISTS (
    SELECT 1
    FROM x402_retry_entitlements entitlement
    WHERE entitlement.payment_intent_id = NEW.payment_intent_id
      AND entitlement.current_state = 'consumed'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'x402 finalized intent requires an immutable source and consumed entitlement');
END;

CREATE TRIGGER IF NOT EXISTS proposal_payment_sources_no_update
BEFORE UPDATE ON proposal_payment_sources
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 proposal payment source');
END;

CREATE TRIGGER IF NOT EXISTS proposal_payment_sources_no_delete
BEFORE DELETE ON proposal_payment_sources
BEGIN
  SELECT RAISE(ABORT, 'immutable x402 proposal payment source');
END;

CREATE VIEW IF NOT EXISTS x402_payment_cache_drift AS
SELECT payment_intent_id AS record_id,
       CASE
         WHEN intent.current_event_sequence IS NOT (
           SELECT MAX(event.event_sequence)
           FROM x402_payment_events event
           WHERE event.payment_intent_id = intent.payment_intent_id
         ) THEN 'payment-event-sequence'
         ELSE 'payment-state'
       END AS drift_kind
FROM x402_payment_intents intent
WHERE intent.current_event_sequence IS NOT (
  SELECT MAX(event.event_sequence)
  FROM x402_payment_events event
  WHERE event.payment_intent_id = intent.payment_intent_id
)
   OR intent.current_state IS NOT (
  SELECT event.to_state
  FROM x402_payment_events event
  WHERE event.payment_intent_id = intent.payment_intent_id
  ORDER BY event.event_sequence DESC LIMIT 1
)
UNION ALL
SELECT retry_entitlement_id,
       CASE
         WHEN entitlement.current_event_sequence IS NOT (
           SELECT MAX(event.event_sequence)
           FROM x402_retry_entitlement_events event
           WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
         ) THEN 'entitlement-event-sequence'
         ELSE 'entitlement-state'
       END
FROM x402_retry_entitlements entitlement
WHERE entitlement.current_event_sequence IS NOT (
  SELECT MAX(event.event_sequence)
  FROM x402_retry_entitlement_events event
  WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
)
   OR entitlement.current_state IS NOT (
  SELECT event.to_state
  FROM x402_retry_entitlement_events event
  WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
  ORDER BY event.event_sequence DESC LIMIT 1
)
UNION ALL
SELECT reconciliation_case_id,
       CASE
         WHEN reconciliation.current_event_sequence IS NOT (
           SELECT MAX(event.event_sequence)
           FROM x402_reconciliation_events event
           WHERE event.reconciliation_case_id = reconciliation.reconciliation_case_id
         ) THEN 'reconciliation-event-sequence'
         ELSE 'reconciliation-state'
       END
FROM x402_reconciliation_cases reconciliation
WHERE reconciliation.current_event_sequence IS NOT (
  SELECT MAX(event.event_sequence)
  FROM x402_reconciliation_events event
  WHERE event.reconciliation_case_id = reconciliation.reconciliation_case_id
)
   OR reconciliation.current_state IS NOT (
  SELECT event.to_state
  FROM x402_reconciliation_events event
  WHERE event.reconciliation_case_id = reconciliation.reconciliation_case_id
  ORDER BY event.event_sequence DESC LIMIT 1
);

CREATE VIEW IF NOT EXISTS x402_schema_violations AS
SELECT CASE
         WHEN intent.current_event_sequence IS NOT (
           SELECT MAX(event.event_sequence)
           FROM x402_payment_events event
           WHERE event.payment_intent_id = intent.payment_intent_id
         ) OR intent.current_state IS NOT (
           SELECT event.to_state
           FROM x402_payment_events event
           WHERE event.payment_intent_id = intent.payment_intent_id
           ORDER BY event.event_sequence DESC LIMIT 1
         ) THEN 'x402-cache-drift'
         WHEN intent.current_event_sequence IS NULL OR intent.current_state IS NULL
           THEN 'x402-intent-missing-history'
         WHEN intent.current_state IN ('settled', 'finalizing', 'finalized') AND NOT EXISTS (
           SELECT 1 FROM x402_settlement_receipts receipt
           WHERE receipt.payment_intent_id = intent.payment_intent_id
         ) THEN 'x402-settled-without-receipt'
         WHEN intent.current_state = 'settlement-unknown' AND NOT EXISTS (
           SELECT 1 FROM x402_reconciliation_cases reconciliation
           WHERE reconciliation.payment_intent_id = intent.payment_intent_id
         ) THEN 'x402-unknown-without-reconciliation'
         ELSE 'x402-finalized-without-source'
       END AS violation_kind,
       intent.payment_intent_id AS record_id
FROM x402_payment_intents intent
WHERE intent.current_event_sequence IS NULL
   OR intent.current_state IS NULL
   OR intent.current_event_sequence IS NOT (
     SELECT MAX(event.event_sequence)
     FROM x402_payment_events event
     WHERE event.payment_intent_id = intent.payment_intent_id
   )
   OR intent.current_state IS NOT (
     SELECT event.to_state
     FROM x402_payment_events event
     WHERE event.payment_intent_id = intent.payment_intent_id
     ORDER BY event.event_sequence DESC LIMIT 1
   )
   OR (intent.current_state IN ('settled', 'finalizing', 'finalized') AND NOT EXISTS (
     SELECT 1 FROM x402_settlement_receipts receipt
     WHERE receipt.payment_intent_id = intent.payment_intent_id
   ))
   OR (intent.current_state = 'settlement-unknown' AND NOT EXISTS (
     SELECT 1 FROM x402_reconciliation_cases reconciliation
     WHERE reconciliation.payment_intent_id = intent.payment_intent_id
   ))
   OR (intent.current_state = 'finalized' AND NOT EXISTS (
     SELECT 1 FROM proposal_payment_sources source
     WHERE source.payment_intent_id = intent.payment_intent_id
   ))
UNION ALL
SELECT 'x402-receipt-without-settled-intent', receipt.payment_intent_id
FROM x402_settlement_receipts receipt
JOIN x402_payment_intents intent USING (payment_intent_id)
WHERE intent.current_state NOT IN ('settled', 'finalizing', 'finalized')
UNION ALL
SELECT CASE
         WHEN entitlement.current_event_sequence IS NOT (
           SELECT MAX(event.event_sequence)
           FROM x402_retry_entitlement_events event
           WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
         ) OR entitlement.current_state IS NOT (
           SELECT event.to_state
           FROM x402_retry_entitlement_events event
           WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
           ORDER BY event.event_sequence DESC LIMIT 1
         ) THEN 'x402-cache-drift'
         ELSE 'x402-consumed-without-source'
       END,
       entitlement.retry_entitlement_id
FROM x402_retry_entitlements entitlement
WHERE entitlement.current_event_sequence IS NOT (
    SELECT MAX(event.event_sequence)
    FROM x402_retry_entitlement_events event
    WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
  )
   OR entitlement.current_state IS NOT (
    SELECT event.to_state
    FROM x402_retry_entitlement_events event
    WHERE event.retry_entitlement_id = entitlement.retry_entitlement_id
    ORDER BY event.event_sequence DESC LIMIT 1
  )
   OR (entitlement.current_state = 'consumed' AND NOT EXISTS (
    SELECT 1 FROM proposal_payment_sources source
    WHERE source.retry_entitlement_id = entitlement.retry_entitlement_id
  ))
UNION ALL
SELECT 'x402-cache-drift', reconciliation.reconciliation_case_id
FROM x402_reconciliation_cases reconciliation
WHERE reconciliation.current_event_sequence IS NOT (
    SELECT MAX(event.event_sequence)
    FROM x402_reconciliation_events event
    WHERE event.reconciliation_case_id = reconciliation.reconciliation_case_id
  )
   OR reconciliation.current_state IS NOT (
    SELECT event.to_state
    FROM x402_reconciliation_events event
    WHERE event.reconciliation_case_id = reconciliation.reconciliation_case_id
    ORDER BY event.event_sequence DESC LIMIT 1
  );

UPDATE public_schema_metadata
SET metadata_value = '3'
WHERE metadata_key = 'schema_version';
