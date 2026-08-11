use anyhow::Result;
use cintamani_domain::{RegistryPaths, handle_mcp_request};
use clap::Parser;
use serde_json::Value;
use std::{
    io::{self, BufRead, Write},
    path::PathBuf,
};

#[derive(Parser)]
#[command(
    name = "cintamani-domain-mcp",
    about = "Site-local stdio MCP for the governed Cintamani registry"
)]
struct Args {
    #[arg(long)]
    workspace_root: Option<PathBuf>,
    #[arg(long)]
    database: Option<PathBuf>,
    #[arg(long)]
    chain: Option<PathBuf>,
}

fn main() -> Result<()> {
    let args = Args::parse();
    let current = std::env::current_dir()?;
    let workspace = args
        .workspace_root
        .unwrap_or(RegistryPaths::discover(&current)?.workspace_root);
    let mut paths = RegistryPaths::for_workspace(&workspace);
    if let Some(database) = args.database {
        paths = paths.with_database(if database.is_absolute() {
            database
        } else {
            workspace.join(database)
        })
    }
    if let Some(chain) = args.chain {
        paths = paths.with_chain(if chain.is_absolute() {
            chain
        } else {
            workspace.join(chain)
        })
    }
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(error) => {
                let response = serde_json::json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":error.to_string()}});
                writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
                stdout.flush()?;
                continue;
            }
        };
        if let Some(response) = handle_mcp_request(&paths, &request) {
            writeln!(stdout, "{}", serde_json::to_string(&response)?)?;
            stdout.flush()?;
        }
    }
    Ok(())
}
