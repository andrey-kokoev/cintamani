# Driven LiTaO3 Kerr Category and Observable-Capacity Bound

## Status

This entry extends the thin-film LiTaO3 perimeter from affine optics to pumped Kerr and four-wave-mixing dynamics.

It identifies a rigorous capacity bound for fixed observations and rejects formal polynomial degree as a useful measure of Kerr computational depth. It does not yet formulate Conjecture 5.

The central result is:

> At fixed observable dimension and linear readout, Kerr recurrence can redistribute information-processing capacity among memory and nonlinear functions, but it cannot increase the total accessible capacity beyond the observable dimension.

This result applies to a reservoir-computing semantics under specific assumptions. It is not a universal bound on every form of computation.

## Empirical anchor

Thin-film LiTaO3 microresonators have experimentally generated dissipative Kerr-soliton frequency combs. The reported devices combined strong optical confinement, high quality factor, anomalous dispersion, and Kerr nonlinearity. Single-soliton generation used 90 mW of on-chip pump power and produced repetition rates of 81 GHz and 30.1 GHz.

The same experiment also showed that the nonlinear regime depends strongly on device orientation because of polarization-dependent Raman competition. Solitons were obtained in all ten tested devices at one orientation and none of the ten at the orthogonal orientation.

These results establish that integrated LiTaO3 supports a driven nonlinear multimode process. They also show why "LiTaO3 Kerr nonlinearity" is not a complete process specification: pump, dispersion, detuning, polarization, Raman channels, loss, and geometry jointly determine the realized morphism.

## Physical state and dynamics

Let \(M\) be a finite declared set of resonator modes, indexed by \(\mu\). The classical coherent state is

\[
a=(a_\mu)_{\mu\in M}\in\mathbb C^{|M|}.
\]

A standard coupled-mode description has the schematic form

\[
\frac{d a_\mu}{dt}
=
\left(-\frac{\kappa_\mu}{2}+i\Delta_\mu\right)a_\mu
+i g
\sum_{\mu_1+\mu_2-\mu_3=\mu}
a_{\mu_1}a_{\mu_2}a_{\mu_3}^{*}
+\sqrt{\kappa_{\mathrm{ex},\mu}}\,s_{\mathrm{in},\mu}(t)
+\xi_\mu(t).
\]

The terms represent:

- optical loss \(\kappa_\mu\);
- detuning and dispersion \(\Delta_\mu\);
- Kerr four-wave mixing with strength \(g\);
- externally supplied pump or data fields \(s_{\mathrm{in}}\);
- noise and unresolved channels \(\xi\).

The mode-selection rule

\[
\mu_1+\mu_2=\mu_3+\mu
\]

is the frequency-lattice form of the four-wave-mixing relation. Thermal and Raman degrees of freedom must be added as state variables when their time scales affect the experiment; otherwise they belong to the declared disturbance model.

The corresponding mean-field description is the driven, detuned, damped nonlinear Schrödinger equation usually called the Lugiato-Lefever equation.

## The open Kerr process category

Let \(\mathsf{LT}_{\mathrm{Kerr}}\) denote the physical process theory for the declared LiTaO3 mode set, device geometry, pump configuration, and environmental model.

A process over an interval \(\tau\) is not honestly represented as a free endomorphism \(X\to X\). It has the form

\[
K_\tau:
X_M\otimes U_\tau\otimes P_\tau\otimes B_\tau
\longrightarrow
X_M\otimes Y_\tau\otimes W_\tau,
\]

where:

- \(X_M\) is the intracavity mode state;
- \(U_\tau\) is the data-input stream over the interval;
- \(P_\tau\) is the supplied optical pump;
- \(B_\tau\) contains bath, thermal, and noise inputs;
- \(Y_\tau\) is the accessible optical output;
- \(W_\tau\) contains dissipated energy and other waste.

Sequential composition wires the retained cavity state into the next interval while tensoring in fresh pump and bath resources. Parallel composition juxtaposes independently available devices or mode groups.

Only after fixing the pump and environmental state may one abbreviate the retained-state evolution by a time map

\[
\Phi_\tau:X_M\to X_M.
\]

For a time-independent Markov model, these maps form a semigroup:

\[
\Phi_{\tau+\sigma}
=
\Phi_\tau\circ\Phi_\sigma.
\]

This identity expresses temporal composition. It does not establish computational depth.

