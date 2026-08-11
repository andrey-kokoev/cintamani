# Cintamani domain siege registry

This Rust package builds a bounded, queryable SQLite projection of Cintamani's categorical siege
domain. Schema version 1 represents theoretical models, material candidates, physical mechanisms,
observation interfaces, axis-consistent typed morphisms and siege cells, append-only cell decisions,
parameter regions, conjectures, append-only conjecture dispositions, falsification criteria,
protocols, runs, artifact identities, gate results, matched comparisons, and Ledger provenance
links.

The registry is organizational infrastructure. Its presence is not experimental evidence and does
not upgrade the epistemic status of any row.

## Ownership boundaries

The durable and generated surfaces are deliberately separate:

- `migrations/001_v1.sql` is the tracked schema migration.
- `.narada/kb/cintamani-domain/admissions/*.json` contains tracked Site admission records. Prior
  admissions are treated as immutable. Advance or reject a stable siege-cell/conjecture identity by
  adding the next contiguous `siege_cell_decisions` or `conjecture_dispositions` revision in a new
  admission; the CLI deterministically selects the highest revision and preserves the full history.
  Definition/schema corrections require an explicit migration rather than a silent rewrite.
- `.narada/db/cintamani-domain.sqlite` is the ignored, rebuildable Site projection. The builder
  refuses to overwrite a nonempty SQLite database without the registry's exact schema and
  projection identity.
- `packages/kerr-capacity/output/*/results.sqlite` databases are ignored per-run evidence stores.
  The domain registry retains only selected artifact identity, hash, availability, row-count, and
  provenance metadata; it does not copy target-level evidence.
- Task Lifecycle owns work state and review. This database does not mirror or mutate lifecycle
  state.
- `src/ledger` owns human-readable experimental narrative. Ledger files and hashes are linked and
  checked, not copied into the registry.

Version 1 has no MCP registration. Access is through the Rust CLI and pnpm wrappers.

## Commands

From the repository root:

```text
pnpm domain:init
pnpm domain:rebuild
pnpm domain:check
pnpm domain:list
```

The package-local forms are `pnpm --filter @cintamani/domain <script>`. The Rust CLI also accepts
`--workspace-root`, `--database`, and `--records`; relative overrides resolve beneath the selected
workspace root.

`init` and `rebuild` transactionally recreate the projection from admission records in sorted path
order. `check` reports schema/projection identity, relation counts, SQLite integrity, foreign-key
violations, admission-source hashes, tracked Ledger/config hashes, and current artifact posture.
An absent ignored evidence artifact is represented as `missing-ignored-artifact` and is allowed. A
present artifact with the wrong hash fails the check.

The list command provides deterministic JSON views with a limit from 1 through 100:

```text
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list cells --limit 20
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list conjectures
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list runs
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list artifacts
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list gates
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list comparisons
cargo run --manifest-path packages/cintamani-domain/Cargo.toml -- list links
```

## Seed scope

The version-1 records admit only selected facts already reported by Ledgers 12-14. The current
advanced cell is the normalized driven Kerr model with an abstract material placeholder,
driven-dissipative Kerr mixing, and coherent-quadrature readout. Its earned result is a local,
replicated positive Kerr-minus-disabled linear-memory advantage at the predeclared normalized
observation-noise floor.

The `thin-film-litao3-candidate` row is explicitly unvalidated and is not attached to an
evidence-bearing siege cell. The registry makes no LiTaO3 device, physical detector, connected
parameter-region, nonlinear-computation, or Conjecture 5 claim. No nonlinear target replicated in
the admitted suites.
