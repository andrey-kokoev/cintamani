# Task #11: exact rational planar propagator slice

This package is an experimental, unreviewed computation for Cintamani Task
#11. It enumerates labelled planar polygon triangulations and executes the
declared rational expression

```text
A_n(z) = sum_T product_{e in T} 1/(X_e + z w_e).
```

The public result is the rational propagator sum above. A positive
q-generating-function surrogate is not executed or presented as an amplitude
result by the corrected slice.

## Declared inputs

Vertices are external legs `1..n`. A channel is the diagonal `X_(a,b)` with
canonical one-based endpoints, excluding polygon boundary edges. Channels are
sorted lexicographically. For every channel the run records exact integer
assignments `X_e` and `w_e`.

Two deterministic sample families are available:

```text
generic-a:
  X_(a,b) = 17 + 3a + 5b + a*b
  w_(a,b) = 11 + 2a + 7b + a^2

generic-b:
  X_(a,b) = 23 + 7a + 11b + 2a*b + a^2
  w_(a,b) = 13 + 5a + 3b + b^2
```

Here `a,b` are one-based external-leg labels. These are declared integer
channel weights, not sourced cluster-algebra g-vectors. The explicit
`special-alternating` control uses the same kind of integer `X` assignment
and `w_r = (-1)^r` in channel-rank order. It is deliberately nongeneric and
is reported only as a signed cancellation control.

The library also exposes `SampleAssignment::from_values` for callers that
need to provide canonical channel lists and explicit integer vectors. The CLI
inputs are configurable:

```text
cargo run --release -- run \
  --max-n 8 \
  --sample generic-a \
  --series-order 4 \
  --z-values 1009,1013,1019 \
  --output artifacts/task-11-exact-generic
```

The default run includes `generic-a`, `generic-b`, and
`special-alternating`; use `--no-generic-b` or `--no-special` to narrow it.

## Exact asymptotic computation

Each propagator is expanded at infinity as

```text
1/(X + z w) = sum_(j >= 0) (-X)^j / w^(j+1) z^(-(j+1)).
```

The crate multiplies these expansions in a declared finite Laurent window,
using `BigRational` coefficients, then sums the signed exact contributions
from every triangulation. It searches global orders from zero until the first
nonzero coefficient survives, and emits every exact coefficient in the
requested window. The n=4..8 run includes all 132 n=8 triangulations.

For each case, the artifact records the canonical assignment seed and digest,
all channel assignments, exact numerator/denominator coefficients,
cancellation groups and order, timings, and equality between the direct exact
series oracle and the shared symbolic DAG reducer.

Every case is independently checked at the declared finite integer values of
`z`. The original rational expression is evaluated exactly, the truncated
series is evaluated exactly, and the difference is required to be no larger
than a summed geometric-series tail bound. This is a truncation certificate,
not a claim that a finite evaluation equals the asymptotic series exactly.

The exact artifacts are `results.json`, `catalan-counts.json`,
`reducer-metrics.json`, and `manifest.json`.

## Reducer and HVM boundary

The Rust reducer is a hash-consed symbolic DAG with shared propagator agents
by channel rank and binary `Mul`/`Add` agents. It expands the same declared
propagators into the same exact rational Laurent window as the direct oracle.
This preserves the useful triangulation/DAG infrastructure without claiming
that the Rust reducer is an HVM execution.

`hvm/planar_amplitude.hvm` is a concrete design export for the corrected
propagator-series net. It is design-only in this checkout: `hvm`, `hvm2`, and
`bend` were not installed, so no external runtime result is fabricated. The
HVM runtime limitation remains explicit in the artifacts and public result
copy.

No g-vector definition was sourced for this task. Accordingly, `w_e` are
declared channel weights, published n=5/6/7 geometry is not reproduced, and
no physical amplitude or canonical infinity limit is claimed.
