use super::detector::detect;
use crate::physics::{complex_field::ComplexField, volume::Volume};
use burn::{
    module::Module,
    tensor::{Tensor, backend::Backend},
};

/// Locally connected control. Independent volumes spend a matched number of local operations.
#[derive(Module, Debug)]
pub struct FeedForwardMatched<B: Backend> {
    stages: Vec<Volume<B>>,
}

impl<B: Backend> FeedForwardMatched<B> {
    pub fn new(
        stages: usize,
        depth: usize,
        kernel: usize,
        alpha: f32,
        transmission: f32,
        coupling_scale: f32,
        device: &B::Device,
    ) -> Self {
        Self {
            stages: (0..stages)
                .map(|_| {
                    Volume::new(
                        depth,
                        1,
                        kernel,
                        alpha,
                        transmission,
                        true,
                        coupling_scale,
                        device,
                    )
                })
                .collect(),
        }
    }
    pub fn forward(&self, q: Tensor<B, 4>) -> Tensor<B, 2> {
        let mut state = ComplexField::new(q.clone(), q.zeros_like());
        for stage in &self.stages {
            state = stage.forward(state);
        }
        detect(&state)
    }
}
