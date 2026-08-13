use cintamani_domain::{
    AdmissionAuthority, AdmissionV2, Change, Collection, FrontierFilters, ProvenanceTarget,
    QueryFilters, RegistryPaths, coordinate_key, deterministic_logical_readback, dimensions,
    draft_admission, entity_history, entity_show, frontier, handle_mcp_request, inspect, list_page,
    preview_admission, promote_admission, rebuild, tool_descriptors, verify_chain, why,
};
use rusqlite::{Connection, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
};
use tempfile::TempDir;

fn source_workspace() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .unwrap()
}

fn copy_file(source: &Path, target: &Path) {
    fs::create_dir_all(target.parent().unwrap()).unwrap();
    fs::copy(source, target).unwrap();
}

fn copy_dir(source: &Path, target: &Path) {
    fs::create_dir_all(target).unwrap();
    for entry in fs::read_dir(source).unwrap() {
        let entry = entry.unwrap();
        let target_path = target.join(entry.file_name());
        if entry.path().is_dir() {
            copy_dir(&entry.path(), &target_path);
        } else {
            copy_file(&entry.path(), &target_path);
        }
    }
}

fn workspace() -> TempDir {
    let temp = TempDir::new().unwrap();
    let source = source_workspace();
    copy_file(
        &source.join(".narada/AGENTS.md"),
        &temp.path().join(".narada/AGENTS.md"),
    );
    copy_dir(
        &source.join(".narada/kb/cintamani-domain"),
        &temp.path().join(".narada/kb/cintamani-domain"),
    );
    for ledger in [
        "20260810-12 Rust Kerr Capacity Instrument and First Control.md",
        "20260810-13 Attribution Controls and Capacity-Estimator Calibration.md",
        "20260810-14 Detector-Noise Survival of Kerr Quadrature Memory.md",
    ] {
        copy_file(
            &source.join("src/ledger").join(ledger),
            &temp.path().join("src/ledger").join(ledger),
        );
    }
    copy_dir(
        &source.join("packages/kerr-capacity/configs"),
        &temp.path().join("packages/kerr-capacity/configs"),
    );
    temp
}

fn paths(temp: &TempDir) -> RegistryPaths {
    RegistryPaths::for_workspace(temp.path())
}

fn frozen_hash(path: &Path) -> String {
    format!("{:X}", Sha256::digest(fs::read(path).unwrap()))
}

#[test]
fn frozen_v1_bytes_rebuild_idempotently_into_v2() {
    let temp = workspace();
    let expected = [
        (
            "0001-taxonomy.json",
            "1542F65CFEAAB46383F309A1E3246346C3182D724194C57F3151752AEB65BB20",
        ),
        (
            "0002-ledger12.json",
            "18F30D6A0BF371E43E08813426B918156782DE79DE46A9C7D397DD87706D5F27",
        ),
        (
            "0003-ledger13.json",
            "EA54001407E6A50ED3D6AF577EA3652CA7B501D6162B3221B2CB015116524C37",
        ),
        (
            "0004-ledger14.json",
            "0CCD170A7F6A346E2D510B1BDB596078395742CD2E11A7E7D9E30EAC688448B9",
        ),
    ];
    for (name, hash) in expected {
        assert_eq!(
            frozen_hash(
                &temp
                    .path()
                    .join(".narada/kb/cintamani-domain/admissions")
                    .join(name)
            ),
            hash
        );
    }
    let first = rebuild(&paths(&temp)).unwrap();
    let logical = deterministic_logical_readback(&paths(&temp).database_path).unwrap();
    let second = rebuild(&paths(&temp)).unwrap();
    assert_eq!(first.schema_version, "5");
    assert_eq!(second.migration_kind, "owned-v5-rebuild");
    assert_eq!(
        logical,
        deterministic_logical_readback(&paths(&temp).database_path).unwrap()
    );
    let report = inspect(&paths(&temp)).unwrap();
    assert_eq!(report.integrity, "ok");
    assert_eq!(report.foreign_key_violations, 0);
    assert!(report.admission_chain_consistent);
    assert_eq!(
        report.history_violations + report.path_violations + report.provenance_violations,
        0
    );
    assert_eq!(report.missing_artifacts, 1);
}

