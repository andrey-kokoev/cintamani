use crate::{
    capacity::{CapacityAnalysis, GroupCapacity},
    config::Config,
    controls::{AttributionSuite, ReplicationSummary},
    dynamics::ResourceUsage,
    experiment::ExperimentResult,
};
use anyhow::{Context, Result};
use rusqlite::{Connection, Transaction, params};
use serde::Serialize;
use std::path::Path;

const SCHEMA_VERSION: &str = "1";

#[derive(Clone, Debug, Serialize)]
pub struct DatabaseInspection {
    pub integrity: String,
    pub foreign_key_violations: usize,
    pub schema_version: String,
    pub artifact_kind: String,
    pub configurations: usize,
    pub cases: usize,
    pub resources: usize,
    pub targets: usize,
    pub singular_values: usize,
    pub feature_scales: usize,
    pub sensitivity_rows: usize,
    pub replication_conditions: usize,
    pub replicated_targets: usize,
}

pub fn inspect(path: impl AsRef<Path>) -> Result<DatabaseInspection> {
    let path = path.as_ref();
    let connection = Connection::open(path)
        .with_context(|| format!("failed to open SQLite database {}", path.display()))?;
    inspect_connection(&connection)
        .with_context(|| format!("failed to inspect SQLite database {}", path.display()))
}

pub fn write_experiment(
    path: impl AsRef<Path>,
    config: &Config,
    result: &ExperimentResult,
) -> Result<()> {
    let path = path.as_ref();
    let mut connection = Connection::open(path)
        .with_context(|| format!("failed to open SQLite database {}", path.display()))?;
    write_experiment_connection(&mut connection, config, result)
        .with_context(|| format!("failed to write SQLite database {}", path.display()))
}

pub fn write_attribution_suite(
    path: impl AsRef<Path>,
    config: &Config,
    suite: &AttributionSuite,
) -> Result<()> {
    let path = path.as_ref();
    let mut connection = Connection::open(path)
        .with_context(|| format!("failed to open SQLite database {}", path.display()))?;
    write_attribution_connection(&mut connection, config, suite)
        .with_context(|| format!("failed to write SQLite database {}", path.display()))
}

fn write_experiment_connection(
    connection: &mut Connection,
    config: &Config,
    result: &ExperimentResult,
) -> Result<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    let transaction = connection.transaction()?;
    initialize_snapshot(&transaction, "single-experiment")?;
    insert_configuration(&transaction, "base", config)?;
    insert_case(
        &transaction,
        "experiment",
        "Primary configured Kerr experiment.",
        "physical",
        Some("base"),
        &result.capacity,
        Some(&result.summary.resources),
    )?;
    transaction.commit()?;
    Ok(())
}

fn write_attribution_connection(
    connection: &mut Connection,
    config: &Config,
    suite: &AttributionSuite,
) -> Result<()> {
    connection.pragma_update(None, "foreign_keys", "ON")?;
    let transaction = connection.transaction()?;
    initialize_snapshot(&transaction, "attribution-suite")?;
    insert_configuration(&transaction, "base", config)?;

    for case in &suite.cases {
        let configuration_role = if let Some(case_config) = &case.configuration {
            let role = format!("case:{}", case.name);
            insert_configuration(&transaction, &role, case_config)?;
            Some(role)
        } else {
            None
        };
        insert_case(
            &transaction,
            &case.name,
            &case.description,
            if case.resources.is_some() {
                "physical"
            } else {
                "synthetic-input"
            },
            configuration_role.as_deref(),
            &case.capacity,
            case.resources.as_ref(),
        )?;
    }

    for row in &suite.sensitivity {
        transaction.execute(
            "INSERT INTO sensitivity (
                axis, condition, seed, train_fraction, effective_observation_rank, stable_rank,
                familywise_permutation_threshold, significant_target_count,
                total_corrected_capacity, nonlinear_corrected_capacity,
                historical_input_corrected_capacity
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                row.axis,
                row.condition,
                row.seed.to_string(),
                row.train_fraction,
                to_i64(row.effective_observation_rank),
                row.stable_rank,
                row.familywise_permutation_threshold,
                to_i64(row.significant_target_count),
                row.total_corrected_capacity,
                row.nonlinear_corrected_capacity,
                row.historical_input_corrected_capacity,
            ],
        )?;
    }

    for replication in &suite.replication {
        insert_replication(&transaction, replication)?;
    }
    transaction.commit()?;
    Ok(())
}

