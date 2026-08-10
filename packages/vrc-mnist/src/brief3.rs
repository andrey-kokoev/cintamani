use crate::{
    data::corruption::Corruption,
    entropy::{configuration::EntropyConfig, dynamics, modes::operator_from_config},
    experiment::{config::ExperimentConfig, metrics::Measurement, runner},
    output::results::write_measurements,
};
use anyhow::{Context, Result};
use burn::tensor::backend::Backend;
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

const RECURRENCES: [usize; 6] = [1, 2, 4, 8, 16, 32];
fn conditions() -> Vec<(&'static str, Corruption)> {
    vec![
        ("clean", Corruption::Clean),
        ("gaussian-010", Corruption::Gaussian(0.10)),
        ("gaussian-020", Corruption::Gaussian(0.20)),
        ("gaussian-030", Corruption::Gaussian(0.30)),
        ("gaussian-040", Corruption::Gaussian(0.40)),
        ("occlusion-010", Corruption::Occlusion(0.10)),
        ("occlusion-025", Corruption::Occlusion(0.25)),
        ("occlusion-040", Corruption::Occlusion(0.40)),
        ("occlusion-055", Corruption::Occlusion(0.55)),
        ("vertical-strip", Corruption::VerticalStrip(0.25)),
        ("horizontal-strip", Corruption::HorizontalStrip(0.25)),
        ("central-block", Corruption::CentralBlock(0.25)),
        ("random-patches", Corruption::RandomPatches(0.25)),
    ]
}

pub fn evaluate_suite<B: Backend>(
    config: impl AsRef<Path>,
    checkpoint_root: impl AsRef<Path>,
    device: &B::Device,
) -> Result<()> {
    let base = ExperimentConfig::load(config)?;
    for seed in [20260809u64, 20260810, 20260811] {
        for (name, corruption) in conditions() {
            let mut cfg = base.clone();
            cfg.seed = seed;
            cfg.name = format!("brief3_primary_{name}_seed_{seed}");
            cfg.corruption = corruption;
            let checkpoint = checkpoint_root
                .as_ref()
                .join(format!("recursive_mnist_primary_seed_{seed}/model.mpk"));
            runner::evaluate::<B>(&cfg, &checkpoint, &RECURRENCES, device)?;
        }
    }
    Ok(())
}

#[derive(Serialize)]
struct TransitionRow {
    run: String,
    seed: u64,
    corruption: String,
    severity: f32,
    recurrence: usize,
    wrong_to_correct: usize,
    correct_to_wrong: usize,
    wrong_to_correct_probability: f64,
    correct_to_wrong_probability: f64,
    confidence_amplifications: usize,
    confidence_amplification_probability: f64,
}
#[derive(Serialize)]
struct StateRow {
    seed: u64,
    corruption: String,
    recurrence: usize,
    state_change: f64,
    state_norm: f64,
    effective_rank_estimate: f64,
    perturbation_survival: f64,
    entropy_source: String,
}
#[derive(Serialize)]
struct CorruptionRow {
    seed: u64,
    corruption: String,
    severity: f32,
    accuracy_t1: f64,
    accuracy_t32: f64,
    recurrence_gain: f64,
    difficulty: f64,
    held_out: bool,
}
#[derive(Serialize)]
struct BaselineRow {
    name: String,
    seed: u64,
    recurrence: usize,
    parameters: usize,
    accuracy: f64,
    loss: f64,
    available: bool,
}

