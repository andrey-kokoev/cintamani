use crate::{config::Config, experiment::ExperimentResult};
use anyhow::{Context, Result};
use std::{fs, path::Path};

pub fn write_all(
    output: impl AsRef<Path>,
    config: &Config,
    result: &ExperimentResult,
) -> Result<()> {
    let output = output.as_ref();
    fs::create_dir_all(output)
        .with_context(|| format!("failed to create output directory {}", output.display()))?;

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
    if config.save_samples {
        write_samples_csv(output.join("samples.csv"), result)?;
    }
    fs::write(output.join("report.md"), markdown_report(config, result))
        .with_context(|| format!("failed to write report in {}", output.display()))?;
    Ok(())
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

fn markdown_report(config: &Config, result: &ExperimentResult) -> String {
    let summary = &result.summary;
    let degree_rows = result
        .capacity
        .by_degree
        .iter()
        .map(|group| {
            format!(
                "| {} | {} | {:.6} | {:.6} |",
                group.group,
                group.target_count,
                group.raw_positive_capacity,
                group.corrected_capacity
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

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
         - Observation: `{observation:?}` ({declared} declared real features; {rank} effective rank)\n\
         - Train/test samples: `{train}` / `{test}` after lag alignment\n\
         - Global {quantile:.3} permutation threshold: `{threshold:.6}`\n\
         - Direct/pseudospectral RHS maximum error: `{cross_error:.6e}`\n\n\
         ## Capacity by polynomial degree\n\n\
         | Degree | Targets | Positive raw | Bias-corrected |\n\
         | ---: | ---: | ---: | ---: |\n\
         {degree_rows}\n\n\
         Linear corrected capacity is {linear:.6}; nonlinear corrected capacity is \
         {nonlinear:.6}. Current-input capacity is {current:.6}; capacity involving history is \
         {historical:.6}. Individual target estimates are in `capacities.csv`.\n\n\
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
        train = summary.train_samples,
        test = summary.test_samples,
        quantile = config.null_quantile,
        threshold = summary.global_permutation_threshold,
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
            thermal_coupling: 0.0,
            thermal_decay: 0.0,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 1,
            max_lag: 1,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 1,
            null_quantile: 0.95,
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
