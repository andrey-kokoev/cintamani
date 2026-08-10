# What survived

The experimental machinery survived. The Rust/Burn WGPU implementation trains a local complex-valued
operator through strictly shared recurrence, freezes it, reloads it, and evaluates the identical
parameters and 2×28×28 state at T=1,2,4,8,16,32. Every run records configuration, seed, parameter
count, timing, accuracy, loss, entropy/confidence, confusion matrix, transition direction, state
change, state norm, and representative amplitude/phase/detector trajectories.

The final frozen-substrate suite used three seeds and thirteen conditions per seed: clean, four
Gaussian severities, four occlusion severities, and four structured corruptions. Linear, one-pass,
eight-stage local feed-forward, and eight-stage unshared-recurrent controls are all present. The
matrix-free entropy analysis is joined to the task-state measurements. `controls_complete` is true
in `output/recursive-mnist-summary.json`.

One earlier full-data nonlinear run (60,000 training / 10,000 test examples, five epochs) showed a
real but bounded transient improvement: accuracy was 10.86%, 17.12%, 19.52%, 19.64%, 18.48%,
14.09%, and 13.41% at T=1,2,3,4,8,16,32. This establishes that recurrence can alter capability;
it does not establish systematic scaling.

# What failed

The governing conjecture did not survive this experiment. The consolidated decision is **REJECT**.
Across the three-seed frozen primary suite:

- net wrong→correct minus correct→wrong transitions were −129 (276 corrections versus 405 regressions);
- mean clean gain from T=1 to T=32 was only +0.0013;
- mean gain on harder recoverable corruptions was −0.0037;
- mean gain beyond the trained horizon, T=8 to T=32, was only +0.0003;
- 1,122,893 confidence-amplification events were recorded while net corrections were negative, so
  confidence growth generally did not reflect error removal.

The mandatory controls reinforce that conclusion. The full-data one-pass-trained machine reached
24.54%, above the recurrent model’s 19.64% peak. The full strict-linear recurrent control reached
20.00% at T=4, slightly exceeding the nonlinear peak, then became unstable: cross-entropy reached
20.88 at T=16 and 24.97 at T=32. Thus removing nonlinearity had no meaningful peak penalty.

In the final three-seed baseline suite, the eight-stage independent local feed-forward control
reached 21.3%, 19.5%, and 18.7%, while the shared recurrent primary remained near chance. The
eight-stage unshared recurrent control also remained near chance with very high loss. A
Gaussian-trained checkpoint failed on unseen 40% occlusion and fell to 8.30% at T=32. Harder inputs
did not obtain a larger recurrence advantage, and recurrence did not learn general correction
dynamics.

# What experiment should come next

Do not advance to compositional MNIST under the current go/no-go rule. The next experiment should
modify the substrate dynamics before adding task complexity:

1. constrain or parameterize the recurrent Jacobian so long trajectories remain stable;
2. preserve phase and amplitude information without collapsing useful modes;
3. train explicit correction dynamics with a criterion that rewards wrong→right transitions and
   penalizes right→wrong transitions;
4. require nonlinear and shared-recurrence advantages over matched controls across at least three
   seeds before rerunning the corruption ladder;
5. repeat the same frozen-operator T sweep and reject again unless harder held-out inputs gain more
   than easy inputs.

Only after those gates pass should the project attempt compositional expressions. The current
evidence does not justify that investment.
