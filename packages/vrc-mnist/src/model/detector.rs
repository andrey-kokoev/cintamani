use burn::tensor::{Tensor, backend::Backend};

use crate::physics::complex_field::ComplexField;

/// Ten fixed, non-overlapping detector tiles. There are no learned digital classifier weights.
pub fn detect<B: Backend>(field: &ComplexField<B>) -> Tensor<B, 2> {
    let intensity = field.intensity();
    let mut tiles = Vec::with_capacity(10);
    for index in 0..10 {
        let row = index / 5;
        let col = index % 5;
        let y0 = 2 + row * 12;
        let x0 = 1 + col * 5;
        let tile = intensity.clone().slice([
            0..intensity.dims()[0],
            0..intensity.dims()[1],
            y0..y0 + 4,
            x0..x0 + 4,
        ]);
        tiles.push(tile.mean_dims(&[1, 2, 3]).reshape([intensity.dims()[0], 1]));
    }
    Tensor::cat(tiles, 1)
}
