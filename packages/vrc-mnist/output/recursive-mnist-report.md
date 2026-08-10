# Recursive MNIST Report

## 1. Primary Result

Decision: **REJECT**. Mean clean gain T1→T32: 0.0013; hard recoverable gain: -0.0037.

## 2. Evidence for Useful Recurrence

Net wrong→correct minus correct→wrong transitions: -129. Gain beyond the trained horizon (T8→T32): 0.0003. These weak signals do not satisfy the preset criteria.

## 3. Evidence Against Useful Recurrence

Hard inputs benefited less than clean inputs. Confidence amplifications: 1122893; true corrections: 276. The entropy probe detected cycle period Null.

## 4. Relationship to Entropy Metrics

`state-dynamics.csv` joins task-state change/norm to matrix-free rank and perturbation-survival probes of the frozen substrate. Classification loss grows while the state continues evolving, so nontrivial dynamics were not useful computation.

## 5. Baseline Comparison

12 baseline rows; controls complete: true. Mean T32 linear accuracy 0.0917; T8 feed-forward 0.1983; T8 unshared 0.0700.

## 6. Falsification Status

The fixed-regime MNIST test weakens the conjecture: net corrections are negative, difficult-input gain is negative, confidence changes dominate corrections, and the nonlinear shared operator does not outperform controls.

## 7. Advance / Modify / Reject

**REJECT** — do not advance to compositional arithmetic.
