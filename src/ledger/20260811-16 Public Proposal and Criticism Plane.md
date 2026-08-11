# Public Proposal and Criticism Plane

## Status

Cintamani now has a deployed public proposal and criticism plane at
`https://cintamani.andrei-kokoev.workers.dev`. It combines a static Astro interface, a Cloudflare
Worker API, and a separate D1 database. Public reads are anonymous. Public writes require a GitHub
session and the declared write controls.

This plane records proposals, criticism, tests, interpretations, and administrative history. It is
not a scientific instrument and is not part of the canonical domain registry. Publication,
selection, moderation, or export does not establish truth, confidence, consensus, replication, or
scientific rank.

## Authority and storage boundaries

The following surfaces remain distinct:

1. `.narada/kb/cintamani-domain` contains the tracked, tamper-evident canonical admission chain.
2. `.narada/db/cintamani-domain.sqlite` is the ignored, rebuildable canonical projection.
3. Per-run evidence databases remain experimental artifacts owned by their protocols.
4. The public `cintamani-public-proposals` D1 database holds contribution and workflow history. It
   has no authority to write the canonical registry.
5. Task Lifecycle owns assignment, implementation evidence, review, and closure.
6. `src/ledger` remains the human-readable record of decisions and limits.

The Worker has no canonical registry binding. A public record can affect the canonical chain only
after an explicit maintainer export, independent validation and preview, and a governed admission
decision.

## Typed public schema and immutable history

The public database identifies itself as schema version 2. Four ordered migrations define:

- proposals and seven typed detail families: the four siege-axis member kinds, existing-member
  assessment, explicit correction, and ontology change;
- immutable, contiguous proposal revisions and exact-revision references;
- public criticisms, replies, scoped test reports, competing interpretations, and references;
- append-only administrative state, moderation, appeal, export, admission-link, session, quota,
  and operator-role records;
- drift and invariant checks for the deliberately cached current proposal state.

This is an explicit relational schema rather than an entity-attribute-value scientific state. A
submitted proposal is public immediately as `submitted` and `unreviewed`. While it remains
submitted, an author edit appends a revision. After triage, follow-up work is a new linked proposal.
No route silently replaces or deletes the earlier revision, state event, criticism, test, or
moderation record.

Administrative states such as submitted, selected, declined, withdrawn, and superseded describe
workflow only. They are never converted into epistemic scores. The service exposes no voting,
popularity ranking, or computed scientific verdict.

## Security and operational authority

GitHub OAuth writes a short-lived, cookie-bound, single-use state nonce. A successful callback
rotates to an opaque session token; D1 retains digests rather than the raw session token. Session
expiry, logout, and rotation revoke operational access. Public content mutations require a valid
session, matching origin, a session-bound CSRF token, a successful Turnstile result, an idempotency
key, bounded validated input, and account and pseudonymous IP quotas. HTTPS references are bounded,
and public identity responses expose a GitHub handle and profile data without email, numeric GitHub
identifier, raw IP, identity digest, or internal account identifier.

Every public content mutation, including criticism, reply, test, interpretation, revision, appeal,
and withdrawal, passes the same Turnstile and quota boundary. Missing production secrets fail
closed for writes while health and anonymous reads remain diagnosable.

Effective operator authority comes only from append-only D1 role events. The retained
`MODERATOR_GITHUB_LOGINS` deployment variable grants no authority. Moderation is itself an ordered,
audited history: hide and restore derive listing visibility without removing exact public detail;
lock and unlock derive contributor write access without preventing reads, logout, or an appeal;
appeal state changes are also explicit records.

## Browser surface

The accessible ochre interface keeps session state in a compact header utility and provides a
focused, single-column proposal page. Contributors choose the proposal kind before entering the
core claim, scope, and kind-specific fields. Optional evidence and references remain secondary.
Labels, bounded examples, inline errors, an error summary, focus of the first invalid field,
loading state, and a published-record link make the write path explicit without exposing raw JSON.

The proposal hub shows the four ordered siege dimensions, public proposals, and the boundary
between selection and admission. Exact proposal detail preserves revision and state history and
exposes criticism, reply, test, interpretation, withdrawal, moderation, appeal, export, and
admission-link controls according to the current session's authority. Status styling remains
administrative rather than epistemic.

## Deterministic maintainer handoff

