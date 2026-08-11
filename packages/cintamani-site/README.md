# Cintamani site and public proposal plane

This package serves two deliberately separate projections through one Cloudflare Worker:

1. an accessible static Astro view generated from the canonical Rust/SQLite siege registry; and
2. an immediately public proposal, criticism, and administrative-history plane stored in D1.

The public plane is not another canonical registry. A Worker route can write only `PROPOSALS_DB`.
It has no filesystem, Git, domain-registry database, or canonical admission mutation binding.

## Authority and storage boundaries

| Record | Authority | Persistence | Mutation path |
| --- | --- | --- | --- |
| Canonical axes, cells, evidence, provenance | governed domain admission chain | tracked Git records plus ignored rebuildable SQLite projection | Rust `admission validate` → `preview` → authorized `promote` |
| Static browser snapshot | canonical domain CLI at build time | tracked deterministic JSON and generated Workers Assets | rebuild/check/generate/build |
| Public proposals and revisions | public D1 plane | Cloudflare D1 / local Wrangler SQLite | GitHub-authenticated Worker API |
| Criticism, replies, tests, interpretations | exact public proposal revision | append-only D1 rows | GitHub-authenticated Worker API |
| Administrative state, moderation, appeals | audited public administration | append-only D1 histories | D1-authorized operator or attributed appeal |
| Maintainer export | exact selected revision and state event | immutable, content-addressed D1 row | D1-authorized operator |
| Canonical admission link | receipt after external maintainer promotion | append-only D1 link | D1-authorized operator |

`submitted`, `triaged`, `under-review`, `selected-for-export`, `declined`, `withdrawn`,
`superseded`, and `admitted-link-recorded` are administrative states. They are not truth,
confidence, consensus, support, popularity, or rank. The product has no votes or computed
epistemic score.

## Canonical build-time snapshots

`scripts/generate-domain-snapshots.mjs` runs the shared Rust domain CLI with an explicit workspace
root. It rebuilds the ignored projection, requires every registry check to pass, reads `dimensions`,
follows all bounded `frontier` cursors while rejecting repeated cursors/coordinates and safety-bound
overflow, then serializes timestamp-free JSON under `src/data`.

The tracked snapshots remain:

- `dimensions.json` — four ordered axes, current assessment revisions, and source admissions;
- `frontier.json` — admitted cells and explicit bounded gaps;
- `registry-summary.json` — stable registry identity and clean invariant summary.

The D1 proposal plane does not alter these files. A successful public submission therefore never
appears as a canonical member or cell merely because it is visible in the browser.

## Public schema and behavior

The ordered `migrations/*.sql` define a strict SQLite/D1 schema. The migration is split because the
local D1 engine rejects a seven-branch compound `UNION`; the cardinality invariant uses explicit
`EXISTS` terms and a typed `CASE` instead. `scripts/check-public-d1.mjs` applies all migrations from
an empty isolated local D1 and verifies schema identity, invariant count, and foreign keys.

The schema has one stable proposal identity, immutable contiguous revisions, and a dedicated detail
table for each of these kinds:

- theoretical-model member;
- physical-material member;
- physical-calculation-mechanism member;
- observation-interface member;
- existing-member assessment;
- explicit existing-member correction;
- ontology change.

Every new axis member declares a canonical-vocabulary, non-evidentiary initial status. Interface
proposals also declare canonical observation kind and units; the maintainer bridge never invents
them. Existing-member targets are checked against the tracked canonical dimension snapshot.

The public proposal hub is a reading and filtering surface. Its single content-level `Submit
proposal` action opens the dedicated `/proposals/new/` page in a new tab; the hub does not contain an
inline mutation form or a second submission callout. The
focused submission page uses one readable column, asks for proposal kind before core and
kind-specific fields, and keeps optional evidence/references collapsed. It exposes explicit labels,
plain-language help, inline errors plus a focused error summary, a disabled `Publishing…` state, and
an immediate link to the newly public proposal. Entered values are retained on validation and
network failure. Linked follow-up query parameters are carried to this page without rewriting the
prior proposal.

