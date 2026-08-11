mod records;

use anyhow::{Context, Result, bail};
use records::AdmissionRecord;
use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    path::{Component, Path, PathBuf},
};

pub const SCHEMA_VERSION: &str = "1";
pub const PROJECTION_KIND: &str = "rebuildable-site-domain-registry";
const MIGRATION_V1: &str = include_str!("../migrations/001_v1.sql");
const DEFAULT_DATABASE: &str = ".narada/db/cintamani-domain.sqlite";
const DEFAULT_RECORDS: &str = ".narada/kb/cintamani-domain/admissions";

const DOMAIN_TABLES: &[&str] = &[
    "admissions",
    "theoretical_models",
    "materials",
    "physical_mechanisms",
    "interfaces",
    "typed_morphisms",
    "siege_cells",
    "siege_cell_decisions",
    "parameter_definitions",
    "parameter_regions",
    "parameter_region_values",
    "conjectures",
    "conjecture_dispositions",
    "falsification_criteria",
    "protocols",
    "runs",
    "evidence_artifacts",
    "gate_results",
    "comparisons",
    "ledger_links",
];

#[derive(Clone, Debug)]
pub struct RegistryPaths {
    pub workspace_root: PathBuf,
    pub database_path: PathBuf,
    pub records_dir: PathBuf,
}

impl RegistryPaths {
    pub fn discover(start: impl AsRef<Path>) -> Result<Self> {
        let workspace_root = discover_workspace_root(start.as_ref())?;
        Ok(Self::for_workspace(workspace_root))
    }

    pub fn for_workspace(workspace_root: impl Into<PathBuf>) -> Self {
        let workspace_root = workspace_root.into();
        Self {
            database_path: workspace_root.join(DEFAULT_DATABASE),
            records_dir: workspace_root.join(DEFAULT_RECORDS),
            workspace_root,
        }
    }

    pub fn with_database(mut self, database_path: impl Into<PathBuf>) -> Self {
        self.database_path = database_path.into();
        self
    }

    pub fn with_records(mut self, records_dir: impl Into<PathBuf>) -> Self {
        self.records_dir = records_dir.into();
        self
    }
}

#[derive(Debug, Serialize)]
pub struct RebuildReport {
    pub schema_version: String,
    pub database_path: String,
    pub records_dir: String,
    pub admission_records: usize,
    pub relation_counts: BTreeMap<String, usize>,
    pub missing_artifacts: usize,
    pub mismatched_artifacts: usize,
}

#[derive(Debug, Serialize)]
pub struct IntegrityReport {
    pub schema_version: String,
    pub projection_kind: String,
    pub integrity: String,
    pub foreign_key_violations: usize,
    pub relation_counts: BTreeMap<String, usize>,
    pub admission_records_consistent: bool,
    pub admission_record_mismatches: Vec<String>,
    pub ledger_source_mismatches: usize,
    pub ledger_source_mismatch_details: Vec<String>,
    pub protocol_config_mismatches: usize,
    pub protocol_config_mismatch_details: Vec<String>,
    pub missing_artifacts: usize,
    pub mismatched_artifacts: usize,
    pub artifact_observation_drift: usize,
}

#[derive(Clone, Copy, Debug)]
pub enum QueryKind {
    Cells,
    Conjectures,
    Runs,
    Artifacts,
    Gates,
    Comparisons,
    Links,
    All,
}

pub fn discover_workspace_root(start: &Path) -> Result<PathBuf> {
    let mut current = if start.is_file() {
        start.parent().unwrap_or(start).to_path_buf()
    } else {
        start.to_path_buf()
    };
    if current.is_relative() {
        current = std::env::current_dir()?.join(current);
    }
    loop {
        if current.join(".narada/AGENTS.md").is_file() {
            return Ok(current);
        }
        if !current.pop() {
            bail!("could not find a Cintamani workspace containing .narada/AGENTS.md");
        }
    }
}

pub fn rebuild(paths: &RegistryPaths) -> Result<RebuildReport> {
    if !paths.records_dir.is_dir() {
        bail!(
            "admission-record directory does not exist: {}",
            paths.records_dir.display()
        );
    }
    if let Some(parent) = paths.database_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create database directory {}", parent.display()))?;
    }

    let existing_nonempty = fs::metadata(&paths.database_path)
        .map(|metadata| metadata.len() > 0)
        .unwrap_or(false);
    let mut connection = Connection::open(&paths.database_path)
        .with_context(|| format!("failed to open {}", paths.database_path.display()))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    reject_foreign_projection(&connection, existing_nonempty)?;
    connection.pragma_update(None, "journal_mode", "DELETE")?;

    let record_paths = admission_record_paths(&paths.records_dir)?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(MIGRATION_V1)?;
    clear_projection(&transaction)?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('schema_version', ?1)",
        [SCHEMA_VERSION],
    )?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('projection_kind', ?1)",
        [PROJECTION_KIND],
    )?;

    for path in &record_paths {
        let bytes = fs::read(path)
            .with_context(|| format!("failed to read admission record {}", path.display()))?;
        let record: AdmissionRecord = serde_json::from_slice(&bytes)
            .with_context(|| format!("failed to parse admission record {}", path.display()))?;
        if record.schema_version != 1 {
            bail!(
                "admission record {} has unsupported schema version {}",
                path.display(),
                record.schema_version
            );
        }
        let source_path = relative_workspace_path(&paths.workspace_root, path)?;
        insert_record(
            &transaction,
            &record,
            &source_path,
            &sha256_bytes(&bytes),
            &paths.workspace_root,
        )?;
    }
    validate_revision_histories(&transaction)?;
    transaction.commit()?;

    let inspection = inspect(paths)?;
    if inspection.integrity != "ok"
        || inspection.schema_version != SCHEMA_VERSION
        || inspection.projection_kind != PROJECTION_KIND
        || inspection.foreign_key_violations != 0
        || !inspection.admission_records_consistent
        || inspection.ledger_source_mismatches != 0
        || inspection.protocol_config_mismatches != 0
        || inspection.mismatched_artifacts != 0
    {
        bail!("rebuilt registry failed integrity, provenance, or artifact checks");
    }
    Ok(RebuildReport {
        schema_version: inspection.schema_version,
        database_path: paths.database_path.display().to_string(),
        records_dir: paths.records_dir.display().to_string(),
        admission_records: record_paths.len(),
        relation_counts: inspection.relation_counts,
        missing_artifacts: inspection.missing_artifacts,
        mismatched_artifacts: inspection.mismatched_artifacts,
    })
}

