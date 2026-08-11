use crate::{
    capacity::{self, CapacityAnalysis, TargetCapacity},
    config::{Backend, Config, Observation},
    dynamics::{KerrSystem, ResourceUsage, Simulation},
};
use anyhow::{Context, Result, bail};
use serde::Serialize;

pub const FROZEN_NOISE_LEVELS: [f64; 5] = [0.0, 1e-10, 1e-9, 1e-8, 1e-7];
pub const FROZEN_DECISION_FLOOR: f64 = 1e-8;
pub const FROZEN_SEED_COUNT: usize = 3;
pub const FROZEN_BASE_SEED: u64 = 20260810;

#[derive(Clone, Debug, Serialize)]
pub struct NoiseCase {
    pub condition: String,
    pub seed: u64,
    pub detector_noise_std: f64,
    pub configuration: Config,
    pub capacity: CapacityAnalysis,
    pub resources: ResourceUsage,
}

#[derive(Clone, Debug, Serialize)]
pub struct NoiseCaseSummary {
    pub condition: String,
    pub seed: u64,
    pub detector_noise_std: f64,
    pub declared_observation_dimension: usize,
    pub observed_standardized_rank: usize,
    pub noiseless_numerical_rank: usize,
    pub noise_aware_observable_dimension: usize,
    pub significant_target_count: usize,
    pub total_corrected_capacity: f64,
    pub linear_corrected_capacity: f64,
    pub historical_corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct PairedTargetDifference {
    pub detector_noise_std: f64,
    pub seed: u64,
    pub target: String,
    pub total_degree: usize,
    pub maximum_lag: usize,
    pub kerr_corrected_capacity: f64,
    pub disabled_corrected_capacity: f64,
    pub kerr_minus_disabled: f64,
    pub kerr_familywise_significant: bool,
    pub disabled_familywise_significant: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct NoiseReplicationOutcome {
    pub detector_noise_std: f64,
    pub target: String,
    pub total_degree: usize,
    pub maximum_lag: usize,
    pub required_seed_count: usize,
    pub kerr_significant_seed_count: usize,
    pub disabled_significant_seed_count: usize,
    pub positive_delta_seed_count: usize,
    pub kerr_replicated: bool,
    pub disabled_replicated: bool,
    pub paired_advantage_replicated: bool,
    /// Signed lower envelope across every seed, retained even on failure.
    pub minimum_kerr_minus_disabled: f64,
    pub mean_kerr_minus_disabled: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct NoiseSuite {
    pub base_seed: u64,
    pub evaluated_seed_count: usize,
    pub detector_noise_levels: Vec<f64>,
    pub decision_floor: f64,
    pub observation_noise_units: String,
    pub common_random_number_rule: String,
    pub noise_aware_dimension_rule: String,
    pub cases: Vec<NoiseCase>,
    pub paired_differences: Vec<PairedTargetDifference>,
    pub replication: Vec<NoiseReplicationOutcome>,
    pub gate_targets: Vec<String>,
    pub gate_passed: bool,
    pub decision: String,
}

impl NoiseCase {
    pub fn summary(&self) -> NoiseCaseSummary {
        let linear = group_capacity(&self.capacity.by_degree, 1);
        let current = group_capacity(&self.capacity.by_maximum_lag, 0);
        NoiseCaseSummary {
            condition: self.condition.clone(),
            seed: self.seed,
            detector_noise_std: self.detector_noise_std,
            declared_observation_dimension: self.capacity.declared_observation_dimension,
            observed_standardized_rank: self.capacity.effective_observation_rank,
            noiseless_numerical_rank: self.capacity.noiseless_numerical_rank,
            noise_aware_observable_dimension: self.capacity.noise_aware_observable_dimension,
            significant_target_count: self
                .capacity
                .targets
                .iter()
                .filter(|target| target.familywise_significant)
                .count(),
            total_corrected_capacity: self.capacity.total_corrected_capacity,
            linear_corrected_capacity: linear,
            historical_corrected_capacity: self.capacity.total_corrected_capacity - current,
        }
    }
}

pub fn run_frozen(config: &Config) -> Result<NoiseSuite> {
    validate_frozen_protocol(config)?;
    run(
        config,
        &FROZEN_NOISE_LEVELS,
        FROZEN_SEED_COUNT,
        FROZEN_DECISION_FLOOR,
    )
}

pub fn run(
    config: &Config,
    noise_levels: &[f64],
    seed_count: usize,
    decision_floor: f64,
) -> Result<NoiseSuite> {
    config.validate()?;
    validate_noise_grid(noise_levels, decision_floor)?;
    if seed_count == 0 {
        bail!("seed_count must be positive");
    }

    let mut cases = Vec::with_capacity(noise_levels.len() * seed_count * 2);
    let mut paired_differences = Vec::new();
    for &detector_noise_std in noise_levels {
        for offset in 0..seed_count {
            let seed = config
                .seed
                .checked_add(offset as u64)
                .context("noise-suite seed range overflowed u64")?;
            let mut kerr_config = config.clone();
            kerr_config.seed = seed;
            kerr_config.observation = Observation::Quadrature;
            kerr_config.detector_noise_std = detector_noise_std;
            let (kerr_simulation, kerr_capacity) = simulate_and_analyze(&kerr_config)?;

            let mut disabled_config = kerr_config.clone();
            disabled_config.kerr_strength = 0.0;
            let (disabled_simulation, disabled_capacity) = simulate_and_analyze(&disabled_config)?;
            verify_common_detector_noise(&kerr_simulation, &disabled_simulation)?;
            append_paired_differences(
                detector_noise_std,
                seed,
                &kerr_capacity.targets,
                &disabled_capacity.targets,
                &mut paired_differences,
            )?;

            cases.push(NoiseCase {
                condition: "kerr-quadrature".to_owned(),
                seed,
                detector_noise_std,
                configuration: kerr_config,
                capacity: kerr_capacity,
                resources: kerr_simulation.resources,
            });
            cases.push(NoiseCase {
                condition: "kerr-disabled-quadrature".to_owned(),
                seed,
                detector_noise_std,
                configuration: disabled_config,
                capacity: disabled_capacity,
                resources: disabled_simulation.resources,
            });
        }
    }

    let replication = replication_outcomes(noise_levels, seed_count, &paired_differences)?;
    let gate_targets = vec!["L1(u[t-3])".to_owned(), "L1(u[t-4])".to_owned()];
    let gate_passed = gate_targets.iter().all(|target| {
        replication.iter().any(|outcome| {
            outcome.detector_noise_std == decision_floor
                && outcome.target == *target
                && outcome.paired_advantage_replicated
        })
    });
    let decision = if gate_passed {
        "advance-kerr-quadrature-memory-lead-to-bounded-parameter-siege"
    } else {
        "abandon-kerr-quadrature-memory-lead-at-declared-noise-gate"
    };

    Ok(NoiseSuite {
        base_seed: config.seed,
        evaluated_seed_count: seed_count,
        detector_noise_levels: noise_levels.to_vec(),
        decision_floor,
        observation_noise_units: "normalized real quadrature units; no dimensional detector calibration"
            .to_owned(),
        common_random_number_rule: "detector draws use a dedicated seed-derived stream and are identical within each seed/level Kerr-control pair"
            .to_owned(),
        noise_aware_dimension_rule: "at zero noise use noiseless standardized numerical rank; otherwise count noiseless raw principal standard deviations strictly above detector_noise_std, capped by noiseless numerical rank"
            .to_owned(),
        cases,
        paired_differences,
        replication,
        gate_targets,
        gate_passed,
        decision: decision.to_owned(),
    })
}

fn validate_frozen_protocol(config: &Config) -> Result<()> {
    let matches = config.seed == FROZEN_BASE_SEED
        && config.modes == 7
        && config.backend == Backend::Pseudospectral
        && config.dt == 0.02
        && config.steps_per_symbol == 4
        && config.warmup_symbols == 128
        && config.sample_symbols == 2400
        && config.intrinsic_loss == 0.65
        && config.external_coupling == 0.35
        && config.detuning == 1.4
        && config.dispersion == -0.02
        && config.kerr_strength == 0.35
        && config.pump_amplitude == 1.25
        && config.input_scale == 0.16
        && config.input_mode == 1
        && config.noise_std == 0.0
        && config.detector_noise_std == 0.0
        && config.thermal_coupling == 0.0
        && config.thermal_decay == 0.08
        && config.raman_fraction == 0.0
        && config.observation == Observation::Quadrature
        && config.max_degree == 3
        && config.max_lag == 4
        && config.train_fraction == 0.7
        && config.ridge == 1e-6
        && config.null_trials == 512
        && config.null_quantile == 0.99
        && config.rank_relative_tolerance == 1e-6
        && !config.save_samples;
    if !matches {
        bail!(
            "configuration does not exactly match configs/detector-noise-frozen.toml; the frozen evidence protocol forbids parameter drift"
        );
    }
    Ok(())
}

fn validate_noise_grid(noise_levels: &[f64], decision_floor: f64) -> Result<()> {
    if noise_levels.is_empty() {
        bail!("noise grid must not be empty");
    }
    if !decision_floor.is_finite() || decision_floor <= 0.0 {
        bail!("decision floor must be finite and positive");
    }
    if noise_levels
        .iter()
        .any(|level| !level.is_finite() || *level < 0.0)
    {
        bail!("noise levels must be finite and non-negative");
    }
    if noise_levels.windows(2).any(|pair| pair[0] >= pair[1]) {
        bail!("noise levels must be strictly increasing");
    }
    if noise_levels[0] != 0.0 {
        bail!("noise grid must include the zero-noise control as its first level");
    }
    if !noise_levels.contains(&decision_floor) {
        bail!("noise grid must contain the declared decision floor");
    }
    Ok(())
}

fn simulate_and_analyze(config: &Config) -> Result<(Simulation, CapacityAnalysis)> {
    let simulation = KerrSystem::new(config).simulate()?;
    let capacity = capacity::analyze_with_noiseless(
        &simulation.inputs,
        &simulation.observations,
        &simulation.noiseless_observations,
        config,
    )?;
    Ok((simulation, capacity))
}

fn verify_common_detector_noise(kerr: &Simulation, disabled: &Simulation) -> Result<()> {
    for (((kerr_observed, kerr_noiseless), disabled_observed), disabled_noiseless) in kerr
        .observations
        .iter()
        .zip(&kerr.noiseless_observations)
        .zip(&disabled.observations)
        .zip(&disabled.noiseless_observations)
    {
        for (((&ko, &kn), &do_), &dn) in kerr_observed
            .iter()
            .zip(kerr_noiseless)
            .zip(disabled_observed)
            .zip(disabled_noiseless)
        {
            let left = ko - kn;
            let right = do_ - dn;
            if (left - right).abs() > 5e-15 * (1.0 + left.abs().max(right.abs())) {
                bail!(
                    "matched Kerr/control simulations did not receive common detector-noise draws"
                );
            }
        }
    }
    Ok(())
}

fn append_paired_differences(
    detector_noise_std: f64,
    seed: u64,
    kerr: &[TargetCapacity],
    disabled: &[TargetCapacity],
    output: &mut Vec<PairedTargetDifference>,
) -> Result<()> {
    if kerr.len() != disabled.len() {
        bail!("matched target families have different lengths");
    }
    for (kerr_target, disabled_target) in kerr.iter().zip(disabled) {
        if kerr_target.target != disabled_target.target {
            bail!("matched target families are ordered differently");
        }
        output.push(PairedTargetDifference {
            detector_noise_std,
            seed,
            target: kerr_target.target.clone(),
            total_degree: kerr_target.total_degree,
            maximum_lag: kerr_target.maximum_lag,
            kerr_corrected_capacity: kerr_target.corrected_capacity,
            disabled_corrected_capacity: disabled_target.corrected_capacity,
            kerr_minus_disabled: kerr_target.corrected_capacity
                - disabled_target.corrected_capacity,
            kerr_familywise_significant: kerr_target.familywise_significant,
            disabled_familywise_significant: disabled_target.familywise_significant,
        });
    }
    Ok(())
}

fn replication_outcomes(
    noise_levels: &[f64],
    seed_count: usize,
    differences: &[PairedTargetDifference],
) -> Result<Vec<NoiseReplicationOutcome>> {
    let mut output = Vec::new();
    for &level in noise_levels {
        let at_level: Vec<_> = differences
            .iter()
            .filter(|row| row.detector_noise_std == level)
            .collect();
        let Some(first) = at_level.first() else {
            bail!("noise level {level:e} has no paired target rows");
        };
        let target_names: Vec<_> = differences
            .iter()
            .filter(|row| row.detector_noise_std == level && row.seed == first.seed)
            .map(|row| row.target.clone())
            .collect();
        for target in target_names {
            let rows: Vec<_> = at_level
                .iter()
                .filter(|row| row.target == target)
                .copied()
                .collect();
            if rows.len() != seed_count {
                bail!("target {target} at noise {level:e} does not have one row per seed");
            }
            let kerr_count = rows
                .iter()
                .filter(|row| row.kerr_familywise_significant)
                .count();
            let disabled_count = rows
                .iter()
                .filter(|row| row.disabled_familywise_significant)
                .count();
            let positive_delta_count = rows
                .iter()
                .filter(|row| row.kerr_minus_disabled > 0.0)
                .count();
            let kerr_replicated = kerr_count == seed_count;
            let minimum = rows
                .iter()
                .map(|row| row.kerr_minus_disabled)
                .fold(f64::INFINITY, f64::min);
            output.push(NoiseReplicationOutcome {
                detector_noise_std: level,
                target: target.clone(),
                total_degree: rows[0].total_degree,
                maximum_lag: rows[0].maximum_lag,
                required_seed_count: seed_count,
                kerr_significant_seed_count: kerr_count,
                disabled_significant_seed_count: disabled_count,
                positive_delta_seed_count: positive_delta_count,
                kerr_replicated,
                disabled_replicated: disabled_count == seed_count,
                paired_advantage_replicated: kerr_replicated && positive_delta_count == seed_count,
                minimum_kerr_minus_disabled: minimum,
                mean_kerr_minus_disabled: rows
                    .iter()
                    .map(|row| row.kerr_minus_disabled)
                    .sum::<f64>()
                    / seed_count as f64,
            });
        }
    }
    Ok(output)
}

fn group_capacity(groups: &[crate::capacity::GroupCapacity], group: usize) -> f64 {
    groups
        .iter()
        .find(|candidate| candidate.group == group)
        .map_or(0.0, |candidate| candidate.corrected_capacity)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        Config {
            seed: 61,
            modes: 3,
            backend: Backend::Pseudospectral,
            dt: 0.02,
            steps_per_symbol: 1,
            warmup_symbols: 8,
            sample_symbols: 180,
            intrinsic_loss: 0.6,
            external_coupling: 0.4,
            detuning: 0.7,
            dispersion: -0.02,
            kerr_strength: 0.2,
            pump_amplitude: 1.0,
            input_scale: 0.12,
            input_mode: 1,
            noise_std: 0.0,
            detector_noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.05,
            raman_fraction: 0.0,
            observation: Observation::Quadrature,
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
    fn sweep_retains_every_level_seed_pair_and_lower_envelope() {
        let suite = run(&config(), &[0.0, 1e-6], 2, 1e-6).unwrap();
        assert_eq!(suite.cases.len(), 8);
        assert_eq!(suite.paired_differences.len(), 2 * 2 * 9);
        assert_eq!(suite.replication.len(), 2 * 9);
        assert!(
            suite
                .replication
                .iter()
                .all(|outcome| outcome.minimum_kerr_minus_disabled.is_finite())
        );
    }

    #[test]
    fn frozen_grid_is_predeclared_and_brackets_ledger_thirteen_weakest_channel() {
        assert_eq!(FROZEN_NOISE_LEVELS[0], 0.0);
        assert!(FROZEN_NOISE_LEVELS.contains(&FROZEN_DECISION_FLOOR));
        assert!(FROZEN_NOISE_LEVELS.iter().any(|&level| level < 3.4e-9));
        assert!(FROZEN_NOISE_LEVELS.iter().any(|&level| level > 3.4e-9));
    }

    #[test]
    fn frozen_protocol_rejects_physical_parameter_drift() {
        let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut frozen = Config::load(root.join("configs/detector-noise-frozen.toml")).unwrap();
        validate_frozen_protocol(&frozen).unwrap();
        frozen.detuning += 0.01;
        assert!(validate_frozen_protocol(&frozen).is_err());
    }
}