## Why algebraic degree fails here

The affine LiTaO3 obstruction used algebraic degree because affine composition never raises it. That invariant does not extend directly to Kerr flow.

Even the idealized single-mode self-phase-modulation equation

\[
\dot a=i\gamma |a|^2a
\]

has solution

\[
a(t)=a(0)\exp\!\left(i\gamma |a(0)|^2t\right).
\]

For every nonzero \(t\), the exponential generically has an infinite Taylor expansion in the input intensity. The exact response therefore acquires unbounded formal polynomial order immediately, even when \(\gamma t\) is so small that every high-order term lies far below the experimental noise floor.

Formal degree would consequently declare almost instantaneous infinite depth. It confuses analytic expressivity with usable computation and is rejected as the primary Kerr invariant.

A thresholded Volterra or perturbative order may still be diagnostic, but it depends on input scaling, basis, noise floor, and tolerance. It must be paired with an observable-capacity measure.

## Observation semantics

Let the driven system receive an input history

\[
u^{(-h)}=(u_t,u_{t-1},\ldots,u_{t-h}).
\]

Choose a probability law \(p\) over input histories and let

\[
\mathcal H=L^2(p)
\]

be the Hilbert space of square-integrable target functions of that history.

Suppose the physical interface exposes \(N\) real observation functions

\[
x_1(t),\ldots,x_N(t).
\]

These may be mode quadratures, intensities, or other predeclared measurements. Their dependence on input history defines elements of \(\mathcal H\). The linearly readable function space at time \(t\) is

\[
V_t
=
\operatorname{span}{x_1(t),\ldots,x_N(t)}
\subseteq\mathcal H.
\]

Therefore

\[
\dim V_t\leq N.
\]

Kerr dynamics can rotate and deform this subspace inside the semantic function space. It can move accessible capacity from linear delayed-input functions to nonlinear products of delayed inputs. It cannot increase the dimension of the linearly readable subspace without increasing the independent observation interface.

## Information-processing capacity

For a centered target function \(z\in\mathcal H\), define its normalized linear-readout capacity schematically as

\[
C[X,z]
=
1-
\frac{
\min_w\mathbb E[(z-w^Tx)^2]
}{
\mathbb E[z^2]
}.
\]

Equivalently, this is the squared norm of the projection of the normalized target onto \(V_t\).

For an orthonormal target family \(\{z_j\}\subset\mathcal H\), Bessel's inequality gives

\[
\sum_j C[X,z_j]
\leq
\dim V_t
\leq
N.
\]

Dambre, Verstraeten, Schrauwen, and Massar established this information-processing-capacity bound for dynamical systems under finite-moment assumptions. Under their fading-memory and independence conditions, a complete capacity sum reaches the available state or observation dimension.

The categorical interpretation is direct:

\[
\mathsf{LT}_{\mathrm{Kerr}}
\xrightarrow{\ \mathcal O_t\ }
\mathsf{SubHilb}(\mathcal H),
\]

where the observation semantics sends the physical process to its linearly accessible subspace \(V_t\). The dimension of the observation object is the capacity budget. Physical recurrence changes the embedded subspace but not its maximum dimension.

## Proposition LT-KERR-1: fixed-observation capacity bound

Fix:

- the real observation count \(N\);
- the input distribution and history space;
- a linear readout;
- a finite-variance capacity basis;
- the physical pump, mode, and disturbance model for each evaluated condition.

Then, for every dwell time, recurrence count, Kerr strength, pump power, and detuning for which the capacity assumptions hold,

\[
C_{\mathrm{total}}(t)
\leq N.
\]

Increasing recurrence cannot increase the total linearly accessible information-processing capacity above this fixed interface bound. It can only redistribute capacity among target functions or leave some capacity inaccessible because of noise, degeneracy, instability, or insufficient excitation.

This is an application of an existing theorem, not a new empirical conjecture.

## Proposition LT-KERR-2: temporal-readout accounting

If observations from \(T\) distinct times are retained as separate features,

\[
\big(x(t_1),x(t_2),\ldots,x(t_T)\big),
\]

the accessible observation object has dimension at most \(NT\), before correlations reduce its effective rank.

Any capacity gained by retaining those samples is partly attributable to an enlarged readout and memory interface. It is not evidence that a fixed \(N\)-dimensional snapshot acquired additional total capacity merely through recurrence.

