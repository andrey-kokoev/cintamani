use anyhow::Result;
use cintamani_kerr_capacity::{config::Config, controls, database, experiment, report};
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
    Controls {
        config: PathBuf,
        #[arg(long)]
        output: PathBuf,
        #[arg(long, default_value_t = 3)]
        seed_count: usize,
        #[arg(long, value_delimiter = ',', default_value = "0.6,0.7,0.8")]
        train_fractions: Vec<f64>,
    },
    DbCheck {
        database: PathBuf,
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
        Command::Controls {
            config,
            output,
            seed_count,
            train_fractions,
        } => {
            let config = Config::load(config)?;
            let suite = controls::run(&config, seed_count, &train_fractions)?;
            report::write_attribution_suite(&output, &config, &suite)?;
            for case in &suite.cases {
                let summary = case.summary();
                println!(
                    "{}: corrected {:.6}, rank {}, historical {:.6}",
                    summary.name,
                    summary.total_corrected_capacity,
                    summary.effective_observation_rank,
                    summary.historical_input_corrected_capacity,
                );
            }
        }
        Command::DbCheck { database: path } => {
            let inspection = database::inspect(path)?;
            println!("{}", serde_json::to_string_pretty(&inspection)?);
            if inspection.integrity != "ok" || inspection.foreign_key_violations != 0 {
                anyhow::bail!("SQLite integrity or foreign-key check failed");
            }
        }
    }
    Ok(())
}
