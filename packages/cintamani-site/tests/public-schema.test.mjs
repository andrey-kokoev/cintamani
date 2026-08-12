import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { unstable_splitSqlQuery } from "wrangler";

const testRoot = dirname(fileURLToPath(import.meta.url));
const migrationRoot = resolve(testRoot, "../migrations");
const migrationFiles = readdirSync(migrationRoot)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrations = migrationFiles.map((name) =>
  readFileSync(resolve(migrationRoot, name), "utf8"),
);
const at = "2026-08-11T18:00:00.000Z";
const hash = (character) => character.repeat(64);

function openDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  migrations.forEach((migration) => {
    database.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of unstable_splitSqlQuery(migration)) {
        if (statement.trim()) database.exec(statement);
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  });
  return database;
}

test("remote D1 migrations avoid CASE nested inside trigger compound statements", () => {
  migrationFiles.forEach((name, index) => {
    const statements = unstable_splitSqlQuery(migrations[index]);
    statements
      .filter((statement) => /^CREATE\s+TRIGGER\b/i.test(statement))
      .forEach((trigger) => {
        const body = trigger.slice(trigger.search(/\bBEGIN\b/i));
        assert.doesNotMatch(
          body,
          /\bCASE\b/i,
          `${name} contains a nested CASE trigger body that the remote D1 query parser can truncate`,
        );
      });
  });
});

test("unrecorded invariant migration is safe after a partially persisted object prefix", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(migrations[0]);

  const invariantIndex = migrationFiles.indexOf(
    "0002_public_proposal_invariants.sql",
  );
  assert.notEqual(invariantIndex, -1);
  const invariantStatements = unstable_splitSqlQuery(
    migrations[invariantIndex],
  );
  invariantStatements
    .filter((statement) => /^CREATE\s+(?:TRIGGER|VIEW)\b/i.test(statement))
    .forEach((statement) => {
      assert.match(
        statement,
        /^CREATE\s+(?:TRIGGER|VIEW)\s+IF\s+NOT\s+EXISTS\b/i,
      );
    });

  database.exec(`${invariantStatements.slice(0, 2).join(";\n")};`);
  database.exec(migrations[invariantIndex]);
  database.exec(
    migrations[migrationFiles.indexOf("0003_immutable_public_history.sql")],
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_schema_violations")
      .get().count,
    0,
  );
});

