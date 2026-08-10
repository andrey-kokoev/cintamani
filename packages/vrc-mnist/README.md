# VRC MNIST falsification experiment

This crate tests whether a fixed local nonlinear complex-valued operator gains useful capability
when the same parameters and fixed-size state are given more recurrence time. It is not intended
to optimize MNIST accuracy.

## Reproducible commands

From this package directory:

```bash
cargo run --release -- train configs/clean.toml
cargo run --release -- eval artifacts/clean/model.mpk --config configs/clean.toml --recurrences 1,2,3,4,8,16,32
cargo run --release -- train configs/ablation_linear.toml
cargo run --release -- train-feed-forward configs/clean.toml --stages 4
```

Use `--seed N` on recurrent `train` and `eval` commands to produce isolated seed-suffixed runs.
Aggregate completed evaluations with:

```bash
cargo run --release -- aggregate \
  artifacts/clean_seed_1/evaluation.json \
  artifacts/clean_seed_2/evaluation.json \
  artifacts/clean_seed_3/evaluation.json \
  --output artifacts/clean_3seed
```

Burn caches MNIST locally after the first download. Every training run saves the effective TOML,
checkpoint, timing summary, and manifest. Evaluation writes CSV/JSON measurements, an SVG
accuracy curve, confusable-pair analysis, and amplitude/phase/detector trajectories.

## Baseline budgets

The one-pass control exactly matches the recurrent operator’s parameters and one-pass operations.
The independent-stage feed-forward control matches T passes of local operations but uses T distinct
parameter sets. Both exact counts are recorded; the project does not claim that this second control
simultaneously matches parameter count.

## Interpretation

Smoke and bounded pilot runs are labeled as such. See `docs/results.md` for current evidence,
including failures. Do not interpret infrastructure success as support for the VRC conjecture.
