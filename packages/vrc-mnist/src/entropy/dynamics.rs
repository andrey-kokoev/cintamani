use super::{
    configuration::EntropyConfig,
    modes::StateOperator,
    perturbation::{evolve, l2, norm, quantized_key},
    singular,
};
use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Serialize)]
pub struct RecurrenceMetric {
    pub recurrence: usize,
    pub state_norm: f64,
    pub perturbation_distance: f64,
    pub perturbation_survival: f64,
    pub trajectory_divergence: f64,
    pub jacobian_max_gain: f64,
    pub jacobian_effective_rank: f64,
    pub contraction_expansion: f64,
}
#[derive(Clone, Debug, Serialize)]
pub struct Dynamics {
    pub rows: Vec<RecurrenceMetric>,
    pub jacobian_singular_estimates: Vec<f64>,
    pub apparent_attractor_count: usize,
    pub limit_cycle_period: Option<usize>,
}
pub fn analyze_mode(cfg: &EntropyConfig, op: &dyn StateOperator, driven: bool) -> Dynamics {
    let n = op.dimension();
    let input = if driven {
        singular::normalized_probe(n, cfg.seed)
    } else {
        vec![0.0; n]
    };
    let initial = singular::normalized_probe(n, cfg.seed + 777);
    let direction = singular::normalized_probe(n, cfg.seed + 1);
    let perturbed: Vec<_> = initial
        .iter()
        .zip(&direction)
        .map(|(x, d)| x + cfg.perturbation * d)
        .collect();
    let baseline_distance = cfg.perturbation;
    let base_spectrum = singular::spectrum(
        op,
        &initial,
        &input,
        cfg.probes,
        cfg.jvp_tolerance,
        cfg.seed + 10,
    );
    let mut rows = Vec::new();
    for &t in &cfg.recurrences {
        let a = evolve(op, initial.clone(), &input, t);
        let b = evolve(op, perturbed.clone(), &input, t);
        let distance = l2(&a, &b);
        let spectrum = singular::spectrum(
            op,
            &a,
            &input,
            cfg.probes,
            cfg.jvp_tolerance,
            cfg.seed + t as u64,
        );
        rows.push(RecurrenceMetric {
            recurrence: t,
            state_norm: norm(&a),
            perturbation_distance: distance,
            perturbation_survival: distance / baseline_distance,
            trajectory_divergence: (distance / baseline_distance).max(f64::MIN_POSITIVE).ln()
                / t as f64,
            jacobian_max_gain: spectrum.first().copied().unwrap_or(0.0),
            jacobian_effective_rank: singular::effective_rank(&spectrum),
            contraction_expansion: distance / baseline_distance,
        });
    }
    let max_t = *cfg.recurrences.iter().max().unwrap();
    let mut state = initial;
    let mut seen = HashMap::new();
    let mut terminal = HashSet::new();
    let mut cycle = None;
    for t in 0..=max_t {
        let key = quantized_key(&state, cfg.cycle_tolerance);
        if let Some(prev) = seen.insert(key.clone(), t) {
            cycle = Some(t - prev);
            break;
        }
        terminal.insert(key);
        state = op.step(&state, &input);
    }
    Dynamics {
        rows,
        jacobian_singular_estimates: base_spectrum,
        apparent_attractor_count: terminal.len().max(1),
        limit_cycle_period: cycle,
    }
}
pub fn analyze(cfg: &EntropyConfig, op: &dyn StateOperator) -> Dynamics {
    analyze_mode(cfg, op, true)
}
