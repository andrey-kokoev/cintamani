CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS admissions (
    admission_id TEXT PRIMARY KEY,
    record_schema_version INTEGER NOT NULL CHECK (record_schema_version = 1),
    source_path TEXT NOT NULL UNIQUE,
    source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
    admitted_at TEXT NOT NULL,
    description TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS theoretical_models (
    model_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-model', 'candidate', 'rejected', 'unspecified'
    )),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS materials (
    material_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    material_kind TEXT NOT NULL CHECK (material_kind IN (
        'abstract-normalized-medium', 'candidate-physical-material', 'validated-physical-material'
    )),
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'abstract-placeholder', 'not-material-instantiated', 'unvalidated-candidate',
        'validated-device-evidence', 'rejected'
    )),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS physical_mechanisms (
    mechanism_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-model', 'candidate', 'unimplemented', 'rejected'
    )),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS interfaces (
    interface_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    observation_kind TEXT NOT NULL CHECK (observation_kind IN (
        'intensity', 'coherent-quadrature', 'joint', 'abstract'
    )),
    units TEXT NOT NULL,
    description TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-interface', 'candidate', 'unimplemented'
    )),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS typed_morphisms (
    morphism_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    target_interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    morphism_type TEXT NOT NULL CHECK (morphism_type IN (
        'dynamics-to-observation', 'candidate-realization', 'control', 'comparison'
    )),
    validation_status TEXT NOT NULL CHECK (validation_status IN (
        'implemented-normalized', 'candidate-unvalidated', 'validated-device', 'rejected'
    )),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (source_model_id, material_id, mechanism_id, target_interface_id, morphism_type),
    UNIQUE (morphism_id, source_model_id, material_id, mechanism_id, target_interface_id)
) STRICT;

CREATE TABLE IF NOT EXISTS siege_cells (
    cell_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    morphism_id TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'normalized-model-only', 'candidate-physical', 'validated-device', 'refuted'
    )),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (morphism_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES typed_morphisms(
            morphism_id, source_model_id, material_id, mechanism_id, target_interface_id
        )
) STRICT;

