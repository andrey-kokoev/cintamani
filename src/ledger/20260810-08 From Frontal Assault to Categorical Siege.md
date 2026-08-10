# From Frontal Assault to Categorical Siege

## Problem situation

The first task-level VRC experiment tested whether a fixed learned physical operator and fixed-size state acquired useful computational depth from additional recurrence.

The selected regime was rejected. Its physical state remained active and the pre-task substrate retained persistent, high-rank dynamics, but those properties did not produce corrective task computation. Across the final three-seed suite, recurrence produced negligible clean improvement, negative gain on harder recoverable corruptions, more correct-to-wrong than wrong-to-correct transitions, and overwhelming confidence amplification.

The result rejects the selected substrate-and-training regime. It does not establish that every recurrent physical computer must fail. It does establish that dynamical richness, persistence, nonlinearity, and state motion are not adequate selection principles by themselves.

## Strategic reorientation

The project should move from a frontal assault—constructing another complete end-to-end machine—to a siege strategy that maps constraints, identifies structural weak points, and eliminates broad classes of proposals with inexpensive severe tests.

The initial design space has three principal facets:

1. theoretical model of computation;
2. physical material or platform;
3. physical computational primitive.

Examples of computational models include finite-state systems, cellular automata, recurrent dynamical systems, reservoirs, message-passing systems, iterative solvers, attractor systems, and probabilistic or quantum models.

Examples of materials and platforms include LiTaO3, LiNbO3, silicon and silicon-nitride photonics, III-V semiconductors, phase-change media, photorefractive crystals, nonlinear polymers, magnetic or spintronic media, acoustic systems, and optomechanical systems.

Examples of physical primitives include propagation, interference, phase accumulation, diffraction, refraction, scattering, resonant storage, nonlinear mixing, saturation, gain and loss, hysteresis, delay, measurement, and feedback.

These facets are not independent Cartesian axes. Refraction, phase, and path interference may be different descriptions or factorizations of the same electromagnetic evolution. A material also supports only a constrained subset of primitives, and those primitives realize only a constrained subset of operators.

The more useful dependency is:

\[
\text{material}
\longrightarrow
\text{physical primitives}
\longrightarrow
\text{realizable operators}
\longrightarrow
\text{computational models}.
\]

The design space should therefore be implemented as a sparse, typed, evidence-bearing knowledge graph. A three-dimensional cube may remain a human visualization, but it is not the research theory.

## Deutsch-Popperian constraint

Enumeration is not explanation. A taxonomy can absorb every outcome and risks becoming an indefinitely expandable filing system. A scorecard can likewise optimize proxies without explaining why a physical system should acquire computational depth. The recursive-MNIST result already demonstrated that persistent, high-dimensional dynamics can be impressive while remaining computationally unhelpful.

Every future empirical conjecture must be hard to vary. It should identify:

- one material and operating regime;
- one controlled set of physical primitives;
- one logical task family;
- one proposed causal mechanism, invariant, or obstruction;
- one quantitative prediction;
- one forbidden outcome that would reject the conjecture.

Changing the representation, task semantics, resource model, tolerance, or physical boundary after observing failure constitutes a new conjecture rather than a rescue of the old one.

## Evolution of the conjectures

### Conjecture 1: recurrence as depth

The initial claim was:

\[
\text{fixed operator}
+\text{fixed state}
+\text{more recurrence}
\Rightarrow
\text{more useful computation}.
\]

The selected VRC regime failed this test. Recurrence changed the state and confidence but did not reliably improve correctness. The result falsifies that regime, not every conceivable recurrent substrate.

### Conjecture 2: compositional correction

The proposed repair was that recurrence becomes computation only when it preserves relevant distinctions and preferentially converts incorrect representations into correct ones.

This was not retained as a universal conjecture. Its error measure depended on an external decoder and knowledge of the final answer; arbitrary successful trajectories could be redescribed as error reduction. Many legitimate computations also pass through intermediate states that are not progressively better guesses of the final result.

The durable insight is narrower: reliable composition requires some form of physical or representational error control, but task error need not decrease monotonically at every computational step. Correction must be demonstrated causally through controlled perturbations, not inferred merely from wrong-to-right output transitions.

### Conjecture 3: robust physical composition

The next proposal required a fixed physical recurrence to robustly implement successive transitions of an independently specified logical process:

\[
D\circ F_\Theta^t\circ R
\simeq
G_Q^t.
\]

This is useful as an implementation protocol but not as an explanation of computational depth. The relation approaches a definition of what it means to implement \(G_Q\), while arbitrary encoders or decoders can conceal the computation. Non-idempotence is also weaker than depth: a toggle or short cycle changes forever without performing an intrinsically deeper task.

The durable requirements are independently declared semantics, bounded interface cost, counterfactual tests, physical interventions, and an explicit search for cheaper equivalent implementations.

### Conjecture 4: resource-honest functorial depth

The categorical reformulation introduced logical and physical process categories, robust preservation of composition, explicit resource accounting, bounded interfaces, and a no-fast-forward condition.

Its critique exposed that a functor from a free category generated by one endomorphism is automatic: choosing a physical endomorphism \(f\) already determines a functor sending \(g^t\) to \(f^t\). Ordinary categories may also erase implementation costs, while categorical depth depends on a chosen presentation and generator library.

Consequently, Conjecture 4 is not retained as an empirical conjecture. Its useful content is preserved separately as the **Functorial Depth Criterion**, an audit framework for future claims.

## Current status

| Item | Status | Durable conclusion |
| --- | --- | --- |
| Conjecture 1 | Selected regime rejected | Fixed recurrence and active dynamics do not by themselves imply useful depth |
| Conjecture 2 | Not retained as universal | Error control matters, but monotonic task-level correction is not necessary for computation |
| Conjecture 3 | Demoted to implementation protocol | Semantics and interfaces must be specified independently and tested counterfactually |
| Conjecture 4 | Renamed as a criterion | Functorial and resource accounting disciplines claims but does not explain material capability |
| Conjecture 5 | Not formulated | A material-specific compositional invariant or obstruction must come first |

## Present research question

The unresolved question is:

> What compositional property of a material's physical process category determines which logical process categories it can realize under bounded resources?

The next intellectual task is not another universal reformulation. It is to choose a specific material-and-primitive regime and discover an invariant that yields a quantitative positive prediction or a no-go result.

## Decision

Do not formulate Conjecture 5 merely by adding another abstraction layer.

First:

1. select a material, device regime, and allowed primitive set;
2. construct a resource-explicit model of its physical processes;
3. identify candidate compositional invariants or monotones;
4. select a logical task family whose requirements vary under those invariants;
5. formulate competing positive and obstruction hypotheses;
6. retain only hypotheses with quantitative predictions and forbidden outcomes.

