use anyhow::{Context, Result};
use burn::{
    data::dataset::Dataset,
    module::{AutodiffModule, Module},
    optim::{AdamConfig, GradientsParams, Optimizer},
    record::{FullPrecisionSettings, NamedMpkFileRecorder},
    tensor::{
        Int, Tensor, TensorData,
        backend::{AutodiffBackend, Backend},
    },
};
use rand::{SeedableRng, rngs::StdRng, seq::SliceRandom};
use std::{
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use crate::{
    data::{
        corruption::{Corruption, corrupt},
        mnist::MnistDataset,
    },
    experiment::{config::ExperimentConfig, metrics::Measurement},
    model::{
        feed_forward::FeedForwardMatched, recurrent_machine::RecurrentMachine,
        unshared::UnsharedRecurrent,
    },
    output::{
        frames::save_grayscale,
        results::{write_accuracy_svg, write_confusable_pairs, write_manifest, write_measurements},
    },
    train::{losses::trajectory_loss, trainer::recurrence_for_batch},
};

pub fn gpu_info<B: Backend>(device: &B::Device) -> Result<()> {
    let value = Tensor::<B, 1>::from_data(TensorData::from([1.0f32, 2.0]), device).sum();
    println!(
        "backend={} device={device:?} probe={:?}",
        std::any::type_name::<B>(),
        value.into_data()
    );
    Ok(())
}

pub fn smoke<B: Backend>(cfg: &ExperimentConfig, device: &B::Device) -> Result<()> {
    B::seed(device, cfg.seed);
    let model = RecurrentMachine::<B>::new(
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.q_injection,
        cfg.nonlinear,
        cfg.residual_gamma,
        cfg.coupling_scale,
        device,
    );
    let q = Tensor::<B, 4>::ones([2, 1, 28, 28], device);
    let start = Instant::now();
    let trajectory = model.forward(q, *cfg.eval_recurrences.iter().max().unwrap());
    let last = trajectory.logits.last().unwrap();
    println!(
        "operator_params={} state_dim=1568 trajectory={} logits={:?} elapsed={:?}",
        model.parameter_count(),
        trajectory.states.len(),
        last.dims(),
        start.elapsed()
    );
    write_manifest(cfg, model.parameter_count(), "smoke")?;
    Ok(())
}

pub fn train<B: AutodiffBackend>(
    cfg: &ExperimentConfig,
    resume: Option<&Path>,
    start_epoch: usize,
    device: &B::Device,
) -> Result<()> {
    B::seed(device, cfg.seed);
    let dataset = MnistDataset::train();
    let mut model = RecurrentMachine::<B>::new(
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.q_injection,
        cfg.nonlinear,
        cfg.residual_gamma,
        cfg.coupling_scale,
        device,
    );
    if let Some(checkpoint) = resume {
        let inner = RecurrentMachine::<B::InnerBackend>::new(
            cfg.depth,
            cfg.kernel_size,
            cfg.alpha,
            cfg.transmission,
            cfg.q_injection,
            cfg.nonlinear,
            cfg.residual_gamma,
            cfg.coupling_scale,
            device,
        )
        .load_file(
            checkpoint.with_extension(""),
            &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
            device,
        )?;
        model = RecurrentMachine::<B>::from_inner(inner);
    }
    anyhow::ensure!(
        start_epoch <= cfg.epochs,
        "start_epoch exceeds configured epochs"
    );
    let mut optimizer = AdamConfig::new().init::<B, RecurrentMachine<B>>();
    let sample_count = cfg
        .max_train_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let mut indices: Vec<usize> = (0..sample_count).collect();
    let start = Instant::now();
    let output = PathBuf::from(&cfg.output_dir).join(&cfg.name);
    fs::create_dir_all(&output)?;

    for epoch in start_epoch..cfg.epochs {
        let mut rng = StdRng::seed_from_u64(cfg.seed.wrapping_add(epoch as u64));
        indices.shuffle(&mut rng);
        let mut running_loss = 0.0f64;
        let mut samples = 0usize;
        for (batch_index, chunk) in indices.chunks(cfg.batch_size).enumerate() {
            let (images, labels) = make_batch::<B, _>(
                &dataset,
                chunk,
                &cfg.corruption,
                cfg.seed ^ ((epoch as u64) << 32) ^ batch_index as u64,
                device,
            )?;
            let recurrence =
                recurrence_for_batch(&cfg.train_recurrences, cfg.seed, epoch, batch_index);
            let trajectory = model.forward(images, recurrence);
            let loss = trajectory_loss(&trajectory.logits, labels, cfg.intermediate_loss_weight);
            let loss_value = scalar_f32(loss.clone())? as f64;
            let grads = GradientsParams::from_grads(loss.backward(), &model);
            model = optimizer.step(cfg.learning_rate, model, grads);
            running_loss += loss_value * chunk.len() as f64;
            samples += chunk.len();
            if batch_index % 100 == 0 {
                println!(
                    "epoch={}/{} batch={} T={} loss={:.6}",
                    epoch + 1,
                    cfg.epochs,
                    batch_index,
                    recurrence,
                    running_loss / samples as f64
                );
            }
        }
        println!(
            "epoch={}/{} mean_loss={:.6}",
            epoch + 1,
            cfg.epochs,
            running_loss / samples as f64
        );
        model.valid().save_file(
            output.join(format!("model-epoch-{}", epoch + 1)),
            &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
        )?;
    }

    let checkpoint = output.join("model");
    let parameter_count = model.num_params();
    let training_seconds = start.elapsed().as_secs_f64();
    model.valid().save_file(
        checkpoint.clone(),
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
    )?;
    fs::write(output.join("config.toml"), toml::to_string_pretty(cfg)?)?;
    fs::write(
        output.join("training.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "training_seconds": training_seconds,
            "samples": sample_count,
            "epochs": cfg.epochs,
            "seed": cfg.seed
        }))?,
    )?;
    write_manifest(cfg, parameter_count, "trained")?;
    println!(
        "checkpoint={} parameters={} training_seconds={:.3}",
        checkpoint.with_extension("mpk").display(),
        parameter_count,
        training_seconds
    );
    Ok(())
}