function insertAccount(
  database,
  { id = "account-author", login = "author", digest = hash("a") } = {},
) {
  database
    .prepare(
      `INSERT INTO public_accounts (
        account_id, github_identity_hmac_sha256, github_login, github_profile_url,
        github_avatar_url, created_at, last_authenticated_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .run(id, digest, login, `https://github.com/${login}`, at, at);
}

function insertProposalShell(
  database,
  {
    id,
    kind,
    parentProposalId = null,
    parentRevision = null,
    author = "account-author",
  },
) {
  database
    .prepare(
      `INSERT INTO proposals (
        proposal_id, proposal_kind, author_account_id, parent_proposal_id,
        parent_revision, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, kind, author, parentProposalId, parentRevision, at);
  database
    .prepare(
      `INSERT INTO proposal_state_events (
        proposal_id, event_sequence, state_event_id, from_state, to_state,
        selected_revision, actor_account_id, rationale, source_timestamp, recorded_at
      ) VALUES (?, 1, ?, NULL, 'submitted', NULL, ?, 'Public submission', ?, ?)`,
    )
    .run(id, `state-${id}-1`, author, at, at);
}

function insertRevision(
  database,
  { id, revision = 1, author = "account-author" },
) {
  database
    .prepare(
      `INSERT INTO proposal_revisions (
        proposal_id, revision, revision_id, author_account_id, title, summary,
        rationale, scope, content_sha256, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      revision,
      `${id}-revision-${revision}`,
      author,
      `Title ${id} r${revision}`,
      "A bounded public proposal.",
      "A falsifiable rationale with explicit limits.",
      "This proposal revision only.",
      hash(revision % 2 === 0 ? "b" : "c"),
      at,
      at,
    );
}

function insertDetail(database, { id, revision = 1, kind }) {
  const common = [id, revision];
  switch (kind) {
    case "theoretical-model-member":
      database
        .prepare(
          `INSERT INTO theoretical_model_details
           VALUES (?, ?, ?, 'Candidate model', 'Explicit model definition', 'Bounded computation claim', 'candidate')`,
        )
        .run(...common, `model-${id}`);
      break;
    case "physical-material-member":
      database
        .prepare(
          `INSERT INTO physical_material_details
           VALUES (?, ?, ?, 'Candidate material', 'candidate-physical-material', 'Declared structure',
                   'No device validation is claimed', 'unvalidated-candidate')`,
        )
        .run(...common, `material-${id}`);
      break;
    case "physical-calculation-mechanism-member":
      database
        .prepare(
          `INSERT INTO physical_mechanism_details
           VALUES (?, ?, ?, 'Candidate mechanism', 'Physical process', 'Signal carrier', 'candidate')`,
        )
        .run(...common, `mechanism-${id}`);
      break;
    case "observation-interface-member":
      database
        .prepare(
          `INSERT INTO observation_interface_details
           VALUES (?, ?, ?, 'Candidate interface', 'coherent-quadrature', 'normalized',
                   'Explicit observation boundary', 'candidate')`,
        )
        .run(...common, `interface-${id}`);
      break;
    case "existing-member-assessment":
      database
        .prepare(
          `INSERT INTO existing_member_assessment_details
           VALUES (?, ?, 'physical-material', 'thin-film-litao3-candidate', 'unvalidated-candidate',
                   'No material instantiation', 'Evidence remains normalized-model only',
                   'The named registry member only')`,
        )
        .run(...common);
      break;
    case "existing-member-correction":
      database
        .prepare(
          `INSERT INTO existing_member_correction_details
           VALUES (?, ?, 'physical-material', 'thin-film-litao3-candidate', NULL,
                   'Corrected definition', NULL, NULL, 'The prior definition needs correction')`,
        )
        .run(...common);
      break;
    case "ontology-change":
      database
        .prepare(
          `INSERT INTO ontology_change_details
           VALUES (?, ?, 'revise-relation', 'morphism', 'Proposed typed relation',
                   'Requires explicit compatibility review', 'Maintainer-authored migration required')`,
        )
        .run(...common);
      break;
    case "explanatory-conjecture":
      database
        .prepare(
          `INSERT INTO explanatory_conjecture_details
           VALUES (?, ?, 'What bounded behavior needs explaining?',
                   'A candidate explanation with no earned standing',
                   'An explicit interaction is proposed as essential',
                   'This revision and declared coordinate framing only',
                   'A declared observation would refute the explanation')`,
        )
        .run(...common);
      database
        .prepare(
          `INSERT INTO explanatory_conjecture_assumptions
           VALUES (?, ?, ?, 1, 'The normalized boundary remains applicable')`,
        )
        .run(`assumption-${id}-1`, ...common);
      break;
    default:
      throw new Error(`unsupported kind: ${kind}`);
  }
}

function insertCompleteProposal(database, options) {
  insertProposalShell(database, options);
  insertRevision(database, options);
  insertDetail(database, options);
}

function insertModeration(
  database,
  {
    id,
    operator = "account-operator",
    actionKind,
    targetKind,
    proposalId = null,
    revision = null,
    criticismId = null,
    replyId = null,
    testReportId = null,
    interpretationId = null,
    accountId = null,
  },
) {
  database
    .prepare(
      `INSERT INTO moderation_actions (
        moderation_action_id, moderator_account_id, action_kind, target_kind,
        target_proposal_id, target_revision, target_criticism_id, target_reply_id,
        target_test_report_id, target_interpretation_id, target_account_id,
        reason_code, explanation, source_timestamp, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bounded-action',
                'An ordered administrative action with no epistemic meaning.', ?, ?)`,
    )
    .run(
      id,
      operator,
      actionKind,
      targetKind,
      proposalId,
      revision,
      criticismId,
      replyId,
      testReportId,
      interpretationId,
      accountId,
      at,
      at,
    );
}

test("schema admits every explicit proposal kind with one typed detail and no verdict fields", () => {
  const database = openDatabase();
  insertAccount(database);
  const kinds = [
    "theoretical-model-member",
    "physical-material-member",
    "physical-calculation-mechanism-member",
    "observation-interface-member",
    "existing-member-assessment",
    "existing-member-correction",
    "ontology-change",
    "explanatory-conjecture",
  ];
  kinds.forEach((kind, index) =>
    insertCompleteProposal(database, { id: `proposal-${index}`, kind }),
  );

  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_proposal_summaries")
      .get().count,
    8,
  );
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_schema_violations")
      .get().count,
    0,
  );
  assert.deepEqual(
    database
      .prepare(
        "SELECT DISTINCT proposal_kind FROM proposal_revision_detail_counts ORDER BY proposal_kind",
      )
      .all()
      .map((row) => row.proposal_kind),
    [...kinds].sort(),
  );

  const publicColumns = database
    .prepare("PRAGMA table_info(public_proposal_summaries)")
    .all();
  assert.ok(
    !publicColumns.some((column) => column.name.includes("identity_hmac")),
  );
  const allColumns = database
    .prepare(
      `SELECT m.name AS table_name, p.name AS column_name
       FROM sqlite_master m JOIN pragma_table_info(m.name) p
       WHERE m.type = 'table'`,
    )
    .all();
  const forbiddenVerdicts = new Set([
    "score",
    "votes",
    "vote",
    "rank",
    "truth",
    "confidence",
    "consensus",
  ]);
  assert.deepEqual(
    allColumns.filter((column) =>
      forbiddenVerdicts.has(column.column_name.toLowerCase()),
    ),
    [],
  );
});

