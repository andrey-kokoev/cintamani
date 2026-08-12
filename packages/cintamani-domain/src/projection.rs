use crate::{
    Change, ProvenanceTarget, VerifiedAdmission,
    chain::{DEFAULT_CHAIN_ROOT, verify_chain},
    records::{AdmissionRecord, LedgerLink},
    v2_records::AdmissionV2,
};
use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OpenFlags, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs::{self, OpenOptions},
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;
#[cfg(windows)]
use windows_sys::Win32::Storage::FileSystem::ReplaceFileW;

pub const SCHEMA_VERSION: &str = "3";
pub const PROJECTION_KIND: &str = "rebuildable-site-domain-registry";
const MIGRATION_V2: &str = include_str!("../migrations/002_v2.sql");
const MIGRATION_V3: &str = include_str!("../migrations/003_v3.sql");
const DEFAULT_DATABASE: &str = ".narada/db/cintamani-domain.sqlite";

const DOMAIN_TABLES: &[&str] = &[
    "admissions",
    "theoretical_models",
    "theoretical_model_assessments",
    "materials",
    "material_assessments",
    "physical_mechanisms",
    "mechanism_assessments",
    "interfaces",
    "interface_assessments",
    "process_ports",
    "typed_morphisms",
    "morphism_assessments",
    "morphism_paths",
    "morphism_path_steps",
    "siege_cells",
    "siege_cell_morphisms",
    "siege_cell_paths",
    "siege_cell_assessments",
    "siege_cell_decisions",
    "parameter_definitions",
    "parameter_regions",
    "parameter_region_versions",
    "parameter_region_values",
    "problems",
    "problem_versions",
    "conjectures",
    "conjecture_versions",
    "conjecture_framings",
    "conjecture_dispositions",
    "falsification_criteria",
    "protocols",
    "protocol_versions",
    "protocol_provenance_assessments",
    "runs",
    "run_assessments",
    "evidence_artifacts",
    "gate_results",
    "gate_result_supersessions",
    "comparisons",
    "comparison_supersessions",
    "ledger_links",
    "provenance_claims",
];

#[derive(Clone, Debug)]
pub struct RegistryPaths {
    pub workspace_root: PathBuf,
    pub database_path: PathBuf,
    pub chain_root: PathBuf,
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
            chain_root: workspace_root.join(DEFAULT_CHAIN_ROOT),
            workspace_root,
        }
    }

    pub fn with_database(mut self, database_path: impl Into<PathBuf>) -> Self {
        self.database_path = database_path.into();
        self
    }

    pub fn with_chain(mut self, chain_root: impl Into<PathBuf>) -> Self {
        self.chain_root = chain_root.into();
        self
    }
}

#[derive(Debug, Serialize)]
pub struct RebuildReport {
    pub schema_version: String,
    pub database_path: String,
    pub chain_generation: String,
    pub migration_kind: String,
    pub admission_records: usize,
    pub relation_counts: BTreeMap<String, usize>,
    pub missing_artifacts: usize,
    pub mismatched_artifacts: usize,
}

#[derive(Debug, Serialize)]
pub struct IntegrityReport {
    pub schema_version: String,
    pub projection_kind: String,
    pub chain_generation: String,
    pub migration_kind: String,
    pub integrity: String,
    pub foreign_key_violations: usize,
    pub migration_violations: usize,
    pub migration_violation_details: Vec<String>,
    pub relation_counts: BTreeMap<String, usize>,
    pub admission_chain_consistent: bool,
    pub admission_chain_mismatches: Vec<String>,
    pub history_violations: usize,
    pub history_violation_details: Vec<String>,
    pub path_violations: usize,
    pub path_violation_details: Vec<String>,
    pub provenance_violations: usize,
    pub provenance_violation_details: Vec<String>,
    pub ledger_source_mismatches: usize,
    pub ledger_source_mismatch_details: Vec<String>,
    pub protocol_config_mismatches: usize,
    pub protocol_config_mismatch_details: Vec<String>,
    pub missing_artifacts: usize,
    pub mismatched_artifacts: usize,
    pub artifact_mismatch_details: Vec<String>,
    pub artifact_observation_drift: usize,
}

impl IntegrityReport {
    pub fn passes(&self) -> bool {
        report_passes(self)
    }
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
    let chain = verify_chain(&paths.workspace_root, &paths.chain_root)?;
    if let Some(parent) = paths.database_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create database directory {}", parent.display()))?;
    }
    let (source_schema, migration_kind) = existing_projection_posture(&paths.database_path)?;
    let stage = stage_path(&paths.database_path)?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&stage)
        .with_context(|| format!("failed to reserve sibling projection {}", stage.display()))?;

    let build_result = (|| -> Result<()> {
        let mut connection = Connection::open(&stage)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "DELETE")?;
        connection.execute_batch(MIGRATION_V2)?;
        let transaction = connection.transaction()?;
        transaction.execute("INSERT INTO metadata VALUES ('schema_version', '2')", [])?;
        transaction.execute(
            "INSERT INTO metadata VALUES ('projection_kind', ?1)",
            [PROJECTION_KIND],
        )?;
        transaction.execute(
            "INSERT INTO metadata VALUES ('chain_generation', ?1)",
            [&chain.generation],
        )?;
        transaction.execute(
            "INSERT INTO migration_lineage VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                format!("migration-{}-to-v3", chain.generation),
                source_schema,
                SCHEMA_VERSION,
                migration_kind,
                chain.generation,
                chain
                    .entries
                    .last()
                    .map(|entry| entry.entry.admitted_at.as_str())
                    .unwrap_or("unknown")
            ],
        )?;

        let mut legacy = Vec::new();
        let mut v2 = Vec::new();
        for admission in &chain.entries {
            let description = record_description(&admission.bytes)?;
            insert_admission_metadata(&transaction, admission, &description)?;
            match admission.record_schema_version {
                1 => {
                    let parsed = serde_json::from_slice::<AdmissionRecord>(&admission.bytes)?;
                    if parsed.schema_version != 1 || parsed.description != description {
                        bail!(
                            "legacy admission {} header is internally inconsistent",
                            parsed.record_id
                        );
                    }
                    legacy.push(parsed);
                }
                2 => v2.push(serde_json::from_slice::<AdmissionV2>(&admission.bytes)?),
                version => bail!("unsupported governed record schema {version}"),
            }
        }

        for record in &legacy {
            insert_legacy_ledger_links(&transaction, record)?;
        }
        for record in &legacy {
            insert_legacy_record(&transaction, record, &legacy)?;
        }
        transaction.commit()?;
        connection.execute_batch(MIGRATION_V3)?;
        let transaction = connection.transaction()?;
        for record in &v2 {
            insert_v2_record(&transaction, record)?;
        }
        transaction.commit()?;
        Ok(())
    })();

    if let Err(error) = build_result {
        let _ = fs::remove_file(&stage);
        return Err(error)
            .context("failed to build sibling v3 projection; live database preserved");
    }

    let stage_paths = paths.clone().with_database(&stage);
    let inspection = match inspect(&stage_paths) {
        Ok(report) if report_passes(&report) => report,
        Ok(report) => {
            let _ = fs::remove_file(&stage);
            bail!(
                "sibling v3 projection failed validation (history={}, paths={}, provenance={}, ledger={}, config={}, artifacts={}); live database preserved",
                report.history_violations,
                report.path_violations,
                report.provenance_violations,
                report.ledger_source_mismatches,
                report.protocol_config_mismatches,
                report.mismatched_artifacts
            );
        }
        Err(error) => {
            let _ = fs::remove_file(&stage);
            return Err(error)
                .context("failed to inspect sibling v3 projection; live database preserved");
        }
    };
    atomic_replace(&stage, &paths.database_path)?;
    Ok(RebuildReport {
        schema_version: inspection.schema_version,
        database_path: paths.database_path.display().to_string(),
        chain_generation: chain.generation,
        migration_kind: migration_kind.to_owned(),
        admission_records: chain.entries.len(),
        relation_counts: inspection.relation_counts,
        missing_artifacts: inspection.missing_artifacts,
        mismatched_artifacts: inspection.mismatched_artifacts,
    })
}

