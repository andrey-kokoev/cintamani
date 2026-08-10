use crate::config::{Backend, Config, Observation};
use anyhow::{Result, bail};
use num_complex::Complex64;
use rand::{Rng, SeedableRng, rngs::StdRng};
use rand_distr::{Distribution, StandardNormal};
use serde::Serialize;
use std::f64::consts::TAU;

#[derive(Clone, Debug, Default, Serialize)]
pub struct ResourceUsage {
    pub elapsed_time: f64,
    pub incident_pump_energy: f64,
    pub incident_signal_energy: f64,
    pub coupled_drive_energy: f64,
    pub intrinsic_dissipation_energy: f64,
    pub external_outcoupling_energy: f64,
    pub expected_injected_noise_energy: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct Simulation {
    pub inputs: Vec<f64>,
    pub observations: Vec<Vec<f64>>,
    pub state_power: Vec<f64>,
    pub thermal_state: Vec<f64>,
    pub resources: ResourceUsage,
}

#[derive(Clone, Debug)]
struct Derivative {
    modes: Vec<Complex64>,
    thermal: f64,
}

/// A finite-mode, normalized driven Kerr resonator.
///
/// Mode labels are the centered integers `-modes/2 ..= modes/2`.  The direct
/// and pseudospectral backends evaluate the same Galerkin-truncated cubic
/// operator; the latter uses an explicitly zero-padded angular grid so that
/// circular convolution cannot alias back into the retained window.
#[derive(Clone, Debug)]
pub struct KerrSystem {
    config: Config,
    mode_labels: Vec<isize>,
}

impl KerrSystem {
    pub fn new(config: &Config) -> Self {
        let half = (config.modes / 2) as isize;
        Self {
            config: config.clone(),
            mode_labels: (-half..=half).collect(),
        }
    }

    pub fn zero_state(&self) -> Vec<Complex64> {
        vec![Complex64::new(0.0, 0.0); self.config.modes]
    }

    pub fn mode_labels(&self) -> &[isize] {
        &self.mode_labels
    }

    pub fn nonlinear_term(&self, state: &[Complex64], backend: Backend) -> Vec<Complex64> {
        assert_eq!(state.len(), self.config.modes);
        match backend {
            Backend::DirectModal => self.direct_nonlinear_term(state),
            Backend::Pseudospectral => self.pseudospectral_nonlinear_term(state),
        }
    }

    fn direct_nonlinear_term(&self, state: &[Complex64]) -> Vec<Complex64> {
        let n = state.len();
        let half = (n / 2) as isize;
        let mut result = vec![Complex64::new(0.0, 0.0); n];

        for (p, &a_p) in state.iter().enumerate() {
            let mu_p = p as isize - half;
            for (q, &a_q) in state.iter().enumerate() {
                let mu_q = q as isize - half;
                for (r, &a_r) in state.iter().enumerate() {
                    let mu_r = r as isize - half;
                    let target = mu_p + mu_q - mu_r;
                    if (-half..=half).contains(&target) {
                        result[(target + half) as usize] += a_p * a_q * a_r.conj();
                    }
                }
            }
        }
        result
    }

    fn pseudospectral_nonlinear_term(&self, state: &[Complex64]) -> Vec<Complex64> {
        let n = state.len();
        // The cubic spectrum lies in [-3h, 3h].  A grid longer than 4h keeps
        // all aliases of requested coefficients [-h, h] outside that support.
        let grid_len = 4 * n;
        let mut field = vec![Complex64::new(0.0, 0.0); grid_len];

        for (j, value) in field.iter_mut().enumerate() {
            let theta = TAU * j as f64 / grid_len as f64;
            for (&mu, &amplitude) in self.mode_labels.iter().zip(state) {
                *value += amplitude * Complex64::from_polar(1.0, mu as f64 * theta);
            }
        }

        let cubic: Vec<_> = field
            .into_iter()
            .map(|value| value.norm_sqr() * value)
            .collect();
        let normalization = 1.0 / grid_len as f64;

        self.mode_labels
            .iter()
            .map(|&mu| {
                cubic
                    .iter()
                    .enumerate()
                    .map(|(j, &value)| {
                        let theta = TAU * j as f64 / grid_len as f64;
                        value * Complex64::from_polar(1.0, -(mu as f64) * theta)
                    })
                    .sum::<Complex64>()
                    * normalization
            })
            .collect()
    }

