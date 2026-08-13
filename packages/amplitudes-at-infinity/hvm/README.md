# HVM boundary

`planar_amplitude.hvm` is the concrete net design exported by the corrected
Rust experiment. It specifies the channel-token encoding, exact rational
Laurent atoms for `1/(X_e + z*w_e)`, canonical sparse addition, and the
construction of a shared triangulation sum.

The file is marked design-only because this run found no `hvm`, `hvm2`, or
`bend` executable on `PATH`. The Rust hash-consed reducer is the executed
symbolic comparison target. A future compatible HVM adapter must preserve the
declared channel ranks, integer `X_e`/`w_e` assignment, exponent window, exact
rational coefficient grouping, and trace boundary rather than silently
converting the experiment to floating point.

The declared `w_e` values are channel weights, not sourced g-vectors, and the
design does not reproduce published n=5/6/7 geometry.