pub fn evaluate<B: Backend>(
    cfg: &ExperimentConfig,
    checkpoint: &Path,
    recurrences: &[usize],
    device: &B::Device,
) -> Result<()> {
    anyhow::ensure!(
        !recurrences.is_empty(),
        "at least one recurrence is required"
    );
    B::seed(device, cfg.seed);
    let base = checkpoint.with_extension("");
    anyhow::ensure!(
        base.with_extension("mpk").exists(),
        "checkpoint does not exist: {}",
        base.with_extension("mpk").display()
    );
    let model = RecurrentMachine::<B>::new(
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.q_injection,
        cfg.nonlinear,
        cfg.residual_gamma,
        cfg.coupling_scale,
        device,
    )
    .load_file(
        base,
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
        device,
    )?;
    let dataset = MnistDataset::test();
    let max_t = *recurrences.iter().max().unwrap();
    let mut totals = vec![EvalAccumulator::default(); max_t];
    let mut examples = ExampleSelections::default();
    let sample_count = cfg
        .max_eval_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let all_indices: Vec<usize> = (0..sample_count).collect();
    let training_seconds = read_training_seconds(cfg).unwrap_or(0.0);

    for (batch_index, chunk) in all_indices.chunks(cfg.batch_size).enumerate() {
        let (images, labels_tensor) = make_batch::<B, _>(
            &dataset,
            chunk,
            &cfg.corruption,
            cfg.seed ^ 0xE1A1_u64 ^ batch_index as u64,
            device,
        )?;
        let labels = labels_tensor.clone().into_data().to_vec::<i32>()?;
        let batch_start = Instant::now();
        let trajectory = model.forward(images, max_t);
        let elapsed = batch_start.elapsed().as_secs_f64();
        let mut previous: Option<(Vec<usize>, Vec<f64>)> = None;
        let mut batch_predictions = Vec::with_capacity(max_t);
        for t in 0..max_t {
            let logits = trajectory.logits[t].clone().into_data().to_vec::<f32>()?;
            let (predictions, confidences) = totals[t].observe_logits(&logits, &labels);
            if let Some((previous_predictions, previous_confidences)) = previous.as_ref() {
                totals[t].observe_transitions(
                    previous_predictions,
                    &predictions,
                    previous_confidences,
                    &confidences,
                    &labels,
                );
            }
            previous = Some((predictions.clone(), confidences));
            batch_predictions.push(predictions);
            totals[t].state_difference +=
                scalar_f32(trajectory.state_differences[t].clone())? as f64 * chunk.len() as f64;
            totals[t].optical_norm +=
                scalar_f32(trajectory.norm_proxies[t].clone())? as f64 * chunk.len() as f64;
            totals[t].inference_seconds += elapsed / max_t as f64;
        }
        for offset in 0..chunk.len() {
            let sequence: Vec<usize> = batch_predictions.iter().map(|x| x[offset]).collect();
            examples.observe(
                chunk[offset],
                labels[offset] as usize,
                sequence,
                (cfg.seed ^ 0xE1A1_u64 ^ batch_index as u64).wrapping_add(offset as u64),
            );
        }
    }

    let (corruption_type, severity) = corruption_label(&cfg.corruption);
    let parameter_count = model.num_params();
    let rows: Vec<_> = recurrences
        .iter()
        .map(|&t| {
            totals[t - 1].measurement(
                cfg,
                "recurrent",
                parameter_count,
                t,
                corruption_type,
                severity,
                training_seconds,
            )
        })
        .collect();
    let every_step: Vec<_> = (1..=max_t)
        .map(|t| {
            totals[t - 1].measurement(
                cfg,
                "recurrent",
                parameter_count,
                t,
                corruption_type,
                severity,
                training_seconds,
            )
        })
        .collect();
    let output = PathBuf::from(&cfg.output_dir).join(&cfg.name);
    fs::create_dir_all(&output)?;
    write_measurements(output.join("evaluation.csv"), &rows)?;
    fs::write(
        output.join("evaluation.json"),
        serde_json::to_vec_pretty(&rows)?,
    )?;
    fs::write(
        output.join("transition-every-step.json"),
        serde_json::to_vec_pretty(&every_step)?,
    )?;
    write_accuracy_svg(output.join("accuracy-vs-recurrence.svg"), &rows)?;
    write_confusable_pairs(output.join("confusable-pairs.json"), &rows)?;
    export_examples(&model, &dataset, cfg, max_t, &examples, device, &output)?;
    for row in &rows {
        println!(
            "T={} accuracy={:.4} cross_entropy={:.5} wrong->right={} right->wrong={}",
            row.recurrence, row.accuracy, row.cross_entropy, row.wrong_to_right, row.right_to_wrong
        );
    }
    Ok(())
}

#[derive(Clone, Debug, serde::Serialize)]
struct ExampleCase {
    index: usize,
    label: usize,
    predictions: Vec<usize>,
    corruption_seed: u64,
}

#[derive(Default, serde::Serialize)]
struct ExampleSelections {
    easy_correct: Option<ExampleCase>,
    recurrence_succeeds: Option<ExampleCase>,
    recurrence_fails: Option<ExampleCase>,
    initially_correct_destroyed: Option<ExampleCase>,
    permanently_wrong: Option<ExampleCase>,
    long_nonconvergent_correct: Option<ExampleCase>,
    flips_repeatedly: Option<ExampleCase>,
    converges: Option<ExampleCase>,
    apparent_limit_cycle: Option<ExampleCase>,
}

impl ExampleSelections {
    fn observe(
        &mut self,
        index: usize,
        label: usize,
        predictions: Vec<usize>,
        corruption_seed: u64,
    ) {
        let case = || ExampleCase {
            index,
            label,
            predictions: predictions.clone(),
            corruption_seed,
        };
        let changes = predictions.windows(2).filter(|x| x[0] != x[1]).count();
        if predictions.iter().all(|p| *p == label) && self.easy_correct.is_none() {
            self.easy_correct = Some(case());
        }
        if predictions.first() != Some(&label)
            && predictions.last() == Some(&label)
            && self.recurrence_succeeds.is_none()
        {
            self.recurrence_succeeds = Some(case());
        }
        if predictions.last() != Some(&label) && self.recurrence_fails.is_none() {
            self.recurrence_fails = Some(case());
        }
        if predictions.first() == Some(&label)
            && predictions.last() != Some(&label)
            && self.initially_correct_destroyed.is_none()
        {
            self.initially_correct_destroyed = Some(case());
        }
        if predictions.iter().all(|p| *p != label) && self.permanently_wrong.is_none() {
            self.permanently_wrong = Some(case());
        }
        if predictions.last() == Some(&label)
            && changes >= 2
            && self.long_nonconvergent_correct.is_none()
        {
            self.long_nonconvergent_correct = Some(case());
        }
        if changes >= 2 && self.flips_repeatedly.is_none() {
            self.flips_repeatedly = Some(case());
        }
        if predictions.len() >= 3
            && predictions[predictions.len() - 3..]
                .windows(2)
                .all(|x| x[0] == x[1])
            && self.converges.is_none()
        {
            self.converges = Some(case());
        }
        if predictions.len() >= 4 {
            let p = &predictions[predictions.len() - 4..];
            if p[0] == p[2] && p[1] == p[3] && p[0] != p[1] && self.apparent_limit_cycle.is_none() {
                self.apparent_limit_cycle = Some(case());
            }
        }
    }
}

fn export_examples<B: Backend, D: Dataset<burn::data::dataset::vision::MnistItem>>(
    model: &RecurrentMachine<B>,
    dataset: &D,
    cfg: &ExperimentConfig,
    max_t: usize,
    selections: &ExampleSelections,
    device: &B::Device,
    output: &Path,
) -> Result<()> {
    let frames_dir = output.join("frames");
    fs::create_dir_all(&frames_dir)?;
    fs::write(
        frames_dir.join("selection.json"),
        serde_json::to_vec_pretty(selections)?,
    )?;
    let cases = [
        ("easy_correct", selections.easy_correct.as_ref()),
        (
            "recurrence_succeeds",
            selections.recurrence_succeeds.as_ref(),
        ),
        ("recurrence_fails", selections.recurrence_fails.as_ref()),
        ("flips_repeatedly", selections.flips_repeatedly.as_ref()),
        ("converges", selections.converges.as_ref()),
        (
            "apparent_limit_cycle",
            selections.apparent_limit_cycle.as_ref(),
        ),
        (
            "initially_correct_destroyed",
            selections.initially_correct_destroyed.as_ref(),
        ),
        ("permanently_wrong", selections.permanently_wrong.as_ref()),
        (
            "long_nonconvergent_correct",
            selections.long_nonconvergent_correct.as_ref(),
        ),
    ];
    for (category, maybe_case) in cases {
        let Some(case) = maybe_case else { continue };
        let (image, _) = make_batch::<B, _>(
            dataset,
            &[case.index],
            &cfg.corruption,
            case.corruption_seed,
            device,
        )?;
        let trajectory = model.forward(image, max_t);
        let case_dir = frames_dir.join(format!("{}_{}", category, case.index));
        fs::create_dir_all(&case_dir)?;
        let mut detector_writer = csv::Writer::from_path(case_dir.join("detectors.csv"))?;
        detector_writer.write_record([
            "t", "d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7", "d8", "d9",
        ])?;
        for &t in &[0usize, 1, 2, 4, 8, 16, 32] {
            if t > max_t {
                continue;
            }
            let re = trajectory.states[t]
                .re
                .clone()
                .into_data()
                .to_vec::<f32>()?;
            let im = trajectory.states[t]
                .im
                .clone()
                .into_data()
                .to_vec::<f32>()?;
            let amplitude: Vec<f32> = re
                .iter()
                .zip(&im)
                .map(|(a, b)| (a * a + b * b).sqrt())
                .collect();
            let max_amplitude = amplitude.iter().copied().fold(1e-12f32, f32::max);
            let amplitude: Vec<f32> = amplitude.into_iter().map(|x| x / max_amplitude).collect();
            let phase: Vec<f32> = re
                .iter()
                .zip(&im)
                .map(|(a, b)| (b.atan2(*a) + std::f32::consts::PI) / (2.0 * std::f32::consts::PI))
                .collect();
            save_grayscale(
                case_dir.join(format!("t{t:02}_amplitude.png")),
                &amplitude,
                28,
                28,
            )?;
            save_grayscale(case_dir.join(format!("t{t:02}_phase.png")), &phase, 28, 28)?;
            if t > 0 {
                let detectors = trajectory.logits[t - 1]
                    .clone()
                    .into_data()
                    .to_vec::<f32>()?;
                let mut row = vec![t.to_string()];
                row.extend(detectors.iter().map(ToString::to_string));
                detector_writer.write_record(row)?;
                let max_detector = detectors.iter().copied().fold(1e-12f32, f32::max);
                let normalized: Vec<f32> =
                    detectors.into_iter().map(|x| x / max_detector).collect();
                save_grayscale(
                    case_dir.join(format!("t{t:02}_detectors.png")),
                    &normalized,
                    10,
                    1,
                )?;
            }
        }
        detector_writer.flush()?;
    }
    Ok(())
}

pub fn train_feed_forward<B: AutodiffBackend>(
    cfg: &ExperimentConfig,
    stages: usize,
    device: &B::Device,
) -> Result<()> {
    anyhow::ensure!(stages > 0, "feed-forward stages must be positive");
    B::seed(device, cfg.seed);
    let dataset = MnistDataset::train();
    let sample_count = cfg
        .max_train_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let mut indices: Vec<usize> = (0..sample_count).collect();
    let mut model = FeedForwardMatched::<B>::new(
        stages,
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.coupling_scale,
        device,
    );
    let mut optimizer = AdamConfig::new().init::<B, FeedForwardMatched<B>>();
    let started = Instant::now();
    for epoch in 0..cfg.epochs {
        indices.shuffle(&mut StdRng::seed_from_u64(
            cfg.seed.wrapping_add(epoch as u64),
        ));
        let mut running_loss = 0.0;
        let mut samples = 0;
        for (batch_index, chunk) in indices.chunks(cfg.batch_size).enumerate() {
            let (images, labels) = make_batch::<B, _>(
                &dataset,
                chunk,
                &cfg.corruption,
                cfg.seed ^ ((epoch as u64) << 32) ^ batch_index as u64,
                device,
            )?;
            let logits = model.forward(images);
            let loss = trajectory_loss(&[logits], labels, 0.0);
            running_loss += scalar_f32(loss.clone())? as f64 * chunk.len() as f64;
            samples += chunk.len();
            let grads = GradientsParams::from_grads(loss.backward(), &model);
            model = optimizer.step(cfg.learning_rate, model, grads);
        }
        println!(
            "feed_forward epoch={}/{} stages={} mean_loss={:.6}",
            epoch + 1,
            cfg.epochs,
            stages,
            running_loss / samples as f64
        );
    }
    let training_seconds = started.elapsed().as_secs_f64();
    let output = feed_forward_output(cfg, stages);
    fs::create_dir_all(&output)?;
    let checkpoint = output.join("model");
    let parameter_count = model.num_params();
    model.valid().save_file(
        checkpoint.clone(),
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
    )?;
    fs::write(output.join("config.toml"), toml::to_string_pretty(cfg)?)?;
    fs::write(
        output.join("training.json"),
        serde_json::to_vec_pretty(&serde_json::json!({
            "training_seconds": training_seconds, "samples": sample_count, "epochs": cfg.epochs,
            "seed": cfg.seed, "stages": stages, "budget_note": "operation-matched control; independent stages increase parameters"
        }))?,
    )?;
    println!(
        "checkpoint={} parameters={} training_seconds={:.3}",
        checkpoint.with_extension("mpk").display(),
        parameter_count,
        training_seconds
    );
    Ok(())
}

