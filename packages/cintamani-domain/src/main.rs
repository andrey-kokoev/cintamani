use anyhow::{Result, bail};
use cintamani_domain::{
    PROJECTION_KIND, QueryKind, RegistryPaths, SCHEMA_VERSION, bounded_query, inspect, rebuild,
};
use clap::{Parser, Subcommand, ValueEnum};
use std::path::{Path, PathBuf};

#[derive(Debug, Parser)]
#[command(
    name = "cintamani-domain",
    about = "Rebuild and inspect the Site-owned Cintamani categorical siege registry"
)]
struct Cli {
    #[arg(long, global = true, value_name = "PATH")]
    workspace_root: Option<PathBuf>,
    #[arg(long, global = true, value_name = "PATH")]
    database: Option<PathBuf>,
    #[arg(long, global = true, value_name = "PATH")]
    records: Option<PathBuf>,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Create or transactionally rebuild the projection from immutable admission records.
    Init,
    /// Transactionally rebuild the projection from immutable admission records.
    Rebuild,
    /// Check schema identity, SQLite integrity, provenance, and artifact posture.
    Check,
    /// List a bounded, deterministic registry view as JSON.
    List {
        #[arg(value_enum, default_value_t = ListKind::All)]
        kind: ListKind,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
}

#[derive(Clone, Copy, Debug, Default, ValueEnum)]
enum ListKind {
    Cells,
    Conjectures,
    Runs,
    Artifacts,
    Gates,
    Comparisons,
    Links,
    #[default]
    All,
}

impl From<ListKind> for QueryKind {
    fn from(value: ListKind) -> Self {
        match value {
            ListKind::Cells => Self::Cells,
            ListKind::Conjectures => Self::Conjectures,
            ListKind::Runs => Self::Runs,
            ListKind::Artifacts => Self::Artifacts,
            ListKind::Gates => Self::Gates,
            ListKind::Comparisons => Self::Comparisons,
            ListKind::Links => Self::Links,
            ListKind::All => Self::All,
        }
    }
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let paths = resolve_paths(&cli)?;
    match cli.command {
        Command::Init | Command::Rebuild => {
            println!("{}", serde_json::to_string_pretty(&rebuild(&paths)?)?);
        }
        Command::Check => {
            let report = inspect(&paths)?;
            println!("{}", serde_json::to_string_pretty(&report)?);
            if report.schema_version != SCHEMA_VERSION
                || report.projection_kind != PROJECTION_KIND
                || report.integrity != "ok"
                || report.foreign_key_violations != 0
                || !report.admission_records_consistent
                || report.ledger_source_mismatches != 0
                || report.protocol_config_mismatches != 0
                || report.mismatched_artifacts != 0
            {
                bail!("registry check failed");
            }
        }
        Command::List { kind, limit } => {
            let rows = bounded_query(&paths.database_path, kind.into(), limit)?;
            println!("{}", serde_json::to_string_pretty(&rows)?);
        }
    }
    Ok(())
}

fn resolve_paths(cli: &Cli) -> Result<RegistryPaths> {
    let current = std::env::current_dir()?;
    let workspace = match &cli.workspace_root {
        Some(path) => absolute_from(&current, path),
        None => RegistryPaths::discover(&current)?.workspace_root,
    };
    let mut paths = RegistryPaths::for_workspace(&workspace);
    if let Some(database) = &cli.database {
        paths = paths.with_database(absolute_from(&workspace, database));
    }
    if let Some(records) = &cli.records {
        paths = paths.with_records(absolute_from(&workspace, records));
    }
    Ok(paths)
}

fn absolute_from(base: &Path, path: &Path) -> PathBuf {
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        base.join(path)
    }
}
