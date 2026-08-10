use crate::experiment::{config::ExperimentConfig, metrics::Measurement};
use anyhow::Result;
use serde_json::json;
use std::{fs, path::PathBuf};

pub fn write_manifest(cfg: &ExperimentConfig, parameters: usize, status: &str) -> Result<()> {
    let dir = PathBuf::from(&cfg.output_dir).join(&cfg.name);
    fs::create_dir_all(&dir)?;
    fs::write(
        dir.join("run.json"),
        serde_json::to_vec_pretty(&json!({
            "config": cfg, "parameter_count": parameters, "state_dimensionality": 1568,
            "status": status, "claim": "No scientific conclusion may be drawn from a smoke run."
        }))?,
    )?;
    Ok(())
}

pub fn write_measurements(path: impl Into<PathBuf>, rows: &[Measurement]) -> Result<()> {
    let mut writer = csv::Writer::from_path(path.into())?;
    writer.write_record([
        "run",
        "seed",
        "baseline",
        "parameter_count",
        "state_dimensionality",
        "depth",
        "recurrence",
        "corruption_type",
        "corruption_severity",
        "accuracy",
        "cross_entropy",
        "entropy",
        "per_class_accuracy",
        "confusion_matrix",
        "prediction_changes",
        "wrong_to_right",
        "right_to_wrong",
        "wrong_to_right_probability",
        "right_to_wrong_probability",
        "state_difference",
        "optical_norm",
        "training_seconds",
        "inference_seconds_per_recurrence",
        "confidence_amplifications",
        "confidence_amplification_probability",
    ])?;
    for row in rows {
        writer.write_record([
            row.run.clone(),
            row.seed.to_string(),
            row.baseline.clone(),
            row.parameter_count.to_string(),
            row.state_dimensionality.to_string(),
            row.depth.to_string(),
            row.recurrence.to_string(),
            row.corruption_type.clone(),
            row.corruption_severity.to_string(),
            row.accuracy.to_string(),
            row.cross_entropy.to_string(),
            row.entropy.to_string(),
            serde_json::to_string(&row.per_class_accuracy)?,
            serde_json::to_string(&row.confusion_matrix)?,
            row.prediction_changes.to_string(),
            row.wrong_to_right.to_string(),
            row.right_to_wrong.to_string(),
            row.wrong_to_right_probability.to_string(),
            row.right_to_wrong_probability.to_string(),
            row.state_difference.to_string(),
            row.optical_norm.to_string(),
            row.training_seconds.to_string(),
            row.inference_seconds_per_recurrence.to_string(),
            row.confidence_amplifications.to_string(),
            row.confidence_amplification_probability.to_string(),
        ])?;
    }
    writer.flush()?;
    Ok(())
}

pub fn write_accuracy_svg(path: impl Into<PathBuf>, rows: &[Measurement]) -> Result<()> {
    if rows.is_empty() {
        return Ok(());
    }
    let width = 760.0;
    let height = 460.0;
    let left = 70.0;
    let right = 25.0;
    let top = 30.0;
    let bottom = 60.0;
    let max_t = rows.iter().map(|x| x.recurrence).max().unwrap().max(1) as f64;
    let max_accuracy = rows
        .iter()
        .map(|x| x.accuracy)
        .fold(0.1f64, f64::max)
        .max(0.1);
    let x = |t: usize| left + (t as f64 / max_t) * (width - left - right);
    let y = |a: f64| top + (1.0 - a / max_accuracy) * (height - top - bottom);
    let points = rows
        .iter()
        .map(|row| format!("{:.2},{:.2}", x(row.recurrence), y(row.accuracy)))
        .collect::<Vec<_>>()
        .join(" ");
    let mut labels = String::new();
    for row in rows {
        labels.push_str(&format!(r##"<circle cx="{:.2}" cy="{:.2}" r="4" fill="#0b7285"/><text x="{:.2}" y="{:.2}" text-anchor="middle" font-size="12">T={} {:.1}%</text>"##,
            x(row.recurrence), y(row.accuracy), x(row.recurrence), y(row.accuracy) - 10.0,
            row.recurrence, row.accuracy * 100.0));
    }
    let svg = format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="760" height="460" viewBox="0 0 760 460">
<rect width="100%" height="100%" fill="white"/>
<text x="380" y="20" text-anchor="middle" font-family="sans-serif" font-size="16">Accuracy vs recurrence — {}</text>
<line x1="70" y1="400" x2="735" y2="400" stroke="black"/><line x1="70" y1="30" x2="70" y2="400" stroke="black"/>
<text x="400" y="450" text-anchor="middle" font-family="sans-serif">Recurrence T</text>
<text x="18" y="220" text-anchor="middle" transform="rotate(-90 18 220)" font-family="sans-serif">Accuracy</text>
<polyline points="{}" fill="none" stroke="#0b7285" stroke-width="3"/>{}
</svg>"##,
        rows[0].run, points, labels
    );
    fs::write(path.into(), svg)?;
    Ok(())
}

