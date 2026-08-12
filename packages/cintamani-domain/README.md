# Cintamani domain siege registry

This Rust package governs and queries Cintamani's categorical siege memory. Schema version 3 is a
rebuildable SQLite projection, not a scientific database and not experimental evidence. It keeps
stable domain identities separate from append-only epistemic history, exact provenance, and
derived runtime observations.

## Authority and storage boundaries

Five surfaces remain deliberately distinct:

- `.narada/kb/cintamani-domain/` is Git-visible Site memory. The four version-1 admission JSON
  files remain byte-for-byte immutable. `chain/HEAD` selects an immutable manifest generation;
  each manifest pins sequence, path, content hash, predecessor entry hash, admitted identity/time,
  admitting actor, external authority kind/reference, and its deterministic entry hash.
- The bootstrap manifest's Task #2 WorkResultReport reference retrospectively certifies the
  migration of the four existing records into the chain. It is not their original scientific
  admission authority and supplies no new scientific evidence.
- `.narada/db/cintamani-domain.sqlite` is an ignored, disposable Site projection. Rebuild creates
  and fully validates a sibling database before atomically replacing an owned v1/v2/v3 projection.
  Chain, parse, schema, history, path, provenance, tracked-source, and present-artifact failures
  preserve the existing database bytes. A nonempty foreign database is never adopted or cleared.
- `packages/kerr-capacity/output/*/results.sqlite` files are ignored per-run evidence stores. The
  registry retains artifact identity, expected hash, URI, and selected admitted claims; it does
  not copy target rows. Availability and observed hash are derived during `check`, so no stale
  mutable availability status is stored. Absence is tolerated; a present hash mismatch fails.
- Task Lifecycle owns work assignment, reports, review, and closure. The registry neither mirrors
  nor edits lifecycle state. `src/ledger` remains the human scientific narrative; tracked Ledger
  paths and hashes are operationally checked and linked through typed provenance.

Direct ad-hoc SQL mutation is not an admitted workflow.

## Schema and field classification

The primary schema uses explicit tables rather than a generic EAV or untyped category graph.

| Classification | Examples | Evolution rule |
| --- | --- | --- |
| Stable identity/definition | model, material, mechanism, interface, port, morphism, path, cell, parameter, region, conjecture, protocol, run, artifact IDs; names; axes; units; morphism endpoints | Insert once through a governed admission; do not overwrite. |
| Append-only assessment/status | model epistemic status; material classification and epistemic status; mechanism/interface status; morphism validation; cell epistemic assessment and decision; protocol provenance; run operational and epistemic status | Family-specific contiguous revisions with event kind, time, rationale, scope, and source admission. Illegal transitions require explicit correction/supersession. |
| Append-only definition version | parameter-region definition, conjecture statement, protocol definition | Contiguous typed versions; deterministic current views select the highest revision. |
| Immutable evidence result | gate result and matched comparison, including polarity, metrics, limits, and decision scope | Never update in place. A typed same-identity supersession edge selects a replacement and preserves the chain. |
| Derived observation | current artifact presence/hash posture | Recomputed by `check`; never admitted as mutable epistemic state. |

Every evidence-bearing exact row/version/result must have a typed-union provenance claim whose
source admission is the same admission as that row. Evidence classifications additionally require
a same-admission Ledger link and `evidence` provenance kind; an unrelated claim cannot satisfy the
invariant. Definition and limitation provenance are explicit and cannot silently confer evidence.

The category-oriented representation has axis-qualified process ports, parallel same-boundary
typed morphisms, and ordered morphism paths. Composite foreign keys bind morphisms and paths to the
same model/material/mechanism/interface axes as their siege cell. Validation also requires
contiguous path positions, declared first/last endpoints, and exact target-to-source adjacency
between steps.

The SQLite `siege_space_dimensions` view makes the categorical siege coordinates first-class. Its
governed order preserves the original framing: (1) theoretical model, (2) physical material, and
(3) physical calculation mechanism. (4) observation interface is labeled
`later-added-fourth-dimension`, rather than being retroactively presented as part of the original
three-dimensional conjecture. Each member row carries deterministic within-axis order, identity
and name, plus its exact current assessment ID/revision/status/detail, assessment time, rationale,
scope, and source admission. The shared `dimensions` query always returns metadata for all four
axes, with a member count and member array, so an axis with no admitted members remains visible.

