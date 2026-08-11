# Cintamani Kerr Capacity

This Rust crate implements the first characterization experiment specified by the Cintamani
ledger. It is a falsification instrument, not a calibrated LiTaO3 device model.

The retained modal amplitudes obey the normalized driven-dissipative equation

```text
da_mu/dt = [-kappa/2 + i(delta - theta - D2 mu^2/2)] a_mu
            + i g sum_(p+q-r=mu) a_p a_q conj(a_r)
            + sqrt(kappa_external) s_mu(t).
```

The thermal state follows `d theta/dt = thermal_coupling * sum |a_mu|^2 -
thermal_decay * theta`. Additive complex Gaussian state noise is optional and separately seeded.
The measured bus field uses `s_out = s_in - sqrt(kappa_external) a`; each symbol contributes one
fixed snapshot, so no uncharged virtual time nodes enter the observation dimension.
`detector_noise_std` is a separate normalized Gaussian scale applied only after that noiseless bus
observation. It uses its own deterministic RNG stream; matched Kerr and Kerr-disabled cases reuse
the same draws. The simulator retains the noiseless interface for training-partition signal/SNR
diagnostics but supplies only the noisy interface to the readout.

Two independently coded cubic operators are available:

- `direct-modal` evaluates the frequency-selection sum directly;
- `pseudospectral` evaluates `|psi|^2 psi` on a zero-padded angular grid and projects it back to the
  retained Fourier modes without circular aliasing.

The capacity estimator uses products of probability-normalized Legendre polynomials of an i.i.d.
uniform input history. It standardizes observations on the training partition only, fits a fixed
ridge readout, and scores on a later held-out partition. Joint row permutations preserve the target
family while breaking its relation to observations. A target must pass a family-wise maximum-null
threshold before its target-specific null threshold is subtracted. The report includes the complete
singular spectrum, stable rank, participation ratio, and ranks at explicit relative tolerances. It
never clamps the capacity total to make the observation-rank bound pass.

## Commands

From the repository root:

```powershell
pnpm --filter @cintamani/kerr-capacity check
pnpm --filter @cintamani/kerr-capacity test
pnpm --filter @cintamani/kerr-capacity cross-check
pnpm --filter @cintamani/kerr-capacity run:smoke
pnpm --filter @cintamani/kerr-capacity run:linear-control
pnpm --filter @cintamani/kerr-capacity controls
pnpm --filter @cintamani/kerr-capacity noise-suite:frozen
pnpm --filter @cintamani/kerr-capacity db-check
```

Or run an arbitrary configuration from this directory:

```powershell
cargo run --release -- run configs/smoke.toml --output output/smoke
```

Each run writes a normalized relational snapshot to `results.sqlite`; this is the canonical result
artifact. JSON, target-level and grouped CSVs, singular diagnostics, and `report.md` remain derived
inspection exports. Setting `save_samples = true` also writes the input, state diagnostics, and
every declared observation to `samples.csv`.

The `controls` command runs Kerr/Kerr-disabled intensity and quadrature pairs, a pump-only case,
direct linear and square-law input controls, and matched seed/split sensitivity checks. Its SQLite,
CSV, JSON, singular-spectrum, raw-feature-scale, and Markdown products are written under
`output/controls`. The SQLite schema relates configurations, cases, resources, targets, spectra,
sensitivity rows, and replication decisions. The cross-seed summary admits a target only when it
passes the family-wise gate in every seed, then charges its minimum corrected capacity across those
seeds.

The frozen detector-noise suite evaluates coherent quadratures at normalized detector-noise
standard deviations `0`, `1e-10`, `1e-9`, `1e-8`, and `1e-7` for seeds 20260810 through 20260812.
The `1e-8` level is the predeclared decision floor. Every case reports per-feature signal scale,
declared and realized noise, power SNR and dB SNR, readout norms in standardized and raw-equivalent
coordinates, detector-noise gain, ideal noiseless numerical rank, and a separate noise-aware
observable dimension. At nonzero noise, the latter counts noiseless raw principal standard
deviations strictly above the detector-noise standard deviation, capped by ideal numerical rank.
At zero noise it equals the ideal rank. Degenerate training features are zeroed; raw weight
conversion is explicitly marked undefined if a nonzero standardized weight were ever assigned to
one.

Schema version 2 adds these diagnostics and normalized noise-level, noise-case, paired-difference,
and cross-seed replication relations. `noise-suite.json` and the CSV/Markdown files are derived
from the same in-memory suite written transactionally to `results.sqlite`.

## Deliberate perimeter

Raman dynamics are unsupported in this first executable. Configuration validation rejects every
nonzero `raman_fraction` until a material- and orientation-specific response kernel exists. The
model does not claim physical-unit detector calibration, shot-noise physics, local-oscillator or
ADC limits, detector bandwidth, or accounting of energy leaking beyond the retained mode window;
reports repeat these exclusions. The normalized additive detector floor is a robustness charge,
not a model of any particular instrument.
