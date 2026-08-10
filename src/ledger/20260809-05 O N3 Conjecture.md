# VRC Conjecture: Persistent Volumetric State Enables \(O(N^3)\) Controllability

## Conjecture

A Volumetric Recurrent Computing substrate can approach

\[
N_{\mathrm{ECD}}=O(N^3)
\]

for an \(N\times N\times N\) lattice only when each volumetric site supports an independently programmable, persistent local state.

The essential material primitive is:

\[
\boxed{
\text{persistent}
+
\text{locally writable}
+
\text{optically readable}
+
\text{reconfigurable state}
}
\]

at every computational site.

Without such local persistence, three intersecting optical control fields generally produce only a low-dimensional instantaneous configuration.

For example,

\[
\theta_{ijk}=f(a_i,b_j,c_k)
\]

contains \(N^3\) spatial values but is generated from only \(3N\) independent controls. Its reachable configuration space therefore has dimension at most approximately

\[
O(N),
\]

not \(O(N^3)\).

With line-indexed control fields, the bound may increase to

\[
O(N^2),
\]

but it still does not yield independent volumetric configuration.

## Persistent-site mechanism

Suppose three addressing paths identify a site:

\[
X_i\cap Y_j\cap Z_k
\longrightarrow
v_{ijk}.
\]

If their coincidence causes a durable local change,

\[
(X_i,Y_j,Z_k)
\longrightarrow
\theta_{ijk},
\]

and that state remains after the addressing fields are removed, then sites may be programmed sequentially:

\[
\Theta
=
\{\theta_{ijk}\}_{i,j,k=1}^{N}.
\]

The number of addressing channels can remain much smaller than the number of stored states, just as an address bus can select among many memory cells.

Under ideal independent programming,

\[
N_{\mathrm{configurable\ sites}}=N^3
\]

and therefore the upper bound becomes

\[
\boxed{
N_{\mathrm{ECD}}\leq N^3.
}
\]

Reaching that upper bound requires that distinct site configurations produce independently distinguishable effects on computation.

## Role of CsPbBr\(_3\)

CsPbBr\(_3\) nanocrystals embedded in glass are a candidate mechanism for introducing localized, optically active material states into a femtosecond-laser-written volumetric substrate.

Their possible relevance to VRC is not principally that they are quantum emitters. The relevant possibility is that engineered CsPbBr\(_3\) regions could provide some combination of:

- localized optical response;
- strong light–matter interaction;
- optical nonlinearity;
- persistent or metastable state;
- optical write and read access;
- compatibility with volumetric laser fabrication.

The proposed role is therefore:

\[
\text{fs-written paths}
\rightarrow
\text{addressing and connectivity},
\]

\[
\text{CsPbBr}_3\text{ sites}
\rightarrow
\text{persistent programmable node state}.
\]

This would produce a substrate of the form

\[
\boxed{
\text{permanent 3-D topology}
+
\text{persistent programmable volumetric state}
+
\text{fast circulating optical field}.
}
\]

At present, CsPbBr\(_3\) should be treated only as a candidate material. Existing demonstrations of CsPbBr\(_3\) nanocrystals in glass do not establish independently writable, persistent, high-density \(N^3\) optical memory nodes.

## Effective Controllable Dimension

Raw persistent-site count is not sufficient.

For recurrent behavior

\[
B_T(\Theta),
\]

define the configuration-response Jacobian

\[
J_{\Theta,T}
=
\frac{\partial B_T}{\partial\Theta}.
\]

The Effective Controllable Dimension is the number of singular directions that remain distinguishable above the relevant physical noise floor:

\[
\boxed{
N_{\mathrm{ECD}}(T)
=
\#\left\{
\sigma_i(J_{\Theta,T})>\sigma_{\mathrm{noise}}
\right\}.
}
\]

The strong conjecture is therefore not merely

\[
N_{\mathrm{sites}}=O(N^3),
\]

but

\[
\boxed{
N_{\mathrm{ECD}}(T)=\Omega(N^3)
}
\]

over a useful range of lattice sizes and recurrence horizons.

Equivalently, controllability efficiency

\[
\eta_{\mathrm{ECD}}
=
\frac{N_{\mathrm{ECD}}}{N^3}
\]

must remain bounded away from zero as \(N\) increases.

## Required material properties

A candidate material must demonstrate:

1. **Localization**

   Writing site \(v_{ijk}\) must not materially alter nearby sites.

2. **Persistence**

   The programmed state must survive without continuous control illumination.

3. **Rewritability**

   Sites must support repeated updates or erasure.

4. **Selectivity**

   One- and two-path exposure must not cause substantial half-selection.

5. **Readable influence**

   Different local states must produce distinguishable effects on propagating computational fields.

6. **Low crosstalk**

   Programming and reading one site must not collapse the independence of neighboring sites.

7. **Adequate retention-to-write ratio**

   The state must persist much longer than the time required to program it.

8. **Compatible nonlinearity**

   Local response must support useful state-dependent computation without uncontrolled instability or loss.

9. **Scalable optical access**

   Addressing, readout, and propagation must remain practical as lattice size increases.

## Falsification

The conjecture is weakened if any of the following occurs:

- the number of distinguishable configurations scales only as \(O(N)\) or \(O(N^2)\);
- local states cannot be retained after addressing fields are removed;
- programming crosstalk grows with lattice size;
- singular directions of \(J_{\Theta,T}\) rapidly collapse below noise;
- optical loss prevents deeper sites from influencing output;
- independently programmed sites produce strongly redundant computational effects;
- \(\eta_{\mathrm{ECD}}\rightarrow0\) as \(N\rightarrow\infty\).

It is supported if experiments show that:

\[
N_{\mathrm{ECD}}
\propto N^3
\]

to useful approximation while maintaining acceptable write energy, retention, loss, noise, and recurrence stability.

## Research implication

The primary VRC materials question is not:

> Which material has the strongest optical nonlinearity?

It is:

> Which material can provide the greatest density of independently programmable, persistent, optically coupled computational state?

The relevant substrate metric is therefore not merely voxel density, but

\[
\boxed{
\frac{N_{\mathrm{ECD}}}{V}
}
\]

effective controllable dimension per unit volume, together with:

\[
\frac{N_{\mathrm{ECD}}}{E_{\mathrm{write}}},
\qquad
\frac{N_{\mathrm{ECD}}}{E_{\mathrm{inference}}},
\qquad
\frac{N_{\mathrm{ECD}}}{\$},
\qquad
\text{retention},
\qquad
\text{rewrite endurance}.
\]

## Summary

Three intersecting paths can identify \(N^3\) locations, but they do not create \(N^3\) independent computational degrees of freedom by themselves.

The transition from

\[
O(N)\ \text{or}\ O(N^2)
\]

to

\[
O(N^3)
\]

requires local memory:

\[
\boxed{
\text{address coincidence}
\rightarrow
\text{persistent site state}
\rightarrow
\text{independent computational effect}.
}
\]

CsPbBr\(_3\) in glass is one candidate for supplying that local physical state. Whether it can do so with the required persistence, selectivity, rewritability, and scale is an open experimental question.