fn problem_led_admission(generation: &str) -> AdmissionV2 {
    let gap_key = coordinate_key(
        "normalized-driven-kerr-resonator",
        "thin-film-litao3-candidate",
        "driven-dissipative-kerr-mixing",
        "bus-mode-coherent-quadrature",
    );
    AdmissionV2 {
        record_id: "admission-test-problem-led".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-12".to_owned(),
        description: "Test problem-led gap and unclassified conjectures without admitting a cell."
            .to_owned(),
        changes: vec![
            Change::Problem {
                problem_id: "problem-test-gap".to_owned(),
                label: "Test gap problem".to_owned(),
            },
            Change::ProblemVersion {
                problem_version_id: "problem-test-gap-v1".to_owned(),
                problem_id: "problem-test-gap".to_owned(),
                revision: 1,
                event_kind: "definition".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                problem_statement:
                    "What would explain a bounded response in this unadmitted coordinate?"
                        .to_owned(),
                rationale: "Test-only structural problem.".to_owned(),
                scope: "No scientific or material claim.".to_owned(),
            },
            Change::Conjecture {
                conjecture_id: "conjecture-test-gap".to_owned(),
                problem_id: Some("problem-test-gap".to_owned()),
                cell_id: None,
                label: "Test gap conjecture".to_owned(),
            },
            Change::ConjectureVersion {
                conjecture_version_id: "conjecture-test-gap-v1".to_owned(),
                conjecture_id: "conjecture-test-gap".to_owned(),
                revision: 1,
                event_kind: "definition".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                statement: "A deliberately non-evidentiary test conjecture.".to_owned(),
                rationale: "Exercise exact-version framing.".to_owned(),
                scope: "Registry workflow test only.".to_owned(),
            },
            Change::ConjectureFraming {
                framing_id: "framing-test-gap-v1-1".to_owned(),
                conjecture_version_id: "conjecture-test-gap-v1".to_owned(),
                framing_order: 1,
                coordinate_key_version: "cintamani.coordinate-key.v1".to_owned(),
                coordinate_key: gap_key,
                validation_generation: generation.to_owned(),
                model_id: "normalized-driven-kerr-resonator".to_owned(),
                material_id: "thin-film-litao3-candidate".to_owned(),
                mechanism_id: "driven-dissipative-kerr-mixing".to_owned(),
                interface_id: "bus-mode-coherent-quadrature".to_owned(),
                coordinate_classification: "gap".to_owned(),
                cell_id: None,
                framing_rationale: "Conjectural framing of a gap; not a cell admission.".to_owned(),
            },
            Change::ConjectureDisposition {
                disposition_id: "disposition-test-gap-r1".to_owned(),
                conjecture_id: "conjecture-test-gap".to_owned(),
                conjecture_version_id: "conjecture-test-gap-v1".to_owned(),
                revision: 1,
                event_kind: "decision".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                status: "open".to_owned(),
                rationale: "Candidate has not been tested or admitted.".to_owned(),
                scope: "Open organizational disposition only.".to_owned(),
            },
            Change::Problem {
                problem_id: "problem-test-unclassified".to_owned(),
                label: "Test unclassified problem".to_owned(),
            },
            Change::ProblemVersion {
                problem_version_id: "problem-test-unclassified-v1".to_owned(),
                problem_id: "problem-test-unclassified".to_owned(),
                revision: 1,
                event_kind: "definition".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                problem_statement: "What problem remains before a coordinate framing is chosen?"
                    .to_owned(),
                rationale: "Test zero-framing conjecture support.".to_owned(),
                scope: "No coordinate or scientific claim.".to_owned(),
            },
            Change::Conjecture {
                conjecture_id: "conjecture-test-unclassified".to_owned(),
                problem_id: Some("problem-test-unclassified".to_owned()),
                cell_id: None,
                label: "Test unclassified conjecture".to_owned(),
            },
            Change::ConjectureVersion {
                conjecture_version_id: "conjecture-test-unclassified-v1".to_owned(),
                conjecture_id: "conjecture-test-unclassified".to_owned(),
                revision: 1,
                event_kind: "definition".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                statement: "A conjecture may remain unclassified without inventing a cell."
                    .to_owned(),
                rationale: "Exercise zero coordinate framings.".to_owned(),
                scope: "Registry workflow test only.".to_owned(),
            },
            Change::ConjectureDisposition {
                disposition_id: "disposition-test-unclassified-r1".to_owned(),
                conjecture_id: "conjecture-test-unclassified".to_owned(),
                conjecture_version_id: "conjecture-test-unclassified-v1".to_owned(),
                revision: 1,
                event_kind: "decision".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                status: "open".to_owned(),
                rationale: "Candidate has not been tested or admitted.".to_owned(),
                scope: "Open organizational disposition only.".to_owned(),
            },
            provenance(
                "p-test-gap-problem",
                ProvenanceTarget::Problem("problem-test-gap".to_owned()),
            ),
            provenance(
                "p-test-gap-problem-v1",
                ProvenanceTarget::ProblemVersion("problem-test-gap-v1".to_owned()),
            ),
            provenance(
                "p-test-gap-conjecture",
                ProvenanceTarget::Conjecture("conjecture-test-gap".to_owned()),
            ),
            provenance(
                "p-test-gap-conjecture-v1",
                ProvenanceTarget::ConjectureVersion("conjecture-test-gap-v1".to_owned()),
            ),
            provenance(
                "p-test-gap-framing",
                ProvenanceTarget::ConjectureFraming("framing-test-gap-v1-1".to_owned()),
            ),
            provenance(
                "p-test-gap-disposition",
                ProvenanceTarget::ConjectureDisposition("disposition-test-gap-r1".to_owned()),
            ),
            provenance(
                "p-test-unclassified-problem",
                ProvenanceTarget::Problem("problem-test-unclassified".to_owned()),
            ),
            provenance(
                "p-test-unclassified-problem-v1",
                ProvenanceTarget::ProblemVersion("problem-test-unclassified-v1".to_owned()),
            ),
            provenance(
                "p-test-unclassified-conjecture",
                ProvenanceTarget::Conjecture("conjecture-test-unclassified".to_owned()),
            ),
            provenance(
                "p-test-unclassified-conjecture-v1",
                ProvenanceTarget::ConjectureVersion("conjecture-test-unclassified-v1".to_owned()),
            ),
            provenance(
                "p-test-unclassified-disposition",
                ProvenanceTarget::ConjectureDisposition(
                    "disposition-test-unclassified-r1".to_owned(),
                ),
            ),
        ],
    }
}

#[test]
fn problem_led_gap_and_unclassified_conjectures_preserve_coordinate_and_cell_identity() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let initial_frontier = frontier(
        &registry.database_path,
        &FrontierFilters::default(),
        None,
        100,
    )
    .unwrap();
    let initial_keys = initial_frontier
        .items
        .iter()
        .map(|item| item["coordinate_key"].as_str().unwrap().to_owned())
        .collect::<BTreeSet<_>>();
    let initial_cells = inspect(&registry).unwrap().relation_counts["siege_cells"];
    let draft = temp.path().join("problem-led.json");
    draft_admission(
        &draft,
        &problem_led_admission("bootstrap-0004-0e32d9248223"),
    )
    .unwrap();
    let preview = preview_admission(&registry, &draft, &authority()).unwrap();
    assert_eq!(preview.relation_count_deltas["problems"], 2);
    assert_eq!(preview.relation_count_deltas["conjecture_framings"], 1);
    assert_eq!(preview.relation_count_deltas["siege_cells"], 0);
    let receipt = promote_admission(&registry, &draft, &authority()).unwrap();
    assert_eq!(
        inspect(&registry).unwrap().relation_counts["siege_cells"],
        initial_cells
    );
    let connection = Connection::open(&registry.database_path).unwrap();
    let classifications: Vec<(String, i64)> = connection
        .prepare(
            "SELECT q.conjecture_id,COUNT(f.framing_id) FROM conjectures q
             JOIN conjecture_versions v USING(conjecture_id)
             LEFT JOIN conjecture_framings f USING(conjecture_version_id)
             WHERE q.conjecture_id LIKE 'conjecture-test-%'
             GROUP BY q.conjecture_id ORDER BY q.conjecture_id",
        )
        .unwrap()
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .collect::<rusqlite::Result<Vec<_>>>()
        .unwrap();
    assert_eq!(
        classifications,
        vec![
            ("conjecture-test-gap".to_owned(), 1),
            ("conjecture-test-unclassified".to_owned(), 0),
        ]
    );
    drop(connection);
    let next_frontier = frontier(
        &registry.database_path,
        &FrontierFilters::default(),
        None,
        100,
    )
    .unwrap();
    assert_eq!(
        initial_keys,
        next_frontier
            .items
            .iter()
            .map(|item| item["coordinate_key"].as_str().unwrap().to_owned())
            .collect()
    );
    assert!(
        next_frontier
            .items
            .iter()
            .all(|item| item["validation_generation"] == receipt.generation)
    );
}

#[test]
fn framing_validator_rejects_coordinate_key_classification_and_generation_drift() {
    for drift in ["key", "classification", "generation"] {
        let temp = workspace();
        let registry = paths(&temp);
        rebuild(&registry).unwrap();
        let mut record = problem_led_admission("bootstrap-0004-0e32d9248223");
        let framing = record
            .changes
            .iter_mut()
            .find_map(|change| match change {
                Change::ConjectureFraming {
                    coordinate_key,
                    validation_generation,
                    coordinate_classification,
                    cell_id,
                    ..
                } => Some((
                    coordinate_key,
                    validation_generation,
                    coordinate_classification,
                    cell_id,
                )),
                _ => None,
            })
            .unwrap();
        match drift {
            "key" => framing.0.push_str("-tampered"),
            "classification" => {
                *framing.2 = "admitted-cell".to_owned();
                *framing.3 = Some("cell-kerr-abstract-quadrature".to_owned());
            }
            "generation" => *framing.1 = "not-a-governed-generation".to_owned(),
            _ => unreachable!(),
        }
        let draft = temp.path().join(format!("bad-framing-{drift}.json"));
        draft_admission(&draft, &record).unwrap();
        assert!(preview_admission(&registry, &draft, &authority()).is_err());
    }
}

