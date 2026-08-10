# Agent Brief: Recurrent Volumetric Photonic State Machine — MNIST Falsification Experiment

## Objective

Build the smallest serious experiment capable of falsifying the conjecture:

> A fixed programmable nonlinear physical operator, acting recurrently on a fixed-size optical state, can trade additional recurrence time for increased problem-solving capability.

Do **not** build a conventional neural network and describe it as photonic.

The simulated architecture must be constrained to primitives plausibly implementable in programmable nonlinear 3-D photonic matter.

Use **Rust from the beginning**.

---

## Central object

Model a physical volume (C_\Theta) receiving a square optical frame (S_t) and producing another square frame:

[
S_{t+1}=C_\Theta(S_t,Q)
]

where:

* (C_\Theta) is fixed during inference;
* (Q) is the original problem/image and may be continuously re-injected;
* (S_t) is the transient optical state;
* the output frame is recursively fed back into the same volume.

Thus:

[
S_0
\rightarrow C_\Theta
\rightarrow S_1
\rightarrow C_\Theta
\rightarrow S_2
\rightarrow\cdots
\rightarrow S_T.
]

There must be **one physical operator reused (T) times**, not (T) separately parameterized layers.

---

# Research question

Holding constant:

[
\Theta,\qquad \dim(S),\qquad \text{model parameter count},
]

does increasing

[
T
]

increase performance on problems requiring greater reconstruction or inference?

We particularly care whether harder inputs benefit more from additional recurrence than easy inputs.

---

# Non-goals

Do not initially implement:

* Transformers;
* attention;
* token autoregression;
* dense MLP stacks;
* CUDA-specific code;
* full Maxwell/FDTD simulation;
* microscopic quantum simulation;
* realistic fs-laser fabrication;
* LoRA;
* MoE;
* Klein topology;
* language modeling.

Those are downstream questions.

The present experiment tests the **computational primitive**.

---

# Implementation stack

Use:

* Rust;
* Burn for tensors, autodiff, optimization, and initial GPU execution;
* WGPU backend;
* raw `wgpu`/WGSL only where Burn becomes an obstacle;
* MNIST loaded locally and cached;
* CLI-driven experiments;
* reproducible seeded runs;
* CSV/JSON output for every experiment.

Avoid Python in the execution path.

Python notebooks are not part of the project.

---

# Physical abstraction

## Optical state

Represent a complex optical frame as two real channels:

[
S=A+iB.
]

Internally use:

[
[\operatorname{Re}(S),\operatorname{Im}(S)].
]

Do **not** collapse the state to scalar intensity unless performing a modeled detector operation.

Later experiments may add:

* wavelength channels;
* polarization;
* multiple spatial modes.

Not initially.

---

# Simulated volume

Represent the physical object as a sequence of depth slices:

[
C_\Theta=C_D\circ C_{D-1}\circ\cdots\circ C_1.
]

Depth represents propagation through a single permanent 3-D structure.

Each slice may perform only:

1. local spatial mixing;
2. phase/amplitude modification;
3. pointwise nonlinear response;
4. loss/noise;
5. coupling between a small number of optical channels.

No unrestricted dense transformation over the entire frame.

A useful initial local operation is:

[
u_{d+1}(x,y)
============

\sigma_{\theta_d(x,y)}
\left(
\sum_{\Delta x,\Delta y\in N}
K_d(\Delta x,\Delta y)
u_d(x+\Delta x,y+\Delta y)
+
b_d(x,y)
\right).
]

The exact parameterization may change, but preserve locality.

---

# Complex-valued propagation

Implement complex multiplication explicitly:

[
(a+ib)(c+id)
============

(ac-bd)+i(ad+bc).
]

Allow phase manipulation naturally.

Prefer parameterizations that resemble physical optical quantities:

[
A,\quad\phi,\quad \text{coupling},\quad \text{loss},\quad \text{nonlinear threshold}
]

rather than arbitrary neural-network terminology.

---

# Nonlinearity

The experiment requires genuine state-dependent nonlinearity.

Start with one simple differentiable saturating response, for example:

[
f(z)=\frac{z}{1+\alpha |z|^2}
]

or another numerically stable intensity-dependent response.

Keep the nonlinear primitive isolated behind an interface:

`NonlinearResponse`

so later it can be replaced by experimentally measured material-response curves.

Run an ablation with nonlinearity disabled.

That control is mandatory.

---

# Input

Use MNIST (28\times28).

Encode the digit as optical amplitude:

[
Q(x,y)\in[0,1].
]

Initial phase may be zero.

The recurrent state may initially be:

