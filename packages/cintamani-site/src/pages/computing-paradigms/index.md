---
layout: ../../layouts/ArticleLayout.astro
title: "Computing Paradigms"
description: "A substrate-neutral map of computational models, machine architectures, and physical embodiments from formal definition to operational deployment."
date: "2026-08-11"
tags:
  - computing
  - models-of-computation
  - computer-architecture
  - non-von-neumann
  - research
draft: false
---

# Computing Paradigms

A model of computation defines a computational step. An architecture organizes state, control, communication, and execution. A physical embodiment recruits a material process to realize one or more models. They belong in the same survey, but not in the same category.

“Models of Computation” would therefore be too narrow. Compute-in-memory and photonic computing, for example, are not complete formal models merely because they depart from the stored-program machine. “Computing Paradigms” covers models, architectures, and embodiments while keeping those distinctions visible.

The practical question is:

> Which alternatives to stored-program, von Neumann-style computation have progressed from formal proposal to physical demonstration, integration, scale, external access, and recurring use?

Status was checked on **2026-08-11**. Vendor milestones remain vendor reports unless independently reproduced.


## Maturity scale

The matrix uses the same substrate-neutral stages for every family:

1. **Reference** — an executable implementation exposes the semantics, usually on a conventional host.
2. **Physical** — a purpose-built system realizes the relevant primitive rather than merely simulating it.
3. **Integrated** — state, execution, communication, and control form a coherent device or system.
4. **Scaled** — many elements operate through a demonstrated composition or interconnect.
5. **Access** — outsiders can program or run the relevant implementation.
6. **Operational** — it performs recurring work beyond a one-off demonstration.

<div class="matrix-key" aria-label="Matrix status legend">
  <span><b class="matrix-state matrix-state--full" aria-hidden="true">●</b> demonstrated</span>
  <span><b class="matrix-state matrix-state--partial" aria-hidden="true">◐</b> limited, restricted, or specialized</span>
  <span><b class="matrix-state matrix-state--none" aria-hidden="true">—</b> no public evidence located</span>
  <span><b class="matrix-drilldown" aria-hidden="true">›</b> opens claim, evidence, criticism, and sources</span>
</div>

A mark records the strongest public implementation found. It does not transfer one project’s achievement to every machine using the same label.

## Execution models

These families primarily change what causes a computational step.

<p class="matrix-scroll-hint">Scroll horizontally to compare all six stages.</p>
<div class="matrix-scroll" role="region" aria-label="Execution-model implementation maturity" tabindex="0">
<table class="maturity-matrix">
  <thead>
    <tr>
      <th scope="col">Paradigm</th>
      <th scope="col">Reference</th>
      <th scope="col">Physical</th>
      <th scope="col">Integrated</th>
      <th scope="col">Scaled</th>
      <th scope="col">Access</th>
      <th scope="col">Operational</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row"><a href="#spatial-dataflow">Spatial dataflow</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/spatial-dataflow/#reference" aria-label="Open Reference details for Spatial dataflow: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/spatial-dataflow/#physical" aria-label="Open Physical details for Spatial dataflow: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/spatial-dataflow/#integrated" aria-label="Open Integrated details for Spatial dataflow: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/spatial-dataflow/#scaled" aria-label="Open Scaled details for Spatial dataflow: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/spatial-dataflow/#access" aria-label="Open Access details for Spatial dataflow: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/spatial-dataflow/#operational" aria-label="Open Operational details for Spatial dataflow: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
    <tr>
      <th scope="row"><a href="#interaction-nets">Interaction nets</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/interaction-nets/#reference" aria-label="Open Reference details for Interaction nets: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/interaction-nets/#access" aria-label="Open Access details for Interaction nets: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
    </tr>
    <tr>
      <th scope="row"><a href="#functional-graph-reduction">Functional graph reduction</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/functional-graph-reduction/#reference" aria-label="Open Reference details for Functional graph reduction: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/functional-graph-reduction/#physical" aria-label="Open Physical details for Functional graph reduction: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/functional-graph-reduction/#integrated" aria-label="Open Integrated details for Functional graph reduction: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/functional-graph-reduction/#access" aria-label="Open Access details for Functional graph reduction: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
    </tr>
    <tr>
      <th scope="row"><a href="#cellular-automata">Cellular automata</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/cellular-automata/#reference" aria-label="Open Reference details for Cellular automata: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/cellular-automata/#physical" aria-label="Open Physical details for Cellular automata: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/cellular-automata/#integrated" aria-label="Open Integrated details for Cellular automata: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/cellular-automata/#scaled" aria-label="Open Scaled details for Cellular automata: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/cellular-automata/#access" aria-label="Open Access details for Cellular automata: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/cellular-automata/#operational" aria-label="Open Operational details for Cellular automata: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
  </tbody>
