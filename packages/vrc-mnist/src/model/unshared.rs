use super::{detector::detect, recurrent_machine::Trajectory};
use crate::physics::{complex_field::ComplexField, volume::Volume};
use burn::{
    module::Module,
    tensor::{Tensor, backend::Backend},
};

/// Control C: recurrence-shaped computation with independent parameters at each step.
#[derive(Module, Debug)]
pub struct UnsharedRecurrent<B: Backend> {
    volumes: Vec<Volume<B>>,
    q_injection: f32,
    residual_gamma: f32,
}
impl<B: Backend> UnsharedRecurrent<B> {
    pub fn new(
        steps: usize,
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
            volumes: (0..steps)
                .map(|_| {
                    Volume::new(
                        depth,
                        1,
                        kernel,
                        alpha,
                        transmission,
                        nonlinear,
                        coupling_scale,
                        device,
                    )
                })
                .collect(),
            q_injection,
            residual_gamma,
        }
    }
    pub fn forward(&self, q: Tensor<B, 4>, recurrences: usize) -> Trajectory<B> {
        assert!(recurrences > 0 && recurrences <= self.volumes.len());
        let mut state = ComplexField::new(q.clone(), q.zeros_like());
        let mut states = vec![state.clone()];
        let mut logits = Vec::new();
        let mut state_differences = Vec::new();
        let mut norm_proxies = Vec::new();
        for volume in self.volumes.iter().take(recurrences) {
            let previous = state.clone();
            state.re = state.re + q.clone().mul_scalar(self.q_injection);
            let evolved = volume.forward(state.clone());
            state = ComplexField::new(
                state.re.mul_scalar(1.0 - self.residual_gamma)
                    + evolved.re.mul_scalar(self.residual_gamma),
                state.im.mul_scalar(1.0 - self.residual_gamma)
                    + evolved.im.mul_scalar(self.residual_gamma),
            );
            state_differences.push(state.difference(&previous));
            norm_proxies.push(state.norm_proxy());
            logits.push(detect(&state));
            states.push(state.clone())
        }
        Trajectory {
            states,
            logits,
            state_differences,
            norm_proxies,
        }
    }
}
