# Detector-Noise Survival of Kerr Quadrature Memory

## Status

The Ledger 13 coherent-quadrature memory lead survives the predeclared normalized detector-noise
gate. At detector-noise standard deviation \(10^{-8}\), both \(L_1(u_{t-3})\) and
\(L_1(u_{t-4})\) remain family-wise significant in the Kerr case across seeds 20260810, 20260811,
and 20260812, and their Kerr-minus-disabled corrected-capacity differences remain positive in every
seed. Their signed cross-seed lower envelopes are respectively 0.003779 and 0.014251.

This is a local normalized-model result, not detector calibration and not evidence of nonlinear
computation. No degree-two or degree-three target replicates at the decision floor. The empirical
gate for Conjecture 5 therefore remains closed.

The correct decision is to retain the Kerr-modified linear-memory lead and advance it to a bounded
parameter-region siege. That next search must remain distinct from a claim of physical detector
feasibility.

## Predeclared falsification protocol

The protocol was frozen before the evidence-producing run:

| Quantity | Frozen value |
| --- | ---: |
| Observation | coherent real and imaginary bus-field quadratures |
| Detector-noise standard deviations | (0,10^{-10},10^{-9},10^{-8},10^{-7}) |
| Decision floor | \(10^{-8}\) |
| Seeds | 20260810, 20260811, 20260812 |
| Samples per seed | 2400 after 128 warm-up symbols |
| Target family | 55 Legendre-history targets, degree at most 3 and lag at most 4 |
| Training fraction | 0.7 |
| Joint permutations | 512 |
| Family-wise quantile | 0.99 |
| Replication rule | target passes the family-wise gate in every seed |
| Paired-advantage rule | Kerr target replicates and Kerr-minus-disabled is positive in every seed |

The \(10^{-8}\) decision floor was chosen because Ledger 13 measured the weakest Kerr quadrature
feature standard deviation as approximately \(3.4\times10^{-9}\). The grid contains levels below
and above that feature scale. Results at \(10^{-7}\) are retained as descriptive severity evidence;
they did not move the predeclared decision boundary.

All detector-noise values are in normalized real-quadrature units. No dimensional LiTaO3 detector,
local oscillator, bandwidth, ADC, shot-noise, or quantization model is inferred from them.

## Observation-boundary implementation

`noise_std` remains dynamical state noise. The new `detector_noise_std` is independent configuration
state and is applied only after the noiseless bus output

\[
s_{\mathrm{out}}=s_{\mathrm{in}}-\sqrt{\kappa_{\mathrm{external}}}\,a
\]

has been converted into the declared real observation interface. The noiseless observation is
retained for diagnostics, while only the noisy observation is supplied to the readout.

Input, dynamical-noise, detector-noise, and permutation streams have distinct deterministic seed
derivations. Kerr and Kerr-disabled cases with the same seed and detector-noise level receive the
same detector standard-normal draws. Changing detector noise leaves input symbols, state power,
thermal state, and noiseless observations unchanged.

Focused tests establish reproducibility, common random numbers, observation-boundary placement,
state/detector RNG separation, and exact zero-detector-noise backward behavior.

## Signal, SNR, and readout amplification

For feature (j), the signal scale (s_j) is the standard deviation of the noiseless feature on
the training partition only. With declared detector-noise standard deviation \(\sigma_d\), the
reported linear power SNR and decibel SNR are

\[
\operatorname{SNR}_j=\frac{s_j^2}{\sigma_d^2},
\qquad
\operatorname{SNR}_{j,\mathrm{dB}}=10\log_{10}\operatorname{SNR}_j.
\]

Zero detector noise is represented explicitly as infinite SNR for nonconstant signals and as an
undefined zero-over-zero case for constant signals; non-finite floating-point values are not
serialized. The report also records the realized training-sample RMS of the injected noise. Across
all nonzero cases, realized-to-declared RMS lies in [0.9666, 1.0325], with mean 0.9962.

If a readout fitted in standardized coordinates has weights \(w_j\) and observed training scales
\(r_j\), its raw-equivalent norm and detector-noise gain are

\[
\lVert w_{\mathrm{raw}}\rVert_2
=\sqrt{\sum_{j:r_j>0}\left(\frac{w_j}{r_j}\right)^2},
\qquad
g_d=\sigma_d\lVert w_{\mathrm{raw}}\rVert_2.
\]

The standardized norm \(\lVert w\rVert_2\) is also reported. A degenerate feature is set to zero
during training; raw conversion would be marked undefined if it nevertheless acquired a nonzero
standardized weight. No undefined conversion occurred in the frozen suite.

At the \(10^{-8}\) gate, across the six Kerr lag-three/four readouts:

