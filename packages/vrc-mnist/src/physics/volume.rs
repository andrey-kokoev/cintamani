use burn::{module::Module, tensor::backend::Backend};

use super::{
    complex_field::ComplexField,
    coupling::LocalComplexCoupling,
    noise::apply_loss,
    nonlinearity::{NonlinearResponse, SaturatingResponse},
};

#[derive(Module, Debug)]
pub struct Volume<B: Backend> {
    slices: Vec<LocalComplexCoupling<B>>,
    pub alpha: f32,
    pub transmission: f32,
    pub nonlinear: bool,
    pub coupling_scale: f32,
}

impl<B: Backend> Volume<B> {
    pub fn new(
        depth: usize,
        channels: usize,
        kernel: usize,
        alpha: f32,
        transmission: f32,
        nonlinear: bool,
        coupling_scale: f32,
        device: &B::Device,
    ) -> Self {
        let slices = (0..depth)
            .map(|_| LocalComplexCoupling::new(channels, kernel, device))
            .collect();
        Self {
            slices,
            alpha,
            transmission,
            nonlinear,
            coupling_scale,
        }
    }

    pub fn forward(&self, mut field: ComplexField<B>) -> ComplexField<B> {
        let response = SaturatingResponse {
            alpha: self.alpha,
            enabled: self.nonlinear,
        };
        for slice in &self.slices {
            field = slice.forward(field);
            field.re = field.re.mul_scalar(self.coupling_scale);
            field.im = field.im.mul_scalar(self.coupling_scale);
            field = response.respond(field);
            field.re = apply_loss(field.re, self.transmission);
            field.im = apply_loss(field.im, self.transmission);
        }
        field
    }
}