The same rule applies to time-multiplexed virtual nodes, additional comb-line detectors, delayed electronic features, and recurrence-specific outputs. They are legitimate resources, but they must be counted.

## Capacity distribution rather than capacity growth

Choose an orthonormal basis of input-history functions grouped by polynomial degree and delay, for example products of Legendre polynomials for independent bounded inputs.

Define:

\[
C_{d,\ell}(t)
=
\sum_{z_j\in\mathcal B_{d,\ell}}
C[X_t,z_j],
\]

where \(d\) is nonlinear degree and \(\ell\) is a delay class.

Useful summaries include:

\[
C_{\mathrm{linear}}
=
\sum_\ell C_{1,\ell},
\qquad
C_{\mathrm{nonlinear}}
=
\sum_{d\geq2,\ell}C_{d,\ell},
\]

subject to

\[
C_{\mathrm{linear}}
+C_{\mathrm{nonlinear}}
\leq N.
\]

The research question is therefore not whether Kerr recurrence creates unlimited capacity. It is whether the material supplies a stable, resource-efficient redistribution into the particular nonlinear delayed functions required by a predeclared task while retaining enough input memory to compose them.

## Input-conditioned nonlinear order

Comb generation driven almost entirely by the pump must not be mistaken for processing of the data input.

For the perturbative or Volterra expansion of an observed output, retain only terms causally dependent on the data-input ports. Define an empirical significant-order profile

\[
S_k(t)
=
\text{capacity or response energy in input-conditioned terms of order }k
\]

after bias correction and noise thresholding.

This profile is not itself a categorical invariant. It is a diagnostic decomposition of \(V_t\). Its purpose is to distinguish:

- pump-only comb structure;
- linear memory of the input;
- nonlinear mixing of current and delayed inputs;
- apparent order introduced by the detector or decoder.

The capacity bound prevents the sum of independently readable input-conditioned functions from being inflated merely by listing many perturbative terms.

## Memory-nonlinearity tension

The driven Kerr resonator needs both:

1. survival of distinctions among relevant input histories;
2. nonlinear mixing of those histories into task-relevant functions.

Weak Kerr action preserves memory but remains close to the affine category. Strong action can produce richer mixing, multistability, breathing, solitons, or chaos, while loss and attraction may erase input dependence.

This tension has already been observed in reservoir-computing studies of nonlinear microrings. A 2022 study used time-multiplexed observations and offline ridge regression, found limited linear memory together with nonlinear-task capability, and explicitly required comparison against applying the same training process directly to the input signal.

That precedent supports the measurement protocol, not a claim that silicon results transfer quantitatively to LiTaO3.

## What the bound does not establish

The observable-capacity bound does not show that:

- all computation is reservoir computation;
- a fixed-dimensional sequential machine cannot run for many steps;
- every high-degree target has high sequential complexity;
- Kerr dynamics is computationally useless;
- a task-specific capacity cannot improve with dwell time;
- adding physically generated and independently observed comb modes is illegitimate;
- nonlinear or adaptive decoders have no value.

It shows that every additional observation feature or decoder basis function is a resource, and that fixed-state recurrence cannot be credited with an increase that actually comes from enlarging that interface.

A no-fast-forward task argument remains necessary before capacity redistribution can be called computational depth.

## Severe characterization experiment

### Model

Implement both coupled-mode and Lugiato-Lefever forms, cross-checking them in a shared parameter regime. Begin with normalized parameters, then map viable regimes to measured LiTaO3 loss, dispersion, pump, and bandwidth.

The modeled state must include or explicitly exclude:

- a fixed frequency-mode window;
- bus-to-ring coupling and output loss;
- continuous-wave pump consumption;
- data modulation of a declared input port;
- Raman response;
- thermal detuning;
- technical and shot-noise models;
- detector bandwidth and noise.

### Input and observations

Use seeded independent input streams with a declared distribution. Fix one observation interface per comparison, such as:

- selected mode intensities;
- selected mode quadratures;
- a fixed joint coherent readout.

Do not add virtual nodes or time samples without increasing \(N\) in the resource ledger.

### Capacity basis

Estimate held-out capacities for orthogonal input-history functions grouped by:

- degree;
- maximum delay;
- mixed-delay interaction order;
- current-input versus historical-input dependence.

Apply finite-sample significance correction. Verify numerically that the corrected total does not exceed the effective observation rank.