fn initialize_snapshot(transaction: &Transaction<'_>, artifact_kind: &str) -> Result<()> {
    transaction.execute_batch(
        "PRAGMA foreign_keys = ON;
         DROP TABLE IF EXISTS replicated_targets;
         DROP TABLE IF EXISTS replication;
         DROP TABLE IF EXISTS sensitivity;
         DROP TABLE IF EXISTS rank_profile;
         DROP TABLE IF EXISTS feature_scales;
         DROP TABLE IF EXISTS singular_values;
         DROP TABLE IF EXISTS targets;
         DROP TABLE IF EXISTS resources;
         DROP TABLE IF EXISTS cases;
         DROP TABLE IF EXISTS configurations;
         DROP TABLE IF EXISTS metadata;

         CREATE TABLE metadata (
             key TEXT PRIMARY KEY,
             value TEXT NOT NULL
         ) STRICT;
         CREATE TABLE configurations (
             role TEXT PRIMARY KEY,
             config_json TEXT NOT NULL
         ) STRICT;
         CREATE TABLE cases (
             case_id INTEGER PRIMARY KEY,
             name TEXT NOT NULL UNIQUE,
             description TEXT NOT NULL,
             kind TEXT NOT NULL,
             configuration_role TEXT REFERENCES configurations(role),
             declared_observation_dimension INTEGER NOT NULL,
             effective_observation_rank INTEGER NOT NULL,
             stable_rank REAL NOT NULL,
             participation_ratio REAL NOT NULL,
             rank_relative_tolerance REAL NOT NULL,
             familywise_permutation_threshold REAL NOT NULL,
             significant_target_count INTEGER NOT NULL,
             total_positive_raw_capacity REAL NOT NULL,
             total_corrected_capacity REAL NOT NULL,
             linear_corrected_capacity REAL NOT NULL,
             nonlinear_corrected_capacity REAL NOT NULL,
             current_input_corrected_capacity REAL NOT NULL,
             historical_input_corrected_capacity REAL NOT NULL
         ) STRICT;
         CREATE TABLE resources (
             case_id INTEGER PRIMARY KEY REFERENCES cases(case_id) ON DELETE CASCADE,
             elapsed_time REAL NOT NULL,
             incident_pump_energy REAL NOT NULL,
             incident_signal_energy REAL NOT NULL,
             coupled_drive_energy REAL NOT NULL,
             intrinsic_dissipation_energy REAL NOT NULL,
             external_outcoupling_energy REAL NOT NULL,
             expected_injected_noise_energy REAL NOT NULL
         ) STRICT;
         CREATE TABLE targets (
             case_id INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
             target TEXT NOT NULL,
             total_degree INTEGER NOT NULL,
             maximum_lag INTEGER NOT NULL,
             interacting_lags INTEGER NOT NULL,
             raw_held_out_capacity REAL NOT NULL,
             positive_null_mean REAL NOT NULL,
             target_permutation_threshold REAL NOT NULL,
             familywise_permutation_threshold REAL NOT NULL,
             familywise_significant INTEGER NOT NULL CHECK (familywise_significant IN (0, 1)),
             corrected_capacity REAL NOT NULL,
             PRIMARY KEY (case_id, target)
         ) STRICT;
         CREATE INDEX targets_degree_lag ON targets(case_id, total_degree, maximum_lag);
         CREATE TABLE singular_values (
             case_id INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
             component INTEGER NOT NULL,
             normalized_singular_value REAL NOT NULL,
             relative_singular_value REAL NOT NULL,
             PRIMARY KEY (case_id, component)
         ) STRICT;
         CREATE TABLE feature_scales (
             case_id INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
             feature INTEGER NOT NULL,
             training_mean REAL NOT NULL,
             training_scale REAL NOT NULL,
             relative_scale REAL NOT NULL,
             PRIMARY KEY (case_id, feature)
         ) STRICT;
         CREATE TABLE rank_profile (
             case_id INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
             relative_singular_tolerance REAL NOT NULL,
             rank INTEGER NOT NULL,
             PRIMARY KEY (case_id, relative_singular_tolerance)
         ) STRICT;
         CREATE TABLE sensitivity (
             axis TEXT NOT NULL,
             condition TEXT NOT NULL,
             seed TEXT NOT NULL,
             train_fraction REAL NOT NULL,
             effective_observation_rank INTEGER NOT NULL,
             stable_rank REAL NOT NULL,
             familywise_permutation_threshold REAL NOT NULL,
             significant_target_count INTEGER NOT NULL,
             total_corrected_capacity REAL NOT NULL,
             nonlinear_corrected_capacity REAL NOT NULL,
             historical_input_corrected_capacity REAL NOT NULL,
             PRIMARY KEY (axis, condition, seed, train_fraction)
         ) STRICT;
         CREATE TABLE replication (
             condition TEXT PRIMARY KEY,
             seed_count INTEGER NOT NULL,
             replicated_target_count INTEGER NOT NULL,
             replicated_minimum_total_capacity REAL NOT NULL,
             replicated_minimum_linear_capacity REAL NOT NULL,
             replicated_minimum_nonlinear_capacity REAL NOT NULL,
             replicated_minimum_current_capacity REAL NOT NULL,
             replicated_minimum_historical_capacity REAL NOT NULL
         ) STRICT;
         CREATE TABLE replicated_targets (
             condition TEXT NOT NULL REFERENCES replication(condition) ON DELETE CASCADE,
             target TEXT NOT NULL,
             total_degree INTEGER NOT NULL,
             maximum_lag INTEGER NOT NULL,
             significant_seed_count INTEGER NOT NULL,
             required_seed_count INTEGER NOT NULL,
             replicated INTEGER NOT NULL CHECK (replicated IN (0, 1)),
             minimum_corrected_capacity REAL NOT NULL,
             mean_corrected_capacity REAL NOT NULL,
             PRIMARY KEY (condition, target)
         ) STRICT;",
    )?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('schema_version', ?1)",
        [SCHEMA_VERSION],
    )?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('artifact_kind', ?1)",
        [artifact_kind],
    )?;
    transaction.execute(
        "INSERT INTO metadata (key, value) VALUES ('package_version', ?1)",
        [env!("CARGO_PKG_VERSION")],
    )?;
    Ok(())
}

