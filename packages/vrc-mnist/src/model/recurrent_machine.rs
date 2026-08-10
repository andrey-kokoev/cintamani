use burn::{
    module::Module,
    tensor::{Tensor, backend::Backend},
};

use super::detector::detect;
use crate::physics::{complex_field::ComplexField, volume::Volume};

#[derive(Clone, Debug)]
pub struct Trajectory<B: Backend> {
    pub states: Vec<ComplexField<B>>,
    pub logits: Vec<Tensor<B, 2>>,
    pub state_differences: Vec<Tensor<B, 1>>,
    pub norm_proxies: Vec<Tensor<B, 1>>,
}

#[derive(Module, Debug)]
pub struct RecurrentMachine<B: Backend> {
    pub volume: Volume<B>,
    pub q_injection: f32,
    pub residual_gamma: f32,
}

impl<B: Backend> RecurrentMachine<B> {
    pub fn new(
        depth: usize,
        kernel: usize,
        alpha: f32,
        transmission: f32,
        q_injection: f32,
        nonlinear: bool,
        residual_gamma: f32,
        coupling_scale: f32,
        device: &B::Device,
    ) -> Self {
        Self {
            volume: Volume::new(
                depth,
                1,
                kernel,
                alpha,
                transmission,
                nonlinear,
                coupling_scale,
                device,
            ),
            q_injection,
            residual_gamma,
        }
    }

    pub fn forward(&self, q: Tensor<B, 4>, recurrences: usize) -> Trajectory<B> {
        assert!(recurrences > 0);
        let zeros = q.zeros_like();
        let mut state = ComplexField::new(q.clone(), zeros);
        let mut states = vec![state.clone()];
        let mut logits = Vec::with_capacity(recurrences);
        let mut state_differences = Vec::with_capacity(recurrences);
        let mut norm_proxies = Vec::with_capacity(recurrences);
        for _ in 0..recurrences {
            let previous = state.clone();
            state.re = state.re + q.clone().mul_scalar(self.q_injection);
            let evolved = self.volume.forward(state.clone()); // exactly the same Volume and parameters each pass
            state = ComplexField::new(
                state.re.mul_scalar(1.0 - self.residual_gamma)
                    + evolved.re.mul_scalar(self.residual_gamma),
                state.im.mul_scalar(1.0 - self.residual_gamma)
                    + evolved.im.mul_scalar(self.residual_gamma),
            );
            state_differences.push(state.difference(&previous));
            norm_proxies.push(state.norm_proxy());
            logits.push(detect(&state));
            states.push(state.clone());
        }
        Trajectory {
            states,
            logits,
            state_differences,
            norm_proxies,
        }
    }

    pub fn parameter_count(&self) -> usize {
        self.num_params()
    }
}
