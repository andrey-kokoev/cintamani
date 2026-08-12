CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE migration_lineage (
    migration_id TEXT PRIMARY KEY,
    source_schema_version TEXT NOT NULL,
    target_schema_version TEXT NOT NULL CHECK (target_schema_version IN ('2', '3', '4')),
    migration_kind TEXT NOT NULL CHECK (migration_kind IN (
        'clean-v2', 'clean-v3', 'clean-v4', 'owned-v1-upgrade', 'owned-v2-rebuild',
        'owned-v2-upgrade', 'owned-v3-rebuild', 'owned-v4-rebuild'
    )),
    chain_head TEXT NOT NULL,
    applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE admissions (
    admission_id TEXT PRIMARY KEY,
    admission_sequence INTEGER NOT NULL UNIQUE CHECK (admission_sequence > 0),
    record_schema_version INTEGER NOT NULL CHECK (record_schema_version IN (1, 2)),
    source_path TEXT NOT NULL UNIQUE,
    source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
    predecessor_entry_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL UNIQUE CHECK (length(entry_hash) = 64),
    admitted_at TEXT NOT NULL,
    admitted_by TEXT NOT NULL,
    authority_kind TEXT NOT NULL,
    authority_ref TEXT NOT NULL,
    description TEXT NOT NULL
) STRICT;

CREATE TABLE theoretical_models (
    model_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE theoretical_model_assessments (
    assessment_id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-model', 'candidate', 'rejected', 'unspecified'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (model_id, revision)
) STRICT;

CREATE TABLE materials (
    material_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE material_assessments (
    assessment_id TEXT PRIMARY KEY,
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    material_classification TEXT NOT NULL CHECK (material_classification IN (
        'abstract-normalized-medium', 'candidate-physical-material', 'validated-physical-material'
    )),
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'abstract-placeholder', 'not-material-instantiated', 'unvalidated-candidate',
        'validated-device-evidence', 'rejected'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (material_id, revision)
) STRICT;

CREATE TABLE physical_mechanisms (
    mechanism_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE mechanism_assessments (
    assessment_id TEXT PRIMARY KEY,
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-model', 'candidate', 'unimplemented', 'rejected'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (mechanism_id, revision)
) STRICT;

CREATE TABLE interfaces (
    interface_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    observation_kind TEXT NOT NULL CHECK (observation_kind IN (
        'intensity', 'coherent-quadrature', 'joint', 'abstract'
    )),
    units TEXT NOT NULL,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE interface_assessments (
    assessment_id TEXT PRIMARY KEY,
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'implemented-normalized-interface', 'candidate', 'unimplemented', 'rejected'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (interface_id, revision)
) STRICT;

CREATE TABLE process_ports (
    port_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    port_type TEXT NOT NULL CHECK (port_type IN (
        'modeled-state', 'materialized-state', 'mechanism-output', 'observation-interface'
    )),
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (port_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE typed_morphisms (
    morphism_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    source_port_id TEXT NOT NULL,
    target_port_id TEXT NOT NULL,
    morphism_type TEXT NOT NULL CHECK (morphism_type IN (
        'dynamics-to-observation', 'candidate-realization', 'control', 'comparison',
        'state-transition', 'observation-map'
    )),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (morphism_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (source_port_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES process_ports(port_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (target_port_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES process_ports(port_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE morphism_assessments (
    assessment_id TEXT PRIMARY KEY,
    morphism_id TEXT NOT NULL REFERENCES typed_morphisms(morphism_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    validation_status TEXT NOT NULL CHECK (validation_status IN (
        'implemented-normalized', 'candidate-unvalidated', 'validated-device', 'rejected'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (morphism_id, revision)
) STRICT;

CREATE TABLE morphism_paths (
    path_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    source_port_id TEXT NOT NULL,
    target_port_id TEXT NOT NULL,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (path_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (source_port_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES process_ports(port_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (target_port_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES process_ports(port_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE morphism_path_steps (
    path_id TEXT NOT NULL REFERENCES morphism_paths(path_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position > 0),
    morphism_id TEXT NOT NULL REFERENCES typed_morphisms(morphism_id),
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    PRIMARY KEY (path_id, position),
    UNIQUE (path_id, morphism_id, position),
    FOREIGN KEY (path_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES morphism_paths(path_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (morphism_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES typed_morphisms(morphism_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE siege_cells (
    cell_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (model_id, material_id, mechanism_id, interface_id),
    UNIQUE (cell_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE siege_cell_morphisms (
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    morphism_id TEXT NOT NULL,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    relationship TEXT NOT NULL CHECK (relationship IN ('primary', 'parallel', 'control', 'comparison')),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    PRIMARY KEY (cell_id, morphism_id),
    FOREIGN KEY (cell_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES siege_cells(cell_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (morphism_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES typed_morphisms(morphism_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE siege_cell_paths (
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    path_id TEXT NOT NULL REFERENCES morphism_paths(path_id),
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    relationship TEXT NOT NULL CHECK (relationship IN ('primary', 'parallel', 'control', 'comparison')),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    PRIMARY KEY (cell_id, path_id),
    FOREIGN KEY (cell_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES siege_cells(cell_id, model_id, material_id, mechanism_id, interface_id),
    FOREIGN KEY (path_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES morphism_paths(path_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

CREATE TABLE siege_cell_assessments (
    assessment_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'normalized-model-only', 'candidate-physical', 'validated-device', 'refuted'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (cell_id, revision)
) STRICT;

CREATE TABLE siege_cell_decisions (
    decision_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('decision', 'correction', 'supersession')),
    decided_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'conjectured', 'tested-local', 'local-lead-awaiting-critique',
        'advanced-local-lead', 'deferred', 'rejected'
    )),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (cell_id, revision)
) STRICT;

CREATE TABLE parameter_definitions (
    parameter_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    symbol TEXT NOT NULL,
    units TEXT NOT NULL,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (parameter_id, units)
) STRICT;

CREATE TABLE parameter_regions (
    region_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    name TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (cell_id, name)
) STRICT;

CREATE TABLE parameter_region_versions (
    region_version_id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES parameter_regions(region_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    defined_at TEXT NOT NULL,
    region_kind TEXT NOT NULL CHECK (region_kind IN (
        'frozen-singleton', 'bounded-region', 'candidate-region'
    )),
    predeclared INTEGER NOT NULL CHECK (predeclared IN (0, 1)),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (region_id, revision)
) STRICT;

CREATE TABLE parameter_region_values (
    region_version_id TEXT NOT NULL REFERENCES parameter_region_versions(region_version_id) ON DELETE CASCADE,
    parameter_id TEXT NOT NULL,
    lower_value REAL,
    upper_value REAL,
    exact_text TEXT,
    units TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    PRIMARY KEY (region_version_id, parameter_id),
    CHECK (lower_value IS NULL OR upper_value IS NULL OR lower_value <= upper_value),
    CHECK (lower_value IS NOT NULL OR upper_value IS NOT NULL OR exact_text IS NOT NULL),
    FOREIGN KEY (parameter_id, units) REFERENCES parameter_definitions(parameter_id, units)
) STRICT;

CREATE TABLE conjectures (
    conjecture_id TEXT PRIMARY KEY,
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    label TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE conjecture_versions (
    conjecture_version_id TEXT PRIMARY KEY,
    conjecture_id TEXT NOT NULL REFERENCES conjectures(conjecture_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    formulated_at TEXT NOT NULL,
    statement TEXT NOT NULL,
    rationale TEXT NOT NULL,
    formulation_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (conjecture_id, revision)
) STRICT;

CREATE TABLE conjecture_dispositions (
    disposition_id TEXT PRIMARY KEY,
    conjecture_id TEXT NOT NULL REFERENCES conjectures(conjecture_id),
    conjecture_version_id TEXT NOT NULL REFERENCES conjecture_versions(conjecture_version_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('decision', 'correction', 'supersession')),
    decided_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN (
        'open', 'survived-local-gate', 'falsified', 'deferred', 'abandoned'
    )),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (conjecture_id, revision)
) STRICT;

CREATE TABLE falsification_criteria (
    criterion_id TEXT PRIMARY KEY,
    conjecture_version_id TEXT NOT NULL REFERENCES conjecture_versions(conjecture_version_id),
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

CREATE TABLE protocols (
    protocol_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE protocol_versions (
    protocol_version_id TEXT PRIMARY KEY,
    protocol_id TEXT NOT NULL REFERENCES protocols(protocol_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    defined_at TEXT NOT NULL,
    predeclared INTEGER NOT NULL CHECK (predeclared IN (0, 1)),
    seed_count INTEGER NOT NULL CHECK (seed_count > 0),
    null_trials INTEGER CHECK (null_trials IS NULL OR null_trials > 0),
    null_quantile REAL CHECK (null_quantile IS NULL OR (null_quantile > 0.0 AND null_quantile < 1.0)),
    rationale TEXT NOT NULL,
    decision_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (protocol_id, revision),
    CHECK ((null_trials IS NULL AND null_quantile IS NULL) OR
           (null_trials IS NOT NULL AND null_quantile IS NOT NULL))
) STRICT;

CREATE TABLE protocol_provenance_assessments (
    assessment_id TEXT PRIMARY KEY,
    protocol_version_id TEXT NOT NULL REFERENCES protocol_versions(protocol_version_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    config_uri TEXT,
    config_sha256 TEXT CHECK (config_sha256 IS NULL OR length(config_sha256) = 64),
    completeness_status TEXT NOT NULL CHECK (completeness_status IN (
        'recorded-verified', 'recorded-unverified', 'unavailable'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (protocol_version_id, revision),
    CHECK ((config_uri IS NULL AND config_sha256 IS NULL AND completeness_status = 'unavailable') OR
           (config_uri IS NOT NULL AND config_sha256 IS NOT NULL AND completeness_status != 'unavailable'))
) STRICT;

CREATE TABLE runs (
    run_id TEXT PRIMARY KEY,
    protocol_version_id TEXT NOT NULL REFERENCES protocol_versions(protocol_version_id),
    cell_id TEXT NOT NULL REFERENCES siege_cells(cell_id),
    code_commit TEXT NOT NULL CHECK (length(code_commit) = 40),
    summary TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE run_assessments (
    assessment_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('assessment', 'correction', 'supersession')),
    assessed_at TEXT NOT NULL,
    operational_status TEXT NOT NULL CHECK (operational_status IN ('completed', 'failed', 'partial')),
    epistemic_status TEXT NOT NULL CHECK (epistemic_status IN (
        'normalized-single-point', 'normalized-calibration-suite', 'normalized-noise-suite',
        'superseded', 'invalidated'
    )),
    rationale TEXT NOT NULL,
    assessment_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (run_id, revision)
) STRICT;

CREATE TABLE evidence_artifacts (
    artifact_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
    artifact_kind TEXT NOT NULL CHECK (artifact_kind IN (
        'sqlite-detailed-results', 'json-export', 'csv-export', 'markdown-report'
    )),
    artifact_uri TEXT NOT NULL,
    expected_sha256 TEXT NOT NULL CHECK (length(expected_sha256) = 64),
    canonical_detail INTEGER NOT NULL CHECK (canonical_detail IN (0, 1)),
    detail_row_count INTEGER CHECK (detail_row_count IS NULL OR detail_row_count >= 0),
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (artifact_uri, expected_sha256)
) STRICT;

CREATE TABLE gate_results (
    gate_result_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
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
    CHECK (seed_pass_count IS NULL OR seed_required_count IS NULL OR seed_pass_count <= seed_required_count)
) STRICT;

CREATE TABLE gate_result_supersessions (
    supersession_id TEXT PRIMARY KEY,
    prior_gate_result_id TEXT NOT NULL REFERENCES gate_results(gate_result_id),
    replacement_gate_result_id TEXT NOT NULL REFERENCES gate_results(gate_result_id),
    superseded_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (prior_gate_result_id),
    CHECK (prior_gate_result_id != replacement_gate_result_id)
) STRICT;

CREATE TABLE comparisons (
    comparison_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(run_id),
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
    CHECK (minimum_delta IS NULL OR maximum_delta IS NULL OR minimum_delta <= maximum_delta)
) STRICT;

CREATE TABLE comparison_supersessions (
    supersession_id TEXT PRIMARY KEY,
    prior_comparison_id TEXT NOT NULL REFERENCES comparisons(comparison_id),
    replacement_comparison_id TEXT NOT NULL REFERENCES comparisons(comparison_id),
    superseded_at TEXT NOT NULL,
    reason TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (prior_comparison_id),
    CHECK (prior_comparison_id != replacement_comparison_id)
) STRICT;

CREATE TABLE ledger_links (
    ledger_link_id TEXT PRIMARY KEY,
    ledger_number INTEGER NOT NULL CHECK (ledger_number > 0),
    ledger_title TEXT NOT NULL,
    ledger_path TEXT NOT NULL,
    ledger_sha256 TEXT NOT NULL CHECK (length(ledger_sha256) = 64),
    relation TEXT NOT NULL,
    admitted_claim TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (ledger_number, relation, admitted_claim)
) STRICT;

CREATE TABLE provenance_claims (
    provenance_id TEXT PRIMARY KEY,
    provenance_kind TEXT NOT NULL CHECK (provenance_kind IN ('definition', 'evidence', 'limitation')),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    ledger_link_id TEXT REFERENCES ledger_links(ledger_link_id),
    claim_text TEXT NOT NULL,
    theoretical_model_id TEXT REFERENCES theoretical_models(model_id),
    theoretical_model_assessment_id TEXT REFERENCES theoretical_model_assessments(assessment_id),
    material_id TEXT REFERENCES materials(material_id),
    material_assessment_id TEXT REFERENCES material_assessments(assessment_id),
    mechanism_id TEXT REFERENCES physical_mechanisms(mechanism_id),
    mechanism_assessment_id TEXT REFERENCES mechanism_assessments(assessment_id),
    interface_id TEXT REFERENCES interfaces(interface_id),
    interface_assessment_id TEXT REFERENCES interface_assessments(assessment_id),
    process_port_id TEXT REFERENCES process_ports(port_id),
    morphism_id TEXT REFERENCES typed_morphisms(morphism_id),
    morphism_assessment_id TEXT REFERENCES morphism_assessments(assessment_id),
    path_id TEXT REFERENCES morphism_paths(path_id),
    cell_id TEXT REFERENCES siege_cells(cell_id),
    cell_assessment_id TEXT REFERENCES siege_cell_assessments(assessment_id),
    cell_decision_id TEXT REFERENCES siege_cell_decisions(decision_id),
    parameter_id TEXT REFERENCES parameter_definitions(parameter_id),
    region_id TEXT REFERENCES parameter_regions(region_id),
    region_version_id TEXT REFERENCES parameter_region_versions(region_version_id),
    conjecture_id TEXT REFERENCES conjectures(conjecture_id),
    conjecture_version_id TEXT REFERENCES conjecture_versions(conjecture_version_id),
    conjecture_disposition_id TEXT REFERENCES conjecture_dispositions(disposition_id),
    criterion_id TEXT REFERENCES falsification_criteria(criterion_id),
    protocol_id TEXT REFERENCES protocols(protocol_id),
    protocol_version_id TEXT REFERENCES protocol_versions(protocol_version_id),
    protocol_assessment_id TEXT REFERENCES protocol_provenance_assessments(assessment_id),
    run_id TEXT REFERENCES runs(run_id),
    run_assessment_id TEXT REFERENCES run_assessments(assessment_id),
    artifact_id TEXT REFERENCES evidence_artifacts(artifact_id),
    gate_result_id TEXT REFERENCES gate_results(gate_result_id),
    gate_supersession_id TEXT REFERENCES gate_result_supersessions(supersession_id),
    comparison_id TEXT REFERENCES comparisons(comparison_id),
    comparison_supersession_id TEXT REFERENCES comparison_supersessions(supersession_id),
    CHECK (provenance_kind != 'evidence' OR ledger_link_id IS NOT NULL),
    CHECK (
        (theoretical_model_id IS NOT NULL) +
        (theoretical_model_assessment_id IS NOT NULL) +
        (material_id IS NOT NULL) + (material_assessment_id IS NOT NULL) +
        (mechanism_id IS NOT NULL) + (mechanism_assessment_id IS NOT NULL) +
        (interface_id IS NOT NULL) + (interface_assessment_id IS NOT NULL) +
        (process_port_id IS NOT NULL) + (morphism_id IS NOT NULL) +
        (morphism_assessment_id IS NOT NULL) + (path_id IS NOT NULL) +
        (cell_id IS NOT NULL) + (cell_assessment_id IS NOT NULL) +
        (cell_decision_id IS NOT NULL) + (parameter_id IS NOT NULL) +
        (region_id IS NOT NULL) + (region_version_id IS NOT NULL) +
        (conjecture_id IS NOT NULL) + (conjecture_version_id IS NOT NULL) +
        (conjecture_disposition_id IS NOT NULL) + (criterion_id IS NOT NULL) +
        (protocol_id IS NOT NULL) + (protocol_version_id IS NOT NULL) +
        (protocol_assessment_id IS NOT NULL) + (run_id IS NOT NULL) +
        (run_assessment_id IS NOT NULL) + (artifact_id IS NOT NULL) +
        (gate_result_id IS NOT NULL) + (gate_supersession_id IS NOT NULL) +
        (comparison_id IS NOT NULL) + (comparison_supersession_id IS NOT NULL) = 1
    )
) STRICT;

CREATE INDEX admissions_sequence ON admissions(admission_sequence);
CREATE INDEX theoretical_model_assessments_latest ON theoretical_model_assessments(model_id, revision DESC);
CREATE INDEX material_assessments_latest ON material_assessments(material_id, revision DESC);
CREATE INDEX mechanism_assessments_latest ON mechanism_assessments(mechanism_id, revision DESC);
CREATE INDEX interface_assessments_latest ON interface_assessments(interface_id, revision DESC);
CREATE INDEX morphisms_axes ON typed_morphisms(model_id, material_id, mechanism_id, interface_id, morphism_id);
CREATE INDEX morphism_assessments_latest ON morphism_assessments(morphism_id, revision DESC);
CREATE INDEX paths_axes ON morphism_paths(model_id, material_id, mechanism_id, interface_id, path_id);
CREATE INDEX siege_cells_axes ON siege_cells(model_id, material_id, mechanism_id, interface_id);
CREATE INDEX siege_cell_assessments_latest ON siege_cell_assessments(cell_id, revision DESC);
CREATE INDEX siege_cell_decisions_latest ON siege_cell_decisions(cell_id, revision DESC);
CREATE INDEX region_versions_latest ON parameter_region_versions(region_id, revision DESC);
CREATE INDEX conjecture_versions_latest ON conjecture_versions(conjecture_id, revision DESC);
CREATE INDEX conjecture_dispositions_latest ON conjecture_dispositions(conjecture_id, revision DESC);
CREATE INDEX protocol_versions_latest ON protocol_versions(protocol_id, revision DESC);
CREATE INDEX protocol_assessments_latest ON protocol_provenance_assessments(protocol_version_id, revision DESC);
CREATE INDEX run_assessments_latest ON run_assessments(run_id, revision DESC);
CREATE INDEX provenance_admission_ledger ON provenance_claims(source_admission_id, ledger_link_id);

CREATE VIEW current_siege_cell_decisions AS
SELECT d.* FROM siege_cell_decisions d
WHERE d.revision = (SELECT MAX(x.revision) FROM siege_cell_decisions x WHERE x.cell_id = d.cell_id);

CREATE VIEW current_conjecture_versions AS
SELECT v.* FROM conjecture_versions v
WHERE v.revision = (SELECT MAX(x.revision) FROM conjecture_versions x WHERE x.conjecture_id = v.conjecture_id);

CREATE VIEW current_conjecture_dispositions AS
SELECT d.* FROM conjecture_dispositions d
WHERE d.revision = (SELECT MAX(x.revision) FROM conjecture_dispositions x WHERE x.conjecture_id = d.conjecture_id);

CREATE VIEW current_run_assessments AS
SELECT a.* FROM run_assessments a
WHERE a.revision = (SELECT MAX(x.revision) FROM run_assessments x WHERE x.run_id = a.run_id);

CREATE VIEW current_gate_results AS
SELECT g.* FROM gate_results g
WHERE NOT EXISTS (
    SELECT 1 FROM gate_result_supersessions s WHERE s.prior_gate_result_id = g.gate_result_id
);

CREATE VIEW current_comparisons AS
SELECT c.* FROM comparisons c
WHERE NOT EXISTS (
    SELECT 1 FROM comparison_supersessions s WHERE s.prior_comparison_id = c.comparison_id
);

-- The siege began as three categorical dimensions. Observation interface was
-- introduced later and is therefore explicit as the fourth dimension rather
-- than being silently folded into the original framing.
CREATE VIEW siege_space_dimensions AS
SELECT
    1 AS dimension_order,
    'theoretical-model' AS dimension_key,
    'Theoretical model' AS dimension_name,
    'original-three-dimensional-axis' AS dimension_role,
    ROW_NUMBER() OVER (ORDER BY m.model_id) AS member_order,
    m.model_id AS member_id,
    m.name AS member_name,
    a.assessment_id AS current_assessment_id,
    a.revision AS current_assessment_revision,
    a.epistemic_status AS current_assessment_status,
    NULL AS current_assessment_detail,
    a.assessed_at,
    a.rationale AS assessment_rationale,
    a.assessment_scope,
    a.source_admission_id
FROM theoretical_models m
LEFT JOIN theoretical_model_assessments a ON a.model_id = m.model_id
    AND a.revision = (
        SELECT MAX(x.revision) FROM theoretical_model_assessments x WHERE x.model_id = m.model_id
    )
UNION ALL
SELECT
    2 AS dimension_order,
    'physical-material' AS dimension_key,
    'Physical material' AS dimension_name,
    'original-three-dimensional-axis' AS dimension_role,
    ROW_NUMBER() OVER (ORDER BY m.material_id) AS member_order,
    m.material_id AS member_id,
    m.name AS member_name,
    a.assessment_id AS current_assessment_id,
    a.revision AS current_assessment_revision,
    a.epistemic_status AS current_assessment_status,
    a.material_classification AS current_assessment_detail,
    a.assessed_at,
    a.rationale AS assessment_rationale,
    a.assessment_scope,
    a.source_admission_id
FROM materials m
LEFT JOIN material_assessments a ON a.material_id = m.material_id
    AND a.revision = (
        SELECT MAX(x.revision) FROM material_assessments x WHERE x.material_id = m.material_id
    )
UNION ALL
SELECT
    3 AS dimension_order,
    'physical-calculation-mechanism' AS dimension_key,
    'Physical calculation mechanism' AS dimension_name,
    'original-three-dimensional-axis' AS dimension_role,
    ROW_NUMBER() OVER (ORDER BY m.mechanism_id) AS member_order,
    m.mechanism_id AS member_id,
    m.name AS member_name,
    a.assessment_id AS current_assessment_id,
    a.revision AS current_assessment_revision,
    a.epistemic_status AS current_assessment_status,
    NULL AS current_assessment_detail,
    a.assessed_at,
    a.rationale AS assessment_rationale,
    a.assessment_scope,
    a.source_admission_id
FROM physical_mechanisms m
LEFT JOIN mechanism_assessments a ON a.mechanism_id = m.mechanism_id
    AND a.revision = (
        SELECT MAX(x.revision) FROM mechanism_assessments x WHERE x.mechanism_id = m.mechanism_id
    )
UNION ALL
SELECT
    4 AS dimension_order,
    'observation-interface' AS dimension_key,
    'Observation interface' AS dimension_name,
    'later-added-fourth-dimension' AS dimension_role,
    ROW_NUMBER() OVER (ORDER BY i.interface_id) AS member_order,
    i.interface_id AS member_id,
    i.name AS member_name,
    a.assessment_id AS current_assessment_id,
    a.revision AS current_assessment_revision,
    a.epistemic_status AS current_assessment_status,
    i.observation_kind AS current_assessment_detail,
    a.assessed_at,
    a.rationale AS assessment_rationale,
    a.assessment_scope,
    a.source_admission_id
FROM interfaces i
LEFT JOIN interface_assessments a ON a.interface_id = i.interface_id
    AND a.revision = (
        SELECT MAX(x.revision) FROM interface_assessments x WHERE x.interface_id = i.interface_id
    );
