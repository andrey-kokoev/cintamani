use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

fn default_states() -> u64 {
    256
}
fn default_reliability() -> f64 {
    0.98
}
fn default_probes() -> usize {
    16
}
fn default_epsilon() -> f64 {
    1e-5
}
fn default_output() -> String {
    "output".into()
}
fn default_recurrences() -> Vec<usize> {
    vec![1, 2, 4, 8, 16, 32]
}
fn default_jvp_tolerance() -> f64 {
    1e-5
}
fn default_singular_threshold() -> f64 {
    1e-6
}
fn default_cycle_tolerance() -> f64 {
    1e-6
}
fn default_operator() -> OperatorKind {
    OperatorKind::Volume
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum OperatorKind {
    Identity,
    Contraction,
    Expansion,
    Unitary,
    LowRank,
    Period2,
    Period4,
    NoisyIdentity,
    Residual,
    #[default]
    Volume,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct EntropyConfig {
    pub name: String,
    pub seed: u64,
    pub width: usize,
    pub height: usize,
    pub depth: usize,
    pub kernel_size: usize,
    pub alpha: f64,
    pub transmission: f64,
    pub q_injection: f64,
    pub nonlinear: bool,
    #[serde(default = "default_operator")]
    pub operator: OperatorKind,
    pub scalar: Option<f64>,
    pub rank: Option<usize>,
    pub noise: Option<f64>,
    pub residual_gamma: Option<f64>,
    pub coupling_scale: Option<f64>,
    pub connectivity_radius: Option<usize>,
    #[serde(default = "default_states")]
    pub parameter_states: u64,
    #[serde(default = "default_reliability")]
    pub configuration_reliability: f64,
    #[serde(default = "default_probes")]
    pub probes: usize,
    #[serde(default = "default_epsilon")]
    pub perturbation: f64,
    #[serde(default = "default_jvp_tolerance")]
    pub jvp_tolerance: f64,
    #[serde(default = "default_singular_threshold")]
    pub singular_threshold: f64,
    #[serde(default = "default_cycle_tolerance")]
    pub cycle_tolerance: f64,
    #[serde(default = "default_recurrences")]
    pub recurrences: Vec<usize>,
    #[serde(default = "default_output")]
    pub output_dir: String,
    pub volume_m3: Option<f64>,
    pub refractive_index: Option<f64>,
    pub wavelength_m: Option<f64>,
    pub fractional_bandwidth: Option<f64>,
    pub snr: Option<f64>,
}

impl EntropyConfig {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let text = fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        let cfg: Self =
            toml::from_str(&text).with_context(|| format!("parse {}", path.display()))?;
        cfg.validate()?;
        Ok(cfg)
    }
    pub fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            self.width > 0 && self.height > 0 && self.depth > 0,
            "volume dimensions must be positive"
        );
        anyhow::ensure!(
            self.jvp_tolerance > 0.0 && self.singular_threshold > 0.0 && self.cycle_tolerance > 0.0,
            "estimator tolerances must be positive"
        );
        anyhow::ensure!(
            self.kernel_size > 0 && self.kernel_size % 2 == 1,
            "kernel_size must be positive and odd"
        );
        anyhow::ensure!(
            self.parameter_states > 1,
            "parameter_states must exceed one"
        );
        anyhow::ensure!(
            (0.0..=1.0).contains(&self.configuration_reliability),
            "configuration_reliability must be in [0,1]"
        );
        anyhow::ensure!(
            self.probes > 1 && self.perturbation > 0.0,
            "at least two probes and positive perturbation required"
        );
        anyhow::ensure!(
            !self.recurrences.is_empty() && self.recurrences.iter().all(|x| *x > 0),
            "recurrences must be positive"
        );
        Ok(())
    }
    pub fn parameter_count(&self) -> usize {
        self.depth * 4 * self.kernel_size * self.kernel_size
    }
    pub fn state_dimension(&self) -> usize {
        self.width * self.height * 2
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct ConfigurationCapacity {
    pub parameter_count: usize,
    pub states_per_parameter: u64,
    pub raw_bits: f64,
    pub effective_bits: f64,
    pub reliability_assumption: f64,
}

pub fn capacity(cfg: &EntropyConfig) -> ConfigurationCapacity {
    let raw = cfg.parameter_count() as f64 * (cfg.parameter_states as f64).log2();
    ConfigurationCapacity {
        parameter_count: cfg.parameter_count(),
        states_per_parameter: cfg.parameter_states,
        raw_bits: raw,
        effective_bits: raw * cfg.configuration_reliability,
        reliability_assumption: cfg.configuration_reliability,
    }
}