## Governed admissions

Each post-v1 admission is a schema-2 record with a nonempty list of typed changes. Promotion is an
append operation: one immutable generation contains the new record and the full successor
manifest, then `HEAD` is atomically advanced. Earlier generation bytes are never rewritten.

The lifecycle is:

1. `admission new` creates an intentionally incomplete typed JSON skeleton.
2. Edit it to add explicit typed changes and exact provenance changes.
3. `admission validate` checks its typed record shape without mutation.
4. `admission preview` supplies the proposed actor, external authority kind/reference, and expected
current HEAD. It builds and checks a temporary projection, reports relation-count deltas, removes
   all preview material, and leaves governed HEAD unchanged.
5. `admission promote` repeats validation, takes an exclusive lock, rejects a stale expected HEAD,
   atomically exposes the generation and HEAD, rebuilds the projection, and emits an admission
   receipt. Blank or placeholder authority, arbitrary SQL, duplicate identities, and cross-axis or
   incomplete changes are rejected.

Example (the authority values must come from the real external admission path):

```text
cargo run -- admission validate .narada/kb/cintamani-domain/drafts/example.json --format json
cargo run -- admission preview .narada/kb/cintamani-domain/drafts/example.json \
  --admitted-by cintamani.builder \
  --authority-kind task-lifecycle-work-result-report \
  --authority-ref <opaque-real-receipt> \
  --expected-head <current-head> --format json
cargo run -- admission promote .narada/kb/cintamani-domain/drafts/example.json \
  --admitted-by cintamani.builder \
  --authority-kind task-lifecycle-work-result-report \
  --authority-ref <opaque-real-receipt> \
  --expected-head <current-head> --format json
```

If preview fails, fix the draft; the live DB and HEAD are unchanged. If a process leaves a `LOCK`,
first verify that no promotion is active before removing it. A fully written but unreferenced
generation is inert because only HEAD is authoritative. If HEAD advanced but projection replacement
failed, do not promote again: run `rebuild`, then `check`.

### Maintainer-selected public proposal exports

The browser site's D1 proposal plane is separate and has no canonical mutation authority. Its
content-addressed export wrapper may be verified and translated into a candidate schema-2 draft by
`pnpm site:prepare-admission`; see `../cintamani-site/README.md`. This is an explicit maintainer
action, not a Worker promotion path. Candidate axis mappings include revision-1 non-evidentiary
assessment and exact same-admission definition/limitation provenance. Existing-member assessments
require the maintainer to supply the next history revision and event kind. Evidence-bearing status,
explicit correction, and ontology change are never inferred by the bridge.
Selected explanatory-conjecture exports can instead produce candidate problem/version and
conjecture/version identities, an explicitly open non-evidentiary disposition, zero or more
generation-pinned framings, and exact definition/limitation provenance. A conjecture can remain
unclassified or frame a gap: neither case creates a siege cell, morphism, path, assessment, or
scientific status. The bridge still only validates and previews; it never advances HEAD.
Public exact-version relation labels—including rivalry, equivalence, reclassification,
incompatibility, supersession, and shared-problem claims—remain criticizable public content. The
bridge does not translate them into canonical identity merges, dispositions, or state changes.

The ordinary `admission validate`, `preview`, real external authority, expected-HEAD, and `promote`
requirements remain unchanged. Public selection is not admission. A public `admission_link` may be
recorded only after canonical promotion emits its receipt.

## CLI and pagination

Root wrappers cover common operations:

```text
pnpm domain:rebuild
pnpm domain:check
pnpm domain:list
pnpm domain:dimensions
pnpm domain:frontier
pnpm domain:mcp
```

The Rust CLI accepts `--workspace-root`, `--database`, `--chain`, and `--format human|json`.

`list` covers models, materials, mechanisms, interfaces, morphisms, paths, cells, problems, problem
versions, conjectures, conjecture versions, conjecture framings, criteria, parameters, regions, region versions, protocols, runs, artifacts,
gates, comparisons, admissions, and provenance. Filters include the four axes, current status,
source admission, Ledger number, and text. Results use stable keyset cursors and a limit from 1 to
100. A cursor is bound to its collection and exact filter digest; malformed, stale, wrong-family,
and wrong-filter cursors are rejected. Following `next_cursor` reaches every matching row.