pub fn evaluate_feed_forward<B: Backend>(
    cfg: &ExperimentConfig,
    checkpoint: &Path,
    stages: usize,
    device: &B::Device,
) -> Result<()> {
    anyhow::ensure!(stages > 0, "feed-forward stages must be positive");
    B::seed(device, cfg.seed);
    let base = checkpoint.with_extension("");
    anyhow::ensure!(
        base.with_extension("mpk").exists(),
        "checkpoint does not exist: {}",
        base.with_extension("mpk").display()
    );
    let model = FeedForwardMatched::<B>::new(
        stages,
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.coupling_scale,
        device,
    )
    .load_file(
        base,
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
        device,
    )?;
    let dataset = MnistDataset::test();
    let sample_count = cfg
        .max_eval_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let indices: Vec<usize> = (0..sample_count).collect();
    let mut total = EvalAccumulator::default();
    for (batch_index, chunk) in indices.chunks(cfg.batch_size).enumerate() {
        let (images, labels_tensor) = make_batch::<B, _>(
            &dataset,
            chunk,
            &cfg.corruption,
            cfg.seed ^ 0xFEED_u64 ^ batch_index as u64,
            device,
        )?;
        let labels = labels_tensor.into_data().to_vec::<i32>()?;
        let started = Instant::now();
        let logits = model.forward(images).into_data().to_vec::<f32>()?;
        total.inference_seconds += started.elapsed().as_secs_f64();
        let _ = total.observe_logits(&logits, &labels);
    }
    let (kind, severity) = corruption_label(&cfg.corruption);
    let output = feed_forward_output(cfg, stages);
    let training_seconds = fs::read(output.join("training.json"))
        .ok()
        .and_then(|x| serde_json::from_slice::<serde_json::Value>(&x).ok())
        .and_then(|x| x.get("training_seconds").and_then(|x| x.as_f64()))
        .unwrap_or(0.0);
    let row = total.measurement(
        cfg,
        "feed_forward_operation_matched",
        model.num_params(),
        stages,
        kind,
        severity,
        training_seconds,
    );
    fs::create_dir_all(&output)?;
    write_measurements(output.join("evaluation.csv"), std::slice::from_ref(&row))?;
    fs::write(
        output.join("evaluation.json"),
        serde_json::to_vec_pretty(&row)?,
    )?;
    println!(
        "feed_forward stages={} parameters={} accuracy={:.4} cross_entropy={:.5}",
        stages, row.parameter_count, row.accuracy, row.cross_entropy
    );
    Ok(())
}

pub fn train_unshared<B: AutodiffBackend>(
    cfg: &ExperimentConfig,
    steps: usize,
    device: &B::Device,
) -> Result<()> {
    B::seed(device, cfg.seed);
    let dataset = MnistDataset::train();
    let sample_count = cfg
        .max_train_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let mut indices: Vec<_> = (0..sample_count).collect();
    let mut model = UnsharedRecurrent::<B>::new(
        steps,
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.q_injection,
        cfg.nonlinear,
        cfg.residual_gamma,
        cfg.coupling_scale,
        device,
    );
    let mut optimizer = AdamConfig::new().init::<B, UnsharedRecurrent<B>>();
    let started = Instant::now();
    for epoch in 0..cfg.epochs {
        indices.shuffle(&mut StdRng::seed_from_u64(cfg.seed + epoch as u64));
        for (batch, chunk) in indices.chunks(cfg.batch_size).enumerate() {
            let (images, labels) = make_batch::<B, _>(
                &dataset,
                chunk,
                &cfg.corruption,
                cfg.seed ^ batch as u64,
                device,
            )?;
            let t = recurrence_for_batch(&cfg.train_recurrences, cfg.seed, epoch, batch).min(steps);
            let trajectory = model.forward(images, t);
            let loss = trajectory_loss(&trajectory.logits, labels, cfg.intermediate_loss_weight);
            let grads = GradientsParams::from_grads(loss.backward(), &model);
            model = optimizer.step(cfg.learning_rate, model, grads)
        }
    }
    let output = PathBuf::from(&cfg.output_dir).join(format!("{}_unshared_t{}", cfg.name, steps));
    fs::create_dir_all(&output)?;
    model.valid().save_file(
        output.join("model"),
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
    )?;
    fs::write(
        output.join("training.json"),
        serde_json::to_vec_pretty(
            &serde_json::json!({"training_seconds":started.elapsed().as_secs_f64(),"parameters":model.num_params(),"independent_steps":steps}),
        )?,
    )?;
    Ok(())
}

