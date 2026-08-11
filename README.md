# Cintamani

pnpm monorepo for experiments derived from the VRC ledger in `src/ledger`.

## Workspace

- `packages/vrc-mnist` — Rust/Burn falsification experiment for a recurrent complex optical state.
- `packages/kerr-capacity` — Rust Kerr coupled-mode/LLE simulator and held-out observable-capacity estimator.
- `packages/cintamani-domain` — Rust/SQLite categorical siege registry with a tamper-evident
  admission chain, typed histories/provenance, bounded siege queries, and a local stdio MCP.
- `packages/cintamani-site` — static Astro presentation generated from checked domain-registry
  snapshots and configured for Cloudflare Workers Assets.

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
pnpm domain:dimensions
pnpm domain:frontier
pnpm domain:mcp
```

The browser-visible static registry has separate wrappers:

```text
pnpm site:generate
pnpm site:dev
pnpm site:check
pnpm site:test
pnpm site:build
pnpm site:preview
pnpm site:ship
```

`site:ship` builds and runs `wrangler deploy`; use it only from an authorized Cloudflare shipping
step. The provisional Worker name is `cintamani`. The site has no D1 binding or mutable edge
registry: its tracked JSON is deterministically regenerated from the checked Rust/SQLite domain
CLI during build. See `packages/cintamani-site/README.md` for the data and deployment boundaries.

Its generated projection is `.narada/db/cintamani-domain.sqlite`, which is intentionally ignored.
The schema migrations, immutable admission generations, and manifest chain remain tracked. The four
legacy v1 records are byte-preserved. See `packages/cintamani-domain/README.md` for admission,
recovery, MCP-registration, ownership, and scientific-evidence boundaries.