pub fn inspect(paths: &RegistryPaths) -> Result<IntegrityReport> {
    let connection = Connection::open(&paths.database_path)
        .with_context(|| format!("failed to open {}", paths.database_path.display()))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let foreign_key_violations: usize =
        connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            let count: i64 = row.get(0)?;
            Ok(count as usize)
        })?;
    let schema_version: String = connection.query_row(
        "SELECT value FROM metadata WHERE key = 'schema_version'",
        [],
        |row| row.get(0),
    )?;
    let projection_kind: String = connection.query_row(
        "SELECT value FROM metadata WHERE key = 'projection_kind'",
        [],
        |row| row.get(0),
    )?;
    let relation_counts = relation_counts(&connection)?;

    let mut admission_record_mismatches = Vec::new();
    let mut statement = connection.prepare(
        "SELECT admission_id, source_path, source_sha256 FROM admissions ORDER BY admission_id",
    )?;
    let admissions = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for admission in admissions {
        let (admission_id, source_path, expected) = admission?;
        let path = paths.workspace_root.join(&source_path);
        match fs::read(&path) {
            Ok(bytes) if sha256_bytes(&bytes).eq_ignore_ascii_case(&expected) => {}
            Ok(_) => admission_record_mismatches.push(format!(
                "{admission_id}: source hash mismatch at {source_path}"
            )),
            Err(_) => admission_record_mismatches.push(format!(
                "{admission_id}: source record missing at {source_path}"
            )),
        }
    }

    let ledger_source_mismatch_details =
        tracked_ledger_mismatches(&connection, &paths.workspace_root)?;
    let protocol_config_mismatch_details =
        tracked_protocol_mismatches(&connection, &paths.workspace_root)?;

    let mut missing_artifacts = 0;
    let mut mismatched_artifacts = 0;
    let mut artifact_observation_drift = 0;
    let mut statement = connection.prepare(
        "SELECT artifact_uri, expected_sha256, observed_sha256, availability_status
         FROM evidence_artifacts ORDER BY artifact_id",
    )?;
    let artifacts = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    for artifact in artifacts {
        let (uri, expected, stored_observed, stored_status) = artifact?;
        let (observed, status) = artifact_observation(&paths.workspace_root, &uri, &expected)?;
        match status.as_str() {
            "missing-ignored-artifact" => missing_artifacts += 1,
            "present-hash-mismatch" => mismatched_artifacts += 1,
            _ => {}
        }
        if status != stored_status || observed != stored_observed {
            artifact_observation_drift += 1;
        }
    }

    Ok(IntegrityReport {
        schema_version,
        projection_kind,
        integrity,
        foreign_key_violations,
        relation_counts,
        admission_records_consistent: admission_record_mismatches.is_empty(),
        admission_record_mismatches,
        ledger_source_mismatches: ledger_source_mismatch_details.len(),
        ledger_source_mismatch_details,
        protocol_config_mismatches: protocol_config_mismatch_details.len(),
        protocol_config_mismatch_details,
        missing_artifacts,
        mismatched_artifacts,
        artifact_observation_drift,
    })
}

pub fn bounded_query(database_path: &Path, kind: QueryKind, limit: usize) -> Result<Value> {
    if !(1..=100).contains(&limit) {
        bail!("query limit must be between 1 and 100");
    }
    let connection = Connection::open(database_path)
        .with_context(|| format!("failed to open {}", database_path.display()))?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    match kind {
        QueryKind::Cells => Ok(json!(query_cells(&connection, limit)?)),
        QueryKind::Conjectures => Ok(json!(query_conjectures(&connection, limit)?)),
        QueryKind::Runs => Ok(json!(query_runs(&connection, limit)?)),
        QueryKind::Artifacts => Ok(json!(query_artifacts(&connection, limit)?)),
        QueryKind::Gates => Ok(json!(query_gates(&connection, limit)?)),
        QueryKind::Comparisons => Ok(json!(query_comparisons(&connection, limit)?)),
        QueryKind::Links => Ok(json!(query_links(&connection, limit)?)),
        QueryKind::All => Ok(json!({
            "siege_cells": query_cells(&connection, limit)?,
            "conjectures": query_conjectures(&connection, limit)?,
            "runs": query_runs(&connection, limit)?,
            "artifacts": query_artifacts(&connection, limit)?,
            "gate_results": query_gates(&connection, limit)?,
            "comparisons": query_comparisons(&connection, limit)?,
            "ledger_links": query_links(&connection, limit)?,
        })),
    }
}

pub fn deterministic_logical_readback(database_path: &Path) -> Result<String> {
    Ok(serde_json::to_string(&bounded_query(
        database_path,
        QueryKind::All,
        100,
    )?)?)
}

fn reject_foreign_projection(connection: &Connection, existing_nonempty: bool) -> Result<()> {
    if !existing_nonempty {
        return Ok(());
    }
    let has_metadata: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'metadata')",
        [],
        |row| row.get(0),
    )?;
    if !has_metadata {
        bail!("refusing to rebuild a nonempty database not owned by the Cintamani domain registry");
    }
    let existing_schema: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let existing_kind: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key = 'projection_kind'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if existing_schema.as_deref() != Some(SCHEMA_VERSION)
        || existing_kind.as_deref() != Some(PROJECTION_KIND)
    {
        bail!(
            "refusing to rebuild database with incompatible ownership metadata (schema={existing_schema:?}, projection={existing_kind:?})"
        );
    }
    Ok(())
}

fn tracked_ledger_mismatches(
    connection: &Connection,
    workspace_root: &Path,
) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT ledger_path, ledger_sha256 FROM ledger_links ORDER BY ledger_path",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut mismatches = Vec::new();
    for row in rows {
        let (uri, expected) = row?;
        if let Some(detail) = tracked_file_mismatch(workspace_root, &uri, &expected) {
            mismatches.push(format!("ledger {detail}"));
        }
    }
    Ok(mismatches)
}