fn research_topic_admission() -> AdmissionV2 {
    AdmissionV2 {
        record_id: "admission-test-research-topic".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-12".to_owned(),
        description: "Test a problem-derived topic without adding scientific standing.".to_owned(),
        changes: vec![
            Change::ResearchTopic {
                topic_id: "topic-test-kerr-memory".to_owned(),
                label: "Test Kerr memory criticism topic".to_owned(),
            },
            Change::ResearchTopicVersion {
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                topic_id: "topic-test-kerr-memory".to_owned(),
                revision: 1,
                event_kind: "definition".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                title: "Test the boundary of the Kerr memory explanation".to_owned(),
                open_problem: "Which mechanism is essential for the local memory advantage?"
                    .to_owned(),
                why_open: "The admitted tests are bounded and leave alternative explanations."
                    .to_owned(),
                scope: "Existing normalized local evidence only.".to_owned(),
                next_discriminating_criticism_or_test:
                    "Construct a matched control that removes the proposed mechanism.".to_owned(),
                non_claims: "No device validation, truth, importance, or roadmap priority."
                    .to_owned(),
            },
            Change::ResearchTopicLocus {
                locus_id: "locus-topic-test-theoretical".to_owned(),
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                locus_order: 1,
                locus_kind: "theoretical".to_owned(),
            },
            Change::ResearchTopicLocus {
                locus_id: "locus-topic-test-simulation".to_owned(),
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                locus_order: 2,
                locus_kind: "simulation".to_owned(),
            },
            Change::ResearchTopicOrigin {
                origin_id: "origin-topic-test-problem".to_owned(),
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                origin_order: 1,
                origin_kind: "problem-version".to_owned(),
                problem_version_id: Some(
                    "problem-for-conjecture-kerr-quadrature-linear-memory-lead-v1".to_owned(),
                ),
                conjecture_version_id: None,
                relationship: "derived-from".to_owned(),
                rationale: "The topic names a criticism of this exact motivating problem."
                    .to_owned(),
            },
            Change::ResearchTopicOrigin {
                origin_id: "origin-topic-test-conjecture".to_owned(),
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                origin_order: 2,
                origin_kind: "conjecture-version".to_owned(),
                problem_version_id: None,
                conjecture_version_id: Some(
                    "conjecture-kerr-quadrature-linear-memory-lead-v1".to_owned(),
                ),
                relationship: "criticizes".to_owned(),
                rationale: "The next test criticizes this exact conjecture statement.".to_owned(),
            },
            Change::ResearchTopicFramingLink {
                framing_link_id: "framing-link-topic-test".to_owned(),
                topic_version_id: "topic-test-kerr-memory-v1".to_owned(),
                conjecture_framing_id:
                    "framing-backfill-conjecture-kerr-quadrature-linear-memory-lead-v1".to_owned(),
                relationship: "criticizes-framing".to_owned(),
                rationale: "The topic remains bounded to the exact admitted search framing."
                    .to_owned(),
            },
            Change::ResearchTopicWorkflowEvent {
                workflow_event_id: "workflow-topic-test-r1".to_owned(),
                topic_id: "topic-test-kerr-memory".to_owned(),
                revision: 1,
                event_kind: "administrative-workflow".to_owned(),
                occurred_at: "2026-08-12".to_owned(),
                status: "active".to_owned(),
                rationale: "Available for criticism.".to_owned(),
                scope: "Administrative visibility only; not an epistemic judgment.".to_owned(),
            },
            provenance(
                "p-topic-test",
                ProvenanceTarget::ResearchTopic("topic-test-kerr-memory".to_owned()),
            ),
            provenance(
                "p-topic-test-v1",
                ProvenanceTarget::ResearchTopicVersion("topic-test-kerr-memory-v1".to_owned()),
            ),
            provenance(
                "p-topic-test-workflow",
                ProvenanceTarget::ResearchTopicWorkflowEvent("workflow-topic-test-r1".to_owned()),
            ),
        ],
    }
}

#[test]
fn research_topics_require_exact_origins_and_expose_bounded_typed_views() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let draft = temp.path().join("research-topic.json");
    draft_admission(&draft, &research_topic_admission()).unwrap();
    let preview = preview_admission(&registry, &draft, &authority()).unwrap();
    assert_eq!(preview.relation_count_deltas["research_topics"], 1);
    assert_eq!(preview.relation_count_deltas["research_topic_origins"], 2);
    assert_eq!(preview.relation_count_deltas["siege_cells"], 0);
    promote_admission(&registry, &draft, &authority()).unwrap();

    let page = list_page(
        &registry.database_path,
        Collection::ResearchTopics,
        &QueryFilters {
            locus: Some("simulation".to_owned()),
            origin: Some("conjecture-kerr-quadrature-linear-memory-lead-v1".to_owned()),
            ..Default::default()
        },
        None,
        1,
    )
    .unwrap();
    assert_eq!(page.items.len(), 1);
    assert_eq!(page.items[0]["status"], "active");
    assert_eq!(page.items[0]["origins"].as_array().unwrap().len(), 2);
    let history = entity_history(
        &registry.database_path,
        Collection::ResearchTopics,
        "topic-test-kerr-memory",
        None,
        10,
    )
    .unwrap();
    assert_eq!(history.items.len(), 2);
    let explanation = why(
        &registry.database_path,
        Collection::ResearchTopics,
        "topic-test-kerr-memory",
        10,
    )
    .unwrap();
    assert_eq!(explanation["provenance"].as_array().unwrap().len(), 3);

    let mut invalid = research_topic_admission();
    invalid.record_id = "admission-test-topic-no-origin".to_owned();
    invalid
        .changes
        .retain(|change| !matches!(change, Change::ResearchTopicOrigin { .. }));
    let invalid_draft = temp.path().join("research-topic-no-origin.json");
    draft_admission(&invalid_draft, &invalid).unwrap();
    let next_authority = AdmissionAuthority {
        admitted_by: "cintamani.architect",
        authority_kind: "test-review",
        authority_ref: "test-topic-no-origin",
        expected_head: &verify_chain(&registry.workspace_root, &registry.chain_root)
            .unwrap()
            .generation,
    };
    assert!(preview_admission(&registry, &invalid_draft, &next_authority).is_err());
}