test("revision history is immutable, contiguous, author-only, and closes after triage", () => {
  const database = openDatabase();
  insertAccount(database);
  insertAccount(database, {
    id: "account-other",
    login: "other",
    digest: hash("d"),
  });
  insertCompleteProposal(database, {
    id: "proposal-root",
    kind: "theoretical-model-member",
  });

  insertRevision(database, { id: "proposal-root", revision: 2 });
  insertDetail(database, {
    id: "proposal-root",
    revision: 2,
    kind: "theoretical-model-member",
  });
  assert.throws(
    () => insertRevision(database, { id: "proposal-root", revision: 4 }),
    /proposal revisions must be contiguous/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "UPDATE proposal_revisions SET title = 'rewritten' WHERE proposal_id = 'proposal-root'",
        )
        .run(),
    /immutable public record/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "UPDATE theoretical_model_details SET model_definition = 'rewritten'",
        )
        .run(),
    /immutable public record/,
  );

  database
    .prepare(
      `INSERT INTO proposal_state_events VALUES
       ('proposal-root', 2, 'state-root-2', 'submitted', 'triaged', NULL,
        'account-other', 'Operator triage', ?, ?)`,
    )
    .run(at, at);
  assert.throws(
    () => insertRevision(database, { id: "proposal-root", revision: 3 }),
    /revisions are allowed only while submitted/,
  );

  insertCompleteProposal(database, {
    id: "proposal-follow-up",
    kind: "theoretical-model-member",
    parentProposalId: "proposal-root",
    parentRevision: 2,
  });
  assert.deepEqual(
    {
      ...database
        .prepare(
          `SELECT parent_proposal_id, parent_revision FROM proposals
           WHERE proposal_id = 'proposal-follow-up'`,
        )
        .get(),
    },
    { parent_proposal_id: "proposal-root", parent_revision: 2 },
  );
});