| Readout quantity | Minimum | Maximum | Mean |
| --- | ---: | ---: | ---: |
| Standardized weight norm | 6.523 | 15.305 | 11.944 |
| Raw-equivalent weight norm | \(1.244\times10^6\) | \(4.939\times10^6\) | \(2.775\times10^6\) |
| Detector-noise gain | 0.01244 | 0.04939 | 0.02775 |
| Corrected target capacity | 0.01203 | 0.05129 | 0.02793 |

The weights remain large in raw normalized coordinates. Passing the normalized noise test does not
remove this engineering concern.

## Noiseless rank and noise-aware observable dimension

Three notions are kept separate:

1. observed standardized numerical rank, which becomes full when nonzero independent noise is
   standardized;
2. noiseless standardized numerical rank at the configured relative singular tolerance
   \(10^{-6}\), which records ideal mathematical span;
3. noise-aware observable dimension.

At zero detector noise, the noise-aware dimension is defined to equal noiseless numerical rank. At
nonzero noise it counts noiseless raw principal standard deviations strictly greater than
\(\sigma_d\), capped by noiseless numerical rank. The strict threshold boundary and zero-noise
case are unit-tested. Every noiseless standardized singular value and every noiseless raw principal
standard deviation is serialized so the count is auditable.

Across all three seeds, the dimensions are:

| Detector-noise std | Kerr noiseless rank | Kerr noise-aware dimension | Disabled noiseless rank | Disabled noise-aware dimension |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 14 | 14 | 4 | 4 |
| \(10^{-10}\) | 14 | 14 | 4 | 4 |
| \(10^{-9}\) | 14 | 13 | 4 | 4 |
| \(10^{-8}\) | 14 | 12 | 4 | 4 |
| \(10^{-7}\) | 14 | 9 | 4 | 4 |

At the decision floor, the smallest Kerr per-feature signal scale lies between
\(3.01\times10^{-9}\) and \(3.40\times10^{-9}\) across seeds, giving a worst per-feature SNR between
-10.44 dB and -9.38 dB. The two below-floor features span -10.44 dB to -7.34 dB across the three
seeds. Twelve of fourteen Kerr features individually exceed the noise standard deviation, and the
principal-axis criterion also yields dimension 12. The strongest feature scale remains
approximately 0.09. The disabled system has only four noiseless directions; its remaining features
are constant before detector noise.

## Paired capacity outcome

The Kerr-minus-disabled total and historical-capacity differences remain positive at every level
and seed:

| Detector-noise std | Total difference range | Total mean | Historical difference range | Historical mean |
| ---: | ---: | ---: | ---: | ---: |
| 0 | [0.015012, 0.020287] | 0.017792 | [0.015171, 0.020375] | 0.017836 |
| \(10^{-10}\) | [0.036568, 0.065679] | 0.054970 | [0.035121, 0.063522] | 0.052767 |
| \(10^{-9}\) | [0.028408, 0.057255] | 0.041580 | [0.027235, 0.055301] | 0.039651 |
| \(10^{-8}\) | [0.022500, 0.039771] | 0.033830 | [0.022453, 0.037882] | 0.032324 |
| \(10^{-7}\) | [0.018369, 0.035495] | 0.028876 | [0.018564, 0.034316] | 0.027954 |

The two predeclared delayed targets have the following cross-seed outcomes:

| Noise std | Target | Kerr significant seeds | Disabled significant seeds | Positive paired deltas | Signed lower envelope | Mean delta |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 0 | \(L_1(u_{t-3})\) | 3/3 | 3/3 | 3/3 | 0.006939 | 0.008130 |
| 0 | \(L_1(u_{t-4})\) | 3/3 | 3/3 | 3/3 | 0.010641 | 0.011823 |
| \(10^{-10}\) | \(L_1(u_{t-3})\) | 3/3 | 3/3 | 3/3 | 0.009115 | 0.011521 |
| \(10^{-10}\) | \(L_1(u_{t-4})\) | 3/3 | 1/3 | 3/3 | 0.021863 | 0.029051 |
| \(10^{-9}\) | \(L_1(u_{t-3})\) | 3/3 | 3/3 | 3/3 | 0.006079 | 0.007287 |
| \(10^{-9}\) | \(L_1(u_{t-4})\) | 3/3 | 1/3 | 3/3 | 0.015147 | 0.024363 |
| \(10^{-8}\) | \(L_1(u_{t-3})\) | 3/3 | 3/3 | 3/3 | 0.003779 | 0.005831 |
| \(10^{-8}\) | \(L_1(u_{t-4})\) | 3/3 | 1/3 | 3/3 | 0.014251 | 0.021342 |
| \(10^{-7}\) | \(L_1(u_{t-3})\) | 3/3 | 3/3 | 3/3 | 0.003640 | 0.006318 |
| \(10^{-7}\) | \(L_1(u_{t-4})\) | 3/3 | 1/3 | 3/3 | 0.014924 | 0.019287 |

