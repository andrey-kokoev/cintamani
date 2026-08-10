use crate::{
    capacity::{self, CapacityAnalysis},
    config::{Backend, Config, Observation},
    dynamics::{KerrSystem, ResourceUsage, Simulation},
};
use anyhow::{Result, bail};
use num_complex::Complex64;
use serde::Serialize;

pub const CAPACITY_BOUND_TOLERANCE: f64 = 0.05;

#[derive(Clone, Debug, Serialize)]
pub struct Summary {
    pub seed: u64,
    pub backend: Backend,
    pub modes: usize,
    pub observation: Observation,
    pub declared_observation_dimension: usize,
    pub effective_observation_rank: usize,
    pub observation_stable_rank: f64,
    pub observation_participation_ratio: f64,
    pub rank_relative_tolerance: f64,
    pub warmup_symbols: usize,
    pub recorded_symbols: usize,
    pub aligned_samples: usize,
    pub train_samples: usize,
    pub test_samples: usize,
    pub target_count: usize,
    pub significant_target_count: usize,
    pub familywise_permutation_threshold: f64,
    pub total_positive_raw_capacity: f64,
    pub total_corrected_capacity: f64,
    pub linear_corrected_capacity: f64,
    pub nonlinear_corrected_capacity: f64,
    pub current_input_corrected_capacity: f64,
    pub historical_input_corrected_capacity: f64,
    pub capacity_bound_tolerance: f64,
    pub signed_effective_rank_margin: f64,
    pub decision: String,
    pub direct_pseudospectral_rhs_error: f64,
    pub symbol_duration: f64,
    pub normalized_energy_lifetime: Option<f64>,
    pub mean_state_power: f64,
    pub peak_state_power: f64,
    pub final_thermal_detuning: f64,
    pub resources: ResourceUsage,
}

#[derive(Clone, Debug, Serialize)]
pub struct ExperimentResult {
    pub summary: Summary,
    pub capacity: CapacityAnalysis,
    pub simulation: Simulation,
}

pub fn run(config: &Config) -> Result<ExperimentResult> {
    config.validate()?;
    let system = KerrSystem::new(config);
    let simulation = system.simulate()?;
    if simulation.observations.first().map(Vec::len) != Some(config.observation_dimension()) {
        bail!("simulator observation width does not match the configured interface");
    }
    let capacity = capacity::analyze(&simulation.inputs, &simulation.observations, config)?;
    let total = capacity.total_corrected_capacity;
    let effective_rank = capacity.effective_observation_rank;
    let signed_margin = effective_rank as f64 - total;
    let decision = if signed_margin + CAPACITY_BOUND_TOLERANCE >= 0.0 {
        "within-effective-observation-rank-bound"
    } else {
        "empirical-capacity-bound-violation"
    };

    let linear = capacity
        .by_degree
        .iter()
        .find(|group| group.group == 1)
        .map_or(0.0, |group| group.corrected_capacity);
    let current = capacity
        .by_maximum_lag
        .iter()
        .find(|group| group.group == 0)
        .map_or(0.0, |group| group.corrected_capacity);
    let mean_state_power = mean(&simulation.state_power);
    let peak_state_power = simulation.state_power.iter().copied().fold(0.0, f64::max);
    let final_thermal_detuning = simulation.thermal_state.last().copied().unwrap_or(0.0);
    let rhs_error = cross_check(config)?;

    let summary = Summary {
        seed: config.seed,
        backend: config.backend,
        modes: config.modes,
        observation: config.observation,
        declared_observation_dimension: capacity.declared_observation_dimension,
        effective_observation_rank: effective_rank,
        observation_stable_rank: capacity.observation_spectrum.stable_rank,
        observation_participation_ratio: capacity.observation_spectrum.participation_ratio,
        rank_relative_tolerance: capacity.observation_spectrum.chosen_relative_tolerance,
        warmup_symbols: config.warmup_symbols,
        recorded_symbols: config.sample_symbols,
        aligned_samples: capacity.aligned_samples,
        train_samples: capacity.train_samples,
        test_samples: capacity.test_samples,
        target_count: capacity.targets.len(),
        significant_target_count: capacity
            .targets
            .iter()
            .filter(|target| target.familywise_significant)
            .count(),
        familywise_permutation_threshold: capacity.familywise_permutation_threshold,
        total_positive_raw_capacity: capacity.total_positive_raw_capacity,
        total_corrected_capacity: total,
        linear_corrected_capacity: linear,
        nonlinear_corrected_capacity: total - linear,
        current_input_corrected_capacity: current,
        historical_input_corrected_capacity: total - current,
        capacity_bound_tolerance: CAPACITY_BOUND_TOLERANCE,
        signed_effective_rank_margin: signed_margin,
        decision: decision.to_owned(),
        direct_pseudospectral_rhs_error: rhs_error,
        symbol_duration: config.dt * config.steps_per_symbol as f64,
        normalized_energy_lifetime: (config.total_loss() > 0.0).then(|| 1.0 / config.total_loss()),
        mean_state_power,
        peak_state_power,
        final_thermal_detuning,
        resources: simulation.resources.clone(),
    };

    Ok(ExperimentResult {
        summary,
        capacity,
        simulation,
    })
}

/// Compare the complete modal right-hand side at a nontrivial deterministic
/// state.  Linear, drive, and thermal terms are retained so the check follows
/// the same path as integration, while the two cubic evaluations are distinct.
pub fn cross_check(config: &Config) -> Result<f64> {
    config.validate()?;
    let system = KerrSystem::new(config);
    let state: Vec<_> = system
        .mode_labels()
        .iter()
        .enumerate()
        .map(|(index, &mu)| {
            let scale = 0.08 * (index + 1) as f64;
            Complex64::new(
                scale * (0.7 * mu as f64).cos(),
                scale * (0.4 * mu as f64).sin(),
            )
        })
        .collect();
    let (direct, direct_thermal) = system.rhs(&state, 0.13, 0.37, Backend::DirectModal);
    let (spectral, spectral_thermal) = system.rhs(&state, 0.13, 0.37, Backend::Pseudospectral);
    let modal_error = direct
        .iter()
        .zip(spectral)
        .map(|(left, right)| (*left - right).norm())
        .fold(0.0, f64::max);
    Ok(modal_error.max((direct_thermal - spectral_thermal).abs()))
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config {
            seed: 23,
            modes: 5,
            backend: Backend::Pseudospectral,
            dt: 0.02,
            steps_per_symbol: 2,
            warmup_symbols: 8,
            sample_symbols: 180,
            intrinsic_loss: 0.6,
            external_coupling: 0.4,
            detuning: 0.7,
            dispersion: -0.02,
            kerr_strength: 0.25,
            pump_amplitude: 1.0,
            input_scale: 0.12,
            input_mode: 0,
            noise_std: 0.0,
            thermal_coupling: 0.01,
            thermal_decay: 0.05,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 2,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 20,
            null_quantile: 0.95,
            rank_relative_tolerance: 1e-6,
            save_samples: false,
        }
    }

    #[test]
    fn complete_rhs_cross_check_is_tight() {
        let error = cross_check(&config()).unwrap();
        assert!(error < 1e-12, "cross-check error was {error:e}");
    }

    #[test]
    fn experiment_records_resources_and_bound_decision() {
        let result = run(&config()).unwrap();
        assert!(result.summary.resources.elapsed_time > 0.0);
        assert_eq!(
            result.summary.declared_observation_dimension,
            config().observation_dimension()
        );
        assert!(result.summary.decision.contains("bound"));
    }
}
