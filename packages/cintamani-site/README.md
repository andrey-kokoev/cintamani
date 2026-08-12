# Cintamani site and public proposal plane

This package serves two deliberately separate projections through one Cloudflare Worker:

1. an accessible static Astro view generated from the canonical Rust/SQLite search registry; and
2. an immediately public proposal, criticism, and administrative-history plane stored in D1.

The public plane is not another canonical registry. A Worker route can write only `PROPOSALS_DB`.
It has no filesystem, Git, domain-registry database, or canonical admission mutation binding.

## Authority and storage boundaries

| Record | Authority | Persistence | Mutation path |
| --- | --- | --- | --- |
| Canonical axes, cells, evidence, provenance | governed domain admission chain | tracked Git records plus ignored rebuildable SQLite projection | Rust `admission validate` → `preview` → authorized `promote` |
| Static browser snapshot | canonical domain CLI at build time | tracked deterministic JSON and generated Workers Assets | rebuild/check/generate/build |
| Public proposals and revisions | public D1 plane | Cloudflare D1 / local Wrangler SQLite | GitHub or Base-wallet contributor API; optional x402 publication lane |
| Criticism, replies, tests, interpretations | exact public proposal revision | append-only D1 rows | authenticated contributor API |
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
- `research-topics.json` — bounded current governed topics with exact history and provenance;
- `registry-summary.json` — stable registry identity and clean invariant summary.

The D1 proposal plane does not alter these files. A successful public submission therefore never
appears as a canonical member or cell merely because it is visible in the browser.

## Public schema and behavior

The ten ordered `migrations/*.sql` files define public schema version 6 in strict SQLite/D1. The
initial invariant migration is split because the
local D1 engine rejects a seven-branch compound `UNION`; the cardinality invariant uses explicit
`EXISTS` terms and a typed `CASE` instead. `scripts/check-public-d1.mjs` applies all migrations from
an empty isolated local D1 and verifies schema identity, both invariant views, and foreign keys.
Migrations 0005–0006 introduce generic contributor principals, backfill every existing GitHub
account without changing its stable identifier, and rebuild every affected foreign key through an
atomic shadow-table cutover. Migration 0007 adds the x402 reservation, payment-event, encrypted
receipt, retry-entitlement, reconciliation, and proposal-source records. Migration 0008 makes a
current, directly verified GitHub-wallet counterpart eligible for future author actions while
leaving every stored author and prior revision untouched. Link revocation removes that eligibility.
Migration 0009 losslessly rebuilds the proposal/revision/criticism core to add problem-led
explanatory conjectures, exact typed criticism focus, immutable assumptions, generation-pinned
coordinate framings, and exact-version inter-conjecture relations. Its splitter regression proves
that representative persisted prefixes either roll back or converge on replay.
Migration 0010 losslessly rebuilds the same CHECK-constrained core to add research-topic proposals,
typed topic detail/loci/origins/relations, topic coordinate framings, and exact focused criticism.
It preserves every prior row and history, rejects incompatible typed unions, and is tested under
Wrangler's SQL splitter, partial-prefix replay, and late-failure rollback.

The schema has one stable proposal identity, immutable contiguous revisions, and a dedicated detail
table for each of these kinds:

- theoretical-model member;
- physical-material member;
- physical-calculation-mechanism member;
- observation-interface member;
- existing-member assessment;
- explicit existing-member correction;
- ontology change;
- explanatory conjecture.
- research topic.

Every new axis member declares a canonical-vocabulary, non-evidentiary initial status. Interface
proposals also declare canonical observation kind and units; the maintainer bridge never invents
them. Existing-member targets are checked against the tracked canonical dimension snapshot.
An explanatory conjecture instead requires a problem statement, explanatory claim, essential
mechanism, scope, failure condition, and unresolved assumptions. It may have zero or more
coordinate framings. The server accepts only a current checked coordinate key and generation, then
derives all four members, `admitted-cell|gap`, and optional cell ID from the build-time snapshot;
client classifications are never trusted. A coordinate frames where a conjecture purports to
apply. It is neither an epistemic object nor evidence that the coordinate is realizable.

Exact-version conjecture relations use only `rival-to`, `reclassifies`, `equivalent-to`,
`incompatible-with`, `supersedes`, and `addresses-same-problem`. Each relation is itself a public,
criticizable claim. It does not merge identities, reclassify a canonical coordinate, supersede a
state, or otherwise cause an automatic registry or administrative transition.