pub fn evaluate_unshared<B: Backend>(
    cfg: &ExperimentConfig,
    checkpoint: &Path,
    steps: usize,
    device: &B::Device,
) -> Result<()> {
    B::seed(device, cfg.seed);
    let model = UnsharedRecurrent::<B>::new(
        steps,
        cfg.depth,
        cfg.kernel_size,
        cfg.alpha,
        cfg.transmission,
        cfg.q_injection,
        cfg.nonlinear,
        cfg.residual_gamma,
        cfg.coupling_scale,
        device,
    )
    .load_file(
        checkpoint.with_extension(""),
        &NamedMpkFileRecorder::<FullPrecisionSettings>::new(),
        device,
    )?;
    let dataset = MnistDataset::test();
    let sample_count = cfg
        .max_eval_samples
        .unwrap_or(dataset.len())
        .min(dataset.len());
    let indices: Vec<_> = (0..sample_count).collect();
    let mut total = EvalAccumulator::default();
    for (batch, chunk) in indices.chunks(cfg.batch_size).enumerate() {
        let (images, labels_tensor) = make_batch::<B, _>(
            &dataset,
            chunk,
            &cfg.corruption,
            cfg.seed ^ 0x55AA ^ batch as u64,
            device,
        )?;
        let labels = labels_tensor.into_data().to_vec::<i32>()?;
        let logits = model
            .forward(images, steps)
            .logits
            .pop()
            .unwrap()
            .into_data()
            .to_vec::<f32>()?;
        let _ = total.observe_logits(&logits, &labels);
    }
    let (kind, severity) = corruption_label(&cfg.corruption);
    let row = total.measurement(
        cfg,
        "unshared_recurrent",
        model.num_params(),
        steps,
        kind,
        severity,
        0.0,
    );
    let output = PathBuf::from(&cfg.output_dir).join(format!("{}_unshared_t{}", cfg.name, steps));
    fs::create_dir_all(&output)?;
    write_measurements(output.join("evaluation.csv"), std::slice::from_ref(&row))?;
    fs::write(
        output.join("evaluation.json"),
        serde_json::to_vec_pretty(&row)?,
    )?;
    Ok(())
}

fn feed_forward_output(cfg: &ExperimentConfig, stages: usize) -> PathBuf {
    PathBuf::from(&cfg.output_dir).join(format!("{}_feed_forward_t{}", cfg.name, stages))
}

fn make_batch<B: Backend, D: Dataset<burn::data::dataset::vision::MnistItem>>(
    dataset: &D,
    indices: &[usize],
    corruption: &Corruption,
    seed: u64,
    device: &B::Device,
) -> Result<(Tensor<B, 4>, Tensor<B, 1, Int>)> {
    let mut pixels = Vec::with_capacity(indices.len() * 784);
    let mut labels = Vec::with_capacity(indices.len());
    for (offset, &index) in indices.iter().enumerate() {
        let item = dataset.get(index).context("MNIST index missing")?;
        let mut image: Vec<f32> = item
            .image
            .into_iter()
            .flatten()
            .map(|x| x / 255.0)
            .collect();
        corrupt(&mut image, corruption, seed.wrapping_add(offset as u64));
        pixels.extend(image);
        labels.push(item.label as i32);
    }
    Ok((
        Tensor::from_data(TensorData::new(pixels, [indices.len(), 1, 28, 28]), device),
        Tensor::from_data(TensorData::new(labels, [indices.len()]), device),
    ))
}

fn scalar_f32<B: Backend>(tensor: Tensor<B, 1>) -> Result<f32> {
    Ok(*tensor
        .into_data()
        .as_slice::<f32>()?
        .first()
        .context("empty scalar tensor")?)
}

fn corruption_label(corruption: &Corruption) -> (&'static str, f32) {
    match corruption {
        Corruption::Clean => ("clean", 0.0),
        Corruption::Gaussian(x) => ("gaussian", *x),
        Corruption::GaussianRange(x) => ("gaussian_range", *x),
        Corruption::Occlusion(x) => ("occlusion", *x),
        Corruption::OcclusionRange(x) => ("occlusion_range", x.iter().copied().fold(0.0, f32::max)),
        Corruption::TrainingMixture(x) => {
            ("training_mixture", x.iter().copied().fold(0.0, f32::max))
        }
        Corruption::VerticalStrip(x) => ("vertical_strip", *x),
        Corruption::HorizontalStrip(x) => ("horizontal_strip", *x),
        Corruption::CentralBlock(x) => ("central_block", *x),
        Corruption::RandomPatches(x) => ("random_patches", *x),
    }
}

fn read_training_seconds(cfg: &ExperimentConfig) -> Option<f64> {
    let path = PathBuf::from(&cfg.output_dir)
        .join(&cfg.name)
        .join("training.json");
    let value: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    value.get("training_seconds")?.as_f64()
}

