use crate::entropy::{
    configuration::EntropyConfig,
    dynamics,
    modes::operator_from_config,
    perturbation::{evolve, l2},
    report, singular,
};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize)]
pub struct SweepConfig {
    pub output_dir: String,
    pub reference_configs: Vec<String>,
    pub seeds: Vec<u64>,
    pub probe_counts: Vec<usize>,
    pub perturbations: Vec<f64>,
    pub jvp_tolerances: Vec<f64>,
    pub singular_thresholds: Vec<f64>,
    pub cycle_tolerances: Vec<f64>,
    pub gamma: Vec<f64>,
    pub coupling_scale: Vec<f64>,
    pub nonlinear_strength: Vec<f64>,
    pub loss: Vec<f64>,
    pub input_injection: Vec<f64>,
    pub noise: Vec<f64>,
    pub connectivity_radius: Vec<usize>,
    pub base: EntropyConfig,
}
#[derive(Clone, Debug, Serialize)]
struct ConvergenceRow {
    metric: String,
    setting: String,
    seed: u64,
    value: f64,
    ci95_low: f64,
    ci95_high: f64,
    converged: bool,
}
#[derive(Clone, Debug, Serialize)]
struct ModeRow {
    candidate: String,
    seed: u64,
    mode: String,
    norm_t32: f64,
    survival_t16: f64,
    survival_t32: f64,
    effective_rank_t32: f64,
    cycle_period: Option<usize>,
}
#[derive(Clone, Debug, Serialize)]
struct SweepRow {
    candidate: String,
    seed: u64,
    gamma: f64,
    coupling_scale: f64,
    nonlinear_strength: f64,
    loss: f64,
    input_injection: f64,
    noise: f64,
    connectivity_radius: usize,
    peak_norm_through_t32: f64,
    norm_t32: f64,
    survival_t16: f64,
    survival_t32: f64,
    effective_rank_t32: f64,
    effective_rank_retention: f64,
    noise_adjusted_capacity_bits: f64,
    cycle_period: Option<usize>,
    input_separation: f64,
    nonlinear_effect: f64,
    accepted: bool,
    failure_reasons: String,
}

