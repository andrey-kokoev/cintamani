# Attribution Controls and Capacity-Estimator Calibration

## Status

The Rust Kerr instrument now includes the attribution controls and estimator calibration required
after the first controlled run. The earlier pooled-null correction has been replaced by a joint
target-family permutation test with a family-wise gate, explicit singular-spectrum diagnostics,
raw feature-scale reporting, seed and split sensitivity, and a cross-seed replication gate.
Structured results are stored canonically in SQLite; CSV, JSON, and Markdown are derived inspection
exports.

The resulting evidence is narrower than either a success or a universal obstruction:

- intensity readout still shows no Kerr advantage and attributes its dominant degree-two capacity
  to square-law observation;
- coherent quadrature readout shows a small, repeatable Kerr-associated increase in linear memory
  at lags three and four;
- no nonlinear target capacity survives all three seeds under either readout;
- several Kerr-activated observation channels are extremely small before standardization, so the
  quadrature memory effect is not yet operationally credible without detector-noise and SNR tests.

Conjecture 5 remains deferred.

## Why the previous null correction was insufficient

The first implementation independently shuffled each target and pooled all positive null scores
into one global threshold. That was conservative in one sense but did not preserve the correlation
structure of the target family and did not directly control the maximum false discovery across all
55 tested functions.

The calibrated procedure now constructs the complete aligned target matrix first. For each null
trial, one shared row permutation is applied to every target. This preserves the joint distribution
among target functions while breaking their alignment with the observations.

For null trial \(b\), let \(C_{j}^{(b)}\) be the held-out score for target \(j\), and define

\[
M^{(b)}=\max_j\max\left(0,C_j^{(b)}\right).
\]

The family-wise threshold is

\[
q_{\mathrm{FWER}}
=Q_{0.99}\left(\{M^{(b)}\}_{b=1}^{512}\right).
\]

A measured target is retained only if its raw held-out capacity exceeds this maximum-statistic
threshold. For a retained target, the reported corrected score subtracts that target's own 0.99
positive-null quantile. The corrected total is not clipped to the observation rank.

Configuration validation now rejects a requested null quantile when too few permutations exist to
resolve it. The committed experiment uses 512 joint permutations at the 0.99 quantile.

## Why one family-wise test is still not enough

Even a one-percent family-wise error rate applies per analysis. Repeating the analysis across many
seeds, splits, readouts, and parameter points creates new opportunities for an isolated false
positive.

This occurred in the calibration matrix: at seed 20260812, the Kerr-disabled quadrature condition
reported 0.014764 of nonlinear capacity even though, with Kerr and thermal feedback disabled, its
field dynamics and quadrature observation are affine. The result is a known finite-sample false
positive, not a physical effect.

The suite therefore adds a replication gate. A target is called replicated only when it passes the
family-wise test in every evaluated seed. Its replication score is the minimum corrected capacity
across those seeds:

\[
C_j^{\mathrm{rep}}
=
\begin{cases}
\min_s C_{j,s}^{\mathrm{corrected}},
& C_{j,s}^{\mathrm{corrected}}>0\ \text{for every seed }s,\\
0,&\text{otherwise}.
\end{cases}
\]

This lower envelope removes the one-seed affine-control false positive. It is deliberately more
severe than averaging.

## Observation-rank calibration

Capacity fitting still centers and scales each observation feature using training data only.
Because nonzero rescaling does not change mathematical linear span, the primary rank is computed
from the singular spectrum of this standardized training matrix.

The report now records:

- every standardized singular value and its ratio to the largest;
- rank at relative singular-value tolerances \(10^{-3}\), \(10^{-6}\), and \(10^{-9}\);
- the configured primary rank at \(10^{-6}\);
- stable rank \(\|X\|_F^2/\|X\|_2^2\);
- the participation ratio of covariance eigenvalues;
- each feature's mean and standard deviation before standardization;
- each raw feature scale relative to the largest scale in that interface.

The last item is essential. Standardization correctly exposes mathematical independence in a
noiseless model, but it can make a vanishingly weak comb line look as readable as a strong line.
Mathematical rank is therefore not yet operational rank.

## Attribution suite

The new Rust `controls` command evaluates eight cases with the same input seed, target basis,
held-out protocol, and null procedure:

1. Kerr cavity with seven mode intensities;
2. Kerr-disabled cavity with the same seven intensities;
3. Kerr cavity with fourteen real mode quadratures;
4. Kerr-disabled cavity with the same fourteen quadratures;
5. pumped Kerr cavity with the data-input amplitude fixed to zero;
6. the direct feature \(u_t\);
7. the direct square-law feature \(u_t^2\);
8. the joint direct features \((u_t,u_t^2)\).

The two physical pairs differ only in the Kerr coefficient. Thermal feedback, state noise, and
detector noise are zero. Intensity and quadrature totals must not be compared as if they used the
same interface: quadrature readout charges fourteen real observations, while intensity charges
seven.

