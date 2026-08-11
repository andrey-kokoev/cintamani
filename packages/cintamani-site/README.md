# Cintamani static site

This package renders the Cintamani siege registry as an accessible static Astro site and ships the
result through Cloudflare Workers Assets. It is a presentation projection, not another registry.
The Rust/SQLite package at `../cintamani-domain` remains authoritative.

## Build-time data boundary

`scripts/generate-domain-snapshots.mjs` runs the shared domain CLI with an explicit workspace root:

1. rebuild the ignored SQLite projection from the governed admission chain;
2. run the complete registry check and fail without writing if any enforced check is non-clean;
3. read the first-class `dimensions` result;
4. follow every bounded `frontier` cursor while rejecting repeated cursors or coordinates and
   enforcing 1,000-page/100,000-row safety limits;
5. serialize deterministic, timestamp-free JSON under `src/data`.

The tracked snapshots are:

- `dimensions.json` — four ordered axes, members, current assessment revisions, and source
  admissions;
- `frontier.json` — all bounded admitted cells and explicit gaps;
- `registry-summary.json` — stable registry identity, chain generation, invariant result, and
  selected relation counts. It deliberately excludes environment-dependent artifact presence and
  rebuild classification.

`generate:data` writes snapshots. `check:data` independently regenerates them in memory and fails
on byte drift. Neither path copies target-level experimental rows.

## Commands

From this package (or use the corresponding `site:*` root wrapper):

```text
pnpm generate:data
pnpm dev
pnpm check
pnpm test
pnpm build
pnpm preview
pnpm ship
```

`build` regenerates checked data before `astro build`. `ship` performs that build and then invokes
`wrangler deploy`; it is intentionally not part of ordinary verification.

## Cloudflare boundary

`astro.config.mjs` uses static output. `wrangler.jsonc` serves `dist` through Workers Assets with
automatic trailing slashes and the generated 404 page. There is no Worker handler, D1 database,
KV binding, or mutable edge API. `PUBLIC_SITE_URL` may supply the canonical production URL; the
repository does not invent one.

The configured Worker name `cintamani` is provisional until an authorized Cloudflare account check
or dry-run confirms availability. Do not rename or deploy it based on an unauthoritative guess.

## Scientific perimeter

The UI repeats the registry's narrow status: the current evidence is normalized-model local
linear-memory evidence. Thin-film LiTaO3 remains an unvalidated candidate; normalized observation
noise is not physical detector calibration; no nonlinear target replicated; no connected physical
parameter region or Conjecture 5 is admitted. Static publication does not strengthen any claim.
