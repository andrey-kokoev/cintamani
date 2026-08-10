# Thin-Film LiTaO3 Perimeter and Linear-Degree Obstruction

## Status

This is the first material-specific perimeter study under the categorical siege strategy. It defines a deliberately narrow thin-film lithium-tantalate process theory and derives a conditional obstruction inside that theory.

It does not formulate Conjecture 5. The obstruction is a mathematical consequence of the declared model. The empirical questions are whether a fabricated device stays inside that model and which additional physical resource can escape it compositionally.

## Why begin with thin-film LiTaO3

Thin-film lithium tantalate on insulator, abbreviated LTOI or TFLT, is a useful first platform because one material supports several physically distinct process classes:

- low-loss passive waveguides, couplers, and resonators;
- a strong Pockels response for externally driven phase modulation and switching;
- intrinsic second-order optical interactions;
- Kerr and other driven nonlinear resonator dynamics;
- established wafer-scale fabrication routes.

The material therefore permits a controlled comparison between linear recurrence and several candidate escape resources without changing the entire fabrication platform.

A 2024 wafer-scale demonstration reported 5.6 dB/m propagation loss, a Mach-Zehnder voltage-length product of 1.9 V cm at 1,550 nm, electro-optic bandwidth above 40 GHz, much lower birefringence than LiNbO3, and dissipative Kerr-soliton microcombs. The same work reported an electro-optic coefficient \(r_{33}=30.5\) pm/V and emphasized the material's higher optical-damage threshold relative to LiNbO3.

Separate experiments have demonstrated second-harmonic generation in TFLT, including periodically poled waveguides. These observations establish the availability of the relevant primitives. They do not establish that the primitives form a useful recurrent computer.

## Platform boundary

The first boundary is a room-temperature classical coherent integrated-photonic device built from thin-film LiTaO3 waveguides and resonators.

The computational state consists of a finite set of complex optical-mode amplitudes:

\[
x\in\mathbb C^n.
\]

Frequency, polarization, spatial mode, and propagation direction are part of the mode labels. They may not be added or discarded silently during a resource comparison.

The following strata are kept distinct.

### LT-0: passive affine optics

Included primitives are:

- propagation and phase accumulation;
- fixed couplers and interference;
- delay and resonant storage;
- fixed scattering between declared modes;
- linear loss;
- fixed coherent injection;
- terminal coherent readout or square-law intensity detection.

### LT-1: externally driven affine optics

LT-1 adds the Pockels effect under a prescribed electrical drive. For a fixed or open-loop drive, the optical state still undergoes a linear or affine transformation. The RF source, electrodes, synchronization, drive energy, and waveform storage are explicit resources.

If the electrical drive depends on the evolving optical state or computational input, the controller becomes part of the computation and the process is not classified as LT-1.

### LT-2: intrinsic nonlinear optical processes

LT-2 adds processes in which computational optical fields interact nonlinearly, including:

- second-harmonic, sum-frequency, and difference-frequency generation through \(\chi^{(2)}\);
- Kerr and four-wave-mixing dynamics through \(\chi^{(3)}\);
- pump depletion and nonlinear phase shifts;
- Raman, thermal, and photorefractive effects when they are intentionally used rather than treated as error.

A nominally nonlinear material interaction can still reduce to an effective LT-1 morphism when a strong pump is treated as prescribed and undepleted. Material nonlinearity alone is therefore not evidence of computational nonlinearity.

### LT-3: measurement and feedback

LT-3 adds detection, electronic processing, state-dependent modulation, gain, reset, and reinjection. These may be powerful, but the detector, electronics, memory, latency, ADC/DAC stages, and energy must be counted. Computation may not be attributed solely to LiTaO3 when the decisive transformation occurs in the feedback controller.

The first obstruction applies only to LT-0 and LT-1.

## The affine physical process category

Let \(\mathsf{LT}_{\mathrm{aff}}\) denote the LT-0/LT-1 process category under a fixed drive configuration.

Its objects are finite frequency-labelled complex mode spaces. A morphism from \(\mathbb C^n\) to \(\mathbb C^m\) is an affine optical transformation

\[
f(x)=Ax+b,
\]

where \(A\in\mathbb C^{m\times n}\) describes propagation, coupling, phase, modulation, and loss, while \(b\) describes a fixed coherent injection.

Composition is

\[
(A_2,b_2)\circ(A_1,b_1)
=
(A_2A_1,A_2b_1+b_2).
\]

The monoidal product is parallel juxtaposition of mode spaces and block composition of their transformations. Passive loss constrains the appropriate norm or singular values of \(A\); prescribed active drives and injected carriers are recorded as resources rather than hidden in the categorical notation.

For a recurrent morphism

\[
s_{k+1}=As_k+Bq,
\qquad
s_0=Ex,
\]

with fixed persistent question input \(q\), the state after \(t\) recurrences is

