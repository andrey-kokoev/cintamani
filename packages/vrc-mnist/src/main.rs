#![recursion_limit = "256"]

use std::path::PathBuf;

use anyhow::Result;
use burn::backend::wgpu::WgpuDevice;
use burn::backend::{Autodiff, Wgpu};
use cintamani::brief3;
use cintamani::entropy;
use cintamani::experiment::{config::ExperimentConfig, runner};
use cintamani::output::results::aggregate_evaluations;
use clap::{Parser, Subcommand};

type InferenceBackend = Wgpu<f32, i32>;
type TrainingBackend = Autodiff<InferenceBackend>;

#[derive(Parser)]
#[command(version, about = "Recurrent volumetric photonic MNIST experiment")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    GpuInfo,
    /// Characterize a recurrent substrate without running an ML task.
    Entropy {
        config: PathBuf,
    },
    /// Calibrate estimators and search residual recurrent operating regimes.
    EntropyCalibrate {
        config: PathBuf,
    },
    Brief3Eval {
        config: PathBuf,
        #[arg(default_value = "artifacts")]
        checkpoints: PathBuf,
    },
    Brief3Report {
        #[arg(default_value = "artifacts")]
        artifacts: PathBuf,
        #[arg(default_value = "output")]
        output: PathBuf,
    },
    TrainUnshared {
        config: PathBuf,
        #[arg(long, default_value_t = 8)]
        steps: usize,
        #[arg(long)]
        seed: Option<u64>,
    },
    EvalUnshared {
        checkpoint: PathBuf,
        config: PathBuf,
        #[arg(long, default_value_t = 8)]
        steps: usize,
        #[arg(long)]
        seed: Option<u64>,
    },
    Train {
        config: PathBuf,
        #[arg(long)]
        seed: Option<u64>,
        #[arg(long)]
        resume: Option<PathBuf>,
        #[arg(long, default_value_t = 0)]
        start_epoch: usize,
    },
    TrainFeedForward {
        config: PathBuf,
        #[arg(long, default_value_t = 4)]
        stages: usize,
        #[arg(long)]
        seed: Option<u64>,
    },
    Eval {
        checkpoint: PathBuf,
        #[arg(long, value_delimiter = ',', default_value = "1,2,3,4,8,16,32")]
        recurrences: Vec<usize>,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long)]
        seed: Option<u64>,
    },
    EvalFeedForward {
        checkpoint: PathBuf,
        #[arg(long)]
        config: Option<PathBuf>,
        #[arg(long, default_value_t = 4)]
        stages: usize,
        #[arg(long)]
        seed: Option<u64>,
    },
    Smoke {
        #[arg(default_value = "configs/clean.toml")]
        config: PathBuf,
    },
    Aggregate {
        #[arg(required = true)]
        inputs: Vec<PathBuf>,
        #[arg(long, default_value = "artifacts/aggregate")]
        output: PathBuf,
    },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let device = WgpuDevice::default();
    match cli.command {
        Command::Entropy { config } => entropy::run(config),
        Command::EntropyCalibrate { config } => entropy::calibrate(config),
        Command::Brief3Eval {
            config,
            checkpoints,
        } => brief3::evaluate_suite::<InferenceBackend>(config, checkpoints, &device),
        Command::Brief3Report { artifacts, output } => brief3::report(artifacts, output),
        Command::TrainUnshared {
            config,
            steps,
            seed,
        } => {
            let mut cfg = ExperimentConfig::load(config)?;
            apply_seed(&mut cfg, seed);
            runner::train_unshared::<TrainingBackend>(&cfg, steps, &device)
        }
        Command::EvalUnshared {
            checkpoint,
            config,
            steps,
            seed,
        } => {
            let mut cfg = ExperimentConfig::load(config)?;
            apply_seed(&mut cfg, seed);
            runner::evaluate_unshared::<InferenceBackend>(&cfg, &checkpoint, steps, &device)
        }
        Command::GpuInfo => runner::gpu_info::<InferenceBackend>(&device),
        Command::Aggregate { inputs, output } => aggregate_evaluations(&inputs, &output),
        Command::Smoke { config } => {
            let cfg = ExperimentConfig::load(config)?;
            runner::smoke::<InferenceBackend>(&cfg, &device)
        }
        Command::Train {
            config,
            seed,
            resume,
            start_epoch,
        } => {
            let mut cfg = ExperimentConfig::load(config)?;
            apply_seed(&mut cfg, seed);
            runner::train::<TrainingBackend>(&cfg, resume.as_deref(), start_epoch, &device)
        }
        Command::TrainFeedForward {
            config,
            stages,
            seed,
        } => {
            let mut cfg = ExperimentConfig::load(config)?;
            apply_seed(&mut cfg, seed);
            runner::train_feed_forward::<TrainingBackend>(&cfg, stages, &device)
        }
        Command::Eval {
            checkpoint,
            recurrences,
            config,
            seed,
        } => {
            let mut cfg = ExperimentConfig::load(
                config.unwrap_or_else(|| PathBuf::from("configs/clean.toml")),
            )?;
            apply_seed(&mut cfg, seed);
            runner::evaluate::<InferenceBackend>(&cfg, &checkpoint, &recurrences, &device)
        }
        Command::EvalFeedForward {
            checkpoint,
            config,
            stages,
            seed,
        } => {
            let mut cfg = ExperimentConfig::load(
                config.unwrap_or_else(|| PathBuf::from("configs/clean.toml")),
            )?;
            apply_seed(&mut cfg, seed);
            runner::evaluate_feed_forward::<InferenceBackend>(&cfg, &checkpoint, stages, &device)
        }
    }
}

fn apply_seed(cfg: &mut ExperimentConfig, seed: Option<u64>) {
    if let Some(seed) = seed {
        cfg.seed = seed;
        cfg.name = format!("{}_seed_{}", cfg.name, seed);
    }
}