pub fn inspect(paths: &RegistryPaths) -> Result<IntegrityReport> {
    let chain = verify_chain(&paths.workspace_root, &paths.chain_root)?;
    let connection =
        Connection::open_with_flags(&paths.database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .with_context(|| format!("failed to open {}", paths.database_path.display()))?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let foreign_key_violations: usize =
        connection.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
            row.get::<_, i64>(0).map(|value| value as usize)
        })?;
    let schema_version = metadata(&connection, "schema_version")?;
    let projection_kind = metadata(&connection, "projection_kind")?;
    let projected_generation = metadata(&connection, "chain_generation")?;
    let migration_kind: String = connection.query_row(
        "SELECT migration_kind FROM migration_lineage ORDER BY rowid DESC LIMIT 1",
        [],
        |row| row.get(0),
    )?;
    let relation_counts = relation_counts(&connection)?;
    let migration_violation_details =
        migration_violations(&connection, &schema_version, &projected_generation)?;
    let admission_chain_mismatches = projected_chain_mismatches(&connection, &chain)?;
    let history_violation_details = history_violations(&connection)?;
    let path_violation_details = path_violations(&connection)?;
    let provenance_violation_details = provenance_violations(&connection)?;
    let ledger_source_mismatch_details =
        tracked_ledger_mismatches(&connection, &paths.workspace_root)?;
    let protocol_config_mismatch_details =
        tracked_protocol_mismatches(&connection, &paths.workspace_root)?;
    let (missing_artifacts, mismatched_artifacts, artifact_mismatch_details) =
        artifact_posture(&connection, &paths.workspace_root)?;
    let mut chain_mismatches = admission_chain_mismatches;
    if projected_generation != chain.generation {
        chain_mismatches.push(format!(
            "projection generation {projected_generation} differs from governed HEAD {}",
            chain.generation
        ));
    }
    Ok(IntegrityReport {
        schema_version,
        projection_kind,
        chain_generation: projected_generation,
        migration_kind,
        integrity,
        foreign_key_violations,
        migration_violations: migration_violation_details.len(),
        migration_violation_details,
        relation_counts,
        admission_chain_consistent: chain_mismatches.is_empty(),
        admission_chain_mismatches: chain_mismatches,
        history_violations: history_violation_details.len(),
        history_violation_details,
        path_violations: path_violation_details.len(),
        path_violation_details,
        provenance_violations: provenance_violation_details.len(),
        provenance_violation_details,
        ledger_source_mismatches: ledger_source_mismatch_details.len(),
        ledger_source_mismatch_details,
        protocol_config_mismatches: protocol_config_mismatch_details.len(),
        protocol_config_mismatch_details,
        missing_artifacts,
        mismatched_artifacts,
        artifact_mismatch_details,
        // Availability is intentionally derived at check time in v2; no stale stored observation exists.
        artifact_observation_drift: 0,
    })
}

pub fn deterministic_logical_readback(database_path: &Path) -> Result<String> {
    let connection = Connection::open_with_flags(database_path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut result = BTreeMap::new();
    for table in DOMAIN_TABLES {
        let mut columns = Vec::new();
        let mut pragma = connection.prepare(&format!("PRAGMA table_info({table})"))?;
        let rows = pragma.query_map([], |row| row.get::<_, String>(1))?;
        for row in rows {
            columns.push(row?);
        }
        let order = columns.join(", ");
        let sql = format!(
            "SELECT json_object({}) FROM {table} ORDER BY {order}",
            json_pairs(&columns)
        );
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let values = rows
            .map(|row| Ok(serde_json::from_str::<Value>(&row?)?))
            .collect::<Result<Vec<_>>>()?;
        result.insert((*table).to_owned(), values);
    }
    Ok(serde_json::to_string(&result)?)
}

fn report_passes(report: &IntegrityReport) -> bool {
    report.schema_version == SCHEMA_VERSION
        && report.projection_kind == PROJECTION_KIND
        && report.integrity == "ok"
        && report.foreign_key_violations == 0
        && report.migration_violations == 0
        && report.admission_chain_consistent
        && report.history_violations == 0
        && report.path_violations == 0
        && report.provenance_violations == 0
        && report.ledger_source_mismatches == 0
        && report.protocol_config_mismatches == 0
        && report.mismatched_artifacts == 0
}

fn existing_projection_posture(path: &Path) -> Result<(&'static str, &'static str)> {
    let nonempty = fs::metadata(path)
        .map(|metadata| metadata.len() > 0)
        .unwrap_or(false);
    if !nonempty {
        return Ok(("none", "clean-v3"));
    }
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .with_context(|| format!("refusing non-SQLite live projection {}", path.display()))?;
    let has_metadata: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='metadata')",
        [],
        |row| row.get(0),
    )?;
    if !has_metadata {
        bail!("refusing to replace a nonempty database not owned by the Cintamani domain registry");
    }
    let schema: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key='schema_version'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    let kind: Option<String> = connection
        .query_row(
            "SELECT value FROM metadata WHERE key='projection_kind'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if kind.as_deref() != Some(PROJECTION_KIND)
        || !matches!(schema.as_deref(), Some("1" | "2" | "3"))
    {
        bail!(
            "refusing incompatible database ownership metadata (schema={schema:?}, projection={kind:?})"
        );
    }
    Ok(match schema.as_deref() {
        Some("1") => ("1", "owned-v1-upgrade"),
        Some("2") => ("2", "owned-v2-upgrade"),
        Some("3") => ("3", "owned-v3-rebuild"),
        _ => unreachable!(),
    })
}

fn stage_path(database: &Path) -> Result<PathBuf> {
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let name = database
        .file_name()
        .and_then(|name| name.to_str())
        .context("database path has no UTF-8 file name")?;
    Ok(database.with_file_name(format!(".{name}.stage-{}-{nonce}", std::process::id())))
}

#[cfg(windows)]
fn atomic_replace(stage: &Path, target: &Path) -> Result<()> {
    if !target.exists() {
        fs::rename(stage, target)?;
        return Ok(());
    }
    let mut target_wide = target.as_os_str().encode_wide().collect::<Vec<_>>();
    target_wide.push(0);
    let mut stage_wide = stage.as_os_str().encode_wide().collect::<Vec<_>>();
    stage_wide.push(0);
    let success = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            stage_wide.as_ptr(),
            std::ptr::null(),
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if success == 0 {
        bail!(
            "atomic ReplaceFileW failed: {}",
            std::io::Error::last_os_error()
        );
    }
    Ok(())
}

#[cfg(not(windows))]
fn atomic_replace(stage: &Path, target: &Path) -> Result<()> {
    fs::rename(stage, target).context("atomic projection rename failed")
}

fn record_description(bytes: &[u8]) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct Header {
        description: String,
    }
    Ok(serde_json::from_slice::<Header>(bytes)?.description)
}

fn insert_admission_metadata(
    transaction: &Transaction<'_>,
    admission: &VerifiedAdmission,
    description: &str,
) -> Result<()> {
    let entry = &admission.entry;
    transaction.execute(
        "INSERT INTO admissions VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            entry.record_id,
            i64::try_from(entry.sequence)
                .context("admission sequence exceeds SQLite integer range")?,
            admission.record_schema_version,
            entry.path,
            entry.content_sha256,
            entry.predecessor_entry_hash,
            entry.entry_hash,
            entry.admitted_at,
            entry.admitted_by,
            entry.authority_kind,
            entry.authority_ref,
            description,
        ],
    )?;
    Ok(())
}

fn insert_legacy_ledger_links(
    transaction: &Transaction<'_>,
    record: &AdmissionRecord,
) -> Result<()> {
    for row in &record.ledger_links {
        validate_relative_uri(&row.ledger_path)?;
        transaction.execute(
            "INSERT INTO ledger_links VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                row.ledger_link_id,
                row.ledger_number,
                row.ledger_title,
                row.ledger_path,
                row.ledger_sha256,
                row.relation,
                row.admitted_claim,
                record.record_id,
            ],
        )?;
    }
    Ok(())
}

