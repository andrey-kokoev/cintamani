use crate::{
    capacity::{self, CapacityAnalysis},
    config::{Config, Observation},
    dynamics::{KerrSystem, ResourceUsage, Simulation},
};
use anyhow::{Context, Result, bail};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct AttributionCase {
    pub name: String,
    pub description: String,
    pub configuration: Option<Config>,
    pub capacity: CapacityAnalysis,
    pub resources: Option<ResourceUsage>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AttributionCaseSummary {
    pub name: String,
    pub declared_observation_dimension: usize,
    pub effective_observation_rank: usize,
    pub stable_rank: f64,
    pub participation_ratio: f64,
    pub familywise_permutation_threshold: f64,
    pub significant_target_count: usize,
    pub total_positive_raw_capacity: f64,
    pub total_corrected_capacity: f64,
    pub linear_corrected_capacity: f64,
    pub nonlinear_corrected_capacity: f64,
    pub current_input_corrected_capacity: f64,
    pub historical_input_corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct SensitivityRow {
    pub axis: String,
    pub condition: String,
    pub seed: u64,
    pub train_fraction: f64,
    pub effective_observation_rank: usize,
    pub stable_rank: f64,
    pub familywise_permutation_threshold: f64,
    pub significant_target_count: usize,
    pub total_corrected_capacity: f64,
    pub nonlinear_corrected_capacity: f64,
    pub historical_input_corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReplicatedTargetCapacity {
    pub target: String,
    pub total_degree: usize,
    pub maximum_lag: usize,
    pub significant_seed_count: usize,
    pub required_seed_count: usize,
    pub replicated: bool,
    pub minimum_corrected_capacity: f64,
    pub mean_corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ReplicationSummary {
    pub condition: String,
    pub seed_count: usize,
    pub replicated_target_count: usize,
    pub replicated_minimum_total_capacity: f64,
    pub replicated_minimum_linear_capacity: f64,
    pub replicated_minimum_nonlinear_capacity: f64,
    pub replicated_minimum_current_capacity: f64,
    pub replicated_minimum_historical_capacity: f64,
    pub targets: Vec<ReplicatedTargetCapacity>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AttributionSuite {
    pub base_seed: u64,
    pub evaluated_seed_count: usize,
    pub evaluated_train_fractions: Vec<f64>,
    pub cases: Vec<AttributionCase>,
    pub sensitivity: Vec<SensitivityRow>,
    pub replication: Vec<ReplicationSummary>,
}

impl AttributionCase {
    pub fn summary(&self) -> AttributionCaseSummary {
        let linear = capacity_for_group(&self.capacity.by_degree, 1);
        let current = capacity_for_group(&self.capacity.by_maximum_lag, 0);
        AttributionCaseSummary {
            name: self.name.clone(),
            declared_observation_dimension: self.capacity.declared_observation_dimension,
            effective_observation_rank: self.capacity.effective_observation_rank,
            stable_rank: self.capacity.observation_spectrum.stable_rank,
            participation_ratio: self.capacity.observation_spectrum.participation_ratio,
            familywise_permutation_threshold: self.capacity.familywise_permutation_threshold,
            significant_target_count: self
                .capacity
                .targets
                .iter()
                .filter(|target| target.familywise_significant)
                .count(),
            total_positive_raw_capacity: self.capacity.total_positive_raw_capacity,
            total_corrected_capacity: self.capacity.total_corrected_capacity,
            linear_corrected_capacity: linear,
            nonlinear_corrected_capacity: self.capacity.total_corrected_capacity - linear,
            current_input_corrected_capacity: current,
            historical_input_corrected_capacity: self.capacity.total_corrected_capacity - current,
        }
    }
}

pub fn run(
    config: &Config,
    seed_count: usize,
    train_fractions: &[f64],
) -> Result<AttributionSuite> {
    config.validate()?;
    if seed_count == 0 {
        bail!("seed_count must be positive");
    }
    if train_fractions.is_empty() {
        bail!("at least one train fraction is required");
    }
    for &fraction in train_fractions {
        let mut candidate = config.clone();
        candidate.train_fraction = fraction;
        candidate
            .validate()
            .with_context(|| format!("invalid sensitivity train fraction {fraction}"))?;
    }

    let mut kerr_intensity_config = config.clone();
    kerr_intensity_config.observation = Observation::Intensity;
    let (kerr_intensity_simulation, kerr_intensity_capacity) =
        simulate_and_analyze(&kerr_intensity_config)?;

    let mut disabled_intensity_config = kerr_intensity_config.clone();
    disabled_intensity_config.kerr_strength = 0.0;
    let (disabled_intensity_simulation, disabled_intensity_capacity) =
        simulate_and_analyze(&disabled_intensity_config)?;

    let mut kerr_quadrature_config = config.clone();
    kerr_quadrature_config.observation = Observation::Quadrature;
    let (kerr_quadrature_simulation, kerr_quadrature_capacity) =
        simulate_and_analyze(&kerr_quadrature_config)?;

    let mut disabled_quadrature_config = kerr_quadrature_config.clone();
    disabled_quadrature_config.kerr_strength = 0.0;
    let (disabled_quadrature_simulation, disabled_quadrature_capacity) =
        simulate_and_analyze(&disabled_quadrature_config)?;

    let mut pump_only_config = kerr_intensity_config.clone();
    pump_only_config.input_scale = 0.0;
    let (pump_only_simulation, pump_only_capacity) = simulate_and_analyze(&pump_only_config)?;

    let inputs = &kerr_intensity_simulation.inputs;
    let direct_linear = inputs.iter().map(|&input| vec![input]).collect::<Vec<_>>();
    let direct_square = inputs
        .iter()
        .map(|&input| vec![input.powi(2)])
        .collect::<Vec<_>>();
    let direct_joint = inputs
        .iter()
        .map(|&input| vec![input, input.powi(2)])
        .collect::<Vec<_>>();
    let direct_linear_capacity = capacity::analyze(inputs, &direct_linear, config)?;
    let direct_square_capacity = capacity::analyze(inputs, &direct_square, config)?;
    let direct_joint_capacity = capacity::analyze(inputs, &direct_joint, config)?;

    let cases = vec![
        physical_case(
            "kerr-intensity",
            "Driven Kerr cavity with one intensity snapshot per retained mode.",
            &kerr_intensity_config,
            kerr_intensity_capacity.clone(),
            &kerr_intensity_simulation,
        ),
        physical_case(
            "kerr-disabled-intensity",
            "Identical intensity experiment with only the Kerr coefficient set to zero.",
            &disabled_intensity_config,
            disabled_intensity_capacity.clone(),
            &disabled_intensity_simulation,
        ),
        physical_case(
            "kerr-quadrature",
            "Driven Kerr cavity with real and imaginary bus-field quadratures.",
            &kerr_quadrature_config,
            kerr_quadrature_capacity.clone(),
            &kerr_quadrature_simulation,
        ),
        physical_case(
            "kerr-disabled-quadrature",
            "Field-linear quadrature control with Kerr set to zero.",
            &disabled_quadrature_config,
            disabled_quadrature_capacity.clone(),
            &disabled_quadrature_simulation,
        ),
        physical_case(
            "pump-only-intensity",
            "Kerr cavity and pump retained, but the data-input amplitude is exactly zero.",
            &pump_only_config,
            pump_only_capacity,
            &pump_only_simulation,
        ),
        synthetic_case(
            "direct-linear-input",
            "One directly observed feature u[t].",
            direct_linear_capacity,
        ),
        synthetic_case(
            "direct-square-input",
            "One directly observed square-law feature u[t]^2.",
            direct_square_capacity,
        ),
        synthetic_case(
            "direct-linear-square-input",
            "Two directly observed features u[t] and u[t]^2.",
            direct_joint_capacity,
        ),
    ];

    let mut sensitivity = Vec::new();
    for &train_fraction in train_fractions {
        let mut kerr_split_config = kerr_intensity_config.clone();
        kerr_split_config.train_fraction = train_fraction;
        let kerr_capacity = if train_fraction == config.train_fraction {
            kerr_intensity_capacity.clone()
        } else {
            capacity::analyze_with_noiseless(
                &kerr_intensity_simulation.inputs,
                &kerr_intensity_simulation.observations,
                &kerr_intensity_simulation.noiseless_observations,
                &kerr_split_config,
            )?
        };
        sensitivity.push(sensitivity_row(
            "train-fraction",
            "kerr-intensity",
            &kerr_split_config,
            &kerr_capacity,
        ));

        let mut disabled_split_config = disabled_intensity_config.clone();
        disabled_split_config.train_fraction = train_fraction;
        let disabled_capacity = if train_fraction == config.train_fraction {
            disabled_intensity_capacity.clone()
        } else {
            capacity::analyze_with_noiseless(
                &disabled_intensity_simulation.inputs,
                &disabled_intensity_simulation.observations,
                &disabled_intensity_simulation.noiseless_observations,
                &disabled_split_config,
            )?
        };
        sensitivity.push(sensitivity_row(
            "train-fraction",
            "kerr-disabled-intensity",
            &disabled_split_config,
            &disabled_capacity,
        ));

        let mut kerr_quadrature_split_config = kerr_quadrature_config.clone();
        kerr_quadrature_split_config.train_fraction = train_fraction;
        let kerr_quadrature_split_capacity = if train_fraction == config.train_fraction {
            kerr_quadrature_capacity.clone()
        } else {
            capacity::analyze_with_noiseless(
                &kerr_quadrature_simulation.inputs,
                &kerr_quadrature_simulation.observations,
                &kerr_quadrature_simulation.noiseless_observations,
                &kerr_quadrature_split_config,
            )?
        };
        sensitivity.push(sensitivity_row(
            "train-fraction",
            "kerr-quadrature",
            &kerr_quadrature_split_config,
            &kerr_quadrature_split_capacity,
        ));

        let mut disabled_quadrature_split_config = disabled_quadrature_config.clone();
        disabled_quadrature_split_config.train_fraction = train_fraction;
        let disabled_quadrature_split_capacity = if train_fraction == config.train_fraction {
            disabled_quadrature_capacity.clone()
        } else {
            capacity::analyze_with_noiseless(
                &disabled_quadrature_simulation.inputs,
                &disabled_quadrature_simulation.observations,
                &disabled_quadrature_simulation.noiseless_observations,
                &disabled_quadrature_split_config,
            )?
        };
        sensitivity.push(sensitivity_row(
            "train-fraction",
            "kerr-disabled-quadrature",
            &disabled_quadrature_split_config,
            &disabled_quadrature_split_capacity,
        ));
    }

    let mut kerr_intensity_seed_capacities = vec![kerr_intensity_capacity.clone()];
    let mut disabled_intensity_seed_capacities = vec![disabled_intensity_capacity.clone()];
    let mut kerr_quadrature_seed_capacities = vec![kerr_quadrature_capacity.clone()];
    let mut disabled_quadrature_seed_capacities = vec![disabled_quadrature_capacity.clone()];

    for offset in 0..seed_count {
        let seed = config
            .seed
            .checked_add(offset as u64)
            .context("seed sensitivity range overflowed u64")?;
        if offset == 0 {
            sensitivity.push(sensitivity_row(
                "seed",
                "kerr-intensity",
                &kerr_intensity_config,
                &kerr_intensity_capacity,
            ));
            sensitivity.push(sensitivity_row(
                "seed",
                "kerr-disabled-intensity",
                &disabled_intensity_config,
                &disabled_intensity_capacity,
            ));
            sensitivity.push(sensitivity_row(
                "seed",
                "kerr-quadrature",
                &kerr_quadrature_config,
                &kerr_quadrature_capacity,
            ));
            sensitivity.push(sensitivity_row(
                "seed",
                "kerr-disabled-quadrature",
                &disabled_quadrature_config,
                &disabled_quadrature_capacity,
            ));
            continue;
        }

        let mut kerr_seed_config = kerr_intensity_config.clone();
        kerr_seed_config.seed = seed;
        let (_, kerr_capacity) = simulate_and_analyze(&kerr_seed_config)?;
        sensitivity.push(sensitivity_row(
            "seed",
            "kerr-intensity",
            &kerr_seed_config,
            &kerr_capacity,
        ));
        kerr_intensity_seed_capacities.push(kerr_capacity);

        let mut disabled_seed_config = disabled_intensity_config.clone();
        disabled_seed_config.seed = seed;
        let (_, disabled_capacity) = simulate_and_analyze(&disabled_seed_config)?;
        sensitivity.push(sensitivity_row(
            "seed",
            "kerr-disabled-intensity",
            &disabled_seed_config,
            &disabled_capacity,
        ));
        disabled_intensity_seed_capacities.push(disabled_capacity);

        let mut kerr_quadrature_seed_config = kerr_quadrature_config.clone();
        kerr_quadrature_seed_config.seed = seed;
        let (_, kerr_quadrature_seed_capacity) =
            simulate_and_analyze(&kerr_quadrature_seed_config)?;
        sensitivity.push(sensitivity_row(
            "seed",
            "kerr-quadrature",
            &kerr_quadrature_seed_config,
            &kerr_quadrature_seed_capacity,
        ));
        kerr_quadrature_seed_capacities.push(kerr_quadrature_seed_capacity);

        let mut disabled_quadrature_seed_config = disabled_quadrature_config.clone();
        disabled_quadrature_seed_config.seed = seed;
        let (_, disabled_quadrature_seed_capacity) =
            simulate_and_analyze(&disabled_quadrature_seed_config)?;
        sensitivity.push(sensitivity_row(
            "seed",
            "kerr-disabled-quadrature",
            &disabled_quadrature_seed_config,
            &disabled_quadrature_seed_capacity,
        ));
        disabled_quadrature_seed_capacities.push(disabled_quadrature_seed_capacity);
    }

    let replication = vec![
        replication_summary("kerr-intensity", &kerr_intensity_seed_capacities),
        replication_summary(
            "kerr-disabled-intensity",
            &disabled_intensity_seed_capacities,
        ),
        replication_summary("kerr-quadrature", &kerr_quadrature_seed_capacities),
        replication_summary(
            "kerr-disabled-quadrature",
            &disabled_quadrature_seed_capacities,
        ),
    ];

    Ok(AttributionSuite {
        base_seed: config.seed,
        evaluated_seed_count: seed_count,
        evaluated_train_fractions: train_fractions.to_vec(),
        cases,
        sensitivity,
        replication,
    })
}

fn simulate_and_analyze(config: &Config) -> Result<(Simulation, CapacityAnalysis)> {
    config.validate()?;
    let simulation = KerrSystem::new(config).simulate()?;
    if simulation.observations.first().map(Vec::len) != Some(config.observation_dimension()) {
        bail!("simulator observation width does not match the configured interface");
    }
    let analysis = capacity::analyze_with_noiseless(
        &simulation.inputs,
        &simulation.observations,
        &simulation.noiseless_observations,
        config,
    )?;
    Ok((simulation, analysis))
}

fn physical_case(
    name: &str,
    description: &str,
    config: &Config,
    capacity: CapacityAnalysis,
    simulation: &Simulation,
) -> AttributionCase {
    AttributionCase {
        name: name.to_owned(),
        description: description.to_owned(),
        configuration: Some(config.clone()),
        capacity,
        resources: Some(simulation.resources.clone()),
    }
}

fn synthetic_case(name: &str, description: &str, capacity: CapacityAnalysis) -> AttributionCase {
    AttributionCase {
        name: name.to_owned(),
        description: description.to_owned(),
        configuration: None,
        capacity,
        resources: None,
    }
}

fn sensitivity_row(
    axis: &str,
    condition: &str,
    config: &Config,
    capacity: &CapacityAnalysis,
) -> SensitivityRow {
    let linear = capacity_for_group(&capacity.by_degree, 1);
    let current = capacity_for_group(&capacity.by_maximum_lag, 0);
    SensitivityRow {
        axis: axis.to_owned(),
        condition: condition.to_owned(),
        seed: config.seed,
        train_fraction: config.train_fraction,
        effective_observation_rank: capacity.effective_observation_rank,
        stable_rank: capacity.observation_spectrum.stable_rank,
        familywise_permutation_threshold: capacity.familywise_permutation_threshold,
        significant_target_count: capacity
            .targets
            .iter()
            .filter(|target| target.familywise_significant)
            .count(),
        total_corrected_capacity: capacity.total_corrected_capacity,
        nonlinear_corrected_capacity: capacity.total_corrected_capacity - linear,
        historical_input_corrected_capacity: capacity.total_corrected_capacity - current,
    }
}

fn capacity_for_group(groups: &[crate::capacity::GroupCapacity], group: usize) -> f64 {
    groups
        .iter()
        .find(|candidate| candidate.group == group)
        .map_or(0.0, |candidate| candidate.corrected_capacity)
}

fn replication_summary(condition: &str, analyses: &[CapacityAnalysis]) -> ReplicationSummary {
    let seed_count = analyses.len();
    let targets = analyses[0]
        .targets
        .iter()
        .enumerate()
        .map(|(index, reference)| {
            let scores: Vec<_> = analyses
                .iter()
                .map(|analysis| analysis.targets[index].corrected_capacity)
                .collect();
            let significant_seed_count = scores.iter().filter(|&&score| score > 0.0).count();
            let replicated = significant_seed_count == seed_count;
            ReplicatedTargetCapacity {
                target: reference.target.clone(),
                total_degree: reference.total_degree,
                maximum_lag: reference.maximum_lag,
                significant_seed_count,
                required_seed_count: seed_count,
                replicated,
                minimum_corrected_capacity: if replicated {
                    scores.iter().copied().fold(f64::INFINITY, f64::min)
                } else {
                    0.0
                },
                mean_corrected_capacity: scores.iter().sum::<f64>() / seed_count as f64,
            }
        })
        .collect::<Vec<_>>();
    let replicated_minimum_total_capacity = targets
        .iter()
        .map(|target| target.minimum_corrected_capacity)
        .sum::<f64>();
    let replicated_minimum_linear_capacity = targets
        .iter()
        .filter(|target| target.total_degree == 1)
        .map(|target| target.minimum_corrected_capacity)
        .sum::<f64>();
    let replicated_minimum_current_capacity = targets
        .iter()
        .filter(|target| target.maximum_lag == 0)
        .map(|target| target.minimum_corrected_capacity)
        .sum::<f64>();

    ReplicationSummary {
        condition: condition.to_owned(),
        seed_count,
        replicated_target_count: targets.iter().filter(|target| target.replicated).count(),
        replicated_minimum_total_capacity,
        replicated_minimum_linear_capacity,
        replicated_minimum_nonlinear_capacity: replicated_minimum_total_capacity
            - replicated_minimum_linear_capacity,
        replicated_minimum_current_capacity,
        replicated_minimum_historical_capacity: replicated_minimum_total_capacity
            - replicated_minimum_current_capacity,
        targets,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Backend;

    fn config() -> Config {
        Config {
            seed: 41,
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
    fn attribution_suite_contains_detector_and_input_controls() {
        let suite = run(&config(), 1, &[0.7]).unwrap();
        let names: Vec<_> = suite.cases.iter().map(|case| case.name.as_str()).collect();
        assert!(names.contains(&"kerr-disabled-intensity"));
        assert!(names.contains(&"kerr-disabled-quadrature"));
        assert!(names.contains(&"pump-only-intensity"));
        assert!(names.contains(&"direct-linear-input"));
        assert!(names.contains(&"direct-square-input"));
    }

    #[test]
    fn direct_feature_controls_attribute_degree() {
        let suite = run(&config(), 1, &[0.7]).unwrap();
        let linear = suite
            .cases
            .iter()
            .find(|case| case.name == "direct-linear-input")
            .unwrap()
            .summary();
        let square = suite
            .cases
            .iter()
            .find(|case| case.name == "direct-square-input")
            .unwrap()
            .summary();
        assert!(linear.linear_corrected_capacity > 0.9);
        assert!(linear.nonlinear_corrected_capacity < 0.05);
        assert!(square.linear_corrected_capacity < 0.05);
        assert!(square.nonlinear_corrected_capacity > 0.9);
    }

    #[test]
    fn replication_gate_rejects_one_seed_target() {
        let suite = run(&config(), 1, &[0.7]).unwrap();
        let template = suite.cases[0].capacity.clone();
        let mut analyses = vec![template.clone(), template.clone(), template];
        for analysis in &mut analyses {
            for target in &mut analysis.targets {
                target.corrected_capacity = 0.0;
            }
        }
        analyses[0].targets[0].corrected_capacity = 0.5;
        analyses[1].targets[0].corrected_capacity = 0.4;
        analyses[2].targets[0].corrected_capacity = 0.3;
        analyses[0].targets[1].corrected_capacity = 0.2;

        let replication = replication_summary("test", &analyses);
        assert_eq!(replication.replicated_target_count, 1);
        assert_eq!(replication.targets[0].minimum_corrected_capacity, 0.3);
        assert!(!replication.targets[1].replicated);
        assert_eq!(replication.targets[1].minimum_corrected_capacity, 0.0);
    }
}