test("criticism, reply, test, interpretation, reference, and moderation targets are exact and typed", () => {
  const database = openDatabase();
  insertAccount(database);
  insertCompleteProposal(database, {
    id: "proposal-a",
    kind: "observation-interface-member",
  });
  insertCompleteProposal(database, {
    id: "proposal-b",
    kind: "physical-material-member",
  });

  database
    .prepare(
      `INSERT INTO criticisms (
         criticism_id, proposal_id, target_revision, author_account_id,
         title, criticism, scope, source_timestamp, recorded_at
       ) VALUES
       ('criticism-1', 'proposal-a', 1, 'account-author', 'Boundary criticism',
        'The observation boundary may be underspecified.', 'Revision 1 only', ?, ?)`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO criticism_replies VALUES
       ('reply-1', 'criticism-1', 'proposal-a', 1, 'account-author',
        'The boundary is now stated explicitly.', ?, ?)`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO scoped_test_reports VALUES
       ('test-1', 'proposal-a', 1, 'account-author', 'Bounded test', 'Frozen protocol',
        'Observed result', 'One interpretation', 'inconclusive', ?, ?)`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO competing_interpretations VALUES
       ('interpretation-1', 'proposal-a', 1, 'account-author', 'Alternative reading',
        'The same observation permits a narrower explanation.', 'Revision 1 only', ?, ?)`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO proposal_references VALUES
       ('reference-1', 'proposal-a', 1, 'primary-source', 'Primary source',
        'https://example.org/source', ?, ?)`,
    )
    .run(at, at);

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO criticisms (
             criticism_id, proposal_id, target_revision, author_account_id,
             title, criticism, scope, source_timestamp, recorded_at
           ) VALUES
           ('criticism-bad', 'proposal-a', 99, 'account-author', 'Bad target',
            'No such revision', 'Invalid', ?, ?)`,
        )
        .run(at, at),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO criticism_replies VALUES
           ('reply-bad', 'criticism-1', 'proposal-b', 1, 'account-author',
            'Cross-target reply', ?, ?)`,
        )
        .run(at, at),
    /FOREIGN KEY constraint failed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO moderation_actions (
            moderation_action_id, moderator_account_id, action_kind, target_kind,
            target_proposal_id, target_revision, target_criticism_id,
            reason_code, explanation, source_timestamp, recorded_at
          ) VALUES ('moderation-bad', 'account-author', 'label', 'criticism',
                    'proposal-a', 1, 'criticism-1', 'scope', 'Ambiguous union', ?, ?)`,
        )
        .run(at, at),
    /CHECK constraint failed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO proposal_references VALUES
           ('reference-bad', 'proposal-a', 1, 'context', 'Insecure',
            'http://example.org/source', NULL, ?)`,
        )
        .run(at),
    /CHECK constraint failed/,
  );
});

test("problem-led records enforce exact focus, relation kinds, immutability, and framing classification", () => {
  const database = openDatabase();
  insertAccount(database);
  insertCompleteProposal(database, { id: "conjecture-a", kind: "explanatory-conjecture" });
  insertCompleteProposal(database, { id: "conjecture-b", kind: "explanatory-conjecture" });
  insertCompleteProposal(database, { id: "model-a", kind: "theoretical-model-member" });
  database.prepare(
    `INSERT INTO proposal_coordinate_framings VALUES
     ('framing-a','conjecture-a',1,1,'cintamani.coordinate-key.v1','coordinate-a','generation-a',
      'model','material','mechanism','interface','gap',NULL,'Conjectural gap framing')`,
  ).run();
  database.prepare(
    `INSERT INTO conjecture_relations VALUES
     ('relation-a','conjecture-a',1,'conjecture-b',1,'incompatible-with','Incompatible mechanisms',
      'These exact revisions','account-author',?,?)`,
  ).run(at, at);
  assert.throws(
    () => database.prepare(
      `INSERT INTO conjecture_relations VALUES
       ('relation-old-vocabulary','conjecture-a',1,'conjecture-b',1,'competes-with','Old vocabulary',
        'These exact revisions','account-author',?,?)`,
    ).run(at, at),
    /CHECK constraint failed/u,
  );
  database.prepare(
    `INSERT INTO criticisms (
       criticism_id,proposal_id,target_revision,author_account_id,title,criticism,scope,
       source_timestamp,recorded_at,focus_kind,focus_ref
     ) VALUES ('focused-a','conjecture-a',1,'account-author','Focused criticism',
       'The framing is not essential','This exact framing',?,?,'coordinate-framing','framing-a')`,
  ).run(at, at);
  assert.throws(
    () => database.prepare(
      `INSERT INTO criticisms (
         criticism_id,proposal_id,target_revision,author_account_id,title,criticism,scope,
         source_timestamp,recorded_at,focus_kind,focus_ref
       ) VALUES ('focused-bad','conjecture-b',1,'account-author','Bad focus',
         'Cross-revision focus','Invalid',?,?,'coordinate-framing','framing-a')`,
    ).run(at, at),
    /criticism focus must target an exact item/u,
  );
  assert.throws(
    () => database.prepare(
      `INSERT INTO criticisms (
         criticism_id,proposal_id,target_revision,author_account_id,title,criticism,scope,
         source_timestamp,recorded_at,focus_kind,focus_ref
       ) VALUES ('focused-wrong-kind','model-a',1,'account-author','Bad typed focus',
         'Model proposals do not have an explanatory claim','Invalid',?,?,'explanatory-claim',NULL)`,
    ).run(at, at),
    /criticism focus must target an exact item/u,
  );
  assert.throws(
    () => database.prepare("UPDATE proposal_coordinate_framings SET framing_rationale='changed'").run(),
    /immutable public record/u,
  );
  assert.throws(
    () => database.prepare(
      `INSERT INTO proposal_coordinate_framings VALUES
       ('framing-bad','conjecture-a',1,2,'cintamani.coordinate-key.v1','coordinate-b','generation-a',
        'model','material','mechanism','interface','admitted-cell',NULL,'Invalid cell classification')`,
    ).run(),
    /CHECK constraint failed/u,
  );
  assert.equal(database.prepare("SELECT COUNT(*) count FROM public_schema_violations").get().count, 0);
});

