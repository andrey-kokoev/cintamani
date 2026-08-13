---
layout: ../../layouts/ArticleLayout.astro
title: "Reversible and Adiabatic Computing: Implementation Evidence"
description: "Stage-by-stage evidence behind the reversible and adiabatic row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - reversible-computing
  - adiabatic-computing
draft: false
---

# Reversible and adiabatic computing: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

Reversible logic preserves enough information to undo a computation. Adiabatic circuits try to recover switching energy by changing state gradually. A reversible Boolean design does not by itself establish low-energy hardware.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable reversible circuits and design methods |
| Physical | ● | Reported energy-recovery proof of concept |
| Integrated | ◐ | Early logic and clock integration |
| Scaled | — | No system-scale demonstration located |
| Access | — | No externally runnable system located |
| Operational | — | No recurring deployment located |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits reversible and adiabatic computing at the Reference stage: executable reversible circuits and design methods.</dd>
<dt>Evidence</dt><dd>Reversible gates, circuits, and compilers are executable on conventional hosts and can be checked for logical reversibility. This establishes semantics, but it says nothing about whether a physical implementation recovers net energy.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://vaire.co/">Vaire</a></dd>
</dl>
</div>

<h2 id="physical">Physical — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits reversible and adiabatic computing at the Physical stage: reported energy-recovery proof of concept.</dd>
<dt>Evidence</dt><dd>Vaire reports a physical proof of concept for energy-recovery computing. The mark records that a relevant primitive has been built, while leaving the vendor’s efficiency claim open to independent measurement.</dd>
<dt>Criticism</dt><dd>A physical realization does not by itself establish system integration, efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://vaire.co/">Vaire</a></dd>
</dl>
</div>

<h2 id="integrated">Integrated — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits reversible and adiabatic computing only partially at the Integrated stage: early logic and clock integration.</dd>
<dt>Evidence</dt><dd>The proof of concept joins reversible or adiabatic logic with an energy-recovering clocking scheme. Integration remains partial because public evidence does not yet account for a complete memory, interconnect, control, and error-handling system.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: early logic and clock integration. A coherent system does not by itself establish efficient scaling, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://vaire.co/">Vaire</a></dd>
</dl>
</div>

## Stages not credited

No public evidence establishes system-scale composition, outsider access, or recurring operational use. These are exactly the stages at which clock loss, interconnect loss, latency, area, and error handling must be counted.

## Source

- [Vaire](https://vaire.co/)