fn insert_legacy_record(
    transaction: &Transaction<'_>,
    record: &AdmissionRecord,
    all_legacy: &[AdmissionRecord],
) -> Result<()> {
    let admission = record.record_id.as_str();
    for row in &record.theoretical_models {
        transaction.execute(
            "INSERT INTO theoretical_models VALUES (?1, ?2, ?3, ?4)",
            params![row.model_id, row.name, row.description, admission],
        )?;
        definition_provenance(
            transaction,
            admission,
            "theoretical_model_id",
            &row.model_id,
        )?;
        let (source, link) = taxonomy_evidence("model", &row.model_id);
        let assessment_id = format!("assessment-model-{}-r1", row.model_id);
        transaction.execute(
            "INSERT INTO theoretical_model_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7)",
            params![assessment_id, row.model_id, record.admitted_at, row.epistemic_status,
                "Migrated v1 status with its narrow normalized-model evidence source.",
                "Normalized executable model only.", source],
        )?;
        exact_provenance(
            transaction,
            source,
            link,
            "evidence",
            "theoretical_model_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.materials {
        transaction.execute(
            "INSERT INTO materials VALUES (?1, ?2, ?3, ?4)",
            params![row.material_id, row.name, row.description, admission],
        )?;
        definition_provenance(transaction, admission, "material_id", &row.material_id)?;
        let assessment_id = format!("assessment-material-{}-r1", row.material_id);
        transaction.execute(
            "INSERT INTO material_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![assessment_id, row.material_id, record.admitted_at, row.material_kind,
                row.epistemic_status, "Migrated v1 material boundary without adding evidence.",
                "Taxonomic classification only; no material/device validation.", admission],
        )?;
        exact_provenance(
            transaction,
            admission,
            None,
            "limitation",
            "material_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.physical_mechanisms {
        transaction.execute(
            "INSERT INTO physical_mechanisms VALUES (?1, ?2, ?3, ?4)",
            params![row.mechanism_id, row.name, row.description, admission],
        )?;
        definition_provenance(transaction, admission, "mechanism_id", &row.mechanism_id)?;
        let (source, link) = taxonomy_evidence("mechanism", &row.mechanism_id);
        let assessment_id = format!("assessment-mechanism-{}-r1", row.mechanism_id);
        transaction.execute(
            "INSERT INTO mechanism_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7)",
            params![assessment_id, row.mechanism_id, record.admitted_at, row.epistemic_status,
                "Migrated v1 normalized mechanism status.", "Implemented normalized Kerr term only.", source],
        )?;
        exact_provenance(
            transaction,
            source,
            link,
            "evidence",
            "mechanism_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.interfaces {
        transaction.execute(
            "INSERT INTO interfaces VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.interface_id,
                row.name,
                row.observation_kind,
                row.units,
                row.description,
                admission
            ],
        )?;
        definition_provenance(transaction, admission, "interface_id", &row.interface_id)?;
        let (source, link) = taxonomy_evidence("interface", &row.interface_id);
        let assessment_id = format!("assessment-interface-{}-r1", row.interface_id);
        transaction.execute(
            "INSERT INTO interface_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7)",
            params![assessment_id, row.interface_id, record.admitted_at, row.epistemic_status,
                "Migrated v1 implemented normalized interface status.",
                "Normalized observation interface only.", source],
        )?;
        exact_provenance(
            transaction,
            source,
            link,
            "evidence",
            "interface_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.typed_morphisms {
        let source_port = format!("port-{}-source", row.morphism_id);
        let target_port = format!("port-{}-target", row.morphism_id);
        for (port_id, suffix, port_type) in [
            (&source_port, "source", "modeled-state"),
            (&target_port, "target", "observation-interface"),
        ] {
            transaction.execute(
                "INSERT INTO process_ports VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    port_id,
                    format!("{} {suffix}", row.name),
                    port_type,
                    row.source_model_id,
                    row.material_id,
                    row.mechanism_id,
                    row.target_interface_id,
                    format!("v1-compatible {suffix} port for {}", row.morphism_id),
                    admission
                ],
            )?;
            definition_provenance(transaction, admission, "process_port_id", port_id)?;
        }
        transaction.execute(
            "INSERT INTO typed_morphisms VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                row.morphism_id,
                row.name,
                row.source_model_id,
                row.material_id,
                row.mechanism_id,
                row.target_interface_id,
                source_port,
                target_port,
                row.morphism_type,
                row.description,
                admission
            ],
        )?;
        definition_provenance(transaction, admission, "morphism_id", &row.morphism_id)?;
        let (source, link) = taxonomy_evidence("morphism", &row.morphism_id);
        let assessment_id = format!("assessment-morphism-{}-r1", row.morphism_id);
        transaction.execute(
            "INSERT INTO morphism_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7)",
            params![
                assessment_id,
                row.morphism_id,
                record.admitted_at,
                row.validation_status,
                "Migrated v1 normalized morphism status.",
                "Normalized model-to-observation map only.",
                source
            ],
        )?;
        exact_provenance(
            transaction,
            source,
            link,
            "evidence",
            "morphism_assessment_id",
            &assessment_id,
        )?;
        let path_id = format!("path-{}", row.morphism_id);
        transaction.execute(
            "INSERT INTO morphism_paths VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                path_id,
                format!("{} one-step path", row.name),
                row.source_model_id,
                row.material_id,
                row.mechanism_id,
                row.target_interface_id,
                source_port,
                target_port,
                "One-step compatibility path migrated from v1.",
                admission
            ],
        )?;
        transaction.execute(
            "INSERT INTO morphism_path_steps VALUES (?1, 1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                path_id,
                row.morphism_id,
                row.source_model_id,
                row.material_id,
                row.mechanism_id,
                row.target_interface_id,
                admission
            ],
        )?;
        definition_provenance(transaction, admission, "path_id", &path_id)?;
    }
    for row in &record.siege_cells {
        transaction.execute(
            "INSERT INTO siege_cells VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                row.cell_id,
                row.name,
                row.model_id,
                row.material_id,
                row.mechanism_id,
                row.interface_id,
                admission
            ],
        )?;
        definition_provenance(transaction, admission, "cell_id", &row.cell_id)?;
        transaction.execute(
            "INSERT INTO siege_cell_morphisms VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'primary', ?7)",
            params![
                row.cell_id,
                row.morphism_id,
                row.model_id,
                row.material_id,
                row.mechanism_id,
                row.interface_id,
                admission
            ],
        )?;
        let path_id = format!("path-{}", row.morphism_id);
        transaction.execute(
            "INSERT INTO siege_cell_paths VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'primary', ?7)",
            params![
                row.cell_id,
                path_id,
                row.model_id,
                row.material_id,
                row.mechanism_id,
                row.interface_id,
                admission
            ],
        )?;
        let (source, link) = taxonomy_evidence("cell", &row.cell_id);
        let assessment_id = format!("assessment-cell-{}-r1", row.cell_id);
        transaction.execute(
            "INSERT INTO siege_cell_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7)",
            params![assessment_id, row.cell_id, record.admitted_at, row.epistemic_status,
                "Migrated v1 normalized-cell status.", "Normalized model cell; no material/device claim.", source],
        )?;
        exact_provenance(
            transaction,
            source,
            link,
            "evidence",
            "cell_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.siege_cell_decisions {
        let status = if row.status == "advanced-local-lead" && row.revision == 1 {
            "local-lead-awaiting-critique"
        } else {
            row.status.as_str()
        };
        transaction.execute(
            "INSERT INTO siege_cell_decisions VALUES (?1, ?2, ?3, 'decision', ?4, ?5, ?6, ?7, ?8)",
            params![
                row.decision_id,
                row.cell_id,
                row.revision,
                row.decided_at,
                status,
                row.rationale,
                row.decision_scope,
                admission
            ],
        )?;
        let link = find_legacy_link(all_legacy, "cell", &row.cell_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "cell_decision_id",
            &row.decision_id,
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
        definition_provenance(transaction, admission, "parameter_id", &row.parameter_id)?;
    }
    for row in &record.parameter_regions {
        transaction.execute(
            "INSERT INTO parameter_regions VALUES (?1, ?2, ?3, ?4)",
            params![row.region_id, row.cell_id, row.name, admission],
        )?;
        definition_provenance(transaction, admission, "region_id", &row.region_id)?;
        let version_id = format!("{}-v1", row.region_id);
        transaction.execute(
            "INSERT INTO parameter_region_versions VALUES (?1, ?2, 1, 'definition', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![version_id, row.region_id, record.admitted_at, row.region_kind,
                bool_i64(row.predeclared), "Migrated exact v1 region definition.", row.decision_scope, admission],
        )?;
        let link = preferred_legacy_link(all_legacy, admission, &["protocol", "cell", "run"]);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "region_version_id",
            &version_id,
        )?;
    }
    for row in &record.parameter_region_values {
        transaction.execute(
            "INSERT INTO parameter_region_values VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                format!("{}-v1", row.region_id),
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
            "INSERT INTO conjectures VALUES (?1, ?2, ?3, ?4)",
            params![row.conjecture_id, row.cell_id, row.label, admission],
        )?;
        definition_provenance(transaction, admission, "conjecture_id", &row.conjecture_id)?;
        let version_id = conjecture_version_id(&row.conjecture_id, row.version);
        transaction.execute(
            "INSERT INTO conjecture_versions VALUES (?1, ?2, ?3, 'definition', ?4, ?5, ?6, ?7, ?8)",
            params![
                version_id,
                row.conjecture_id,
                row.version,
                record.admitted_at,
                row.statement,
                "Migrated pre-test v1 conjecture statement.",
                "Local normalized Kerr quadrature lead.",
                admission
            ],
        )?;
        let link = find_legacy_link(all_legacy, "conjecture", &row.conjecture_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "conjecture_version_id",
            &version_id,
        )?;
    }
    for row in &record.conjecture_dispositions {
        let version_id = current_conjecture_version_id(transaction, &row.conjecture_id)?;
        transaction.execute(
            "INSERT INTO conjecture_dispositions VALUES (?1, ?2, ?3, ?4, 'decision', ?5, ?6, ?7, ?8, ?9)",
            params![row.disposition_id, row.conjecture_id, version_id, row.revision, row.decided_at,
                row.status, row.rationale, row.decision_scope, admission],
        )?;
        let link = find_legacy_link(all_legacy, "conjecture", &row.conjecture_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "conjecture_disposition_id",
            &row.disposition_id,
        )?;
    }
    for row in &record.falsification_criteria {
        let version_id = current_conjecture_version_id(transaction, &row.conjecture_id)?;
        transaction.execute(
            "INSERT INTO falsification_criteria VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                row.criterion_id,
                version_id,
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
        let link = find_legacy_link(all_legacy, "conjecture", &row.conjecture_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "criterion_id",
            &row.criterion_id,
        )?;
    }
    for row in &record.protocols {
        transaction.execute(
            "INSERT INTO protocols VALUES (?1, ?2, ?3)",
            params![row.protocol_id, row.name, admission],
        )?;
        definition_provenance(transaction, admission, "protocol_id", &row.protocol_id)?;
        let version_id = protocol_version_id(&row.protocol_id, row.version);
        transaction.execute(
            "INSERT INTO protocol_versions VALUES (?1, ?2, ?3, 'definition', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![version_id, row.protocol_id, row.version, record.admitted_at, bool_i64(row.predeclared),
                row.seed_count, row.null_trials, row.null_quantile, "Migrated v1 protocol definition.",
                row.decision_scope, admission],
        )?;
        let link = find_legacy_link(all_legacy, "protocol", &row.protocol_id, admission)
            .or_else(|| preferred_legacy_link(all_legacy, admission, &["run"]));
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "protocol_version_id",
            &version_id,
        )?;
        if let Some(uri) = &row.config_uri {
            validate_relative_uri(uri)?;
        }
        let assessment_id = format!("assessment-{}-provenance-r1", version_id);
        let completeness = if row.config_hash_status == "unavailable" {
            "unavailable"
        } else {
            "recorded-verified"
        };
        transaction.execute(
            "INSERT INTO protocol_provenance_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![assessment_id, version_id, record.admitted_at, row.config_uri, row.config_sha256,
                completeness, "Migrated v1 config provenance exactly.", row.decision_scope, admission],
        )?;
        exact_provenance(
            transaction,
            admission,
            link,
            if link.is_some() {
                "evidence"
            } else {
                "limitation"
            },
            "protocol_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.runs {
        let version_id = current_protocol_version_id(transaction, &row.protocol_id)?;
        transaction.execute(
            "INSERT INTO runs VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                row.run_id,
                version_id,
                row.cell_id,
                row.code_commit,
                row.summary,
                admission
            ],
        )?;
        let link = find_legacy_link(all_legacy, "run", &row.run_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "run_id",
            &row.run_id,
        )?;
        let assessment_id = format!("assessment-run-{}-r1", row.run_id);
        transaction.execute(
            "INSERT INTO run_assessments VALUES (?1, ?2, 1, 'assessment', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                assessment_id,
                row.run_id,
                record.admitted_at,
                row.run_status,
                row.epistemic_status,
                "Migrated v1 run status.",
                "Exact v1 run evidence scope.",
                admission
            ],
        )?;
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "run_assessment_id",
            &assessment_id,
        )?;
    }
    for row in &record.evidence_artifacts {
        validate_relative_uri(&row.artifact_uri)?;
        transaction.execute(
            "INSERT INTO evidence_artifacts VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                row.artifact_id,
                row.run_id,
                row.artifact_kind,
                row.artifact_uri,
                row.expected_sha256,
                bool_i64(row.canonical_detail),
                row.detail_row_count.map(to_i64),
                row.description,
                admission
            ],
        )?;
        let link = find_legacy_link(all_legacy, "artifact", &row.artifact_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "artifact_id",
            &row.artifact_id,
        )?;
    }
    for row in &record.gate_results {
        transaction.execute(
            "INSERT INTO gate_results VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![row.gate_result_id, row.run_id, row.criterion_id, row.gate_name, row.evidence_polarity,
                bool_i64(row.passed), row.metric_value, row.metric_text, row.units, row.seed_pass_count,
                row.seed_required_count, row.decision_scope, row.limitation, admission],
        )?;
        let link = find_legacy_link(all_legacy, "gate", &row.gate_result_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "gate_result_id",
            &row.gate_result_id,
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
        let link = find_legacy_link(all_legacy, "comparison", &row.comparison_id, admission);
        exact_provenance(
            transaction,
            admission,
            link,
            "evidence",
            "comparison_id",
            &row.comparison_id,
        )?;
    }
    Ok(())
}

fn insert_v2_record(transaction: &Transaction<'_>, record: &AdmissionV2) -> Result<()> {
    if record.schema_version != 2 {
        bail!(
            "v2 admission {} has schema version {}",
            record.record_id,
            record.schema_version
        );
    }
    for change in &record.changes {
        if let Change::LedgerLink {
            ledger_link_id,
            ledger_number,
            ledger_title,
            ledger_path,
            ledger_sha256,
            relation,
            admitted_claim,
        } = change
        {
            validate_relative_uri(ledger_path)?;
            transaction.execute(
                "INSERT INTO ledger_links VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    ledger_link_id,
                    ledger_number,
                    ledger_title,
                    ledger_path,
                    ledger_sha256,
                    relation,
                    admitted_claim,
                    record.record_id
                ],
            )?;
        }
    }
    for change in &record.changes {
        if !matches!(
            change,
            Change::LedgerLink { .. } | Change::ProvenanceClaim { .. }
        ) {
            insert_v2_change(transaction, &record.record_id, change)?;
        }
    }
    for change in &record.changes {
        if let Change::ProvenanceClaim {
            provenance_id,
            provenance_kind,
            ledger_link_id,
            claim_text,
            target,
        } = change
        {
            insert_typed_provenance(
                transaction,
                provenance_id,
                &record.record_id,
                ledger_link_id.as_deref(),
                provenance_kind,
                claim_text,
                target,
            )?;
        }
    }
    Ok(())
}

fn insert_v2_change(transaction: &Transaction<'_>, admission: &str, change: &Change) -> Result<()> {
    insert_v2_change_impl(transaction, admission, change)
}

fn metadata(connection: &Connection, key: &str) -> Result<String> {
    Ok(
        connection.query_row("SELECT value FROM metadata WHERE key=?1", [key], |row| {
            row.get(0)
        })?,
    )
}

