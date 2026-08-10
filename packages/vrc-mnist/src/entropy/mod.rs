//! Matrix-free information-capacity and recurrent-dynamics characterization.

pub mod calibration;
pub mod configuration;
pub mod dynamics;
pub mod modes;
pub mod perturbation;
pub mod report;
pub mod singular;

use anyhow::Result;
use configuration::EntropyConfig;
use std::path::Path;

pub fn run(path: impl AsRef<Path>) -> Result<()> {
    let cfg = EntropyConfig::load(path)?;
    let operator = modes::operator_from_config(&cfg);
    let analysis = report::characterize(&cfg, operator.as_ref())?;
    report::write_all(&cfg, &analysis)?;
    println!("{}", report::human_report(&analysis));
    Ok(())
}

pub fn calibrate(path: impl AsRef<Path>) -> Result<()> {
    calibration::run(path)
}
