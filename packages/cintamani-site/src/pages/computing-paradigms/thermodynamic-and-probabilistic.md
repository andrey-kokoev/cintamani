---
layout: ../../layouts/ArticleLayout.astro
title: "Thermodynamic and Probabilistic Computing: Implementation Evidence"
description: "Stage-by-stage evidence behind the thermodynamic and probabilistic row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - probabilistic-computing
  - thermodynamic-computing
draft: false
---

# Thermodynamic and probabilistic computing: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

These systems use controllable physical noise or relaxation to sample from distributions and solve probabilistic subproblems. Noise is part of the operation rather than merely an error to suppress.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | THRML software environment |
| Physical | ● | Reported stochastic CMOS silicon |
| Integrated | ● | Prototype sampling platforms |
| Scaled | — | No broad scale demonstrated |
| Access | ◐ | Open software and restricted hardware access |
| Operational | — | No recurring external deployment located |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits thermodynamic and probabilistic computing at the Reference stage: THRML software environment.</dd>
<dt>Evidence</dt><dd>THRML provides a JAX library for thermodynamic hypergraphical models. It lets researchers define, train, and test probabilistic computations on conventional machines before mapping them to stochastic hardware.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://github.com/extropic-ai/thrml">THRML repository</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits thermodynamic and probabilistic computing at the Physical stage: reported stochastic CMOS silicon.</dd>
<dt>Evidence</dt><dd>Extropic reports X0 stochastic silicon, while Normal Computing reports a CN101 ASIC tape-out. The full mark relies on the disclosed existence of physical silicon, not on vendor performance projections.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://extropic.ai/hardware">Extropic hardware</a>; <a href="https://www.normalcomputing.com/solutions/asics">Normal Computing ASICs</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits thermodynamic and probabilistic computing at the Integrated stage: prototype sampling platforms.</dd>
<dt>Evidence</dt><dd>Extropic describes XTR-0 as a prototype platform around its thermodynamic sampling hardware. A platform that joins stochastic compute elements with control and readout crosses the integration threshold, although independent characterization remains sparse.</dd>
<dt>Criticism</dt><dd>A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://extropic.ai/hardware">Extropic hardware</a></dd>
</dl>
</div>

<h2 id="access">Access — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits thermodynamic and probabilistic computing only partially at the Access stage: open software and restricted hardware access.</dd>
<dt>Evidence</dt><dd>The reference software is public, and hardware access is described through early or partner programs rather than an unrestricted public system. The cell is therefore partial.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: open software and restricted hardware access. Access does not establish broad availability, recurring use, workload generality, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://extropic.ai/hardware">Extropic hardware</a>; <a href="https://github.com/extropic-ai/thrml">THRML repository</a></dd>
</dl>
</div>

## Stages not credited

No public evidence yet shows large, composable arrays running externally selected workloads, or a recurring production deployment with independently reproduced advantage.

## Sources

- [Extropic hardware](https://extropic.ai/hardware)
- [Normal Computing ASICs](https://www.normalcomputing.com/solutions/asics)
- [THRML repository](https://github.com/extropic-ai/thrml)