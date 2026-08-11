use crate::{config::Config, database, noise::NoiseSuite};
use anyhow::{Context, Result};
use serde::Serialize;
use std::{fs, path::Path};

pub fn write_all(output: impl AsRef<Path>, config: &Config, suite: &NoiseSuite) -> Result<()> {
    let output = output.as_ref();
    fs::create_dir_all(output)
        .with_context(|| format!("failed to create output directory {}", output.display()))?;

    // SQLite is the canonical transactional snapshot.  All remaining files
    // are derived inspection projections of the same in-memory suite.
    database::write_noise_suite(output.join("results.sqlite"), config, suite)?;
    write_json(output.join("noise-suite.json"), suite)?;
    write_cases(output.join("noise-cases.csv"), suite)?;
    write_feature_diagnostics(output.join("feature-diagnostics.csv"), suite)?;
    write_targets(output.join("noise-targets.csv"), suite)?;
    write_spectra(output.join("noise-spectra.csv"), suite)?;
    write_csv(
        output.join("paired-differences.csv"),
        &suite.paired_differences,
    )?;
    write_csv(output.join("noise-replication.csv"), &suite.replication)?;
    fs::write(output.join("report.md"), markdown(suite))?;
    Ok(())
}

fn write_json(path: impl AsRef<Path>, value: &impl Serialize) -> Result<()> {
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn write_csv<T: Serialize>(path: impl AsRef<Path>, rows: &[T]) -> Result<()> {
    let mut writer = csv::Writer::from_path(path)?;
    for row in rows {
        writer.serialize(row)?;
    }
    writer.flush()?;
    Ok(())
}

fn write_cases(path: impl AsRef<Path>, suite: &NoiseSuite) -> Result<()> {
    let rows: Vec<_> = suite.cases.iter().map(|case| case.summary()).collect();
    write_csv(path, &rows)
}

#[derive(Serialize)]
struct FeatureRow<'a> {
    condition: &'a str,
    seed: u64,
    detector_noise_std: f64,
    feature: usize,
    noiseless_training_mean: f64,
    signal_std: f64,
    declared_detector_noise_std: f64,
    realized_detector_noise_rms: f64,
    linear_power_snr: Option<f64>,
    snr_db: Option<f64>,
    snr_status: &'a str,
    signal_exceeds_declared_noise: bool,
}