CREATE TABLE IF NOT EXISTS siege_cell_decisions (
    decision_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    decided_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'conjectured', 'tested-local', 'advanced-local-lead', 'deferred', 'rejected'
    )),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (cell_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS parameter_definitions (
    parameter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    units TEXT NOT NULL,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (parameter_id, units)
) STRICT;

CREATE TABLE IF NOT EXISTS parameter_regions (
    region_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    name TEXT NOT NULL,
    region_kind TEXT NOT NULL CHECK (region_kind IN (
        'frozen-singleton', 'bounded-region', 'candidate-region'
    )),
    predeclared INTEGER NOT NULL CHECK (predeclared IN (0, 1)),
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (cell_id, name)
) STRICT;

CREATE TABLE IF NOT EXISTS parameter_region_values (
    region_id TEXT NOT NULL REFERENCES parameter_regions(region_id) ON DELETE CASCADE,
    parameter_id TEXT NOT NULL,
    lower_value REAL,
    upper_value REAL,
    exact_text TEXT,
    units TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    PRIMARY KEY (region_id, parameter_id),
    CHECK (lower_value IS NULL OR upper_value IS NULL OR lower_value <= upper_value),
    CHECK (lower_value IS NOT NULL OR upper_value IS NOT NULL OR exact_text IS NOT NULL),
    FOREIGN KEY (parameter_id, units) REFERENCES parameter_definitions(parameter_id, units)
) STRICT;

CREATE TABLE IF NOT EXISTS conjectures (
    conjecture_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    label TEXT NOT NULL UNIQUE,
    statement TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS conjecture_dispositions (
    disposition_id TEXT PRIMARY KEY,
    conjecture_id TEXT NOT NULL REFERENCES conjectures(conjecture_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    decided_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'open', 'survived-local-gate', 'falsified', 'deferred', 'abandoned'
    )),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (conjecture_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS falsification_criteria (
    criterion_id TEXT PRIMARY KEY,
    conjecture_id TEXT NOT NULL REFERENCES conjectures(conjecture_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    metric TEXT NOT NULL,
    comparator TEXT NOT NULL CHECK (comparator IN (
        'greater-than', 'greater-or-equal', 'less-than', 'less-or-equal', 'equal',
        'all-seeds-positive', 'all-seeds-significant'
    )),
    threshold_value REAL,
    threshold_text TEXT,
    units TEXT NOT NULL,
    predeclared INTEGER NOT NULL CHECK (predeclared IN (0, 1)),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (threshold_value IS NOT NULL OR threshold_text IS NOT NULL)
) STRICT;

CREATE TABLE IF NOT EXISTS protocols (
    protocol_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    config_uri TEXT,
    config_sha256 TEXT CHECK (config_sha256 IS NULL OR length(config_sha256) = 64),
    config_hash_status TEXT NOT NULL CHECK (config_hash_status IN (
        'recorded', 'derived-at-admission', 'unavailable'
    )),
    predeclared INTEGER NOT NULL CHECK (predeclared IN (0, 1)),
    seed_count INTEGER NOT NULL CHECK (seed_count > 0),
    null_trials INTEGER CHECK (null_trials IS NULL OR null_trials > 0),
    null_quantile REAL CHECK (
        null_quantile IS NULL OR (null_quantile > 0.0 AND null_quantile < 1.0)
    ),
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (name, version),
    CHECK ((config_sha256 IS NOT NULL AND config_hash_status != 'unavailable') OR
           (config_sha256 IS NULL AND config_hash_status = 'unavailable')),
    CHECK ((null_trials IS NULL AND null_quantile IS NULL) OR
           (null_trials IS NOT NULL AND null_quantile IS NOT NULL))
) STRICT;

CREATE TABLE IF NOT EXISTS runs (
    run_id TEXT PRIMARY KEY,
    protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id),
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    code_commit TEXT NOT NULL CHECK (length(code_commit) = 40),
    run_status TEXT NOT NULL CHECK (run_status IN ('completed', 'failed', 'partial')),
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'normalized-single-point', 'normalized-calibration-suite', 'normalized-noise-suite'
    )),
    summary TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS evidence_artifacts (
    artifact_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    artifact_kind TEXT NOT NULL CHECK (artifact_kind IN (
        'sqlite-detailed-results', 'json-export', 'csv-export', 'markdown-report'
    )),
    artifact_uri TEXT NOT NULL,
    expected_sha256 TEXT NOT NULL CHECK (length(expected_sha256) = 64),
    observed_sha256 TEXT CHECK (observed_sha256 IS NULL OR length(observed_sha256) = 64),
    availability_status TEXT NOT NULL CHECK (availability_status IN (
        'present-verified', 'missing-ignored-artifact', 'present-hash-mismatch'
    )),
    canonical_detail INTEGER NOT NULL CHECK (canonical_detail IN (0, 1)),
    detail_row_count INTEGER CHECK (detail_row_count IS NULL OR detail_row_count >= 0),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (artifact_uri, expected_sha256)
) STRICT;

CREATE TABLE IF NOT EXISTS gate_results (
    gate_result_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    criterion_id TEXT REFERENCES falsification_criteria(criterion_id),
    gate_name TEXT NOT NULL,
    evidence_polarity TEXT NOT NULL CHECK (evidence_polarity IN (
        'survives-test', 'falsifies', 'criticizes', 'inconclusive', 'mixed'
    )),
    passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
    metric_value REAL,
    metric_text TEXT,
    units TEXT NOT NULL,
    seed_pass_count INTEGER CHECK (seed_pass_count IS NULL OR seed_pass_count >= 0),
    seed_required_count INTEGER CHECK (seed_required_count IS NULL OR seed_required_count > 0),
    decision_scope TEXT NOT NULL,
    limitation TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (metric_value IS NOT NULL OR metric_text IS NOT NULL),
    CHECK (seed_pass_count IS NULL OR seed_required_count IS NULL OR seed_pass_count <= seed_required_count),
    UNIQUE (run_id, gate_name)
) STRICT;

CREATE TABLE IF NOT EXISTS comparisons (
    comparison_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    baseline_run_id TEXT REFERENCES runs(run_id),
    control_relationship TEXT NOT NULL,
    metric TEXT NOT NULL,
    evidence_polarity TEXT NOT NULL CHECK (evidence_polarity IN (
        'survives-test', 'falsifies', 'criticizes', 'inconclusive', 'mixed'
    )),
    minimum_delta REAL,
    maximum_delta REAL,
    mean_delta REAL,
    units TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (minimum_delta IS NULL OR maximum_delta IS NULL OR minimum_delta <= maximum_delta),
    UNIQUE (run_id, control_relationship, metric)
) STRICT;

CREATE TABLE IF NOT EXISTS ledger_links (
    ledger_link_id TEXT PRIMARY KEY,
    ledger_number INTEGER NOT NULL CHECK (ledger_number > 0),
    ledger_title TEXT NOT NULL,
    ledger_path TEXT NOT NULL,
    ledger_sha256 TEXT NOT NULL CHECK (length(ledger_sha256) = 64),
    relation TEXT NOT NULL,
    admitted_claim TEXT NOT NULL,
    run_id TEXT REFERENCES runs(run_id),
    cell_id TEXT REFERENCES siege_cells(cell_id),
    conjecture_id TEXT REFERENCES conjectures(conjecture_id),
    protocol_id TEXT REFERENCES protocols(protocol_id),
    artifact_id TEXT REFERENCES evidence_artifacts(artifact_id),
    gate_result_id TEXT REFERENCES gate_results(gate_result_id),
    comparison_id TEXT REFERENCES comparisons(comparison_id),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (
        (run_id IS NOT NULL) + (cell_id IS NOT NULL) + (conjecture_id IS NOT NULL) +
        (protocol_id IS NOT NULL) + (artifact_id IS NOT NULL) +
        (gate_result_id IS NOT NULL) + (comparison_id IS NOT NULL) = 1
    ),
    UNIQUE (ledger_number, relation, admitted_claim)
) STRICT;

CREATE INDEX IF NOT EXISTS siege_cells_axes
    ON siege_cells(model_id, material_id, mechanism_id, interface_id);
CREATE INDEX IF NOT EXISTS siege_cell_decisions_latest
    ON siege_cell_decisions(cell_id, revision DESC);
CREATE INDEX IF NOT EXISTS typed_morphisms_axes
    ON typed_morphisms(source_model_id, material_id, mechanism_id, target_interface_id);
CREATE INDEX IF NOT EXISTS parameter_values_parameter
    ON parameter_region_values(parameter_id, region_id);
CREATE INDEX IF NOT EXISTS conjectures_cell
    ON conjectures(cell_id);
CREATE INDEX IF NOT EXISTS conjecture_dispositions_latest
    ON conjecture_dispositions(conjecture_id, revision DESC);
CREATE INDEX IF NOT EXISTS runs_cell_protocol
    ON runs(cell_id, protocol_id);
CREATE INDEX IF NOT EXISTS artifacts_run_status
    ON evidence_artifacts(run_id, availability_status);
CREATE INDEX IF NOT EXISTS gates_run_polarity
    ON gate_results(run_id, evidence_polarity, passed);
CREATE INDEX IF NOT EXISTS comparisons_run_metric
    ON comparisons(run_id, metric);
CREATE INDEX IF NOT EXISTS ledger_links_ledger
    ON ledger_links(ledger_number);