fn tracked_protocol_mismatches(
    connection: &Connection,
    workspace_root: &Path,
) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT protocol_id, config_uri, config_sha256
         FROM protocols WHERE config_uri IS NOT NULL ORDER BY protocol_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
        ))
    })?;
    let mut mismatches = Vec::new();
    for row in rows {
        let (protocol_id, uri, expected) = row?;
        match expected {
            Some(expected) => {
                if let Some(detail) = tracked_file_mismatch(workspace_root, &uri, &expected) {
                    mismatches.push(format!("protocol {protocol_id}: {detail}"));
                }
            }
            None => mismatches.push(format!(
                "protocol {protocol_id}: config URI {uri} has no expected hash"
            )),
        }
    }
    Ok(mismatches)
}

fn tracked_file_mismatch(workspace_root: &Path, uri: &str, expected: &str) -> Option<String> {
    if let Err(error) = validate_relative_uri(uri) {
        return Some(error.to_string());
    }
    let path = workspace_root.join(uri);
    match fs::read(&path) {
        Ok(bytes) => {
            let observed = sha256_bytes(&bytes);
            (!observed.eq_ignore_ascii_case(expected)).then(|| {
                format!("hash mismatch at {uri}: expected {expected}, observed {observed}")
            })
        }
        Err(error) => Some(format!("source missing or unreadable at {uri}: {error}")),
    }
}

fn clear_projection(transaction: &Transaction<'_>) -> Result<()> {
    transaction.execute_batch(
        "DELETE FROM ledger_links;
         DELETE FROM comparisons;
         DELETE FROM gate_results;
         DELETE FROM evidence_artifacts;
         DELETE FROM runs;
         DELETE FROM protocols;
         DELETE FROM falsification_criteria;
         DELETE FROM conjecture_dispositions;
         DELETE FROM conjectures;
         DELETE FROM parameter_region_values;
         DELETE FROM parameter_regions;
         DELETE FROM parameter_definitions;
         DELETE FROM siege_cell_decisions;
         DELETE FROM siege_cells;
         DELETE FROM typed_morphisms;
         DELETE FROM interfaces;
         DELETE FROM physical_mechanisms;
         DELETE FROM materials;
         DELETE FROM theoretical_models;
         DELETE FROM admissions;
         DELETE FROM metadata;",
    )?;
    Ok(())
}

fn validate_revision_histories(transaction: &Transaction<'_>) -> Result<()> {
    let cell_without_decision: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM siege_cells c
         WHERE NOT EXISTS (
            SELECT 1 FROM siege_cell_decisions d WHERE d.cell_id = c.cell_id
         )",
        [],
        |row| row.get(0),
    )?;
    let invalid_cell_history: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM (
            SELECT cell_id FROM siege_cell_decisions GROUP BY cell_id
            HAVING MIN(revision) != 1 OR MAX(revision) != COUNT(*)
         )",
        [],
        |row| row.get(0),
    )?;
    let conjecture_without_disposition: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM conjectures c
         WHERE NOT EXISTS (
            SELECT 1 FROM conjecture_dispositions d
            WHERE d.conjecture_id = c.conjecture_id
         )",
        [],
        |row| row.get(0),
    )?;
    let invalid_conjecture_history: i64 = transaction.query_row(
        "SELECT COUNT(*) FROM (
            SELECT conjecture_id FROM conjecture_dispositions GROUP BY conjecture_id
            HAVING MIN(revision) != 1 OR MAX(revision) != COUNT(*)
         )",
        [],
        |row| row.get(0),
    )?;
    if cell_without_decision != 0
        || invalid_cell_history != 0
        || conjecture_without_disposition != 0
        || invalid_conjecture_history != 0
    {
        bail!(
            "every cell/conjecture needs a contiguous append-only decision/disposition history starting at revision 1"
        );
    }
    Ok(())
}

fn admission_record_paths(records_dir: &Path) -> Result<Vec<PathBuf>> {
    let mut paths = fs::read_dir(records_dir)?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension == "json")
        })
        .collect::<Vec<_>>();
    paths.sort();
    if paths.is_empty() {
        bail!(
            "no JSON admission records found in {}",
            records_dir.display()
        );
    }
    Ok(paths)
}