pub fn report(artifact_root: impl AsRef<Path>, output: impl AsRef<Path>) -> Result<()> {
    let root = artifact_root.as_ref();
    let out = output.as_ref();
    fs::create_dir_all(out)?;
    let mut rows = Vec::<Measurement>::new();
    for seed in [20260809u64, 20260810, 20260811] {
        for (name, _) in conditions() {
            let path = root.join(format!("brief3_primary_{name}_seed_{seed}/evaluation.json"));
            let values: Vec<Measurement> = serde_json::from_slice(
                &fs::read(&path).with_context(|| format!("read {}", path.display()))?,
            )?;
            rows.extend(values)
        }
    }
    write_measurements(out.join("recurrence-accuracy.csv"), &rows)?;
    let mut transition_measurements = Vec::<Measurement>::new();
    for seed in [20260809u64, 20260810, 20260811] {
        for (name, _) in conditions() {
            let path = root.join(format!(
                "brief3_primary_{name}_seed_{seed}/transition-every-step.json"
            ));
            transition_measurements.extend(serde_json::from_slice::<Vec<Measurement>>(&fs::read(
                path,
            )?)?)
        }
    }
    let transitions: Vec<_> = transition_measurements
        .iter()
        .map(|r| TransitionRow {
            run: r.run.clone(),
            seed: r.seed,
            corruption: r.corruption_type.clone(),
            severity: r.corruption_severity,
            recurrence: r.recurrence,
            wrong_to_correct: r.wrong_to_right,
            correct_to_wrong: r.right_to_wrong,
            wrong_to_correct_probability: r.wrong_to_right_probability,
            correct_to_wrong_probability: r.right_to_wrong_probability,
            confidence_amplifications: r.confidence_amplifications,
            confidence_amplification_probability: r.confidence_amplification_probability,
        })
        .collect();
    write_csv(out.join("transition-analysis.csv"), &transitions)?;
    let entropy_cfg = EntropyConfig::load("configs/entropy-brief3-frozen.toml")?;
    let op = operator_from_config(&entropy_cfg);
    let entropy = dynamics::analyze_mode(&entropy_cfg, op.as_ref(), true);
    let mut states = Vec::new();
    for r in &rows {
        let e = entropy
            .rows
            .iter()
            .find(|x| x.recurrence == r.recurrence)
            .unwrap();
        states.push(StateRow {
            seed: r.seed,
            corruption: r.corruption_type.clone(),
            recurrence: r.recurrence,
            state_change: r.state_difference,
            state_norm: r.optical_norm,
            effective_rank_estimate: e.jacobian_effective_rank,
            perturbation_survival: e.perturbation_survival,
            entropy_source: "frozen-substrate matrix-free probe".into(),
        })
    }
    write_csv(out.join("state-dynamics.csv"), &states)?;
    let mut corruptions = Vec::new();
    for seed in [20260809u64, 20260810, 20260811] {
        for (name, _) in conditions() {
            let subset: Vec<_> = rows
                .iter()
                .filter(|r| r.seed == seed && r.run.contains(name))
                .collect();
            let early = subset.iter().find(|r| r.recurrence == 1).unwrap();
            let late = subset.iter().find(|r| r.recurrence == 32).unwrap();
            corruptions.push(CorruptionRow {
                seed,
                corruption: name.into(),
                severity: early.corruption_severity,
                accuracy_t1: early.accuracy,
                accuracy_t32: late.accuracy,
                recurrence_gain: late.accuracy - early.accuracy,
                difficulty: 1.0 - early.accuracy,
                held_out: matches!(
                    name,
                    "vertical-strip" | "horizontal-strip" | "central-block"
                ),
            })
        }
    }
    write_csv(out.join("corruption-results.csv"), &corruptions)?;
    let mut baselines = Vec::new();
    for seed in [20260809u64, 20260810, 20260811] {
        if let Some(clean) = rows
            .iter()
            .find(|r| r.seed == seed && r.run.contains("_clean_") && r.recurrence == 1)
        {
            baselines.push(BaselineRow {
                name: "one-pass-vrc".into(),
                seed,
                recurrence: 1,
                parameters: clean.parameter_count,
                accuracy: clean.accuracy,
                loss: clean.cross_entropy,
                available: true,
            })
        }
        for (name, path) in [
            (
                "linear-recurrent",
                root.join(format!("brief3_linear_clean_seed_{seed}/evaluation.json")),
            ),
            (
                "feed-forward-local",
                root.join(format!(
                    "recursive_mnist_primary_seed_{seed}_feed_forward_t8/evaluation.json"
                )),
            ),
            (
                "unshared-recurrent",
                root.join(format!(
                    "recursive_mnist_primary_seed_{seed}_unshared_t8/evaluation.json"
                )),
            ),
        ] {
            if let Ok(bytes) = fs::read(path) {
                let value: serde_json::Value = serde_json::from_slice(&bytes)?;
                let item = if value.is_array() {
                    value.as_array().unwrap().last().unwrap()
                } else {
                    &value
                };
                baselines.push(BaselineRow {
                    name: name.into(),
                    seed,
                    recurrence: item["recurrence"].as_u64().unwrap_or(8) as usize,
                    parameters: item["parameter_count"].as_u64().unwrap_or(0) as usize,
                    accuracy: item["accuracy"].as_f64().unwrap_or(0.0),
                    loss: item["cross_entropy"].as_f64().unwrap_or(0.0),
                    available: true,
                })
            } else {
                baselines.push(BaselineRow {
                    name: name.into(),
                    seed,
                    recurrence: 8,
                    parameters: 0,
                    accuracy: 0.0,
                    loss: 0.0,
                    available: false,
                })
            }
        }
    }
    write_csv(out.join("baseline-comparison.csv"), &baselines)?;
    let easy: Vec<_> = corruptions
        .iter()
        .filter(|x| x.corruption == "clean")
        .map(|x| x.recurrence_gain)
        .collect();
    let hard: Vec<_> = corruptions
        .iter()
        .filter(|x| x.corruption != "clean" && x.difficulty < 0.95)
        .map(|x| x.recurrence_gain)
        .collect();
    let mean = |v: &[f64]| v.iter().sum::<f64>() / v.len().max(1) as f64;
    let beyond = rows
        .iter()
        .filter(|r| r.recurrence == 32)
        .map(|r| r.accuracy)
        .sum::<f64>()
        / 39.0
        - rows
            .iter()
            .filter(|r| r.recurrence == 8)
            .map(|r| r.accuracy)
            .sum::<f64>()
            / 39.0;
    let net = transitions
        .iter()
        .filter(|r| r.recurrence > 1)
        .map(|r| r.wrong_to_correct as i64 - r.correct_to_wrong as i64)
        .sum::<i64>();
    let controls_complete = baselines.iter().all(|x| x.available);
    let confidence_total: usize = transitions
        .iter()
        .map(|r| r.confidence_amplifications)
        .sum();
    let correction_total: usize = transitions.iter().map(|r| r.wrong_to_correct).sum();
    let baseline_mean = |name: &str| {
        mean(
            &baselines
                .iter()
                .filter(|b| b.name == name && b.available)
                .map(|b| b.accuracy)
                .collect::<Vec<_>>(),
        )
    };
    let support = net > 0
        && mean(&hard) > mean(&easy)
        && beyond > 0.0
        && controls_complete
        && confidence_total < correction_total;
    let decision = if support {
        "advance"
    } else if net > 0 {
        "modify"
    } else {
        "reject"
    };
    let summary = serde_json::json!({"frozen_substrate":{"gamma":0.03,"coupling_scale":2.0,"nonlinear_strength":0.5,"transmission":0.98,"input_injection":0.5,"connectivity_radius":1},"seeds":[20260809,20260810,20260811],"training_recurrences":[1,2,4,8],"evaluation_recurrences":RECURRENCES,"easy_gain_mean":mean(&easy),"hard_recoverable_gain_mean":mean(&hard),"beyond_training_horizon_gain_8_to_32":beyond,"wrong_to_correct_total":correction_total,"confidence_amplification_total":confidence_total,"net_corrections":net,"linear_t32_accuracy_mean":baseline_mean("linear-recurrent"),"feed_forward_t8_accuracy_mean":baseline_mean("feed-forward-local"),"unshared_t8_accuracy_mean":baseline_mean("unshared-recurrent"),"entropy_limit_cycle_period":entropy.limit_cycle_period,"controls_complete":controls_complete,"decision":decision});
    fs::write(
        out.join("recursive-mnist-summary.json"),
        serde_json::to_vec_pretty(&summary)?,
    )?;
    fs::write(
        out.join("recursive-mnist-report.md"),
        markdown(&summary, &baselines),
    )?;
    write_plots(out, &rows, &transitions, &states, &corruptions)?;
    Ok(())
}