</table>
</div>

<p class="matrix-caption">“Access” for interaction nets means access to software evaluators, not purpose-built hardware.</p>

## Architectural and physical paradigms

These families primarily change where state and work reside, or which physical dynamics perform the operation.

<p class="matrix-scroll-hint">Scroll horizontally to compare all six stages.</p>
<div class="matrix-scroll" role="region" aria-label="Architectural and physical implementation maturity" tabindex="0">
<table class="maturity-matrix">
  <thead>
    <tr>
      <th scope="col">Paradigm</th>
      <th scope="col">Reference</th>
      <th scope="col">Physical</th>
      <th scope="col">Integrated</th>
      <th scope="col">Scaled</th>
      <th scope="col">Access</th>
      <th scope="col">Operational</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row"><a href="#neuromorphic-and-spiking">Neuromorphic and spiking</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/neuromorphic-and-spiking/#reference" aria-label="Open Reference details for Neuromorphic and spiking: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/neuromorphic-and-spiking/#physical" aria-label="Open Physical details for Neuromorphic and spiking: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/neuromorphic-and-spiking/#integrated" aria-label="Open Integrated details for Neuromorphic and spiking: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/neuromorphic-and-spiking/#scaled" aria-label="Open Scaled details for Neuromorphic and spiking: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/neuromorphic-and-spiking/#access" aria-label="Open Access details for Neuromorphic and spiking: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/neuromorphic-and-spiking/#operational" aria-label="Open Operational details for Neuromorphic and spiking: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
    <tr>
      <th scope="row"><a href="#compute-in-memory">Compute-in-memory</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/compute-in-memory/#reference" aria-label="Open Reference details for Compute-in-memory: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/compute-in-memory/#physical" aria-label="Open Physical details for Compute-in-memory: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/compute-in-memory/#integrated" aria-label="Open Integrated details for Compute-in-memory: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/compute-in-memory/#scaled" aria-label="Open Scaled details for Compute-in-memory: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public access located">—</span></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/compute-in-memory/#operational" aria-label="Open Operational details for Compute-in-memory: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
    <tr>
      <th scope="row"><a href="#photonic-analog-computing">Photonic analog computing</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/photonic-analog-computing/#reference" aria-label="Open Reference details for Photonic analog computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/photonic-analog-computing/#physical" aria-label="Open Physical details for Photonic analog computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/photonic-analog-computing/#integrated" aria-label="Open Integrated details for Photonic analog computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/photonic-analog-computing/#scaled" aria-label="Open Scaled details for Photonic analog computing: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public access located">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No operational deployment located">—</span></td>
    </tr>
    <tr>
      <th scope="row"><a href="#thermodynamic-and-probabilistic">Thermodynamic and probabilistic</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/thermodynamic-and-probabilistic/#reference" aria-label="Open Reference details for Thermodynamic and probabilistic: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/thermodynamic-and-probabilistic/#physical" aria-label="Open Physical details for Thermodynamic and probabilistic: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/thermodynamic-and-probabilistic/#integrated" aria-label="Open Integrated details for Thermodynamic and probabilistic: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No broad scale demonstrated">—</span></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/thermodynamic-and-probabilistic/#access" aria-label="Open Access details for Thermodynamic and probabilistic: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No broad deployment">—</span></td>
    </tr>
    <tr>
      <th scope="row"><a href="#reversible-and-adiabatic">Reversible and adiabatic</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/reversible-and-adiabatic/#reference" aria-label="Open Reference details for Reversible and adiabatic: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/reversible-and-adiabatic/#physical" aria-label="Open Physical details for Reversible and adiabatic: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/reversible-and-adiabatic/#integrated" aria-label="Open Integrated details for Reversible and adiabatic: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public evidence">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public access">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No deployment">—</span></td>
    </tr>
    <tr>
      <th scope="row"><a href="#quantum-computing">Quantum computing</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/quantum-computing/#reference" aria-label="Open Reference details for Quantum computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/quantum-computing/#physical" aria-label="Open Physical details for Quantum computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/quantum-computing/#integrated" aria-label="Open Integrated details for Quantum computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/quantum-computing/#scaled" aria-label="Open Scaled details for Quantum computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/quantum-computing/#access" aria-label="Open Access details for Quantum computing: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/quantum-computing/#operational" aria-label="Open Operational details for Quantum computing: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
    <tr>
      <th scope="row"><a href="#molecular-and-chemical-computing">Molecular and chemical</a></th>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/molecular-and-chemical-computing/#reference" aria-label="Open Reference details for Molecular and chemical: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/molecular-and-chemical-computing/#physical" aria-label="Open Physical details for Molecular and chemical: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--full" href="/computing-paradigms/molecular-and-chemical-computing/#integrated" aria-label="Open Integrated details for Molecular and chemical: demonstrated. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">●</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No general scaled system">—</span></td>
      <td class="stage"><span class="matrix-state matrix-state--none" aria-label="No public system access">—</span></td>
      <td class="stage"><a class="matrix-cell-link matrix-state matrix-state--partial" href="/computing-paradigms/molecular-and-chemical-computing/#operational" aria-label="Open Operational details for Molecular and chemical: limited. Includes claim, evidence, criticism, and sources."><span class="matrix-status-mark" aria-hidden="true">◐</span><span class="matrix-drilldown" aria-hidden="true">›</span></a></td>
    </tr>
  </tbody>