```text
cargo run -- --format json list cells --ledger 14 --limit 1
cargo run -- --format human show cells cell-kerr-abstract-quadrature
cargo run -- --format json history cells cell-kerr-abstract-quadrature --limit 2
cargo run -- --format json why gates gate-l14-lag3-survival
cargo run -- --format json frontier --material thin-film-litao3-candidate --limit 20
```

`show` returns a stable identity plus deterministic current state. `history` returns all typed
families belonging to that identity (for example cell assessment and decision histories,
conjecture versions and dispositions, or protocol versions and config-provenance assessments).
Gate and comparison history follows typed supersession chains. `why` traverses exact provenance to
the immutable admission and Ledger claim. `frontier` computes a bounded lexicographic four-axis
matrix and represents unadmitted cells as explicit gaps; it does not materialize an unbounded
Cartesian product. Every returned coordinate includes a stable versioned key derived only from the
four ordered member IDs, plus a separate generation pin used to validate its historical framing;
its classification is exactly `admitted-cell` or `gap`. Coordinates organize conjectures. They are
not themselves evidence, physical possibilities, or epistemic assessments.

`dimensions` reads the schema-level `siege_space_dimensions` view and groups its rows beneath the
fixed four-axis metadata. Both axis and member ordering are deterministic; the fixed metadata makes
empty axes explicit without inventing placeholder member identities.

Human and JSON output use the same query result object. Human mode changes rendering only.

## Local MCP surface

`cintamani-domain-mcp` is a newline-delimited JSON-RPC stdio MCP server using the same Rust library
as the CLI. It exposes safe `check`, admission `validate`/`preview`, `list`, `show`, `history`,
`why`, `dimensions`, and `frontier` tools plus the sole mutating tool, `admission_promote`. The
mutation tool has the same external receipt, expected-HEAD, lock, and temporary-projection checks
as the CLI. MCP draft paths must stay workspace-relative.

Tracked local material is under `mcp/`:

- `cintamani-domain.surface.json` — Cintamani-local surface descriptor and mutation declaration;
- `server.config.template.json` — stdio client configuration template;
- `conformance-fixture.jsonl` — initialization, discovery, check, list, and frontier fixture.

The server and CLI parity are tested locally. Full Narada Site-fabric registration is not claimed:
the external registrar currently requires a native descriptor in the separately owned
`mcp-surfaces` catalog. This repository does not cross that authority boundary; the local
descriptor records `local-protocol-tested-catalog-registration-blocked` until a governed catalog
addition is authorized.

## Migration, integrity, and verification

Migration `001_v1.sql` remains the historical v1 schema. `002_v2.sql` is the clean v2 projection
schema. `003_v3.sql` adds stable problem identities/versions and exact, generation-pinned
one-to-many conjecture framings while removing the requirement that every conjecture own a siege
cell. Rebuild reads the governed chain directly, semantically maps the four v1 records without
editing them, applies later typed changes, and records the exact clean/upgrade/rebuild lineage.

`check` reports and enforces projection identity, migration lineage, SQLite integrity, foreign
keys, chain agreement, family history and transition invariants, path composition, exact
provenance, tracked Ledger/config hashes, and artifact posture.

```text
cargo fmt --check
cargo check --all-targets
cargo clippy --all-targets -- -D warnings
cargo test --all-targets
pnpm check
pnpm test
pnpm domain:rebuild
pnpm domain:check
```

## Seed scope and scientific limits

The migrated seed states only facts admitted from Ledgers 12–14. The current local lead remains the
normalized driven Kerr model, abstract normalized-medium placeholder, driven-dissipative Kerr
mixing, and coherent-quadrature interface. Ledger 14 earned a replicated positive local
Kerr-minus-disabled linear-memory advantage at the predeclared normalized observation-noise floor.

The `thin-film-litao3-candidate` identity remains an unvalidated candidate and has no
evidence-bearing cell. The registry makes no LiTaO3 device/material validation, physical-detector
calibration or robustness, connected parameter-region, replicated nonlinear-computation, or
Conjecture 5 claim. Organizational structure, history machinery, query results, and an MCP surface
do not strengthen those scientific claims.

The problem/framing migration and public bridge are engineering structure, not a new experiment or
scientific result. They create no Ledger entry. Concurrent computing-paradigms site work is outside
this package change and is neither required nor modified by the domain migration.