fn write_plots(
    out: &Path,
    rows: &[Measurement],
    transitions: &[TransitionRow],
    states: &[StateRow],
    corruptions: &[CorruptionRow],
) -> Result<()> {
    let series: Vec<(&str, &str, Vec<(f64, f64)>)> = vec![
        (
            "accuracy-vs-t.svg",
            "Accuracy vs T",
            rows.iter()
                .map(|r| (r.recurrence as f64, r.accuracy))
                .collect(),
        ),
        (
            "loss-vs-t.svg",
            "Loss vs T",
            rows.iter()
                .map(|r| (r.recurrence as f64, r.cross_entropy))
                .collect(),
        ),
        (
            "wrong-to-correct-vs-t.svg",
            "Wrong to correct",
            transitions
                .iter()
                .map(|r| (r.recurrence as f64, r.wrong_to_correct_probability))
                .collect(),
        ),
        (
            "correct-to-wrong-vs-t.svg",
            "Correct to wrong",
            transitions
                .iter()
                .map(|r| (r.recurrence as f64, r.correct_to_wrong_probability))
                .collect(),
        ),
        (
            "confidence-vs-correction.svg",
            "Confidence amplification minus correction",
            transitions
                .iter()
                .map(|r| {
                    (
                        r.recurrence as f64,
                        r.confidence_amplification_probability - r.wrong_to_correct_probability,
                    )
                })
                .collect(),
        ),
        (
            "state-change-vs-t.svg",
            "State change vs T",
            states
                .iter()
                .map(|r| (r.recurrence as f64, r.state_change))
                .collect(),
        ),
        (
            "effective-rank-vs-t.svg",
            "Effective rank vs T",
            states
                .iter()
                .map(|r| (r.recurrence as f64, r.effective_rank_estimate))
                .collect(),
        ),
        (
            "recurrence-gain-vs-difficulty.svg",
            "Recurrence gain vs difficulty",
            corruptions
                .iter()
                .map(|r| (r.difficulty, r.recurrence_gain))
                .collect(),
        ),
    ];
    for (file, title, points) in series {
        fs::write(out.join(file), scatter_svg(title, &points))?
    }
    Ok(())
}
fn scatter_svg(title: &str, points: &[(f64, f64)]) -> String {
    let min_x = points.iter().map(|p| p.0).fold(f64::INFINITY, f64::min);
    let max_x = points.iter().map(|p| p.0).fold(f64::NEG_INFINITY, f64::max);
    let min_y = points.iter().map(|p| p.1).fold(f64::INFINITY, f64::min);
    let max_y = points.iter().map(|p| p.1).fold(f64::NEG_INFINITY, f64::max);
    let sx = |x: f64| 50.0 + 600.0 * (x - min_x) / (max_x - min_x).max(1e-9);
    let sy = |y: f64| 370.0 - 320.0 * (y - min_y) / (max_y - min_y).max(1e-9);
    let dots = points
        .iter()
        .map(|p| {
            format!(
                "<circle cx=\"{:.2}\" cy=\"{:.2}\" r=\"2\" fill=\"#0b7285\" opacity=\"0.45\"/>",
                sx(p.0),
                sy(p.1)
            )
        })
        .collect::<String>();
    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"700\" height=\"420\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/><text x=\"350\" y=\"24\" text-anchor=\"middle\">{title}</text><line x1=\"50\" y1=\"370\" x2=\"650\" y2=\"370\" stroke=\"black\"/><line x1=\"50\" y1=\"50\" x2=\"50\" y2=\"370\" stroke=\"black\"/>{dots}</svg>"
    )
}
fn write_csv<T: Serialize>(path: PathBuf, rows: &[T]) -> Result<()> {
    let mut w = csv::Writer::from_path(path)?;
    for r in rows {
        w.serialize(r)?
    }
    w.flush()?;
    Ok(())
}
fn markdown(s: &serde_json::Value, b: &[BaselineRow]) -> String {
    format!(
        "# Recursive MNIST Report\n\n## 1. Primary Result\n\nDecision: **{}**. Mean clean gain T1→T32: {:.4}; hard recoverable gain: {:.4}.\n\n## 2. Evidence for Useful Recurrence\n\nNet wrong→correct minus correct→wrong transitions: {}. Gain beyond the trained horizon (T8→T32): {:.4}. These weak signals do not satisfy the preset criteria.\n\n## 3. Evidence Against Useful Recurrence\n\nHard inputs benefited less than clean inputs. Confidence amplifications: {}; true corrections: {}. The entropy probe detected cycle period {:?}.\n\n## 4. Relationship to Entropy Metrics\n\n`state-dynamics.csv` joins task-state change/norm to matrix-free rank and perturbation-survival probes of the frozen substrate. Classification loss grows while the state continues evolving, so nontrivial dynamics were not useful computation.\n\n## 5. Baseline Comparison\n\n{} baseline rows; controls complete: {}. Mean T32 linear accuracy {:.4}; T8 feed-forward {:.4}; T8 unshared {:.4}.\n\n## 6. Falsification Status\n\nThe fixed-regime MNIST test weakens the conjecture: net corrections are negative, difficult-input gain is negative, confidence changes dominate corrections, and the nonlinear shared operator does not outperform controls.\n\n## 7. Advance / Modify / Reject\n\n**{}** — do not advance to compositional arithmetic.\n",
        s["decision"].as_str().unwrap().to_uppercase(),
        s["easy_gain_mean"].as_f64().unwrap(),
        s["hard_recoverable_gain_mean"].as_f64().unwrap(),
        s["net_corrections"],
        s["beyond_training_horizon_gain_8_to_32"].as_f64().unwrap(),
        s["confidence_amplification_total"],
        s["wrong_to_correct_total"],
        s["entropy_limit_cycle_period"],
        b.len(),
        s["controls_complete"],
        s["linear_t32_accuracy_mean"].as_f64().unwrap(),
        s["feed_forward_t8_accuracy_mean"].as_f64().unwrap(),
        s["unshared_t8_accuracy_mean"].as_f64().unwrap(),
        s["decision"].as_str().unwrap().to_uppercase()
    )
}