</table>
</div>

## Evidence and open tests

Each entry uses the same four fields. “Next test” means the result that would materially strengthen or weaken the implementation claim.

<div class="paradigm-group">

<div class="paradigm-entry">
<h3 id="spatial-dataflow">Spatial dataflow</h3>
<dl>
<dt>Evidence</dt><dd>Dataflow graphs, Kahn process networks, and synchronous dataflow have mature software and FPGA toolchains. <a href="https://sambanova.ai/products/dataflow-architecture">SambaNova</a> and <a href="https://www.nextsilicon.com/">NextSilicon</a> report operational reconfigurable dataflow processors.</dd>
<dt>Embodiments</dt><dd>CMOS ASICs, FPGAs, systolic arrays, and coarse-grained reconfigurable arrays.</dd>
<dt>Boundary</dt><dd>Irregular control, mutable pointer structures, reconfiguration cost, and dependence on a stored-program host.</dd>
<dt>Next test</dt><dd>A broad workload suite running without application-specific rewriting or a supervisory conventional processor.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="interaction-nets">Interaction nets</h3>
<dl>
<dt>Evidence</dt><dd><a href="https://github.com/HigherOrderCo/HVM2">HVM2</a> and <a href="https://vine.dev/">Vine</a> execute the model on CPUs and GPUs. <a href="https://tendrils.co/">Tendrils</a> says it is building dedicated hardware, but has disclosed no physical demonstration.</dd>
<dt>Embodiments</dt><dd>Conventional digital processors currently executing a graph-rewriting abstract machine.</dd>
<dt>Boundary</dt><dd>Placement, allocation, routing, reuse, and readback of a dynamically changing graph.</dd>
<dt>Next test</dt><dd>A purpose-built core running nontrivial programs with measured energy, memory, and routing costs.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="functional-graph-reduction">Functional graph reduction</h3>
<dl>
<dt>Evidence</dt><dd><a href="https://researchportal.hw.ac.uk/en/publications/heron-modern-hardware-graph-reduction/">Heron</a> is an FPGA processor core for pure non-strict functional languages; <a href="https://haflang.github.io/">HAFLANG</a> continues the hardware line.</dd>
<dt>Embodiments</dt><dd>FPGA fabric and conventional processors.</dd>
<dt>Boundary</dt><dd>Allocation, garbage collection, locality, and dynamically varying parallelism.</dd>
<dt>Next test</dt><dd>A many-core reducer whose end-to-end gains survive allocation, communication, and collection.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="cellular-automata">Cellular automata</h3>
<dl>
<dt>Evidence</dt><dd>Universal variants are established, with purpose-built FPGA systems and <a href="https://www.nature.com/articles/s41467-023-38299-7">memristive in-memory demonstrations</a>.</dd>
<dt>Embodiments</dt><dd>FPGA, CMOS, and memristive arrays.</dd>
<dt>Boundary</dt><dd>Compiling ordinary algorithms into local rules while preserving locality; global communication and input/output.</dd>
<dt>Next test</dt><dd>A programmable system where useful algorithms remain local after compilation.</dd>
</dl>
</div>

</div>

<div class="paradigm-group">

