-- Problem-derived research topics. Topics are fallible organizational prompts,
-- not scientific evidence, truth claims, or roadmap authority.
PRAGMA foreign_keys = OFF;

CREATE TABLE research_topics (
    topic_id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    topic_kind TEXT NOT NULL CHECK (topic_kind = 'problem-derived-research-topic'),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id)
) STRICT;

CREATE TABLE research_topic_versions (
    topic_version_id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES research_topics(topic_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind IN ('definition', 'correction', 'supersession')),
    formulated_at TEXT NOT NULL,
    title TEXT NOT NULL,
    open_problem TEXT NOT NULL,
    why_open TEXT NOT NULL,
    topic_scope TEXT NOT NULL,
    next_discriminating_criticism_or_test TEXT NOT NULL,
    non_claims TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_id, revision)
) STRICT;

CREATE TABLE research_topic_loci (
    locus_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    locus_order INTEGER NOT NULL CHECK (locus_order > 0),
    locus_kind TEXT NOT NULL CHECK (locus_kind IN (
        'theoretical', 'simulation', 'physical-material', 'mechanism',
        'observation', 'control-resource', 'experimental', 'ontology'
    )),
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, locus_order),
    UNIQUE (topic_version_id, locus_kind)
) STRICT;

CREATE TABLE research_topic_origins (
    origin_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    origin_order INTEGER NOT NULL CHECK (origin_order > 0),
    origin_kind TEXT NOT NULL CHECK (origin_kind IN ('problem-version', 'conjecture-version')),
    problem_version_id TEXT REFERENCES problem_versions(problem_version_id),
    conjecture_version_id TEXT REFERENCES conjecture_versions(conjecture_version_id),
    relationship TEXT NOT NULL CHECK (relationship IN (
        'derived-from', 'motivated-by', 'criticizes', 'tests'
    )),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, origin_order),
    UNIQUE (topic_version_id, problem_version_id),
    UNIQUE (topic_version_id, conjecture_version_id),
    CHECK (
        (origin_kind='problem-version' AND problem_version_id IS NOT NULL AND conjecture_version_id IS NULL)
        OR
        (origin_kind='conjecture-version' AND conjecture_version_id IS NOT NULL AND problem_version_id IS NULL)
    )
) STRICT;

CREATE TABLE research_topic_framing_links (
    framing_link_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    conjecture_framing_id TEXT NOT NULL REFERENCES conjecture_framings(framing_id),
    relationship TEXT NOT NULL CHECK (relationship IN ('frames', 'tests-framing', 'criticizes-framing')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, conjecture_framing_id, relationship)
) STRICT;

CREATE TABLE research_topic_evidence_links (
    evidence_link_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    artifact_id TEXT NOT NULL REFERENCES evidence_artifacts(artifact_id),
    relationship TEXT NOT NULL CHECK (relationship IN ('motivates', 'constrains', 'criticizes', 'candidate-test-input')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, artifact_id, relationship)
) STRICT;

CREATE TABLE research_topic_test_links (
    test_link_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    criterion_id TEXT NOT NULL REFERENCES falsification_criteria(criterion_id),
    relationship TEXT NOT NULL CHECK (relationship IN ('candidate-test', 'discriminates', 'criticizes')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, criterion_id, relationship)
) STRICT;

CREATE TABLE research_topic_public_links (
    public_link_id TEXT PRIMARY KEY,
    topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    link_order INTEGER NOT NULL CHECK (link_order > 0),
    link_kind TEXT NOT NULL CHECK (link_kind IN ('public-criticism', 'public-evidence', 'public-scoped-test')),
    public_record_id TEXT NOT NULL,
    target_proposal_id TEXT NOT NULL,
    target_revision INTEGER NOT NULL CHECK (target_revision > 0),
    content_sha256 TEXT NOT NULL CHECK (length(content_sha256)=64 AND content_sha256 NOT GLOB '*[^0-9a-f]*'),
    relationship TEXT NOT NULL CHECK (relationship IN ('motivates', 'constrains', 'criticizes', 'candidate-test')),
    rationale TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_version_id, link_order),
    UNIQUE (topic_version_id, link_kind, public_record_id, content_sha256)
) STRICT;

CREATE TABLE research_topic_relations (
    relation_id TEXT PRIMARY KEY,
    source_topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    target_topic_version_id TEXT NOT NULL REFERENCES research_topic_versions(topic_version_id),
    relation_kind TEXT NOT NULL CHECK (relation_kind IN (
        'depends-on', 'rival-to', 'complements', 'refines',
        'reclassifies', 'addresses-same-problem'
    )),
    relation_claim TEXT NOT NULL,
    relation_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    CHECK (source_topic_version_id != target_topic_version_id),
    UNIQUE (source_topic_version_id, target_topic_version_id, relation_kind)
) STRICT;

