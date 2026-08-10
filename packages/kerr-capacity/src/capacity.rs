use crate::config::Config;
use anyhow::{Result, bail};
use rand::{SeedableRng, rngs::StdRng, seq::SliceRandom};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct TargetCapacity {
    pub target: String,
    pub total_degree: usize,
    pub maximum_lag: usize,
    pub interacting_lags: usize,
    pub raw_held_out_capacity: f64,
    pub permutation_threshold: f64,
    pub corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GroupCapacity {
    pub group: usize,
    pub target_count: usize,
    pub raw_positive_capacity: f64,
    pub corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct CapacityAnalysis {
    pub targets: Vec<TargetCapacity>,
    pub by_degree: Vec<GroupCapacity>,
    pub by_maximum_lag: Vec<GroupCapacity>,
    pub aligned_samples: usize,
    pub train_samples: usize,
    pub test_samples: usize,
    pub declared_observation_dimension: usize,
    pub effective_observation_rank: usize,
    pub global_permutation_threshold: f64,
    pub total_positive_raw_capacity: f64,
    pub total_corrected_capacity: f64,
}

#[derive(Clone, Debug)]
struct TargetDefinition {
    degrees: Vec<usize>,
    total_degree: usize,
    maximum_lag: usize,
    interacting_lags: usize,
    label: String,
}

#[derive(Clone, Debug)]
struct PreparedFeatures {
    rows: Vec<Vec<f64>>,
    train_samples: usize,
    rank: usize,
}

pub fn analyze(
    inputs: &[f64],
    observations: &[Vec<f64>],
    config: &Config,
) -> Result<CapacityAnalysis> {
    if inputs.len() != observations.len() {
        bail!("input and observation sample counts differ");
    }
    if observations.is_empty() {
        bail!("capacity analysis requires observations");
    }
    let dimension = observations[0].len();
    if dimension != config.observation_dimension() {
        bail!(
            "observation width {dimension} does not match declared dimension {}",
            config.observation_dimension()
        );
    }
    if observations
        .iter()
        .any(|row| row.len() != dimension || row.iter().any(|value| !value.is_finite()))
    {
        bail!("observation matrix is ragged or contains non-finite values");
    }
    if inputs.iter().any(|value| !value.is_finite()) {
        bail!("input stream contains non-finite values");
    }

    let features = prepare_features(observations, config.max_lag, config.train_fraction)?;
    let definitions = enumerate_targets(config.max_lag, config.max_degree);
    let mut provisional = Vec::with_capacity(definitions.len());
    let mut null_scores = Vec::with_capacity(definitions.len() * config.null_trials);
    let mut rng = StdRng::seed_from_u64(config.seed ^ 0xe703_7ed1_a0b4_28db);

    for definition in definitions {
        let target = evaluate_target(inputs, config.max_lag, &definition.degrees);
        let raw = held_out_capacity(
            &features.rows,
            &target,
            features.train_samples,
            config.ridge,
        )?;

        for _ in 0..config.null_trials {
            let mut permuted = target.clone();
            permuted.shuffle(&mut rng);
            let null = held_out_capacity(
                &features.rows,
                &permuted,
                features.train_samples,
                config.ridge,
            )?;
            null_scores.push(null.max(0.0));
        }
        provisional.push((definition, raw));
    }

    let threshold = empirical_quantile(&mut null_scores, config.null_quantile);
    let targets: Vec<_> = provisional
        .into_iter()
        .map(|(definition, raw)| TargetCapacity {
            target: definition.label,
            total_degree: definition.total_degree,
            maximum_lag: definition.maximum_lag,
            interacting_lags: definition.interacting_lags,
            raw_held_out_capacity: raw,
            permutation_threshold: threshold,
            corrected_capacity: (raw - threshold).clamp(0.0, 1.0),
        })
        .collect();

    let by_degree = aggregate(&targets, config.max_degree, |target| target.total_degree);
    let by_maximum_lag = aggregate(&targets, config.max_lag, |target| target.maximum_lag);
    let total_positive_raw_capacity = targets
        .iter()
        .map(|target| target.raw_held_out_capacity.max(0.0))
        .sum();
    let total_corrected_capacity = targets.iter().map(|target| target.corrected_capacity).sum();

    Ok(CapacityAnalysis {
        targets,
        by_degree,
        by_maximum_lag,
        aligned_samples: features.rows.len(),
        train_samples: features.train_samples,
        test_samples: features.rows.len() - features.train_samples,
        declared_observation_dimension: dimension,
        effective_observation_rank: features.rank,
        global_permutation_threshold: threshold,
        total_positive_raw_capacity,
        total_corrected_capacity,
    })
}

fn prepare_features(
    observations: &[Vec<f64>],
    max_lag: usize,
    train_fraction: f64,
) -> Result<PreparedFeatures> {
    if observations.len() <= max_lag + 2 {
        bail!("not enough observations after lag alignment");
    }
    let mut rows = observations[max_lag..].to_vec();
    let train_samples = ((rows.len() as f64) * train_fraction).floor() as usize;
    if train_samples < 2 || rows.len() - train_samples < 2 {
        bail!("train/test split leaves fewer than two samples in a partition");
    }

    let dimension = rows[0].len();
    let mut means = vec![0.0; dimension];
    for row in &rows[..train_samples] {
        for (mean, value) in means.iter_mut().zip(row) {
            *mean += value;
        }
    }
    for mean in &mut means {
        *mean /= train_samples as f64;
    }

    let mut scales = vec![0.0; dimension];
    for row in &rows[..train_samples] {
        for ((scale, value), mean) in scales.iter_mut().zip(row).zip(&means) {
            *scale += (value - mean).powi(2);
        }
    }
    for (scale, mean) in scales.iter_mut().zip(&means) {
        *scale = (*scale / train_samples as f64).sqrt();
        if *scale <= 1e-12 * mean.abs().max(1.0) {
            *scale = 0.0;
        }
    }

    for row in &mut rows {
        for index in 0..dimension {
            row[index] = if scales[index] > 0.0 {
                (row[index] - means[index]) / scales[index]
            } else {
                0.0
            };
        }
    }
    let rank = numerical_rank(&rows[..train_samples]);
    Ok(PreparedFeatures {
        rows,
        train_samples,
        rank,
    })
}

fn held_out_capacity(
    features: &[Vec<f64>],
    target: &[f64],
    train_samples: usize,
    ridge: f64,
) -> Result<f64> {
    if features.len() != target.len() {
        bail!("feature and target lengths differ");
    }
    let dimension = features[0].len();
    let target_mean = target[..train_samples].iter().sum::<f64>() / train_samples as f64;
    let mut gram = vec![vec![0.0; dimension]; dimension];
    let mut cross = vec![0.0; dimension];

    for (row, &target_value) in features[..train_samples]
        .iter()
        .zip(&target[..train_samples])
    {
        let centered_target = target_value - target_mean;
        for ((cross_value, gram_row), &left_value) in cross.iter_mut().zip(&mut gram).zip(row) {
            *cross_value += left_value * centered_target;
            for (entry, &right_value) in gram_row.iter_mut().zip(row) {
                *entry += left_value * right_value;
            }
        }
    }
    let normalization = 1.0 / train_samples as f64;
    for (left, (cross_value, gram_row)) in cross.iter_mut().zip(&mut gram).enumerate() {
        *cross_value *= normalization;
        for entry in gram_row.iter_mut() {
            *entry *= normalization;
        }
        gram_row[left] += ridge;
    }
    let weights = cholesky_solve(&gram, &cross)?;

    let mut model_error = 0.0;
    let mut baseline_error = 0.0;
    for (row, &actual) in features[train_samples..]
        .iter()
        .zip(&target[train_samples..])
    {
        let predicted = target_mean
            + row
                .iter()
                .zip(&weights)
                .map(|(feature, weight)| feature * weight)
                .sum::<f64>();
        model_error += (actual - predicted).powi(2);
        baseline_error += (actual - target_mean).powi(2);
    }

    if baseline_error <= f64::EPSILON {
        return Ok(0.0);
    }
    Ok((1.0 - model_error / baseline_error).min(1.0))
}

fn cholesky_solve(matrix: &[Vec<f64>], rhs: &[f64]) -> Result<Vec<f64>> {
    let n = matrix.len();
    if rhs.len() != n || matrix.iter().any(|row| row.len() != n) {
        bail!("linear system is not square");
    }
    let mut lower = vec![vec![0.0; n]; n];
    for row in 0..n {
        for column in 0..=row {
            let previous: f64 = (0..column)
                .map(|index| lower[row][index] * lower[column][index])
                .sum();
            if row == column {
                let diagonal = matrix[row][row] - previous;
                if diagonal <= 0.0 || !diagonal.is_finite() {
                    bail!("ridge system is not positive definite");
                }
                lower[row][column] = diagonal.sqrt();
            } else {
                lower[row][column] = (matrix[row][column] - previous) / lower[column][column];
            }
        }
    }

    let mut forward = vec![0.0; n];
    for row in 0..n {
        let previous: f64 = (0..row)
            .map(|column| lower[row][column] * forward[column])
            .sum();
        forward[row] = (rhs[row] - previous) / lower[row][row];
    }
    let mut solution = vec![0.0; n];
    for row in (0..n).rev() {
        let previous: f64 = ((row + 1)..n)
            .map(|column| lower[column][row] * solution[column])
            .sum();
        solution[row] = (forward[row] - previous) / lower[row][row];
    }
    Ok(solution)
}

fn numerical_rank(rows: &[Vec<f64>]) -> usize {
    if rows.is_empty() || rows[0].is_empty() {
        return 0;
    }
    let dimension = rows[0].len();
    let mut gram = vec![vec![0.0; dimension]; dimension];
    for row in rows {
        for left in 0..dimension {
            for right in 0..dimension {
                gram[left][right] += row[left] * row[right];
            }
        }
    }
    let normalization = 1.0 / rows.len() as f64;
    for row in &mut gram {
        for value in row {
            *value *= normalization;
        }
    }
    let largest = gram
        .iter()
        .flatten()
        .map(|value| value.abs())
        .fold(0.0, f64::max);
    if largest == 0.0 {
        return 0;
    }
    let tolerance = largest * dimension as f64 * 1e-10;

    let mut rank = 0;
    for column in 0..dimension {
        let Some((pivot, pivot_value)) = (rank..dimension)
            .map(|row| (row, gram[row][column].abs()))
            .max_by(|left, right| left.1.total_cmp(&right.1))
        else {
            break;
        };
        if pivot_value <= tolerance {
            continue;
        }
        gram.swap(rank, pivot);
        let divisor = gram[rank][column];
        let pivot_tail = gram[rank][column..].to_vec();
        for candidate in gram.iter_mut().skip(rank + 1) {
            let factor = candidate[column] / divisor;
            for (entry, &pivot_entry) in candidate[column..].iter_mut().zip(&pivot_tail) {
                *entry -= factor * pivot_entry;
            }
        }
        rank += 1;
        if rank == dimension {
            break;
        }
    }
    rank
}

fn enumerate_targets(max_lag: usize, max_degree: usize) -> Vec<TargetDefinition> {
    let mut targets = Vec::new();
    for total_degree in 1..=max_degree {
        let mut degrees = vec![0; max_lag + 1];
        enumerate_degree_compositions(0, total_degree, &mut degrees, total_degree, &mut targets);
    }
    targets
}

fn enumerate_degree_compositions(
    lag: usize,
    remaining: usize,
    degrees: &mut [usize],
    total_degree: usize,
    targets: &mut Vec<TargetDefinition>,
) {
    if lag + 1 == degrees.len() {
        degrees[lag] = remaining;
        let maximum_lag = degrees.iter().rposition(|&degree| degree > 0).unwrap_or(0);
        let interacting_lags = degrees.iter().filter(|&&degree| degree > 0).count();
        targets.push(TargetDefinition {
            degrees: degrees.to_vec(),
            total_degree,
            maximum_lag,
            interacting_lags,
            label: target_label(degrees),
        });
        return;
    }

    for degree in 0..=remaining {
        degrees[lag] = degree;
        enumerate_degree_compositions(lag + 1, remaining - degree, degrees, total_degree, targets);
    }
}

fn target_label(degrees: &[usize]) -> String {
    degrees
        .iter()
        .enumerate()
        .filter(|(_, degree)| **degree > 0)
        .map(|(lag, degree)| {
            if lag == 0 {
                format!("L{degree}(u[t])")
            } else {
                format!("L{degree}(u[t-{lag}])")
            }
        })
        .collect::<Vec<_>>()
        .join(" * ")
}

fn evaluate_target(inputs: &[f64], max_lag: usize, degrees: &[usize]) -> Vec<f64> {
    (max_lag..inputs.len())
        .map(|time| {
            degrees
                .iter()
                .enumerate()
                .map(|(lag, &degree)| normalized_legendre(degree, inputs[time - lag]))
                .product()
        })
        .collect()
}

fn normalized_legendre(degree: usize, value: f64) -> f64 {
    let polynomial = match degree {
        0 => 1.0,
        1 => value,
        _ => {
            let mut previous = 1.0;
            let mut current = value;
            for order in 2..=degree {
                let next = ((2 * order - 1) as f64 * value * current
                    - (order - 1) as f64 * previous)
                    / order as f64;
                previous = current;
                current = next;
            }
            current
        }
    };
    ((2 * degree + 1) as f64).sqrt() * polynomial
}

fn empirical_quantile(values: &mut [f64], quantile: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    values.sort_by(f64::total_cmp);
    let index = ((quantile * values.len() as f64).ceil() as usize)
        .saturating_sub(1)
        .min(values.len() - 1);
    values[index]
}

fn aggregate(
    targets: &[TargetCapacity],
    maximum_group: usize,
    group_of: impl Fn(&TargetCapacity) -> usize,
) -> Vec<GroupCapacity> {
    (0..=maximum_group)
        .filter_map(|group| {
            let members: Vec<_> = targets
                .iter()
                .filter(|target| group_of(target) == group)
                .collect();
            if members.is_empty() {
                None
            } else {
                Some(GroupCapacity {
                    group,
                    target_count: members.len(),
                    raw_positive_capacity: members
                        .iter()
                        .map(|target| target.raw_held_out_capacity.max(0.0))
                        .sum(),
                    corrected_capacity: members
                        .iter()
                        .map(|target| target.corrected_capacity)
                        .sum(),
                })
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Backend, Observation};
    use rand::Rng;

    fn config() -> Config {
        Config {
            seed: 19,
            modes: 3,
            backend: Backend::DirectModal,
            dt: 0.01,
            steps_per_symbol: 1,
            warmup_symbols: 0,
            sample_symbols: 1500,
            intrinsic_loss: 1.0,
            external_coupling: 0.0,
            detuning: 0.0,
            dispersion: 0.0,
            kerr_strength: 0.0,
            pump_amplitude: 0.0,
            input_scale: 0.0,
            input_mode: 0,
            noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.0,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 1,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-8,
            null_trials: 12,
            null_quantile: 0.99,
            save_samples: false,
        }
    }

    fn linear_memory_data(configuration: &Config) -> (Vec<f64>, Vec<Vec<f64>>) {
        let mut rng = StdRng::seed_from_u64(configuration.seed);
        let inputs: Vec<f64> = (0..configuration.sample_symbols)
            .map(|_| rng.random_range(-1.0..=1.0))
            .collect();
        let observations = (0..inputs.len())
            .map(|time| {
                vec![
                    inputs[time],
                    if time > 0 { inputs[time - 1] } else { 0.0 },
                    1.0,
                ]
            })
            .collect();
        (inputs, observations)
    }

    #[test]
    fn orthonormal_legendre_scaling_is_correct() {
        assert_eq!(normalized_legendre(0, 0.25), 1.0);
        assert!((normalized_legendre(1, 0.25) - 3.0_f64.sqrt() * 0.25).abs() < 1e-14);
        assert!(
            (normalized_legendre(2, 0.25) - 5.0_f64.sqrt() * (3.0 * 0.25_f64.powi(2) - 1.0) / 2.0)
                .abs()
                < 1e-14
        );
    }

    #[test]
    fn held_out_estimator_recovers_two_linear_memories_and_the_rank_bound() {
        let configuration = config();
        let (inputs, observations) = linear_memory_data(&configuration);
        let result = analyze(&inputs, &observations, &configuration).unwrap();
        assert_eq!(result.effective_observation_rank, 2);
        let current = result
            .targets
            .iter()
            .find(|target| target.target == "L1(u[t])")
            .unwrap();
        let previous = result
            .targets
            .iter()
            .find(|target| target.target == "L1(u[t-1])")
            .unwrap();
        assert!(current.corrected_capacity > 0.9);
        assert!(previous.corrected_capacity > 0.9);
        assert!(result.total_corrected_capacity <= result.effective_observation_rank as f64 + 1e-6);
    }

    #[test]
    fn permutation_correction_is_seed_deterministic() {
        let configuration = config();
        let (inputs, observations) = linear_memory_data(&configuration);
        let first = analyze(&inputs, &observations, &configuration).unwrap();
        let second = analyze(&inputs, &observations, &configuration).unwrap();
        assert_eq!(
            first.global_permutation_threshold,
            second.global_permutation_threshold
        );
        assert_eq!(
            first.total_corrected_capacity,
            second.total_corrected_capacity
        );
    }
}
