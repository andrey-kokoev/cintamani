---
layout: ../../layouts/ArticleLayout.astro
title: "Interaction Nets: Implementation Evidence"
description: "Stage-by-stage evidence behind the interaction-nets row in the computing-paradigms implementation matrix."
date: "2026-08-11"
tags:
  - computing
  - interaction-nets
  - graph-rewriting
draft: false
---

# Interaction nets: implementation evidence

[← Return to the implementation matrix](/computing-paradigms/)

Interaction nets reduce a graph by applying local rewrite rules where agents meet. The matrix credits the executable model and software access; it does not infer hardware from the parallelism of the formalism.

| Stage | Mark | Summary |
|---|---:|---|
| Reference | ● | Executable interaction-net evaluators |
| Physical | — | No public purpose-built processor located |
| Integrated | — | No public device or system located |
| Scaled | — | No physical interconnect demonstrated |
| Access | ◐ | Open software on conventional CPUs and GPUs |
| Operational | — | No recurring dedicated-hardware use located |

<h2 id="reference">Reference — demonstrated</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits interaction nets at the Reference stage: executable interaction-net evaluators.</dd>
<dt>Evidence</dt><dd>HVM2 is an executable interaction-combinator evaluator with Rust, C, and CUDA modes. Vine supplies a higher-level language built around interaction-net evaluation. Together they expose semantics, compilation, and nontrivial execution on conventional machines. The mark says the computational model is runnable. It does not say that HVM2’s CPU or GPU host is an interaction-net processor.</dd>
<dt>Criticism</dt><dd>Executable semantics do not establish purpose-built hardware, integration, scale, external access, recurring use, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://github.com/HigherOrderCo/HVM2">HVM2 repository</a>; <a href="https://vine.dev/">Vine</a></dd>
</dl>
</div>

<h2 id="access">Access — limited</h2>

<div class="cell-evidence">
<dl>
<dt>Claim</dt><dd>The matrix credits interaction nets only partially at the Access stage: open software on conventional CPUs and GPUs.</dd>
<dt>Evidence</dt><dd>Anyone can obtain HVM2 and run or compile nets, and Vine publishes its language and documentation. This is real access to the model, but only through software hosted by conventional processors. It therefore receives the limited mark rather than hardware access.</dd>
<dt>Criticism</dt><dd>The mark is limited on the current public record: open software on conventional CPUs and GPUs. Access does not establish broad availability, recurring use, workload generality, or comparative advantage.</dd>
<dt>Sources</dt><dd><a href="https://github.com/HigherOrderCo/HVM2">HVM2 repository</a>; <a href="https://vine.dev/">Vine</a></dd>
</dl>
</div>

## Stages not credited

Tendrils says it is developing dedicated interaction-net hardware, but no physical processor, measured prototype, integrated system, or externally runnable device has been publicly documented. Those cells remain dashes until such evidence appears.

## Sources

- [HVM2 repository](https://github.com/HigherOrderCo/HVM2)
- [Vine](https://vine.dev/)
- [Tendrils](https://tendrils.co/)