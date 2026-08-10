# Brief completion audit

| Requirement | Evidence | Status |
| --- | --- | --- |
| Rust, Burn, WGPU, cached local MNIST, CLI configs | `Cargo.toml`, `src/main.rs`, `src/data/mnist.rs`, committed TOML configs | Complete |
| Complex fixed-size optical state | `ComplexField` uses explicit real/imaginary channels; tested complex multiplication; state remains 2×28×28 | Complete |
| Local volumetric physical operator | Local 3×3 coupling slices, phase/amplitude mixing, loss, saturation, small channel count; no dense classifier | Complete |
| Genuine nonlinear response and linear ablation | Isolated `NonlinearResponse`; nonlinear and strict-linear checkpoints/evaluations | Complete |
| One operator reused at every recurrence | One `Volume` instance in `RecurrentMachine`; parameter-sharing/fixed-state test | Complete |
| Persistent question input | Configurable Q injection in every recurrent step | Complete |
| Physical detector output | Ten fixed square-law intensity regions, no learned digital head | Complete |
| Variable-T end-to-end training | Seeded schedule over T=1,2,4,8; intermediate and final cross-entropy; autodiff/Adam | Complete |
| Frozen T sweep | Same checkpoints evaluated at T=1,2,4,8,16,32; additional early T values in full clean run | Complete |
| Clean, noise, occlusion, ambiguity, unseen corruption | 39 three-seed condition runs; four Gaussian and four occlusion severities; confusion/pair reports; structured held-out families | Complete |
| Mandatory baselines | One pass, strict-linear recurrence, local independent feed-forward, plus unshared recurrence | Complete |
| Required measurements | 234 task rows plus transition/state/corruption tables; timing and parameter metadata retained with runs | Complete |
| Representative complex trajectories | Automatic success/failure/flip/convergence/cycle selection; amplitude, phase, detector frames at T=0,1,2,4,8,16 | Complete |
| Physical mapping discipline | `docs/physical_mapping.md` identifies every model primitive and confidence | Complete |
| Reproducible artifacts | Per-run CSV/JSON/SVG/checkpoints/configs plus consolidated CSV/JSON/Markdown outputs | Complete |
| Exactly three top-level conclusions | `docs/results.md`: What survived, What failed, What experiment should come next | Complete |
| Go/no-go decision | `output/recursive-mnist-summary.json`: controls complete, decision `reject`; no compositional advance | Complete |

Final verification gates: `cargo fmt --all -- --check`, `cargo test --all-targets`, `pnpm check`, and
`pnpm test`. Nine Rust tests pass, including parameter sharing, fixed state shape, explicit complex
multiplication, seeded corruption, configuration validation, and entropy estimator controls.
