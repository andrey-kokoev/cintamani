use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Backend {
    DirectModal,
    Pseudospectral,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Observation {
    Intensity,
    Quadrature,
    Both,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub seed: u64,
    pub modes: usize,
    pub backend: Backend,
    pub dt: f64,
    pub steps_per_symbol: usize,
    pub warmup_symbols: usize,
    pub sample_symbols: usize,
    pub intrinsic_loss: f64,
    pub external_coupling: f64,
    pub detuning: f64,
    pub dispersion: f64,
    pub kerr_strength: f64,
    pub pump_amplitude: f64,
    pub input_scale: f64,
    pub input_mode: isize,
    pub noise_std: f64,
    pub thermal_coupling: f64,
    pub thermal_decay: f64,
    pub raman_fraction: f64,
    pub observation: Observation,
    pub max_degree: usize,
    pub max_lag: usize,
    pub train_fraction: f64,
    pub ridge: f64,
    pub null_trials: usize,
    pub null_quantile: f64,
    pub save_samples: bool,
}

impl Config {
    pub fn load(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        let text = std::fs::read_to_string(path)
            .with_context(|| format!("failed to read config {}", path.display()))?;
        let config: Self = toml::from_str(&text)
            .with_context(|| format!("failed to parse config {}", path.display()))?;
        config.validate()?;
        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        if self.modes < 3 || self.modes.is_multiple_of(2) {
            bail!("modes must be an odd integer of at least 3");
        }
        if self.modes > 63 {
            bail!("modes above 63 require an FFT implementation");
        }
        if !self.dt.is_finite() || self.dt <= 0.0 {
            bail!("dt must be finite and positive");
        }
        if self.steps_per_symbol == 0 {
            bail!("steps_per_symbol must be positive");
        }
        if self.sample_symbols <= self.max_lag + 32 {
            bail!("sample_symbols must exceed max_lag by at least 33");
        }
        for (name, value) in [
            ("intrinsic_loss", self.intrinsic_loss),
            ("external_coupling", self.external_coupling),
            ("noise_std", self.noise_std),
            ("thermal_coupling", self.thermal_coupling),
            ("thermal_decay", self.thermal_decay),
        ] {
            if !value.is_finite() || value < 0.0 {
                bail!("{name} must be finite and non-negative");
            }
        }
        for (name, value) in [
            ("detuning", self.detuning),
            ("dispersion", self.dispersion),
            ("kerr_strength", self.kerr_strength),
            ("pump_amplitude", self.pump_amplitude),
            ("input_scale", self.input_scale),
        ] {
            if !value.is_finite() {
                bail!("{name} must be finite");
            }
        }
        let half = (self.modes / 2) as isize;
        if !(-half..=half).contains(&self.input_mode) {
            bail!("input_mode must lie inside the declared mode window");
        }
        if self.raman_fraction != 0.0 {
            bail!(
                "raman_fraction must be zero until a material-specific Raman response kernel is implemented"
            );
        }
        if self.max_degree == 0 || self.max_degree > 8 {
            bail!("max_degree must be between 1 and 8");
        }
        if self.max_lag > 32 {
            bail!("max_lag above 32 is outside the first characterization scope");
        }
        if !(0.5..0.9).contains(&self.train_fraction) {
            bail!("train_fraction must be in [0.5, 0.9)");
        }
        if !self.ridge.is_finite() || self.ridge <= 0.0 {
            bail!("ridge must be finite and positive");
        }
        if self.null_trials == 0 {
            bail!("null_trials must be positive");
        }
        if !(0.5..=1.0).contains(&self.null_quantile) {
            bail!("null_quantile must be in [0.5, 1.0]");
        }
        Ok(())
    }

    pub fn observation_dimension(&self) -> usize {
        match self.observation {
            Observation::Intensity => self.modes,
            Observation::Quadrature => self.modes * 2,
            Observation::Both => self.modes * 3,
        }
    }

    pub fn total_loss(&self) -> f64 {
        self.intrinsic_loss + self.external_coupling
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid() -> Config {
        Config {
            seed: 1,
            modes: 5,
            backend: Backend::DirectModal,
            dt: 0.01,
            steps_per_symbol: 2,
            warmup_symbols: 4,
            sample_symbols: 100,
            intrinsic_loss: 0.5,
            external_coupling: 0.5,
            detuning: 0.0,
            dispersion: 0.0,
            kerr_strength: 0.1,
            pump_amplitude: 1.0,
            input_scale: 0.1,
            input_mode: 0,
            noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.0,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 2,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 2,
            null_quantile: 0.95,
            save_samples: false,
        }
    }

    #[test]
    fn validates_scope_and_raman_boundary() {
        valid().validate().unwrap();
        let mut config = valid();
        config.raman_fraction = 0.1;
        assert!(config.validate().is_err());
    }

    #[test]
    fn observation_dimension_counts_real_features() {
        let mut config = valid();
        assert_eq!(config.observation_dimension(), 5);
        config.observation = Observation::Quadrature;
        assert_eq!(config.observation_dimension(), 10);
        config.observation = Observation::Both;
        assert_eq!(config.observation_dimension(), 15);
    }
}