pub fn run(path: impl AsRef<Path>) -> Result<()> {
    let path = path.as_ref();
    let spec: SweepConfig = toml::from_str(&fs::read_to_string(path).context("read sweep config")?)
        .context("parse sweep config")?;
    let out = PathBuf::from(&spec.output_dir);
    fs::create_dir_all(&out)?;
    let (calibrated, mut calibration) = calibrate_references(&spec)?;
    let convergence = convergence_rows(&spec);
    write_csv(out.join("estimator-convergence.csv"), &convergence)?;
    let mut metric_settings =
        std::collections::HashMap::<String, std::collections::HashSet<String>>::new();
    for r in convergence.iter().filter(|r| r.converged) {
        metric_settings
            .entry(r.metric.clone())
            .or_default()
            .insert(r.setting.clone());
    }
    let robust = metric_settings.values().all(|settings| settings.len() >= 2);
    let unstable: Vec<_> = convergence
        .iter()
        .filter(|r| !r.converged)
        .map(|r| format!("{} ({})", r.metric, r.setting))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect();
    calibration += &format!(
        "\n\n## Trustworthy measurements\n\nConverged settings are recorded in `estimator-convergence.csv`. Unstable settings excluded from decisions: {}.\n",
        if unstable.is_empty() {
            "none".into()
        } else {
            unstable.join(", ")
        }
    );
    fs::write(out.join("calibration-report.md"), calibration)?;
    let (modes, sweep) = search(&spec, robust)?;
    write_csv(out.join("autonomous-vs-driven.csv"), &modes)?;
    write_csv(out.join("substrate-sweep.csv"), &sweep)?;
    fs::write(
        out.join("candidate-ranking.md"),
        ranking(&sweep, calibrated, robust),
    )?;
    Ok(())
}
fn write_csv<T: Serialize>(path: PathBuf, rows: &[T]) -> Result<()> {
    let mut w = csv::Writer::from_path(path)?;
    for r in rows {
        w.serialize(r)?
    }
    w.flush()?;
    Ok(())
}
fn metric(d: &dynamics::Dynamics, t: usize) -> &dynamics::RecurrenceMetric {
    d.rows.iter().find(|r| r.recurrence == t).unwrap()
}
fn calibrate_references(spec: &SweepConfig) -> Result<(bool, String)> {
    let mut lines = vec![
        "# Entropy Estimator Calibration".into(),
        "".into(),
        "| Operator | Spectrum/rank | Survival | Cycle | Result |".into(),
        "|---|---:|---:|---:|---|".into(),
    ];
    let mut all = true;
    for file in &spec.reference_configs {
        let cfg = EntropyConfig::load(file)?;
        let op = operator_from_config(&cfg);
        let a = report::characterize(&cfg, op.as_ref())?;
        let d = dynamics::analyze_mode(&cfg, op.as_ref(), false);
        let survival = metric(&d, 4).perturbation_survival;
        let cycle = d.limit_cycle_period;
        let expected = match cfg.operator {
            super::configuration::OperatorKind::Identity => {
                (survival - 1.0).abs() < 1e-5 && cycle == Some(1)
            }
            super::configuration::OperatorKind::Contraction => {
                (survival - cfg.scalar.unwrap().powi(4)).abs() < 1e-4
            }
            super::configuration::OperatorKind::Expansion => {
                (survival - cfg.scalar.unwrap().powi(4)).abs() < 1e-3
            }
            super::configuration::OperatorKind::Unitary => (survival - 1.0).abs() < 1e-4,
            super::configuration::OperatorKind::LowRank => {
                (a.transient_state.effective_rank - cfg.rank.unwrap() as f64).abs() < 0.2
            }
            super::configuration::OperatorKind::Period2 => cycle == Some(2),
            super::configuration::OperatorKind::Period4 => cycle == Some(4),
            super::configuration::OperatorKind::NoisyIdentity => {
                a.transient_state.state_capacity_bits_proxy
                    < cfg.state_dimension() as f64 * (1.0 + cfg.snr.unwrap_or(100.0)).log2()
            }
            _ => false,
        };
        all &= expected;
        lines.push(format!(
            "| {} | {:.3} | {:.3} | {:?} | {} |",
            cfg.name,
            a.transient_state.effective_rank,
            survival,
            cycle,
            if expected { "pass" } else { "FAIL" }
        ));
    }
    lines.push(format!("\nEstimator calibrated: **{}**. Acceptance decisions remain disabled unless convergence also passes.",all));
    Ok((all, lines.join("\n")))
}
fn stats(values: &[f64]) -> (f64, f64, f64) {
    let mean = values.iter().sum::<f64>() / values.len() as f64;
    let sd = (values.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / values.len().max(2) as f64)
        .sqrt();
    let half = 1.96 * sd / (values.len() as f64).sqrt();
    (mean, mean - half, mean + half)
}
fn convergence_rows(spec: &SweepConfig) -> Vec<ConvergenceRow> {
    let mut groups: Vec<(String, String, Vec<f64>)> = Vec::new();
    for &p in &spec.probe_counts {
        let mut v = Vec::new();
        for &seed in &spec.seeds {
            let mut c = spec.base.clone();
            c.seed = seed;
            c.probes = p;
            let op = operator_from_config(&c);
            v.push(
                report::characterize(&c, op.as_ref())
                    .unwrap()
                    .transient_state
                    .effective_rank
                    / p as f64,
            )
        }
        groups.push(("effective_rank".into(), format!("probes={p}"), v))
    }
    for &e in &spec.perturbations {
        let mut v = Vec::new();
        for &seed in &spec.seeds {
            let mut c = spec.base.clone();
            c.seed = seed;
            c.perturbation = e;
            let op = operator_from_config(&c);
            v.push(
                metric(&dynamics::analyze_mode(&c, op.as_ref(), false), 32).perturbation_survival,
            )
        }
        groups.push((
            "perturbation_survival_t32".into(),
            format!("perturbation={e}"),
            v,
        ))
    }
    for &e in &spec.jvp_tolerances {
        let mut v = Vec::new();
        for &seed in &spec.seeds {
            let mut c = spec.base.clone();
            c.seed = seed;
            c.jvp_tolerance = e;
            let op = operator_from_config(&c);
            v.push(
                report::characterize(&c, op.as_ref())
                    .unwrap()
                    .transient_state
                    .effective_rank
                    / c.probes as f64,
            )
        }
        groups.push(("effective_rank".into(), format!("jvp_tolerance={e}"), v))
    }
    for &e in &spec.singular_thresholds {
        let mut c = spec.base.clone();
        c.singular_threshold = e;
        let op = operator_from_config(&c);
        groups.push((
            "effective_rank".into(),
            format!("singular_threshold={e}"),
            vec![
                report::characterize(&c, op.as_ref())
                    .unwrap()
                    .transient_state
                    .effective_rank
                    / c.probes as f64;
                spec.seeds.len()
            ],
        ))
    }
    for &e in &spec.cycle_tolerances {
        let mut c = spec.base.clone();
        c.cycle_tolerance = e;
        let op = operator_from_config(&c);
        groups.push((
            "cycle_period".into(),
            format!("cycle_tolerance={e}"),
            vec![
                dynamics::analyze_mode(&c, op.as_ref(), false)
                    .limit_cycle_period
                    .unwrap_or(0) as f64;
                spec.seeds.len()
            ],
        ))
    }
    let mut rows = Vec::new();
    let mut centers = std::collections::HashMap::<String, Vec<f64>>::new();
    for (metric_name, _, v) in &groups {
        let (mean, _, _) = stats(v);
        centers.entry(metric_name.clone()).or_default().push(mean);
    }
    for (metric_name, setting, v) in groups {
        let (mean, lo, hi) = stats(&v);
        let mut metric_centers = centers[&metric_name].clone();
        metric_centers.sort_by(|a, b| a.total_cmp(b));
        let center = metric_centers[metric_centers.len() / 2];
        let converged = (hi - lo) <= 0.10 * mean.abs().max(1.0)
            && (mean - center).abs() <= 0.10 * center.abs().max(1.0);
        for &seed in &spec.seeds {
            rows.push(ConvergenceRow {
                metric: metric_name.clone(),
                setting: setting.clone(),
                seed,
                value: mean,
                ci95_low: lo,
                ci95_high: hi,
                converged,
            })
        }
    }
    rows
}
fn search(spec: &SweepConfig, robust: bool) -> Result<(Vec<ModeRow>, Vec<SweepRow>)> {
    let mut mode_rows = Vec::new();
    let mut rows = Vec::new();
    let baseline = (
        &spec.gamma[spec.gamma.len() / 2],
        &spec.coupling_scale[spec.coupling_scale.len() / 2],
        &spec.nonlinear_strength[spec.nonlinear_strength.len() / 2],
        &spec.loss[spec.loss.len() / 2],
        &spec.input_injection[spec.input_injection.len() / 2],
        &spec.noise[0],
        &spec.connectivity_radius[0],
    );
    let mut settings = Vec::new();
    for &x in &spec.gamma {
        settings.push((
            x,
            *baseline.1,
            *baseline.2,
            *baseline.3,
            *baseline.4,
            *baseline.5,
            *baseline.6,
        ))
    }
    for &x in &spec.coupling_scale {
        settings.push((
            *baseline.0,
            x,
            *baseline.2,
            *baseline.3,
            *baseline.4,
            *baseline.5,
            *baseline.6,
        ))
    }
    for &x in &spec.nonlinear_strength {
        settings.push((
            *baseline.0,
            *baseline.1,
            x,
            *baseline.3,
            *baseline.4,
            *baseline.5,
            *baseline.6,
        ))
    }
    for &x in &spec.loss {
        settings.push((
            *baseline.0,
            *baseline.1,
            *baseline.2,
            x,
            *baseline.4,
            *baseline.5,
            *baseline.6,
        ))
    }
    for &x in &spec.input_injection {
        settings.push((
            *baseline.0,
            *baseline.1,
            *baseline.2,
            *baseline.3,
            x,
            *baseline.5,
            *baseline.6,
        ))
    }
    for &x in &spec.noise {
        settings.push((
            *baseline.0,
            *baseline.1,
            *baseline.2,
            *baseline.3,
            *baseline.4,
            x,
            *baseline.6,
        ))
    }
    for &x in &spec.connectivity_radius {
        settings.push((
            *baseline.0,
            *baseline.1,
            *baseline.2,
            *baseline.3,
            *baseline.4,
            *baseline.5,
            x,
        ))
    }
    // A focused Cartesian refinement is necessary because viable recurrence is
    // an interaction among residual memory, coupling, nonlinearity, and drive.
    for &g in &spec.gamma {
        for &coupling in &spec.coupling_scale {
            for &nl in &spec.nonlinear_strength {
                for &input in &spec.input_injection {
                    settings.push((
                        g,
                        coupling,
                        nl,
                        *baseline.3,
                        input,
                        *baseline.5,
                        *baseline.6,
                    ));
                }
            }
        }
    }
    settings.sort_by(|a, b| format!("{a:?}").cmp(&format!("{b:?}")));
    settings.dedup();
    for (idx, (g, coupling, nl, loss, input, noise, radius)) in settings.into_iter().enumerate() {
        for &seed in &spec.seeds {
            let mut cfg = spec.base.clone();
            cfg.seed = seed;
            cfg.residual_gamma = Some(g);
            cfg.coupling_scale = Some(coupling);
            cfg.alpha = nl;
            cfg.transmission = loss;
            cfg.q_injection = input;
            cfg.noise = Some(noise);
            cfg.kernel_size = 2 * radius + 1;
            let op = operator_from_config(&cfg);
            let auto = dynamics::analyze_mode(&cfg, op.as_ref(), false);
            let driven = dynamics::analyze_mode(&cfg, op.as_ref(), true);
            let name = format!("candidate-{idx}");
            for (label, d) in [("autonomous", &auto), ("driven", &driven)] {
                mode_rows.push(ModeRow {
                    candidate: name.clone(),
                    seed,
                    mode: label.into(),
                    norm_t32: metric(d, 32).state_norm,
                    survival_t16: metric(d, 16).perturbation_survival,
                    survival_t32: metric(d, 32).perturbation_survival,
                    effective_rank_t32: metric(d, 32).jacobian_effective_rank,
                    cycle_period: d.limit_cycle_period,
                })
            }
            let n = op.dimension();
            let q = singular::normalized_probe(n, seed + 900);
            let qm: Vec<_> = q.iter().map(|x| -x).collect();
            let initial = singular::normalized_probe(n, seed + 901);
            let sep = l2(
                &evolve(op.as_ref(), initial.clone(), &q, 32),
                &evolve(op.as_ref(), initial.clone(), &qm, 32),
            );
            let mut linear_cfg = cfg.clone();
            linear_cfg.nonlinear = false;
            let linear = operator_from_config(&linear_cfg);
            let nonlinear_effect = l2(
                &evolve(op.as_ref(), initial.clone(), &q, 32),
                &evolve(linear.as_ref(), initial, &q, 32),
            );
            let m = metric(&driven, 32);
            let rank_t1 = metric(&driven, 1).jacobian_effective_rank;
            let rank_retention = m.jacobian_effective_rank / rank_t1.max(f64::EPSILON);
            let peak_norm = driven.rows.iter().map(|r| r.state_norm).fold(0.0, f64::max);
            let effective_snr =
                cfg.snr.unwrap_or(100.0) / (1.0 + noise.powi(2) * cfg.snr.unwrap_or(100.0));
            let capacity = driven
                .jacobian_singular_estimates
                .iter()
                .map(|s| (1.0 + effective_snr * s * s).log2())
                .sum();
            let mut fail = Vec::new();
            if !peak_norm.is_finite() || peak_norm > 100.0 {
                fail.push("norm explosion")
            }
            if driven.limit_cycle_period.is_some_and(|p| p <= 4) {
                fail.push("early short cycle")
            }
            if metric(&driven, 16).perturbation_survival < 0.01 || m.perturbation_survival < 0.01 {
                fail.push("perturbation collapse")
            }
            if m.jacobian_effective_rank < 2.0 || rank_retention < 0.8 {
                fail.push("rank collapse")
            }
            if sep < 1e-3 {
                fail.push("inputs not distinguishable")
            }
            if nonlinear_effect < 1e-4 {
                fail.push("nonlinear ablation unchanged")
            }
            if !robust {
                fail.push("estimator not converged")
            }
            rows.push(SweepRow {
                candidate: name,
                seed,
                gamma: g,
                coupling_scale: coupling,
                nonlinear_strength: nl,
                loss,
                input_injection: input,
                noise,
                connectivity_radius: radius,
                peak_norm_through_t32: peak_norm,
                norm_t32: m.state_norm,
                survival_t16: metric(&driven, 16).perturbation_survival,
                survival_t32: m.perturbation_survival,
                effective_rank_t32: m.jacobian_effective_rank,
                effective_rank_retention: rank_retention,
                noise_adjusted_capacity_bits: capacity,
                cycle_period: driven.limit_cycle_period,
                input_separation: sep,
                nonlinear_effect,
                accepted: fail.is_empty(),
                failure_reasons: fail.join("; "),
            });
        }
    }
    Ok((mode_rows, rows))
}
fn ranking(rows: &[SweepRow], calibrated: bool, robust: bool) -> String {
    let mut groups = std::collections::BTreeMap::<String, Vec<&SweepRow>>::new();
    for r in rows {
        groups.entry(r.candidate.clone()).or_default().push(r)
    }
    let mut ranked: Vec<_> = groups
        .into_iter()
        .map(|(name, v)| {
            let all = v.iter().all(|r| r.accepted);
            let score = v
                .iter()
                .map(|r| r.survival_t32.min(10.0) + r.effective_rank_t32 + r.input_separation)
                .sum::<f64>()
                / v.len() as f64;
            let failures = v
                .iter()
                .flat_map(|r| r.failure_reasons.split("; "))
                .filter(|x| !x.is_empty())
                .collect::<std::collections::BTreeSet<_>>()
                .into_iter()
                .collect::<Vec<_>>()
                .join("; ");
            (name, all, score, failures)
        })
        .collect();
    ranked.sort_by(|a, b| b.2.total_cmp(&a.2));
    let advancing = calibrated && robust && ranked.iter().any(|x| x.1);
    let mut text = format!(
        "# Candidate Ranking\n\nEstimator calibrated: **{calibrated}**. Estimator settings converged: **{robust}**.\n\n| Rank | Candidate | Across-seed acceptance | Score | Failure modes |\n|---:|---|---|---:|---|\n"
    );
    for (i, (n, a, s, f)) in ranked.iter().enumerate() {
        text += &format!(
            "| {} | {} | {} | {:.4} | {} |\n",
            i + 1,
            n,
            a,
            s,
            if f.is_empty() { "none" } else { f }
        )
    }
    text += &format!(
        "\n## MNIST decision\n\n**{}**. {}\n",
        if advancing {
            "ADVANCE"
        } else {
            "DO NOT ADVANCE"
        },
        if advancing {
            "At least one candidate passed every gate across seeds."
        } else {
            "No candidate is authorized until calibration, convergence, and every dynamical gate pass."
        }
    );
    text
}
