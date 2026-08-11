use crate::{
    config::Config,
    controls::{AttributionSuite, ReplicationSummary, SensitivityRow},
    experiment::ExperimentResult,
};
use anyhow::{Context, Result};
use serde::Serialize;
use std::{fs, path::Path};

pub fn write_all(
    output: impl AsRef<Path>,
    config: &Config,
    result: &ExperimentResult,
) -> Result<()> {
    let output = output.as_ref();
    fs::create_dir_all(output)
        .with_context(|| format!("failed to create output directory {}", output.display()))?;
    crate::database::write_experiment(output.join("results.sqlite"), config, result)?;

    write_json(output.join("config.json"), config)?;
    write_json(output.join("summary.json"), &result.summary)?;
    write_capacity_csv(output.join("capacities.csv"), result)?;
    write_group_csv(
        output.join("capacity-by-degree.csv"),
        &result.capacity.by_degree,
    )?;
    write_group_csv(
        output.join("capacity-by-maximum-lag.csv"),
        &result.capacity.by_maximum_lag,
    )?;
    write_spectrum_csv(output.join("observation-spectrum.csv"), result)?;
    write_feature_scales_csv(output.join("observation-feature-scales.csv"), result)?;
    if config.save_samples {
        write_samples_csv(output.join("samples.csv"), result)?;
    }
    fs::write(output.join("report.md"), markdown_report(config, result))
        .with_context(|| format!("failed to write report in {}", output.display()))?;
    Ok(())
}

pub fn write_attribution_suite(
    output: impl AsRef<Path>,
    config: &Config,
    suite: &AttributionSuite,
) -> Result<()> {
    let output = output.as_ref();
    fs::create_dir_all(output)
        .with_context(|| format!("failed to create output directory {}", output.display()))?;
    crate::database::write_attribution_suite(output.join("results.sqlite"), config, suite)?;
    write_json(output.join("base-config.json"), config)?;
    write_json(output.join("attribution-suite.json"), suite)?;

    let summary_path = output.join("controls-summary.csv");
    let mut summary_writer = csv::Writer::from_path(&summary_path)
        .with_context(|| format!("failed to create {}", summary_path.display()))?;
    for case in &suite.cases {
        summary_writer.serialize(case.summary())?;
    }
    summary_writer.flush()?;

    let sensitivity_path = output.join("sensitivity.csv");
    let mut sensitivity_writer = csv::Writer::from_path(&sensitivity_path)
        .with_context(|| format!("failed to create {}", sensitivity_path.display()))?;
    for row in &suite.sensitivity {
        sensitivity_writer.serialize(row)?;
    }
    sensitivity_writer.flush()?;

    write_replication_csvs(output, suite)?;
    write_control_capacities(output.join("control-capacities.csv"), suite)?;
    write_control_spectra(output.join("control-spectra.csv"), suite)?;
    write_control_feature_scales(output.join("control-feature-scales.csv"), suite)?;
    fs::write(
        output.join("report.md"),
        attribution_markdown(config, suite),
    )
    .with_context(|| format!("failed to write report in {}", output.display()))?;
    Ok(())
}

#[derive(Serialize)]
struct ReplicationSummaryRow<'a> {
    condition: &'a str,
    seed_count: usize,
    replicated_target_count: usize,
    replicated_minimum_total_capacity: f64,
    replicated_minimum_linear_capacity: f64,
    replicated_minimum_nonlinear_capacity: f64,
    replicated_minimum_current_capacity: f64,
    replicated_minimum_historical_capacity: f64,
}

#[derive(Serialize)]
struct ReplicatedTargetRow<'a> {
    condition: &'a str,
    target: &'a str,
    total_degree: usize,
    maximum_lag: usize,
    significant_seed_count: usize,
    required_seed_count: usize,
    replicated: bool,
    minimum_corrected_capacity: f64,
    mean_corrected_capacity: f64,
}