<div class="paradigm-entry">
<h3 id="neuromorphic-and-spiking">Neuromorphic and spiking</h3>
<dl>
<dt>Evidence</dt><dd>Intel’s <a href="https://newsroom.intel.com/artificial-intelligence/intel-builds-worlds-largest-neuromorphic-system-to-enable-more-sustainable-ai">Hala Point</a> integrates 1,152 Loihi 2 processors for research workloads.</dd>
<dt>Embodiments</dt><dd>Digital CMOS, mixed-signal circuits, and emerging memory devices.</dd>
<dt>Boundary</dt><dd>Programming portability, training, numerical comparison, and workload generality.</dd>
<dt>Next test</dt><dd>Independently reproduced gains on tasks whose event structure was not selected to flatter the hardware.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="compute-in-memory">Compute-in-memory</h3>
<dl>
<dt>Evidence</dt><dd>IBM fabricated a <a href="https://research.ibm.com/publications/a-64-core-mixed-signal-in-memory-compute-chip-based-on-phase-change-memory-for-deep-neural-network-inference">64-core phase-change-memory inference chip</a>.</dd>
<dt>Embodiments</dt><dd>SRAM, phase-change memory, ReRAM, memristive arrays, and mixed-signal CMOS.</dd>
<dt>Boundary</dt><dd>Conversion overhead, precision, endurance, variability, and incomplete control semantics.</dd>
<dt>Next test</dt><dd>End-to-end gains including conversion, calibration, memory updates, and host coordination.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="photonic-analog-computing">Photonic analog computing</h3>
<dl>
<dt>Evidence</dt><dd>A <a href="https://www.nature.com/articles/s41566-024-01567-z">single-chip photonic neural network</a> has integrated optical matrix operations and nonlinear activation.</dd>
<dt>Embodiments</dt><dd>Silicon photonics, lasers, modulators, detectors, and optical memory elements.</dd>
<dt>Boundary</dt><dd>Electronic input/output, precision, nonlinearity, storage, calibration, and thermal stability.</dd>
<dt>Next test</dt><dd>An externally programmable system whose advantage includes electronic interfaces and control.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="thermodynamic-and-probabilistic">Thermodynamic and probabilistic</h3>
<dl>
<dt>Evidence</dt><dd><a href="https://extropic.ai/hardware">Extropic</a> reports X0 silicon and the XTR-0 prototype platform. <a href="https://www.normalcomputing.com/solutions/asics">Normal Computing</a> reports a 2025 CN101 tape-out. <a href="https://github.com/extropic-ai/thrml">THRML</a> provides a conventional reference environment.</dd>
<dt>Embodiments</dt><dd>Stochastic CMOS, with magnetic and other noisy devices also under investigation.</dd>
<dt>Boundary</dt><dd>Narrow sampling semantics, calibration, scaling, and limited independent measurement.</dd>
<dt>Next test</dt><dd>Reproducible application-level advantage on externally selected distributions and workloads.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="reversible-and-adiabatic">Reversible and adiabatic</h3>
<dl>
<dt>Evidence</dt><dd><a href="https://vaire.co/">Vaire</a> reports an energy-recovery proof of concept; no externally accessible system has been disclosed.</dd>
<dt>Embodiments</dt><dd>CMOS adiabatic logic, with superconducting implementations also proposed.</dd>
<dt>Boundary</dt><dd>Clock and interconnect losses, area, latency, errors, and incomplete system-level energy accounting.</dd>
<dt>Next test</dt><dd>Net energy recovery at system scale after control, memory, communication, and error handling.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="quantum-computing">Quantum computing</h3>
<dl>
<dt>Evidence</dt><dd>Circuit, measurement, and annealing models have physical systems and mature software stacks; IBM reports a decade of <a href="https://newsroom.ibm.com/2026-05-04-ibm-a-decade-of-quantum-on-the-cloud">cloud-accessible quantum processors</a>.</dd>
<dt>Embodiments</dt><dd>Superconducting circuits, trapped ions, neutral atoms, photons, and annealing systems.</dd>
<dt>Boundary</dt><dd>Error correction, control overhead, data loading, and useful advantage.</dd>
<dt>Next test</dt><dd>A reproducible application advantage including error correction and classical orchestration costs.</dd>
</dl>
</div>

<div class="paradigm-entry">
<h3 id="molecular-and-chemical-computing">Molecular and chemical computing</h3>
<dl>
<dt>Evidence</dt><dd>Chemical-reaction and strand-displacement calculi have physical realizations, including <a href="https://pubs.acs.org/doi/10.1021/jacs.4c07221">enzyme-powered DNA computing networks</a>.</dd>
<dt>Embodiments</dt><dd>DNA, enzymes, molecular reactions, and surface-confined systems.</dd>
<dt>Boundary</dt><dd>Latency, reset, error, cascading depth, automation, and electronic readout.</dd>
<dt>Next test</dt><dd>A reusable molecular system executing several nontrivial programs without manual laboratory reconstruction.</dd>
</dl>
</div>

</div>

## Reading the result

A physical demonstration establishes that a primitive can exist. It does not establish programmability, scaling, economy, or superiority. Absence of a custom device does not refute a model; it identifies the next criticism the model has not survived.

The comparison is not about exoticness. The relevant question is whether an advantage survives representation, execution, communication, control, and readout.