Every page reserves one compact header utility for GitHub session state. It begins with a subtle
`Checking GitHub session…` skeleton, then resolves to `Sign in`, an `@login` account control with
optional `Operator`/`Locked` badges and `Sign out`, or an explicit endpoint diagnostic. There is no
persistent authentication-success banner and no full-width content auth strip. The Turnstile widget
is rendered on the submission page only after an authenticated, unlocked session is confirmed.

Criticism, replies, scoped tests, and competing interpretations retain exact revision foreign keys.
Edits append only while a proposal is `submitted`. After any triage transition, a change is a new
proposal with an exact parent proposal/revision link. Declined, withdrawn, superseded, criticized,
moderated, and appealed records remain readable.

The author may append a single-purpose withdrawal event from any nonterminal proposal state. That
route cannot select another state, and it uses the same GitHub session, origin/CSRF, Turnstile,
quota, and digest-bound idempotency checks as other public writes. Withdrawal never deletes the
proposal, revisions, criticism, or state history. Operators use `declined` or another audited
administrative transition rather than impersonating author withdrawal.

Moderation actions have a SQLite-assigned immutable order. `hide-from-listing` and
`restore-to-listing` derive the latest listing visibility of one exact typed target;
`lock-contributor` and `unlock-contributor` derive the latest effective account lock from a public
GitHub login resolved server-side. A proposal hide targets its exact current revision, not the
stable proposal identity: if its author appends a later revision while still submitted, the new
revision is listed unless separately hidden, while the originally hidden revision retains its
tombstone. Hidden current revisions disappear from the proposal collection and siege-overlay
counts, but their exact detail, content, ordered moderation history, and tombstone remain public.
No moderation action deletes a row.

An effective account lock blocks the contributor's ordinary public content mutations, including
revision and withdrawal, but preserves anonymous/authenticated reads, logout, and the contributor's
ability to appeal the exact locking action. Operator writes remain available. Appeal
state changes and every restore/unlock are separate ordered public records.

## Security contract

All reads are anonymous. Every public content mutation requires:

- a GitHub OAuth identity;
- exact same-origin verification;
- a session-bound CSRF token in `X-CSRF-Token`;
- successful Turnstile verification;
- a bounded `Idempotency-Key` and request digest;
- bounded plain-text/JSON inputs and HTTPS references without URL user information;
- both account and HMAC-IP hourly quota capacity.

OAuth state is HMAC-bound to a secure short-lived cookie and a single-use D1 nonce. The callback
atomically consumes it; expiry and replay fail. GitHub access tokens exist only long enough to read
the `/user` identity and are never stored. The stable numeric GitHub subject is stored only as a
keyed digest. Public attribution exposes only login, profile URL, and optional avatar—never email,
numeric ID, internal account ID, OAuth token, or raw IP.

Sessions use opaque CSPRNG bearer tokens in `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
D1 stores only token and CSRF-token SHA-256 values plus expiry/revocation/rotation state. OAuth,
identity, CSRF, Turnstile, and IP-HMAC secrets are distinct. Operator authority is derived from the
latest append-only `account_role_events` row for the stable D1 account identity; mutable GitHub
logins and Worker environment variables grant no authority. Operator actions require origin and
CSRF, but not Turnstile. Role grants and revocations are themselves operator-authorized, append-only
events, and the database refuses revocation of the final active operator. CSP and standard response
hardening headers apply to API and asset responses. Missing production secrets fail closed on writes
while health and public reads remain diagnostic.

## Deterministic export and maintainer handoff

An authorized operator may first select an exact revision through an audited state event, then
create an immutable export. The canonical, key-sorted JSON includes source timestamps, selected
revision, selected state event, typed detail/evidence/references, and the criticism/test/
interpretation snapshot. It explicitly says `criticisms_non_exhaustive: true`; it excludes an
export-time timestamp from the hashed body. Its SHA-256 is the export identity.

The Worker cannot promote an export. A maintainer downloads the public export wrapper and runs:

```text
pnpm site:prepare-admission -- \
  --export path/to/public-export.json \
  --out .narada/kb/cintamani-domain/drafts/public-proposal.json \
  --record-id admission-public-proposal-example \
  --admitted-at 2026-08-11