fn projected_chain_mismatches(
    connection: &Connection,
    chain: &crate::VerifiedChain,
) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT admission_sequence, admission_id, source_path, source_sha256, predecessor_entry_hash,
                entry_hash, admitted_at, admitted_by, authority_kind, authority_ref
         FROM admissions ORDER BY admission_sequence",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, String>(5)?,
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?,
            row.get::<_, String>(8)?,
            row.get::<_, String>(9)?,
        ))
    })?;
    let projected = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let mut errors = Vec::new();
    if projected.len() != chain.entries.len() {
        errors.push(format!(
            "projection has {} admissions; chain has {}",
            projected.len(),
            chain.entries.len()
        ));
    }
    for (index, admission) in chain.entries.iter().enumerate() {
        let Some(row) = projected.get(index) else {
            break;
        };
        let entry = &admission.entry;
        if row
            != &(
                i64::try_from(entry.sequence).unwrap_or(i64::MAX),
                entry.record_id.clone(),
                entry.path.clone(),
                entry.content_sha256.clone(),
                entry.predecessor_entry_hash.clone(),
                entry.entry_hash.clone(),
                entry.admitted_at.clone(),
                entry.admitted_by.clone(),
                entry.authority_kind.clone(),
                entry.authority_ref.clone(),
            )
        {
            errors.push(format!(
                "projected admission {} differs from governed chain entry",
                entry.record_id
            ));
        }
    }
    Ok(errors)
}

fn relation_counts(connection: &Connection) -> Result<BTreeMap<String, usize>> {
    let mut counts = BTreeMap::new();
    for table in DOMAIN_TABLES {
        let count: i64 =
            connection.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })?;
        counts.insert((*table).to_owned(), count as usize);
    }
    Ok(counts)
}

fn migration_violations(
    connection: &Connection,
    schema_version: &str,
    chain_generation: &str,
) -> Result<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT source_schema_version,target_schema_version,migration_kind,chain_head
         FROM migration_lineage ORDER BY migration_id",
    )?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut errors = Vec::new();
    if rows.len() != 1 {
        errors.push(format!(
            "migration lineage must contain exactly one rebuild event, found {}",
            rows.len()
        ));
    }
    for (source, target, kind, head) in rows {
        if target != schema_version || target != SCHEMA_VERSION || head != chain_generation {
            errors.push(
                "migration target schema or chain head differs from projection metadata".to_owned(),
            );
        }
        let valid = matches!(
            (source.as_str(), kind.as_str()),
            ("none", "clean-v3")
                | ("1", "owned-v1-upgrade")
                | ("2", "owned-v2-upgrade")
                | ("3", "owned-v3-rebuild")
        );
        if !valid {
            errors.push(format!(
                "invalid migration source/kind classification: {source}/{kind}"
            ));
        }
    }
    let dimension_view_present: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master
         WHERE type='view' AND name='siege_space_dimensions')",
        [],
        |row| row.get(0),
    )?;
    if dimension_view_present != 1 {
        errors.push(
            "schema-3 projection is missing siege_space_dimensions; rebuild required".to_owned(),
        );
    }
    Ok(errors)
}

fn history_violations(connection: &Connection) -> Result<Vec<String>> {
    let mut errors = Vec::new();
    for family in history_families() {
        let sql = format!(
            "SELECT parent_id, MIN(revision), MAX(revision), COUNT(*) FROM (
                SELECT {parent} AS parent_id, revision FROM {table}
             ) GROUP BY parent_id HAVING MIN(revision) != 1 OR MAX(revision) != COUNT(*)",
            parent = family.parent_column,
            table = family.table
        );
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            errors.push(format!(
                "{} history for {} is not contiguous from revision 1",
                family.table, row?
            ));
        }
        let source_order_sql = format!(
            "SELECT parent_id,revision FROM (
                SELECT h.{parent} parent_id,h.revision,a.admission_sequence,
                       LAG(a.admission_sequence) OVER (
                           PARTITION BY h.{parent} ORDER BY h.revision) previous_sequence
                FROM {table} h JOIN admissions a ON a.admission_id=h.source_admission_id
             ) WHERE previous_sequence IS NOT NULL AND admission_sequence<=previous_sequence",
            parent = family.parent_column,
            table = family.table
        );
        let mut source_order = connection.prepare(&source_order_sql)?;
        let rows = source_order.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
        })?;
        for row in rows {
            let (parent, revision) = row?;
            errors.push(format!(
                "{} {} revision {} is not admitted after its predecessor",
                family.table, parent, revision
            ));
        }
        if let Some(identity_table) = family.identity_table {
            let sql = format!(
                "SELECT i.{id} FROM {identity_table} i WHERE NOT EXISTS (
                    SELECT 1 FROM {table} h WHERE h.{parent} = i.{id}
                 )",
                id = family.identity_column,
                table = family.table,
                parent = family.parent_column
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
            for row in rows {
                errors.push(format!(
                    "{} {} has no {} history",
                    identity_table, row?, family.table
                ));
            }
        }
        let sql = format!(
            "SELECT {parent}, revision, event_kind, {status} FROM {table} ORDER BY {parent}, revision",
            parent = family.parent_column,
            status = family.status_column,
            table = family.table
        );
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, u32>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?;
        let mut previous: Option<(String, String)> = None;
        for row in rows {
            let (parent, revision, event_kind, status) = row?;
            if revision > 1
                && matches!(
                    family.table,
                    "parameter_region_versions"
                        | "problem_versions"
                        | "conjecture_versions"
                        | "protocol_versions"
                )
                && event_kind == "definition"
            {
                errors.push(format!(
                    "{} {} revision {} must declare correction or supersession",
                    family.table, parent, revision
                ));
            }
            if let Some((previous_parent, previous_status)) = &previous
                && previous_parent == &parent
                && status != *previous_status
                && !legal_transition(family.table, previous_status, &status)
                && !matches!(event_kind.as_str(), "correction" | "supersession")
            {
                errors.push(format!(
                    "{} {} revision {} makes illegal transition {} -> {} without correction/supersession",
                    family.table, parent, revision, previous_status, status
                ));
            }
            previous = Some((parent, status));
        }
    }
    errors.extend(supersession_violations(connection)?);
    Ok(errors)
}

struct HistoryFamily {
    table: &'static str,
    parent_column: &'static str,
    status_column: &'static str,
    identity_table: Option<&'static str>,
    identity_column: &'static str,
}

fn history_families() -> Vec<HistoryFamily> {
    vec![
        HistoryFamily {
            table: "theoretical_model_assessments",
            parent_column: "model_id",
            status_column: "epistemic_status",
            identity_table: Some("theoretical_models"),
            identity_column: "model_id",
        },
        HistoryFamily {
            table: "material_assessments",
            parent_column: "material_id",
            status_column: "epistemic_status",
            identity_table: Some("materials"),
            identity_column: "material_id",
        },
        HistoryFamily {
            table: "mechanism_assessments",
            parent_column: "mechanism_id",
            status_column: "epistemic_status",
            identity_table: Some("physical_mechanisms"),
            identity_column: "mechanism_id",
        },
        HistoryFamily {
            table: "interface_assessments",
            parent_column: "interface_id",
            status_column: "epistemic_status",
            identity_table: Some("interfaces"),
            identity_column: "interface_id",
        },
        HistoryFamily {
            table: "morphism_assessments",
            parent_column: "morphism_id",
            status_column: "validation_status",
            identity_table: Some("typed_morphisms"),
            identity_column: "morphism_id",
        },
        HistoryFamily {
            table: "siege_cell_assessments",
            parent_column: "cell_id",
            status_column: "epistemic_status",
            identity_table: Some("siege_cells"),
            identity_column: "cell_id",
        },
        HistoryFamily {
            table: "siege_cell_decisions",
            parent_column: "cell_id",
            status_column: "status",
            identity_table: Some("siege_cells"),
            identity_column: "cell_id",
        },
        HistoryFamily {
            table: "parameter_region_versions",
            parent_column: "region_id",
            status_column: "region_kind",
            identity_table: Some("parameter_regions"),
            identity_column: "region_id",
        },
        HistoryFamily {
            table: "problem_versions",
            parent_column: "problem_id",
            status_column: "event_kind",
            identity_table: Some("problems"),
            identity_column: "problem_id",
        },
        HistoryFamily {
            table: "conjecture_versions",
            parent_column: "conjecture_id",
            status_column: "event_kind",
            identity_table: Some("conjectures"),
            identity_column: "conjecture_id",
        },
        HistoryFamily {
            table: "conjecture_dispositions",
            parent_column: "conjecture_id",
            status_column: "status",
            identity_table: Some("conjectures"),
            identity_column: "conjecture_id",
        },
        HistoryFamily {
            table: "protocol_versions",
            parent_column: "protocol_id",
            status_column: "event_kind",
            identity_table: Some("protocols"),
            identity_column: "protocol_id",
        },
        HistoryFamily {
            table: "protocol_provenance_assessments",
            parent_column: "protocol_version_id",
            status_column: "completeness_status",
            identity_table: Some("protocol_versions"),
            identity_column: "protocol_version_id",
        },
        HistoryFamily {
            table: "run_assessments",
            parent_column: "run_id",
            status_column: "operational_status",
            identity_table: Some("runs"),
            identity_column: "run_id",
        },
    ]
}