\[
s_t
=
A^tEx
+
\sum_{j=0}^{t-1}A^jBq.
\]

Recurrence changes the coefficients and mixing range, but \(s_t\) remains affine in \((x,q)\) for every \(t\).

This closure under composition is the relevant categorical fact.

## Algebraic degree as the first invariant

Use linear amplitude encoding over an open subset of \(\mathbb R^n\) or \(\mathbb C^n\). Let the terminal coherent readout be

\[
y_t=Cs_t+d.
\]

Then \(y_t\) is affine in the encoded input for every recurrence count.

If the terminal detector measures intensity,

\[
I_i(t)=\left|y_{t,i}\right|^2,
\]

each detector output is a real polynomial of total degree at most two in the real and imaginary input coordinates. Differences between detector intensities, and hence their decision boundaries, also have degree at most two.

Therefore

\[
\deg(I_i(t))\leq 2
\qquad
\text{for every }t.
\]

The recurrence count changes the quadratic form but not its algebraic degree.

This invariant is stronger and more directly task-relevant than state entropy or effective rank for this restricted process theory.

## Proposition LT-AFF-1: linear-degree obstruction

Consider the logical process theory of bounded-fan-in arithmetic circuits over a field of characteristic zero, with addition, scalar multiplication, and binary multiplication as generators.

If a circuit has multiplication depth \(d\), the polynomial at its output has degree at most

\[
2^d.
\]

This follows inductively: inputs have degree one, addition does not increase the maximum degree, and a binary multiplication adds the degrees of its two inputs. A multiplication layer can therefore at most double the maximum degree.

Now choose the logical endomorphism

\[
g(z)=z^2.
\]

Its \(t\)-fold composition is

\[
g^t(z)=z^{2^t}.
\]

Any bounded-fan-in arithmetic implementation of this polynomial requires multiplication depth at least \(t\), because an implementation of multiplication depth less than \(t\) has degree less than \(2^t\). This is a model-relative no-fast-forward witness.

An LT-0/LT-1 recurrent system with linear amplitude encoding and terminal square-law detection has output degree at most two for all \(t\). It therefore cannot realize the family \(g^t\) on an open input domain for \(t\geq2\), provided that its encoding and decoding degree remain bounded independently of \(t\).

Categorically, no semantics-preserving bounded-interface realization of this logical subcategory exists inside \(\mathsf{LT}_{\mathrm{aff}}\) beyond the fixed degree ceiling.

## Assumptions and escape clauses

The obstruction is intentionally narrow. It depends on:

- linear amplitude encoding over a continuous open domain;
- a fixed affine optical transformation per recurrence;
- no state-dependent electrical or optical control;
- no intermediate measurement and reinjection;
- a fixed bounded-degree terminal decoder;
- no recurrence-dependent precomputation in the encoder;
- a fixed declared set of optical modes;
- exact realization rather than approximation on a finite sample set.

It does not rule out:

- deep linear computations whose difficulty is not algebraic degree;
- nonlinear input encodings, if their cost is included;
- approximation on a finite dataset;
- intrinsic \(\chi^{(2)}\) or \(\chi^{(3)}\) interactions;
- measurement-based feedback;
- expanding mode sets or other growing physical resources;
- quantum encodings and observations outside the declared classical category.

If any escape clause is used, it must be promoted to an explicit resource and assigned to a larger physical process category. It may not be treated as a minor implementation detail.

## What LiTaO3 contributes beyond the obstruction

LiTaO3 is interesting precisely because it provides candidate escape morphisms on the same broad platform.

### Pockels modulation

With a prescribed electrical field, Pockels modulation changes the coefficients of the optical linear transformation. It improves programmability and switching speed but does not, by itself, escape the affine-degree obstruction.

If the drive is computed from the evolving optical state, the combined optical-electronic system may escape the obstruction, but the feedback computation and its resources must be included.

### Second-order interaction

When all participating optical fields are computational degrees of freedom, a \(\chi^{(2)}\) interaction introduces products of field amplitudes and can raise algebraic degree under composition. Periodically poled TFLT waveguides have experimentally demonstrated this physical primitive.

However, pure repeated second-harmonic generation is not automatically a fixed endomorphism. It maps frequency \(\omega\) to \(2\omega\), so the state type changes unless it contains an explicit frequency ladder. Repeated doubling also demands exponentially increasing optical frequency:

\[
\omega,2\omega,4\omega,8\omega,\ldots
\]

and rapidly leaves any finite transparency and phase-matching window. Frequency conversion or recycling that closes the loop consumes additional pumps, modes, and engineered interactions.

Thus \(\chi^{(2)}\) breaks the affine invariant locally but does not yet supply a scalable recurrent morphism.

### Kerr interaction and four-wave mixing

