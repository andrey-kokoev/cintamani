import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_splitSqlQuery } from "wrangler";

const testRoot = dirname(fileURLToPath(import.meta.url));
const migrationRoot = resolve(testRoot, "../migrations");
const migrationNames = readdirSync(migrationRoot)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = new Map(
  migrationNames.map((name) => [
    name,
    readFileSync(resolve(migrationRoot, name), "utf8"),
  ]),
);
const at = "2026-08-11T18:00:00.000Z";
const later = "2026-08-11T18:05:00.000Z";
const expires = "2026-08-11T18:30:00.000Z";
const hash = (character) => character.repeat(64);
const sepoliaAsset = `0x${"a".repeat(40)}`;

function executeBatch(database, statements) {
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const statement of statements) {
      if (statement.trim()) database.exec(statement);
    }
    const violations = database
      .prepare("PRAGMA foreign_key_check")
      .all()
      .map((row) => ({ ...row }));
    assert.deepEqual(violations, []);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function applyMigration(database, name) {
  executeBatch(database, unstable_splitSqlQuery(migrations.get(name)));
}

function openThrough(lastName = migrationNames.at(-1)) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of migrationNames) {
    applyMigration(database, name);
    if (name === lastName) break;
  }
  return database;
}

function insertWallet(database, id = "principal-wallet", digest = hash("a")) {
  database
    .prepare(
      `INSERT INTO contributor_principals (
        principal_id, principal_kind, public_pseudonym,
        pseudonym_key_version, created_at
      ) VALUES (?, 'base-wallet', ?, 1, ?)`,
    )
    .run(id, `base:${digest.slice(0, 12)}`, at);
  database
    .prepare(
      `INSERT INTO base_wallet_identities (
        principal_id, address_hmac_sha256, created_at, last_verified_at
      ) VALUES (?, ?, ?, ?)`,
    )
    .run(id, digest, at, at);
}

function insertIntent(
  database,
  {
    id = "intent-1",
    idempotencyHash = hash("b"),
    requestHash = hash("c"),
    payloadHash = hash("d"),
    payer = "principal-wallet",
  } = {},
) {
  database
    .prepare(
      `INSERT INTO x402_payment_intents (
        payment_intent_id, idempotency_key_sha256, request_sha256,
        normalized_request_json, x402_mode, network, asset, amount_atomic,
        payment_configuration_sha256, payment_requirements_json,
        payment_payload_sha256, payment_payload_ciphertext,
        payment_payload_nonce_base64url, payer_principal_id,
        created_at, expires_at, updated_at
      ) VALUES (?, ?, ?, ?, 'testnet', 'eip155:84532', ?, '10000', ?, ?,
                ?, 'encrypted-payload', 'payload-nonce', ?, ?, ?, ?)`,
    )
    .run(
      id,
      idempotencyHash,
      requestHash,
      JSON.stringify({ proposal_kind: "theoretical-model-member" }),
      sepoliaAsset,
      hash("e"),
      JSON.stringify({ amount: "10000", network: "eip155:84532" }),
      payloadHash,
      payer,
      at,
      expires,
      at,
    );
  insertPaymentEvent(database, id, 1, null, "reserved", "request-reserved");
}

function insertPaymentEvent(database, intent, sequence, from, to, reason) {
  database
    .prepare(
      `INSERT INTO x402_payment_events (
        payment_intent_id, event_sequence, payment_event_id, from_state,
        to_state, actor_kind, reason_code, detail, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, 'resource-server', ?, NULL, ?, ?)`,
    )
    .run(intent, sequence, `${intent}-event-${sequence}`, from, to, reason, later, later);
}

function insertEntitlement(database, intent = "intent-1", payer = "principal-wallet") {
  database
    .prepare(
      `INSERT INTO x402_retry_entitlements (
        retry_entitlement_id, public_retry_reference,
        payment_intent_id, payer_principal_id,
        request_sha256, created_at
      ) SELECT ?, 'retry_1234567890abcdefghijkl', payment_intent_id, ?, request_sha256, ?
        FROM x402_payment_intents WHERE payment_intent_id = ?`,
    )
    .run("entitlement-1", payer, later, intent);
  insertEntitlementEvent(database, 1, null, "pending-settlement", "payment-pending");
}