fn insert_configuration(transaction: &Transaction<'_>, role: &str, config: &Config) -> Result<()> {
    let json = serde_json::to_string(config)?;
    transaction.execute(
        "INSERT INTO configurations (role, config_json) VALUES (?1, ?2)",
        params![role, json],
    )?;
    Ok(())
}

fn insert_case(
    transaction: &Transaction<'_>,
    name: &str,
    description: &str,
    kind: &str,
    configuration_role: Option<&str>,
    capacity: &CapacityAnalysis,
    resources: Option<&ResourceUsage>,
) -> Result<()> {
    let linear = group_capacity(&capacity.by_degree, 1);
    let current = group_capacity(&capacity.by_maximum_lag, 0);
    let significant_target_count = capacity
        .targets
        .iter()
        .filter(|target| target.familywise_significant)
        .count();
    transaction.execute(
        "INSERT INTO cases (
            name, description, kind, configuration_role, declared_observation_dimension,
            effective_observation_rank, stable_rank, participation_ratio,
            rank_relative_tolerance, familywise_permutation_threshold,
            significant_target_count, total_positive_raw_capacity, total_corrected_capacity,
            linear_corrected_capacity, nonlinear_corrected_capacity,
            current_input_corrected_capacity, historical_input_corrected_capacity
         ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17
         )",
        params![
            name,
            description,
            kind,
            configuration_role,
            to_i64(capacity.declared_observation_dimension),
            to_i64(capacity.effective_observation_rank),
            capacity.observation_spectrum.stable_rank,
            capacity.observation_spectrum.participation_ratio,
            capacity.observation_spectrum.chosen_relative_tolerance,
            capacity.familywise_permutation_threshold,
            to_i64(significant_target_count),
            capacity.total_positive_raw_capacity,
            capacity.total_corrected_capacity,
            linear,
            capacity.total_corrected_capacity - linear,
            current,
            capacity.total_corrected_capacity - current,
        ],
    )?;
    let case_id = transaction.last_insert_rowid();

    if let Some(resource) = resources {
        insert_resources(transaction, case_id, resource)?;
    }
    for target in &capacity.targets {
        transaction.execute(
            "INSERT INTO targets (
                case_id, target, total_degree, maximum_lag, interacting_lags,
                raw_held_out_capacity, positive_null_mean, target_permutation_threshold,
                familywise_permutation_threshold, familywise_significant, corrected_capacity
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                case_id,
                target.target,
                to_i64(target.total_degree),
                to_i64(target.maximum_lag),
                to_i64(target.interacting_lags),
                target.raw_held_out_capacity,
                target.positive_null_mean,
                target.target_permutation_threshold,
                target.familywise_permutation_threshold,
                bool_i64(target.familywise_significant),
                target.corrected_capacity,
            ],
        )?;
    }
    let spectrum = &capacity.observation_spectrum;
    for (component, (&singular, &relative)) in spectrum
        .normalized_singular_values
        .iter()
        .zip(&spectrum.relative_singular_values)
        .enumerate()
    {
        transaction.execute(
            "INSERT INTO singular_values (
                case_id, component, normalized_singular_value, relative_singular_value
             ) VALUES (?1, ?2, ?3, ?4)",
            params![case_id, to_i64(component), singular, relative],
        )?;
    }
    for (feature, ((&mean, &scale), &relative)) in spectrum
        .training_feature_means
        .iter()
        .zip(&spectrum.training_feature_scales)
        .zip(&spectrum.relative_feature_scales)
        .enumerate()
    {
        transaction.execute(
            "INSERT INTO feature_scales (
                case_id, feature, training_mean, training_scale, relative_scale
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![case_id, to_i64(feature), mean, scale, relative],
        )?;
    }
    for profile in &spectrum.rank_profile {
        transaction.execute(
            "INSERT INTO rank_profile (case_id, relative_singular_tolerance, rank)
             VALUES (?1, ?2, ?3)",
            params![
                case_id,
                profile.relative_singular_tolerance,
                to_i64(profile.rank)
            ],
        )?;
    }
    Ok(())
}

