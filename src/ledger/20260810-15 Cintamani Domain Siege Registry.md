# Cintamani Domain Siege Registry

## Status

Cintamani now has a schema-versioned SQLite registry for the categorical siege domain. The Rust
package at `packages/cintamani-domain` rebuilds an ignored Site-local projection from tracked
admission records and exposes bounded JSON queries through a command-line interface and pnpm
wrappers.

This registry is organizational memory, not new scientific evidence. It makes already admitted
claims from Ledgers 12-14 easier to locate, criticize, revise, and connect. Rebuilding the database
does not confirm a conjecture, validate a material, or upgrade the epistemic status of a run.

## Authority and storage boundaries

Five surfaces remain deliberately separate:

1. `.narada/kb/cintamani-domain/admissions/*.json` contains the tracked Site admission records.
   Prior admissions are treated as immutable.
2. `.narada/db/cintamani-domain.sqlite` is an ignored, rebuildable projection. It can be discarded
   and reconstructed from the admission records.
3. Per-run evidence databases such as
   `packages/kerr-capacity/output/detector-noise-frozen/results.sqlite` remain ignored experimental
   artifacts. The domain registry stores their identity and provenance, not their target-level
   measurements.
4. Task Lifecycle owns assignment, execution evidence, review, and closure. Lifecycle state is not
   mirrored into the domain registry.
5. `src/ledger` remains the human-readable experimental narrative. The registry links to tracked
   Ledger paths and hashes; it does not replace the Ledger.

Version 1 has no MCP registration. Its supported access surface is the Rust CLI, wrapped by pnpm.

## Explicit categorical schema

Schema version 1 uses typed `STRICT` relations rather than a generic entity-attribute-value graph.
Its twenty domain relations cover:

- theoretical models, material candidates, physical mechanisms, and observation interfaces;
- typed dynamics-to-observation morphisms and categorical siege cells;
- append-only siege-cell decisions;
- parameter definitions, parameter regions, and unit-consistent region values;
- conjecture definitions, append-only conjecture dispositions, and falsification criteria;
- protocols, runs, evidence-artifact identities, gate results, and matched comparisons;
- admission provenance and Ledger links.

A siege cell cannot name an arbitrary morphism. A composite foreign key requires the morphism's
model, material, mechanism, and target interface to match all four cell axes. A parameter-region
value similarly cannot repeat units that disagree with its parameter definition. Check constraints
bound the declared vocabularies, including Deutsch-Popper-compatible evidence polarities
`survives-test`, `falsifies`, `criticizes`, `inconclusive`, and `mixed`.

Protocol permutation fields are jointly nullable because permutation testing is not universal. The
three admitted capacity protocols nevertheless retain their actual null-trial and quantile values.
Falsification comparators include both upper and lower inequalities so a later siege can predeclare
a readout-gain ceiling without changing the schema.

## Stable identities and append-only revision

Siege-cell and conjecture rows hold stable identity and definition. Their mutable current state is
not overwritten in place:

- `siege_cell_decisions` records a per-cell revision, decision time, status, rationale, decision
  scope, and source admission;
- `conjecture_dispositions` records the corresponding typed history for a conjecture.

Each history must start at revision one and remain contiguous. The database preserves every
revision, while bounded current-state queries deterministically select the greatest revision.
Adding a new admission can therefore defer, reject, or advance an existing identity without
rewriting the admission that created it.

The seeded histories follow the evidence-producing Ledger admissions:

| Identity | Revision | Source admission | Admitted state |
| --- | ---: | --- | --- |
| Intensity siege cell | 1 | Ledger 12 | tested locally at one normalized point |
| Intensity siege cell | 2 | Ledger 13 | tested locally under three-seed attribution controls |
| Quadrature siege cell | 1 | Ledger 13 | local noiseless lead awaiting detector-noise attack |
| Quadrature siege cell | 2 | Ledger 14 | advanced local linear-memory lead |
| Quadrature-memory conjecture | 1 | Ledger 13 | open before the detector-noise test |
| Quadrature-memory conjecture | 2 | Ledger 14 | survived the local declared gate |

The conjecture definition is the pre-test claim: at the frozen normalized point and observation-
noise standard deviation \(10^{-8}\), both declared delayed linear targets would remain family-wise
significant across the three frozen seeds and every matched Kerr-minus-disabled delta would remain
positive. Ledger 14 owns the later survived-local-gate disposition; the outcome is not written back
into the conjecture statement.

