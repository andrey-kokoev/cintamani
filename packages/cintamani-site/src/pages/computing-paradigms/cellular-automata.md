---
layout: ../../layouts/ArticleLayout.astro
title: "Cellular Automata: Implementation Evidence"
description: "Stage-by-stage evidence behind the cellular-automata row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - cellular-automata
  - in-memory-computing
draft: false
---

# Cellular automata: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

A cellular automaton updates many local cells under a common rule. Universality of a rule is not an implementation claim; the matrix asks whether the local-update machine has been built and used.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable rules and universal variants |
| Physical | ● | FPGA, CMOS, and memristive realizations |
| Integrated | ● | State and local transition logic combined |
| Scaled | ◐ | Arrays demonstrated, but not general systems |
| Access | ◐ | Research implementations rather than a public appliance |
| Operational | ◐ | Specialized repeated computation only |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata at the Reference stage: executable rules and universal variants.</dd>
<dt>Evidence</dt><dd>Cellular-automaton rules are directly executable, and universal constructions are established. The reference mark concerns the semantics of local state transition, not the practicality of compiling ordinary software into those rules.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata at the Physical stage: FPGA, CMOS, and memristive realizations.</dd>
<dt>Evidence</dt><dd>Purpose-built FPGA and CMOS implementations exist. The cited memristive work physically embeds a cellular-automaton update in recirculated in-memory logic, coupling stored state to local computation.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata at the Integrated stage: state and local transition logic combined.</dd>
<dt>Evidence</dt><dd>The memristive demonstration combines memory, local Boolean operations, and repeated state update in one array. This is enough for a coherent device-level implementation, though external control and readout remain conventional.</dd>
<dt>Criticism</dt><dd>A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

<h2 id="scaled">Scaled — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata only partially at the Scaled stage: arrays demonstrated, but not general systems.</dd>
<dt>Evidence</dt><dd>Arrays contain many cells and update them in parallel, but the evidence does not establish a general machine whose useful programs preserve locality as the array grows. Global communication can erase the architectural advantage.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: arrays demonstrated, but not general systems. Composition at the reported scale does not establish useful scaling across workloads, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

<h2 id="access">Access — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata only partially at the Access stage: research implementations rather than a public appliance.</dd>
<dt>Evidence</dt><dd>Rules, papers, and some research implementations are available to outsiders. The purpose-built devices themselves are not exposed as generally programmable public systems.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: research implementations rather than a public appliance. Access does not establish broad availability, recurring use, workload generality, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

<h2 id="operational">Operational — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits cellular automata only partially at the Operational stage: specialized repeated computation only.</dd>
<dt>Evidence</dt><dd>The hardware can perform repeated local updates and specialized in-memory logic. This is narrower than recurring deployment on externally chosen applications, so the cell is partial rather than full.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: specialized repeated computation only. Recurring work does not establish workload generality, independent reproduction, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://www.nature.com/articles/s41467-023-38299-7">Cellular automata embedded in memristor-based recirculated logic</a></dd>
</dl>
</div>

## Source

- [Cellular automata embedded in memristor-based recirculated logic](https://www.nature.com/articles/s41467-023-38299-7)