### Sweeps

Sweep:

- normalized pump power;
- pump-cavity detuning;
- Kerr strength;
- dwell or recurrence interval;
- coupling and loss;
- dispersion and mode count;
- Raman strength and orientation proxy;
- thermal time constant;
- input amplitude and modulation rate;
- observation noise.

### Controls

Required controls are:

- the same system with Kerr coefficient set to zero;
- direct linear and square-law features of the input;
- the same number of feed-forward Kerr interactions;
- a time-shuffled recurrence control;
- added virtual nodes reported separately as added observations;
- a matched digital simulation using the same observable dimension;
- pump-only dynamics with the data input removed.

### Measurements

Record:

- total corrected capacity;
- capacity by degree and delay;
- effective observation rank;
- input-survival and perturbation-survival curves;
- pump-only versus input-conditioned response;
- energy per symbol and per cavity lifetime;
- output SNR and detector bandwidth;
- mode leakage outside the declared object;
- thermal and Raman sensitivity;
- recurrence versus matched-cascade performance.

## Gate for Conjecture 5

Conjecture 5 may be formulated only if characterization finds a connected, perturbation-tolerant LiTaO3 regime in which:

- task-relevant nonlinear delayed capacity increases with recurrence;
- input memory remains above a predeclared floor;
- the observation count remains fixed;
- the effect survives held-out input distributions and noise;
- Kerr-disabled and input-feature controls lack the same capacity;
- a matched cascade does not explain the result more simply;
- all pump, mode, stabilization, and readout resources are charged.

The conjecture must then state numerical capacity shifts, resource bounds, a recurrence horizon, and a forbidden outcome. It must not claim growth of total capacity at fixed \(N\).

## Decision

The driven Kerr category passes the first perimeter test as a legitimate nonlinear extension: unlike pure harmonic doubling, it can act repeatedly within a fixed frequency-mode object.

However, two seductive metrics are rejected:

- formal polynomial degree, because it becomes infinite immediately;
- raw comb-line count, because modes contribute capacity only when they provide independent, input-conditioned, observed functions.

The accepted invariant is the fixed-observation information-processing-capacity budget. Kerr recurrence may redistribute this budget but cannot enlarge it without an explicit increase in observable resources.

The next implementation task is a normalized coupled-mode/Lugiato-Lefever simulator with a bias-corrected capacity estimator. No MNIST or end-to-end classification should be attempted before this capacity surface is mapped.

## Primary evidence

- Chengli Wang et al., [Lithium tantalate photonic integrated circuits for volume manufacturing](https://doi.org/10.1038/s41586-024-07369-1), *Nature* 629, 784-790 (2024). This supports the integrated LiTaO3 Kerr-soliton platform and the stated pump, repetition-rate, geometry, Raman, loss, and dispersion observations.
- Luigi A. Lugiato and René Lefever, [Spatial dissipative structures in passive optical systems](https://doi.org/10.1103/PhysRevLett.58.2209), *Physical Review Letters* 58, 2209-2211 (1987). This is the original driven-dissipative nonlinear optical model underlying the Lugiato-Lefever framework.
- Tobias Hansson, Daniele Modotto, and Stefan Wabnitz, [On the numerical simulation of Kerr frequency combs using coupled mode equations](https://doi.org/10.1016/j.optcom.2013.09.017), *Optics Communications* 312, 134-136 (2014). This supports the coupled-mode and Lugiato-Lefever modeling connection for Kerr combs.
- Joni Dambre, David Verstraeten, Benjamin Schrauwen, and Serge Massar, [Information Processing Capacity of Dynamical Systems](https://doi.org/10.1038/srep00514), *Scientific Reports* 2, 514 (2012). This supplies the fixed-observation capacity theorem and the polynomial input-history basis method.
- Davide Bazzanella et al., [A Microring as a Reservoir Computing Node: Memory/Nonlinear Tasks and Effect of Input Non-Ideality](https://doi.org/10.1109/JLT.2022.3183694), *Journal of Lightwave Technology* 40, 5917-5926 (2022). This supports the microring memory/nonlinearity characterization precedent, time-multiplexed readout accounting, and input-only baseline requirement.

The categorical interpretation, its application to the LiTaO3 perimeter, and the experiment gate are deductions made here. The cited papers do not assert Conjecture 5.