An operator may export one selected proposal revision and one exact state-history event. The
content-addressed JSON records source timestamps, scope, and the non-exhaustive nature of public
criticism, but excludes export-time volatility from the hashed body. Repeating the same export is
byte deterministic.

The maintainer bridge verifies that digest before preparing a candidate admission. It maps only
the four axis-member proposal families, and then only to a candidate identity plus a revision-one
non-evidentiary assessment whose definition and limitation provenance comes from the same proposed
admission. It does not translate administrative selection into scientific survival. Correction
and ontology-change exports remain explicit manual/refused packets. All four supported mappings
passed the real Rust `admission validate` and `preview` paths without advancing the canonical HEAD
or changing the live canonical projection. A later admission link is an audited public pointer,
not authority for the admission itself.

## Production deployment and smoke

The production D1 database is `cintamani-public-proposals`, identifier
`562103ed-5b70-4409-9135-198da6677452`, in region ENAM. The active Worker deployment during this
check was version `d24edb90-2de3-4b75-b8a0-f9f813bb6b7b`. OAuth, Turnstile, internal secrets, and
the initial operator role were provisioned before the acceptance flow.

One disposable record exercised the normal production GitHub session, CSRF, Turnstile,
idempotency, and author-write path. Proposal `proposal-mKXhwYZ5AimqGqwUzBObWteH` was published with
the actual title `title of the model`. Anonymous collection and detail reads immediately exposed
its one immutable revision and first administrative event as `submitted`. The author then used the
normal withdrawal control, recording the rationale `[SMOKE] Disposable production acceptance
record.` The exact record remains anonymously readable with one revision and two state events,
`submitted` followed by `withdrawn`.

After withdrawal, remote D1 held one proposal, one revision, and two state events. Its public
schema-violation count and foreign-key violation count were both zero. Broader revision,
criticism, reply, test, interpretation, moderation, appeal, export, and admission-link branches
were exercised by the local automated matrix, not by this production smoke.

The canonical chain did not change during the smoke. Before and after it:

- chain HEAD was `bootstrap-0004-0e32d9248223`;
- the HEAD file SHA-256 was
  `35C35E164EF0CD5E2AFC7B3C3780896815A3F29641AADF1A8F4F0C350B1CEB9A`;
- the canonical SQLite projection SHA-256 was
  `1D8F71C4EE81F5C6AD5EF18EEB0BE574886726F8A23C5036A6CEFEECF9E84BE8`.

The production asset bundle used for this check also contained preserved concurrent
computing-paradigms pages from the shared worktree. They are not part of Task 4 and are excluded
from the Task-4 commit; this deployment fact does not transfer their authorship or scope to the
proposal system.

## Verification

The final worktree passed:

- root `pnpm check`, including Rust checks, deterministic domain snapshots, local D1 migration,
  schema identity, operator-role, invariant, foreign-key checks, and Astro diagnostics;
- root `pnpm test`, including 38 site tests, 19 domain-registry tests, 31 Kerr-capacity tests, and
  9 VRC tests;
- two Playwright browser-contract tests for stable session layout, the dedicated submission flow,
  all seven typed field families, accessibility behavior, and non-submission of placeholders;
- the static Astro build and Worker dry run;
- production anonymous API reads, remote D1 counts and invariants, and canonical byte checks.

The automated security matrix covers OAuth state replay and expiry, session rotation and
revocation, origin and CSRF rejection, Turnstile failure, quotas, idempotent replay and digest
conflict, concurrent revisions and state changes, every typed proposal kind, exact-revision
targets, operator authority, withdrawal, hide/restore, lock/unlock, appeals, deterministic export,
identity minimization, security headers, and fail-closed missing secrets.

## Scientific perimeter

The public plane contributes criticism and candidate definitions; it does not contribute a passed
experimental gate merely by storing them. The production smoke is operational evidence for the
write and withdrawal lifecycle, not evidence for the submitted model content. No LiTaO3 device,
physical detector calibration, connected material parameter region, nonlinear target, or
Conjecture 5 is validated or formulated here.

## Decision

Adopt the separate public D1 plane as Cintamani's durable proposal, criticism, and administrative
memory. Keep public discourse visible and append-only, keep operational authority explicit, and
require the deterministic maintainer handoff plus a governed canonical admission before any public
proposal changes the domain registry.