## Rebuild, integrity, and provenance

The `init` and `rebuild` commands read admission JSON files in sorted path order and replace the
projection in one transaction. Repeating a rebuild produces the same logical readback. The builder
refuses to clear a nonempty SQLite database unless its metadata identifies both schema version 1
and the `rebuildable-site-domain-registry` projection kind.

The `check` command verifies:

- schema and projection identity;
- SQLite integrity and foreign keys;
- relation counts and admission-record hashes;
- every tracked Ledger path and SHA-256 hash;
- every tracked protocol-configuration path and SHA-256 hash;
- current evidence-artifact availability and hash posture.

An absent ignored evidence artifact is represented as `missing-ignored-artifact` and is tolerated.
A present artifact with the wrong hash fails the check. This distinction allows a clean clone to
rebuild the registry without pretending that ignored evidence was committed.

The live projection rebuilt from four admissions with these counts:

| Relation | Rows |
| --- | ---: |
| Theoretical models / materials / mechanisms / interfaces | 1 / 2 / 1 / 2 |
| Typed morphisms / siege cells / cell decisions | 2 / 2 / 4 |
| Parameter definitions / regions / values | 8 / 1 / 7 |
| Conjectures / dispositions / falsification criteria | 1 / 2 / 2 |
| Protocols / runs / artifacts | 3 / 3 / 1 |
| Gate results / comparisons / Ledger links | 8 / 4 / 23 |
| Admissions | 4 |

SQLite reports `integrity: ok` and zero foreign-key violations. Admission records, Ledger sources,
the frozen Ledger-14 configuration, and the present evidence artifact all match their recorded
hashes. Missing, mismatched, and observation-drift counts are zero in the current workspace.

## Bounded queries

The CLI lists cells, conjectures, runs, artifacts, gates, comparisons, Ledger links, or their
combined view. Results are ordered deterministically and require a limit from 1 through 100. The
current cell and conjecture views expose the selected revision, time, rationale, and source
admission so each current status identifies the history revision that supplied it.

Root pnpm wrappers are:

```text
pnpm domain:init
pnpm domain:rebuild
pnpm domain:check
pnpm domain:list
```

The current bounded view resolves the intensity cell at revision two to Ledger 13, and the
quadrature cell and quadrature-memory conjecture at revision two to Ledger 14.

## Truthful seed limits

The evidence-bearing cells use `abstract-normalized-medium`, whose epistemic status is
`abstract-placeholder`. The separate `thin-film-litao3-candidate` row is explicitly unvalidated
and belongs to no evidence-bearing siege cell. No registry row claims a LiTaO3 device realization,
physical detector calibration, or connected physical parameter region.

The only advanced cell is the normalized Kerr coherent-quadrature cell, and only its replicated
linear-memory advantage advances. The admitted Ledger-14 artifact is referenced once by relative
path, expected hash, and a 1,650-target-row summary; those target rows are not duplicated in the
domain database. No nonlinear target has a passing replication gate. The registry does not
formulate or imply Conjecture 5.

## Verification

The implementation passes:

- `cargo fmt --check`;
- `cargo check --all-targets`;
- `cargo clippy --all-targets -- -D warnings`;
- twelve focused domain-registry tests;
- root `pnpm check` across all three Rust packages;
- root `pnpm test`, including 12 domain-registry, 31 Kerr-capacity, and 9 VRC integration tests;
- the default rebuild and registry check;
- `git diff --check`.

The focused tests cover idempotent logical rebuilding, explicit morphism-axis and unit mismatch
rejection, jointly optional permutation fields, foreign-database refusal without data loss,
admission/Ledger/configuration provenance, artifact deduplication, missing-artifact tolerance,
present-artifact mismatch detection, truthful seed limits, and append-only evolution. The evolution
test adds a fifth admission with revision three for the existing quadrature cell and conjecture,
preserves the prior admission hash and all history rows, and resolves the new revision as current.

## Decision

Adopt the registry as the Site-owned, rebuildable map for bounded categorical siege work. Use new
typed admission revisions to change cell or conjecture state; do not rewrite history or infer
scientific support from registry membership.

The next scientific step remains the bounded normalized parameter siege authorized by Ledger 14.
That experiment must create its own protocol, evidence, controls, and gate results before any new
scientific disposition is admitted.
