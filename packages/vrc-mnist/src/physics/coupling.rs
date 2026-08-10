use burn::{
    module::Module,
    nn::{
        PaddingConfig2d,
        conv::{Conv2d, Conv2dConfig},
    },
    tensor::{Tensor, backend::Backend},
};

use super::complex_field::ComplexField;

#[derive(Module, Debug)]
pub struct LocalComplexCoupling<B: Backend> {
    rr: Conv2d<B>,
    ri: Conv2d<B>,
    ir: Conv2d<B>,
    ii: Conv2d<B>,
}

impl<B: Backend> LocalComplexCoupling<B> {
    pub fn new(channels: usize, kernel: usize, device: &B::Device) -> Self {
        let make = || {
            Conv2dConfig::new([channels, channels], [kernel, kernel])
                .with_padding(PaddingConfig2d::Same)
                .with_bias(false)
                .init(device)
        };
        Self {
            rr: make(),
            ri: make(),
            ir: make(),
            ii: make(),
        }
    }

    pub fn forward(&self, field: ComplexField<B>) -> ComplexField<B> {
        let re = self.rr.forward(field.re.clone()) - self.ri.forward(field.im.clone());
        let im = self.ir.forward(field.re) + self.ii.forward(field.im);
        ComplexField::new(re, im)
    }

    pub fn forward_real(&self, field: Tensor<B, 4>) -> Tensor<B, 4> {
        self.rr.forward(field)
    }
}
