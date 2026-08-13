---
layout: ../../layouts/ArticleLayout.astro
title: "Compute-in-Memory: Implementation Evidence"
description: "Stage-by-stage evidence behind the compute-in-memory row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - compute-in-memory
  - analog-computing
draft: false
---

# Compute-in-memory: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

Compute-in-memory performs an operation where data is stored, reducing movement between a processor and separate memory. The row credits integrated demonstrations, not every accelerator with a large cache.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable models and mapped neural workloads |
| Physical | ● | Fabricated phase-change-memory compute arrays |
| Integrated | ● | 64 cores, digital functions, and on-chip network |
| Scaled | ◐ | Multicore chip, not a general large system |
| Access | — | No externally programmable system located |
| Operational | ◐ | Complete experimental inference tasks |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits compute-in-memory at the Reference stage: executable models and mapped neural workloads.</dd>
<dt>Evidence</dt><dd>Toolchains map matrix-vector operations and neural-network layers onto analog memory arrays while modeling precision and device behavior. These executable mappings define what the hardware is expected to compute.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">IBM’s 64-core mixed-signal in-memory-compute chip</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits compute-in-memory at the Physical stage: fabricated phase-change-memory compute arrays.</dd>
<dt>Evidence</dt><dd>IBM reports a chip fabricated in 14 nm CMOS with backend-integrated phase-change memory. Computation occurs through the physical response of the memory arrays rather than by fetching every weight into a separate arithmetic unit.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">IBM’s 64-core mixed-signal in-memory-compute chip</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits compute-in-memory at the Integrated stage: 64 cores, digital functions, and on-chip network.</dd>
<dt>Evidence</dt><dd>The chip combines 64 analog in-memory-compute cores with an on-chip communication network, digital activation functions, and processing for convolutional and recurrent layers. That integration is the strongest evidence in this row.</dd>
<dt>Criticism</dt><dd>A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">IBM’s 64-core mixed-signal in-memory-compute chip</a></dd>
</dl>
</div>

<h2 id="scaled">Scaled — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits compute-in-memory only partially at the Scaled stage: multicore chip, not a general large system.</dd>
<dt>Evidence</dt><dd>Sixty-four cores establish multicore composition on one chip. The mark remains partial because conversion, calibration, weight updates, host coordination, and larger-system communication have not yet been shown as a broadly scalable computer.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: multicore chip, not a general large system. Composition at the reported scale does not establish useful scaling across workloads, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">IBM’s 64-core mixed-signal in-memory-compute chip</a></dd>
</dl>
</div>

<h2 id="operational">Operational — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits compute-in-memory only partially at the Operational stage: complete experimental inference tasks.</dd>
<dt>Evidence</dt><dd>The device repeatedly executes complete ResNet and long short-term-memory inference workloads with near-software-equivalent accuracy in experiments. This is more than an isolated memory-cell operation, but it is not a recurring external deployment.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: complete experimental inference tasks. Recurring work does not establish workload generality, independent reproduction, favorable economics, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">IBM’s 64-core mixed-signal in-memory-compute chip</a></dd>
</dl>
</div>

## Stage not credited

No generally available system was located on which outsiders can load and run arbitrary supported workloads; the Access cell therefore remains a dash.

## Source

- [IBM’s 64-core mixed-signal in-memory-compute chip](https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference)