use crate::config::Config;
use anyhow::{Result, bail};
use nalgebra::{DMatrix, SymmetricEigen};
use rand::{SeedableRng, rngs::StdRng, seq::SliceRandom};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct TargetCapacity {
    pub target: String,
    pub total_degree: usize,
    pub maximum_lag: usize,
    pub interacting_lags: usize,
    pub raw_held_out_capacity: f64,
    pub positive_null_mean: f64,
    pub target_permutation_threshold: f64,
    pub familywise_permutation_threshold: f64,
    pub familywise_significant: bool,
    pub corrected_capacity: f64,
    pub standardized_weight_norm: f64,
    pub raw_equivalent_weight_norm: Option<f64>,
    pub raw_weight_conversion_defined: bool,
    pub detector_noise_gain: Option<f64>,
}

#[derive(Clone, Debug, Serialize)]
pub struct GroupCapacity {
    pub group: usize,
    pub target_count: usize,
    pub significant_target_count: usize,
    pub raw_positive_capacity: f64,
    pub corrected_capacity: f64,
}

#[derive(Clone, Debug, Serialize)]
pub struct RankAtTolerance {
    pub relative_singular_tolerance: f64,
    pub rank: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct ObservationSpectrum {
    pub training_feature_means: Vec<f64>,
    pub training_feature_scales: Vec<f64>,
    pub relative_feature_scales: Vec<f64>,
    pub normalized_singular_values: Vec<f64>,
    pub relative_singular_values: Vec<f64>,
    pub chosen_relative_tolerance: f64,
    pub effective_rank: usize,
    pub stable_rank: f64,
    pub participation_ratio: f64,
    pub rank_profile: Vec<RankAtTolerance>,
    /// Singular values of the noiseless interface after training-only
    /// per-feature standardization.  This retains ideal mathematical span.
    pub noiseless_standardized_singular_values: Vec<f64>,
    pub noiseless_standardized_relative_singular_values: Vec<f64>,
    pub noiseless_numerical_rank: usize,
    /// Principal standard deviations of the centered noiseless interface in
    /// raw normalized observation units, used for the detector-noise test.
    pub noiseless_raw_singular_values: Vec<f64>,
    pub detector_noise_std: f64,
    pub noise_aware_singular_threshold: f64,
    pub noise_aware_observable_dimension: usize,
    pub noise_aware_criterion: String,
    pub degenerate_training_feature_count: usize,
    pub feature_diagnostics: Vec<FeatureDiagnostic>,
}

#[derive(Clone, Debug, Serialize)]
pub struct FeatureDiagnostic {
    pub feature: usize,
    pub noiseless_training_mean: f64,
    pub signal_std: f64,
    pub declared_detector_noise_std: f64,
    pub realized_detector_noise_rms: f64,
    /// Power SNR = signal variance / declared detector-noise variance.  It is
    /// null when the denominator is zero; `snr_status` distinguishes infinity
    /// from the zero-over-zero case.
    pub linear_power_snr: Option<f64>,
    pub snr_db: Option<f64>,
    pub snr_status: String,
    pub signal_exceeds_declared_noise: bool,
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
    pub noiseless_numerical_rank: usize,
    pub noise_aware_observable_dimension: usize,
    pub observation_spectrum: ObservationSpectrum,
    pub familywise_permutation_threshold: f64,
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
    spectrum: ObservationSpectrum,
}

#[derive(Clone, Debug)]
struct HeldOutFit {
    score: f64,
    weights: Vec<f64>,
}

pub fn analyze(
    inputs: &[f64],
    observations: &[Vec<f64>],
    config: &Config,
) -> Result<CapacityAnalysis> {
    analyze_with_noiseless(inputs, observations, observations, config)
}

pub fn analyze_with_noiseless(
    inputs: &[f64],
    observations: &[Vec<f64>],
    noiseless_observations: &[Vec<f64>],
    config: &Config,
) -> Result<CapacityAnalysis> {
    if inputs.len() != observations.len() {
        bail!("input and observation sample counts differ");
    }
    if inputs.len() != noiseless_observations.len() {
        bail!("input and noiseless-observation sample counts differ");
    }
    if observations.is_empty() {
        bail!("capacity analysis requires observations");
    }
    let dimension = observations[0].len();
    if observations
        .iter()
        .any(|row| row.len() != dimension || row.iter().any(|value| !value.is_finite()))
    {
        bail!("observation matrix is ragged or contains non-finite values");
    }
    if noiseless_observations
        .iter()
        .any(|row| row.len() != dimension || row.iter().any(|value| !value.is_finite()))
    {
        bail!("noiseless observation matrix is ragged or contains non-finite values");
    }
    if inputs.iter().any(|value| !value.is_finite()) {
        bail!("input stream contains non-finite values");
    }

    let features = prepare_features(
        observations,
        noiseless_observations,
        config.max_lag,
        config.train_fraction,
        config.rank_relative_tolerance,
        config.detector_noise_std,
    )?;
    let definitions = enumerate_targets(config.max_lag, config.max_degree);
    let target_values: Vec<_> = definitions
        .iter()
        .map(|definition| evaluate_target(inputs, config.max_lag, &definition.degrees))
        .collect();
    let ridge_factor = ridge_factor(&features.rows, features.train_samples, config.ridge)?;
    let raw_fits: Vec<_> = target_values
        .iter()
        .map(|target| {
            held_out_fit(
                &features.rows,
                target,
                features.train_samples,
                &ridge_factor,
            )
        })
        .collect::<Result<_>>()?;

    let mut null_by_target = vec![Vec::with_capacity(config.null_trials); definitions.len()];
    let mut maximum_null_scores = Vec::with_capacity(config.null_trials);
    let mut rng = StdRng::seed_from_u64(config.seed ^ 0xe703_7ed1_a0b4_28db);
    let mut permutation: Vec<_> = (0..features.rows.len()).collect();

    for _ in 0..config.null_trials {
        permutation.shuffle(&mut rng);
        let mut maximum: f64 = 0.0;
        for (target_index, target) in target_values.iter().enumerate() {
            let permuted: Vec<_> = permutation.iter().map(|&index| target[index]).collect();
            let null = held_out_capacity(
                &features.rows,
                &permuted,
                features.train_samples,
                &ridge_factor,
            )?;
            let positive_null = null.max(0.0);
            null_by_target[target_index].push(positive_null);
            maximum = maximum.max(positive_null);
        }
        maximum_null_scores.push(maximum);
    }

    let familywise_threshold = empirical_quantile(&mut maximum_null_scores, config.null_quantile);
    let targets: Vec<_> = definitions
        .into_iter()
        .zip(raw_fits)
        .zip(null_by_target)
        .map(|((definition, raw_fit), mut null_scores)| {
            let positive_null_mean = null_scores.iter().sum::<f64>() / null_scores.len() as f64;
            let target_threshold = empirical_quantile(&mut null_scores, config.null_quantile);
            let significant = raw_fit.score > familywise_threshold;
            let standardized_weight_norm = raw_fit
                .weights
                .iter()
                .map(|weight| weight.powi(2))
                .sum::<f64>()
                .sqrt();
            let raw_equivalent_weight_norm = raw_equivalent_weight_norm(
                &raw_fit.weights,
                &features.spectrum.training_feature_scales,
            );
            TargetCapacity {
                target: definition.label,
                total_degree: definition.total_degree,
                maximum_lag: definition.maximum_lag,
                interacting_lags: definition.interacting_lags,
                raw_held_out_capacity: raw_fit.score,
                positive_null_mean,
                target_permutation_threshold: target_threshold,
                familywise_permutation_threshold: familywise_threshold,
                familywise_significant: significant,
                corrected_capacity: if significant {
                    (raw_fit.score - target_threshold).clamp(0.0, 1.0)
                } else {
                    0.0
                },
                standardized_weight_norm,
                raw_equivalent_weight_norm,
                raw_weight_conversion_defined: raw_equivalent_weight_norm.is_some(),
                detector_noise_gain: raw_equivalent_weight_norm
                    .map(|norm| config.detector_noise_std * norm),
            }
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
        effective_observation_rank: features.spectrum.effective_rank,
        noiseless_numerical_rank: features.spectrum.noiseless_numerical_rank,
        noise_aware_observable_dimension: features.spectrum.noise_aware_observable_dimension,
        observation_spectrum: features.spectrum,
        familywise_permutation_threshold: familywise_threshold,
        total_positive_raw_capacity,
        total_corrected_capacity,
    })
}

fn prepare_features(
    observations: &[Vec<f64>],
    noiseless_observations: &[Vec<f64>],
    max_lag: usize,
    train_fraction: f64,
    rank_relative_tolerance: f64,
    detector_noise_std: f64,
) -> Result<PreparedFeatures> {
    if observations.len() <= max_lag + 2 {
        bail!("not enough observations after lag alignment");
    }
    let mut rows = observations[max_lag..].to_vec();
    let noiseless_rows = &noiseless_observations[max_lag..];
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
    let mut spectrum = observation_spectrum(&rows[..train_samples], rank_relative_tolerance);
    let maximum_scale = scales.iter().copied().fold(0.0, f64::max);
    spectrum.training_feature_means = means;
    spectrum.relative_feature_scales = if maximum_scale > 0.0 {
        scales.iter().map(|scale| scale / maximum_scale).collect()
    } else {
        vec![0.0; scales.len()]
    };
    spectrum.training_feature_scales = scales;
    add_noiseless_diagnostics(
        &mut spectrum,
        &observations[max_lag..],
        noiseless_rows,
        train_samples,
        rank_relative_tolerance,
        detector_noise_std,
    );
    Ok(PreparedFeatures {
        rows,
        train_samples,
        spectrum,
    })
}

fn held_out_fit(
    features: &[Vec<f64>],
    target: &[f64],
    train_samples: usize,
    ridge_factor: &[Vec<f64>],
) -> Result<HeldOutFit> {
    if features.len() != target.len() {
        bail!("feature and target lengths differ");
    }
    let dimension = features[0].len();
    let target_mean = target[..train_samples].iter().sum::<f64>() / train_samples as f64;
    let mut cross = vec![0.0; dimension];

    for (row, &target_value) in features[..train_samples]
        .iter()
        .zip(&target[..train_samples])
    {
        let centered_target = target_value - target_mean;
        for (cross_value, &left_value) in cross.iter_mut().zip(row) {
            *cross_value += left_value * centered_target;
        }
    }
    let normalization = 1.0 / train_samples as f64;
    for cross_value in &mut cross {
        *cross_value *= normalization;
    }
    let weights = cholesky_solve(ridge_factor, &cross)?;

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
        return Ok(HeldOutFit {
            score: 0.0,
            weights,
        });
    }
    Ok(HeldOutFit {
        score: (1.0 - model_error / baseline_error).min(1.0),
        weights,
    })
}

fn held_out_capacity(
    features: &[Vec<f64>],
    target: &[f64],
    train_samples: usize,
    ridge_factor: &[Vec<f64>],
) -> Result<f64> {
    Ok(held_out_fit(features, target, train_samples, ridge_factor)?.score)
}

fn raw_equivalent_weight_norm(weights: &[f64], scales: &[f64]) -> Option<f64> {
    let mut squared_norm = 0.0;
    for (&weight, &scale) in weights.iter().zip(scales) {
        if scale > 0.0 {
            squared_norm += (weight / scale).powi(2);
        } else if weight.abs() > 1e-12 {
            return None;
        }
    }
    Some(squared_norm.sqrt())
}

fn ridge_factor(features: &[Vec<f64>], train_samples: usize, ridge: f64) -> Result<Vec<Vec<f64>>> {
    let dimension = features[0].len();
    let mut gram = vec![vec![0.0; dimension]; dimension];
    for row in &features[..train_samples] {
        for (gram_row, &left_value) in gram.iter_mut().zip(row) {
            for (entry, &right_value) in gram_row.iter_mut().zip(row) {
                *entry += left_value * right_value;
            }
        }
    }
    let normalization = 1.0 / train_samples as f64;
    for (index, gram_row) in gram.iter_mut().enumerate() {
        for entry in gram_row.iter_mut() {
            *entry *= normalization;
        }
        gram_row[index] += ridge;
    }
    cholesky_factor(&gram)
}

fn cholesky_factor(matrix: &[Vec<f64>]) -> Result<Vec<Vec<f64>>> {
    let n = matrix.len();
    if matrix.iter().any(|row| row.len() != n) {
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
    Ok(lower)
}

fn cholesky_solve(lower: &[Vec<f64>], rhs: &[f64]) -> Result<Vec<f64>> {
    let n = lower.len();
    if rhs.len() != n || lower.iter().any(|row| row.len() != n) {
        bail!("Cholesky factor and right-hand side dimensions differ");
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

fn observation_spectrum(rows: &[Vec<f64>], chosen_tolerance: f64) -> ObservationSpectrum {
    if rows.is_empty() || rows[0].is_empty() {
        return ObservationSpectrum {
            training_feature_means: Vec::new(),
            training_feature_scales: Vec::new(),
            relative_feature_scales: Vec::new(),
            normalized_singular_values: Vec::new(),
            relative_singular_values: Vec::new(),
            chosen_relative_tolerance: chosen_tolerance,
            effective_rank: 0,
            stable_rank: 0.0,
            participation_ratio: 0.0,
            rank_profile: Vec::new(),
            noiseless_standardized_singular_values: Vec::new(),
            noiseless_standardized_relative_singular_values: Vec::new(),
            noiseless_numerical_rank: 0,
            noiseless_raw_singular_values: Vec::new(),
            detector_noise_std: 0.0,
            noise_aware_singular_threshold: 0.0,
            noise_aware_observable_dimension: 0,
            noise_aware_criterion: String::new(),
            degenerate_training_feature_count: 0,
            feature_diagnostics: Vec::new(),
        };
    }
    let dimension = rows[0].len();
    let mut covariance = DMatrix::zeros(dimension, dimension);
    for row in rows {
        for left in 0..dimension {
            for right in 0..dimension {
                covariance[(left, right)] += row[left] * row[right];
            }
        }
    }
    covariance /= rows.len() as f64;
    let eigenvalues = SymmetricEigen::new(covariance).eigenvalues;
    let mut singular_values: Vec<_> = eigenvalues
        .iter()
        .map(|&eigenvalue| eigenvalue.max(0.0).sqrt())
        .collect();
    singular_values.sort_by(|left, right| right.total_cmp(left));
    let largest = singular_values.first().copied().unwrap_or(0.0);
    let relative_singular_values: Vec<_> = if largest > 0.0 {
        singular_values
            .iter()
            .map(|value| value / largest)
            .collect()
    } else {
        vec![0.0; singular_values.len()]
    };
    let rank_at = |tolerance: f64| {
        relative_singular_values
            .iter()
            .filter(|&&value| value > tolerance)
            .count()
    };
    let sum_squares: f64 = singular_values.iter().map(|value| value.powi(2)).sum();
    let sum_fourth: f64 = singular_values.iter().map(|value| value.powi(4)).sum();
    let stable_rank = if largest > 0.0 {
        sum_squares / largest.powi(2)
    } else {
        0.0
    };
    let participation_ratio = if sum_fourth > 0.0 {
        sum_squares.powi(2) / sum_fourth
    } else {
        0.0
    };
    let mut tolerances = vec![1e-3, 1e-6, 1e-9];
    if !tolerances
        .iter()
        .any(|value| f64::abs(*value - chosen_tolerance) < f64::EPSILON)
    {
        tolerances.push(chosen_tolerance);
    }
    tolerances.sort_by(|left, right| right.total_cmp(left));
    let rank_profile = tolerances
        .iter()
        .map(|&relative_singular_tolerance| RankAtTolerance {
            relative_singular_tolerance,
            rank: rank_at(relative_singular_tolerance),
        })
        .collect();
    let effective_rank = rank_at(chosen_tolerance);

    ObservationSpectrum {
        training_feature_means: Vec::new(),
        training_feature_scales: Vec::new(),
        relative_feature_scales: Vec::new(),
        normalized_singular_values: singular_values,
        relative_singular_values,
        chosen_relative_tolerance: chosen_tolerance,
        effective_rank,
        stable_rank,
        participation_ratio,
        rank_profile,
        noiseless_standardized_singular_values: Vec::new(),
        noiseless_standardized_relative_singular_values: Vec::new(),
        noiseless_numerical_rank: 0,
        noiseless_raw_singular_values: Vec::new(),
        detector_noise_std: 0.0,
        noise_aware_singular_threshold: 0.0,
        noise_aware_observable_dimension: 0,
        noise_aware_criterion: String::new(),
        degenerate_training_feature_count: 0,
        feature_diagnostics: Vec::new(),
    }
}

fn add_noiseless_diagnostics(
    spectrum: &mut ObservationSpectrum,
    observed_rows: &[Vec<f64>],
    noiseless_rows: &[Vec<f64>],
    train_samples: usize,
    rank_relative_tolerance: f64,
    detector_noise_std: f64,
) {
    let dimension = noiseless_rows[0].len();
    let mut signal_means = vec![0.0; dimension];
    for row in &noiseless_rows[..train_samples] {
        for (mean, &value) in signal_means.iter_mut().zip(row) {
            *mean += value;
        }
    }
    for mean in &mut signal_means {
        *mean /= train_samples as f64;
    }

    let mut signal_scales = vec![0.0; dimension];
    for row in &noiseless_rows[..train_samples] {
        for ((scale, &value), &mean) in signal_scales.iter_mut().zip(row).zip(&signal_means) {
            *scale += (value - mean).powi(2);
        }
    }
    for scale in &mut signal_scales {
        *scale = (*scale / train_samples as f64).sqrt();
    }

    let noiseless_standardized: Vec<Vec<f64>> = noiseless_rows[..train_samples]
        .iter()
        .map(|row| {
            row.iter()
                .zip(&signal_means)
                .zip(&signal_scales)
                .map(|((&value, &mean), &scale)| {
                    if scale > 1e-12 * mean.abs().max(1.0) {
                        (value - mean) / scale
                    } else {
                        0.0
                    }
                })
                .collect()
        })
        .collect();
    let noiseless_raw_centered: Vec<Vec<f64>> = noiseless_rows[..train_samples]
        .iter()
        .map(|row| {
            row.iter()
                .zip(&signal_means)
                .map(|(&value, &mean)| value - mean)
                .collect()
        })
        .collect();
    let standardized_singular = covariance_singular_values(&noiseless_standardized);
    let standardized_relative = relative_values(&standardized_singular);
    let noiseless_numerical_rank = standardized_relative
        .iter()
        .filter(|&&value| value > rank_relative_tolerance)
        .count();
    let raw_singular = covariance_singular_values(&noiseless_raw_centered);
    let noise_aware_observable_dimension = if detector_noise_std == 0.0 {
        noiseless_numerical_rank
    } else {
        raw_singular
            .iter()
            .filter(|&&value| value > detector_noise_std)
            .count()
            .min(noiseless_numerical_rank)
    };

    let feature_diagnostics = (0..dimension)
        .map(|feature| {
            let realized_detector_noise_rms = (observed_rows[..train_samples]
                .iter()
                .zip(&noiseless_rows[..train_samples])
                .map(|(observed, noiseless)| (observed[feature] - noiseless[feature]).powi(2))
                .sum::<f64>()
                / train_samples as f64)
                .sqrt();
            let signal_std = signal_scales[feature];
            let (linear_power_snr, snr_db, snr_status) = if detector_noise_std == 0.0 {
                if signal_std > 0.0 {
                    (None, None, "infinite".to_owned())
                } else {
                    (None, None, "undefined-zero-over-zero".to_owned())
                }
            } else if signal_std == 0.0 {
                (Some(0.0), None, "zero".to_owned())
            } else {
                let linear = (signal_std / detector_noise_std).powi(2);
                (
                    Some(linear),
                    Some(10.0 * linear.log10()),
                    "finite".to_owned(),
                )
            };
            FeatureDiagnostic {
                feature,
                noiseless_training_mean: signal_means[feature],
                signal_std,
                declared_detector_noise_std: detector_noise_std,
                realized_detector_noise_rms,
                linear_power_snr,
                snr_db,
                snr_status,
                signal_exceeds_declared_noise: signal_std > detector_noise_std,
            }
        })
        .collect();

    spectrum.noiseless_standardized_singular_values = standardized_singular;
    spectrum.noiseless_standardized_relative_singular_values = standardized_relative;
    spectrum.noiseless_numerical_rank = noiseless_numerical_rank;
    spectrum.noiseless_raw_singular_values = raw_singular;
    spectrum.detector_noise_std = detector_noise_std;
    spectrum.noise_aware_singular_threshold = detector_noise_std;
    spectrum.noise_aware_observable_dimension = noise_aware_observable_dimension;
    spectrum.noise_aware_criterion = if detector_noise_std == 0.0 {
        "zero-noise limit: equal to noiseless standardized numerical rank at the configured relative tolerance"
            .to_owned()
    } else {
        "count of noiseless raw principal standard deviations strictly above detector_noise_std, capped by noiseless standardized numerical rank"
            .to_owned()
    };
    spectrum.degenerate_training_feature_count = spectrum
        .training_feature_scales
        .iter()
        .filter(|&&scale| scale == 0.0)
        .count();
    spectrum.feature_diagnostics = feature_diagnostics;
}

fn covariance_singular_values(rows: &[Vec<f64>]) -> Vec<f64> {
    if rows.is_empty() || rows[0].is_empty() {
        return Vec::new();
    }
    let dimension = rows[0].len();
    let mut covariance = DMatrix::zeros(dimension, dimension);
    for row in rows {
        for left in 0..dimension {
            for right in 0..dimension {
                covariance[(left, right)] += row[left] * row[right];
            }
        }
    }
    covariance /= rows.len() as f64;
    let mut values: Vec<_> = SymmetricEigen::new(covariance)
        .eigenvalues
        .iter()
        .map(|&value| value.max(0.0).sqrt())
        .collect();
    values.sort_by(|left, right| right.total_cmp(left));
    values
}

fn relative_values(values: &[f64]) -> Vec<f64> {
    let largest = values.first().copied().unwrap_or(0.0);
    if largest > 0.0 {
        values.iter().map(|value| value / largest).collect()
    } else {
        vec![0.0; values.len()]
    }
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
                    significant_target_count: members
                        .iter()
                        .filter(|target| target.familywise_significant)
                        .count(),
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
            detector_noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.0,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 1,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-8,
            null_trials: 20,
            null_quantile: 0.95,
            rank_relative_tolerance: 1e-6,
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
            first.familywise_permutation_threshold,
            second.familywise_permutation_threshold
        );
        assert_eq!(
            first.total_corrected_capacity,
            second.total_corrected_capacity
        );
    }

    #[test]
    fn singular_spectrum_exposes_tolerance_sensitive_direction() {
        let observations: Vec<_> = (0..400)
            .map(|index| {
                let primary = (index as f64 * 0.173).sin();
                let perturbation = (index as f64 * 0.397).cos();
                vec![primary, primary + 1e-5 * perturbation]
            })
            .collect();
        let prepared = prepare_features(&observations, &observations, 0, 0.7, 1e-3, 0.0).unwrap();
        assert_eq!(prepared.spectrum.effective_rank, 1);
        assert!(prepared.spectrum.stable_rank < 1.01);
        assert_eq!(
            prepared
                .spectrum
                .rank_profile
                .iter()
                .find(|entry| entry.relative_singular_tolerance == 1e-9)
                .unwrap()
                .rank,
            2
        );
    }

    #[test]
    fn noise_aware_dimension_uses_strict_floor_and_zero_noise_limit() {
        let rows = vec![vec![-1.0], vec![1.0], vec![-1.0], vec![1.0]];
        let mut zero = observation_spectrum(&rows, 1e-6);
        add_noiseless_diagnostics(&mut zero, &rows, &rows, rows.len(), 1e-6, 0.0);
        assert_eq!(zero.noiseless_numerical_rank, 1);
        assert_eq!(zero.noise_aware_observable_dimension, 1);

        let mut at_boundary = observation_spectrum(&rows, 1e-6);
        add_noiseless_diagnostics(&mut at_boundary, &rows, &rows, rows.len(), 1e-6, 1.0);
        assert_eq!(at_boundary.noiseless_raw_singular_values, vec![1.0]);
        assert_eq!(at_boundary.noise_aware_observable_dimension, 0);

        let mut below_boundary = observation_spectrum(&rows, 1e-6);
        add_noiseless_diagnostics(
            &mut below_boundary,
            &rows,
            &rows,
            rows.len(),
            1e-6,
            1.0 - 1e-12,
        );
        assert_eq!(below_boundary.noise_aware_observable_dimension, 1);
    }

    #[test]
    fn snr_is_power_ratio_and_db_conversion_is_auditable() {
        let rows = vec![vec![-1.0], vec![1.0], vec![-1.0], vec![1.0]];
        let mut spectrum = observation_spectrum(&rows, 1e-6);
        add_noiseless_diagnostics(&mut spectrum, &rows, &rows, rows.len(), 1e-6, 0.5);
        let diagnostic = &spectrum.feature_diagnostics[0];
        assert_eq!(diagnostic.linear_power_snr, Some(4.0));
        assert!((diagnostic.snr_db.unwrap() - 6.020_599_913).abs() < 1e-9);
        assert_eq!(diagnostic.snr_status, "finite");
    }

    #[test]
    fn raw_readout_norm_converts_training_scales_and_rejects_degenerate_weight() {
        let norm = raw_equivalent_weight_norm(&[2.0, 3.0], &[4.0, 0.5]).unwrap();
        assert!((norm - (0.25_f64 + 36.0).sqrt()).abs() < 1e-14);
        assert_eq!(raw_equivalent_weight_norm(&[0.0], &[0.0]), Some(0.0));
        assert_eq!(raw_equivalent_weight_norm(&[1e-3], &[0.0]), None);
    }
}