fn write_feature_diagnostics(path: impl AsRef<Path>, suite: &NoiseSuite) -> Result<()> {
    let mut writer = csv::Writer::from_path(path)?;
    for case in &suite.cases {
        for diagnostic in &case.capacity.observation_spectrum.feature_diagnostics {
            writer.serialize(FeatureRow {
                condition: &case.condition,
                seed: case.seed,
                detector_noise_std: case.detector_noise_std,
                feature: diagnostic.feature,
                noiseless_training_mean: diagnostic.noiseless_training_mean,
                signal_std: diagnostic.signal_std,
                declared_detector_noise_std: diagnostic.declared_detector_noise_std,
                realized_detector_noise_rms: diagnostic.realized_detector_noise_rms,
                linear_power_snr: diagnostic.linear_power_snr,
                snr_db: diagnostic.snr_db,
                snr_status: &diagnostic.snr_status,
                signal_exceeds_declared_noise: diagnostic.signal_exceeds_declared_noise,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

#[derive(Serialize)]
struct TargetRow<'a> {
    condition: &'a str,
    seed: u64,
    detector_noise_std: f64,
    target: &'a str,
    total_degree: usize,
    maximum_lag: usize,
    raw_held_out_capacity: f64,
    familywise_permutation_threshold: f64,
    familywise_significant: bool,
    corrected_capacity: f64,
    standardized_weight_norm: f64,
    raw_equivalent_weight_norm: Option<f64>,
    raw_weight_conversion_defined: bool,
    detector_noise_gain: Option<f64>,
}

fn write_targets(path: impl AsRef<Path>, suite: &NoiseSuite) -> Result<()> {
    let mut writer = csv::Writer::from_path(path)?;
    for case in &suite.cases {
        for target in &case.capacity.targets {
            writer.serialize(TargetRow {
                condition: &case.condition,
                seed: case.seed,
                detector_noise_std: case.detector_noise_std,
                target: &target.target,
                total_degree: target.total_degree,
                maximum_lag: target.maximum_lag,
                raw_held_out_capacity: target.raw_held_out_capacity,
                familywise_permutation_threshold: target.familywise_permutation_threshold,
                familywise_significant: target.familywise_significant,
                corrected_capacity: target.corrected_capacity,
                standardized_weight_norm: target.standardized_weight_norm,
                raw_equivalent_weight_norm: target.raw_equivalent_weight_norm,
                raw_weight_conversion_defined: target.raw_weight_conversion_defined,
                detector_noise_gain: target.detector_noise_gain,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

#[derive(Serialize)]
struct SpectrumRow<'a> {
    condition: &'a str,
    seed: u64,
    detector_noise_std: f64,
    component: usize,
    observed_standardized_singular_value: f64,
    observed_standardized_relative_singular_value: f64,
    noiseless_standardized_singular_value: f64,
    noiseless_standardized_relative_singular_value: f64,
    noiseless_raw_singular_value: f64,
    above_noise_floor: bool,
}

fn write_spectra(path: impl AsRef<Path>, suite: &NoiseSuite) -> Result<()> {
    let mut writer = csv::Writer::from_path(path)?;
    for case in &suite.cases {
        let spectrum = &case.capacity.observation_spectrum;
        for component in 0..spectrum.normalized_singular_values.len() {
            writer.serialize(SpectrumRow {
                condition: &case.condition,
                seed: case.seed,
                detector_noise_std: case.detector_noise_std,
                component,
                observed_standardized_singular_value: spectrum.normalized_singular_values
                    [component],
                observed_standardized_relative_singular_value: spectrum.relative_singular_values
                    [component],
                noiseless_standardized_singular_value: spectrum
                    .noiseless_standardized_singular_values[component],
                noiseless_standardized_relative_singular_value: spectrum
                    .noiseless_standardized_relative_singular_values[component],
                noiseless_raw_singular_value: spectrum.noiseless_raw_singular_values[component],
                above_noise_floor: case.detector_noise_std == 0.0
                    || spectrum.noiseless_raw_singular_values[component] > case.detector_noise_std,
            })?;
        }
    }
    writer.flush()?;
    Ok(())
}

fn markdown(suite: &NoiseSuite) -> String {
    let mut text = format!(
        "# Detector-noise survival suite\n\n\
         - Units: {}.\n\
         - Seeds: {} through {} ({} total).\n\
         - Noise levels: {}.\n\
         - Predeclared decision floor: `{:.1e}`.\n\
         - Gate targets: {}.\n\
         - Gate passed: **{}**.\n\
         - Decision: `{}`.\n\n\
         ## Case summaries\n\n\
         | Noise std | Seed | Condition | Observed rank | Noiseless rank | Noise-aware dimension | Corrected total | Historical |\n\
         | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |\n",
        suite.observation_noise_units,
        suite.base_seed,
        suite.base_seed + suite.evaluated_seed_count as u64 - 1,
        suite.evaluated_seed_count,
        suite
            .detector_noise_levels
            .iter()
            .map(|level| format!("`{level:.1e}`"))
            .collect::<Vec<_>>()
            .join(", "),
        suite.decision_floor,
        suite.gate_targets.join(", "),
        suite.gate_passed,
        suite.decision,
    );
    for case in &suite.cases {
        let summary = case.summary();
        text.push_str(&format!(
            "| {:.1e} | {} | {} | {} | {} | {} | {:.6} | {:.6} |\n",
            summary.detector_noise_std,
            summary.seed,
            summary.condition,
            summary.observed_standardized_rank,
            summary.noiseless_numerical_rank,
            summary.noise_aware_observable_dimension,
            summary.total_corrected_capacity,
            summary.historical_corrected_capacity,
        ));
    }
    text.push_str(
        "\n## Gate-target cross-seed outcomes\n\n\
         | Noise std | Target | Kerr seeds | Control seeds | Positive deltas | Signed lower envelope | Mean delta | Replicated advantage |\n\
         | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- |\n",
    );
    for outcome in suite
        .replication
        .iter()
        .filter(|outcome| suite.gate_targets.contains(&outcome.target))
    {
        text.push_str(&format!(
            "| {:.1e} | {} | {}/{} | {}/{} | {}/{} | {:.6} | {:.6} | {} |\n",
            outcome.detector_noise_std,
            outcome.target,
            outcome.kerr_significant_seed_count,
            outcome.required_seed_count,
            outcome.disabled_significant_seed_count,
            outcome.required_seed_count,
            outcome.positive_delta_seed_count,
            outcome.required_seed_count,
            outcome.minimum_kerr_minus_disabled,
            outcome.mean_kerr_minus_disabled,
            outcome.paired_advantage_replicated,
        ));
    }
    text.push_str(&format!(
        "\n## Declared criteria\n\n- Common draws: {}.\n- Observable dimension: {}.\n",
        suite.common_random_number_rule, suite.noise_aware_dimension_rule
    ));
    text
}
