---
layout: ../../layouts/ArticleLayout.astro
title: "Spatial Dataflow: Implementation Evidence"
description: "Stage-by-stage evidence behind the spatial-dataflow row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - dataflow
  - non-von-neumann
draft: false
---

# Spatial dataflow: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

Spatial dataflow makes a graph of operations and dependencies primary. The marks below concern implementations of that architecture, not the broader claim that all computation can be described by a graph.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable graph compilers and toolchains |
| Physical | ● | Reconfigurable dataflow processors |
| Integrated | ● | Compute, memory, routing, and compilation form a system |
| Scaled | ● | Multi-chip products and installations |
| Access | ● | Vendor cloud and customer systems |
| Operational | ◐ | Recurring use, but in selected workloads and mostly vendor-reported |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow at the Reference stage: executable graph compilers and toolchains.</dd>
<dt>Evidence</dt><dd>Dataflow graphs, Kahn process networks, synchronous dataflow, and modern accelerator compilers all provide executable semantics. This mark requires only that programs can be compiled and run; it does not yet credit a distinct physical machine.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow at the Physical stage: reconfigurable dataflow processors.</dd>
<dt>Evidence</dt><dd>SambaNova describes a Reconfigurable Dataflow Unit built from programmable compute and memory units. NextSilicon describes Maverick as a production dataflow accelerator. These are physical implementations rather than simulations of a graph machine.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow at the Integrated stage: compute, memory, routing, and compilation form a system.</dd>
<dt>Evidence</dt><dd>The credited systems combine graph compilation, local memory, programmable execution units, routing, and host interfaces. The integration mark does not mean the conventional host has disappeared; it means the dataflow part is a coherent programmable subsystem.</dd>
<dt>Criticism</dt><dd>A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

<h2 id="scaled">Scaled — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow at the Scaled stage: multi-chip products and installations.</dd>
<dt>Evidence</dt><dd>SambaNova reports configurations in which as many as 256 RDUs cooperate, while NextSilicon reports deployment in Sandia’s Vanguard evaluation program. This establishes system composition. It does not establish that scaling is efficient for arbitrary control-heavy programs.</dd>
<dt>Criticism</dt><dd>Composition at the reported scale does not establish useful scaling across workloads, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

<h2 id="access">Access — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow at the Access stage: vendor cloud and customer systems.</dd>
<dt>Evidence</dt><dd>SambaNova exposes its systems through cloud and enterprise products, and NextSilicon supplies a toolchain for conventional HPC languages. Access is therefore more than publication of a simulator, although it remains mediated by vendors.</dd>
<dt>Criticism</dt><dd>Access does not establish broad availability, recurring use, workload generality, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

<h2 id="operational">Operational — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits spatial dataflow only partially at the Operational stage: recurring use, but in selected workloads and mostly vendor-reported.</dd>
<dt>Evidence</dt><dd>The systems run recurring inference and HPC workloads, and vendors identify customer and laboratory installations. The mark remains limited because workload selection, porting effort, host dependence, and much of the performance evidence are controlled or reported by the vendors.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: recurring use, but in selected workloads and mostly vendor-reported. Recurring work does not establish workload generality, independent reproduction, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://sambanova.ai/products/dataflow-architecture">SambaNova Dataflow Architecture</a>; <a href="https://www.nextsilicon.com/">NextSilicon</a></dd>
</dl>
</div>

## Sources

- [SambaNova Dataflow Architecture](https://sambanova.ai/products/dataflow-architecture)
- [NextSilicon](https://www.nextsilicon.com/)