    pub fn rhs(
        &self,
        state: &[Complex64],
        thermal: f64,
        input: f64,
        backend: Backend,
    ) -> (Vec<Complex64>, f64) {
        let derivative = self.derivative(state, thermal, input, backend);
        (derivative.modes, derivative.thermal)
    }

    fn derivative(
        &self,
        state: &[Complex64],
        thermal: f64,
        input: f64,
        backend: Backend,
    ) -> Derivative {
        let nonlinear = self.nonlinear_term(state, backend);
        let loss = self.config.total_loss();
        let coupling = self.config.external_coupling.sqrt();
        let half = (self.config.modes / 2) as isize;

        let modes = state
            .iter()
            .zip(nonlinear)
            .zip(self.mode_labels.iter())
            .map(|((&amplitude, cubic), &mu)| {
                let phase_rate = self.config.detuning
                    - thermal
                    - 0.5 * self.config.dispersion * (mu * mu) as f64;
                let linear = Complex64::new(-0.5 * loss, phase_rate) * amplitude;
                let kerr = Complex64::new(0.0, self.config.kerr_strength) * cubic;
                let mut drive = 0.0;
                if mu == 0 {
                    drive += self.config.pump_amplitude;
                }
                if mu == self.config.input_mode {
                    drive += self.config.input_scale * input;
                }
                linear + kerr + Complex64::new(coupling * drive, 0.0)
            })
            .collect();

        debug_assert_eq!(self.mode_labels[half as usize], 0);
        let power: f64 = state.iter().map(|value| value.norm_sqr()).sum();
        let thermal_derivative =
            self.config.thermal_coupling * power - self.config.thermal_decay * thermal;
        Derivative {
            modes,
            thermal: thermal_derivative,
        }
    }

    fn step_rk4(
        &self,
        state: &mut [Complex64],
        thermal: &mut f64,
        input: f64,
        noise_rng: &mut StdRng,
    ) {
        let dt = self.config.dt;
        let k1 = self.derivative(state, *thermal, input, self.config.backend);

        let state_2 = add_scaled(state, &k1.modes, 0.5 * dt);
        let k2 = self.derivative(
            &state_2,
            *thermal + 0.5 * dt * k1.thermal,
            input,
            self.config.backend,
        );

        let state_3 = add_scaled(state, &k2.modes, 0.5 * dt);
        let k3 = self.derivative(
            &state_3,
            *thermal + 0.5 * dt * k2.thermal,
            input,
            self.config.backend,
        );

        let state_4 = add_scaled(state, &k3.modes, dt);
        let k4 = self.derivative(
            &state_4,
            *thermal + dt * k3.thermal,
            input,
            self.config.backend,
        );

        for (index, amplitude) in state.iter_mut().enumerate() {
            *amplitude += dt
                * (k1.modes[index]
                    + 2.0 * k2.modes[index]
                    + 2.0 * k3.modes[index]
                    + k4.modes[index])
                / 6.0;
        }
        *thermal += dt * (k1.thermal + 2.0 * k2.thermal + 2.0 * k3.thermal + k4.thermal) / 6.0;

        if self.config.noise_std > 0.0 {
            let scale = self.config.noise_std * dt.sqrt();
            for amplitude in state {
                let real: f64 = StandardNormal.sample(noise_rng);
                let imaginary: f64 = StandardNormal.sample(noise_rng);
                *amplitude += Complex64::new(scale * real, scale * imaginary);
            }
        }
    }

