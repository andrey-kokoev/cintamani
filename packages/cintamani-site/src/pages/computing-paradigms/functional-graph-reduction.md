---
layout: ../../layouts/ArticleLayout.astro
title: "Functional Graph Reduction: Implementation Evidence"
description: "Stage-by-stage evidence behind the functional graph-reduction row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - graph-reduction
  - functional-programming
draft: false
---

# Functional graph reduction: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

A graph-reduction machine evaluates a functional program by rewriting its expression graph. The credited hardware line is narrower than functional programming generally.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable reducer designs and toolchains |
| Physical | ● | FPGA processor core |
| Integrated | ● | Reduction machinery assembled as a programmable core |
| Scaled | — | No many-core reducer demonstrated |
| Access | ◐ | Research artifacts and FPGA-oriented designs |
| Operational | — | No recurring deployment located |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits functional graph reduction at the Reference stage: executable reducer designs and toolchains.</dd>
<dt>Evidence</dt><dd>The Heron and HAFLANG work specifies executable reduction machinery for pure, non-strict functional languages. The design makes allocation, graph traversal, and reduction explicit enough to compile and test.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/">Heron: Modern Hardware Graph Reduction</a>; <a href="https://haflang.github.io/">HAFLANG</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits functional graph reduction at the Physical stage: FPGA processor core.</dd>
<dt>Evidence</dt><dd>Heron was implemented as an FPGA processor core. That crosses the physical threshold: graph-reduction operations are realized by purpose-built logic rather than only interpreted by a CPU.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/">Heron: Modern Hardware Graph Reduction</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits functional graph reduction at the Integrated stage: reduction machinery assembled as a programmable core.</dd>
<dt>Evidence</dt><dd>The FPGA core brings reduction control, graph storage operations, and execution together as a machine. The mark is for a coherent research processor, not for a complete stand-alone computer with mature storage and I/O.</dd>
<dt>Criticism</dt><dd>A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/">Heron: Modern Hardware Graph Reduction</a></dd>
</dl>
</div>

<h2 id="access">Access — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits functional graph reduction only partially at the Access stage: research artifacts and FPGA-oriented designs.</dd>
<dt>Evidence</dt><dd>The architecture and research line are published, and HAFLANG continues work on hardware acceleration. Access remains limited because there is no maintained public service or generally available graph-reduction appliance.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: research artifacts and FPGA-oriented designs. Access does not establish broad availability, recurring use, workload generality, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/">Heron: Modern Hardware Graph Reduction</a>; <a href="https://haflang.github.io/">HAFLANG</a></dd>
</dl>
</div>

## Stages not credited

No public evidence establishes a many-core reducer whose allocation, communication, and garbage-collection costs remain favorable at scale. No recurring operational deployment was located.

## Sources

- [Heron: Modern Hardware Graph Reduction](https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/)
- [HAFLANG](https://haflang.github.io/)