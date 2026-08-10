use burn::tensor::backend::Backend;

use super::complex_field::ComplexField;

pub trait NonlinearResponse<B: Backend> {
    fn respond(&self, field: ComplexField<B>) -> ComplexField<B>;
}

#[derive(Clone, Copy, Debug)]
pub struct SaturatingResponse {
    pub alpha: f32,
    pub enabled: bool,
}

impl<B: Backend> NonlinearResponse<B> for SaturatingResponse {
    fn respond(&self, field: ComplexField<B>) -> ComplexField<B> {
        if !self.enabled {
            return field;
        }
        let denominator = field.intensity().mul_scalar(self.alpha).add_scalar(1.0);
        ComplexField::new(field.re / denominator.clone(), field.im / denominator)
    }
}
