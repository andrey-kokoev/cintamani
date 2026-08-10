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

Two independently coded cubic operators are available:

- `direct-modal` evaluates the frequency-selection sum directly;
- `pseudospectral` evaluates `|psi|^2 psi` on a zero-padded angular grid and projects it back to the
  retained Fourier modes without circular aliasing.

The capacity estimator uses products of probability-normalized Legendre polynomials of an i.i.d.
uniform input history. It standardizes observations on the training partition only, fits a fixed
ridge readout, scores on a later held-out partition, and subtracts a seeded global permutation-null
quantile. It reports the unaltered empirical total and checks it against the numerical rank of the
training observation matrix; it never clamps the total to make the bound pass.

## Commands

From the repository root:

```powershell
pnpm --filter @cintamani/kerr-capacity check
pnpm --filter @cintamani/kerr-capacity test
pnpm --filter @cintamani/kerr-capacity cross-check
pnpm --filter @cintamani/kerr-capacity run:smoke
pnpm --filter @cintamani/kerr-capacity run:linear-control
```

Or run an arbitrary configuration from this directory:

```powershell
cargo run --release -- run configs/smoke.toml --output output/smoke
```

Each run writes `config.json`, `summary.json`, target-level `capacities.csv`, grouped capacity CSVs,
and `report.md`. Setting `save_samples = true` also writes the input, state diagnostics, and every
declared observation to `samples.csv`.

## Deliberate perimeter

Raman dynamics are unsupported in this first executable. Configuration validation rejects every
nonzero `raman_fraction` until a material- and orientation-specific response kernel exists. The
model also does not yet claim physical-unit calibration, detector bandwidth/noise, or accounting of
energy leaking beyond the retained mode window; reports repeat these exclusions.