fn legal_transition(table: &str, from: &str, to: &str) -> bool {
    if from == to {
        return true;
    }
    match table {
        "theoretical_model_assessments" => matches!(
            (from, to),
            (
                "unspecified",
                "candidate" | "implemented-normalized-model" | "rejected"
            ) | ("candidate", "implemented-normalized-model" | "rejected")
                | ("implemented-normalized-model", "rejected")
        ),
        "material_assessments" => matches!(
            (from, to),
            (
                "abstract-placeholder",
                "not-material-instantiated" | "rejected"
            ) | ("not-material-instantiated", "rejected")
                | (
                    "unvalidated-candidate",
                    "validated-device-evidence" | "rejected"
                )
                | ("validated-device-evidence", "rejected")
        ),
        "mechanism_assessments" => matches!(
            (from, to),
            (
                "unimplemented" | "candidate",
                "implemented-normalized-model" | "rejected"
            ) | ("implemented-normalized-model", "rejected")
        ),
        "interface_assessments" => matches!(
            (from, to),
            (
                "unimplemented" | "candidate",
                "implemented-normalized-interface" | "rejected"
            ) | ("implemented-normalized-interface", "rejected")
        ),
        "morphism_assessments" => matches!(
            (from, to),
            (
                "candidate-unvalidated",
                "implemented-normalized" | "validated-device" | "rejected"
            ) | ("implemented-normalized", "validated-device" | "rejected")
                | ("validated-device", "rejected")
        ),
        "siege_cell_assessments" => matches!(
            (from, to),
            (
                "normalized-model-only",
                "candidate-physical" | "validated-device" | "refuted"
            ) | ("candidate-physical", "validated-device" | "refuted")
                | ("validated-device", "refuted")
        ),
        "siege_cell_decisions" => matches!(
            (from, to),
            (
                "conjectured",
                "tested-local"
                    | "local-lead-awaiting-critique"
                    | "advanced-local-lead"
                    | "deferred"
                    | "rejected"
            ) | (
                "tested-local",
                "local-lead-awaiting-critique" | "advanced-local-lead" | "deferred" | "rejected"
            ) | (
                "local-lead-awaiting-critique",
                "tested-local" | "advanced-local-lead" | "deferred" | "rejected"
            ) | ("advanced-local-lead", "deferred" | "rejected")
        ),
        "parameter_region_versions" => matches!(
            (from, to),
            ("candidate-region", "bounded-region" | "frozen-singleton")
                | ("bounded-region", "frozen-singleton")
        ),
        "conjecture_dispositions" => matches!(
            (from, to),
            (
                "open",
                "survived-local-gate" | "falsified" | "deferred" | "abandoned"
            ) | (
                "survived-local-gate",
                "falsified" | "deferred" | "abandoned"
            )
        ),
        "protocol_provenance_assessments" => matches!(
            (from, to),
            ("unavailable", "recorded-unverified" | "recorded-verified")
                | ("recorded-unverified", "recorded-verified")
        ),
        "run_assessments" => matches!((from, to), ("partial", "completed" | "failed")),
        "problem_versions" | "conjecture_versions" | "protocol_versions" => matches!(
            (from, to),
            ("definition", "correction" | "supersession") | ("correction", "supersession")
        ),
        _ => false,
    }
}

fn supersession_violations(connection: &Connection) -> Result<Vec<String>> {
    let mut errors = Vec::new();
    let invalid_gates: i64 = connection.query_row(
        "SELECT COUNT(*) FROM gate_result_supersessions s
         JOIN gate_results p ON p.gate_result_id=s.prior_gate_result_id
         JOIN gate_results r ON r.gate_result_id=s.replacement_gate_result_id
         WHERE p.run_id!=r.run_id OR p.gate_name!=r.gate_name",
        [],
        |row| row.get(0),
    )?;
    if invalid_gates > 0 {
        errors.push(format!(
            "{invalid_gates} gate supersession(s) change run or gate identity"
        ));
    }
    let invalid_comparisons: i64 = connection.query_row(
        "SELECT COUNT(*) FROM comparison_supersessions s
         JOIN comparisons p ON p.comparison_id=s.prior_comparison_id
         JOIN comparisons r ON r.comparison_id=s.replacement_comparison_id
         WHERE p.run_id!=r.run_id OR p.control_relationship!=r.control_relationship OR p.metric!=r.metric",
        [],
        |row| row.get(0),
    )?;
    if invalid_comparisons > 0 {
        errors.push(format!(
            "{invalid_comparisons} comparison supersession(s) change comparison identity"
        ));
    }
    for (table, prior, replacement) in [
        (
            "gate_result_supersessions",
            "prior_gate_result_id",
            "replacement_gate_result_id",
        ),
        (
            "comparison_supersessions",
            "prior_comparison_id",
            "replacement_comparison_id",
        ),
    ] {
        let sql = format!(
            "WITH RECURSIVE walk(start,node) AS (
                SELECT {prior},{replacement} FROM {table}
                UNION
                SELECT walk.start,s.{replacement} FROM walk JOIN {table} s ON s.{prior}=walk.node
             ) SELECT COUNT(*) FROM walk WHERE start=node"
        );
        let cycles: i64 = connection.query_row(&sql, [], |row| row.get(0))?;
        if cycles > 0 {
            errors.push(format!("{table} contains a supersession cycle"));
        }
    }
    Ok(errors)
}

