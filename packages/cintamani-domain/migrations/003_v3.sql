-- Problem-led conjectures. This migration changes organizational structure only:
-- it creates no siege cell, scientific assessment, or epistemic decision.
PRAGMA foreign_keys = OFF;

CREATE TABLE problems (
    problem_id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE problem_versions (
    problem_version_id TEXT PRIMARY KEY,
    problem_id TEXT NOT NULL REFERENCES problems(problem_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    formulated_at TEXT NOT NULL,
    problem_statement TEXT NOT NULL,
    rationale TEXT NOT NULL,
    problem_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (problem_id, revision)
) STRICT;

-- Existing conjectures receive a conservative structural problem. This is retrospective
-- organization, not a new claim about their scientific merit.
INSERT INTO problems (problem_id, label, source_admission_id)
SELECT 'problem-for-' || conjecture_id, label || ' — motivating problem', source_admission_id
FROM conjectures;

INSERT INTO problem_versions (
    problem_version_id, problem_id, revision, event_kind, formulated_at,
    problem_statement, rationale, problem_scope, source_admission_id
)
SELECT
    'problem-for-' || q.conjecture_id || '-v1',
    'problem-for-' || q.conjecture_id,
    1,
    'definition',
    a.admitted_at,
    'What bounded problem does the legacy conjecture "' || replace(q.label, '"', '""') || '" attempt to explain?',
    'Retrospective schema-v3 structural backfill only; the original statement and disposition remain authoritative.',
    'Preserves the original conjecture scope without adding scientific standing.',
    q.source_admission_id
FROM conjectures q
JOIN admissions a ON a.admission_id = q.source_admission_id;

CREATE TABLE conjecture_framings (
    framing_id TEXT PRIMARY KEY,
    conjecture_version_id TEXT NOT NULL REFERENCES conjecture_versions(conjecture_version_id),
    framing_order INTEGER NOT NULL CHECK (framing_order > 0),
    coordinate_key_version TEXT NOT NULL CHECK (coordinate_key_version = 'cintamani.coordinate-key.v1'),
    coordinate_key TEXT NOT NULL,
    validation_generation TEXT NOT NULL,
    model_id TEXT NOT NULL REFERENCES theoretical_models(model_id),
    material_id TEXT NOT NULL REFERENCES materials(material_id),
    mechanism_id TEXT NOT NULL REFERENCES physical_mechanisms(mechanism_id),
    interface_id TEXT NOT NULL REFERENCES interfaces(interface_id),
    coordinate_classification TEXT NOT NULL CHECK (coordinate_classification IN ('admitted-cell', 'gap')),
    cell_id TEXT REFERENCES siege_cells(cell_id),
    framing_rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (conjecture_version_id, framing_order),
    UNIQUE (conjecture_version_id, coordinate_key),
    CHECK (
        (coordinate_classification = 'admitted-cell' AND cell_id IS NOT NULL) OR
        (coordinate_classification = 'gap' AND cell_id IS NULL)
    ),
    FOREIGN KEY (cell_id, model_id, material_id, mechanism_id, interface_id)
        REFERENCES siege_cells(cell_id, model_id, material_id, mechanism_id, interface_id)
) STRICT;

INSERT INTO conjecture_framings (
    framing_id, conjecture_version_id, framing_order, coordinate_key_version,
    coordinate_key, validation_generation, model_id, material_id, mechanism_id,
    interface_id, coordinate_classification, cell_id, framing_rationale,
    source_admission_id
)
SELECT
    'framing-backfill-' || v.conjecture_version_id,
    v.conjecture_version_id,
    1,
    'cintamani.coordinate-key.v1',
    length(CAST('cintamani.coordinate-key.v1' AS BLOB)) || ':cintamani.coordinate-key.v1' ||
      '|' || length(CAST(c.model_id AS BLOB)) || ':' || c.model_id ||
      '|' || length(CAST(c.material_id AS BLOB)) || ':' || c.material_id ||
      '|' || length(CAST(c.mechanism_id AS BLOB)) || ':' || c.mechanism_id ||
      '|' || length(CAST(c.interface_id AS BLOB)) || ':' || c.interface_id,
    (SELECT value FROM metadata WHERE key = 'chain_generation'),
    c.model_id,
    c.material_id,
    c.mechanism_id,
    c.interface_id,
    'admitted-cell',
    c.cell_id,
    'Retrospective framing of the exact previously required siege cell; no new cell or status is created.',
    v.source_admission_id
FROM conjecture_versions v
JOIN conjectures q ON q.conjecture_id = v.conjecture_id
JOIN siege_cells c ON c.cell_id = q.cell_id;

CREATE TABLE _v3_conjectures (
    conjecture_id TEXT PRIMARY KEY,
    problem_id TEXT NOT NULL REFERENCES problems(problem_id),
    label TEXT NOT NULL UNIQUE,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

INSERT INTO _v3_conjectures (conjecture_id, problem_id, label, source_admission_id)
SELECT conjecture_id, 'problem-for-' || conjecture_id, label, source_admission_id
FROM conjectures;

DROP TABLE conjectures;
ALTER TABLE _v3_conjectures RENAME TO conjectures;

CREATE TABLE _v3_provenance_claims (
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
        (problem_id IS NOT NULL) + (problem_version_id IS NOT NULL) +
        (conjecture_id IS NOT NULL) + (conjecture_version_id IS NOT NULL) +
        (conjecture_framing_id IS NOT NULL) +
        (conjecture_disposition_id IS NOT NULL) + (criterion_id IS NOT NULL) +
        (protocol_id IS NOT NULL) + (protocol_version_id IS NOT NULL) +
        (protocol_assessment_id IS NOT NULL) + (run_id IS NOT NULL) +
        (run_assessment_id IS NOT NULL) + (artifact_id IS NOT NULL) +
        (gate_result_id IS NOT NULL) + (gate_supersession_id IS NOT NULL) +
        (comparison_id IS NOT NULL) + (comparison_supersession_id IS NOT NULL) = 1
    )
) STRICT;

INSERT INTO _v3_provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    conjecture_id, conjecture_version_id, conjecture_disposition_id, criterion_id,
    protocol_id, protocol_version_id, protocol_assessment_id, run_id, run_assessment_id,
    artifact_id, gate_result_id, gate_supersession_id, comparison_id, comparison_supersession_id
)
SELECT
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    conjecture_id, conjecture_version_id, conjecture_disposition_id, criterion_id,
    protocol_id, protocol_version_id, protocol_assessment_id, run_id, run_assessment_id,
    artifact_id, gate_result_id, gate_supersession_id, comparison_id, comparison_supersession_id
FROM provenance_claims;

DROP TABLE provenance_claims;
ALTER TABLE _v3_provenance_claims RENAME TO provenance_claims;

INSERT INTO provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id,
    claim_text, problem_id
)
SELECT
    'provenance-problem-backfill-' || q.conjecture_id,
    'definition',
    q.source_admission_id,
    NULL,
    'Retrospective schema-v3 problem identity for legacy conjecture ' || q.conjecture_id || '.',
    q.problem_id