test("state history drives detectable caches and exports pin the selected state event", () => {
  const database = openDatabase();
  insertAccount(database);
  insertAccount(database, {
    id: "account-operator",
    login: "operator",
    digest: hash("e"),
  });
  insertCompleteProposal(database, {
    id: "proposal-export",
    kind: "existing-member-assessment",
  });

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO proposal_state_events VALUES
           ('proposal-export', 2, 'state-invalid', 'submitted', 'under-review', NULL,
            'account-operator', 'Skipped triage', ?, ?)`,
        )
        .run(at, at),
    /proposal state transition is not allowed/,
  );
  database
    .prepare(
      `INSERT INTO proposal_state_events VALUES
       ('proposal-export', 2, 'state-export-2', 'submitted', 'triaged', NULL,
        'account-operator', 'Triage', ?, ?)`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO proposal_state_events VALUES
       ('proposal-export', 3, 'state-export-3', 'triaged', 'selected-for-export', 1,
        'account-operator', 'Selected exact revision', ?, ?)`,
    )
    .run(at, at);

  database
    .prepare(
      `INSERT INTO maintainer_exports VALUES
       ('export-1', 'proposal-export', 1, 3, 'Exact revision and discourse snapshot', 1,
        '{}', ?, 'account-operator', ?)`,
    )
    .run(hash("f"), at);
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO maintainer_exports VALUES
           ('export-bad', 'proposal-export', 1, 2, 'Wrong state event', 1,
            '{}', ?, 'account-operator', ?)`,
        )
        .run(hash("0"), at),
    /FOREIGN KEY constraint failed/,
  );

  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM proposal_cache_drift").get()
      .count,
    0,
  );
  database
    .prepare(
      "UPDATE proposals SET current_admin_state = 'submitted' WHERE proposal_id = 'proposal-export'",
    )
    .run();
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM proposal_cache_drift").get()
      .count,
    1,
  );
});

test("operator authority is append-only, account-bound, and cannot lose its final holder", () => {
  const database = openDatabase();
  insertAccount(database, {
    id: "account-operator",
    login: "operator",
    digest: hash("d"),
  });
  insertAccount(database, {
    id: "account-second",
    login: "second",
    digest: hash("e"),
  });
  insertAccount(database);

  database
    .prepare(
      `INSERT INTO account_role_events (
        role_event_id, account_id, role, action_kind, actor_account_id,
        authority_kind, authority_ref, rationale, source_timestamp, recorded_at
      ) VALUES (
        'role-bootstrap', 'account-operator', 'operator', 'granted', NULL,
        'deployment-bootstrap', 'test-bootstrap', 'Initial test authority', ?, ?
      )`,
    )
    .run(at, at);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM current_account_roles WHERE role = 'operator'")
      .get().count,
    1,
  );

  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO account_role_events (
            role_event_id, account_id, role, action_kind, actor_account_id,
            authority_kind, authority_ref, rationale, source_timestamp, recorded_at
          ) VALUES (
            'role-second-bootstrap', 'account-second', 'operator', 'granted', NULL,
            'deployment-bootstrap', 'test-bootstrap-2', 'Invalid second bootstrap', ?, ?
          )`,
        )
        .run(at, at),
    /bootstrap is allowed only before the first role event/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO account_role_events (
            role_event_id, account_id, role, action_kind, actor_account_id,
            authority_kind, authority_ref, rationale, source_timestamp, recorded_at
          ) VALUES (
            'role-unauthorized', 'account-second', 'operator', 'granted', 'account-author',
            'operator', 'test-api', 'Unauthorized grant', ?, ?
          )`,
        )
        .run(at, at),
    /require an active operator actor/,
  );

  database
    .prepare(
      `INSERT INTO account_role_events (
        role_event_id, account_id, role, action_kind, actor_account_id,
        authority_kind, authority_ref, rationale, source_timestamp, recorded_at
      ) VALUES (
        'role-grant-second', 'account-second', 'operator', 'granted', 'account-operator',
        'operator', 'test-api', 'Add a second operator', ?, ?
      )`,
    )
    .run(at, at);
  database
    .prepare(
      `INSERT INTO account_role_events (
        role_event_id, account_id, role, action_kind, actor_account_id,
        authority_kind, authority_ref, rationale, source_timestamp, recorded_at
      ) VALUES (
        'role-revoke-first', 'account-operator', 'operator', 'revoked', 'account-second',
        'operator', 'test-api', 'Transfer operating authority', ?, ?
      )`,
    )
    .run(at, at);

  database
    .prepare("UPDATE public_accounts SET github_login = 'renamed-second' WHERE account_id = 'account-second'")
    .run();
  assert.equal(
    database
      .prepare("SELECT account_id FROM current_account_roles WHERE role = 'operator'")
      .get().account_id,
    "account-second",
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO account_role_events (
            role_event_id, account_id, role, action_kind, actor_account_id,
            authority_kind, authority_ref, rationale, source_timestamp, recorded_at
          ) VALUES (
            'role-revoke-final', 'account-second', 'operator', 'revoked', 'account-second',
            'operator', 'test-api', 'Would remove final operator', ?, ?
          )`,
        )
        .run(at, at),
    /final active operator cannot be revoked/,
  );
  assert.throws(
    () =>
      database
        .prepare("UPDATE account_role_events SET rationale = 'rewrite' WHERE role_event_id = 'role-bootstrap'")
        .run(),
    /immutable public record/,
  );
  assert.throws(
    () =>
      database
        .prepare("DELETE FROM account_role_events WHERE role_event_id = 'role-bootstrap'")
        .run(),
    /immutable public record/,
  );
});

