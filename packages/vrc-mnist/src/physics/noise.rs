use burn::tensor::{Tensor, backend::Backend};

pub fn apply_loss<B: Backend>(field: Tensor<B, 4>, transmission: f32) -> Tensor<B, 4> {
    field.mul_scalar(transmission.clamp(0.0, 1.0))
}
