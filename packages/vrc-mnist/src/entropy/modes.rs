use super::configuration::{EntropyConfig, OperatorKind};
use rand::{Rng, SeedableRng, rngs::StdRng};

/// Probe-compatible contract: physical implementations can supply measured output
/// fields here without exposing a microscopic transmission matrix.
pub trait StateOperator {
    fn dimension(&self) -> usize;
    fn step(&self, state: &[f64], input: &[f64]) -> Vec<f64>;
    fn noise_std(&self) -> f64 {
        0.0
    }
    fn analytic_vjp(&self, _cotangent: &[f64]) -> Option<Vec<f64>> {
        None
    }
}

pub struct ReferenceOperator {
    n: usize,
    kind: OperatorKind,
    scalar: f64,
    rank: usize,
    noise: f64,
}
impl ReferenceOperator {
    pub fn new(cfg: &EntropyConfig) -> Self {
        Self {
            n: cfg.state_dimension(),
            kind: cfg.operator.clone(),
            scalar: cfg.scalar.unwrap_or(1.0),
            rank: cfg.rank.unwrap_or(1).min(cfg.state_dimension()),
            noise: cfg.noise.unwrap_or(0.0),
        }
    }
}
impl StateOperator for ReferenceOperator {
    fn dimension(&self) -> usize {
        self.n
    }
    fn step(&self, state: &[f64], _input: &[f64]) -> Vec<f64> {
        match self.kind {
            OperatorKind::Identity | OperatorKind::NoisyIdentity => state.to_vec(),
            OperatorKind::Contraction | OperatorKind::Expansion => {
                state.iter().map(|x| self.scalar * x).collect()
            }
            OperatorKind::Unitary => {
                let mut y = vec![0.0; self.n];
                for i in (0..self.n).step_by(2) {
                    if i + 1 < self.n {
                        y[i] = -state[i + 1];
                        y[i + 1] = state[i]
                    } else {
                        y[i] = state[i]
                    }
                }
                y
            }
            OperatorKind::LowRank => state
                .iter()
                .enumerate()
                .map(|(i, x)| if i < self.rank { *x } else { 0.0 })
                .collect(),
            OperatorKind::Period2 => state.iter().map(|x| -x).collect(),
            OperatorKind::Period4 => {
                let mut y = vec![0.0; self.n];
                for i in (0..self.n).step_by(2) {
                    if i + 1 < self.n {
                        y[i] = -state[i + 1];
                        y[i + 1] = state[i]
                    } else {
                        y[i] = -state[i]
                    }
                }
                y
            }
            _ => state.to_vec(),
        }
    }
    fn noise_std(&self) -> f64 {
        self.noise
    }
    fn analytic_vjp(&self, c: &[f64]) -> Option<Vec<f64>> {
        let y = match self.kind {
            OperatorKind::Identity | OperatorKind::NoisyIdentity => c.to_vec(),
            OperatorKind::Contraction | OperatorKind::Expansion => {
                c.iter().map(|x| self.scalar * x).collect()
            }
            OperatorKind::Unitary | OperatorKind::Period4 => {
                let mut y = vec![0.0; self.n];
                for i in (0..self.n).step_by(2) {
                    if i + 1 < self.n {
                        y[i] = c[i + 1];
                        y[i + 1] = -c[i]
                    } else {
                        y[i] = c[i]
                    }
                }
                y
            }
            OperatorKind::LowRank => c
                .iter()
                .enumerate()
                .map(|(i, x)| if i < self.rank { *x } else { 0.0 })
                .collect(),
            OperatorKind::Period2 => c.iter().map(|x| -x).collect(),
            _ => return None,
        };
        Some(y)
    }
}

pub fn operator_from_config(cfg: &EntropyConfig) -> Box<dyn StateOperator> {
    match cfg.operator {
        OperatorKind::Volume | OperatorKind::Residual => Box::new(SimulatedVolume::new(cfg)),
        _ => Box::new(ReferenceOperator::new(cfg)),
    }
}

pub struct SimulatedVolume {
    width: usize,
    height: usize,
    alpha: f64,
    transmission: f64,
    q_injection: f64,
    nonlinear: bool,
    residual_gamma: f64,
    noise: f64,
    kernels: Vec<Vec<[f64; 4]>>,
}

impl SimulatedVolume {
    pub fn new(cfg: &EntropyConfig) -> Self {
        let mut rng = StdRng::seed_from_u64(cfg.seed);
        let scale = cfg.coupling_scale.unwrap_or(1.0) / (cfg.kernel_size * cfg.kernel_size) as f64;
        let kernels = (0..cfg.depth)
            .map(|_| {
                (0..cfg.kernel_size * cfg.kernel_size)
                    .map(|_| {
                        [
                            rng.random_range(-scale..scale),
                            rng.random_range(-scale..scale),
                            rng.random_range(-scale..scale),
                            rng.random_range(-scale..scale),
                        ]
                    })
                    .collect()
            })
            .collect();
        Self {
            width: cfg.width,
            height: cfg.height,
            alpha: cfg.alpha,
            transmission: cfg.transmission,
            q_injection: cfg.q_injection,
            nonlinear: cfg.nonlinear,
            residual_gamma: cfg.residual_gamma.unwrap_or(1.0),
            noise: cfg.noise.unwrap_or(0.0),
            kernels,
        }
    }
}

impl StateOperator for SimulatedVolume {
    fn dimension(&self) -> usize {
        self.width * self.height * 2
    }
    fn step(&self, state: &[f64], input: &[f64]) -> Vec<f64> {
        let plane = self.width * self.height;
        let mut current: Vec<f64> = state
            .iter()
            .zip(input)
            .map(|(s, q)| s + self.q_injection * q)
            .collect();
        for kernel in &self.kernels {
            let side = (kernel.len() as f64).sqrt() as isize;
            let radius = side / 2;
            let mut next = vec![0.0; current.len()];
            for y in 0..self.height {
                for x in 0..self.width {
                    let p = y * self.width + x;
                    for ky in 0..side {
                        for kx in 0..side {
                            let xx =
                                (x as isize + kx - radius).rem_euclid(self.width as isize) as usize;
                            let yy = (y as isize + ky - radius).rem_euclid(self.height as isize)
                                as usize;
                            let j = yy * self.width + xx;
                            let w = kernel[(ky * side + kx) as usize];
                            next[p] += w[0] * current[j] - w[1] * current[plane + j];
                            next[plane + p] += w[2] * current[j] + w[3] * current[plane + j];
                        }
                    }
                    if self.nonlinear {
                        let d = 1.0
                            + self.alpha * (next[p] * next[p] + next[plane + p] * next[plane + p]);
                        next[p] /= d;
                        next[plane + p] /= d;
                    }
                    next[p] *= self.transmission;
                    next[plane + p] *= self.transmission;
                }
            }
            current = next;
        }
        state
            .iter()
            .zip(current)
            .map(|(old, new)| (1.0 - self.residual_gamma) * old + self.residual_gamma * new)
            .collect()
    }
    fn noise_std(&self) -> f64 {
        self.noise
    }
}

pub fn raw_modal_estimate(cfg: &EntropyConfig) -> Option<f64> {
    Some(
        8.0 * std::f64::consts::PI * cfg.refractive_index?.powi(3) * cfg.volume_m3?
            / cfg.wavelength_m?.powi(3)
            * cfg.fractional_bandwidth?,
    )
}