A research topic is a stable fallible prompt rather than a free-form tag. Every revision requires
an open problem, why it remains open, bounded scope, the next discriminating criticism or test,
explicit non-claims, at least one locus, and at least one exact problem/conjecture origin. Loci are
multi-valued: `theoretical`, `simulation`, `physical-material`, `mechanism`, `observation`,
`control-resource`, `experimental`, and `ontology`. Optional search-coordinate framings remain
conjectural organization. Topic relations are exact-version claims using only `depends-on`,
`rival-to`, `complements`, `refines`, `reclassifies`, and `addresses-same-problem`; they never
merge identities or change workflow. `active|paused|retired` is administrative visibility only,
never answered, true, important, prioritized, ranked, or supported.

`/research-topics/`, stable detail URLs, and `/api/research-topics` publish the bounded collection
with locus/status/origin/coordinate/text filtering, filter-bound cursors, exact history, and
provenance. The six chiral-nematic topics are an explicitly illustrative, unadmitted fixture. They
cite Wu et al. (arXiv:2410.19293) and Hall et al. (Nature Physics 22, 103–111, 2026) only for their
reported defect algebra/structures and driven reconnection observations; they do not infer or
admit interaction-net rewriting, a prospective coordinate, evidence, or D1 proposal content.

The public proposal hub is a reading and filtering surface. Its single content-level `Submit
proposal` action opens the dedicated `/proposals/new/` page in a new tab; the hub does not contain an
inline mutation form or a second submission callout. The submission page offers two explicit lanes:
GitHub publication is free and human-gated; Base-wallet publication costs exactly `$0.01` USDC only
after the complete proposal passes local and server validation. Payment purchases publication
friction only and never evidence, rank, endorsement, selection, or canonical admission. The
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
tombstone. Hidden current revisions disappear from the proposal collection and search-overlay
counts, but their exact detail, content, ordered moderation history, and tombstone remain public.
No moderation action deletes a row.

An effective account lock blocks the contributor's ordinary public content mutations, including
revision and withdrawal, but preserves anonymous/authenticated reads, logout, and the contributor's
ability to appeal the exact locking action. Operator writes remain available. Appeal
state changes and every restore/unlock are separate ordered public records.

## Security contract

All reads are anonymous. Every public content mutation requires a current contributor principal, a
bounded `Idempotency-Key` bound to the normalized request digest, bounded plain-text/JSON inputs,
HTTPS references without URL user information, and contributor/IP/global quota capacity. Transport
controls are explicit:

- a GitHub browser-cookie write requires exact same-origin verification, the session-bound
  `X-CSRF-Token`, Turnstile, and contributor/IP/global quotas;
- a Base-wallet browser-cookie write requires exact same-origin verification, the session-bound
  `X-CSRF-Token`, and wallet/IP/global quotas; its verified wallet identity replaces Turnstile rather
  than bypassing quotas or locks;
- an SIWX agent bearer write has no browser Origin or CSRF requirement because its authorization is
  non-ambient, but retains wallet/IP/global quotas and contributor locks;
- operator-cookie writes require operator authority, same-origin, and CSRF, but neither Turnstile nor
  payment.

OAuth state is HMAC-bound to a secure short-lived cookie and a single-use D1 nonce. The callback
atomically consumes it; expiry and replay fail. GitHub access tokens exist only long enough to read
the `/user` identity and are never stored. The stable numeric GitHub subject is stored only as a
keyed digest. Public attribution exposes only login, profile URL, and optional avatar—never email,
numeric ID, internal account ID, OAuth token, or raw IP.

Sessions use opaque CSPRNG bearer tokens in `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax` cookies.
D1 stores only token and CSRF-token SHA-256 values plus expiry/revocation/rotation state and
append-only session events. OAuth,
identity, CSRF, Turnstile, and IP-HMAC secrets are distinct. Operator authority is derived from the
latest append-only `account_role_events` row for the stable D1 account identity; mutable GitHub
logins and Worker environment variables grant no authority. Operator actions require origin and
CSRF, but not Turnstile. Role grants and revocations are themselves operator-authorized, append-only
events, and the database refuses revocation of the final active operator. CSP and standard response
hardening headers apply to API and asset responses. Missing production secrets fail closed on writes
while health and public reads remain diagnostic.

