use super::{
    configuration::{self, ConfigurationCapacity, EntropyConfig},
    dynamics::{self, Dynamics},
    modes::{self, StateOperator},
    singular,
};
use anyhow::{Context, Result};
use serde::Serialize;
use std::{fs, path::PathBuf};

#[derive(Debug, Serialize)]
pub struct TransientCapacity {
    pub state_dimension: usize,
    pub leading_singular_estimates: Vec<f64>,
    pub effective_rank: f64,
    pub condition_number: Option<f64>,
    pub state_capacity_bits_proxy: f64,
    pub raw_volumetric_modes: Option<f64>,
}
#[derive(Debug, Serialize)]
pub struct EntropyAnalysis {
    pub substrate: String,
    pub configuration: ConfigurationCapacity,
    pub transient_state: TransientCapacity,
    pub recurrent_dynamics: Dynamics,
    pub observed_failure_modes: Vec<String>,
    pub recommendation: String,
}
pub fn characterize(cfg: &EntropyConfig, op: &dyn StateOperator) -> Result<EntropyAnalysis> {
    let input = singular::normalized_probe(op.dimension(), cfg.seed);
    let zero = vec![0.0; op.dimension()];
    let spectrum = singular::spectrum(
        op,
        &zero,
        &input,
        cfg.probes,
        cfg.jvp_tolerance,
        cfg.seed + 100,
    );
    let rank = singular::effective_rank_threshold(&spectrum, cfg.singular_threshold);
    let min = spectrum.iter().copied().filter(|x| *x > 1e-12).next_back();
    let condition = min.map(|x| spectrum[0] / x);
    let snr = cfg.snr.unwrap_or(100.0) / (1.0 + op.noise_std().powi(2) * cfg.snr.unwrap_or(100.0));
    let transient = TransientCapacity {
        state_dimension: op.dimension(),
        leading_singular_estimates: spectrum.clone(),
        effective_rank: rank,
        condition_number: condition,
        state_capacity_bits_proxy: spectrum.iter().map(|s| (1.0 + snr * s * s).log2()).sum(),
        raw_volumetric_modes: modes::raw_modal_estimate(cfg),
    };
    let dyns = dynamics::analyze(cfg, op);
    let mut failures: Vec<String> = Vec::new();
    let last = dyns.rows.last().unwrap();
    if last.perturbation_survival < 0.01 {
        failures.push("rapid collapse of distinguishable perturbations".into())
    }
    if last.trajectory_divergence > 0.5 {
        failures.push("uncontrolled exponential trajectory divergence".into())
    }
    if rank < 2.0 {
        failures.push("low effective modal rank".into())
    }
    if dyns.limit_cycle_period.is_some() {
        failures.push("early limit cycle detected".into())
    }
    let recommendation = if failures
        .iter()
        .any(|x| x.contains("uncontrolled") || x.contains("collapse"))
    {
        "reject"
    } else if failures.is_empty() {
        "advance"
    } else {
        "modify"
    }
    .into();
    Ok(EntropyAnalysis {
        substrate: cfg.name.clone(),
        configuration: configuration::capacity(cfg),
        transient_state: transient,
        recurrent_dynamics: dyns,
        observed_failure_modes: failures,
        recommendation,
    })
}
pub fn write_all(cfg: &EntropyConfig, a: &EntropyAnalysis) -> Result<()> {
    let dir = PathBuf::from(&cfg.output_dir);
    fs::create_dir_all(&dir)?;
    fs::write(
        dir.join("entropy-summary.json"),
        serde_json::to_string_pretty(a)?,
    )?;
    let mut s = csv::Writer::from_path(dir.join("singular-values.csv"))?;
    s.write_record(["rank", "estimated_singular_value"])?;
    for (i, v) in a
        .transient_state
        .leading_singular_estimates
        .iter()
        .enumerate()
    {
        s.serialize((i + 1, v))?
    }
    s.flush()?;
    let mut d = csv::Writer::from_path(dir.join("recurrence-dynamics.csv"))?;
    for row in &a.recurrent_dynamics.rows {
        d.serialize(row)?
    }
    d.flush()?;
    fs::write(dir.join("entropy-report.md"), human_report(a)).context("write human report")?;
    Ok(())
}
pub fn human_report(a: &EntropyAnalysis) -> String {
    format!(
        "# Entropy Characterization: {}\n\n## 1. Configuration Capacity\n\n{} parameters, {} states each; raw {:.3} bits, effective {:.3} bits.\n\n## 2. Transient-State Capacity\n\nDimension {}; effective rank {:.3}; capacity proxy {:.3} bits. Raw volumetric modes: {}.\n\n## 3. Recurrent Dynamics\n\nEvaluated at T = {:?}. Apparent attractors: {}; limit cycle: {:?}.\n\n## 4. Observed Failure Modes\n\n{}\n\n## 5. Recommendation: {}\n",
        a.substrate,
        a.configuration.parameter_count,
        a.configuration.states_per_parameter,
        a.configuration.raw_bits,
        a.configuration.effective_bits,
        a.transient_state.state_dimension,
        a.transient_state.effective_rank,
        a.transient_state.state_capacity_bits_proxy,
        a.transient_state
            .raw_volumetric_modes
            .map(|x| format!("{x:.3e}"))
            .unwrap_or_else(|| "not configured".into()),
        a.recurrent_dynamics
            .rows
            .iter()
            .map(|r| r.recurrence)
            .collect::<Vec<_>>(),
        a.recurrent_dynamics.apparent_attractor_count,
        a.recurrent_dynamics.limit_cycle_period,
        if a.observed_failure_modes.is_empty() {
            "None observed at configured probe resolution.".into()
        } else {
            a.observed_failure_modes
                .iter()
                .map(|x| format!("- {x}"))
                .collect::<Vec<_>>()
                .join("\n")
        },
        a.recommendation
    )
}