## Canonical SQLite result store

Each `run` or `controls` invocation now writes `results.sqlite` in its output directory. The Rust
crate uses bundled SQLite through `rusqlite`, so database creation does not depend on a separately
installed SQLite executable.

The database is a transactionally replaced snapshot of one invocation. Schema version 1 contains
normalized tables for:

- metadata and serialized configurations;
- physical and synthetic attribution cases;
- normalized resource accounts;
- target-level raw, null, significance, and corrected scores;
- singular values, rank profiles, and pre-standardization feature scales;
- seed and split sensitivity rows;
- replication summaries and target-level replication decisions.

Foreign keys connect case-owned measurements and replication targets. The human-readable files are
retained because they are convenient for review, but they are no longer the primary structured
record.

The frozen attribution database passes SQLite integrity and foreign-key checks. Its verified table
counts are:

| Relation | Rows |
| --- | ---: |
| Configurations | 6 |
| Cases | 8 |
| Resource accounts | 5 |
| Target scores | 440 |
| Singular values | 53 |
| Feature scales | 53 |
| Sensitivity rows | 24 |
| Replication conditions | 4 |
| Replicated-target decisions | 220 |

The Rust `db-check` command reports `integrity: ok`, zero foreign-key violations, the schema and
artifact versions, and these counts without requiring the `sqlite3` command-line program.

## Frozen protocol

The dynamical parameters and 55 Legendre-history targets remain those of Ledger 12. The estimator
changes are:

| Estimator parameter | Value |
| --- | ---: |
| Joint permutation trials | 512 |
| Target and family-wise quantile | 0.99 |
| Primary relative singular tolerance | \(10^{-6}\) |
| Seeds | 20260810, 20260811, 20260812 |
| Training fractions | 0.6, 0.7, 0.8 |

Seed comparisons use a training fraction of 0.7. Split comparisons reuse seed 20260810 and are
sensitivity checks rather than independent replications.

The capacity numbers in Ledger 12 remain a record of the earlier pooled-null estimator. The values
below supersede them for inference; changes caused solely by the stricter correction must not be
interpreted as changes in the simulated dynamics.

## Base-seed attribution result

| Case | Declared dimension | Rank | Stable rank | Significant targets | Corrected total | Linear | Nonlinear | Historical |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Kerr intensity | 7 | 5 | 2.094 | 1 | 0.977067 | 0 | 0.977067 | 0 |
| Kerr-disabled intensity | 7 | 2 | 1.944 | 2 | 0.984376 | 0 | 0.984376 | 0.007068 |
| Kerr quadrature | 14 | 14 | 3.570 | 3 | 1.035731 | 1.035731 | 0 | 0.043740 |
| Kerr-disabled quadrature | 14 | 4 | 3.025 | 3 | 1.017653 | 1.017653 | 0 | 0.025776 |
| Pump-only intensity | 7 | 1 | 1.000 | 0 | 0 | 0 | 0 | 0 |
| Direct \(u_t\) | 1 | 1 | 1.000 | 1 | 0.996522 | 0.996522 | 0 | 0 |
| Direct \(u_t^2\) | 1 | 1 | 1.000 | 1 | 0.995601 | 0 | 0.995601 | 0 |
| Direct \((u_t,u_t^2)\) | 2 | 2 | 1.904 | 2 | 1.991678 | 0.996038 | 0.995639 | 0 |

All corrected totals remain below their effective observation ranks.

## Attribution conclusions

### The direct controls calibrate the decomposition

One direct linear feature recovers approximately one unit of degree-one current-input capacity. One
direct square-law feature recovers approximately one unit of degree-two current-input capacity.
Their joint two-dimensional interface recovers approximately two units, one in each degree class.

This confirms that the target construction, readout, family-wise gate, and dimension accounting
separate the two elementary functions as intended.

### Pump-only structure is not mistaken for input processing

The pump-only case has one numerical observation direction because a small residual relaxation
remains after warm-up, but no target passes the family-wise gate and corrected capacity is zero.
Comb or pump dynamics alone is therefore not credited as data processing in this run.

### Intensity nonlinearity belongs to the detector control

Both intensity conditions expose almost one unit of \(L_2(u_t)\) capacity. The direct-square
control already supplies the same function, and Kerr does not improve the paired result.

Across the three paired seeds, Kerr-minus-disabled intensity total capacity lies in

\[
[-0.008197,-0.000522],
\]

and its historical-capacity difference lies in

\[
[-0.008946,0].
\]

Across training fractions 0.6, 0.7, and 0.8, the total difference remains in
\([-0.007309,-0.000480]\). The intensity interface supplies no evidence of Kerr advantage.

### Quadrature readout reveals linear memory, not nonlinear capacity