SIWX challenges are five-minute, single-use records bound to exact canonical origin, verification
URI, Base network, purpose (`session`, `link`, or `revoke`), and transport (`browser-cookie` or
`agent-bearer`). Verification uses the official SIWX extension with an explicit HTTPS Base RPC and
supports EOA and compatible smart-wallet signatures. A link or revocation additionally requires the
current GitHub cookie session plus Origin/CSRF, and appends an identity-link event; it never merges
principals or rewrites attribution. Current direct links allow either counterpart to perform future
author-only revision/withdrawal actions; an effective lock on either currently linked counterpart
blocks ordinary writes across that pair without preventing reads, logout, or appeal.

Raw wallet addresses, transaction hashes, payment payloads, receipts, internal principal IDs, and
internal payment IDs never appear in public application JSON. D1 stores a unique full keyed address
digest and publishes only a deterministic `base:<prefix>` pseudonym. Prefix length extends in fixed
increments on the unlikely collision, while moderator lookup requires one exact, unambiguous public
GitHub login or wallet pseudonym. Payment payloads and settlement receipts are encrypted at rest and
separately hash-checked before a retry can use them.

## x402 publication and recovery

`POST /api/x402/proposals` is the separate wallet publication lane. It validates and normalizes the
entire typed proposal before creating a challenge, reserves the exact idempotency-key/body pair in
D1, and uses pinned official x402 v2 libraries. The only accepted terms are the `exact` scheme,
10,000 atomic USDC units (`$0.01`), the configured Base network, and the dedicated configured
receiver. Legacy x402 v1 headers are rejected. `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` are encoded
by the official SDK rather than locally invented.

The durable sequence is `reserved → verifying → verified → settling → settled → finalizing →
finalized`. Rejection, expiry, and indeterminate settlement are explicit terminal/holding branches.
Every transition is append-only and cached current state is checked for drift. A verified intent
reloads its encrypted request-local payer/payment context before one settlement attempt. A request
found in `settling` is conservatively moved to reconciliation and is never settled a second time.
One definitive settlement can finalize only its original normalized body into one proposal.

A definitive settlement response always returns its standard `PAYMENT-RESPONSE`, even when D1
finalization fails. In that case the client receives HTTP 503 plus an opaque retry reference and
must retry the same body and `Idempotency-Key` without paying again. The status/retry endpoints bind
both values, disclose only safe state, and never call the facilitator for an available receipt. An
indeterminate outcome opens reconciliation and omits a definitive settlement receipt; a rejected
settlement returns its official rejection receipt. These operational records create no scientific
standing.

x402 is fail-closed and disabled unless `X402_ENABLED=true`. `X402_MODE=testnet` selects Base
Sepolia and the public test facilitator; `production` selects Base mainnet and requires explicit CDP
facilitator credentials. Both modes require `X402_PAY_TO`, `X402_ENVELOPE_SECRET`, and the matching
explicit HTTPS `BASE_SEPOLIA_RPC_URL` or `BASE_RPC_URL`. Test-only facilitator injection is accepted
only when `ENVIRONMENT=test`; a production Worker cannot select it.

The public machine contract is intentionally small:

| Route | Purpose |
| --- | --- |
| `GET /api/config`, `GET /api/health` | anonymous discovery and fail-closed readiness |
| `GET /api/auth/wallet/challenge?purpose=session&transport=browser-cookie|agent-bearer` | create a non-payment SIWX session challenge |
| `POST /api/auth/wallet/challenge?purpose=link|revoke&transport=browser-cookie` | create a GitHub-cookie, Origin/CSRF-bound identity-link challenge |
| `POST /api/auth/wallet/verify?...` with `SIGN-IN-WITH-X` | consume the exact signed challenge; issue a cookie/bearer or append the link event |
| `POST /api/x402/proposals` | validate, reserve, challenge/verify/settle once, and publish |
| `POST /api/x402/proposals/status/:retry-reference` | read safe state for the same body/key without facilitator access |
| `POST /api/x402/proposals/retry/:retry-reference` | finalize the same settled body without another payment |
| ordinary revision/withdrawal routes with `Authorization: Bearer …` | linked or original author follow-up, still quota/lock constrained |

Link and revoke requests carry the GitHub browser cookie and `X-CSRF-Token`; the raw wallet address
exists only inside the signed SIWX proof. x402 status/retry requests carry the original bounded
`Idempotency-Key` and exact proposal JSON. Neither route accepts internal identifiers.

## Deterministic export and maintainer handoff