#[test]
fn dimensions_view_preserves_axis_history_current_assessments_and_empty_axes() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    let view_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master
             WHERE type='view' AND name='siege_space_dimensions'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let member_rows: i64 = connection
        .query_row("SELECT COUNT(*) FROM siege_space_dimensions", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!((view_count, member_rows), (1, 6));
    drop(connection);

    let result = dimensions(&registry.database_path).unwrap();
    assert_eq!(result.collection, "dimensions");
    assert_eq!(result.items.len(), 4);
    assert_eq!(
        result
            .items
            .iter()
            .map(|axis| (
                axis.dimension_order,
                axis.dimension_key.as_str(),
                axis.dimension_name.as_str(),
                axis.dimension_role.as_str(),
                axis.member_count,
            ))
            .collect::<Vec<_>>(),
        vec![
            (
                1,
                "theoretical-model",
                "Theoretical model",
                "original-three-dimensional-axis",
                1,
            ),
            (
                2,
                "physical-material",
                "Physical material",
                "original-three-dimensional-axis",
                2,
            ),
            (
                3,
                "physical-calculation-mechanism",
                "Physical calculation mechanism",
                "original-three-dimensional-axis",
                1,
            ),
            (
                4,
                "observation-interface",
                "Observation interface",
                "later-added-fourth-dimension",
                2,
            ),
        ]
    );
    for axis in &result.items {
        let ids = axis
            .members
            .iter()
            .map(|member| member.member_id.as_str())
            .collect::<Vec<_>>();
        let mut sorted = ids.clone();
        sorted.sort_unstable();
        assert_eq!(ids, sorted);
        for (index, member) in axis.members.iter().enumerate() {
            assert_eq!(member.member_order, (index + 1) as i64);
            assert_eq!(member.current_assessment_revision, Some(1));
            assert!(
                member
                    .current_assessment_id
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
            assert!(
                member
                    .current_assessment_status
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
            assert!(
                member
                    .assessed_at
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
            assert!(
                member
                    .assessment_rationale
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
            assert!(
                member
                    .assessment_scope
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
            assert!(
                member
                    .source_admission_id
                    .as_deref()
                    .is_some_and(|id| !id.is_empty())
            );
        }
    }
    let litao3 = result.items[1]
        .members
        .iter()
        .find(|member| member.member_id == "thin-film-litao3-candidate")
        .unwrap();
    assert_eq!(
        litao3.current_assessment_status.as_deref(),
        Some("unvalidated-candidate")
    );
    assert_eq!(
        litao3.current_assessment_detail.as_deref(),
        Some("candidate-physical-material")
    );
    assert_eq!(
        litao3.source_admission_id.as_deref(),
        Some("admission-domain-taxonomy-v1")
    );
    let quadrature = result.items[3]
        .members
        .iter()
        .find(|member| member.member_id == "bus-mode-coherent-quadrature")
        .unwrap();
    assert_eq!(
        quadrature.current_assessment_detail.as_deref(),
        Some("coherent-quadrature")
    );
    assert_eq!(
        quadrature.source_admission_id.as_deref(),
        Some("admission-ledger-13")
    );

    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .execute_batch("DROP VIEW siege_space_dimensions")
        .unwrap();
    drop(connection);
    let missing_view_report = inspect(&registry).unwrap();
    assert_eq!(missing_view_report.migration_violations, 1);
    assert!(missing_view_report.migration_violation_details[0].contains("siege_space_dimensions"));
    let error = dimensions(&registry.database_path).unwrap_err().to_string();
    assert!(error.contains("rebuild the owned schema-5 projection"));

    let empty_database = temp.path().join("empty-schema-2.sqlite");
    let empty = Connection::open(&empty_database).unwrap();
    empty
        .execute_batch(include_str!("../migrations/002_v2.sql"))
        .unwrap();
    drop(empty);
    let empty_result = dimensions(&empty_database).unwrap();
    assert_eq!(empty_result.items.len(), 4);
    assert!(
        empty_result
            .items
            .iter()
            .all(|axis| axis.member_count == 0 && axis.members.is_empty())
    );
}

#[test]
fn owned_v1_upgrade_is_classified_and_foreign_database_is_preserved() {
    let temp = workspace();
    let registry = paths(&temp);
    fs::create_dir_all(registry.database_path.parent().unwrap()).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .execute_batch(
            "CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
        INSERT INTO metadata VALUES('schema_version','1');
        INSERT INTO metadata VALUES('projection_kind','rebuildable-site-domain-registry');",
        )
        .unwrap();
    drop(connection);
    assert_eq!(
        rebuild(&registry).unwrap().migration_kind,
        "owned-v1-upgrade"
    );

    let foreign = temp.path().join("foreign.sqlite");
    let connection = Connection::open(&foreign).unwrap();
    connection
        .execute_batch("CREATE TABLE precious(value TEXT); INSERT INTO precious VALUES('keep');")
        .unwrap();
    drop(connection);
    let before = fs::read(&foreign).unwrap();
    assert!(rebuild(&registry.clone().with_database(&foreign)).is_err());
    assert_eq!(before, fs::read(&foreign).unwrap());
}

#[test]
fn chain_tamper_and_failed_rebuild_preserve_live_database_bytes() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let before = fs::read(&registry.database_path).unwrap();
    let record = temp
        .path()
        .join(".narada/kb/cintamani-domain/admissions/0002-ledger12.json");
    fs::write(&record, b"{}\n").unwrap();
    assert!(rebuild(&registry).is_err());
    assert_eq!(before, fs::read(&registry.database_path).unwrap());
}

#[test]
fn provenance_migration_and_artifact_failures_preserve_projection_and_head() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let before_database = fs::read(&registry.database_path).unwrap();
    let before_head = fs::read(registry.chain_root.join("HEAD")).unwrap();

    let missing_provenance = AdmissionV2 {
        record_id: "admission-test-missing-provenance".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-11".to_owned(),
        description: "Test rejection of a history row without exact provenance.".to_owned(),
        changes: vec![Change::MaterialAssessment {
            assessment_id: "assessment-litao3-r2-without-provenance".to_owned(),
            material_id: "thin-film-litao3-candidate".to_owned(),
            revision: 2,
            event_kind: "assessment".to_owned(),
            occurred_at: "2026-08-11".to_owned(),
            material_classification: "candidate-physical-material".to_owned(),
            epistemic_status: "unvalidated-candidate".to_owned(),
            rationale: "test".to_owned(),
            scope: "No scientific claim.".to_owned(),
        }],
    };
    let draft = temp.path().join("missing-provenance.json");
    draft_admission(&draft, &missing_provenance).unwrap();
    assert!(preview_admission(&registry, &draft, &authority()).is_err());
    assert_eq!(before_database, fs::read(&registry.database_path).unwrap());
    assert_eq!(
        before_head,
        fs::read(registry.chain_root.join("HEAD")).unwrap()
    );

    let cross_axis = AdmissionV2 {
        record_id: "admission-test-cross-axis".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-11".to_owned(),
        description: "Test rejection of a cross-axis association.".to_owned(),
        changes: vec![Change::SiegeCellMorphism {
            cell_id: "cell-kerr-abstract-intensity".to_owned(),
            morphism_id: "morphism-kerr-to-quadrature".to_owned(),
            relationship: "parallel".to_owned(),
        }],
    };
    let draft = temp.path().join("cross-axis.json");
    draft_admission(&draft, &cross_axis).unwrap();
    assert!(preview_admission(&registry, &draft, &authority()).is_err());
    assert_eq!(before_database, fs::read(&registry.database_path).unwrap());
    assert_eq!(
        before_head,
        fs::read(registry.chain_root.join("HEAD")).unwrap()
    );

    let artifact = temp
        .path()
        .join("packages/kerr-capacity/output/detector-noise-frozen/results.sqlite");
    fs::create_dir_all(artifact.parent().unwrap()).unwrap();
    fs::write(&artifact, "wrong artifact").unwrap();
    assert!(rebuild(&registry).is_err());
    assert_eq!(before_database, fs::read(&registry.database_path).unwrap());
    assert_eq!(
        before_head,
        fs::read(registry.chain_root.join("HEAD")).unwrap()
    );
}

#[test]
fn chain_rejects_insertion_deletion_reorder_stale_predecessor_duplicate_sequence_and_downgrade() {
    for mutation in ["insert", "delete", "reorder", "predecessor", "sequence"] {
        let temp = workspace();
        let manifest=temp.path().join(".narada/kb/cintamani-domain/chain/generations/bootstrap-0004-0e32d9248223/manifest.json");
        if mutation == "insert" {
            fs::write(
                temp.path()
                    .join(".narada/kb/cintamani-domain/admissions/0005-extra.json"),
                b"{}\n",
            )
            .unwrap();
        } else if mutation == "delete" {
            fs::remove_file(
                temp.path()
                    .join(".narada/kb/cintamani-domain/admissions/0004-ledger14.json"),
            )
            .unwrap();
        } else {
            let mut value: Value = serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
            if mutation == "reorder" {
                value["entries"].as_array_mut().unwrap().swap(2, 3);
            } else if mutation == "predecessor" {
                value["entries"][3]["predecessor_entry_hash"] = json!("bad");
            } else {
                value["entries"][3]["sequence"] = json!(3);
            }
            fs::write(&manifest, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
        }
        assert!(
            verify_chain(temp.path(), &paths(&temp).chain_root).is_err(),
            "mutation {mutation} accepted"
        );
    }

    let temp = workspace();
    rebuild(&paths(&temp)).unwrap();
    let record = parallel_admission();
    let draft = temp.path().join("draft.json");
    draft_admission(&draft, &record).unwrap();
    let authority = authority();
    promote_admission(&paths(&temp), &draft, &authority).unwrap();
    let active = verify_chain(temp.path(), &paths(&temp).chain_root).unwrap();
    let newest = &active.entries.last().unwrap().absolute_path;
    let mut value: Value = serde_json::from_slice(&fs::read(newest).unwrap()).unwrap();
    value["schema_version"] = json!(1);
    fs::write(newest, serde_json::to_vec_pretty(&value).unwrap()).unwrap();
    assert!(verify_chain(temp.path(), &paths(&temp).chain_root).is_err());
}

#[test]
fn schema_rejects_cross_axis_cell_links_and_path_steps() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .unwrap();
    assert!(
        connection
            .execute(
                "INSERT INTO siege_cell_morphisms VALUES(
        'cell-kerr-abstract-intensity','morphism-kerr-to-quadrature',
        'normalized-driven-kerr-resonator','abstract-normalized-medium',
        'driven-dissipative-kerr-mixing','bus-mode-intensity','parallel','admission-ledger-14')",
                []
            )
            .is_err()
    );
    assert!(
        connection
            .execute(
                "INSERT INTO morphism_path_steps VALUES(
        'path-morphism-kerr-to-intensity',2,'morphism-kerr-to-quadrature',
        'normalized-driven-kerr-resonator','abstract-normalized-medium',
        'driven-dissipative-kerr-mixing','bus-mode-intensity','admission-ledger-14')",
                []
            )
            .is_err()
    );
}

#[test]
fn gate_and_comparison_supersessions_preserve_semantic_identity_and_expose_current_rows() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .unwrap();
    connection.execute_batch(
        "INSERT INTO gate_results
         SELECT 'gate-l14-lag3-survival-corrected',run_id,criterion_id,gate_name,evidence_polarity,
                passed,metric_value,metric_text,units,seed_pass_count,seed_required_count,
                decision_scope,limitation,source_admission_id
         FROM gate_results WHERE gate_result_id='gate-l14-lag3-survival';
         INSERT INTO gate_result_supersessions VALUES(
            'supersede-lag3','gate-l14-lag3-survival','gate-l14-lag3-survival-corrected',
            '2026-08-11','test correction','admission-ledger-14');
         INSERT INTO provenance_claims(
            provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,gate_result_id)
         VALUES('p-gate-corrected','evidence','admission-ledger-14','link-l14-lag3-gate',
                'test corrected result','gate-l14-lag3-survival-corrected');
         INSERT INTO provenance_claims(
            provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,gate_supersession_id)
         VALUES('p-gate-supersession','evidence','admission-ledger-14','link-l14-lag3-gate',
                'test supersession','supersede-lag3');
         INSERT INTO comparisons
         SELECT 'comparison-l14-kerr-disabled-quadrature-corrected',run_id,baseline_run_id,control_relationship,
                metric,evidence_polarity,minimum_delta,maximum_delta,mean_delta,units,decision_scope,
                source_admission_id
         FROM comparisons WHERE comparison_id='comparison-l14-kerr-disabled-quadrature';
         INSERT INTO comparison_supersessions VALUES(
            'supersede-l14-comparison','comparison-l14-kerr-disabled-quadrature',
            'comparison-l14-kerr-disabled-quadrature-corrected','2026-08-11','test correction','admission-ledger-14');
         INSERT INTO provenance_claims(
            provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,comparison_id)
         VALUES('p-comparison-corrected','evidence','admission-ledger-14','link-l14-comparison',
                'test corrected comparison','comparison-l14-kerr-disabled-quadrature-corrected');
         INSERT INTO provenance_claims(
            provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,comparison_supersession_id)
         VALUES('p-comparison-supersession','evidence','admission-ledger-14','link-l14-comparison',
                'test comparison supersession','supersede-l14-comparison');",
    )
    .unwrap();
    let current_gate: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM current_gate_results WHERE gate_result_id='gate-l14-lag3-survival-corrected'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let current_comparison: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM current_comparisons WHERE comparison_id='comparison-l14-kerr-disabled-quadrature-corrected'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!((current_gate, current_comparison), (1, 1));
    drop(connection);
    let report = inspect(&registry).unwrap();
    assert_eq!(report.history_violations, 0);
    assert_eq!(report.provenance_violations, 0);

    let connection = Connection::open(&registry.database_path).unwrap();
    connection.execute_batch(
        "INSERT INTO gate_result_supersessions VALUES(
            'supersede-lag3-cycle','gate-l14-lag3-survival-corrected','gate-l14-lag3-survival',
            '2026-08-11','test cycle','admission-ledger-14');
         INSERT INTO provenance_claims(
            provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,gate_supersession_id)
         VALUES('p-gate-cycle','evidence','admission-ledger-14','link-l14-lag3-gate',
                'test cycle','supersede-lag3-cycle');",
    )
    .unwrap();
    drop(connection);
    assert!(
        inspect(&registry)
            .unwrap()
            .history_violation_details
            .iter()
            .any(|detail| detail.contains("supersession cycle"))
    );
}

