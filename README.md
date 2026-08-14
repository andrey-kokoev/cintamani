# Cintamani

pnpm monorepo for experiments derived from the VRC ledger in `src/ledger`.

## Workspace

- `packages/vrc-mnist` — Rust/Burn falsification experiment for a recurrent complex optical state.
- `packages/kerr-capacity` — Rust Kerr coupled-mode/LLE simulator and held-out observable-capacity estimator.
- `packages/cintamani-domain` — Rust/SQLite categorical search registry with a tamper-evident
  admission chain, typed histories/provenance, bounded search queries, and a local stdio MCP.
- `packages/cintamani-site` — static Astro registry presentation plus a separate public D1 proposal,
  criticism, and administrative-history plane served by a Cloudflare Worker.
- `packages/amplitudes-at-infinity` — Rust Task #11 exact rational planar propagator slice
  (experimental, unreviewed).

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
pnpm site:x402-agent      # discovery-only unless an authorized operator adds --pay
pnpm site:dev
pnpm site:check
pnpm site:test
pnpm site:build
pnpm site:worker-check
pnpm site:preview
pnpm site:ship
pnpm site:prepare-admission -- --export <file> --out <draft> --record-id <id> --admitted-at <date>
```

`site:ship` builds, migrates the remote public D1, and runs `wrangler deploy`; use it only from an
authorized Cloudflare shipping step. The Worker name is `cintamani`. Tracked registry JSON is still
deterministically regenerated from the checked Rust/SQLite domain CLI. Public proposals reside in a
separate D1 and cannot mutate that canonical registry. See `packages/cintamani-site/README.md` for
the generic contributor/SIWX identity model, optional x402 publication lane, security, authority,
handoff, provisioning, recovery, and deployment boundaries. The x402 agent wrapper reads config and
health only by default; paid mode is a real wallet mutation and requires separate authorization.

The public plane also supports problem-led `explanatory-conjecture` records. They expose an
essential mechanism, failure condition, unresolved assumptions, exact-version criticism and
relations, and optional generation-pinned framings of the derived four-dimensional frontier. A
framing is conjectural organization—not evidence, a physical possibility claim, or canonical
admission. Selected exports can be validated and previewed as candidate canonical problems and
open conjectures without creating a search cell or advancing governed HEAD.

Task #9 also adds versioned proposed experiments and capability-based equipment types to the
public proposal envelope. The operator-supplied experiment families are separate illustrative
fixtures, explicitly `illustrative-unadmitted`, and never seed public D1 or claim evidence.

The public and CLI vocabulary is **search space**, **search coordinate**, **search cell**, and
**search overlay**. Durable v1–v5 compatibility identifiers retain their original `siege_*` names:
SQLite tables/views (including `siege_cells` and `siege_space_dimensions`), serialized admission
fields/variants, and registry count keys. Those internal names are not product terminology and are
not rewritten because doing so would invalidate historical admissions, hashes, and consumers.

Task 5 is intentionally suspended at a disabled isolated-testnet checkpoint. The public Worker at
`cintamani-x402-testnet.andrei-kokoev.workers.dev` is not accepting x402 payments, its disposable
payer is unfunded, and neither the Base-Sepolia paid acceptance gate nor any production payment gate
has been claimed. The exact retained resources and restart sequence are recorded in the site README.

Its generated projection is `.narada/db/cintamani-domain.sqlite`, which is intentionally ignored.
The schema migrations, immutable admission generations, and manifest chain remain tracked. The four
legacy v1 records are byte-preserved. See `packages/cintamani-domain/README.md` for admission,
recovery, MCP-registration, ownership, and scientific-evidence boundaries.