fn write_replication_csvs(output: &Path, suite: &AttributionSuite) -> Result<()> {
    let summary_path = output.join("replication-summary.csv");
    let mut summary_writer = csv::Writer::from_path(&summary_path)
        .with_context(|| format!("failed to create {}", summary_path.display()))?;
    let targets_path = output.join("replicated-targets.csv");
    let mut targets_writer = csv::Writer::from_path(&targets_path)
        .with_context(|| format!("failed to create {}", targets_path.display()))?;

    for replication in &suite.replication {
        summary_writer.serialize(replication_summary_row(replication))?;
        for target in &replication.targets {
            targets_writer.serialize(ReplicatedTargetRow {
                condition: &replication.condition,
                target: &target.target,
                total_degree: target.total_degree,
                maximum_lag: target.maximum_lag,
                significant_seed_count: target.significant_seed_count,
                required_seed_count: target.required_seed_count,
                replicated: target.replicated,
                minimum_corrected_capacity: target.minimum_corrected_capacity,
                mean_corrected_capacity: target.mean_corrected_capacity,
            })?;
        }
    }
    summary_writer.flush()?;
    targets_writer.flush()?;
    Ok(())
}

fn replication_summary_row(replication: &ReplicationSummary) -> ReplicationSummaryRow<'_> {
    ReplicationSummaryRow {
        condition: &replication.condition,
        seed_count: replication.seed_count,
        replicated_target_count: replication.replicated_target_count,
        replicated_minimum_total_capacity: replication.replicated_minimum_total_capacity,
        replicated_minimum_linear_capacity: replication.replicated_minimum_linear_capacity,
        replicated_minimum_nonlinear_capacity: replication.replicated_minimum_nonlinear_capacity,
        replicated_minimum_current_capacity: replication.replicated_minimum_current_capacity,
        replicated_minimum_historical_capacity: replication.replicated_minimum_historical_capacity,
    }
}

#[derive(Serialize)]
struct ControlTargetRow<'a> {
    case: &'a str,
    target: &'a str,
    total_degree: usize,
    maximum_lag: usize,
    interacting_lags: usize,
    raw_held_out_capacity: f64,
    positive_null_mean: f64,
    target_permutation_threshold: f64,
    familywise_permutation_threshold: f64,
    familywise_significant: bool,
    corrected_capacity: f64,
}