#[test]
fn validator_rejects_noncomposable_paths_history_gaps_terminal_reversal_and_unrelated_provenance() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .unwrap();
    connection
        .execute(
            "INSERT INTO typed_morphisms VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                "parallel-bad-adjacency",
                "Parallel bad adjacency",
                "normalized-driven-kerr-resonator",
                "abstract-normalized-medium",
                "driven-dissipative-kerr-mixing",
                "bus-mode-intensity",
                "port-morphism-kerr-to-intensity-source",
                "port-morphism-kerr-to-intensity-target",
                "control",
                "Test-only parallel arrow",
                "admission-ledger-14"
            ],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO morphism_assessments VALUES(
        'assessment-parallel-bad-r1','parallel-bad-adjacency',1,'assessment','2026-08-11',
        'candidate-unvalidated','test','test','admission-ledger-14')",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO morphism_paths VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            params![
                "path-bad-adjacency",
                "Bad adjacency path",
                "normalized-driven-kerr-resonator",
                "abstract-normalized-medium",
                "driven-dissipative-kerr-mixing",
                "bus-mode-intensity",
                "port-morphism-kerr-to-intensity-source",
                "port-morphism-kerr-to-intensity-target",
                "test",
                "admission-ledger-14"
            ],
        )
        .unwrap();
    for (position, morphism) in [
        (1, "morphism-kerr-to-intensity"),
        (2, "parallel-bad-adjacency"),
    ] {
        connection
            .execute(
                "INSERT INTO morphism_path_steps VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    "path-bad-adjacency",
                    position,
                    morphism,
                    "normalized-driven-kerr-resonator",
                    "abstract-normalized-medium",
                    "driven-dissipative-kerr-mixing",
                    "bus-mode-intensity",
                    "admission-ledger-14"
                ],
            )
            .unwrap();
    }
    connection
        .execute(
            "INSERT INTO siege_cell_decisions VALUES(
        'decision-intensity-r4-gap','cell-kerr-abstract-intensity',4,'decision','2026-08-11',
        'rejected','test','test','admission-ledger-14')",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO interface_assessments VALUES(
        'assessment-interface-intensity-r2','bus-mode-intensity',2,'assessment','2026-08-11',
        'implemented-normalized-interface','test','test','admission-ledger-14')",
            [],
        )
        .unwrap();
    connection.execute("INSERT INTO provenance_claims(
        provenance_id,provenance_kind,source_admission_id,ledger_link_id,claim_text,interface_assessment_id)
        VALUES('wrong-source-provenance','evidence','admission-ledger-13','link-l13-run','wrong source',
        'assessment-interface-intensity-r2')",[]).unwrap();
    drop(connection);
    let report = inspect(&registry).unwrap();
    assert!(report.path_violations > 0);
    assert!(report.history_violations > 0);
    assert!(report.provenance_violations > 0);

    let connection = Connection::open(&registry.database_path).unwrap();
    connection
        .execute(
            "DELETE FROM siege_cell_decisions WHERE decision_id='decision-intensity-r4-gap'",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO siege_cell_decisions VALUES(
        'decision-intensity-r3-terminal','cell-kerr-abstract-intensity',3,'decision','2026-08-11',
        'rejected','test','test','admission-ledger-14')",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO siege_cell_decisions VALUES(
        'decision-intensity-r4-reversal','cell-kerr-abstract-intensity',4,'decision','2026-08-11',
        'advanced-local-lead','test','test','admission-ledger-14')",
            [],
        )
        .unwrap();
    drop(connection);
    assert!(
        inspect(&registry)
            .unwrap()
            .history_violation_details
            .iter()
            .any(|detail| detail.contains("illegal transition rejected -> advanced-local-lead"))
    );
}