[
S_0=Q
]

or

[
S_0=g(Q,\epsilon)
]

for noisy experiments.

Maintain a persistent question channel if necessary:

[
S_{t+1}=C_\Theta(S_t,Q).
]

Do not allow recurrence to lose access to the original problem merely because of implementation convenience.

---

# Output

Do not use a large digital classifier after the simulated crystal.

Reserve ten detector regions or ten output channels.

Compute optical intensity:

[
I=|\operatorname{Re}(S)|^2+|\operatorname{Im}(S)|^2.
]

Integrate intensity at the ten detector outputs:

[
\ell_0,\ldots,\ell_9.
]

These become class logits.

The crystal should perform essentially all representation computation.

---

# Training

Train (C_\Theta) end-to-end through recurrence.

For training sample ((Q,y)):

1. construct (S_0);
2. apply the same (C_\Theta) repeatedly;
3. obtain detector logits after each recurrence;
4. compute classification loss;
5. backpropagate through the entire recurrent trajectory.

Use variable recurrence counts during training.

Example:

[
T\sim{1,2,4,8}.
]

Do not train only at one fixed (T).

Investigate losses such as:

[
L=
L_T+
\lambda\sum_{t<T}w_tL_t.
]

The final-state loss matters most, but intermediate supervision may stabilize training.

---

# Critical experimental condition

After training, freeze everything:

[
\Theta=\Theta^*.
]

Then evaluate exactly the same machine at:

[
T=1,2,3,4,8,16,32.
]

Nothing may change except recurrence count.

Plot:

[
\operatorname{accuracy}(T).
]

Also record loss, entropy/confidence, state-change magnitude, and energy/norm proxy.

---

# Dataset ladder

Run the following increasingly difficult conditions.

### A. Clean MNIST

Baseline only.

Question:

Can the primitive learn anything?

### B. Gaussian/noise corruption

Train over a range of corruption strengths.

Question:

Does recurrence progressively repair representations?

### C. Occlusion

Mask approximately:

* 10%;
* 25%;
* 40%;
* 55%.

Question:

Does additional recurrence become more useful as information becomes incomplete?

### D. Ambiguous/confusable digits

Concentrate analysis on pairs such as:

* 3/8;
* 4/9;
* 1/7;
* 5/6.

Question:

Does recurrence resolve uncertainty, or merely amplify the initial attractor?

### E. Unseen corruption

Train without one corruption family and test it afterward.

Question:

Is the machine learning general correction dynamics or memorizing corruption patterns?

---

# Primary hypothesis

For sufficiently difficult but solvable inputs:

[
\frac{\partial\operatorname{Performance}}
{\partial T}>0.
]

More importantly, the recurrence advantage should increase with task difficulty:

[
\Delta(T)_{\text{hard}}

>

\Delta(T)_{\text{easy}}.
]

---

# Strong falsification

The architectural conjecture is weakened substantially if:

1. performance stops improving after one or two passes;
2. additional recurrence consistently degrades performance;
3. recurrence only helps corruptions seen during training;
4. equivalent performance requires increasing state dimension;
5. a matched feed-forward system consistently dominates at equal parameter and operation budgets;
6. removing the nonlinear primitive has negligible effect;
7. later passes merely increase classifier confidence without correcting wrong predictions.

Do not reinterpret these outcomes as success.

Report them.

---

# Mandatory baselines

Implement at least:

### Baseline 1 — One pass

[
S_1=C_\Theta(S_0).
]

Same operator, no recurrence.

### Baseline 2 — Linear recurrent crystal

Disable nonlinear response:

[
S_{t+1}=H_\Theta S_t.
]

Tests whether recurrence alone is sufficient.

### Baseline 3 — Feed-forward matched-budget model

Construct a simple locally connected/feed-forward model with approximately comparable parameter count and computational budget.

The purpose is not to beat SOTA MNIST.

The question is whether recurrence provides a distinctive scaling behavior.

---

# Measurements

Every experimental run must record:

* training seed;
* parameter count;
* state dimensionality;
* depth (D);
* recurrence count (T);
* corruption type/severity;
* accuracy;
* cross-entropy;
* per-class accuracy;
* prediction changes by recurrence;
* wrong→right transitions;
* right→wrong transitions;
* state difference

[
|S_{t+1}-S_t|;
]

* optical-state norm/intensity proxy;
* wall-clock training time;
* inference time per recurrence.

Especially report:

[
P(\text{wrong at }t\rightarrow\text{correct at }t+1)
]

versus

[
P(\text{correct at }t\rightarrow\text{wrong at }t+1).
]