fn write_control_capacities(path: impl AsRef<Path>, suite: &AttributionSuite) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    for case in &suite.cases {
        for target in &case.capacity.targets {
            writer.serialize(ControlTargetRow {
                case: &case.name,
                target: &target.target,
                total_degree: target.total_degree,
                maximum_lag: target.maximum_lag,
                interacting_lags: target.interacting_lags,
                raw_held_out_capacity: target.raw_held_out_capacity,
                positive_null_mean: target.positive_null_mean,
                target_permutation_threshold: target.target_permutation_threshold,
                familywise_permutation_threshold: target.familywise_permutation_threshold,
                familywise_significant: target.familywise_significant,
                corrected_capacity: target.corrected_capacity,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

#[derive(Serialize)]
struct ControlSpectrumRow<'a> {
    case: &'a str,
    index: usize,
    normalized_singular_value: f64,
    relative_singular_value: f64,
}

fn write_control_spectra(path: impl AsRef<Path>, suite: &AttributionSuite) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    for case in &suite.cases {
        for (index, (&singular, &relative)) in case
            .capacity
            .observation_spectrum
            .normalized_singular_values
            .iter()
            .zip(&case.capacity.observation_spectrum.relative_singular_values)
            .enumerate()
        {
            writer.serialize(ControlSpectrumRow {
                case: &case.name,
                index,
                normalized_singular_value: singular,
                relative_singular_value: relative,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

#[derive(Serialize)]
struct ControlFeatureScaleRow<'a> {
    case: &'a str,
    feature: usize,
    training_mean: f64,
    training_scale: f64,
    relative_scale: f64,
}

fn write_control_feature_scales(path: impl AsRef<Path>, suite: &AttributionSuite) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    for case in &suite.cases {
        let spectrum = &case.capacity.observation_spectrum;
        for (feature, ((&mean, &scale), &relative)) in spectrum
            .training_feature_means
            .iter()
            .zip(&spectrum.training_feature_scales)
            .zip(&spectrum.relative_feature_scales)
            .enumerate()
        {
            writer.serialize(ControlFeatureScaleRow {
                case: &case.name,
                feature,
                training_mean: mean,
                training_scale: scale,
                relative_scale: relative,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

fn attribution_markdown(config: &Config, suite: &AttributionSuite) -> String {
    let case_rows = suite
        .cases
        .iter()
        .map(|case| {
            let summary = case.summary();
            format!(
                "| {} | {} | {} | {:.3} | {:.6} | {:.6} | {:.6} | {:.6} |",
                summary.name,
                summary.declared_observation_dimension,
                summary.effective_observation_rank,
                summary.stable_rank,
                summary.total_corrected_capacity,
                summary.linear_corrected_capacity,
                summary.nonlinear_corrected_capacity,
                summary.historical_input_corrected_capacity,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let sensitivity_rows = suite
        .sensitivity
        .iter()
        .map(sensitivity_markdown_row)
        .collect::<Vec<_>>()
        .join("\n");
    let replication_rows = suite
        .replication
        .iter()
        .map(|replication| {
            format!(
                "| {} | {} | {} | {:.6} | {:.6} | {:.6} | {:.6} |",
                replication.condition,
                replication.seed_count,
                replication.replicated_target_count,
                replication.replicated_minimum_total_capacity,
                replication.replicated_minimum_linear_capacity,
                replication.replicated_minimum_nonlinear_capacity,
                replication.replicated_minimum_historical_capacity,
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "# Attribution controls and estimator calibration\n\n\
         All cases use the same target basis and family-wise permutation protocol. A target is \
         retained only when its raw held-out score exceeds the {quantile:.3} quantile of the \
         per-trial maximum null score across the complete target family; its target-specific null \
         threshold is then subtracted. Each analysis uses {null_trials} joint target-family \
         permutations.\n\n\
         ## Attribution matrix\n\n\
         | Case | Declared dim. | Rank | Stable rank | Corrected total | Linear | Nonlinear | Historical |\n\
         | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n\
         {case_rows}\n\n\
         `direct-linear-input` and `direct-square-input` identify capacity already available from \
         the encoded input or square-law observation. `pump-only-intensity` tests whether autonomous \
         pump dynamics spuriously correlates with targets. Quadrature cases remove square-law \
         detection while charging two real observations per retained complex mode.\n\n\
         ## Seed and split sensitivity\n\n\
         | Axis | Condition | Seed | Train fraction | Rank | Stable rank | Corrected total | Nonlinear | Historical |\n\
         | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n\
         {sensitivity_rows}\n\n\
         ## Cross-seed replication gate\n\n\
         A target contributes here only if it passes the family-wise gate in every evaluated seed. \
         Its contribution is the minimum corrected capacity across those seeds. This lower-envelope \
         summary prevents a one-seed false positive from becoming evidence.\n\n\
         | Condition | Seeds | Replicated targets | Minimum total | Linear | Nonlinear | Historical |\n\
         | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n\
         {replication_rows}\n\n\
         `results.sqlite` is the canonical relational artifact. The full target-level results, \
         standardized singular spectra, pre-standardization feature scales, null thresholds, and \
         serialized suite are also exported adjacent to this report. Rank uses a \
         relative singular-value tolerance of \
         {rank_tolerance:.1e}; the serialized spectrum also reports stable rank, participation ratio, \
         and ranks at multiple tolerances.\n\n\
         These remain normalized-model controls. They do not provide LiTaO3 physical-unit \
         calibration, Raman response, detector bandwidth/noise, or out-of-window leakage.\n",
        quantile = config.null_quantile,
        null_trials = config.null_trials,
        rank_tolerance = config.rank_relative_tolerance,
    )
}

fn sensitivity_markdown_row(row: &SensitivityRow) -> String {
    format!(
        "| {} | {} | {} | {:.2} | {} | {:.3} | {:.6} | {:.6} | {:.6} |",
        row.axis,
        row.condition,
        row.seed,
        row.train_fraction,
        row.effective_observation_rank,
        row.stable_rank,
        row.total_corrected_capacity,
        row.nonlinear_corrected_capacity,
        row.historical_input_corrected_capacity,
    )
}

fn write_json(path: impl AsRef<Path>, value: &impl serde::Serialize) -> Result<()> {
    let path = path.as_ref();
    let file =
        fs::File::create(path).with_context(|| format!("failed to create {}", path.display()))?;
    serde_json::to_writer_pretty(file, value)
        .with_context(|| format!("failed to serialize {}", path.display()))?;
    Ok(())
}

fn write_capacity_csv(path: impl AsRef<Path>, result: &ExperimentResult) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    for target in &result.capacity.targets {
        writer.serialize(target)?;
    }
    writer.flush()?;
    Ok(())
}

fn write_group_csv(
    path: impl AsRef<Path>,
    groups: &[crate::capacity::GroupCapacity],
) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    for group in groups {
        writer.serialize(group)?;
    }
    writer.flush()?;
    Ok(())
}

fn write_samples_csv(path: impl AsRef<Path>, result: &ExperimentResult) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    let dimension = result.simulation.observations.first().map_or(0, Vec::len);
    let mut header = vec![
        "sample".to_owned(),
        "input".to_owned(),
        "state_power".to_owned(),
        "thermal_state".to_owned(),
    ];
    header.extend((0..dimension).map(|index| format!("observation_{index}")));
    writer.write_record(header)?;

    for index in 0..result.simulation.inputs.len() {
        let mut row = vec![
            index.to_string(),
            result.simulation.inputs[index].to_string(),
            result.simulation.state_power[index].to_string(),
            result.simulation.thermal_state[index].to_string(),
        ];
        row.extend(
            result.simulation.observations[index]
                .iter()
                .map(ToString::to_string),
        );
        writer.write_record(row)?;
    }
    writer.flush()?;
    Ok(())
}

fn write_spectrum_csv(path: impl AsRef<Path>, result: &ExperimentResult) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    writer.write_record([
        "index",
        "normalized_singular_value",
        "relative_singular_value",
    ])?;
    for (index, (singular, relative)) in result
        .capacity
        .observation_spectrum
        .normalized_singular_values
        .iter()
        .zip(
            &result
                .capacity
                .observation_spectrum
                .relative_singular_values,
        )
        .enumerate()
    {
        writer.write_record([
            index.to_string(),
            singular.to_string(),
            relative.to_string(),
        ])?;
    }
    writer.flush()?;
    Ok(())
}

fn write_feature_scales_csv(path: impl AsRef<Path>, result: &ExperimentResult) -> Result<()> {
    let path = path.as_ref();
    let mut writer = csv::Writer::from_path(path)
        .with_context(|| format!("failed to create {}", path.display()))?;
    writer.write_record([
        "feature",
        "training_mean",
        "training_scale",
        "relative_scale",
    ])?;
    let spectrum = &result.capacity.observation_spectrum;
    for (feature, ((mean, scale), relative)) in spectrum
        .training_feature_means
        .iter()
        .zip(&spectrum.training_feature_scales)
        .zip(&spectrum.relative_feature_scales)
        .enumerate()
    {
        writer.write_record([
            feature.to_string(),
            mean.to_string(),
            scale.to_string(),
            relative.to_string(),
        ])?;
    }
    writer.flush()?;
    Ok(())
}

fn markdown_report(config: &Config, result: &ExperimentResult) -> String {
    let summary = &result.summary;
    let degree_rows = result
        .capacity
        .by_degree
        .iter()
        .map(|group| {
            format!(
                "| {} | {} | {} | {:.6} | {:.6} |",
                group.group,
                group.target_count,
                group.significant_target_count,
                group.raw_positive_capacity,
                group.corrected_capacity
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let relative_singular_values = result
        .capacity
        .observation_spectrum
        .relative_singular_values
        .iter()
        .map(|value| format!("{value:.3e}"))
        .collect::<Vec<_>>()
        .join(", ");

    format!(
        "# Kerr observable-capacity report\n\n\
         ## Decision\n\n\
         `{decision}`: corrected capacity is {total:.6}, effective observation rank is {rank}, \
         and the signed rank margin is {margin:.6}. The finite-sample decision tolerance is \
         {tolerance:.3}.\n\n\
         ## Configuration and numerical checks\n\n\
         - Seed: `{seed}`\n\
         - Backend: `{backend:?}`\n\
         - Retained modes: `{modes}`\n\
         - Observation: `{observation:?}` ({declared} declared real features; {rank} effective rank at relative singular tolerance {rank_tolerance:.1e})\n\
         - Stable rank / participation ratio: `{stable_rank:.6}` / `{participation:.6}`\n\
         - Relative singular values: `{relative_singular_values}`\n\
         - Train/test samples: `{train}` / `{test}` after lag alignment\n\
         - Family-wise max-statistic {quantile:.3} permutation threshold: `{threshold:.6}` from {null_trials} joint permutations\n\
         - Family-wise significant targets: `{significant}` / `{targets}`\n\
         - Direct/pseudospectral RHS maximum error: `{cross_error:.6e}`\n\n\
         ## Capacity by polynomial degree\n\n\
         | Degree | Targets | Significant | Positive raw | Bias-corrected |\n\
         | ---: | ---: | ---: | ---: | ---: |\n\
         {degree_rows}\n\n\
         Linear corrected capacity is {linear:.6}; nonlinear corrected capacity is \
         {nonlinear:.6}. Current-input capacity is {current:.6}; capacity involving history is \
         {historical:.6}. The canonical relational artifact is `results.sqlite`; individual target \
         estimates are also exported to `capacities.csv`.\n\n\
         ## Declared normalized resources\n\n\
         - Simulated time: `{elapsed:.6}`\n\
         - Incident pump-energy integral: `{pump_energy:.6}`\n\
         - Incident signal-energy integral: `{signal_energy:.6}`\n\
         - Coupled drive-energy integral: `{drive_energy:.6}`\n\
         - Intrinsically dissipated state-energy integral: `{intrinsic_energy:.6}`\n\
         - Externally out-coupled state-energy integral: `{outcoupled_energy:.6}`\n\
         - Expected injected noise energy: `{noise_energy:.6}`\n\
         - Mean / peak intracavity power: `{mean_power:.6}` / `{peak_power:.6}`\n\
         - Final thermal detuning state: `{thermal:.6}`\n\n\
         ## Scope warning\n\n\
         These are normalized-model results, not a calibrated LiTaO3 device prediction. Raman \
         response is explicitly excluded (`raman_fraction = 0`), and detector bandwidth, detector \
         noise, out-of-window leakage, and dimensional conversion to physical energy remain future \
         model layers. The observation interface is one post-symbol bus-output snapshot; retaining \
         additional time samples would increase the declared observation resource.\n",
        decision = summary.decision,
        total = summary.total_corrected_capacity,
        rank = summary.effective_observation_rank,
        margin = summary.signed_effective_rank_margin,
        tolerance = summary.capacity_bound_tolerance,
        seed = summary.seed,
        backend = config.backend,
        modes = summary.modes,
        observation = config.observation,
        declared = summary.declared_observation_dimension,
        rank_tolerance = summary.rank_relative_tolerance,
        stable_rank = summary.observation_stable_rank,
        participation = summary.observation_participation_ratio,
        relative_singular_values = relative_singular_values,
        train = summary.train_samples,
        test = summary.test_samples,
        quantile = config.null_quantile,
        threshold = summary.familywise_permutation_threshold,
        null_trials = config.null_trials,
        significant = summary.significant_target_count,
        targets = summary.target_count,
        cross_error = summary.direct_pseudospectral_rhs_error,
        linear = summary.linear_corrected_capacity,
        nonlinear = summary.nonlinear_corrected_capacity,
        current = summary.current_input_corrected_capacity,
        historical = summary.historical_input_corrected_capacity,
        elapsed = summary.resources.elapsed_time,
        pump_energy = summary.resources.incident_pump_energy,
        signal_energy = summary.resources.incident_signal_energy,
        drive_energy = summary.resources.coupled_drive_energy,
        intrinsic_energy = summary.resources.intrinsic_dissipation_energy,
        outcoupled_energy = summary.resources.external_outcoupling_energy,
        noise_energy = summary.resources.expected_injected_noise_energy,
        mean_power = summary.mean_state_power,
        peak_power = summary.peak_state_power,
        thermal = summary.final_thermal_detuning,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::{Backend, Observation},
        experiment,
    };

    fn config() -> Config {
        Config {
            seed: 31,
            modes: 3,
            backend: Backend::DirectModal,
            dt: 0.02,
            steps_per_symbol: 1,
            warmup_symbols: 4,
            sample_symbols: 100,
            intrinsic_loss: 0.6,
            external_coupling: 0.4,
            detuning: 0.4,
            dispersion: 0.0,
            kerr_strength: 0.1,
            pump_amplitude: 0.8,
            input_scale: 0.1,
            input_mode: 0,
            noise_std: 0.0,
            detector_noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.0,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 1,
            max_lag: 1,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 20,
            null_quantile: 0.95,
            rank_relative_tolerance: 1e-6,
            save_samples: true,
        }
    }

    #[test]
    fn markdown_names_scope_and_bound() {
        let configuration = config();
        let result = experiment::run(&configuration).unwrap();
        let report = markdown_report(&configuration, &result);
        assert!(report.contains("effective observation rank"));
        assert!(report.contains("not a calibrated LiTaO3 device prediction"));
        assert!(report.contains("Raman"));
    }
}