pub fn write_confusable_pairs(path: impl Into<PathBuf>, rows: &[Measurement]) -> Result<()> {
    let pairs = [(3usize, 8usize), (4, 9), (1, 7), (5, 6)];
    let reports: Vec<_> = rows.iter().map(|row| {
        let details: Vec<_> = pairs.iter().map(|&(a, b)| serde_json::json!({
            "pair": format!("{a}/{b}"),
            "a_as_b": row.confusion_matrix[a][b],
            "b_as_a": row.confusion_matrix[b][a],
            "pair_total": row.confusion_matrix[a].iter().sum::<usize>() + row.confusion_matrix[b].iter().sum::<usize>(),
        })).collect();
        serde_json::json!({"recurrence": row.recurrence, "pairs": details})
    }).collect();
    fs::write(path.into(), serde_json::to_vec_pretty(&reports)?)?;
    Ok(())
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct AggregateRow {
    pub recurrence: usize,
    pub runs: usize,
    pub accuracy_mean: f64,
    pub accuracy_stddev: f64,
    pub cross_entropy_mean: f64,
    pub wrong_to_right_probability_mean: f64,
    pub right_to_wrong_probability_mean: f64,
}

pub fn aggregate_evaluations(inputs: &[PathBuf], output: &PathBuf) -> Result<()> {
    let mut runs = Vec::<Vec<Measurement>>::new();
    for path in inputs {
        let rows: Vec<Measurement> = serde_json::from_slice(&fs::read(path)?)?;
        anyhow::ensure!(!rows.is_empty(), "empty evaluation: {}", path.display());
        runs.push(rows);
    }
    let recurrences = runs[0].iter().map(|x| x.recurrence).collect::<Vec<_>>();
    anyhow::ensure!(
        runs.iter().all(|run| run
            .iter()
            .map(|x| x.recurrence)
            .eq(recurrences.iter().copied())),
        "all evaluations must contain the same recurrence sequence"
    );
    let mut summary = Vec::new();
    for (column, &recurrence) in recurrences.iter().enumerate() {
        let values: Vec<&Measurement> = runs.iter().map(|run| &run[column]).collect();
        let mean = |f: fn(&Measurement) -> f64| {
            values.iter().map(|x| f(x)).sum::<f64>() / values.len() as f64
        };
        let accuracy_mean = mean(|x| x.accuracy);
        let variance = values
            .iter()
            .map(|x| (x.accuracy - accuracy_mean).powi(2))
            .sum::<f64>()
            / values.len() as f64;
        summary.push(AggregateRow {
            recurrence,
            runs: values.len(),
            accuracy_mean,
            accuracy_stddev: variance.sqrt(),
            cross_entropy_mean: mean(|x| x.cross_entropy),
            wrong_to_right_probability_mean: mean(|x| x.wrong_to_right_probability),
            right_to_wrong_probability_mean: mean(|x| x.right_to_wrong_probability),
        });
    }
    fs::create_dir_all(output)?;
    fs::write(
        output.join("summary.json"),
        serde_json::to_vec_pretty(&summary)?,
    )?;
    let mut writer = csv::Writer::from_path(output.join("summary.csv"))?;
    for row in &summary {
        writer.serialize(row)?;
    }
    writer.flush()?;
    for row in &summary {
        println!(
            "T={} accuracy={:.4}±{:.4} cross_entropy={:.5}",
            row.recurrence, row.accuracy_mean, row.accuracy_stddev, row.cross_entropy_mean
        );
    }
    Ok(())
}