fn parallel_admission() -> AdmissionV2 {
    AdmissionV2 {
        record_id: "admission-test-parallel-path".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-11".to_owned(),
        description: "Test governed parallel arrow and path.".to_owned(),
        changes: vec![
            Change::TypedMorphism {
                morphism_id: "morphism-kerr-to-intensity-parallel".to_owned(),
                name: "Parallel normalized intensity arrow".to_owned(),
                model_id: "normalized-driven-kerr-resonator".to_owned(),
                material_id: "abstract-normalized-medium".to_owned(),
                mechanism_id: "driven-dissipative-kerr-mixing".to_owned(),
                interface_id: "bus-mode-intensity".to_owned(),
                source_port_id: "port-morphism-kerr-to-intensity-source".to_owned(),
                target_port_id: "port-morphism-kerr-to-intensity-target".to_owned(),
                morphism_type: "control".to_owned(),
                description: "Parallel same-boundary test arrow.".to_owned(),
            },
            Change::MorphismAssessment {
                assessment_id: "assessment-morphism-intensity-parallel-r1".to_owned(),
                morphism_id: "morphism-kerr-to-intensity-parallel".to_owned(),
                revision: 1,
                event_kind: "assessment".to_owned(),
                occurred_at: "2026-08-11".to_owned(),
                validation_status: "candidate-unvalidated".to_owned(),
                rationale: "Workflow test.".to_owned(),
                scope: "No scientific claim.".to_owned(),
            },
            Change::MorphismPath {
                path_id: "path-morphism-kerr-to-intensity-parallel".to_owned(),
                name: "Parallel intensity one-step path".to_owned(),
                model_id: "normalized-driven-kerr-resonator".to_owned(),
                material_id: "abstract-normalized-medium".to_owned(),
                mechanism_id: "driven-dissipative-kerr-mixing".to_owned(),
                interface_id: "bus-mode-intensity".to_owned(),
                source_port_id: "port-morphism-kerr-to-intensity-source".to_owned(),
                target_port_id: "port-morphism-kerr-to-intensity-target".to_owned(),
                description: "Governed parallel path test.".to_owned(),
                steps: vec!["morphism-kerr-to-intensity-parallel".to_owned()],
            },
            Change::SiegeCellMorphism {
                cell_id: "cell-kerr-abstract-intensity".to_owned(),
                morphism_id: "morphism-kerr-to-intensity-parallel".to_owned(),
                relationship: "parallel".to_owned(),
            },
            Change::SiegeCellPath {
                cell_id: "cell-kerr-abstract-intensity".to_owned(),
                path_id: "path-morphism-kerr-to-intensity-parallel".to_owned(),
                relationship: "parallel".to_owned(),
            },
            provenance(
                "p-test-parallel-morphism",
                ProvenanceTarget::Morphism("morphism-kerr-to-intensity-parallel".to_owned()),
            ),
            provenance(
                "p-test-parallel-assessment",
                ProvenanceTarget::MorphismAssessment(
                    "assessment-morphism-intensity-parallel-r1".to_owned(),
                ),
            ),
            provenance(
                "p-test-parallel-path",
                ProvenanceTarget::Path("path-morphism-kerr-to-intensity-parallel".to_owned()),
            ),
        ],
    }
}

fn provenance(id: &str, target: ProvenanceTarget) -> Change {
    Change::ProvenanceClaim {
        provenance_id: id.to_owned(),
        provenance_kind: "definition".to_owned(),
        ledger_link_id: None,
        claim_text: "Test-only governed definition.".to_owned(),
        target,
    }
}

fn authority() -> AdmissionAuthority<'static> {
    AdmissionAuthority {
        admitted_by: "cintamani.builder",
        authority_kind: "task-lifecycle-work-result-report",
        authority_ref: "wrr_test_external_authority_receipt",
        expected_head: "bootstrap-0004-0e32d9248223",
    }
}

