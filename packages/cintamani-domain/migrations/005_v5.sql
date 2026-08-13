-- Proposed experiments and capability-based equipment types.
-- These records are versioned domain proposals, not runs, results, evidence, or
-- canonical scientific admissions. Every mutable description is append-only.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS experiments (
    experiment_id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_versions (
    experiment_version_id TEXT PRIMARY KEY,
    experiment_id TEXT NOT NULL REFERENCES experiments(experiment_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    formulated_at TEXT NOT NULL,
    title TEXT NOT NULL,
    experiment_kind TEXT NOT NULL CHECK (experiment_kind IN ('physical', 'simulation', 'analytical', 'hybrid')),
    intent TEXT NOT NULL CHECK (intent IN ('falsification', 'discrimination', 'characterization', 'calibration', 'replication')),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_targets (
    target_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    target_order INTEGER NOT NULL CHECK (target_order > 0),
    target_kind TEXT NOT NULL CHECK (target_kind IN (
        'problem-version', 'conjecture-version', 'research-topic-version',
        'coordinate', 'public-proposal-revision', 'external-reference'
    )),
    target_id_value TEXT NOT NULL,
    target_revision INTEGER CHECK (target_revision IS NULL OR target_revision > 0),
    target_label TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, target_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_protocols (
    protocol_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    protocol_order INTEGER NOT NULL CHECK (protocol_order > 0),
    protocol_name TEXT NOT NULL,
    minimal_decisive_test TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    decision_rule TEXT NOT NULL,
    boundary TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, protocol_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_controls (
    control_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    control_order INTEGER NOT NULL CHECK (control_order > 0),
    control_kind TEXT NOT NULL CHECK (control_kind IN ('negative', 'positive', 'matched', 'ablated', 'randomized', 'sham', 'other')),
    description TEXT NOT NULL,
    controlled_variable TEXT NOT NULL,
    expected_relation TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, control_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_observables (
    observable_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    observable_order INTEGER NOT NULL CHECK (observable_order > 0),
    name TEXT NOT NULL,
    units TEXT NOT NULL,
    measurement TEXT NOT NULL,
    aggregation TEXT NOT NULL,
    uncertainty_reporting TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, observable_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_calibrations (
    calibration_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    calibration_order INTEGER NOT NULL CHECK (calibration_order > 0),
    quantity TEXT NOT NULL,
    units TEXT NOT NULL,
    method TEXT NOT NULL,
    acceptance TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, calibration_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_repetitions (
    repetition_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL UNIQUE REFERENCES experiment_versions(experiment_version_id),
    replicate_unit TEXT NOT NULL,
    minimum_repetitions INTEGER NOT NULL CHECK (minimum_repetitions > 0),
    independent_repetitions INTEGER NOT NULL CHECK (independent_repetitions > 0),
    randomization TEXT NOT NULL,
    stopping_rule TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_uncertainty (
    uncertainty_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL UNIQUE REFERENCES experiment_versions(experiment_version_id),
    sources TEXT NOT NULL,
    propagation TEXT NOT NULL,
    reporting TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_criteria (
    criterion_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    criterion_order INTEGER NOT NULL CHECK (criterion_order > 0),
    criterion_kind TEXT NOT NULL CHECK (criterion_kind IN ('success', 'falsifier')),
    statement TEXT NOT NULL,
    metric TEXT NOT NULL,
    comparator TEXT NOT NULL,
    threshold_text TEXT NOT NULL,
    units TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, criterion_kind, criterion_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_confounds (
    confound_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    confound_order INTEGER NOT NULL CHECK (confound_order > 0),
    confound TEXT NOT NULL,
    detection_control TEXT NOT NULL,
    mitigation TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, confound_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_raw_artifacts (
    raw_artifact_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    artifact_order INTEGER NOT NULL CHECK (artifact_order > 0),
    artifact_kind TEXT NOT NULL,
    format TEXT NOT NULL,
    retention TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, artifact_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_nonclaims (
    nonclaim_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    nonclaim_order INTEGER NOT NULL CHECK (nonclaim_order > 0),
    statement TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, nonclaim_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_dependencies (
    dependency_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    dependency_order INTEGER NOT NULL CHECK (dependency_order > 0),
    target_experiment_id TEXT NOT NULL REFERENCES experiments(experiment_id),
    target_revision INTEGER NOT NULL CHECK (target_revision > 0),
    relation_kind TEXT NOT NULL CHECK (relation_kind IN ('depends-on', 'requires-control', 'uses-protocol', 'tests')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, dependency_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_relations (
    relation_id TEXT PRIMARY KEY,
    source_experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    target_experiment_id TEXT NOT NULL REFERENCES experiments(experiment_id),
    target_revision INTEGER NOT NULL CHECK (target_revision > 0),
    relation_kind TEXT NOT NULL CHECK (relation_kind IN (
        'depends-on', 'rival-to', 'complements', 'refines',
        'reclassifies', 'addresses-same-problem', 'tests'
    )),
    relation_claim TEXT NOT NULL,
    relation_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (source_experiment_version_id != target_experiment_id || target_revision != 1),
    UNIQUE (source_experiment_version_id, target_experiment_id, target_revision, relation_kind)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_types (
    equipment_type_id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_type_versions (
    equipment_type_version_id TEXT PRIMARY KEY,
    equipment_type_id TEXT NOT NULL REFERENCES equipment_types(equipment_type_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    formulated_at TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_id, revision)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_capabilities (
    capability_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    capability_order INTEGER NOT NULL CHECK (capability_order > 0),
    capability TEXT NOT NULL,
    units TEXT NOT NULL,
    specification TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, capability_order)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_operating_limits (
    operating_limit_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    limit_order INTEGER NOT NULL CHECK (limit_order > 0),
    parameter TEXT NOT NULL,
    lower_bound TEXT,
    upper_bound TEXT,
    units TEXT NOT NULL,
    notes TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, limit_order)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_calibrations (
    equipment_calibration_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    calibration_order INTEGER NOT NULL CHECK (calibration_order > 0),
    quantity TEXT NOT NULL,
    units TEXT NOT NULL,
    method TEXT NOT NULL,
    traceability TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, calibration_order)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_safety_requirements (
    safety_requirement_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    safety_order INTEGER NOT NULL CHECK (safety_order > 0),
    hazard TEXT NOT NULL,
    requirement TEXT NOT NULL,
    mitigation TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, safety_order)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_interface_requirements (
    interface_requirement_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    interface_order INTEGER NOT NULL CHECK (interface_order > 0),
    interface_kind TEXT NOT NULL,
    specification TEXT NOT NULL,
    units TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, interface_order)
) STRICT;

CREATE TABLE IF NOT EXISTS equipment_nonclaims (
    nonclaim_id TEXT PRIMARY KEY,
    equipment_type_version_id TEXT NOT NULL REFERENCES equipment_type_versions(equipment_type_version_id),
    nonclaim_order INTEGER NOT NULL CHECK (nonclaim_order > 0),
    statement TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (equipment_type_version_id, nonclaim_order)
) STRICT;

CREATE TABLE IF NOT EXISTS experiment_equipment_requirements (
    requirement_id TEXT PRIMARY KEY,
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    group_id TEXT NOT NULL,
    group_order INTEGER NOT NULL CHECK (group_order > 0),
    group_kind TEXT NOT NULL CHECK (group_kind IN ('required', 'optional', 'alternative')),
    selection_rule TEXT NOT NULL CHECK (selection_rule IN ('any-one', 'at-least-n')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    capability TEXT NOT NULL,
    units TEXT NOT NULL,
    specification TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (experiment_version_id, group_id, capability)
) STRICT;

CREATE TABLE IF NOT EXISTS research_topic_experiment_links (
    link_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    experiment_version_id TEXT NOT NULL REFERENCES experiment_versions(experiment_version_id),
    relation_kind TEXT NOT NULL CHECK (relation_kind IN ('next-discriminating-test', 'strongest-falsifier', 'candidate-protocol')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, experiment_version_id, relation_kind)
) STRICT;

CREATE INDEX IF NOT EXISTS experiment_versions_latest ON experiment_versions(experiment_id, revision DESC);
CREATE INDEX IF NOT EXISTS equipment_type_versions_latest ON equipment_type_versions(equipment_type_id, revision DESC);
CREATE INDEX IF NOT EXISTS experiment_targets_kind ON experiment_targets(target_kind, target_id_value);
CREATE INDEX IF NOT EXISTS experiment_requirements_capability ON experiment_equipment_requirements(capability);
CREATE INDEX IF NOT EXISTS research_topic_experiments_topic ON research_topic_experiment_links(topic_version_id);

CREATE VIEW IF NOT EXISTS current_experiment_versions AS
SELECT v.* FROM experiment_versions v
WHERE v.revision = (SELECT MAX(x.revision) FROM experiment_versions x WHERE x.experiment_id = v.experiment_id);

CREATE VIEW IF NOT EXISTS current_equipment_type_versions AS
SELECT v.* FROM equipment_type_versions v
WHERE v.revision = (SELECT MAX(x.revision) FROM equipment_type_versions x WHERE x.equipment_type_id = v.equipment_type_id);

DROP VIEW IF EXISTS experiment_invariant_violations;
CREATE VIEW experiment_invariant_violations AS
SELECT 'experiment-version-missing-target' AS violation_kind, v.experiment_version_id AS entity_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_targets t WHERE t.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-protocol', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_protocols p WHERE p.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-observable', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_observables o WHERE o.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-repetition', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_repetitions r WHERE r.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-uncertainty', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_uncertainty u WHERE u.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-falsifier', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (
    SELECT 1 FROM experiment_criteria c
    WHERE c.experiment_version_id = v.experiment_version_id AND c.criterion_kind = 'falsifier'
)
UNION ALL
SELECT 'experiment-version-missing-success', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (
    SELECT 1 FROM experiment_criteria c
    WHERE c.experiment_version_id = v.experiment_version_id AND c.criterion_kind = 'success'
)
UNION ALL
SELECT 'experiment-version-missing-raw-artifact', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_raw_artifacts a WHERE a.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-nonclaim', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_nonclaims n WHERE n.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'experiment-version-missing-equipment-requirement', v.experiment_version_id
FROM experiment_versions v
WHERE NOT EXISTS (SELECT 1 FROM experiment_equipment_requirements r WHERE r.experiment_version_id = v.experiment_version_id)
UNION ALL
SELECT 'equipment-version-missing-capability', v.equipment_type_version_id
FROM equipment_type_versions v
WHERE NOT EXISTS (SELECT 1 FROM equipment_capabilities c WHERE c.equipment_type_version_id = v.equipment_type_version_id)
UNION ALL
SELECT 'equipment-version-missing-safety', v.equipment_type_version_id
FROM equipment_type_versions v
WHERE NOT EXISTS (SELECT 1 FROM equipment_safety_requirements s WHERE s.equipment_type_version_id = v.equipment_type_version_id);

-- Provenance is a typed one-target relation. Rebuild the strict table to extend
-- the existing v4 target union without rewriting any prior row content.
DROP TABLE IF EXISTS _v5_provenance_claims;
CREATE TABLE _v5_provenance_claims (
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
    problem_id TEXT REFERENCES problems(problem_id),
    problem_version_id TEXT REFERENCES problem_versions(problem_version_id),
    conjecture_id TEXT REFERENCES conjectures(conjecture_id),
    conjecture_version_id TEXT REFERENCES conjecture_versions(conjecture_version_id),
    conjecture_framing_id TEXT REFERENCES conjecture_framings(framing_id),
    conjecture_disposition_id TEXT REFERENCES conjecture_dispositions(disposition_id),
    research_topic_id TEXT REFERENCES research_topics(topic_id),
    research_topic_version_id TEXT REFERENCES research_topic_versions(topic_version_id),
    research_topic_workflow_event_id TEXT REFERENCES research_topic_workflow_events(workflow_event_id),
    research_topic_relation_id TEXT REFERENCES research_topic_relations(relation_id),
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
    experiment_id TEXT REFERENCES experiments(experiment_id),
    experiment_version_id TEXT REFERENCES experiment_versions(experiment_version_id),
    experiment_target_id TEXT REFERENCES experiment_targets(target_id),
    experiment_relation_id TEXT REFERENCES experiment_relations(relation_id),
    experiment_equipment_requirement_id TEXT REFERENCES experiment_equipment_requirements(requirement_id),
    equipment_type_id TEXT REFERENCES equipment_types(equipment_type_id),
    equipment_type_version_id TEXT REFERENCES equipment_type_versions(equipment_type_version_id),
    equipment_capability_id TEXT REFERENCES equipment_capabilities(capability_id),
    equipment_operating_limit_id TEXT REFERENCES equipment_operating_limits(operating_limit_id),
    equipment_calibration_id TEXT REFERENCES equipment_calibrations(equipment_calibration_id),
    equipment_safety_requirement_id TEXT REFERENCES equipment_safety_requirements(safety_requirement_id),
    equipment_interface_requirement_id TEXT REFERENCES equipment_interface_requirements(interface_requirement_id),
    research_topic_experiment_link_id TEXT REFERENCES research_topic_experiment_links(link_id),
    CHECK (provenance_kind != 'evidence' OR ledger_link_id IS NOT NULL),
    CHECK (
        (theoretical_model_id IS NOT NULL) + (theoretical_model_assessment_id IS NOT NULL) +
        (material_id IS NOT NULL) + (material_assessment_id IS NOT NULL) +
        (mechanism_id IS NOT NULL) + (mechanism_assessment_id IS NOT NULL) +
        (interface_id IS NOT NULL) + (interface_assessment_id IS NOT NULL) +
        (process_port_id IS NOT NULL) + (morphism_id IS NOT NULL) +
        (morphism_assessment_id IS NOT NULL) + (path_id IS NOT NULL) +
        (cell_id IS NOT NULL) + (cell_assessment_id IS NOT NULL) +
        (cell_decision_id IS NOT NULL) + (parameter_id IS NOT NULL) +
        (region_id IS NOT NULL) + (region_version_id IS NOT NULL) +
        (problem_id IS NOT NULL) + (problem_version_id IS NOT NULL) +
        (conjecture_id IS NOT NULL) + (conjecture_version_id IS NOT NULL) +
        (conjecture_framing_id IS NOT NULL) + (conjecture_disposition_id IS NOT NULL) +
        (research_topic_id IS NOT NULL) + (research_topic_version_id IS NOT NULL) +
        (research_topic_workflow_event_id IS NOT NULL) + (research_topic_relation_id IS NOT NULL) +
        (criterion_id IS NOT NULL) + (protocol_id IS NOT NULL) +
        (protocol_version_id IS NOT NULL) + (protocol_assessment_id IS NOT NULL) +
        (run_id IS NOT NULL) + (run_assessment_id IS NOT NULL) +
        (artifact_id IS NOT NULL) + (gate_result_id IS NOT NULL) +
        (gate_supersession_id IS NOT NULL) + (comparison_id IS NOT NULL) +
        (comparison_supersession_id IS NOT NULL) + (experiment_id IS NOT NULL) +
        (experiment_version_id IS NOT NULL) + (experiment_target_id IS NOT NULL) +
        (experiment_relation_id IS NOT NULL) + (experiment_equipment_requirement_id IS NOT NULL) +
        (equipment_type_id IS NOT NULL) + (equipment_type_version_id IS NOT NULL) +
        (equipment_capability_id IS NOT NULL) + (equipment_operating_limit_id IS NOT NULL) +
        (equipment_calibration_id IS NOT NULL) + (equipment_safety_requirement_id IS NOT NULL) +
        (equipment_interface_requirement_id IS NOT NULL) + (research_topic_experiment_link_id IS NOT NULL) = 1
    )
) STRICT;

INSERT INTO _v5_provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    problem_id, problem_version_id, conjecture_id, conjecture_version_id,
    conjecture_framing_id, conjecture_disposition_id, research_topic_id,
    research_topic_version_id, research_topic_workflow_event_id, research_topic_relation_id,
    criterion_id, protocol_id, protocol_version_id, protocol_assessment_id, run_id,
    run_assessment_id, artifact_id, gate_result_id, gate_supersession_id, comparison_id,
    comparison_supersession_id
)
SELECT
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    problem_id, problem_version_id, conjecture_id, conjecture_version_id,
    conjecture_framing_id, conjecture_disposition_id, research_topic_id,
    research_topic_version_id, research_topic_workflow_event_id, research_topic_relation_id,
    criterion_id, protocol_id, protocol_version_id, protocol_assessment_id, run_id,
    run_assessment_id, artifact_id, gate_result_id, gate_supersession_id, comparison_id,
    comparison_supersession_id
FROM provenance_claims;

DROP TABLE provenance_claims;
ALTER TABLE _v5_provenance_claims RENAME TO provenance_claims;
CREATE INDEX IF NOT EXISTS provenance_admission_ledger_v5 ON provenance_claims(source_admission_id, ledger_link_id);

CREATE VIEW IF NOT EXISTS current_experiment_equipment_requirements AS
SELECT r.* FROM experiment_equipment_requirements r
JOIN current_experiment_versions v ON v.experiment_version_id = r.experiment_version_id;

DROP TABLE IF EXISTS _v5_migration_lineage;
CREATE TABLE _v5_migration_lineage (
    migration_id TEXT PRIMARY KEY,
    source_schema_version TEXT NOT NULL,
    target_schema_version TEXT NOT NULL CHECK (target_schema_version IN ('2', '3', '4', '5')),
    migration_kind TEXT NOT NULL CHECK (migration_kind IN (
        'clean-v2', 'clean-v3', 'clean-v4', 'clean-v5', 'owned-v1-upgrade',
        'owned-v2-rebuild', 'owned-v2-upgrade', 'owned-v3-rebuild',
        'owned-v4-rebuild', 'owned-v5-rebuild'
    )),
    chain_head TEXT NOT NULL,
    applied_at TEXT NOT NULL
) STRICT;
INSERT INTO _v5_migration_lineage SELECT * FROM migration_lineage;
DROP TABLE migration_lineage;
ALTER TABLE _v5_migration_lineage RENAME TO migration_lineage;

UPDATE metadata SET value = '5' WHERE key = 'schema_version';
UPDATE migration_lineage SET target_schema_version = '5';

PRAGMA foreign_keys = ON;