function insertEntitlementEvent(database, sequence, from, to, reason) {
  database
    .prepare(
      `INSERT INTO x402_retry_entitlement_events (
        retry_entitlement_id, event_sequence, entitlement_event_id,
        from_state, to_state, reason_code, source_timestamp, recorded_at
      ) VALUES ('entitlement-1', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(sequence, `entitlement-event-${sequence}`, from, to, reason, later, later);
}

function insertReceipt(database, intent = "intent-1", payer = "principal-wallet") {
  database
    .prepare(
      `INSERT INTO x402_settlement_receipts (
        settlement_receipt_id, payment_intent_id, payer_principal_id,
        payment_payload_sha256, settlement_response_sha256,
        payment_response_header_sha256, receipt_ciphertext,
        receipt_nonce_base64url, network, asset, amount_atomic,
        settled_at, recorded_at
      ) SELECT 'receipt-1', payment_intent_id, ?, payment_payload_sha256,
               ?, ?, 'encrypted-receipt', 'receipt-nonce', network, asset,
               amount_atomic, ?, ?
        FROM x402_payment_intents WHERE payment_intent_id = ?`,
    )
    .run(payer, hash("f"), hash("1"), later, later, intent);
}

function insertProposalRevision(database, payer = "principal-wallet") {
  database
    .prepare(
      `INSERT INTO proposals (
        proposal_id, proposal_kind, author_account_id, created_at
      ) VALUES ('proposal-paid-1', 'theoretical-model-member', ?, ?)`,
    )
    .run(payer, later);
  database
    .prepare(
      `INSERT INTO proposal_state_events (
        proposal_id, event_sequence, state_event_id, from_state, to_state,
        selected_revision, actor_account_id, rationale,
        source_timestamp, recorded_at
      ) VALUES (
        'proposal-paid-1', 1, 'proposal-paid-1-state-1', NULL, 'submitted',
        NULL, ?, 'Paid public submission', ?, ?
      )`,
    )
    .run(payer, later, later);
  database
    .prepare(
      `INSERT INTO proposal_revisions (
        proposal_id, revision, revision_id, author_account_id, title, summary,
        rationale, scope, content_sha256, source_timestamp, recorded_at
      ) VALUES (
        'proposal-paid-1', 1, 'proposal-paid-1-revision-1', ?,
        'Bounded paid candidate', 'A public candidate awaiting criticism.',
        'The payment is access control, not evidence.',
        'Candidate identity only.', ?, ?, ?
      )`,
    )
    .run(payer, hash("2"), later, later);
  database
    .prepare(
      `INSERT INTO theoretical_model_details (
        proposal_id, revision, member_id, member_name, model_definition,
        computational_claim, initial_epistemic_status
      ) VALUES (
        'proposal-paid-1', 1, 'model-paid-candidate', 'Paid candidate model',
        'An explicit candidate definition.',
        'A bounded computational claim awaiting tests.', 'candidate'
      )`,
    )
    .run();
}

function advanceToVerified(database) {
  insertPaymentEvent(database, "intent-1", 2, "reserved", "verifying", "verification-started");
  insertPaymentEvent(database, "intent-1", 3, "verifying", "verified", "payment-verified");
}

function advanceToSettled(database) {
  advanceToVerified(database);
  insertEntitlement(database);
  insertPaymentEvent(database, "intent-1", 4, "verified", "settling", "settlement-started");
  insertPaymentEvent(database, "intent-1", 5, "settling", "settled", "settlement-confirmed");
  insertReceipt(database);
  insertEntitlementEvent(database, 2, "pending-settlement", "available", "settlement-stored");
}

test("schema v4 pins the x402 payment plane without plaintext wallet or settlement data", () => {
  const database = openThrough();
  assert.equal(
    database
      .prepare(
        "SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'",
      )
      .get().metadata_value,
    "4",
  );
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM x402_schema_violations").get().count,
    0,
  );

  const sensitivePattern = /(?:raw|plain|address(?!_hmac)|signature(?!_sha)|transaction_hash|payment_payload_json)/iu;
  const persistedColumns = database
    .prepare(
      `SELECT m.name AS table_name, p.name AS column_name
       FROM sqlite_master m JOIN pragma_table_info(m.name) p
       WHERE m.type = 'table'
         AND (m.name LIKE 'x402_%' OR m.name IN ('base_wallet_identities', 'siwx_nonces'))`,
    )
    .all();
  for (const column of persistedColumns) {
    assert.doesNotMatch(
      `${column.table_name}.${column.column_name}`,
      sensitivePattern,
      `sensitive plaintext column: ${column.table_name}.${column.column_name}`,
    );
  }

  const intentColumns = new Set(
    database
      .prepare("PRAGMA table_info(x402_payment_intents)")
      .all()
      .map((column) => column.name),
  );
  assert.ok(intentColumns.has("payment_payload_ciphertext"));
  assert.ok(intentColumns.has("payment_payload_sha256"));
  assert.ok(!intentColumns.has("payer_address"));
  assert.ok(!intentColumns.has("transaction_hash"));
  database.close();
});

test("one definitive settlement finalizes exactly one immutable proposal source", () => {
  const database = openThrough();
  insertWallet(database);
  insertIntent(database);
  advanceToSettled(database);
  insertPaymentEvent(database, "intent-1", 6, "settled", "finalizing", "finalization-started");
  insertProposalRevision(database);
  database
    .prepare(
      `INSERT INTO proposal_payment_sources (
        proposal_id, revision, payment_intent_id, settlement_receipt_id,
        retry_entitlement_id, payer_principal_id, source_kind, recorded_at
      ) VALUES (
        'proposal-paid-1', 1, 'intent-1', 'receipt-1', 'entitlement-1',
        'principal-wallet', 'x402-exact-usdc', ?
      )`,
    )
    .run(later);
  assert.throws(
    () =>
      database
        .prepare(
          "INSERT INTO proposal_payment_sources SELECT * FROM proposal_payment_sources",
        )
        .run(),
    /UNIQUE constraint failed/u,
  );
  insertEntitlementEvent(database, 3, "available", "consumed", "proposal-finalized");
  insertPaymentEvent(database, "intent-1", 7, "finalizing", "finalized", "proposal-created");

  assert.deepEqual(
    {
      ...database
      .prepare(
        `SELECT intent.current_state, entitlement.current_state AS entitlement_state,
                source.proposal_id, source.revision
         FROM x402_payment_intents intent
         JOIN x402_retry_entitlements entitlement USING (payment_intent_id)
         JOIN proposal_payment_sources source USING (payment_intent_id)`,
      )
      .get(),
    },
    {
      current_state: "finalized",
      entitlement_state: "consumed",
      proposal_id: "proposal-paid-1",
      revision: 1,
    },
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM x402_schema_violations").get().count,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM public_schema_violations").get().count,
    0,
  );
  assert.throws(
    () => database.prepare("DELETE FROM proposal_payment_sources").run(),
    /immutable x402 proposal payment source/u,
  );
  database.close();
});

test("saga guards reject replay conflicts, invalid ordering, and mutable identities", () => {
  const database = openThrough();
  insertWallet(database);
  insertIntent(database);

  assert.throws(
    () =>
      insertIntent(database, {
        id: "intent-2",
        requestHash: hash("9"),
        payloadHash: hash("8"),
      }),
    /UNIQUE constraint failed: x402_payment_intents.idempotency_key_sha256/u,
  );
  assert.throws(
    () =>
      insertPaymentEvent(
        database,
        "intent-1",
        2,
        "reserved",
        "settling",
        "skip-verification",
      ),
    /invalid x402 payment state transition/u,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "UPDATE x402_payment_intents SET request_sha256 = ? WHERE payment_intent_id = 'intent-1'",
        )
        .run(hash("7")),
    /x402 payment intent identity is immutable/u,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "UPDATE x402_payment_intents SET payment_payload_sha256 = ? WHERE payment_intent_id = 'intent-1'",
        )
        .run(hash("6")),
    /x402 payment payload and payer are set once/u,
  );
  assert.throws(
    () => database.prepare("DELETE FROM x402_payment_intents").run(),
    /x402 payment intent cannot be deleted/u,
  );
  assert.throws(
    () => insertEntitlement(database),
    /x402 retry entitlement requires a verified intent/u,
  );

  advanceToVerified(database);
  insertEntitlement(database);
  assert.throws(
    () =>
      insertEntitlementEvent(
        database,
        2,
        "pending-settlement",
        "available",
        "premature",
      ),
    /requires a stored settlement receipt/u,
  );
  insertPaymentEvent(database, "intent-1", 4, "verified", "settling", "settlement-started");
  insertPaymentEvent(database, "intent-1", 5, "settling", "settled", "settlement-confirmed");
  assert.throws(
    () =>
      insertPaymentEvent(
        database,
        "intent-1",
        6,
        "settled",
        "finalizing",
        "missing-receipt",
      ),
    /requires a receipt and available entitlement/u,
  );
  insertReceipt(database);
  insertEntitlementEvent(database, 2, "pending-settlement", "available", "settlement-stored");
  insertPaymentEvent(database, "intent-1", 6, "settled", "finalizing", "finalization-started");
  assert.throws(
    () =>
      insertPaymentEvent(
        database,
        "intent-1",
        7,
        "finalizing",
        "finalized",
        "missing-proposal",
      ),
    /requires an immutable source and consumed entitlement/u,
  );
  database.close();
});

test("unknown settlement has one durable reconciliation path and no false receipt", () => {
  const database = openThrough();
  insertWallet(database);
  insertIntent(database);
  advanceToVerified(database);
  insertEntitlement(database);
  insertPaymentEvent(database, "intent-1", 4, "verified", "settling", "settlement-started");
  insertPaymentEvent(
    database,
    "intent-1",
    5,
    "settling",
    "settlement-unknown",
    "facilitator-timeout",
  );
  database
    .prepare(
      `INSERT INTO x402_reconciliation_cases (
        reconciliation_case_id, payment_intent_id, created_at
      ) VALUES ('reconciliation-1', 'intent-1', ?)`,
    )
    .run(later);
  database
    .prepare(
      `INSERT INTO x402_reconciliation_events (
        reconciliation_case_id, event_sequence, reconciliation_event_id,
        from_state, to_state, reason_code, source_timestamp, recorded_at
      ) VALUES ('reconciliation-1', 1, 'reconciliation-event-1', NULL,
                'open', 'unknown-settlement', ?, ?)`,
    )
    .run(later, later);

  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM x402_settlement_receipts").get().count,
    0,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM x402_schema_violations").get().count,
    0,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "INSERT INTO x402_reconciliation_cases VALUES ('reconciliation-2', 'intent-1', NULL, NULL, ?)",
        )
        .run(later),
    /UNIQUE constraint failed: x402_reconciliation_cases.payment_intent_id/u,
  );
  database.close();
});

test("additive x402 migration survives every persisted splitter prefix", () => {
  const migrationName = "0007_x402_payment_saga.sql";
  const statements = unstable_splitSqlQuery(migrations.get(migrationName)).filter(
    (statement) => statement.trim(),
  );
  for (let prefixLength = 1; prefixLength < statements.length; prefixLength += 1) {
    const database = openThrough("0006_principal_fk_cutover.sql");
    executeBatch(database, statements.slice(0, prefixLength));
    applyMigration(database, migrationName);
    assert.equal(
      database
        .prepare(
          "SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'",
        )
        .get().metadata_value,
      "3",
      `prefix ${prefixLength} did not recover`,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM x402_schema_violations").get().count,
      0,
    );
    database.close();
  }
});

test("a failed D1-style x402 migration batch rolls back schema and version", () => {
  const database = openThrough("0006_principal_fk_cutover.sql");
  const statements = unstable_splitSqlQuery(
    migrations.get("0007_x402_payment_saga.sql"),
  ).filter((statement) => statement.trim());
  assert.throws(
    () => executeBatch(database, [...statements.slice(0, -1), "SELECT * FROM missing_x402_table"]),
    /no such table/u,
  );
  assert.equal(
    database
      .prepare(
        "SELECT metadata_value FROM public_schema_metadata WHERE metadata_key = 'schema_version'",
      )
      .get().metadata_value,
    "2",
  );
  assert.equal(
    database
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE 'x402_%' OR name = 'proposal_payment_sources'",
      )
      .get().count,
    0,
  );
  database.close();
});
