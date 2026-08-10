use anyhow::Result;
use cintamani_kerr_capacity::{config::Config, experiment, report};
use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Debug, Parser)]
#[command(name = "cintamani-kerr-capacity")]
#[command(about = "Normalized Kerr dynamics and observable-capacity characterization")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Run {
        config: PathBuf,
        #[arg(long)]
        output: PathBuf,
    },
    CrossCheck {
        config: PathBuf,
        #[arg(long, default_value_t = 1.0e-9)]
        tolerance: f64,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    match cli.command {
        Command::Run { config, output } => {
            let config = Config::load(config)?;
            let result = experiment::run(&config)?;
            report::write_all(&output, &config, &result)?;
            println!(
                "corrected capacity {:.6} / effective rank {} (decision: {})",
                result.summary.total_corrected_capacity,
                result.summary.effective_observation_rank,
                result.summary.decision
            );
        }
        Command::CrossCheck { config, tolerance } => {
            let config = Config::load(config)?;
            let error = experiment::cross_check(&config)?;
            println!("maximum direct/pseudospectral RHS error: {error:.6e}");
            if error > tolerance {
                anyhow::bail!("cross-check error {error:.6e} exceeds tolerance {tolerance:.6e}");
            }
        }
    }
    Ok(())
}
