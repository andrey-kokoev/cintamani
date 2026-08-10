# Entropy Estimator Calibration

| Operator | Spectrum/rank | Survival | Cycle | Result |
|---|---:|---:|---:|---|
| identity | 16.000 | 1.000 | Some(1) | pass |
| contraction | 16.000 | 0.410 | None | pass |
| expansion | 16.000 | 2.074 | None | pass |
| unitary | 16.000 | 1.000 | Some(4) | pass |
| low-rank | 4.000 | 0.548 | Some(1) | pass |
| period-2 | 16.000 | 1.000 | Some(2) | pass |
| period-4 | 16.000 | 1.000 | Some(4) | pass |
| noisy-identity | 16.000 | 1.000 | Some(1) | pass |

Estimator calibrated: **true**. Acceptance decisions remain disabled unless convergence also passes.

## Trustworthy measurements

Converged settings are recorded in `estimator-convergence.csv`. Unstable settings excluded from decisions: cycle_period (cycle_tolerance=0.001).
