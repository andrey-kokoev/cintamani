# Cintamani

pnpm monorepo for experiments derived from the VRC ledger in `src/ledger`.

## Workspace

- `packages/vrc-mnist` — Rust/Burn falsification experiment for a recurrent complex optical state.
- `packages/kerr-capacity` — Rust Kerr coupled-mode/LLE simulator and held-out observable-capacity estimator.
- `packages/cintamani-domain` — Rust/SQLite categorical siege registry rebuilt from Site-owned immutable admission records.

Run workspace checks with:

```bash
pnpm check
pnpm test
```

The domain registry has root-level pnpm wrappers:

```text
pnpm domain:rebuild
pnpm domain:check
pnpm domain:list
```

Its generated projection is `.narada/db/cintamani-domain.sqlite`, which is intentionally ignored.
The schema migration and immutable source records remain tracked; see
`packages/cintamani-domain/README.md` for the ownership and evidence boundaries.