LiTaO3 microresonators have demonstrated dissipative Kerr-soliton microcombs. Kerr and four-wave-mixing processes couple field amplitudes nonlinearly while operating across a frequency-mode lattice that can, in principle, remain within a fixed declared mode object.

This makes a pumped Kerr resonator a more plausible next process category than pure harmonic doubling. It is nevertheless an open driven-dissipative system: pump energy, optical loss, thermal effects, Raman competition, stabilization, and discarded output must be explicit.

The existence of a soliton or comb is not evidence of computational depth. The next question is whether its nonlinear mode interactions implement a compositional invariant that grows predictively before dissipation and saturation erase the benefit.

## Resource ledger for the next model

At minimum, the physical resource object should record:

\[
R=
(N_{\mathrm{modes}},
P_{\mathrm{pump}},
E_{\mathrm{RF}},
L_{\mathrm{prop}},
Q_{\mathrm{cavity}},
B_{\mathrm{opt}},
B_{\mathrm{RF}},
V,
\tau,
\pi,
\Theta),
\]

where the entries represent mode count, pump power, RF energy, propagation loss, cavity quality factor, optical and RF bandwidth, device volume, elapsed time, required precision, and thermal-control resources.

Fresh carriers, reset reservoirs, measurement records, and entropy sinks must be represented as resource inputs or waste outputs rather than absorbed into a nominal endomorphism.

## Severe tests

### Test A: validate the affine boundary

Fabricate or simulate an LT-0/LT-1 recurrent circuit and drive it with independently varied complex amplitudes. Across increasing recurrence:

- estimate its Volterra or polynomial response order;
- search for higher-order intermodulation products;
- measure whether fitted degree above two exceeds the noise floor;
- determine whether thermal, Kerr, Raman, or detector feedback has already moved the system outside \(\mathsf{LT}_{\mathrm{aff}}\).

The expected result inside the boundary is changing coefficients with no reliable degree growth.

### Test B: isolate one nonlinear escape morphism

Add one declared nonlinear section and repeat the response-order test. Compare:

- prescribed undepleted pumping;
- pump-depleted \(\chi^{(2)}\) interaction;
- Kerr interaction in a fixed frequency-mode set;
- electro-optic measurement feedback.

The test must identify which system carries the new degree: the optical state, an external pump, expanding frequency modes, or an electronic controller.

### Test C: test compositional closure

For the selected nonlinear morphism, determine whether repeated use acts on the same physical object and whether its measured invariant composes according to a predeclared law. Track loss, noise, phase mismatch, bandwidth, and saturation through the same recurrence horizon.

Local nonlinearity without closure does not qualify as recurrent depth.

### Test D: compare recurrence with a cascade

Compare a reused nonlinear element with an equal-use feed-forward cascade. Charge both for pumps, routing, stabilization, latency, and mode count. A recurrence claim must not receive free resources merely because the same fabricated component is traversed repeatedly.

## Decision

The first perimeter result is accepted:

> Fixed affine LiTaO3 optics with linear amplitude encoding and terminal square-law detection has a recurrence-invariant algebraic-degree ceiling. It cannot realize a logical family whose required degree grows with sequential composition.

This is a conditional obstruction, not Conjecture 5.

The next study should construct the driven Kerr/four-wave-mixing process category, including pumps, loss, mode bandwidth, Raman and thermal effects, and ask whether a compositional nonlinear invariant grows over a predictable resource-bounded horizon. A pure second-harmonic recurrence should not be prioritized unless a closed frequency-recycling construction is specified.

## Primary evidence

- Chengli Wang et al., [Lithium tantalate photonic integrated circuits for volume manufacturing](https://doi.org/10.1038/s41586-024-07369-1), *Nature* 629, 784-790 (2024). This supports the wafer-scale platform, measured loss, Pockels modulation, birefringence comparison, optical-damage discussion, and Kerr-soliton demonstration.
- Haiwei Chen et al., [Continuous-wave second-harmonic generation of green light in periodically poled thin-film lithium tantalate](https://doi.org/10.1364/OL.547762), *Optics Letters* 50, 1125-1127 (2025). This supports periodically poled TFLT frequency doubling and its measured conversion.
- Anna Shelton et al., [Second Harmonic Generation in Periodically Poled Thin-Film Lithium Tantalate](https://doi.org/10.1364/CLEO_SI.2025.SS195_3), CLEO 2025. This independently demonstrates nonlinear wave mixing in periodically poled TFLT.
- Xiongshuo Yan et al., [High optical damage threshold on-chip lithium tantalate microdisk resonator](https://doi.org/10.1364/OL.394171), *Optics Letters* 45, 4100-4103 (2020). This supports high-Q LTOI resonators, second-harmonic generation, cascaded third-harmonic generation, and the reported transparency range.

The categorical boundary, degree invariant, and obstruction proof are deductions made here from the declared affine field model; they are not claims made by the cited experimental papers.