```

For an existing-member assessment, the maintainer must additionally declare the exact next
`--assessment-revision`, `--assessment-event-kind assessment|correction|supersession`, and, for a
material, `--material-classification`. Evidence-bearing statuses are refused without an explicit
same-admission Ledger evidence mapping. Explicit corrections and ontology changes are intentionally
not auto-translated: they require a maintainer-authored typed correction or schema migration.

The script verifies the export hash and exact selection, refuses overwriting the output, and emits a
schema-2 domain draft. Candidate axis-member drafts contain the identity, revision-1 non-evidentiary
assessment, and exact definition/limitation provenance naming proposal, revision, and export digest.
The maintainer must still run the canonical commands with real authority:

```text
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- \
  --workspace-root . --format json admission validate <draft>
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- \
  --workspace-root . --format json admission preview <draft> \
  --admitted-by <actor> --authority-kind <kind> --authority-ref <receipt> \
  --expected-head <current-head>
# promote only after the independent preview and authority decision
```

Tests run real `validate` and non-mutating `preview` for all four axis mappings and prove canonical
HEAD and the live domain SQLite file remain byte-identical. Only after an external promotion may an
operator append its receipt to `admission_links` in public D1.

## Local commands

```text
pnpm generate:data       # write canonical static snapshots
pnpm check:data          # prove snapshot byte determinism
pnpm db:check            # fresh local-D1 migration/invariant/FK proof
pnpm db:migrate:local    # migrate the persistent Wrangler local D1
pnpm operator:bootstrap  # one-time initial D1 operator grant; pass local/remote, login, authority ref
pnpm dev:astro           # static UI only, with Astro HMR
pnpm dev                 # build assets, migrate local D1, run full Worker
pnpm check               # data, D1, and Astro diagnostics
pnpm test                # schema, Worker/security, UI, export, and handoff tests
pnpm test:visual         # deterministic 1440×1000 signed-out/signed-in Playwright audit
pnpm build               # deterministic static asset build
pnpm worker:dry-run      # bundle Worker and report bindings without deployment
pnpm preview             # full local Worker preview
pnpm ship                # build, apply remote D1 migrations, deploy Worker
```

The visual audit waits for all four axis cards and a settled proposal list before every full-page
screenshot. It writes ignored artifacts under `output/ux-audit/`, serves the checked static build,
and supplies deterministic config/list fixtures from the tracked dimension snapshot plus signed-out
and mocked signed-in session responses.

`ship` is an authorized release operation, not an ordinary verification command.

## Cloudflare and GitHub provisioning

No production resource is invented during local development. Before the first deployment, an
authorized operator must:

1. create a separate D1 database (intended name `cintamani-public-proposals`) and replace the
   all-zero `database_id` in `wrangler.jsonc`;
2. create a GitHub OAuth App with the production callback
   `https://<worker-host>/api/auth/github/callback`;
3. create a Turnstile widget limited to the production hostname;
4. set non-secret configuration `GITHUB_CLIENT_ID` and `TURNSTILE_SITE_KEY`;
5. set distinct secrets `GITHUB_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `CSRF_SECRET`,
   `IDENTITY_HMAC_SECRET`, `IP_HASH_SECRET`, and `TURNSTILE_SECRET_KEY`;
6. apply remote D1 migrations before deploying Worker code;
7. once, bootstrap the first existing GitHub account with
   `pnpm operator:bootstrap -- --remote --github-login <login> --authority-ref <receipt>`;
8. run a disposable production smoke proposal/criticism/revision/moderation/appeal/export flow,
   verify it remains outside the canonical registry, and do not promote it.

The Worker name remains `cintamani`. Provisioning, remote migration, deployment, and smoke mutation
must wait for explicit review and authorization.

## Scientific perimeter

Neither static publication nor public proposal visibility strengthens the scientific record.
Thin-film LiTaO3 remains an unvalidated candidate; normalized observation noise is not physical
detector calibration; no nonlinear target replicated; no connected physical parameter region or
Conjecture 5 is admitted.