fn insert_resources(
    transaction: &Transaction<'_>,
    case_id: i64,
    resources: &ResourceUsage,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO resources (
            case_id, elapsed_time, incident_pump_energy, incident_signal_energy,
            coupled_drive_energy, intrinsic_dissipation_energy,
            external_outcoupling_energy, expected_injected_noise_energy
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            case_id,
            resources.elapsed_time,
            resources.incident_pump_energy,
            resources.incident_signal_energy,
            resources.coupled_drive_energy,
            resources.intrinsic_dissipation_energy,
            resources.external_outcoupling_energy,
            resources.expected_injected_noise_energy,
        ],
    )?;
    Ok(())
}

fn insert_replication(
    transaction: &Transaction<'_>,
    replication: &ReplicationSummary,
) -> Result<()> {
    transaction.execute(
        "INSERT INTO replication (
            condition, seed_count, replicated_target_count,
            replicated_minimum_total_capacity, replicated_minimum_linear_capacity,
            replicated_minimum_nonlinear_capacity, replicated_minimum_current_capacity,
            replicated_minimum_historical_capacity
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            replication.condition,
            to_i64(replication.seed_count),
            to_i64(replication.replicated_target_count),
            replication.replicated_minimum_total_capacity,
            replication.replicated_minimum_linear_capacity,
            replication.replicated_minimum_nonlinear_capacity,
            replication.replicated_minimum_current_capacity,
            replication.replicated_minimum_historical_capacity,
        ],
    )?;
    for target in &replication.targets {
        transaction.execute(
            "INSERT INTO replicated_targets (
                condition, target, total_degree, maximum_lag, significant_seed_count,
                required_seed_count, replicated, minimum_corrected_capacity,
                mean_corrected_capacity
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                replication.condition,
                target.target,
                to_i64(target.total_degree),
                to_i64(target.maximum_lag),
                to_i64(target.significant_seed_count),
                to_i64(target.required_seed_count),
                bool_i64(target.replicated),
                target.minimum_corrected_capacity,
                target.mean_corrected_capacity,
            ],
        )?;
    }
    Ok(())
}

fn group_capacity(groups: &[GroupCapacity], group: usize) -> f64 {
    groups
        .iter()
        .find(|candidate| candidate.group == group)
        .map_or(0.0, |candidate| candidate.corrected_capacity)
}

fn to_i64(value: impl TryInto<i64>) -> i64 {
    value.try_into().ok().unwrap_or(i64::MAX)
}

fn bool_i64(value: bool) -> i64 {
    if value { 1 } else { 0 }
}

fn inspect_connection(connection: &Connection) -> Result<DatabaseInspection> {
    let integrity = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let foreign_key_violations = table_count(connection, "pragma_foreign_key_check")?;
    let schema_version = metadata_value(connection, "schema_version")?;
    let artifact_kind = metadata_value(connection, "artifact_kind")?;
    Ok(DatabaseInspection {
        integrity,
        foreign_key_violations,
        schema_version,
        artifact_kind,
        configurations: table_count(connection, "configurations")?,
        cases: table_count(connection, "cases")?,
        resources: table_count(connection, "resources")?,
        targets: table_count(connection, "targets")?,
        singular_values: table_count(connection, "singular_values")?,
        feature_scales: table_count(connection, "feature_scales")?,
        sensitivity_rows: table_count(connection, "sensitivity")?,
        replication_conditions: table_count(connection, "replication")?,
        replicated_targets: table_count(connection, "replicated_targets")?,
    })
}

fn metadata_value(connection: &Connection, key: &str) -> Result<String> {
    Ok(
        connection.query_row("SELECT value FROM metadata WHERE key = ?1", [key], |row| {
            row.get(0)
        })?,
    )
}

fn table_count(connection: &Connection, table: &str) -> Result<usize> {
    let allowed = [
        "pragma_foreign_key_check",
        "configurations",
        "cases",
        "resources",
        "targets",
        "singular_values",
        "feature_scales",
        "sensitivity",
        "replication",
        "replicated_targets",
    ];
    if !allowed.contains(&table) {
        anyhow::bail!("table {table} is not in the inspection allowlist");
    }
    let query = format!("SELECT COUNT(*) FROM {table}");
    let count: i64 = connection.query_row(&query, [], |row| row.get(0))?;
    Ok(count.try_into()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::{Backend, Observation},
        controls, experiment,
    };

    fn config() -> Config {
        Config {
            seed: 53,
            modes: 3,
            backend: Backend::Pseudospectral,
            dt: 0.02,
            steps_per_symbol: 1,
            warmup_symbols: 8,
            sample_symbols: 180,
            intrinsic_loss: 0.6,
            external_coupling: 0.4,
            detuning: 0.7,
            dispersion: -0.02,
            kerr_strength: 0.2,
            pump_amplitude: 1.0,
            input_scale: 0.12,
            input_mode: 1,
            noise_std: 0.0,
            thermal_coupling: 0.0,
            thermal_decay: 0.05,
            raman_fraction: 0.0,
            observation: Observation::Intensity,
            max_degree: 2,
            max_lag: 2,
            train_fraction: 0.7,
            ridge: 1e-6,
            null_trials: 20,
            null_quantile: 0.95,
            rank_relative_tolerance: 1e-6,
            save_samples: false,
        }
    }

    #[test]
    fn single_experiment_database_has_integrity_and_relations() {
        let configuration = config();
        let result = experiment::run(&configuration).unwrap();
        let mut connection = Connection::open_in_memory().unwrap();
        write_experiment_connection(&mut connection, &configuration, &result).unwrap();

        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .unwrap();
        let cases: i64 = connection
            .query_row("SELECT COUNT(*) FROM cases", [], |row| row.get(0))
            .unwrap();
        let targets: i64 = connection
            .query_row("SELECT COUNT(*) FROM targets", [], |row| row.get(0))
            .unwrap();
        assert_eq!(integrity, "ok");
        assert_eq!(cases, 1);
        assert_eq!(targets as usize, result.capacity.targets.len());
    }

    #[test]
    fn attribution_database_contains_cases_and_replication() {
        let configuration = config();
        let suite = controls::run(&configuration, 1, &[0.7]).unwrap();
        let mut connection = Connection::open_in_memory().unwrap();
        write_attribution_connection(&mut connection, &configuration, &suite).unwrap();

        let cases: i64 = connection
            .query_row("SELECT COUNT(*) FROM cases", [], |row| row.get(0))
            .unwrap();
        let replications: i64 = connection
            .query_row("SELECT COUNT(*) FROM replication", [], |row| row.get(0))
            .unwrap();
        let foreign_key_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(cases, 8);
        assert_eq!(replications, 4);
        assert_eq!(foreign_key_errors, 0);
    }
}