test("OAuth nonce and session tables retain only digests and enforce operational bounds", () => {
  const database = openDatabase();
  insertAccount(database);
  database
    .prepare(
      `INSERT INTO oauth_state_nonces VALUES
       (?, '/proposals/new', '2026-08-11T18:00:00.000Z', '2026-08-11T18:10:00.000Z', NULL)`,
    )
    .run(hash("1"));
  database
    .prepare(
      `INSERT INTO public_sessions (
         session_token_sha256, csrf_token_sha256, account_id, created_at,
         expires_at, revoked_at, rotated_to_sha256
       ) VALUES (
         ?, ?, 'account-author', '2026-08-11T18:00:00.000Z',
         '2026-08-12T18:00:00.000Z', NULL, NULL
       )`,
    )
    .run(hash("2"), hash("3"));
  const nonceColumns = database
    .prepare("PRAGMA table_info(oauth_state_nonces)")
    .all()
    .map((row) => row.name);
  const sessionColumns = database
    .prepare("PRAGMA table_info(public_sessions)")
    .all()
    .map((row) => row.name);
  assert.ok(nonceColumns.includes("state_digest_sha256"));
  assert.ok(sessionColumns.includes("session_token_sha256"));
  assert.ok(sessionColumns.includes("csrf_token_sha256"));
  assert.ok(
    !sessionColumns.some(
      (name) => name.includes("oauth_token") || name.includes("raw_ip"),
    ),
  );
  assert.throws(
    () =>
      database
        .prepare(
          `INSERT INTO oauth_state_nonces VALUES
           (?, '/return', '2026-08-11T18:10:00.000Z', '2026-08-11T18:00:00.000Z', NULL)`,
        )
        .run(hash("4")),
    /CHECK constraint failed/,
  );
});

