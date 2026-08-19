# AGENTS.md — Cintamani

pnpm monorepo (pnpm 10.9, Apache-2.0) for experiments derived from the VRC ledger
in `src/ledger/`. Mixed Rust (cargo) and TypeScript (Astro/Cloudflare Worker)
packages; all Rust packages are driven through pnpm script wrappers.

## Layout

- `src/ledger/` — dated, human-readable decision/limit records. New entries follow
  the `YYYYMMDD-NN Title.md` convention.
- `packages/vrc-mnist` — Rust/Burn falsification experiment for a recurrent complex
  optical state.
- `packages/kerr-capacity` — Rust Kerr coupled-mode/LLE simulator and held-out
  observable-capacity estimator.
- `packages/cintamani-domain` — Rust/SQLite categorical search registry:
  tamper-evident admission chain, migrations `migrations/001_v1.sql`–`005_v5.sql`,
  local stdio MCP (`domain:mcp`).
- `packages/cintamani-site` — static Astro registry presentation plus a Cloudflare
  Worker (`cintamani`) serving a separate public D1 proposal/criticism plane.
- `packages/amplitudes-at-infinity` — Task #11 exact rational planar propagator
  slice (Rust + HVM). Experimental and unreviewed.

## Commands

Run from the repo root unless noted.

```bash
pnpm check          # workspace-wide checks (cargo check / astro check / data checks)
pnpm test           # workspace-wide tests
pnpm build          # workspace-wide build
```

Domain registry wrappers:

```bash
pnpm domain:rebuild
pnpm domain:check
pnpm domain:list
pnpm domain:dimensions
pnpm domain:frontier
pnpm domain:mcp
```

Site wrappers:

```bash
pnpm site:generate  # regenerate tracked registry JSON from the domain CLI
pnpm site:dev
pnpm site:check
pnpm site:test
pnpm site:build
pnpm site:worker-check   # wrangler deploy --dry-run
pnpm site:test:visual    # Playwright
pnpm site:preview        # full local Worker preview
```

`pnpm site:ship` builds, migrates the remote public D1, and runs
`wrangler deploy`. Use it only from an authorized Cloudflare shipping step.

Per-package Rust convention: `build`/`check`/`test` map to
`cargo build` / `cargo check --all-targets` / `cargo test --all-targets`.

## Authority and data boundaries (do not blur these)

1. `.narada/kb/cintamani-domain` — tracked, tamper-evident canonical admission
   chain.
2. `.narada/db/cintamani-domain.sqlite` — git-ignored, rebuildable canonical
   projection; never edit or commit it.
3. Per-run evidence databases (`artifacts/`) are experimental artifacts owned by
   their protocols.
4. The public `cintamani-public-proposals` D1 database holds contribution and
   workflow history only; it has no authority to write the canonical registry.
5. Task Lifecycle (`.ai/`) owns assignment, implementation evidence, review, and
   closure; `src/ledger/` remains the human-readable record.

A public record can affect the canonical chain only after explicit maintainer
export, independent validation and preview, and a governed admission decision.

## Terminology and compatibility constraints

- Public/CLI vocabulary is **search space**, **search coordinate**,
  **search cell**, **search overlay**.
- Durable v1–v5 compatibility identifiers keep their original `siege_*` names
  (SQLite tables/views such as `siege_cells`, serialized admission fields,
  registry count keys). Do **not** rename them — doing so invalidates historical
  admissions, hashes, and consumers.
- The four legacy v1 records are byte-preserved; do not rewrite them.
- Schema changes to the domain registry are new append-only migrations
  (`migrations/NNN_vN.sql`); never edit an existing migration.
- Public-plane administrative states (submitted, selected, declined, withdrawn,
  superseded) describe workflow only; never convert them into epistemic scores.
  The service exposes no voting.

## Payments and deployment cautions

- Task 5 is suspended at a disabled isolated-testnet checkpoint; the x402 testnet
  Worker does not accept payments and no paid acceptance gate is claimed.
- `site:x402-agent` is discovery-only unless an authorized operator adds `--pay`;
  paid mode is a real wallet mutation and requires separate authorization.
- `site:ship` and remote D1 migrations are outward-facing, authorized-operator
  actions — do not run them unprompted.

## Automation

- Daily literature sweep: SOP template `cintamani.literature-sweep`
  (`.narada/sops/cintamani.literature-sweep.sop.yaml`, imported into the `sop`
  MCP surface). The Windows scheduled task `\Narada\CintamaniLiteratureSweepDaily`
  (daily 06:17 local, `IgnoreNew`, 10-minute limit) runs
  `scripts/literature-sweep-daily.mjs`, which imports the template and admits one
  idempotent occurrence per day (occurrence key `literature-sweep:<YYYYMMDD>` UTC)
  via the loader with `--standalone-ambient-attachment`. Manual run:
  `node scripts/literature-sweep-daily.mjs` (add `--dry-run` to import only).
- Daily documentation drift sweep: SOP template `cintamani.doc-sweep`
  (`.narada/sops/cintamani.doc-sweep.sop.yaml`, imported into the `sop` MCP
  surface). The Windows scheduled task `\Narada\CintamaniDocSweepDaily` (daily
  06:27 local, `IgnoreNew`, 10-minute limit) runs `scripts/doc-sweep-daily.mjs`,
  which imports the template and admits one idempotent occurrence per day
  (occurrence key `doc-sweep:<YYYYMMDD>` UTC) via the loader with
  `--standalone-ambient-attachment`. Manual run:
  `node scripts/doc-sweep-daily.mjs` (add `--dry-run` to import only).
- The pinned Node for the scheduled tasks is
  `C:\Users\andrey\AppData\Roaming\fnm\node-versions\v24.19.0\installation\node.exe`;
  do not point it at an `fnm_multishells` path (per-shell shim, unstable).

## Working agreements

- Keep changes minimal and package-scoped; match the surrounding Rust/TS style.
- Regenerated, tracked registry JSON must come from the checked Rust/SQLite domain
  CLI (`site:generate`), not hand edits.
- When changing commands, layout, or conventions described here, update this file
  and the relevant package README in the same change.