At the \(10^{-8}\) gate, the only Kerr targets that replicate are the current input and the two
declared delayed linear targets. No nonlinear target replicates. Detector noise therefore preserves
the local Kerr-associated redistribution of linear memory; it does not uncover nonlinear delayed
capacity. Lag three also exists significantly in the disabled control in 3/3 seeds, and lag four in
1/3 control seeds. The earned result is thus the replicated positive Kerr-minus-disabled advantage,
not unique existence of delayed memory under Kerr.

## Canonical SQLite evidence

Schema version 2 stores the result transactionally in
`packages/kerr-capacity/output/detector-noise-frozen/results.sqlite`. The output directory remains an
ignored reproducible artifact directory; the ledger and frozen configuration are Git-visible.

Normalized relations contain:

| Relation | Rows |
| --- | ---: |
| Noise levels | 5 |
| Normalized observation-noise cases | 30 |
| Resource accounts | 30 |
| Target/readout records | 1650 |
| Singular-value records | 420 |
| Feature-scale records | 420 |
| Signal/SNR diagnostic records | 420 |
| Paired target differences | 825 |
| Cross-seed replication outcomes | 275 |

SQLite reports `integrity: ok` and zero foreign-key violations. Derived JSON, CSV, and Markdown
exports are produced from the same in-memory suite. Selected SHA-256 hashes from the evidence run
are:

| Artifact | SHA-256 |
| --- | --- |
| `results.sqlite` | `4A1A403E23737CCFBA169B1F15198865BC37AB288102A5A8427F3D43749F6315` |
| `noise-suite.json` | `E2FFD54D9ACDBA49EF066E3E2D4E60FE6B85822A48D098AFA8E7922D237B6D98` |
| `noise-replication.csv` | `454A6CF56A701F292D4EECE7D781559B08051B14AD1D1C25A267307EB40BC732` |

## Deutsch–Popperian critique

The local conjecture under test was not that Kerr memory is generally robust. It was the narrower
claim that the Ledger 13 lag-three/four quadrature advantage would survive a predeclared normalized
independent observation-noise floor at one frozen parameter point. The experiment exposed that
claim to failure and it survived.

That survival identifies new errors to attack rather than supplying confirmation:

1. **The noise has no detector physics.** It is independent additive Gaussian noise in normalized
   quadrature coordinates. Correlation, phase dependence, local-oscillator limits, finite bandwidth,
   quantization, drift, and shot noise remain unmodeled.
2. **Raw readout amplification remains severe.** Gate-target raw-equivalent norms are between
   \(1.24\times10^6\) and \(4.94\times10^6\). The measured noise gains remain finite in this model,
   but no actuator, estimator, or electronic dynamic-range constraint has been imposed.
3. **Any nonzero noise changes the standardized control design.** Ten exactly constant
   Kerr-disabled features become pure-noise columns and are standardized to unit variance. Its
   observed standardized rank therefore jumps from 4 to 14 even though noiseless and noise-aware
   ranks correctly remain 4. The sharp capacity change between zero and \(10^{-10}\) is consequently
   an estimator/readout effect, not a physical enhancement. The paired design remains fair, but the
   magnitude of the noisy Kerr advantage is not monotone evidence of stronger physics.
4. **The observable-dimension rule is declared, not derived from an instrument.** A one-standard-
   deviation principal-axis floor is an auditable robustness criterion, not a universal definition
   of observability.
5. **Replication is still local.** Three seeds test sampling variation at one dynamical point. They
   do not establish a connected parameter region, fabrication tolerance, or comparison against a
   resource-matched linear cascade.
6. **Only one level was inferentially decisive.** The \(10^{-8}\) gate was fixed in advance. The
   remaining levels map severity and must not be mined post hoc for a more favorable threshold.

The next severe test should therefore seek a connected region in normalized pump, detuning, Kerr
strength, and symbol duration while retaining the same paired noise and replication rules. It
should add a declared readout-gain constraint and a resource-matched linear or cascaded control.
The siege should try to destroy the lead, not optimize a single successful point.

## Verification

The implementation passed:

- `cargo fmt --check`;
- `cargo check --all-targets`;
- `cargo test --all-targets` with 31 passing tests;
- direct/pseudospectral full-RHS cross-check error \(5.389158\times10^{-16}\), below \(10^{-9}\);
- the release-mode frozen noise-suite command;
- SQLite integrity and foreign-key checks;
- `git diff --check`.

## Decision

The predeclared detector-noise gate is passed. The Kerr-associated lag-three/four coherent linear
memory survives normalized detector noise at \(10^{-8}\) across all three frozen seeds, while the
noise-aware Kerr observation dimension falls from 14 to 12.

Advance the lead to a bounded categorical parameter siege, with readout-gain and matched-linear
controls carried forward. Do not claim physical detector viability. Do not formulate Conjecture 5:
the required replicated nonlinear delayed capacity remains zero.