    fn observe(&self, state: &[Complex64], input: f64) -> Vec<f64> {
        let coupling = self.config.external_coupling.sqrt();
        let output: Vec<_> = state
            .iter()
            .zip(self.mode_labels.iter())
            .map(|(&amplitude, &mu)| {
                let mut incident = 0.0;
                if mu == 0 {
                    incident += self.config.pump_amplitude;
                }
                if mu == self.config.input_mode {
                    incident += self.config.input_scale * input;
                }
                Complex64::new(incident, 0.0) - coupling * amplitude
            })
            .collect();

        match self.config.observation {
            Observation::Intensity => output.iter().map(|value| value.norm_sqr()).collect(),
            Observation::Quadrature => output
                .iter()
                .flat_map(|value| [value.re, value.im])
                .collect(),
            Observation::Both => output
                .iter()
                .flat_map(|value| [value.norm_sqr(), value.re, value.im])
                .collect(),
        }
    }

    pub fn simulate(&self) -> Result<Simulation> {
        let mut input_rng = StdRng::seed_from_u64(self.config.seed);
        let mut noise_rng = StdRng::seed_from_u64(self.config.seed ^ 0xa076_1d64_78bd_642f);
        let mut state = self.zero_state();
        let mut thermal = 0.0;
        let total_symbols = self.config.warmup_symbols + self.config.sample_symbols;
        let mut inputs = Vec::with_capacity(self.config.sample_symbols);
        let mut observations = Vec::with_capacity(self.config.sample_symbols);
        let mut state_power = Vec::with_capacity(self.config.sample_symbols);
        let mut thermal_state = Vec::with_capacity(self.config.sample_symbols);
        let mut resources = ResourceUsage::default();

        for symbol in 0..total_symbols {
            let input = input_rng.random_range(-1.0..=1.0);
            for _ in 0..self.config.steps_per_symbol {
                let power: f64 = state.iter().map(|value| value.norm_sqr()).sum();
                let drive_power = self.drive_power(input);
                resources.elapsed_time += self.config.dt;
                resources.incident_pump_energy +=
                    self.config.pump_amplitude.powi(2) * self.config.dt;
                resources.incident_signal_energy +=
                    (self.config.input_scale * input).powi(2) * self.config.dt;
                resources.coupled_drive_energy +=
                    self.config.external_coupling * drive_power * self.config.dt;
                resources.intrinsic_dissipation_energy +=
                    self.config.intrinsic_loss * power * self.config.dt;
                resources.external_outcoupling_energy +=
                    self.config.external_coupling * power * self.config.dt;
                resources.expected_injected_noise_energy +=
                    2.0 * self.config.modes as f64 * self.config.noise_std.powi(2) * self.config.dt;

                self.step_rk4(&mut state, &mut thermal, input, &mut noise_rng);
                if !thermal.is_finite()
                    || state
                        .iter()
                        .any(|value| !value.re.is_finite() || !value.im.is_finite())
                {
                    bail!(
                        "dynamics diverged at symbol {symbol}; reduce dt or choose a stable parameter regime"
                    );
                }
            }

            if symbol >= self.config.warmup_symbols {
                inputs.push(input);
                observations.push(self.observe(&state, input));
                state_power.push(state.iter().map(|value| value.norm_sqr()).sum());
                thermal_state.push(thermal);
            }
        }

        Ok(Simulation {
            inputs,
            observations,
            state_power,
            thermal_state,
            resources,
        })
    }