An authorized operator may first select an exact revision through an audited state event, then
create an immutable export. The canonical, key-sorted JSON includes source timestamps, selected
revision, selected state event, typed detail/evidence/references, and the criticism/test/
interpretation snapshot. It explicitly says `criticisms_non_exhaustive: true`; it excludes an
export-time timestamp from the hashed body. Its SHA-256 is the export identity.
For an explanatory conjecture, the bridge emits a candidate problem/version,
conjecture/version, an explicitly `open` non-evidentiary disposition, zero or more exact framings,
and definition/limitation provenance tied to the source proposal, revision, and export digest. It
does not create a cell, morphism, path, assessment, or scientific status and never promotes HEAD.
For a research topic with already governed exact origins, the bridge emits a candidate stable topic,
revision 1, its multi-locus and origin links, an `active` non-epistemic workflow event, and exact
export-digest provenance. It refuses public-only origins, prospective coordinate links, and public
topic relations until the referenced identities are governed; it never invents those links.

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
  schema-2-compatible domain draft consumed by the schema-4 projection. Candidate axis-member drafts contain the identity, revision-1 non-evidentiary
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

The problem/topic-led UI, public schema, fixture, and bridge are organizational engineering, not
new scientific evidence or roadmap authority, so this change creates no Ledger entry. Concurrent
computing-paradigms pages and their unrelated layout/CSS/test hunks remain separate user work.

Human-facing UI/docs and safe presentation symbols use **search space**, **search coordinate**,
**search cell**, and **search overlay**. Frozen canonical admissions and durable internal contracts
retain legacy `siege_*` SQLite/view, serialized admission, Rust variant, and registry-count names;
renaming those identifiers would break historical hashes and consumers.

## Local commands

```text
pnpm generate:data       # write canonical static snapshots
pnpm check:data          # prove snapshot byte determinism
pnpm db:check            # fresh local-D1 migration/invariant/FK proof
pnpm db:migrate:local    # migrate the persistent Wrangler local D1
pnpm operator:bootstrap  # one-time initial D1 operator grant; pass local/remote, login, authority ref
pnpm dev:astro           # static UI only, with Astro HMR
pnpm dev                 # build assets, migrate local D1, run full Worker
pnpm x402:agent          # read-only config/health discovery; never signs or pays by default
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

The executable agent fixture remains read-only unless the operator adds `--pay` and supplies
`X402_AGENT_PRIVATE_KEY`, `X402_AGENT_IDEMPOTENCY_KEY`, and the expected test network. Paid mode
locally validates the same proposal shape, enforces x402 v2/exact/$0.01/network discovery before
reading the key, preserves one key/body across retry, then obtains an SIWX bearer to append one
revision and withdraw the disposable record. It never prints the key. Running paid mode is a real
wallet mutation and requires separate authorization.

## Cloudflare and GitHub provisioning

The Task 4 Worker, D1, GitHub OAuth, Turnstile, non-payment secrets, initial operator role, and
disposable production acceptance record are already provisioned as recorded in Ledger 16. Task 5
must preserve that plane, apply its additive migrations before compatible Worker code, and must not
recreate or replace those resources. No payment receiver or facilitator credential is invented
during local development.

For x402 specifically, the operator must additionally:

1. keep `X402_ENABLED=false` (or absent) through the current schema-v6 migration and ordinary deployment;
2. migrate a production-like local D1 and a disposable remote-style copy, checking preservation,
   partial-prefix replay, schema violations, and foreign keys before touching production D1;
3. designate a dedicated user-controlled Base receiver and set `X402_PAY_TO` without putting wallet
   secrets in source;
4. set a distinct `X402_ENVELOPE_SECRET`, explicit HTTPS Base RPC bindings, and production-only
   `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET` through Worker secrets;
5. enable `X402_MODE=testnet` on an isolated Base Sepolia deployment, execute the bounded paid agent
   flow, prove public pseudonymous visibility, linked-author revision/withdrawal, retry behavior, and
   unchanged canonical HEAD/domain SQLite, then disable it;
6. review D1 payment-event/receipt/reconciliation counts without exposing payloads, and only then
   authorize the mainnet configuration and one real `$0.01` smoke;
7. on a code regression, route traffic back to the prior Worker version while retaining the migrated
   D1 and append-only payment records; set `X402_ENABLED=false` before rollback if payment safety is
   uncertain. Never down-migrate or delete receipts to roll back code.

The Worker name remains `cintamani`. Provisioning, remote migration, deployment, and smoke mutation
must wait for explicit review and authorization.

### Suspended isolated x402 testnet checkpoint

Task 5 stopped by Operator direction before enablement or payment. The retained isolated resources
are operational scaffolding, not a completed acceptance gate:

- D1 `cintamani-public-proposals-x402-testnet`, identifier
  `1a87c5d2-10d4-4f90-b143-3e5d0b5aad89`, region ENAM, has all eight migrations applied. Remote
  inspection resolved projection kind `cintamani-public-proposals`, schema version 4, zero rows in
  both violation views, no foreign-key violations, and zero proposal, revision, payment-intent,
  payment-event, receipt, retry-entitlement, reconciliation, or payment-source rows.
- Worker `https://cintamani-x402-testnet.andrei-kokoev.workers.dev` serves only that D1. Active
  version `5ff30bbd-c925-4fad-aa2c-eec812db8bf8` is the preferred secret-equipped disabled rollback
  version. Original no-secret rollback version `64a8586b-f9d3-4621-b4e1-70976a80442d` is retained.
  The original upload reported 37 ms startup; the receiver-bound code predecessor of the active
  version reported 47 ms and has the same script etag. Both are below the one-second startup gate.