fn path_violations(connection: &Connection) -> Result<Vec<String>> {
    let mut errors = Vec::new();
    let mut paths = connection.prepare(
        "SELECT path_id, source_port_id, target_port_id FROM morphism_paths ORDER BY path_id",
    )?;
    let rows = paths.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (path_id, expected_source, expected_target) = row?;
        let mut statement = connection.prepare(
            "SELECT s.position, m.source_port_id, m.target_port_id FROM morphism_path_steps s
             JOIN typed_morphisms m ON m.morphism_id=s.morphism_id
             WHERE s.path_id=?1 ORDER BY s.position",
        )?;
        let steps = statement
            .query_map([&path_id], |row| {
                Ok((
                    row.get::<_, u32>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if steps.is_empty() {
            errors.push(format!("path {path_id} has no steps"));
            continue;
        }
        if steps[0].1 != expected_source
            || steps.last().is_some_and(|step| step.2 != expected_target)
        {
            errors.push(format!("path {path_id} first/last endpoint mismatch"));
        }
        for (index, step) in steps.iter().enumerate() {
            if step.0 != index as u32 + 1 {
                errors.push(format!("path {path_id} step positions are not contiguous"));
            }
            if index > 0 && steps[index - 1].2 != step.1 {
                errors.push(format!(
                    "path {path_id} step {} is not composable with its predecessor",
                    step.0
                ));
            }
        }
    }
    Ok(errors)
}

fn provenance_violations(connection: &Connection) -> Result<Vec<String>> {
    let targets = [
        (
            "theoretical_models",
            "model_id",
            "theoretical_model_id",
            "0",
        ),
        (
            "theoretical_model_assessments",
            "assessment_id",
            "theoretical_model_assessment_id",
            "t.epistemic_status='implemented-normalized-model'",
        ),
        ("materials", "material_id", "material_id", "0"),
        (
            "material_assessments",
            "assessment_id",
            "material_assessment_id",
            "t.epistemic_status='validated-device-evidence'",
        ),
        ("physical_mechanisms", "mechanism_id", "mechanism_id", "0"),
        (
            "mechanism_assessments",
            "assessment_id",
            "mechanism_assessment_id",
            "t.epistemic_status='implemented-normalized-model'",
        ),
        ("interfaces", "interface_id", "interface_id", "0"),
        (
            "interface_assessments",
            "assessment_id",
            "interface_assessment_id",
            "t.epistemic_status='implemented-normalized-interface'",
        ),
        ("process_ports", "port_id", "process_port_id", "0"),
        ("typed_morphisms", "morphism_id", "morphism_id", "0"),
        (
            "morphism_assessments",
            "assessment_id",
            "morphism_assessment_id",
            "t.validation_status IN ('implemented-normalized','validated-device')",
        ),
        ("morphism_paths", "path_id", "path_id", "0"),
        ("siege_cells", "cell_id", "cell_id", "0"),
        (
            "siege_cell_assessments",
            "assessment_id",
            "cell_assessment_id",
            "t.epistemic_status IN ('normalized-model-only','validated-device')",
        ),
        (
            "siege_cell_decisions",
            "decision_id",
            "cell_decision_id",
            "1",
        ),
        ("parameter_definitions", "parameter_id", "parameter_id", "0"),
        ("parameter_regions", "region_id", "region_id", "0"),
        (
            "parameter_region_versions",
            "region_version_id",
            "region_version_id",
            "t.predeclared=1",
        ),
        ("problems", "problem_id", "problem_id", "0"),
        (
            "problem_versions",
            "problem_version_id",
            "problem_version_id",
            "0",
        ),
        ("conjectures", "conjecture_id", "conjecture_id", "0"),
        (
            "conjecture_versions",
            "conjecture_version_id",
            "conjecture_version_id",
            "EXISTS (SELECT 1 FROM conjecture_dispositions d
                      WHERE d.conjecture_version_id=t.conjecture_version_id AND d.status!='open')",
        ),
        (
            "conjecture_framings",
            "framing_id",
            "conjecture_framing_id",
            "0",
        ),
        (
            "conjecture_dispositions",
            "disposition_id",
            "conjecture_disposition_id",
            "t.status!='open'",
        ),
        (
            "falsification_criteria",
            "criterion_id",
            "criterion_id",
            "1",
        ),
        ("protocols", "protocol_id", "protocol_id", "0"),
        (
            "protocol_versions",
            "protocol_version_id",
            "protocol_version_id",
            "t.predeclared=1",
        ),
        (
            "protocol_provenance_assessments",
            "assessment_id",
            "protocol_assessment_id",
            "t.completeness_status='recorded-verified'",
        ),
        ("runs", "run_id", "run_id", "1"),
        ("run_assessments", "assessment_id", "run_assessment_id", "1"),
        ("evidence_artifacts", "artifact_id", "artifact_id", "1"),
        ("gate_results", "gate_result_id", "gate_result_id", "1"),
        (
            "gate_result_supersessions",
            "supersession_id",
            "gate_supersession_id",
            "1",
        ),
        ("comparisons", "comparison_id", "comparison_id", "1"),
        (
            "comparison_supersessions",
            "supersession_id",
            "comparison_supersession_id",
            "1",
        ),
    ];
    let mut errors = Vec::new();
    for (table, id, target, evidence_predicate) in targets {
        let sql = format!(
            "SELECT t.{id} FROM {table} t WHERE NOT EXISTS (
                SELECT 1 FROM provenance_claims p
                LEFT JOIN ledger_links l ON l.ledger_link_id=p.ledger_link_id
                WHERE p.{target}=t.{id} AND p.source_admission_id=t.source_admission_id
                  AND (p.ledger_link_id IS NULL OR l.source_admission_id=t.source_admission_id)
                  AND (NOT ({evidence_predicate}) OR
                       (p.ledger_link_id IS NOT NULL AND p.provenance_kind='evidence'))
             )"
        );
        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        for row in rows {
            errors.push(format!(
                "{table} {} lacks exact same-admission typed provenance",
                row?
            ));
        }
    }
    Ok(errors)
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
        "SELECT a.assessment_id, a.config_uri, a.config_sha256, a.completeness_status
         FROM protocol_provenance_assessments a
         WHERE a.revision=(SELECT MAX(x.revision) FROM protocol_provenance_assessments x
                           WHERE x.protocol_version_id=a.protocol_version_id)
           AND a.config_uri IS NOT NULL ORDER BY a.assessment_id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
        ))
    })?;
    let mut mismatches = Vec::new();
    for row in rows {
        let (id, uri, expected, completeness) = row?;
        if let Some(detail) = tracked_file_mismatch(workspace_root, &uri, &expected) {
            mismatches.push(format!("protocol assessment {id}: {detail}"));
        } else if completeness != "recorded-verified" {
            mismatches.push(format!(
                "protocol assessment {id}: present config is not classified recorded-verified"
            ));
        }
    }
    Ok(mismatches)
}

fn artifact_posture(
    connection: &Connection,
    workspace_root: &Path,
) -> Result<(usize, usize, Vec<String>)> {
    let mut missing = 0;
    let mut mismatched = 0;
    let mut details = Vec::new();
    let mut statement = connection.prepare("SELECT artifact_id, artifact_uri, expected_sha256 FROM evidence_artifacts ORDER BY artifact_id")?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
        ))
    })?;
    for row in rows {
        let (id, uri, expected) = row?;
        validate_relative_uri(&uri)?;
        let path = workspace_root.join(&uri);
        if !path.is_file() {
            missing += 1;
        } else {
            let observed = sha256_file(&path)?;
            if !observed.eq_ignore_ascii_case(&expected) {
                mismatched += 1;
                details.push(format!(
                    "artifact {id}: expected {expected}, observed {observed} at {uri}"
                ));
            }
        }
    }
    Ok((missing, mismatched, details))
}

fn tracked_file_mismatch(workspace_root: &Path, uri: &str, expected: &str) -> Option<String> {
    if let Err(error) = validate_relative_uri(uri) {
        return Some(error.to_string());
    }
    match fs::read(workspace_root.join(uri)) {
        Ok(bytes) => {
            let observed = sha256_bytes(&bytes);
            (!observed.eq_ignore_ascii_case(expected)).then(|| {
                format!("hash mismatch at {uri}: expected {expected}, observed {observed}")
            })
        }
        Err(error) => Some(format!("source missing or unreadable at {uri}: {error}")),
    }
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
        bail!("URI must be a workspace-relative path without parent traversal: {uri}");
    }
    Ok(())
}

fn taxonomy_evidence(kind: &str, id: &str) -> (&'static str, Option<&'static str>) {
    match (kind, id) {
        ("interface", "bus-mode-coherent-quadrature")
        | ("morphism", "morphism-kerr-to-quadrature")
        | ("cell", "cell-kerr-abstract-quadrature") => {
            ("admission-ledger-13", Some("link-l13-quadrature-cell"))
        }
        ("interface", _) | ("morphism", _) | ("cell", _) => {
            ("admission-ledger-12", Some("link-l12-cell"))
        }
        ("model", _) | ("mechanism", _) => ("admission-ledger-12", Some("link-l12-run")),
        _ => ("admission-domain-taxonomy-v1", None),
    }
}

fn find_legacy_link<'a>(
    records: &'a [AdmissionRecord],
    kind: &str,
    id: &str,
    admission: &str,
) -> Option<&'a str> {
    records
        .iter()
        .filter(|record| record.record_id == admission)
        .flat_map(|record| &record.ledger_links)
        .find(|link| legacy_link_targets(link, kind, id))
        .map(|link| link.ledger_link_id.as_str())
}

fn preferred_legacy_link<'a>(
    records: &'a [AdmissionRecord],
    admission: &str,
    kinds: &[&str],
) -> Option<&'a str> {
    let links = records
        .iter()
        .find(|record| record.record_id == admission)
        .map(|record| &record.ledger_links)?;
    for kind in kinds {
        if let Some(link) = links.iter().find(|link| legacy_link_has_kind(link, kind)) {
            return Some(&link.ledger_link_id);
        }
    }
    None
}