#[test]
fn admission_preview_is_nonmutating_and_promotion_is_stale_safe_and_parallel_capable() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let draft = temp.path().join("draft.json");
    draft_admission(&draft, &parallel_admission()).unwrap();
    let preview = preview_admission(&registry, &draft, &authority()).unwrap();
    assert!(preview.projection_valid);
    assert!(!preview.mutates_governed_head);
    assert_eq!(
        fs::read_to_string(registry.chain_root.join("HEAD"))
            .unwrap()
            .trim(),
        authority().expected_head
    );
    assert!(
        !registry
            .chain_root
            .join("generations")
            .join(&preview.proposed_generation)
            .exists()
    );
    let receipt = promote_admission(&registry, &draft, &authority()).unwrap();
    assert_eq!(receipt.admission_sequence, 5);
    assert_eq!(inspect(&registry).unwrap().path_violations, 0);
    let connection = Connection::open(&registry.database_path).unwrap();
    let parallel:i64=connection.query_row("SELECT COUNT(*) FROM siege_cell_morphisms WHERE cell_id='cell-kerr-abstract-intensity'",[],|row|row.get(0)).unwrap();
    assert_eq!(parallel, 2);
    drop(connection);
    assert!(preview_admission(&registry, &draft, &authority()).is_err());

    let second = AdmissionV2 {
        record_id: "admission-test-second-generation".to_owned(),
        schema_version: 2,
        admitted_at: "2026-08-11".to_owned(),
        description: "Prove that a successor can append after the first v2 generation.".to_owned(),
        changes: vec![
            Change::MaterialAssessment {
                assessment_id: "assessment-litao3-r2-second-generation".to_owned(),
                material_id: "thin-film-litao3-candidate".to_owned(),
                revision: 2,
                event_kind: "assessment".to_owned(),
                occurred_at: "2026-08-11".to_owned(),
                material_classification: "candidate-physical-material".to_owned(),
                epistemic_status: "unvalidated-candidate".to_owned(),
                rationale: "Governed multi-generation workflow test.".to_owned(),
                scope: "No scientific or device claim.".to_owned(),
            },
            provenance(
                "p-test-second-generation-assessment",
                ProvenanceTarget::MaterialAssessment(
                    "assessment-litao3-r2-second-generation".to_owned(),
                ),
            ),
        ],
    };
    let second_draft = temp.path().join("second-generation.json");
    draft_admission(&second_draft, &second).unwrap();
    let second_authority = AdmissionAuthority {
        admitted_by: "cintamani.builder",
        authority_kind: "task-lifecycle-work-result-report",
        authority_ref: "wrr_test_second_external_authority_receipt",
        expected_head: &receipt.generation,
    };
    let second_receipt = promote_admission(&registry, &second_draft, &second_authority).unwrap();
    assert_eq!(second_receipt.admission_sequence, 6);
    let verified = verify_chain(&registry.workspace_root, &registry.chain_root).unwrap();
    assert_eq!(verified.generation, second_receipt.generation);
    assert_eq!(verified.entries.len(), 6);
    assert_eq!(inspect(&registry).unwrap().history_violations, 0);
    let dimension_result = dimensions(&registry.database_path).unwrap();
    let current_material = dimension_result.items[1]
        .members
        .iter()
        .find(|member| member.member_id == "thin-film-litao3-candidate")
        .unwrap();
    assert_eq!(current_material.current_assessment_revision, Some(2));
    assert_eq!(
        current_material.current_assessment_id.as_deref(),
        Some("assessment-litao3-r2-second-generation")
    );
    assert_eq!(
        current_material.source_admission_id.as_deref(),
        Some("admission-test-second-generation")
    );
}

#[test]
fn admission_rejects_placeholder_authority_and_concurrent_lock() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let draft = temp.path().join("draft.json");
    draft_admission(&draft, &parallel_admission()).unwrap();
    let bad = AdmissionAuthority {
        authority_ref: "placeholder",
        ..authority()
    };
    assert!(preview_admission(&registry, &draft, &bad).is_err());
    fs::write(registry.chain_root.join("LOCK"), "held").unwrap();
    assert!(promote_admission(&registry, &draft, &authority()).is_err());
}

#[test]
fn pagination_reaches_every_row_and_rejects_wrong_or_malformed_cursors() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    for collection in Collection::ALL {
        let all = list_page(
            &registry.database_path,
            collection,
            &QueryFilters::default(),
            None,
            100,
        )
        .unwrap();
        let mut cursor = None;
        let mut reached = Vec::new();
        loop {
            let page = list_page(
                &registry.database_path,
                collection,
                &QueryFilters::default(),
                cursor.as_deref(),
                1,
            )
            .unwrap();
            reached.extend(page.items);
            cursor = page.next_cursor;
            if cursor.is_none() {
                break;
            }
        }
        assert_eq!(reached.len(), all.items.len(), "collection {collection}");
    }
    let first = list_page(
        &registry.database_path,
        Collection::Cells,
        &QueryFilters::default(),
        None,
        1,
    )
    .unwrap();
    let cursor = first.next_cursor.unwrap();
    assert!(
        list_page(
            &registry.database_path,
            Collection::Runs,
            &QueryFilters::default(),
            Some(&cursor),
            1
        )
        .is_err()
    );
    assert!(
        list_page(
            &registry.database_path,
            Collection::Cells,
            &QueryFilters {
                status: Some("tested-local".to_owned()),
                ..Default::default()
            },
            Some(&cursor),
            1
        )
        .is_err()
    );
    assert!(
        list_page(
            &registry.database_path,
            Collection::Cells,
            &QueryFilters::default(),
            Some("xyz"),
            1
        )
        .is_err()
    );
}

#[test]
fn show_history_why_and_frontier_are_bounded_and_complete() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    assert_eq!(
        entity_show(
            &registry.database_path,
            Collection::Cells,
            "cell-kerr-abstract-quadrature"
        )
        .unwrap()["status"],
        "advanced-local-lead"
    );
    let history = entity_history(
        &registry.database_path,
        Collection::Cells,
        "cell-kerr-abstract-quadrature",
        None,
        1,
    )
    .unwrap();
    assert_eq!(history.items.len(), 1);
    assert!(history.next_cursor.is_some());
    let mut cursor = None;
    let mut complete_history = Vec::new();
    loop {
        let page = entity_history(
            &registry.database_path,
            Collection::Cells,
            "cell-kerr-abstract-quadrature",
            cursor.as_deref(),
            1,
        )
        .unwrap();
        complete_history.extend(page.items);
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(complete_history.len(), 3);
    assert!(
        complete_history
            .iter()
            .any(|row| row["history_family"] == "assessment")
    );
    assert!(
        complete_history
            .iter()
            .any(|row| row["history_family"] == "decision")
    );
    let explanation = why(
        &registry.database_path,
        Collection::Gates,
        "gate-l14-lag3-survival",
        50,
    )
    .unwrap();
    assert!(!explanation["provenance"].as_array().unwrap().is_empty());
    let cell_explanation = why(
        &registry.database_path,
        Collection::Cells,
        "cell-kerr-abstract-quadrature",
        50,
    )
    .unwrap();
    assert!(
        cell_explanation["provenance"]
            .as_array()
            .unwrap()
            .iter()
            .any(|claim| claim["ledger_link"]["ledger_number"] == 14)
    );
    let ledger_filtered = list_page(
        &registry.database_path,
        Collection::Cells,
        &QueryFilters {
            ledger_number: Some(14),
            ..Default::default()
        },
        None,
        100,
    )
    .unwrap();
    assert_eq!(ledger_filtered.items.len(), 1);
    assert_eq!(
        ledger_filtered.items[0]["cell_id"],
        "cell-kerr-abstract-quadrature"
    );
    let mut cursor = None;
    let mut rows = Vec::new();
    loop {
        let page = frontier(
            &registry.database_path,
            &FrontierFilters::default(),
            cursor.as_deref(),
            1,
        )
        .unwrap();
        rows.extend(page.items);
        cursor = page.next_cursor;
        if cursor.is_none() {
            break;
        }
    }
    assert_eq!(rows.len(), 4);
    assert_eq!(
        rows.iter()
            .filter(|row| row["classification"] == "gap")
            .count(),
        2
    );
    assert!(
        frontier(
            &registry.database_path,
            &FrontierFilters {
                model_ids: vec!["x".to_owned(); 101],
                ..Default::default()
            },
            None,
            1
        )
        .is_err()
    );
}