- Public disabled smoke returned schema version 4 with both invariant counts zero,
  `requested_enabled: false`, `enabled: false`, and HTTP 503 `x402_disabled` from the paid route.
- The dedicated disposable receiver is `0x4C00c36Ff12E006dc260bC1523578481854a407c`.
  The disposable payer is `0xa1a1D7800ad8c8082F8d9579e8D7841BB567D574`. At the suspension
  check its public Base-Sepolia balances were exactly zero ETH and zero atomic USDC; the receiver was
  also empty. No payment authorization was signed or submitted.
- The payer and receiver private keys plus distinct test-only `X402_ENVELOPE_SECRET`,
  `IDENTITY_HMAC_SECRET`, `IP_HASH_SECRET`, and `CSRF_SECRET` values exist only in the ignored
  current-user DPAPI vault `.wrangler/testnet/testnet-credentials.dpapi`. The vault SHA-256 at the
  checkpoint was `3DDE22AA842BC7A982F550004A4F9C00548DB47D8DF40992EA51A3EDBA7B58EA`.
  Secret values were never printed or committed. The enabled ignored config
  `.wrangler/testnet/wrangler.enabled.jsonc` is prepared but has never been uploaded.

To resume the Base-Sepolia gate without changing its predeclared terms:

1. use the public Circle faucet at `https://faucet.circle.com`, select USDC and Base Sepolia, enter
   the disposable payer address above, and complete its human reCAPTCHA; do not automate or bypass
   that control;
2. read the official Base-Sepolia USDC contract
   `0x036CbD53842c5426634e7929541eC2318f3dCF7e` and require payer balance at least 10,000 atomic units
   before uploading anything enabled;
3. rerun local gates, canonical hashes, remote D1 metadata/invariants/foreign keys/counts, and active
   deployment readback; then upload the ignored enabled config as an undeployed version, confirm
   inherited secrets, isolated bindings, exact receiver, and startup below one second;
4. deploy that version only to `cintamani-x402-testnet`, verify health/config readiness and run the
   agent fixture in discovery-only mode before authorizing payment;
5. authorize exactly one 10,000-atomic test-USDC payment with one fixed idempotency key/body. If the
   result is unknown, retain its reconciliation record and never retry with a new key or pay again;
6. verify immediate anonymous `submitted · unreviewed` visibility with public pseudonym only, one
   settlement/receipt/source/proposal, the SIWX bearer revision, retained withdrawal history,
   schema invariants, foreign keys, and unchanged canonical Git HEAD/domain SQLite bytes;
7. route 100% traffic back to preferred disabled version `5ff30bbd-c925-4fad-aa2c-eec812db8bf8`
   immediately after the bounded smoke. Preserve the isolated D1 and append-only history; never
   down-migrate or delete the reconciliation/receipt evidence.

Production remains a later, separately authorized gate. It requires successful architect review of
the real isolated testnet result; preservation-safe application of migrations 0005–0008 to the
production public D1; a dedicated Base-mainnet receiver; an explicit production Base RPC; separate
production `X402_ENVELOPE_SECRET` and CDP facilitator credentials; an enabled version with measured
startup/health; authorization for exactly one real 10,000-atomic USDC payment; retained production
proposal/revision/withdrawal evidence; and rollback to a known disabled production version. Until
those gates occur, Task 5 acceptance criteria 11 and 12 remain incomplete and x402 must remain
disabled.

## Scientific perimeter

Neither static publication nor public proposal visibility strengthens the scientific record.
Thin-film LiTaO3 remains an unvalidated candidate; normalized observation noise is not physical
detector calibration; no nonlinear target replicated; no connected physical parameter region or
Conjecture 5 is admitted.