#[derive(Clone, Default)]
struct EvalAccumulator {
    samples: usize,
    correct: usize,
    loss: f64,
    entropy: f64,
    class_total: [usize; 10],
    class_correct: [usize; 10],
    prediction_changes: usize,
    confusion_matrix: [[usize; 10]; 10],
    wrong_to_right: usize,
    right_to_wrong: usize,
    transition_wrong_base: usize,
    transition_right_base: usize,
    state_difference: f64,
    optical_norm: f64,
    inference_seconds: f64,
    confidence_amplifications: usize,
}

impl EvalAccumulator {
    fn observe_logits(&mut self, logits: &[f32], labels: &[i32]) -> (Vec<usize>, Vec<f64>) {
        let mut predictions = Vec::with_capacity(labels.len());
        let mut confidences = Vec::with_capacity(labels.len());
        for (row, &label) in logits.chunks_exact(10).zip(labels) {
            let max = row.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            let exps: Vec<f64> = row.iter().map(|x| (*x - max).exp() as f64).collect();
            let sum: f64 = exps.iter().sum();
            let prediction = row
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .unwrap()
                .0;
            let y = label as usize;
            let probability = (exps[y] / sum).max(1e-12);
            self.loss -= probability.ln();
            self.entropy -= exps
                .iter()
                .map(|x| {
                    let p = x / sum;
                    if p > 0.0 { p * p.ln() } else { 0.0 }
                })
                .sum::<f64>();
            self.samples += 1;
            self.class_total[y] += 1;
            self.confusion_matrix[y][prediction] += 1;
            if prediction == y {
                self.correct += 1;
                self.class_correct[y] += 1;
            }
            predictions.push(prediction);
            confidences.push(exps[prediction] / sum);
        }
        (predictions, confidences)
    }

    fn observe_transitions(
        &mut self,
        previous: &[usize],
        current: &[usize],
        previous_confidence: &[f64],
        current_confidence: &[f64],
        labels: &[i32],
    ) {
        for ((((&p, &c), &pc), &cc), &y) in previous
            .iter()
            .zip(current)
            .zip(previous_confidence)
            .zip(current_confidence)
            .zip(labels)
        {
            if p != c {
                self.prediction_changes += 1;
            }
            if p == c && cc > pc {
                self.confidence_amplifications += 1;
            }
            if p == y as usize {
                self.transition_right_base += 1;
            } else {
                self.transition_wrong_base += 1;
            }
            if p != y as usize && c == y as usize {
                self.wrong_to_right += 1;
            }
            if p == y as usize && c != y as usize {
                self.right_to_wrong += 1;
            }
        }
    }

    fn measurement(
        &self,
        cfg: &ExperimentConfig,
        baseline: &str,
        parameter_count: usize,
        recurrence: usize,
        corruption_type: &str,
        severity: f32,
        wall: f64,
    ) -> Measurement {
        let mut per_class_accuracy = [0.0; 10];
        for class in 0..10 {
            if self.class_total[class] > 0 {
                per_class_accuracy[class] =
                    self.class_correct[class] as f64 / self.class_total[class] as f64;
            }
        }
        Measurement {
            run: cfg.name.clone(),
            seed: cfg.seed,
            baseline: baseline.into(),
            parameter_count,
            state_dimensionality: 1568,
            depth: cfg.depth,
            recurrence,
            corruption_type: corruption_type.into(),
            corruption_severity: severity,
            accuracy: self.correct as f64 / self.samples as f64,
            cross_entropy: self.loss / self.samples as f64,
            entropy: self.entropy / self.samples as f64,
            per_class_accuracy,
            confusion_matrix: self.confusion_matrix,
            prediction_changes: self.prediction_changes,
            wrong_to_right: self.wrong_to_right,
            right_to_wrong: self.right_to_wrong,
            wrong_to_right_probability: ratio(self.wrong_to_right, self.transition_wrong_base),
            right_to_wrong_probability: ratio(self.right_to_wrong, self.transition_right_base),
            state_difference: self.state_difference / self.samples as f64,
            optical_norm: self.optical_norm / self.samples as f64,
            training_seconds: wall,
            inference_seconds_per_recurrence: self.inference_seconds / self.samples as f64,
            confidence_amplifications: self.confidence_amplifications,
            confidence_amplification_probability: ratio(
                self.confidence_amplifications,
                self.samples,
            ),
        }
    }
}

fn ratio(numerator: usize, denominator: usize) -> f64 {
    if denominator == 0 {
        0.0
    } else {
        numerator as f64 / denominator as f64
    }
}