That tells us whether recurrence actually performs error elimination.

---

# Visualization

Produce frame sequences for representative examples:

[
S_0,S_1,S_2,S_4,S_8,S_{16}.
]

For complex state, visualize separately:

* amplitude;
* phase;
* detector intensities.

Include cases where:

* recurrence succeeds;
* recurrence fails;
* prediction flips repeatedly;
* convergence occurs;
* the system enters an apparent limit cycle.

Do not show only favorable examples.

---

# Architecture discipline

The agent must resist introducing conventional ML machinery merely because it improves MNIST accuracy.

Every proposed operation must answer:

> What plausible physical primitive does this correspond to?

Maintain a file:

`docs/physical_mapping.md`

with a table:

| Software primitive        | Physical interpretation                | Confidence |
| ------------------------- | -------------------------------------- | ---------- |
| local convolution/stencil | local optical coupling/diffraction     | high       |
| complex multiplication    | phase/amplitude interaction            | high       |
| saturation                | nonlinear material response            | medium     |
| recurrence                | optical recirculation/cavity           | high       |
| persistent Q injection    | continuing illumination/input coupling | medium     |

Any primitive without a plausible mapping must be flagged.

---

# Code structure

Prefer something approximately like:

```text
src/
  main.rs
  data/
    mnist.rs
    corruption.rs
  physics/
    complex_field.rs
    coupling.rs
    nonlinearity.rs
    noise.rs
    volume.rs
  model/
    recurrent_machine.rs
    detector.rs
  train/
    trainer.rs
    losses.rs
  experiment/
    config.rs
    runner.rs
    metrics.rs
  output/
    frames.rs
    results.rs

configs/
  clean.toml
  noise.toml
  occlusion.toml
  ablation_linear.toml

docs/
  conjecture.md
  physical_mapping.md
  results.md
```

Keep research logic separated from GPU/backend implementation.

---

# Reproducibility

Every experiment must be runnable from the command line from a committed configuration file.

Conceptually:

```bash
cargo run --release -- train configs/occlusion.toml
cargo run --release -- eval <checkpoint> --recurrences 1,2,4,8,16,32
```

The precise CLI may differ.

No important experiment may depend on manually editing source code.

---

# Milestone 0 — Infrastructure

Deliver:

* Rust project;
* GPU detection;
* MNIST loader;
* deterministic experiment configuration;
* simple tensor tests;
* saved results.

No architecture sophistication yet.

---

# Milestone 1 — One-pass physical operator

Implement:

[
S_1=C_\Theta(S_0).
]

Demonstrate learning above trivial MNIST baseline.

This proves only that the implementation works.

Do not interpret it as validating the conjecture.

---

# Milestone 2 — Recurrence

Implement:

[
S_{t+1}=C_\Theta(S_t,Q)
]

with strict parameter sharing.

Train across variable (T).

Produce accuracy-vs-(T) curves.

This is the first scientifically meaningful milestone.

---

# Milestone 3 — Corruption ladder

Test increasing noise and occlusion.

Look specifically for:

[
\text{harder input}
\Rightarrow
\text{greater benefit from additional }T.
]

---

# Milestone 4 — Falsification report

Write:

`docs/results.md`

with exactly three top-level conclusions:

1. **What survived**
2. **What failed**
3. **What experiment should come next**

Do not optimize the narrative toward success.

---

# Go/no-go criterion

Advance to compositional tasks only if there is convincing evidence that:

[
\boxed{
\text{same operator}
+
\text{same state size}
+
\text{more recurrence}
\Rightarrow
\text{systematically greater effective computation}
}
]

on held-out harder inputs.

If recurrence merely acts as repeated denoising with no scaling behavior, record that distinction explicitly.

---

# Next experiment if successful

Move from classification to compositional MNIST:

[
3+4\rightarrow7,
]

then:

[
3+4+2\rightarrow9,
]

then expressions requiring increasing sequential composition.

Keep:

[
\Theta,\quad\dim(S)
]

fixed.

Vary only allowed reasoning time (T).

The decisive question becomes:

[
\boxed{
\text{Can additional recurrence substitute for additional architectural depth?}
}
]

Only after this survives should we invest seriously in modeling actual 3-D fs-written photonic matter.

---

# Governing principle

This is not an exercise in obtaining high MNIST accuracy.

It is an attempt to kill or preserve one conjecture:

> **A fixed nonlinear physical law with a fixed-size transient state can acquire additional effective reasoning depth simply by being allowed to evolve for longer.**

Build the simplest machine capable of giving us a credible answer.
