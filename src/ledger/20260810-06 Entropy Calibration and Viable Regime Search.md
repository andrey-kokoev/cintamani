# Entropy Calibration and Viable-Regime Search — Results

## Objective

Before using entropy characterization to accept or reject a VRC substrate, verify that its estimators distinguish analytically known dynamical regimes and converge under reasonable estimator settings.

The governing rule was:

> Do not train a task model until the characterization subsystem can distinguish known reference dynamics and at least one candidate operator exhibits bounded, persistent, high-dimensional recurrence.

## Implementation

The entropy subsystem was extended with matrix-free reference and candidate operators, autonomous and persistently driven analysis, estimator-convergence sweeps, and residual-family search.

The singular-spectrum estimator uses deflated power iteration on \(J^T J\) through Jacobian-vector and vector-Jacobian products. It does not materialize a full transmission matrix or Jacobian. The `StateOperator` interface remains compatible with future measured physical input-output probes.

Reference operators were added for:

- identity;
- scalar contraction;
- scalar expansion;
- orthogonal/unitary dynamics;
- known low rank;
- period 2;
- period 4;
- noisy identity.

## Calibration result

All eight reference regimes passed their expected checks:

- identity preserved perturbations and produced a fixed point;
- contraction and expansion matched their analytic recurrence gains;
- unitary dynamics preserved norm and rank;
- the rank-4 operator was estimated at effective rank 4;
- period-2 and period-4 operators were identified correctly;
- measurement noise reduced the noisy identity's capacity estimate.

Therefore the implemented estimator was calibrated on the selected reference set.

## Robustness result

The sweep varied:

- random seed;
- probe count;
- perturbation magnitude;
- JVP tolerance;
- singular-value threshold;
- cycle-detection tolerance.

Forty-two convergence records were produced with confidence intervals.

The setting

```text
cycle_tolerance = 0.001
```

was unstable and produced false early-cycle identifications. It was excluded from decisions. The tighter cycle tolerances converged, and the candidate gate used

```text
cycle_tolerance = 0.0001
```

No candidate decision used the excluded setting.

## Residual operator family

The searched recurrence was

\[
S_{t+1}=(1-\gamma)S_t+\gamma F_\Theta(S_t,Q).
\]

The search varied residual coefficient, coupling scale, nonlinear strength, transmission/loss, persistent input injection, noise, and connectivity radius. Every candidate was evaluated in autonomous and persistently driven modes through \(T=32\), across three seeds.

The final sweep contained:

```text
86 candidate configurations
3 seeds per configuration
258 candidate-seed evaluations
516 autonomous/driven rows
```

Candidate gates required:

- bounded norm through \(T=32\);
- no stable cycle of period at most 4 before \(T=32\);
- non-negligible perturbation survival at \(T=16\) and \(T=32\);
- retention of effective rank from early to late recurrence;
- distinguishable trajectories for different persistent inputs;
- a measurable nonlinear-ablation effect;
- converged estimator settings;
- success across every tested seed.

Seventy-eight regimes passed every gate across all three seeds.

## Regime selected for the first task test

The highest-survival viable regime selected for freezing was:

```text
gamma               = 0.03
coupling_scale      = 2.0
nonlinear_strength  = 0.5
transmission        = 0.98
input_injection     = 0.5
connectivity_radius = 1
```

This selection authorized a task-level test. It did not establish that the regime was trainable or useful for classification.

## Interpretation

The calibration result establishes only that the characterization machinery can distinguish the chosen known regimes and locate bounded recurrent dynamics. It does not show that dynamical richness becomes useful learned computation.

That stronger question was deferred to recursive MNIST.

## Evidence

The reproducible records are in:

```text
packages/vrc-mnist/output/calibration-report.md
packages/vrc-mnist/output/estimator-convergence.csv
packages/vrc-mnist/output/autonomous-vs-driven.csv
packages/vrc-mnist/output/substrate-sweep.csv
packages/vrc-mnist/output/candidate-ranking.md
```