fn insert_record(
    transaction: &Transaction<'_>,
    record: &AdmissionRecord,
    source_path: &str,
    source_sha256: &str,
    workspace_root: &Path,
) -> Result<()> {
    let admission = &record.record_id;
    transaction.execute(
        "INSERT INTO admissions (
            admission_id, record_schema_version, source_path, source_sha256, admitted_at, description
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            admission,
            record.schema_version,
            source_path,
            source_sha256,
            record.admitted_at,
            record.description
        ],
    )?;

    for row in &record.theoretical_models {
        transaction.execute(
            "INSERT INTO theoretical_models VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.model_id,
                row.name,
                row.description,
                row.epistemic_status,
                admission
            ],
        )?;
    }
    for row in &record.materials {
        transaction.execute(
            "INSERT INTO materials VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.material_id,
                row.name,
                row.material_kind,
                row.epistemic_status,
                row.description,
                admission
            ],
        )?;
    }
    for row in &record.physical_mechanisms {
        transaction.execute(
            "INSERT INTO physical_mechanisms VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                row.mechanism_id,
                row.name,
                row.description,
                row.epistemic_status,
                admission
            ],
        )?;
    }
    for row in &record.interfaces {
        transaction.execute(
            "INSERT INTO interfaces VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                row.interface_id,
                row.name,
                row.observation_kind,
                row.units,
                row.description,
                row.epistemic_status,
                admission
            ],
        )?;
    }
    for row in &record.typed_morphisms {
        transaction.execute(
            "INSERT INTO typed_morphisms VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                row.morphism_id,
                row.name,
                row.source_model_id,
                row.material_id,
                row.mechanism_id,
                row.target_interface_id,
                row.morphism_type,
                row.validation_status,
                row.description,
                admission
            ],
        )?;
    }
    for row in &record.siege_cells {
        transaction.execute(
            "INSERT INTO siege_cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                row.cell_id,
                row.name,
                row.model_id,
                row.material_id,
                row.mechanism_id,
                row.interface_id,
                row.morphism_id,
                row.epistemic_status,
                admission
            ],
        )?;
    }
    for row in &record.siege_cell_decisions {
        transaction.execute(
            "INSERT INTO siege_cell_decisions VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                row.decision_id,
                row.cell_id,
                row.revision,
                row.decided_at,
                row.status,
                row.rationale,
                row.decision_scope,
                admission
            ],
        )?;
    }
    for row in &record.parameter_definitions {
        transaction.execute(
            "INSERT INTO parameter_definitions VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.parameter_id,
                row.name,
                row.symbol,
                row.units,
                row.description,
                admission
            ],
        )?;
    }
    for row in &record.parameter_regions {
        transaction.execute(
            "INSERT INTO parameter_regions VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                row.region_id,
                row.cell_id,
                row.name,
                row.region_kind,
                bool_i64(row.predeclared),
                row.decision_scope,
                admission
            ],
        )?;
    }
    for row in &record.parameter_region_values {
        transaction.execute(
            "INSERT INTO parameter_region_values VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                row.region_id,
                row.parameter_id,
                row.lower_value,
                row.upper_value,
                row.exact_text,
                row.units,
                admission
            ],
        )?;
    }
    for row in &record.conjectures {
        transaction.execute(
            "INSERT INTO conjectures VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.conjecture_id,
                row.cell_id,
                row.label,
                row.statement,
                row.version,
                admission
            ],
        )?;
    }
    for row in &record.conjecture_dispositions {
        transaction.execute(
            "INSERT INTO conjecture_dispositions VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                row.disposition_id,
                row.conjecture_id,
                row.revision,
                row.decided_at,
                row.status,
                row.rationale,
                row.decision_scope,
                admission
            ],
        )?;
    }
    for row in &record.falsification_criteria {
        transaction.execute(
            "INSERT INTO falsification_criteria VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                row.criterion_id,
                row.conjecture_id,
                row.description,
                row.metric,
                row.comparator,
                row.threshold_value,
                row.threshold_text,
                row.units,
                bool_i64(row.predeclared),
                admission
            ],
        )?;
    }
    for row in &record.protocols {
        if let Some(uri) = &row.config_uri {
            validate_relative_uri(uri)?;
        }
        transaction.execute(
            "INSERT INTO protocols VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                row.protocol_id,
                row.name,
                row.version,
                row.config_uri,
                row.config_sha256,
                row.config_hash_status,
                bool_i64(row.predeclared),
                row.seed_count,
                row.null_trials,
                row.null_quantile,
                row.decision_scope,
                admission
            ],
        )?;
    }
    for row in &record.runs {
        transaction.execute(
            "INSERT INTO runs VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                row.run_id,
                row.protocol_id,
                row.cell_id,
                row.code_commit,
                row.run_status,
                row.epistemic_status,
                row.summary,
                admission
            ],
        )?;
    }
    for row in &record.evidence_artifacts {
        validate_relative_uri(&row.artifact_uri)?;
        let (observed_sha256, availability_status) =
            artifact_observation(workspace_root, &row.artifact_uri, &row.expected_sha256)?;
        transaction.execute(
            "INSERT INTO evidence_artifacts VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                row.artifact_id,
                row.run_id,
                row.artifact_kind,
                row.artifact_uri,
                row.expected_sha256,
                observed_sha256,
                availability_status,
                bool_i64(row.canonical_detail),
                row.detail_row_count.map(to_i64),
                row.description,
                admission
            ],
        )?;
    }
    for row in &record.gate_results {
        transaction.execute(
            "INSERT INTO gate_results VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                row.gate_result_id,
                row.run_id,
                row.criterion_id,
                row.gate_name,
                row.evidence_polarity,
                bool_i64(row.passed),
                row.metric_value,
                row.metric_text,
                row.units,
                row.seed_pass_count,
                row.seed_required_count,
                row.decision_scope,
                row.limitation,
                admission
            ],
        )?;
    }
    for row in &record.comparisons {
        transaction.execute(
            "INSERT INTO comparisons VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                row.comparison_id,
                row.run_id,
                row.baseline_run_id,
                row.control_relationship,
                row.metric,
                row.evidence_polarity,
                row.minimum_delta,
                row.maximum_delta,
                row.mean_delta,
                row.units,
                row.decision_scope,
                admission
            ],
        )?;
    }
    for row in &record.ledger_links {
        validate_relative_uri(&row.ledger_path)?;
        transaction.execute(
            "INSERT INTO ledger_links VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
             )",
            params![
                row.ledger_link_id,
                row.ledger_number,
                row.ledger_title,
                row.ledger_path,
                row.ledger_sha256,
                row.relation,
                row.admitted_claim,
                row.run_id,
                row.cell_id,
                row.conjecture_id,
                row.protocol_id,
                row.artifact_id,
                row.gate_result_id,
                row.comparison_id,
                admission
            ],
        )?;
    }
    Ok(())
}

fn artifact_observation(
    workspace_root: &Path,
    artifact_uri: &str,
    expected_sha256: &str,
) -> Result<(Option<String>, String)> {
    validate_relative_uri(artifact_uri)?;
    let path = workspace_root.join(artifact_uri);
    if !path.is_file() {
        return Ok((None, "missing-ignored-artifact".to_owned()));
    }
    let observed = sha256_file(&path)?;
    let status = if observed.eq_ignore_ascii_case(expected_sha256) {
        "present-verified"
    } else {
        "present-hash-mismatch"
    };
    Ok((Some(observed), status.to_owned()))
}

fn validate_relative_uri(uri: &str) -> Result<()> {
    let path = Path::new(uri);
    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        bail!("artifact URI must be a workspace-relative path without parent traversal: {uri}");
    }
    Ok(())
}

fn relative_workspace_path(workspace_root: &Path, path: &Path) -> Result<String> {
    let relative = path.strip_prefix(workspace_root).with_context(|| {
        format!(
            "admission record {} is outside workspace {}",
            path.display(),
            workspace_root.display()
        )
    })?;
    Ok(relative.to_string_lossy().replace('\\', "/"))
}

fn sha256_file(path: &Path) -> Result<String> {
    Ok(sha256_bytes(&fs::read(path)?))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|byte| format!("{byte:02X}")).collect()
}