test("ordered moderation derives exact-revision visibility and effective contributor locks without deleting history", () => {
  const database = openDatabase();
  insertAccount(database);
  insertAccount(database, {
    id: "account-operator",
    login: "operator",
    digest: hash("e"),
  });
  insertCompleteProposal(database, {
    id: "proposal-moderated",
    kind: "theoretical-model-member",
  });
  assert.deepEqual(
    database
      .prepare(
        "SELECT from_state FROM allowed_proposal_state_transitions WHERE to_state = 'withdrawn' ORDER BY from_state",
      )
      .all()
      .map((row) => row.from_state),
    ["selected-for-export", "submitted", "triaged", "under-review"],
  );

  insertModeration(database, {
    id: "moderation-hide-r1",
    actionKind: "hide-from-listing",
    targetKind: "proposal-revision",
    proposalId: "proposal-moderated",
    revision: 1,
  });
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_proposal_summaries")
      .get().count,
    0,
  );
  assert.equal(
    database
      .prepare(
        "SELECT listing_visibility FROM current_listing_moderation WHERE moderation_action_id = 'moderation-hide-r1'",
      )
      .get().listing_visibility,
    "hidden",
  );

  insertRevision(database, { id: "proposal-moderated", revision: 2 });
  insertDetail(database, {
    id: "proposal-moderated",
    revision: 2,
    kind: "theoretical-model-member",
  });
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_proposal_summaries")
      .get().count,
    1,
  );
  assert.equal(
    database
      .prepare(
        "SELECT listing_visibility FROM current_listing_moderation WHERE moderation_action_id = 'moderation-hide-r1'",
      )
      .get().listing_visibility,
    "hidden",
  );

  insertModeration(database, {
    id: "moderation-hide-r2",
    actionKind: "hide-from-listing",
    targetKind: "proposal-revision",
    proposalId: "proposal-moderated",
    revision: 2,
  });
  insertModeration(database, {
    id: "moderation-restore-r2",
    actionKind: "restore-to-listing",
    targetKind: "proposal-revision",
    proposalId: "proposal-moderated",
    revision: 2,
  });
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM public_proposal_summaries")
      .get().count,
    1,
  );
  assert.deepEqual(
    database
      .prepare(
        "SELECT action_sequence FROM moderation_actions ORDER BY action_sequence",
      )
      .all()
      .map((row) => row.action_sequence),
    [1, 2, 3],
  );

  insertModeration(database, {
    id: "moderation-lock",
    actionKind: "lock-contributor",
    targetKind: "account",
    accountId: "account-author",
  });
  assert.equal(
    database
      .prepare(
        "SELECT is_locked FROM current_account_locks WHERE target_account_id = 'account-author'",
      )
      .get().is_locked,
    1,
  );
  insertModeration(database, {
    id: "moderation-unlock",
    actionKind: "unlock-contributor",
    targetKind: "account",
    accountId: "account-author",
  });
  assert.equal(
    database
      .prepare(
        "SELECT is_locked FROM current_account_locks WHERE target_account_id = 'account-author'",
      )
      .get().is_locked,
    0,
  );

  assert.throws(
    () =>
      insertModeration(database, {
        id: "moderation-invalid-lock",
        actionKind: "lock-contributor",
        targetKind: "proposal-revision",
        proposalId: "proposal-moderated",
        revision: 2,
      }),
    /CHECK constraint failed/,
  );
  assert.throws(
    () =>
      database
        .prepare(
          "DELETE FROM moderation_actions WHERE moderation_action_id = 'moderation-hide-r1'",
        )
        .run(),
    /immutable public record/,
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moderation_actions").get()
      .count,
    5,
  );
});
