# Recursive MNIST — First Task-Level VRC Test

## Objective

Test the central VRC conjecture under fixed architecture and fixed state size:

\[
F_\Theta,\ \dim(S)\ \text{fixed},
\qquad
T\uparrow
\Rightarrow
\text{more useful computation}.
\]

The success criteria were fixed before observing results. High clean-MNIST accuracy, confidence amplification, or merely nontrivial state motion did not count as evidence of increased computational depth.

## Frozen substrate

The primary experiment used the viable regime selected by entropy calibration without retuning:

```text
gamma               = 0.03
coupling_scale      = 2.0
nonlinear_strength  = 0.5
transmission        = 0.98
input_injection     = 0.5
connectivity_radius = 1
```

The implemented task model had:

```text
shared learned parameters = 36
state dimensionality      = 1568
```

The same learned parameters, topology, and state size were used at every recurrence. There were no recurrence-indexed parameters in the primary model.

## Protocol

Three independent seeds were trained with variable recurrence:

\[
T_{\mathrm{train}}\in\{1,2,4,8\}.
\]

They were evaluated at

\[
T_{\mathrm{eval}}\in\{1,2,4,8,16,32\}.
\]

Training used a Gaussian-noise and random-occlusion mixture. Structured masks were held out from training.

Evaluation covered thirteen conditions:

- clean MNIST;
- four Gaussian-noise levels;
- four random-occlusion levels: approximately 10%, 25%, 40%, and 55%;
- vertical strip;
- horizontal strip;
- central block;
- random patches.

Confusable pairs 3/8, 4/9, 1/7, and 5/6 were recorded separately. All adjacent prediction transitions from step 1 through step 32 were retained, not only the six headline recurrence counts.

## Mandatory controls

The experiment included, across all three seeds:

1. the primary model at one pass;
2. a linear recurrent ablation with zero nonlinear strength;
3. an unshared recurrent-depth model with independent parameters at each step;
4. a conventional local feed-forward model with an approximately matched operation budget.

## Primary result

The fixed-criteria decision is:

\[
\boxed{\text{REJECT}}
\]

Measured recurrence gains were:

```text
mean clean accuracy gain, T1 -> T32            = +0.0013
mean hard recoverable-input gain, T1 -> T32   = -0.0037
mean gain beyond training horizon, T8 -> T32  = +0.00028
```

Hard inputs benefited less than easy inputs, contradicting the primary prediction.

## Correction versus confidence

Across all evaluated adjacent transitions:

```text
wrong -> correct transitions = 276
correct -> wrong transitions = 405
net corrections              = -129
confidence amplifications    = 1122893
```

Correct-to-wrong transitions exceeded wrong-to-correct transitions by 129. The overwhelmingly dominant effect of recurrence was confidence amplification rather than computational correction.

Classification loss generally increased sharply with recurrence even while the physical state continued to evolve.

## Baseline comparison

Mean control results included:

```text
linear recurrent accuracy at T32   = 0.0917
feed-forward local accuracy at T8  = 0.1983
unshared recurrent accuracy at T8  = 0.0700
```

The nonlinear shared operator did not establish a useful recurrence advantage over the controls. The feed-forward local control substantially outperformed it, although none of these small models was optimized for MNIST accuracy.

## Relationship to entropy characterization

The selected substrate had passed pre-task tests for bounded, persistent, high-rank recurrent dynamics. Recursive MNIST showed that these properties were not sufficient for useful learned computation.

In `state-dynamics.csv`:

- task-state change and state norm are measured from the trained MNIST trajectories;
- effective-rank and perturbation-survival columns come from matrix-free probes of the frozen pre-task substrate model.

The latter are contextual substrate measurements, not direct effective-rank estimates of the trained MNIST state ensemble. This distinction must be preserved in later interpretation.

No trivial short cycle was detected by the frozen-substrate probe at the accepted cycle tolerance. The failure was therefore not simply an identified period-2 or period-4 collapse. It was a failure to turn persistent dynamics into corrective task computation.

## Representative trajectories

State sequences were exported at

\[
S_0,S_1,S_2,S_4,S_8,S_{16},S_{32}.
\]

The selection machinery records successful correction, recurrence destruction, permanent error, oscillation, apparent convergence, easy correctness, and short-cycle/non-convergent categories when such examples exist. Null selections are retained when no qualifying example occurs; they are not replaced by cherry-picked substitutes.

## Falsification status

The tested fixed regime weakens the central conjecture because:

- recurrence gave negligible clean improvement;
- hard-input recurrence gain was negative;
- improvement beyond the training horizon was negligible;
- correct-to-wrong transitions outweighed wrong-to-correct transitions;
- confidence amplification dominated true correction;
- nonlinear recurrence did not show the required advantage;
- fixed-state recurrent evolution remained active but was not task-useful.

The result falsifies this selected substrate-and-training regime. It does not prove that every possible VRC substrate or learning rule must fail.

## Implementation and repository record

This experiment was implemented as a pnpm monorepo rooted at `cintamani`, with the Rust project in:

```text
packages/vrc-mnist
```

The workspace is defined by the root `package.json`, `pnpm-workspace.yaml`, and lockfile. The package uses Rust, Burn 0.21, and WGPU with cached local MNIST data.

The task implementation contains:

- an explicit real/imaginary complex field with fixed shape `2 x 28 x 28`;
- local 3x3 volumetric coupling, phase/amplitude mixing, transmission loss, and an isolated saturating nonlinearity;
- persistent question-input injection at every recurrence;
- one learned `Volume` reused at every recurrent step, with no recurrence-indexed parameters;
- ten fixed square-law detector regions and no learned dense digital classifier;
- seeded variable-T training, checkpoint/resume support, frozen recurrence sweeps, and per-run CSV, JSON, SVG, and trajectory artifacts;
- matrix-free entropy calibration and recurrent-dynamics analysis using Jacobian-vector and vector-Jacobian products rather than a materialized transmission matrix.

## Completion audit

The final evidence set contains:

```text
39 primary condition runs
234 recurrence rows
12 baseline rows
3 independent seeds
13 evaluation conditions per seed
```

All primary runs were valid, all required controls were available, and `controls_complete` was true. The final verification gates passed:

```text
cargo fmt --all -- --check
cargo test --all-targets       (9 tests passed)
pnpm check
pnpm test
```

The durable human-readable conclusions are in `docs/results.md`, which retains exactly the three required top-level headings. The requirement-by-requirement record is in `docs/completion_audit.md`, and the machine-readable decision is in `output/recursive-mnist-summary.json`.

## Decision

Do not advance this regime to compositional arithmetic.

The next work, if pursued, should investigate why entropy-qualified dynamics failed to become trainable corrective computation. It should not silently retune the primary experiment or redefine its success criteria after the fact.

## Evidence

The complete records are in:

```text
packages/vrc-mnist/output/recursive-mnist-summary.json
packages/vrc-mnist/output/recurrence-accuracy.csv
packages/vrc-mnist/output/transition-analysis.csv
packages/vrc-mnist/output/corruption-results.csv
packages/vrc-mnist/output/state-dynamics.csv
packages/vrc-mnist/output/baseline-comparison.csv
packages/vrc-mnist/output/recursive-mnist-report.md
```

Eight SVG plots and the representative trajectory frames are stored alongside the experiment outputs and per-run artifacts.