Quadrature observation removes square-law detection from the interface. Every base-seed capacity
that survives correction is degree one. At the base seed, Kerr increases total capacity by 0.018078
and historical capacity by 0.017964 relative to the Kerr-disabled quadrature control.

The paired Kerr-minus-disabled quadrature differences remain positive across all three seeds:

| Quantity | Minimum | Maximum | Mean |
| --- | ---: | ---: | ---: |
| Corrected total | 0.015012 | 0.020287 | 0.017792 |
| Historical capacity | 0.015171 | 0.020375 | 0.017836 |

They also remain positive across all three training fractions:

| Quantity | Minimum | Maximum | Mean |
| --- | ---: | ---: | ---: |
| Corrected total | 0.018078 | 0.043980 | 0.030233 |
| Historical capacity | 0.017964 | 0.043525 | 0.030335 |

This is a reproducible normalized-model indication that Kerr changes the distribution of linear
memory under coherent readout. It is not evidence of nonlinear computation.

## Cross-seed replication result

| Condition | Replicated targets | Minimum total | Minimum current | Minimum historical | Minimum nonlinear |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kerr intensity | 1 | 0.972732 | 0.972732 | 0 | 0.972732 |
| Kerr-disabled intensity | 1 | 0.971983 | 0.971983 | 0 | 0.971983 |
| Kerr quadrature | 3 | 1.034349 | 0.990608 | 0.043740 | 0 |
| Kerr-disabled quadrature | 3 | 1.016472 | 0.990696 | 0.025776 | 0 |

The replicated quadrature targets are \(L_1(u_t)\), \(L_1(u_{t-3})\), and
\(L_1(u_{t-4})\). Their Kerr lower-envelope historical capacity exceeds the control by 0.017964.
No degree-two or degree-three quadrature target replicates across all seeds.

The replicated intensity target is only \(L_2(u_t)\), which the direct square-law control already
explains. One historical mixed target appears in two Kerr-disabled intensity seeds but fails the
three-seed replication gate.

## Spectrum and raw-scale result

| Condition | Rank at \(10^{-3}\) | Rank at \(10^{-6}\) | Stable rank | Participation ratio | Smallest nonzero raw relative feature scale |
| --- | ---: | ---: | ---: | ---: | ---: |
| Kerr intensity | 5 | 5 | 2.094 | 3.170 | \(5.04\times10^{-10}\) |
| Kerr-disabled intensity | 2 | 2 | 1.944 | 1.998 | \(2.49\times10^{-2}\) |
| Kerr quadrature | 12 | 14 | 3.570 | 6.198 | \(3.77\times10^{-8}\) |
| Kerr-disabled quadrature | 4 | 4 | 3.025 | 3.767 | \(9.32\times10^{-4}\) |

Kerr unquestionably activates additional mathematical observation directions in this finite model.
It does not follow that all are measurable. In the Kerr quadrature case, the largest training
feature standard deviation is 0.090116 while the smallest is
\(3.40\times10^{-9}\). Standardization permits an unconstrained readout to amplify both.

Consequently, rank 14 and the small linear-memory gain are ideal-noiseless results. Detector noise,
finite local-oscillator power, ADC precision, readout-weight norm, and stabilization error may erase
the weak directions. They must be charged before this effect can be described as available physical
memory.

## Critique

The calibration succeeds in preventing three distinct attribution errors:

1. Degree-two intensity capacity is not assigned to Kerr when a direct square-law control already
   supplies it.
2. Pump-only and one-seed target correlations are not assigned input-conditioned capacity.
3. Additional standardized rank is not silently equated with usable SNR.

The positive quadrature result is nevertheless worth retaining. It has the right paired sign across
three seeds and three splits, and the same delayed linear targets replicate. It establishes a
specific local phenomenon to attack next: Kerr-modified coherent linear memory. It does not satisfy
the Conjecture 5 gate because the required nonlinear delayed capacity is zero.

Three seeds remain a small replication set. The split variants are correlated, the model is
noiseless, the parameter point is singular rather than a connected region, and no matched cascade
has been evaluated. The maximum-statistic correction is an empirical finite-sample procedure, not
a proof that every future sweep is free of selection bias.

## Decision

The attribution and estimator-calibration gate is passed. The instrument can now distinguish input,
detector, pump-only, field-linear, and Kerr-associated contributions while exposing rank and raw
signal scale.

The empirical gate for Conjecture 5 remains closed. There is no replicated nonlinear delayed
capacity. The only positive Kerr-associated result is a small coherent linear-memory shift whose
weakest observation channels are many orders of magnitude below the strongest.

The next coherent step is to add detector noise at the observation boundary, report output SNR and
readout-weight amplification, and recompute noise-aware capacity and rank for the quadrature pair.
Only if the replicated lag-three and lag-four advantage survives a declared noise floor should the
normalized pump/detuning/Kerr/symbol-duration siege sweep begin.
