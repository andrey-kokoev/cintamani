# Physical mapping

| Software primitive | Physical interpretation | Confidence |
| --- | --- | --- |
| 3×3 convolutional stencil | local optical coupling/diffraction | high |
| explicit two-channel complex arithmetic | phase/amplitude interaction | high |
| intensity-dependent saturation | nonlinear material response | medium |
| shared-volume recurrence | optical recirculation/cavity | high |
| persistent Q injection | continuing illumination/input coupling | medium |
| multiplicative transmission | propagation loss | high |
| fixed regional intensity integration | square-law photodetectors | high |

The feed-forward control uses the same local slice primitives but separate physical volumes. No dense
spatial transform or learned digital classifier is permitted. The scalar saturation coefficient and
uniform transmission are idealizations; both must ultimately be replaced by measured response curves.

