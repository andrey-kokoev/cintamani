use anyhow::{Result, bail};
use cintamani_domain::{
    AdmissionAuthority, AdmissionV2, Collection, FrontierFilters, QueryFilters, RegistryPaths,
    dimensions, entity_history, entity_show, frontier, inspect, list_page, preview_admission,
    promote_admission, rebuild, validate_admission, why,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    str::FromStr,
};

#[derive(Debug, Parser)]
#[command(
    name = "cintamani-domain",
    about = "Govern and query the Cintamani categorical search registry"
)]
struct Cli {
    #[arg(long, global = true, value_name = "PATH")]
    workspace_root: Option<PathBuf>,
    #[arg(long, global = true, value_name = "PATH")]
    database: Option<PathBuf>,
    #[arg(long, global = true, value_name = "PATH")]
    chain: Option<PathBuf>,
    #[arg(long, global = true, value_enum, default_value_t = OutputFormat::Human)]
    format: OutputFormat,
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Init,
    Rebuild,
    Check,
    List {
        collection: String,
        #[command(flatten)]
        filters: FilterArgs,
        #[arg(long)]
        cursor: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    Show {
        collection: String,
        id: String,
    },
    History {
        collection: String,
        id: String,
        #[arg(long)]
        cursor: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    Why {
        collection: String,
        id: String,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    Dimensions,
    Frontier {
        #[arg(long)]
        model: Vec<String>,
        #[arg(long)]
        material: Vec<String>,
        #[arg(long)]
        mechanism: Vec<String>,
        #[arg(long)]
        interface: Vec<String>,
        #[arg(long)]
        cursor: Option<String>,
        #[arg(long, default_value_t = 50)]
        limit: usize,
    },
    Admission {
        #[command(subcommand)]
        command: AdmissionCommand,
    },
}

#[derive(Debug, Args)]
struct FilterArgs {
    #[arg(long)]
    model: Option<String>,
    #[arg(long)]
    material: Option<String>,
    #[arg(long)]
    mechanism: Option<String>,
    #[arg(long)]
    interface: Option<String>,
    #[arg(long)]
    status: Option<String>,
    #[arg(long)]
    admission: Option<String>,
    #[arg(long)]
    ledger: Option<u32>,
    #[arg(long)]
    text: Option<String>,
    #[arg(long)]
    locus: Option<String>,
    #[arg(long)]
    origin: Option<String>,
    #[arg(long)]
    coordinate: Option<String>,
}

impl From<FilterArgs> for QueryFilters {
    fn from(value: FilterArgs) -> Self {
        Self {
            model_id: value.model,
            material_id: value.material,
            mechanism_id: value.mechanism,
            interface_id: value.interface,
            status: value.status,
            source_admission_id: value.admission,
            ledger_number: value.ledger,
            text: value.text,
            locus: value.locus,
            origin: value.origin,
            coordinate: value.coordinate,
        }
    }
}

#[derive(Debug, Subcommand)]
enum AdmissionCommand {
    New {
        output: PathBuf,
        #[arg(long)]
        record_id: String,
        #[arg(long)]
        admitted_at: String,
        #[arg(long)]
        description: String,
    },
    Validate {
        draft: PathBuf,
    },
    Preview {
        draft: PathBuf,
        #[command(flatten)]
        authority: AuthorityArgs,
    },
    Promote {
        draft: PathBuf,
        #[command(flatten)]
        authority: AuthorityArgs,
    },
}

#[derive(Debug, Args)]
struct AuthorityArgs {
    #[arg(long)]
    admitted_by: String,
    #[arg(long)]
    authority_kind: String,
    #[arg(long)]
    authority_ref: String,
    #[arg(long)]
    expected_head: String,
}

impl AuthorityArgs {
    fn borrowed(&self) -> AdmissionAuthority<'_> {
        AdmissionAuthority {
            admitted_by: &self.admitted_by,
            authority_kind: &self.authority_kind,
            authority_ref: &self.authority_ref,
            expected_head: &self.expected_head,
        }
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum OutputFormat {
    Human,
    Json,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let paths = resolve_paths(&cli)?;
    let value = match cli.command {
        Command::Init | Command::Rebuild => serde_json::to_value(rebuild(&paths)?)?,
        Command::Check => {
            let report = inspect(&paths)?;
            let passes = report.passes();
            let value = serde_json::to_value(&report)?;
            emit(&value, cli.format)?;
            if !passes {
                bail!("registry check failed");
            }
            return Ok(());
        }
        Command::List {
            collection,
            filters,
            cursor,
            limit,
        } => serde_json::to_value(list_page(
            &paths.database_path,
            parse_collection(&collection)?,
            &filters.into(),
            cursor.as_deref(),
            limit,
        )?)?,
        Command::Show { collection, id } => {
            entity_show(&paths.database_path, parse_collection(&collection)?, &id)?
        }
        Command::History {
            collection,
            id,
            cursor,
            limit,
        } => serde_json::to_value(entity_history(
            &paths.database_path,
            parse_collection(&collection)?,
            &id,
            cursor.as_deref(),
            limit,
        )?)?,
        Command::Why {
            collection,
            id,
            limit,
        } => why(
            &paths.database_path,
            parse_collection(&collection)?,
            &id,
            limit,
        )?,
        Command::Dimensions => serde_json::to_value(dimensions(&paths.database_path)?)?,
        Command::Frontier {
            model,
            material,
            mechanism,
            interface,
            cursor,
            limit,
        } => serde_json::to_value(frontier(
            &paths.database_path,
            &FrontierFilters {
                model_ids: model,
                material_ids: material,
                mechanism_ids: mechanism,
                interface_ids: interface,
            },
            cursor.as_deref(),
            limit,
        )?)?,
        Command::Admission { command } => match command {
            AdmissionCommand::New {
                output,
                record_id,
                admitted_at,
                description,
            } => {
                let record = AdmissionV2 {
                    record_id,
                    schema_version: 2,
                    admitted_at,
                    description,
                    changes: Vec::new(),
                };
                let absolute = absolute_from(&paths.workspace_root, &output);
                // New creates an intentionally incomplete typed draft; validate/preview enforce nonempty changes.
                write_new_draft(&absolute, &record)?;
                json!({"draft":absolute.display().to_string(),"schema_version":2,"ready_for_validation":false})
            }
            AdmissionCommand::Validate { draft } => serde_json::to_value(validate_admission(
                &absolute_from(&paths.workspace_root, &draft),
            )?)?,
            AdmissionCommand::Preview { draft, authority } => {
                serde_json::to_value(preview_admission(
                    &paths,
                    &absolute_from(&paths.workspace_root, &draft),
                    &authority.borrowed(),
                )?)?
            }
            AdmissionCommand::Promote { draft, authority } => {
                serde_json::to_value(promote_admission(
                    &paths,
                    &absolute_from(&paths.workspace_root, &draft),
                    &authority.borrowed(),
                )?)?
            }
        },
    };
    emit(&value, cli.format)
}

fn parse_collection(value: &str) -> Result<Collection> {
    Collection::from_str(value)
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
    if let Some(chain) = &cli.chain {
        paths = paths.with_chain(absolute_from(&workspace, chain));
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

fn emit(value: &Value, format: OutputFormat) -> Result<()> {
    match format {
        OutputFormat::Json => println!("{}", serde_json::to_string_pretty(value)?),
        OutputFormat::Human => print_human(value),
    }
    Ok(())
}

fn print_human(value: &Value) {
    if let Some(items) = value.get("items").and_then(Value::as_array) {
        println!(
            "{}: {} row(s)",
            value
                .get("collection")
                .and_then(Value::as_str)
                .unwrap_or("result"),
            items.len()
        );
        for item in items {
            println!(
                "- {}",
                serde_json::to_string(item).unwrap_or_else(|_| "<invalid>".to_owned())
            );
        }
        if let Some(cursor) = value.get("next_cursor").and_then(Value::as_str) {
            println!("next_cursor: {cursor}");
        }
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
        );
    }
}

fn write_new_draft(path: &Path, record: &AdmissionV2) -> Result<()> {
    // Reuse the governed serializer after temporarily supplying one typed no-op is intentionally forbidden,
    // so draft-new writes the incomplete skeleton directly and never claims validation.
    if path.exists() {
        bail!("refusing to overwrite existing draft {}", path.display());
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut bytes = serde_json::to_vec_pretty(record)?;
    bytes.push(b'\n');
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    Ok(())
}