fn bool_i64(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn to_i64(value: u64) -> i64 {
    value.try_into().unwrap_or(i64::MAX)
}

fn relation_counts(connection: &Connection) -> Result<BTreeMap<String, usize>> {
    let mut counts = BTreeMap::new();
    for &table in DOMAIN_TABLES {
        let query = format!("SELECT COUNT(*) FROM {table}");
        let count: i64 = connection.query_row(&query, [], |row| row.get(0))?;
        counts.insert(table.to_owned(), count as usize);
    }
    Ok(counts)
}

fn ledger_numbers(connection: &Connection, predicate: &str, id: &str) -> Result<Vec<u32>> {
    let allowed = [
        "run_id",
        "cell_id",
        "conjecture_id",
        "artifact_id",
        "gate_result_id",
        "comparison_id",
    ];
    if !allowed.contains(&predicate) {
        bail!("unsupported ledger-link predicate {predicate}");
    }
    let query = format!(
        "SELECT DISTINCT ledger_number FROM ledger_links WHERE {predicate} = ?1 ORDER BY ledger_number"
    );
    let mut statement = connection.prepare(&query)?;
    Ok(statement
        .query_map([id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

fn query_cells(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT c.cell_id, c.name, m.name, a.name, p.name, i.name,
                d.status, c.epistemic_status, d.decision_scope, d.revision,
                d.decided_at, d.rationale, d.source_admission_id
         FROM siege_cells c
         JOIN theoretical_models m ON m.model_id = c.model_id
         JOIN materials a ON a.material_id = c.material_id
         JOIN physical_mechanisms p ON p.mechanism_id = c.mechanism_id
         JOIN interfaces i ON i.interface_id = c.interface_id
         JOIN siege_cell_decisions d ON d.cell_id = c.cell_id
            AND d.revision = (
                SELECT MAX(latest.revision) FROM siege_cell_decisions latest
                WHERE latest.cell_id = c.cell_id
            )
         ORDER BY c.cell_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, u32>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
            row.get::<_, String>(12)?,
        ))
    })?;
    rows.map(|row| {
        let (
            id,
            name,
            model,
            material,
            mechanism,
            interface,
            status,
            epistemic,
            scope,
            revision,
            decided_at,
            rationale,
            source_admission_id,
        ) = row?;
        Ok(json!({
            "cell_id": id,
            "name": name,
            "theoretical_model": model,
            "material": material,
            "physical_mechanism": mechanism,
            "interface": interface,
            "status": status,
            "epistemic_status": epistemic,
            "decision_scope": scope,
            "current_decision_revision": revision,
            "current_decision_at": decided_at,
            "current_decision_rationale": rationale,
            "current_decision_source_admission_id": source_admission_id,
            "ledgers": ledger_numbers(connection, "cell_id", &id)?,
        }))
    })
    .collect()
}

fn query_conjectures(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT q.conjecture_id, q.label, q.statement, q.version, d.status,
                d.decision_scope, c.name, d.revision, d.decided_at, d.rationale,
                d.source_admission_id,
                (SELECT COUNT(*) FROM falsification_criteria f WHERE f.conjecture_id = q.conjecture_id)
         FROM conjectures q
         JOIN siege_cells c ON c.cell_id = q.cell_id
         JOIN conjecture_dispositions d ON d.conjecture_id = q.conjecture_id
            AND d.revision = (
                SELECT MAX(latest.revision) FROM conjecture_dispositions latest
                WHERE latest.conjecture_id = q.conjecture_id
            )
         ORDER BY q.conjecture_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, u32>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, u32>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, u32>(11)?,
        ))
    })?;
    rows.map(|row| {
        let (
            id,
            label,
            statement,
            version,
            status,
            scope,
            cell,
            revision,
            decided_at,
            rationale,
            source_admission_id,
            criteria,
        ) = row?;
        Ok(json!({
            "conjecture_id": id,
            "label": label,
            "statement": statement,
            "version": version,
            "status": status,
            "decision_scope": scope,
            "current_disposition_revision": revision,
            "current_disposition_at": decided_at,
            "current_disposition_rationale": rationale,
            "current_disposition_source_admission_id": source_admission_id,
            "siege_cell": cell,
            "falsification_criteria": criteria,
            "ledgers": ledger_numbers(connection, "conjecture_id", &id)?,
        }))
    })
    .collect()
}

fn query_runs(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT r.run_id, r.code_commit, r.run_status, r.epistemic_status, r.summary,
                p.name, p.version, c.name,
                (SELECT COUNT(*) FROM evidence_artifacts a WHERE a.run_id = r.run_id),
                (SELECT COUNT(*) FROM gate_results g WHERE g.run_id = r.run_id)
         FROM runs r
         JOIN protocols p ON p.protocol_id = r.protocol_id
         JOIN siege_cells c ON c.cell_id = r.cell_id
         ORDER BY r.run_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, u32>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, u32>(8)?,
            row.get::<_, u32>(9)?,
        ))
    })?;
    rows.map(|row| {
        let (id, commit, status, epistemic, summary, protocol, version, cell, artifacts, gates) =
            row?;
        Ok(json!({
            "run_id": id,
            "code_commit": commit,
            "status": status,
            "epistemic_status": epistemic,
            "summary": summary,
            "protocol": protocol,
            "protocol_version": version,
            "siege_cell": cell,
            "artifact_count": artifacts,
            "gate_result_count": gates,
            "ledgers": ledger_numbers(connection, "run_id", &id)?,
        }))
    })
    .collect()
}

fn query_artifacts(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT a.artifact_id, a.run_id, a.artifact_kind, a.artifact_uri,
                a.expected_sha256, a.observed_sha256, a.availability_status,
                a.canonical_detail, a.detail_row_count, a.description
         FROM evidence_artifacts a ORDER BY a.artifact_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<String>>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, bool>(7)?,
            row.get::<_, Option<i64>>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;
    rows.map(|row| {
        let (id, run, kind, uri, expected, observed, status, canonical, detail_rows, description) =
            row?;
        Ok(json!({
            "artifact_id": id,
            "run_id": run,
            "kind": kind,
            "uri": uri,
            "expected_sha256": expected,
            "observed_sha256": observed,
            "availability_status": status,
            "canonical_detail": canonical,
            "detail_row_count": detail_rows,
            "description": description,
            "ledgers": ledger_numbers(connection, "artifact_id", &id)?,
        }))
    })
    .collect()
}

fn query_gates(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT g.gate_result_id, g.run_id, g.gate_name, g.evidence_polarity,
                g.passed, g.metric_value, g.metric_text, g.units,
                g.seed_pass_count, g.seed_required_count, g.decision_scope, g.limitation
         FROM gate_results g ORDER BY g.gate_result_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, bool>(4)?,
            row.get::<_, Option<f64>>(5)?,
            row.get::<_, Option<String>>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, Option<u32>>(8)?,
            row.get::<_, Option<u32>>(9)?,
            row.get::<_, String>(10)?,
            row.get::<_, String>(11)?,
        ))
    })?;
    rows.map(|row| {
        let (
            id,
            run,
            name,
            polarity,
            passed,
            value,
            text,
            units,
            seed_pass,
            seed_required,
            scope,
            limitation,
        ) = row?;
        Ok(json!({
            "gate_result_id": id,
            "run_id": run,
            "gate_name": name,
            "evidence_polarity": polarity,
            "passed": passed,
            "metric_value": value,
            "metric_text": text,
            "units": units,
            "seed_pass_count": seed_pass,
            "seed_required_count": seed_required,
            "decision_scope": scope,
            "limitation": limitation,
            "ledgers": ledger_numbers(connection, "gate_result_id", &id)?,
        }))
    })
    .collect()
}

