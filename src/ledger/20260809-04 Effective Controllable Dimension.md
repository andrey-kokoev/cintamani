# VRC Conjecture: Effective Controllable Dimension

## Conjecture

The useful computational capacity of a Volumetric Recurrent Computing substrate is determined primarily by the number of **independently controllable transformations** it can induce, not by its raw number of physical sites.

For

[
S' = F_\Theta(S),
]

define the configuration-response Jacobian

[
J_\Theta =
\frac{\partial F_\Theta(S)}
{\partial \Theta}.
]

Its singular spectrum

[
\sigma_1 \ge \sigma_2 \ge \cdots
]

describes how strongly independent changes in physical configuration affect computational behavior.

Because a real analog substrate has noise, drift, fabrication error, and finite measurement resolution, literal matrix rank is not the useful quantity.

Define the **Effective Controllable Dimension** as

[
\boxed{
N_{\mathrm{ECD}}
================

#\left{
\sigma_i(J_\Theta)>\sigma_{\mathrm{noise}}
\right}.
}
]

That is, (N_{\mathrm{ECD}}) counts the number of independently controllable computational directions whose effects remain distinguishable above the relevant physical noise floor.

## Capacity conjecture

For VRC substrates of comparable architecture,

[
\boxed{
\text{useful learned capacity}
\sim
N_{\mathrm{ECD}}
}
]

should correlate more strongly with computational capability than

[
N_{\mathrm{physical\ sites}}.
]

A substrate containing (10^{11}) programmable voxels is therefore not meaningfully a (10^{11})-parameter machine unless changes to those voxels produce approximately (10^{11}) independently distinguishable effects on computation.

## Controllability efficiency

Define

[
\boxed{
\eta_{\mathrm{ECD}}
===================

\frac{N_{\mathrm{ECD}}}
{N_{\mathrm{physical\ sites}}}.
}
]

This measures how efficiently physical complexity becomes independently usable computational complexity.

For example,

[
N_{\mathrm{sites}}=10^{11},
\qquad
\eta_{\mathrm{ECD}}=10^{-4}
]

implies only

[
N_{\mathrm{ECD}}\sim10^7.
]

Conversely,

[
N_{\mathrm{sites}}=10^9,
\qquad
\eta_{\mathrm{ECD}}=0.3
]

implies

[
N_{\mathrm{ECD}}\sim3\times10^8,
]

making the physically smaller substrate potentially much more computationally useful.

## Substrate metrics

Candidate VRC materials and architectures should therefore be compared using quantities such as

[
\boxed{
\frac{N_{\mathrm{ECD}}}{V}
}
]

effective controllable dimension per unit volume,

[
\boxed{
\frac{N_{\mathrm{ECD}}}{E}
}
]

effective controllable dimension per unit operating energy, and

[
\boxed{
\frac{N_{\mathrm{ECD}}}{$}
}
]

effective controllable dimension per unit manufacturing cost.

Raw voxel density is insufficient.

## Experimental estimation

For a programmable substrate:

1. choose an operating state ((S,\Theta));
2. perturb configurable physical parameters;
3. measure the resulting changes in output or recurrent dynamics;
4. estimate the action of

[
J_\Theta=
\frac{\partial F_\Theta}{\partial\Theta};
]

5. estimate its singular spectrum using matrix-free methods;
6. determine which singular directions remain distinguishable above the measured physical noise floor.

For large systems, explicitly constructing (J_\Theta) should not be required. Use:

* Jacobian-vector products;
* randomized SVD;
* power iteration;
* experimentally sampled perturbations;
* low-rank spectral estimation.

The same methodology should apply to simulated and physical VRC substrates.

## Falsification

The conjecture is weakened if computational capability continues scaling strongly with raw physical site count after

[
N_{\mathrm{ECD}}
]

has saturated.

Conversely, if substrates with comparable (N_{\mathrm{ECD}}) exhibit comparable learned capacity despite very different raw site counts, that would support ECD as a fundamental VRC capacity measure.

## Relation to recurrence

VRC has two independent scaling variables:

[
\boxed{
N_{\mathrm{ECD}}
}
\qquad\text{and}\qquad
\boxed{
T
}
]

where

* (N_{\mathrm{ECD}}) measures the effective size of the configurable machine;
* (T) measures how long its transient state is allowed to evolve through that machine.

This suggests the VRC analogue of conventional **parameter count × inference compute**:

[
\boxed{
\text{effective controllable dimension}
\times
\text{recurrence time}.
}
]

The two central VRC questions therefore become:

> **How many independently useful computational directions does the physical substrate provide?**

and

> **How much additional computation can the same substrate obtain by evolving for longer?**