FROM conjectures q;

INSERT INTO provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id,
    claim_text, problem_version_id
)
SELECT
    'provenance-problem-version-backfill-' || v.conjecture_version_id,
    'definition',
    v.source_admission_id,
    NULL,
    'Retrospective schema-v3 problem version paired with legacy conjecture version ' || v.conjecture_version_id || '.',
    pv.problem_version_id
FROM conjecture_versions v
JOIN conjectures q USING (conjecture_id)
JOIN problem_versions pv ON pv.problem_id = q.problem_id AND pv.revision = 1;

INSERT INTO provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id,
    claim_text, conjecture_framing_id
)
SELECT
    'provenance-framing-backfill-' || f.conjecture_version_id,
    'limitation',
    f.source_admission_id,
    NULL,
    'Retrospective exact-cell framing only; no new siege cell or epistemic status.',
    f.framing_id
FROM conjecture_framings f;

CREATE INDEX problem_versions_latest ON problem_versions(problem_id, revision DESC);
CREATE INDEX conjecture_framings_version ON conjecture_framings(conjecture_version_id, framing_order);
CREATE INDEX conjecture_framings_coordinate ON conjecture_framings(coordinate_key, validation_generation);
CREATE INDEX provenance_admission_ledger_v3 ON provenance_claims(source_admission_id, ledger_link_id);

CREATE VIEW current_problem_versions AS
SELECT v.* FROM problem_versions v
WHERE v.revision = (SELECT MAX(x.revision) FROM problem_versions x WHERE x.problem_id = v.problem_id);

UPDATE metadata SET value = '3' WHERE key = 'schema_version';
UPDATE migration_lineage SET target_schema_version = '3';

PRAGMA foreign_keys = ON;
