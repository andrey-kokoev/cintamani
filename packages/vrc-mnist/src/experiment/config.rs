use crate::data::corruption::Corruption;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ExperimentConfig {
    pub name: String,
    pub seed: u64,
    pub output_dir: String,
    pub depth: usize,
    pub kernel_size: usize,
    pub alpha: f32,
    pub transmission: f32,
    pub q_injection: f32,
    pub nonlinear: bool,
    #[serde(default = "one")]
    pub residual_gamma: f32,
    #[serde(default = "one")]
    pub coupling_scale: f32,
    pub train_recurrences: Vec<usize>,
    pub eval_recurrences: Vec<usize>,
    pub epochs: usize,
    pub batch_size: usize,
    pub max_train_samples: Option<usize>,
    pub max_eval_samples: Option<usize>,
    pub learning_rate: f64,
    pub intermediate_loss_weight: f32,
    pub corruption: Corruption,
    pub held_out_corruption: Option<Corruption>,
}
fn one() -> f32 {
    1.0
}

impl ExperimentConfig {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let cfg: Self =
            toml::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
        cfg.validate()?;
        Ok(cfg)
    }
    pub fn validate(&self) -> Result<()> {
        anyhow::ensure!(self.depth > 0, "depth must be positive");
        anyhow::ensure!(self.kernel_size % 2 == 1, "kernel_size must be odd");
        anyhow::ensure!(
            (0.0..=1.0).contains(&self.residual_gamma),
            "residual_gamma must be in [0,1]"
        );
        anyhow::ensure!(self.coupling_scale > 0.0, "coupling_scale must be positive");
        anyhow::ensure!(
            !self.train_recurrences.is_empty(),
            "variable training recurrence set is empty"
        );
        anyhow::ensure!(
            self.train_recurrences.iter().all(|t| *t > 0),
            "recurrences must be positive"
        );
        anyhow::ensure!(
            self.eval_recurrences.iter().all(|t| *t > 0),
            "recurrences must be positive"
        );
        anyhow::ensure!(
            self.max_train_samples.unwrap_or(1) > 0,
            "max_train_samples must be positive"
        );
        anyhow::ensure!(
            self.max_eval_samples.unwrap_or(1) > 0,
            "max_eval_samples must be positive"
        );
        Ok(())
    }
}
