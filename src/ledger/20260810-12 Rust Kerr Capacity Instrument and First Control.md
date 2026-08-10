# Rust Kerr Capacity Instrument and First Control

## Status

The normalized Kerr characterization requested by the previous ledger entry now exists as an
executable Rust package at `packages/kerr-capacity`. pnpm only orchestrates the Cargo commands; the
simulator, estimator, command-line interface, tests, and report generation are implemented in Rust.

The first paired run passes the fixed-observation capacity-bound check but does not support
Conjecture 5. At this parameter point, enabling Kerr dynamics increases the numerical rank of the
observed mode set without increasing corrected total capacity or useful delayed-input capacity. The
Kerr-disabled control exposes the main apparent nonlinear capacity as square-law detector capacity,
not evidence of Kerr computation.

This is one normalized, noiseless parameter point and a severe control, not a LiTaO3 device claim.

## Executable process model

The crate evolves an odd, centered window of complex cavity modes with

\[
\dot a_\mu=
\left[-\frac{\kappa}{2}
+i\left(\delta-\theta-\frac{D_2\mu^2}{2}\right)\right]a_\mu
+ig\!\sum_{p+q-r=\mu}a_pa_qa_r^*
+\sqrt{\kappa_{\mathrm{ex}}}\,s_\mu(t).
\]

The declared drive has a continuous pump in mode zero and a bounded data signal in a separately
declared mode. The scalar thermal detuning obeys

\[
\dot\theta=\eta_T\sum_\mu |a_\mu|^2-\gamma_T\theta.
\]

Integration uses fixed-step fourth-order Runge-Kutta. Optional complex Gaussian state noise has a
seed independent of the input-stream seed. A run fails instead of silently continuing if the state
becomes non-finite.

Two independently implemented Kerr operators represent the coupled-mode and mean-field/Fourier
views:

- `direct-modal` evaluates the frequency-selection sum explicitly;
- `pseudospectral` constructs the angular field, evaluates \(|\psi|^2\psi\), and projects it back
  to the retained modes.

For \(N=2h+1\) modes, the pseudospectral path uses a grid of length \(4N\). Since the cubic spectrum
lies in \([-3h,3h]\), this is long enough to prevent circular aliases from returning to the requested
window \([-h,h]\). It is deliberately a transparent discrete Fourier implementation rather than an
optimized FFT at this stage.

The accessible bus field is fixed as

\[
s_{\mathrm{out},\mu}=s_{\mathrm{in},\mu}
-\sqrt{\kappa_{\mathrm{ex}}}\,a_\mu.
\]

Each symbol contributes exactly one observation snapshot. The configured observation is mode
intensity, mode quadratures, or both. No virtual time nodes are introduced without increasing the
declared real observation dimension.

## Resource boundary

Every run records normalized integrals for:

- elapsed evolution time;
- incident continuous-pump energy;
- incident data-signal energy;
- coupling-weighted drive energy;
- intrinsic dissipation;
- external state out-coupling;
- expected energy injected by the declared noise process.

It also records mean and peak intracavity power and the final thermal state. Intrinsic loss and
external out-coupling are kept separate because the latter belongs to the accessible optical
interface rather than automatically to waste.

Raman response is not replaced by an arbitrary scalar correction. Every nonzero `raman_fraction`
is rejected until a material- and orientation-specific response kernel is implemented.

## Capacity estimator

The input samples are seeded and independently uniform on \([-1,1]\). Targets are products of
probability-normalized Legendre polynomials over the declared input-history window. The finite
target family is grouped by total polynomial degree, maximum lag, and number of interacting lags.

The estimator applies the following protocol:

1. Align observations and targets only after the maximum requested lag.
2. Split time sequentially into training and held-out partitions.
3. Center and scale observations using training statistics only.
4. Fit a linear ridge readout, including a training-only target mean.
5. Score capacity on the held-out partition relative to that trained-mean baseline.
6. Shuffle each target repeatedly with a separate deterministic seed, pool positive null scores,
   and take the configured global null quantile.
7. Subtract that threshold from every raw target score and floor each corrected score at zero.
8. Compare the unaltered corrected sum with the numerical rank of the training observation matrix.

The program does not clamp the total to the rank. A total exceeding rank by more than the declared
finite-sample tolerance is reported as an empirical capacity-bound violation to investigate, not
rewritten into a passing result.

## Numerical verification

The Rust package has twelve passing tests covering:

- configuration and Raman-boundary validation;
- probability normalization of the Legendre basis;
- direct versus zero-padded cubic convolution;
- direct versus pseudospectral trajectories;
- the declared passive loss rate;
- deterministic input, noise, and permutation seeds;
- recovery of two known linear memories from a rank-two synthetic observation;
- the corresponding corrected-capacity/rank bound;
- complete-right-hand-side cross-checking;
- resource and report fields.

At the nonzero-Kerr smoke configuration, the maximum absolute direct/pseudospectral right-hand-side
difference was

\[
5.389158\times 10^{-16}.
\]

`cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, Cargo tests, and the pnpm package
checks pass.

## Frozen first comparison

The two committed configurations are identical except for the Kerr coefficient:

| Parameter | Value |
| --- | ---: |
| Seed | 20260810 |
| Retained modes | 7, indexed \(-3\) through \(3\) |
| Pump mode / data mode | 0 / 1 |
| Kerr coefficient, enabled / control | 0.35 / 0 |
| Intrinsic loss / external coupling | 0.65 / 0.35 |
| Detuning / second-order dispersion | 1.4 / -0.02 |
| Pump amplitude / input scale | 1.25 / 0.16 |
| Thermal coupling / decay | 0 / 0.08 |
| Step / steps per symbol | 0.02 / 4 |
| Warm-up / recorded symbols | 128 / 2400 |
| Observation | 7 bus-output intensities |
| Target degree / maximum lag | 3 / 4 |
| Training fraction / ridge | 0.7 / \(10^{-6}\) |
| Null trials / null quantile | 8 / 0.99 |

Lag alignment leaves 2,396 samples: 1,677 training and 719 held out. There are 55
population-orthonormal targets through degree three and lag four. State noise is zero; detector
noise remains outside this model.

## Result

| Measurement | Kerr 0.35 | Kerr-disabled | Kerr minus control |
| --- | ---: | ---: | ---: |
| Declared observation dimension | 7 | 7 | 0 |
| Effective observation rank | 5 | 2 | +3 |
| Positive raw capacity sum | 1.031373 | 1.022198 | +0.009175 |
| Corrected total capacity | 0.979571 | 0.985532 | -0.005961 |
| Corrected degree-one capacity | 0 | 0 | 0 |
| Corrected degree-two capacity | 0.979152 | 0.985532 | -0.006381 |
| Corrected degree-three capacity | 0.000419 | 0 | +0.000419 |
| Current-input capacity | 0.977995 | 0.978269 | -0.000275 |
| Capacity involving history | 0.001576 | 0.007263 | -0.005687 |
| Effective-rank margin | 4.020429 | 1.014468 | — |

Both runs are within the effective-rank bound. Their independently estimated global permutation
thresholds are 0.003934 for the Kerr run and 0.003235 for the control.

The normalized input-resource integrals are matched exactly: pump energy 316.000000, signal energy
1.721150, and coupling-weighted drive energy 111.202402 in each condition. The Kerr run has mean
intracavity power 0.224683; the control has 0.247716. Thermal coupling is explicitly disabled in
both, so the final thermal state is zero. These figures are useful for internal accounting only and
have not been converted into joules or watts for a LiTaO3 device.

## Critique of the result

### The capacity bound survived this attempted falsification

The corrected totals are below their effective ranks without post hoc clipping. This is consistent
with the observation-space bound. It is not an empirical proof of the theorem, and the evaluated
target basis is incomplete beyond degree three and lag four.

### Additional active modes did not create additional readable capacity

Kerr mixing raised the numerical observation rank from two to five, yet corrected total capacity
fell slightly. Mode activation and rank availability therefore cannot be counted as task-relevant
capacity without showing input-conditioned readable functions.

### The detector explains the apparent nonlinearity

With Kerr and thermal feedback disabled, the control dynamics is affine in the field but its
intensity observation is quadratic. It retains 0.985532 corrected degree-two capacity, almost
entirely for the current input. The Kerr run's similar 0.979152 degree-two result therefore cannot
be credited to the material nonlinearity. This is the executable version of the ledger's warning
that decoder and detector nonlinearities are resources.

### Raw capacity would have suggested the wrong ordering

The positive raw sum is larger with Kerr, while the bias-corrected total is smaller. This one case
does not validate the chosen correction universally, but it demonstrates why an uncorrected sum
over many targets is not an admissible success metric.

### No useful memory gain appeared

Capacity involving any historical input is effectively absent in the Kerr run and is lower than in
the Kerr-disabled control. This parameter point fails the gate requiring recurrence-enhanced
task-relevant nonlinear delayed capacity while preserving input memory.

## Limits of this entry

The comparison has only one seed and one parameter point. Thermal dynamics is implemented but is
disabled here to isolate the Kerr coefficient. The comparison does not include Raman response,
observation noise, detector bandwidth, physical-unit calibration, out-of-window leakage,
orientation, a pump-only control, direct input-feature controls, a matched feed-forward Kerr
cascade, or a parameter sweep. The numerical-rank threshold is also an analysis convention and
must be tested for stability. Direct feedthrough of the current data field is part of the declared
bus observation and is why current-input controls remain essential.

## Decision

The implementation gate is passed: there is now a reproducible Rust instrument that represents the
open driven process, cross-checks coupled-mode and LLE/Fourier formulations, charges fixed
observations and normalized resources, and estimates held-out bias-corrected capacity.

The empirical gate for Conjecture 5 is not passed. The first controlled result is negative: Kerr
does not improve corrected total or delayed nonlinear capacity at this operating point, and the
dominant nonlinear score already exists with Kerr disabled.

The next experiment should add explicit linear-input, square-law-input, pump-only, and matched
cascade controls, then sweep pump, detuning, Kerr strength, symbol duration, input scale, and
quadrature versus intensity observation. Conjecture 5 remains deferred unless a connected robust
region survives those controls.