    fn drive_power(&self, input: f64) -> f64 {
        self.mode_labels
            .iter()
            .map(|&mu| {
                let mut drive = 0.0;
                if mu == 0 {
                    drive += self.config.pump_amplitude;
                }
                if mu == self.config.input_mode {
                    drive += self.config.input_scale * input;
                }
                drive.powi(2)
            })
            .sum()
    }
}

fn add_scaled(state: &[Complex64], derivative: &[Complex64], scale: f64) -> Vec<Complex64> {
    state
        .iter()
        .zip(derivative)
        .map(|(&value, &change)| value + scale * change)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Observation;
    use approx::assert_relative_eq;

    fn config() -> Config {
        Config {
            seed: 7,
            modes: 5,
            backend: Backend::DirectModal,
            dt: 0.01,
            steps_per_symbol: 2,
            warmup_symbols: 4,
            sample_symbols: 100,
            intrinsic_loss: 0.6,
            external_coupling: 0.4,
            detuning: 0.2,
            dispersion: -0.03,
            kerr_strength: 0.2,
            pump_amplitude: 0.8,
            input_scale: 0.1,
            input_mode: 0,
            noise_std: 0.0,
            thermal_coupling: 0.01,
            thermal_decay: 0.05,
            raman_fraction: 0.0,
            observation: Observation::Quadrature,
            max_degree: 2,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 2,
            null_quantile: 0.95,
            save_samples: false,
        }
    }

    #[test]
    fn zero_padded_operator_matches_direct_convolution() {
        let system = KerrSystem::new(&config());
        let state = vec![
            Complex64::new(0.3, -0.1),
            Complex64::new(-0.2, 0.05),
            Complex64::new(0.7, 0.2),
            Complex64::new(0.1, 0.4),
            Complex64::new(-0.05, -0.3),
        ];
        let direct = system.nonlinear_term(&state, Backend::DirectModal);
        let spectral = system.nonlinear_term(&state, Backend::Pseudospectral);
        for (left, right) in direct.iter().zip(spectral) {
            assert_relative_eq!(left.re, right.re, epsilon = 1e-12);
            assert_relative_eq!(left.im, right.im, epsilon = 1e-12);
        }
    }

    #[test]
    fn seeded_simulation_is_deterministic() {
        let system = KerrSystem::new(&config());
        let first = system.simulate().unwrap();
        let second = system.simulate().unwrap();
        assert_eq!(first.inputs, second.inputs);
        assert_eq!(first.observations, second.observations);
        assert_eq!(first.thermal_state, second.thermal_state);
    }

    #[test]
    fn direct_and_pseudospectral_trajectories_agree() {
        let direct_configuration = config();
        let mut spectral_configuration = direct_configuration.clone();
        spectral_configuration.backend = Backend::Pseudospectral;
        let direct = KerrSystem::new(&direct_configuration).simulate().unwrap();
        let spectral = KerrSystem::new(&spectral_configuration).simulate().unwrap();

        assert_eq!(direct.inputs, spectral.inputs);
        for (direct_row, spectral_row) in direct.observations.iter().zip(spectral.observations) {
            for (left, right) in direct_row.iter().zip(spectral_row) {
                assert_relative_eq!(left, &right, epsilon = 2e-13);
            }
        }
    }

    #[test]
    fn unforced_linear_mode_decays_at_declared_loss_rate() {
        let mut configuration = config();
        configuration.detuning = 0.0;
        configuration.dispersion = 0.0;
        configuration.kerr_strength = 0.0;
        configuration.pump_amplitude = 0.0;
        configuration.input_scale = 0.0;
        configuration.thermal_coupling = 0.0;
        configuration.intrinsic_loss = 1.2;
        configuration.external_coupling = 0.8;
        let system = KerrSystem::new(&configuration);
        let mut state = system.zero_state();
        state[2] = Complex64::new(1.0, 0.0);
        let mut thermal = 0.0;
        let mut rng = StdRng::seed_from_u64(1);
        system.step_rk4(&mut state, &mut thermal, 0.0, &mut rng);
        assert_relative_eq!(state[2].re, (-configuration.dt).exp(), epsilon = 1e-10);
        assert_relative_eq!(state[2].im, 0.0, epsilon = 1e-14);
    }
}