#[test]
fn human_and_json_cli_outputs_have_query_parity() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let binary = env!("CARGO_BIN_EXE_cintamani-domain");
    let common = [
        "--workspace-root",
        temp.path().to_str().unwrap(),
        "list",
        "cells",
        "--limit",
        "1",
    ];
    let json_output = Command::new(binary)
        .args(["--format", "json"])
        .args(common)
        .output()
        .unwrap();
    let human_output = Command::new(binary)
        .args(["--format", "human"])
        .args(common)
        .output()
        .unwrap();
    assert!(json_output.status.success() && human_output.status.success());
    let json_text = String::from_utf8(json_output.stdout).unwrap();
    let human_text = String::from_utf8(human_output.stdout).unwrap();
    let parsed: Value = serde_json::from_str(&json_text).unwrap();
    let id = parsed["items"][0]["cell_id"].as_str().unwrap();
    assert!(human_text.contains(id));
    assert!(human_text.contains(parsed["next_cursor"].as_str().unwrap()));

    let dimensions_json = Command::new(binary)
        .args([
            "--format",
            "json",
            "--workspace-root",
            temp.path().to_str().unwrap(),
            "dimensions",
        ])
        .output()
        .unwrap();
    let dimensions_human = Command::new(binary)
        .args([
            "--format",
            "human",
            "--workspace-root",
            temp.path().to_str().unwrap(),
            "dimensions",
        ])
        .output()
        .unwrap();
    assert!(dimensions_json.status.success() && dimensions_human.status.success());
    let dimensions_value: Value = serde_json::from_slice(&dimensions_json.stdout).unwrap();
    let dimensions_text = String::from_utf8(dimensions_human.stdout).unwrap();
    assert_eq!(dimensions_value["items"].as_array().unwrap().len(), 4);
    for axis in dimensions_value["items"].as_array().unwrap() {
        assert!(dimensions_text.contains(axis["dimension_key"].as_str().unwrap()));
    }
    assert!(dimensions_text.contains("later-added-fourth-dimension"));
    assert!(dimensions_text.contains("normalized-driven-kerr-resonator"));
}

#[test]
fn seed_limits_and_artifact_and_tracked_hash_checks_remain_truthful() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let connection = Connection::open(&registry.database_path).unwrap();
    let physical_cells: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM siege_cells WHERE material_id='thin-film-litao3-candidate'",
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
    let nonlinear_pass: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM gate_results WHERE gate_name LIKE '%nonlinear%' AND passed=1",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!((physical_cells, conjecture_five, nonlinear_pass), (0, 0, 0));
    drop(connection);
    let artifact = temp
        .path()
        .join("packages/kerr-capacity/output/detector-noise-frozen/results.sqlite");
    fs::create_dir_all(artifact.parent().unwrap()).unwrap();
    fs::write(&artifact, "wrong").unwrap();
    assert_eq!(inspect(&registry).unwrap().mismatched_artifacts, 1);
    fs::remove_file(&artifact).unwrap();
    fs::write(
        temp.path()
            .join("packages/kerr-capacity/configs/detector-noise-frozen.toml"),
        "tampered",
    )
    .unwrap();
    fs::write(
        temp.path()
            .join("src/ledger/20260810-14 Detector-Noise Survival of Kerr Quadrature Memory.md"),
        "tampered",
    )
    .unwrap();
    let report = inspect(&registry).unwrap();
    assert_eq!(report.protocol_config_mismatches, 1);
    assert_eq!(report.ledger_source_mismatches, 1);
}

#[test]
fn mcp_tools_match_library_queries_and_mark_only_promotion_mutating() {
    let temp = workspace();
    let registry = paths(&temp);
    rebuild(&registry).unwrap();
    let descriptors = tool_descriptors();
    assert_eq!(descriptors.len(), 10);
    for descriptor in &descriptors {
        let name = descriptor["name"].as_str().unwrap();
        assert_eq!(
            descriptor["annotations"]["readOnlyHint"],
            json!(name != "cintamani_domain_admission_promote")
        );
    }
    let request = json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{
        "name":"cintamani_domain_list","arguments":{"collection":"cells","limit":1}}});
    let response = handle_mcp_request(&registry, &request).unwrap();
    assert_eq!(response["result"]["isError"], false);
    let direct = serde_json::to_value(
        list_page(
            &registry.database_path,
            Collection::Cells,
            &QueryFilters::default(),
            None,
            1,
        )
        .unwrap(),
    )
    .unwrap();
    assert_eq!(response["result"]["structuredContent"], direct);

    let dimension_request = json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{
        "name":"cintamani_domain_dimensions","arguments":{}}});
    let dimension_response = handle_mcp_request(&registry, &dimension_request).unwrap();
    assert_eq!(dimension_response["result"]["isError"], false);
    assert_eq!(
        dimension_response["result"]["structuredContent"],
        serde_json::to_value(dimensions(&registry.database_path).unwrap()).unwrap()
    );

    let unsafe_path = json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
        "name":"cintamani_domain_admission_validate","arguments":{"draft":"../escape.json"}}});
    assert_eq!(
        handle_mcp_request(&registry, &unsafe_path).unwrap()["result"]["isError"],
        true
    );
}

#[test]
fn stdio_mcp_initializes_and_lists_the_same_tools() {
    let temp = workspace();
    rebuild(&paths(&temp)).unwrap();
    let binary = env!("CARGO_BIN_EXE_cintamani-domain-mcp");
    let mut child = Command::new(binary)
        .args(["--workspace-root", temp.path().to_str().unwrap()])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    writeln!(
        stdin,
        "{}",
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{}})
    )
    .unwrap();
    writeln!(
        stdin,
        "{}",
        json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
    )
    .unwrap();
    drop(stdin);
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let responses = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(responses.len(), 2);
    assert_eq!(
        responses[0]["result"]["serverInfo"]["name"],
        "cintamani-domain"
    );
    assert_eq!(
        responses[1]["result"]["tools"].as_array().unwrap().len(),
        tool_descriptors().len()
    );
}

#[test]
fn local_mcp_descriptor_config_and_fixture_are_truthful_and_parseable() {
    let package = Path::new(env!("CARGO_MANIFEST_DIR"));
    let descriptor: Value = serde_json::from_slice(
        &fs::read(package.join("mcp/cintamani-domain.surface.json")).unwrap(),
    )
    .unwrap();
    let declared = descriptor["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect::<BTreeSet<_>>();
    let actual = tool_descriptors()
        .into_iter()
        .map(|value| value["name"].as_str().unwrap().to_owned())
        .collect::<BTreeSet<_>>();
    assert_eq!(declared, actual);
    assert_eq!(
        descriptor["registration_status"],
        "local-protocol-tested-catalog-registration-blocked"
    );
    let _: Value =
        serde_json::from_slice(&fs::read(package.join("mcp/server.config.template.json")).unwrap())
            .unwrap();
    for line in fs::read_to_string(package.join("mcp/conformance-fixture.jsonl"))
        .unwrap()
        .lines()
    {
        let _: Value = serde_json::from_str(line).unwrap();
    }
}