CREATE TABLE research_topic_workflow_events (
    workflow_event_id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES research_topics(topic_id),
    revision INTEGER NOT NULL CHECK (revision > 0),
    event_kind TEXT NOT NULL CHECK (event_kind = 'administrative-workflow'),
    occurred_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'retired')),
    rationale TEXT NOT NULL,
    workflow_scope TEXT NOT NULL,
    source_admission_id TEXT NOT NULL REFERENCES admissions(admission_id),
    UNIQUE (topic_id, revision)
) STRICT;

CREATE TABLE _v4_provenance_claims (
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
        (comparison_supersession_id IS NOT NULL) = 1
    )
) STRICT;

INSERT INTO _v4_provenance_claims (
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    problem_id, problem_version_id, conjecture_id, conjecture_version_id,
    conjecture_framing_id, conjecture_disposition_id, criterion_id, protocol_id,
    protocol_version_id, protocol_assessment_id, run_id, run_assessment_id,
    artifact_id, gate_result_id, gate_supersession_id, comparison_id, comparison_supersession_id
)
SELECT
    provenance_id, provenance_kind, source_admission_id, ledger_link_id, claim_text,
    theoretical_model_id, theoretical_model_assessment_id, material_id, material_assessment_id,
    mechanism_id, mechanism_assessment_id, interface_id, interface_assessment_id,
    process_port_id, morphism_id, morphism_assessment_id, path_id, cell_id,
    cell_assessment_id, cell_decision_id, parameter_id, region_id, region_version_id,
    problem_id, problem_version_id, conjecture_id, conjecture_version_id,
    conjecture_framing_id, conjecture_disposition_id, criterion_id, protocol_id,
    protocol_version_id, protocol_assessment_id, run_id, run_assessment_id,
    artifact_id, gate_result_id, gate_supersession_id, comparison_id, comparison_supersession_id
FROM provenance_claims;

DROP TABLE provenance_claims;
ALTER TABLE _v4_provenance_claims RENAME TO provenance_claims;

CREATE INDEX research_topic_versions_latest ON research_topic_versions(topic_id, revision DESC);
CREATE INDEX research_topic_loci_kind ON research_topic_loci(locus_kind, topic_version_id);
CREATE INDEX research_topic_origins_problem ON research_topic_origins(problem_version_id, topic_version_id);
CREATE INDEX research_topic_origins_conjecture ON research_topic_origins(conjecture_version_id, topic_version_id);
CREATE INDEX research_topic_framings_exact ON research_topic_framing_links(conjecture_framing_id, topic_version_id);
CREATE INDEX research_topic_workflow_latest ON research_topic_workflow_events(topic_id, revision DESC);
CREATE INDEX provenance_admission_ledger_v4 ON provenance_claims(source_admission_id, ledger_link_id);

CREATE VIEW current_research_topic_versions AS
SELECT v.* FROM research_topic_versions v
WHERE v.revision = (SELECT MAX(x.revision) FROM research_topic_versions x WHERE x.topic_id=v.topic_id);

CREATE VIEW current_research_topic_workflow AS
SELECT w.* FROM research_topic_workflow_events w
WHERE w.revision = (SELECT MAX(x.revision) FROM research_topic_workflow_events x WHERE x.topic_id=w.topic_id);

CREATE VIEW research_topic_invariant_violations AS
SELECT 'topic-version-missing-locus' AS violation_kind, v.topic_version_id AS entity_id
FROM research_topic_versions v
WHERE NOT EXISTS (SELECT 1 FROM research_topic_loci l WHERE l.topic_version_id=v.topic_version_id)
UNION ALL
SELECT 'topic-version-missing-origin', v.topic_version_id
FROM research_topic_versions v
WHERE NOT EXISTS (SELECT 1 FROM research_topic_origins o WHERE o.topic_version_id=v.topic_version_id)
UNION ALL
SELECT 'topic-origin-conjecture-problem-mismatch', o.origin_id
FROM research_topic_origins o
JOIN conjecture_versions cv ON cv.conjecture_version_id=o.conjecture_version_id
JOIN conjectures c USING(conjecture_id)
WHERE o.origin_kind='conjecture-version'
  AND EXISTS (
      SELECT 1 FROM research_topic_origins p
      JOIN problem_versions pv ON pv.problem_version_id=p.problem_version_id
      WHERE p.topic_version_id=o.topic_version_id AND p.origin_kind='problem-version'
        AND pv.problem_id!=c.problem_id
  );

UPDATE metadata SET value = '4' WHERE key = 'schema_version';
UPDATE migration_lineage SET target_schema_version = '4';

PRAGMA foreign_keys = ON;