fn query_comparisons(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT comparison_id, run_id, control_relationship, metric, evidence_polarity,
                minimum_delta, maximum_delta, mean_delta, units, decision_scope
         FROM comparisons ORDER BY comparison_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, Option<f64>>(5)?,
            row.get::<_, Option<f64>>(6)?,
            row.get::<_, Option<f64>>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;
    rows.map(|row| {
        let (id, run, control, metric, polarity, minimum, maximum, mean, units, scope) = row?;
        Ok(json!({
            "comparison_id": id,
            "run_id": run,
            "control_relationship": control,
            "metric": metric,
            "evidence_polarity": polarity,
            "minimum_delta": minimum,
            "maximum_delta": maximum,
            "mean_delta": mean,
            "units": units,
            "decision_scope": scope,
            "ledgers": ledger_numbers(connection, "comparison_id", &id)?,
        }))
    })
    .collect()
}

fn query_links(connection: &Connection, limit: usize) -> Result<Vec<Value>> {
    let mut statement = connection.prepare(
        "SELECT ledger_link_id, ledger_number, ledger_title, ledger_path, ledger_sha256,
                relation, admitted_claim, run_id, cell_id, conjecture_id, protocol_id,
                artifact_id, gate_result_id, comparison_id
         FROM ledger_links ORDER BY ledger_number, ledger_link_id LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], |row| {
        Ok(json!({
            "ledger_link_id": row.get::<_, String>(0)?,
            "ledger_number": row.get::<_, u32>(1)?,
            "ledger_title": row.get::<_, String>(2)?,
            "ledger_path": row.get::<_, String>(3)?,
            "ledger_sha256": row.get::<_, String>(4)?,
            "relation": row.get::<_, String>(5)?,
            "admitted_claim": row.get::<_, String>(6)?,
            "run_id": row.get::<_, Option<String>>(7)?,
            "cell_id": row.get::<_, Option<String>>(8)?,
            "conjecture_id": row.get::<_, Option<String>>(9)?,
            "protocol_id": row.get::<_, Option<String>>(10)?,
            "artifact_id": row.get::<_, Option<String>>(11)?,
            "gate_result_id": row.get::<_, Option<String>>(12)?,
            "comparison_id": row.get::<_, Option<String>>(13)?,
        }))
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn source_workspace() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../..")
            .canonicalize()
            .unwrap()
    }

    fn temp_paths(temp: &TempDir) -> RegistryPaths {
        RegistryPaths::for_workspace(source_workspace())
            .with_database(temp.path().join("registry.sqlite"))
    }

    fn schema_connection_with_axes() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        connection.execute_batch(MIGRATION_V1).unwrap();
        connection
            .execute_batch(
                "INSERT INTO admissions VALUES (
                    'a', 1, 'a.json',
                    '0000000000000000000000000000000000000000000000000000000000000000',
                    '2026-08-10', 'test'
                 );
                 INSERT INTO theoretical_models VALUES (
                    'model', 'model', 'test', 'implemented-normalized-model', 'a'
                 );
                 INSERT INTO materials VALUES (
                    'material', 'material', 'abstract-normalized-medium',
                    'abstract-placeholder', 'test', 'a'
                 );
                 INSERT INTO physical_mechanisms VALUES (
                    'mechanism', 'mechanism', 'test', 'implemented-normalized-model', 'a'
                 );
                 INSERT INTO interfaces VALUES (
                    'interface-a', 'interface a', 'abstract', 'unit-a', 'test',
                    'implemented-normalized-interface', 'a'
                 );
                 INSERT INTO interfaces VALUES (
                    'interface-b', 'interface b', 'abstract', 'unit-b', 'test',
                    'implemented-normalized-interface', 'a'
                 );
                 INSERT INTO typed_morphisms VALUES (
                    'morphism-a', 'morphism a', 'model', 'material', 'mechanism',
                    'interface-a', 'dynamics-to-observation', 'implemented-normalized', 'test', 'a'
                 );",
            )
            .unwrap();
        connection
    }

    fn copy_registry_inputs(workspace: &Path) {
        let source = source_workspace();
        fs::create_dir_all(workspace.join(".narada/kb/cintamani-domain/admissions")).unwrap();
        fs::create_dir_all(workspace.join("src/ledger")).unwrap();
        fs::create_dir_all(workspace.join("packages/kerr-capacity/configs")).unwrap();
        fs::write(workspace.join(".narada/AGENTS.md"), "test").unwrap();
        for path in
            admission_record_paths(&source.join(".narada/kb/cintamani-domain/admissions")).unwrap()
        {
            fs::copy(
                &path,
                workspace
                    .join(".narada/kb/cintamani-domain/admissions")
                    .join(path.file_name().unwrap()),
            )
            .unwrap();
        }
        for name in [
            "20260810-12 Rust Kerr Capacity Instrument and First Control.md",
            "20260810-13 Attribution Controls and Capacity-Estimator Calibration.md",
            "20260810-14 Detector-Noise Survival of Kerr Quadrature Memory.md",
        ] {
            fs::copy(
                source.join("src/ledger").join(name),
                workspace.join("src/ledger").join(name),
            )
            .unwrap();
        }
        fs::copy(
            source.join("packages/kerr-capacity/configs/detector-noise-frozen.toml"),
            workspace.join("packages/kerr-capacity/configs/detector-noise-frozen.toml"),
        )
        .unwrap();
    }

    #[test]
    fn rebuild_is_idempotent_and_logically_deterministic() {
        let temp = TempDir::new().unwrap();
        let paths = temp_paths(&temp);
        let first = rebuild(&paths).unwrap();
        let first_snapshot = deterministic_logical_readback(&paths.database_path).unwrap();
        let second = rebuild(&paths).unwrap();
        let second_snapshot = deterministic_logical_readback(&paths.database_path).unwrap();
        assert_eq!(first.relation_counts, second.relation_counts);
        assert_eq!(first_snapshot, second_snapshot);
    }

    #[test]
    fn later_admission_advances_current_state_without_rewriting_history() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        copy_registry_inputs(workspace);
        let original = workspace.join(".narada/kb/cintamani-domain/admissions/0001-taxonomy.json");
        let original_hash = sha256_file(&original).unwrap();
        fs::write(
            workspace.join(".narada/kb/cintamani-domain/admissions/0005-test-evolution.json"),
            r#"{
              "record_id": "admission-test-evolution",
              "schema_version": 1,
              "admitted_at": "2026-08-11",
              "description": "Test-only append evolution.",
              "siege_cell_decisions": [
                {
                  "decision_id": "decision-quadrature-r3",
                  "cell_id": "cell-kerr-abstract-quadrature",
                  "revision": 3,
                  "decided_at": "2026-08-11",
                  "status": "deferred",
                  "rationale": "Test-only later critique.",
                  "decision_scope": "Test-only current cell scope."
                }
              ],
              "conjecture_dispositions": [
                {
                  "disposition_id": "disposition-quadrature-lead-r3",
                  "conjecture_id": "conjecture-kerr-quadrature-linear-memory-lead",
                  "revision": 3,
                  "decided_at": "2026-08-11",
                  "status": "deferred",
                  "rationale": "Test-only later critique.",
                  "decision_scope": "Test-only current conjecture scope."
                }
              ]
            }"#,
        )
        .unwrap();
        let paths = RegistryPaths::for_workspace(workspace);
        rebuild(&paths).unwrap();

        assert_eq!(sha256_file(&original).unwrap(), original_hash);
        let connection = Connection::open(&paths.database_path).unwrap();
        let cell_history: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM siege_cell_decisions
                 WHERE cell_id = 'cell-kerr-abstract-quadrature'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conjecture_history: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM conjecture_dispositions
                 WHERE conjecture_id = 'conjecture-kerr-quadrature-linear-memory-lead'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cell_history, 3);
        assert_eq!(conjecture_history, 3);

        let cells = bounded_query(&paths.database_path, QueryKind::Cells, 100).unwrap();
        let quadrature = cells
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["cell_id"] == "cell-kerr-abstract-quadrature")
            .unwrap();
        assert_eq!(quadrature["status"], "deferred");
        assert_eq!(quadrature["current_decision_revision"], 3);

        let conjectures = bounded_query(&paths.database_path, QueryKind::Conjectures, 100).unwrap();
        let conjecture = &conjectures.as_array().unwrap()[0];
        assert_eq!(conjecture["status"], "deferred");
        assert_eq!(conjecture["current_disposition_revision"], 3);
    }

    #[test]
    fn schema_enforces_checks_and_foreign_keys() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        connection.execute_batch(MIGRATION_V1).unwrap();
        connection
            .execute(
                "INSERT INTO admissions VALUES ('a', 1, 'a.json', ?1, '2026-08-10', 'test')",
                ["0".repeat(64)],
            )
            .unwrap();
        assert!(
            connection
                .execute(
                    "INSERT INTO materials VALUES ('m', 'bad', 'invented', 'abstract-placeholder', 'bad', 'a')",
                    [],
                )
                .is_err()
        );
        assert!(
            connection
                .execute(
                    "INSERT INTO siege_cells VALUES ('c', 'bad', 'missing', 'missing', 'missing', 'missing', 'missing', 'normalized-model-only', 'a')",
                    [],
                )
                .is_err()
        );
    }

    #[test]
    fn siege_cell_rejects_an_axis_mismatched_existing_morphism() {
        let connection = schema_connection_with_axes();
        let error = connection
            .execute(
                "INSERT INTO siege_cells VALUES (
                    'cell', 'cell', 'model', 'material', 'mechanism', 'interface-b',
                    'morphism-a', 'normalized-model-only', 'a'
                 )",
                [],
            )
            .unwrap_err();
        assert!(error.to_string().contains("FOREIGN KEY constraint failed"));
    }

    #[test]
    fn parameter_region_value_rejects_units_mismatched_to_definition() {
        let connection = schema_connection_with_axes();
        connection
            .execute_batch(
                "INSERT INTO siege_cells VALUES (
                    'cell', 'cell', 'model', 'material', 'mechanism', 'interface-a',
                    'morphism-a', 'normalized-model-only', 'a'
                 );
                 INSERT INTO parameter_definitions VALUES (
                    'parameter', 'parameter', 'p', 'declared-unit', 'test', 'a'
                 );
                 INSERT INTO parameter_regions VALUES (
                    'region', 'cell', 'region', 'frozen-singleton', 1, 'test', 'a'
                 );",
            )
            .unwrap();
        let error = connection
            .execute(
                "INSERT INTO parameter_region_values VALUES (
                    'region', 'parameter', 1.0, 1.0, '1', 'different-unit', 'a'
                 )",
                [],
            )
            .unwrap_err();
        assert!(error.to_string().contains("FOREIGN KEY constraint failed"));
    }

    #[test]
    fn protocol_permutation_settings_are_jointly_optional() {
        let connection = schema_connection_with_axes();
        connection
            .execute(
                "INSERT INTO protocols VALUES (
                    'without-null', 'without null', 1, NULL, NULL, 'unavailable',
                    1, 1, NULL, NULL, 'test', 'a'
                 )",
                [],
            )
            .unwrap();
        assert!(
            connection
                .execute(
                    "INSERT INTO protocols VALUES (
                        'half-null', 'half null', 1, NULL, NULL, 'unavailable',
                        1, 1, 512, NULL, 'test', 'a'
                     )",
                    [],
                )
                .is_err()
        );
    }

    #[test]
    fn rebuild_refuses_a_nonempty_foreign_database() {
        let temp = TempDir::new().unwrap();
        let paths = temp_paths(&temp);
        let foreign = Connection::open(&paths.database_path).unwrap();
        foreign
            .execute_batch("CREATE TABLE irreplaceable(value TEXT); INSERT INTO irreplaceable VALUES ('keep');")
            .unwrap();
        drop(foreign);

        let error = rebuild(&paths).unwrap_err();
        assert!(error.to_string().contains("not owned"));
        let foreign = Connection::open(&paths.database_path).unwrap();
        let value: String = foreign
            .query_row("SELECT value FROM irreplaceable", [], |row| row.get(0))
            .unwrap();
        assert_eq!(value, "keep");
    }

    #[test]
    fn seed_is_truthful_about_material_and_conjecture_limits() {
        let temp = TempDir::new().unwrap();
        let paths = temp_paths(&temp);
        rebuild(&paths).unwrap();
        let connection = Connection::open(&paths.database_path).unwrap();
        let cell_material: String = connection
            .query_row(
                "SELECT m.material_kind FROM siege_cells c JOIN materials m ON m.material_id = c.material_id",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let candidate_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM siege_cells c WHERE c.material_id = 'thin-film-litao3-candidate'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conjecture_five: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM conjectures WHERE lower(label) LIKE '%conjecture 5%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let nonlinear_replication: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM gate_results WHERE gate_name = 'replicated-nonlinear-delayed-capacity' AND passed = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let unlinked_gates: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM gate_results g
                 WHERE NOT EXISTS (
                    SELECT 1 FROM ledger_links l WHERE l.gate_result_id = g.gate_result_id
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let unlinked_comparisons: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM comparisons c
                 WHERE NOT EXISTS (
                    SELECT 1 FROM ledger_links l WHERE l.comparison_id = c.comparison_id
                 )",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let intensity_current: (String, i64, String) = connection
            .query_row(
                "SELECT status, revision, source_admission_id
                 FROM siege_cell_decisions
                 WHERE cell_id = 'cell-kerr-abstract-intensity'
                 ORDER BY revision DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        let quadrature_current: (String, i64, String) = connection
            .query_row(
                "SELECT status, revision, source_admission_id
                 FROM siege_cell_decisions
                 WHERE cell_id = 'cell-kerr-abstract-quadrature'
                 ORDER BY revision DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        let conjecture_definition_source: String = connection
            .query_row(
                "SELECT source_admission_id FROM conjectures
                 WHERE conjecture_id = 'conjecture-kerr-quadrature-linear-memory-lead'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let conjecture_current: (String, i64, String) = connection
            .query_row(
                "SELECT status, revision, source_admission_id
                 FROM conjecture_dispositions
                 WHERE conjecture_id = 'conjecture-kerr-quadrature-linear-memory-lead'
                 ORDER BY revision DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        let pretest_criteria_sources: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM falsification_criteria
                 WHERE source_admission_id = 'admission-ledger-13'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let frozen_region_source: String = connection
            .query_row(
                "SELECT source_admission_id FROM parameter_regions
                 WHERE region_id = 'region-ledger14-decision-point'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(cell_material, "abstract-normalized-medium");
        assert_eq!(candidate_links, 0);
        assert_eq!(conjecture_five, 0);
        assert_eq!(nonlinear_replication, 0);
        assert_eq!(unlinked_gates, 0);
        assert_eq!(unlinked_comparisons, 0);
        assert_eq!(
            intensity_current,
            (
                "tested-local".to_owned(),
                2,
                "admission-ledger-13".to_owned()
            )
        );
        assert_eq!(
            quadrature_current,
            (
                "advanced-local-lead".to_owned(),
                2,
                "admission-ledger-14".to_owned()
            )
        );
        assert_eq!(conjecture_definition_source, "admission-ledger-13");
        assert_eq!(
            conjecture_current,
            (
                "survived-local-gate".to_owned(),
                2,
                "admission-ledger-14".to_owned()
            )
        );
        assert_eq!(pretest_criteria_sources, 2);
        assert_eq!(frozen_region_source, "admission-ledger-14");
    }

    #[test]
    fn artifact_identity_is_deduplicated_without_target_rows() {
        let temp = TempDir::new().unwrap();
        let paths = temp_paths(&temp);
        rebuild(&paths).unwrap();
        let connection = Connection::open(&paths.database_path).unwrap();
        let (run, uri, hash, admission): (String, String, String, String) = connection
            .query_row(
                "SELECT run_id, artifact_uri, expected_sha256, source_admission_id FROM evidence_artifacts LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert!(
            connection
                .execute(
                    "INSERT INTO evidence_artifacts VALUES ('duplicate', ?1, 'sqlite-detailed-results', ?2, ?3, NULL, 'missing-ignored-artifact', 1, 1650, 'duplicate', ?4)",
                    params![run, uri, hash, admission],
                )
                .is_err()
        );
        let target_tables: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name LIKE '%target%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(target_tables, 0);
    }

    #[test]
    fn missing_ignored_artifact_is_tolerated_and_represented() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        copy_registry_inputs(workspace);
        let paths = RegistryPaths::for_workspace(workspace);
        let report = rebuild(&paths).unwrap();
        let inspection = inspect(&paths).unwrap();
        assert_eq!(report.missing_artifacts, 1);
        assert_eq!(inspection.missing_artifacts, 1);
        assert_eq!(inspection.integrity, "ok");
        assert_eq!(inspection.foreign_key_violations, 0);
    }

    #[test]
    fn tracked_ledger_and_config_hashes_are_checked() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        copy_registry_inputs(workspace);
        let paths = RegistryPaths::for_workspace(workspace);
        rebuild(&paths).unwrap();
        fs::write(
            workspace.join("packages/kerr-capacity/configs/detector-noise-frozen.toml"),
            "tampered",
        )
        .unwrap();
        fs::write(
            workspace.join(
                "src/ledger/20260810-14 Detector-Noise Survival of Kerr Quadrature Memory.md",
            ),
            "tampered",
        )
        .unwrap();
        let inspection = inspect(&paths).unwrap();
        assert_eq!(inspection.protocol_config_mismatches, 1);
        assert_eq!(inspection.ledger_source_mismatches, 1);
    }

    #[test]
    fn present_artifact_hash_mismatch_is_not_tolerated() {
        let temp = TempDir::new().unwrap();
        let workspace = temp.path();
        copy_registry_inputs(workspace);
        let paths = RegistryPaths::for_workspace(workspace);
        rebuild(&paths).unwrap();
        let artifact =
            workspace.join("packages/kerr-capacity/output/detector-noise-frozen/results.sqlite");
        fs::create_dir_all(artifact.parent().unwrap()).unwrap();
        fs::write(artifact, "wrong artifact").unwrap();
        let inspection = inspect(&paths).unwrap();
        assert_eq!(inspection.mismatched_artifacts, 1);
        assert_eq!(inspection.artifact_observation_drift, 1);
    }
}