fn legacy_link_targets(link: &LedgerLink, kind: &str, id: &str) -> bool {
    match kind {
        "run" => link.run_id.as_deref() == Some(id),
        "cell" => link.cell_id.as_deref() == Some(id),
        "conjecture" => link.conjecture_id.as_deref() == Some(id),
        "protocol" => link.protocol_id.as_deref() == Some(id),
        "artifact" => link.artifact_id.as_deref() == Some(id),
        "gate" => link.gate_result_id.as_deref() == Some(id),
        "comparison" => link.comparison_id.as_deref() == Some(id),
        _ => false,
    }
}

fn legacy_link_has_kind(link: &LedgerLink, kind: &str) -> bool {
    match kind {
        "run" => link.run_id.is_some(),
        "cell" => link.cell_id.is_some(),
        "conjecture" => link.conjecture_id.is_some(),
        "protocol" => link.protocol_id.is_some(),
        "artifact" => link.artifact_id.is_some(),
        "gate" => link.gate_result_id.is_some(),
        "comparison" => link.comparison_id.is_some(),
        _ => false,
    }
}

fn definition_provenance(
    transaction: &Transaction<'_>,
    admission: &str,
    target: &str,
    id: &str,
) -> Result<()> {
    exact_provenance(transaction, admission, None, "definition", target, id)
}

fn exact_provenance(
    transaction: &Transaction<'_>,
    admission: &str,
    ledger: Option<&str>,
    kind: &str,
    target: &str,
    id: &str,
) -> Result<()> {
    let allowed: BTreeSet<&str> = provenance_target_columns().into_iter().collect();
    if !allowed.contains(target) {
        bail!("unsupported typed provenance target {target}");
    }
    let sql = format!(
        "INSERT INTO provenance_claims (provenance_id, provenance_kind, source_admission_id,
         ledger_link_id, claim_text, {target}) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    );
    transaction.execute(
        &sql,
        params![
            format!("provenance-{target}-{id}"),
            kind,
            admission,
            ledger,
            format!("Exact migrated provenance for {target} {id}."),
            id
        ],
    )?;
    Ok(())
}

fn insert_typed_provenance(
    transaction: &Transaction<'_>,
    provenance_id: &str,
    admission: &str,
    ledger: Option<&str>,
    kind: &str,
    claim: &str,
    target: &ProvenanceTarget,
) -> Result<()> {
    let (column, id) = provenance_target(target);
    let sql = format!(
        "INSERT INTO provenance_claims (provenance_id, provenance_kind, source_admission_id,
         ledger_link_id, claim_text, {column}) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
    );
    transaction.execute(
        &sql,
        params![provenance_id, kind, admission, ledger, claim, id],
    )?;
    Ok(())
}

fn provenance_target(target: &ProvenanceTarget) -> (&'static str, &str) {
    match target {
        ProvenanceTarget::TheoreticalModel(id) => ("theoretical_model_id", id),
        ProvenanceTarget::TheoreticalModelAssessment(id) => ("theoretical_model_assessment_id", id),
        ProvenanceTarget::Material(id) => ("material_id", id),
        ProvenanceTarget::MaterialAssessment(id) => ("material_assessment_id", id),
        ProvenanceTarget::Mechanism(id) => ("mechanism_id", id),
        ProvenanceTarget::MechanismAssessment(id) => ("mechanism_assessment_id", id),
        ProvenanceTarget::Interface(id) => ("interface_id", id),
        ProvenanceTarget::InterfaceAssessment(id) => ("interface_assessment_id", id),
        ProvenanceTarget::ProcessPort(id) => ("process_port_id", id),
        ProvenanceTarget::Morphism(id) => ("morphism_id", id),
        ProvenanceTarget::MorphismAssessment(id) => ("morphism_assessment_id", id),
        ProvenanceTarget::Path(id) => ("path_id", id),
        ProvenanceTarget::Cell(id) => ("cell_id", id),
        ProvenanceTarget::CellAssessment(id) => ("cell_assessment_id", id),
        ProvenanceTarget::CellDecision(id) => ("cell_decision_id", id),
        ProvenanceTarget::Parameter(id) => ("parameter_id", id),
        ProvenanceTarget::Region(id) => ("region_id", id),
        ProvenanceTarget::RegionVersion(id) => ("region_version_id", id),
        ProvenanceTarget::Problem(id) => ("problem_id", id),
        ProvenanceTarget::ProblemVersion(id) => ("problem_version_id", id),
        ProvenanceTarget::Conjecture(id) => ("conjecture_id", id),
        ProvenanceTarget::ConjectureVersion(id) => ("conjecture_version_id", id),
        ProvenanceTarget::ConjectureFraming(id) => ("conjecture_framing_id", id),
        ProvenanceTarget::ConjectureDisposition(id) => ("conjecture_disposition_id", id),
        ProvenanceTarget::Criterion(id) => ("criterion_id", id),
        ProvenanceTarget::Protocol(id) => ("protocol_id", id),
        ProvenanceTarget::ProtocolVersion(id) => ("protocol_version_id", id),
        ProvenanceTarget::ProtocolAssessment(id) => ("protocol_assessment_id", id),
        ProvenanceTarget::Run(id) => ("run_id", id),
        ProvenanceTarget::RunAssessment(id) => ("run_assessment_id", id),
        ProvenanceTarget::Artifact(id) => ("artifact_id", id),
        ProvenanceTarget::GateResult(id) => ("gate_result_id", id),
        ProvenanceTarget::GateSupersession(id) => ("gate_supersession_id", id),
        ProvenanceTarget::Comparison(id) => ("comparison_id", id),
        ProvenanceTarget::ComparisonSupersession(id) => ("comparison_supersession_id", id),
    }
}

fn provenance_target_columns() -> Vec<&'static str> {
    vec![
        "theoretical_model_id",
        "theoretical_model_assessment_id",
        "material_id",
        "material_assessment_id",
        "mechanism_id",
        "mechanism_assessment_id",
        "interface_id",
        "interface_assessment_id",
        "process_port_id",
        "morphism_id",
        "morphism_assessment_id",
        "path_id",
        "cell_id",
        "cell_assessment_id",
        "cell_decision_id",
        "parameter_id",
        "region_id",
        "region_version_id",
        "problem_id",
        "problem_version_id",
        "conjecture_id",
        "conjecture_version_id",
        "conjecture_framing_id",
        "conjecture_disposition_id",
        "criterion_id",
        "protocol_id",
        "protocol_version_id",
        "protocol_assessment_id",
        "run_id",
        "run_assessment_id",
        "artifact_id",
        "gate_result_id",
        "gate_supersession_id",
        "comparison_id",
        "comparison_supersession_id",
    ]
}

fn current_conjecture_version_id(
    transaction: &Transaction<'_>,
    conjecture_id: &str,
) -> Result<String> {
    Ok(transaction.query_row("SELECT conjecture_version_id FROM conjecture_versions WHERE conjecture_id=?1 ORDER BY revision DESC LIMIT 1",
        [conjecture_id], |row| row.get(0))?)
}

fn current_protocol_version_id(transaction: &Transaction<'_>, protocol_id: &str) -> Result<String> {
    Ok(transaction.query_row("SELECT protocol_version_id FROM protocol_versions WHERE protocol_id=?1 ORDER BY revision DESC LIMIT 1",
        [protocol_id], |row| row.get(0))?)
}

fn conjecture_version_id(id: &str, version: u32) -> String {
    format!("{id}-v{version}")
}
fn protocol_version_id(id: &str, version: u32) -> String {
    format!("{id}-v{version}")
}
fn bool_i64(value: bool) -> i64 {
    if value { 1 } else { 0 }
}
fn to_i64(value: u64) -> i64 {
    value.try_into().unwrap_or(i64::MAX)
}
fn sha256_file(path: &Path) -> Result<String> {
    Ok(sha256_bytes(&fs::read(path)?))
}
fn sha256_bytes(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn json_pairs(columns: &[String]) -> String {
    columns
        .iter()
        .map(|column| format!("'{column}', {column}"))
        .collect::<Vec<_>>()
        .join(", ")
}

fn insert_v2_change_impl(
    transaction: &Transaction<'_>,
    admission: &str,
    change: &Change,
) -> Result<()> {
    // Kept separate so the exhaustive governed-record mapping remains reviewable.
    crate::projection_v2::insert_change(transaction, admission, change)
}
