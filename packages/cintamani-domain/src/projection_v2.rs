use crate::{
    Change,
    query::{COORDINATE_KEY_VERSION, coordinate_key},
};
use anyhow::{Result, bail};
use rusqlite::{OptionalExtension, Transaction, params};

pub(crate) fn insert_change(
    transaction: &Transaction<'_>,
    admission: &str,
    change: &Change,
) -> Result<()> {
    match change {
        Change::TheoreticalModel {
            model_id,
            name,
            description,
        } => {
            transaction.execute(
                "INSERT INTO theoretical_models VALUES (?1,?2,?3,?4)",
                params![model_id, name, description, admission],
            )?;
        }
        Change::TheoreticalModelAssessment {
            assessment_id,
            model_id,
            revision,
            event_kind,
            occurred_at,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO theoretical_model_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    assessment_id,
                    model_id,
                    revision,
                    event_kind,
                    occurred_at,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::Material {
            material_id,
            name,
            description,
        } => {
            transaction.execute(
                "INSERT INTO materials VALUES (?1,?2,?3,?4)",
                params![material_id, name, description, admission],
            )?;
        }
        Change::MaterialAssessment {
            assessment_id,
            material_id,
            revision,
            event_kind,
            occurred_at,
            material_classification,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO material_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    assessment_id,
                    material_id,
                    revision,
                    event_kind,
                    occurred_at,
                    material_classification,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::PhysicalMechanism {
            mechanism_id,
            name,
            description,
        } => {
            transaction.execute(
                "INSERT INTO physical_mechanisms VALUES (?1,?2,?3,?4)",
                params![mechanism_id, name, description, admission],
            )?;
        }
        Change::MechanismAssessment {
            assessment_id,
            mechanism_id,
            revision,
            event_kind,
            occurred_at,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO mechanism_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    assessment_id,
                    mechanism_id,
                    revision,
                    event_kind,
                    occurred_at,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::Interface {
            interface_id,
            name,
            observation_kind,
            units,
            description,
        } => {
            transaction.execute(
                "INSERT INTO interfaces VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    interface_id,
                    name,
                    observation_kind,
                    units,
                    description,
                    admission
                ],
            )?;
        }
        Change::InterfaceAssessment {
            assessment_id,
            interface_id,
            revision,
            event_kind,
            occurred_at,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO interface_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    assessment_id,
                    interface_id,
                    revision,
                    event_kind,
                    occurred_at,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ProcessPort {
            port_id,
            name,
            port_type,
            model_id,
            material_id,
            mechanism_id,
            interface_id,
            description,
        } => {
            transaction.execute(
                "INSERT INTO process_ports VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    port_id,
                    name,
                    port_type,
                    model_id,
                    material_id,
                    mechanism_id,
                    interface_id,
                    description,
                    admission
                ],
            )?;
        }
        Change::TypedMorphism {
            morphism_id,
            name,
            model_id,
            material_id,
            mechanism_id,
            interface_id,
            source_port_id,
            target_port_id,
            morphism_type,
            description,
        } => {
            transaction.execute(
                "INSERT INTO typed_morphisms VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    morphism_id,
                    name,
                    model_id,
                    material_id,
                    mechanism_id,
                    interface_id,
                    source_port_id,
                    target_port_id,
                    morphism_type,
                    description,
                    admission
                ],
            )?;
        }
        Change::MorphismAssessment {
            assessment_id,
            morphism_id,
            revision,
            event_kind,
            occurred_at,
            validation_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO morphism_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    assessment_id,
                    morphism_id,
                    revision,
                    event_kind,
                    occurred_at,
                    validation_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::MorphismPath {
            path_id,
            name,
            model_id,
            material_id,
            mechanism_id,
            interface_id,
            source_port_id,
            target_port_id,
            description,
            steps,
        } => {
            if steps.is_empty() {
                bail!("morphism path {path_id} must declare at least one ordered step");
            }
            transaction.execute(
                "INSERT INTO morphism_paths VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    path_id,
                    name,
                    model_id,
                    material_id,
                    mechanism_id,
                    interface_id,
                    source_port_id,
                    target_port_id,
                    description,
                    admission
                ],
            )?;
            for (index, morphism_id) in steps.iter().enumerate() {
                transaction.execute(
                    "INSERT INTO morphism_path_steps VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                    params![
                        path_id,
                        index as u32 + 1,
                        morphism_id,
                        model_id,
                        material_id,
                        mechanism_id,
                        interface_id,
                        admission
                    ],
                )?;
            }
        }
        Change::SiegeCell {
            cell_id,
            name,
            model_id,
            material_id,
            mechanism_id,
            interface_id,
        } => {
            transaction.execute(
                "INSERT INTO siege_cells VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    cell_id,
                    name,
                    model_id,
                    material_id,
                    mechanism_id,
                    interface_id,
                    admission
                ],
            )?;
        }
        Change::SiegeCellMorphism {
            cell_id,
            morphism_id,
            relationship,
        } => {
            let axes = cell_axes(transaction, cell_id)?;
            transaction.execute(
                "INSERT INTO siege_cell_morphisms VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    cell_id,
                    morphism_id,
                    axes.0,
                    axes.1,
                    axes.2,
                    axes.3,
                    relationship,
                    admission
                ],
            )?;
        }
        Change::SiegeCellPath {
            cell_id,
            path_id,
            relationship,
        } => {
            let axes = cell_axes(transaction, cell_id)?;
            transaction.execute(
                "INSERT INTO siege_cell_paths VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![
                    cell_id,
                    path_id,
                    axes.0,
                    axes.1,
                    axes.2,
                    axes.3,
                    relationship,
                    admission
                ],
            )?;
        }
        Change::SiegeCellAssessment {
            assessment_id,
            cell_id,
            revision,
            event_kind,
            occurred_at,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO siege_cell_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    assessment_id,
                    cell_id,
                    revision,
                    event_kind,
                    occurred_at,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::SiegeCellDecision {
            decision_id,
            cell_id,
            revision,
            event_kind,
            occurred_at,
            status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO siege_cell_decisions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    decision_id,
                    cell_id,
                    revision,
                    event_kind,
                    occurred_at,
                    status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ParameterDefinition {
            parameter_id,
            name,
            symbol,
            units,
            description,
        } => {
            transaction.execute(
                "INSERT INTO parameter_definitions VALUES (?1,?2,?3,?4,?5,?6)",
                params![parameter_id, name, symbol, units, description, admission],
            )?;
        }
        Change::ParameterRegion {
            region_id,
            cell_id,
            name,
        } => {
            transaction.execute(
                "INSERT INTO parameter_regions VALUES (?1,?2,?3,?4)",
                params![region_id, cell_id, name, admission],
            )?;
        }
        Change::ParameterRegionVersion {
            region_version_id,
            region_id,
            revision,
            event_kind,
            occurred_at,
            region_kind,
            predeclared,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO parameter_region_versions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    region_version_id,
                    region_id,
                    revision,
                    event_kind,
                    occurred_at,
                    region_kind,
                    bool_i64(*predeclared),
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ParameterRegionValue {
            region_version_id,
            parameter_id,
            lower_value,
            upper_value,
            exact_text,
            units,
        } => {
            transaction.execute(
                "INSERT INTO parameter_region_values VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    region_version_id,
                    parameter_id,
                    lower_value,
                    upper_value,
                    exact_text,
                    units,
                    admission
                ],
            )?;
        }
        Change::Problem { problem_id, label } => {
            transaction.execute(
                "INSERT INTO problems VALUES (?1,?2,?3)",
                params![problem_id, label, admission],
            )?;
        }
        Change::ProblemVersion {
            problem_version_id,
            problem_id,
            revision,
            event_kind,
            occurred_at,
            problem_statement,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO problem_versions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    problem_version_id,
                    problem_id,
                    revision,
                    event_kind,
                    occurred_at,
                    problem_statement,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::Conjecture {
            conjecture_id,
            problem_id,
            cell_id,
            label,
        } => {
            let problem_id = problem_id.as_deref().ok_or_else(|| {
                anyhow::anyhow!(
                    "schema-v3 conjecture {conjecture_id} requires an explicit problem_id"
                )
            })?;
            if cell_id.is_some() {
                bail!(
                    "schema-v3 conjecture {conjecture_id} must use exact-version conjecture framings rather than a mandatory cell_id"
                );
            }
            transaction.execute(
                "INSERT INTO conjectures VALUES (?1,?2,?3,?4)",
                params![conjecture_id, problem_id, label, admission],
            )?;
        }
        Change::ConjectureVersion {
            conjecture_version_id,
            conjecture_id,
            revision,
            event_kind,
            occurred_at,
            statement,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO conjecture_versions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    conjecture_version_id,
                    conjecture_id,
                    revision,
                    event_kind,
                    occurred_at,
                    statement,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ConjectureFraming {
            framing_id,
            conjecture_version_id,
            framing_order,
            coordinate_key_version,
            coordinate_key: supplied_coordinate_key,
            validation_generation,
            model_id,
            material_id,
            mechanism_id,
            interface_id,
            coordinate_classification,
            cell_id,
            framing_rationale,
        } => {
            if coordinate_key_version != COORDINATE_KEY_VERSION {
                bail!(
                    "conjecture framing {framing_id} uses unsupported coordinate-key version {coordinate_key_version}"
                );
            }
            if validation_generation.trim().is_empty() {
                bail!("conjecture framing {framing_id} requires a validation generation");
            }
            let known_generation: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM admissions
                 WHERE source_path LIKE '.narada/kb/cintamani-domain/chain/generations/' || ?1 || '/%'",
                [validation_generation],
                |row| row.get(0),
            )?;
            let active_generation: String = transaction.query_row(
                "SELECT value FROM metadata WHERE key='chain_generation'",
                [],
                |row| row.get(0),
            )?;
            if known_generation == 0
                && validation_generation != &active_generation
                && validation_generation != "bootstrap-0004-0e32d9248223"
            {
                bail!(
                    "conjecture framing {framing_id} validation generation is not in the governed chain ancestry"
                );
            }
            let expected_coordinate_key =
                coordinate_key(model_id, material_id, mechanism_id, interface_id);
            if supplied_coordinate_key != &expected_coordinate_key {
                bail!(
                    "conjecture framing {framing_id} coordinate key does not match its ordered axis members"
                );
            }
            let member_count: i64 = transaction.query_row(
                "SELECT COUNT(*) FROM theoretical_models m, materials a, physical_mechanisms p, interfaces i
                 WHERE m.model_id=?1 AND a.material_id=?2 AND p.mechanism_id=?3 AND i.interface_id=?4",
                params![model_id, material_id, mechanism_id, interface_id],
                |row| row.get(0),
            )?;
            if member_count != 1 {
                bail!(
                    "conjecture framing {framing_id} references an axis member outside the governed snapshot"
                );
            }
            let admitted_cell: Option<String> = transaction
                .query_row(
                    "SELECT cell_id FROM siege_cells
                     WHERE model_id=?1 AND material_id=?2 AND mechanism_id=?3 AND interface_id=?4",
                    params![model_id, material_id, mechanism_id, interface_id],
                    |row| row.get(0),
                )
                .optional()?;
            let expected_classification = if admitted_cell.is_some() {
                "admitted-cell"
            } else {
                "gap"
            };
            if coordinate_classification != expected_classification
                || cell_id.as_deref() != admitted_cell.as_deref()
            {
                bail!(
                    "conjecture framing {framing_id} classification/cell does not match the governed coordinate"
                );
            }
            transaction.execute(
                "INSERT INTO conjecture_framings VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                params![
                    framing_id,
                    conjecture_version_id,
                    framing_order,
                    coordinate_key_version,
                    supplied_coordinate_key,
                    validation_generation,
                    model_id,
                    material_id,
                    mechanism_id,
                    interface_id,
                    coordinate_classification,
                    cell_id,
                    framing_rationale,
                    admission
                ],
            )?;
        }
        Change::ConjectureDisposition {
            disposition_id,
            conjecture_id,
            conjecture_version_id,
            revision,
            event_kind,
            occurred_at,
            status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO conjecture_dispositions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    disposition_id,
                    conjecture_id,
                    conjecture_version_id,
                    revision,
                    event_kind,
                    occurred_at,
                    status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ResearchTopic { topic_id, label } => {
            transaction.execute(
                "INSERT INTO research_topics VALUES (?1,?2,'problem-derived-research-topic',?3)",
                params![topic_id, label, admission],
            )?;
        }
        Change::ResearchTopicVersion {
            topic_version_id,
            topic_id,
            revision,
            event_kind,
            occurred_at,
            title,
            open_problem,
            why_open,
            scope,
            next_discriminating_criticism_or_test,
            non_claims,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_versions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    topic_version_id,
                    topic_id,
                    revision,
                    event_kind,
                    occurred_at,
                    title,
                    open_problem,
                    why_open,
                    scope,
                    next_discriminating_criticism_or_test,
                    non_claims,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicLocus {
            locus_id,
            topic_version_id,
            locus_order,
            locus_kind,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_loci VALUES (?1,?2,?3,?4,?5)",
                params![
                    locus_id,
                    topic_version_id,
                    locus_order,
                    locus_kind,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicOrigin {
            origin_id,
            topic_version_id,
            origin_order,
            origin_kind,
            problem_version_id,
            conjecture_version_id,
            relationship,
            rationale,
        } => {
            if problem_version_id.is_none() == conjecture_version_id.is_none() {
                bail!(
                    "research topic origin {origin_id} must target exactly one problem or conjecture version"
                );
            }
            transaction.execute(
                "INSERT INTO research_topic_origins VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    origin_id,
                    topic_version_id,
                    origin_order,
                    origin_kind,
                    problem_version_id,
                    conjecture_version_id,
                    relationship,
                    rationale,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicFramingLink {
            framing_link_id,
            topic_version_id,
            conjecture_framing_id,
            relationship,
            rationale,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_framing_links VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    framing_link_id,
                    topic_version_id,
                    conjecture_framing_id,
                    relationship,
                    rationale,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicEvidenceLink {
            evidence_link_id,
            topic_version_id,
            artifact_id,
            relationship,
            rationale,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_evidence_links VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    evidence_link_id,
                    topic_version_id,
                    artifact_id,
                    relationship,
                    rationale,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicTestLink {
            test_link_id,
            topic_version_id,
            criterion_id,
            relationship,
            rationale,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_test_links VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    test_link_id,
                    topic_version_id,
                    criterion_id,
                    relationship,
                    rationale,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicPublicLink {
            public_link_id,
            topic_version_id,
            link_order,
            link_kind,
            public_record_id,
            target_proposal_id,
            target_revision,
            content_sha256,
            relationship,
            rationale,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_public_links VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    public_link_id,
                    topic_version_id,
                    link_order,
                    link_kind,
                    public_record_id,
                    target_proposal_id,
                    target_revision,
                    content_sha256,
                    relationship,
                    rationale,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicRelation {
            relation_id,
            source_topic_version_id,
            target_topic_version_id,
            relation_kind,
            relation_claim,
            relation_scope,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_relations VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    relation_id,
                    source_topic_version_id,
                    target_topic_version_id,
                    relation_kind,
                    relation_claim,
                    relation_scope,
                    admission
                ],
            )?;
        }
        Change::ResearchTopicWorkflowEvent {
            workflow_event_id,
            topic_id,
            revision,
            event_kind,
            occurred_at,
            status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO research_topic_workflow_events VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    workflow_event_id,
                    topic_id,
                    revision,
                    event_kind,
                    occurred_at,
                    status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::FalsificationCriterion {
            criterion_id,
            conjecture_version_id,
            description,
            metric,
            comparator,
            threshold_value,
            threshold_text,
            units,
            predeclared,
        } => {
            transaction.execute(
                "INSERT INTO falsification_criteria VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    criterion_id,
                    conjecture_version_id,
                    description,
                    metric,
                    comparator,
                    threshold_value,
                    threshold_text,
                    units,
                    bool_i64(*predeclared),
                    admission
                ],
            )?;
        }
        Change::Protocol { protocol_id, name } => {
            transaction.execute(
                "INSERT INTO protocols VALUES (?1,?2,?3)",
                params![protocol_id, name, admission],
            )?;
        }
        Change::ProtocolVersion {
            protocol_version_id,
            protocol_id,
            revision,
            event_kind,
            occurred_at,
            predeclared,
            seed_count,
            null_trials,
            null_quantile,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO protocol_versions VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    protocol_version_id,
                    protocol_id,
                    revision,
                    event_kind,
                    occurred_at,
                    bool_i64(*predeclared),
                    seed_count,
                    null_trials,
                    null_quantile,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::ProtocolProvenanceAssessment {
            assessment_id,
            protocol_version_id,
            revision,
            event_kind,
            occurred_at,
            config_uri,
            config_sha256,
            completeness_status,
            rationale,
            scope,
        } => {
            if let Some(uri) = config_uri {
                validate_relative(uri)?;
            }
            transaction.execute("INSERT INTO protocol_provenance_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![assessment_id,protocol_version_id,revision,event_kind,occurred_at,config_uri,
                    config_sha256,completeness_status,rationale,scope,admission])?;
        }
        Change::Run {
            run_id,
            protocol_version_id,
            cell_id,
            code_commit,
            summary,
        } => {
            transaction.execute(
                "INSERT INTO runs VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    run_id,
                    protocol_version_id,
                    cell_id,
                    code_commit,
                    summary,
                    admission
                ],
            )?;
        }
        Change::RunAssessment {
            assessment_id,
            run_id,
            revision,
            event_kind,
            occurred_at,
            operational_status,
            epistemic_status,
            rationale,
            scope,
        } => {
            transaction.execute(
                "INSERT INTO run_assessments VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    assessment_id,
                    run_id,
                    revision,
                    event_kind,
                    occurred_at,
                    operational_status,
                    epistemic_status,
                    rationale,
                    scope,
                    admission
                ],
            )?;
        }
        Change::EvidenceArtifact {
            artifact_id,
            run_id,
            artifact_kind,
            artifact_uri,
            expected_sha256,
            canonical_detail,
            detail_row_count,
            description,
        } => {
            validate_relative(artifact_uri)?;
            transaction.execute(
                "INSERT INTO evidence_artifacts VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                params![
                    artifact_id,
                    run_id,
                    artifact_kind,
                    artifact_uri,
                    expected_sha256,
                    bool_i64(*canonical_detail),
                    detail_row_count.map(to_i64),
                    description,
                    admission
                ],
            )?;
        }
        Change::GateResult {
            gate_result_id,
            run_id,
            criterion_id,
            gate_name,
            evidence_polarity,
            passed,
            metric_value,
            metric_text,
            units,
            seed_pass_count,
            seed_required_count,
            decision_scope,
            limitation,
        } => {
            transaction.execute(
                "INSERT INTO gate_results VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
                params![
                    gate_result_id,
                    run_id,
                    criterion_id,
                    gate_name,
                    evidence_polarity,
                    bool_i64(*passed),
                    metric_value,
                    metric_text,
                    units,
                    seed_pass_count,
                    seed_required_count,
                    decision_scope,
                    limitation,
                    admission
                ],
            )?;
        }
        Change::GateResultSupersession {
            supersession_id,
            prior_gate_result_id,
            replacement_gate_result_id,
            occurred_at,
            reason,
        } => {
            transaction.execute(
                "INSERT INTO gate_result_supersessions VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    supersession_id,
                    prior_gate_result_id,
                    replacement_gate_result_id,
                    occurred_at,
                    reason,
                    admission
                ],
            )?;
        }
        Change::Comparison {
            comparison_id,
            run_id,
            baseline_run_id,
            control_relationship,
            metric,
            evidence_polarity,
            minimum_delta,
            maximum_delta,
            mean_delta,
            units,
            decision_scope,
        } => {
            transaction.execute(
                "INSERT INTO comparisons VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![
                    comparison_id,
                    run_id,
                    baseline_run_id,
                    control_relationship,
                    metric,
                    evidence_polarity,
                    minimum_delta,
                    maximum_delta,
                    mean_delta,
                    units,
                    decision_scope,
                    admission
                ],
            )?;
        }
        Change::ComparisonSupersession {
            supersession_id,
            prior_comparison_id,
            replacement_comparison_id,
            occurred_at,
            reason,
        } => {
            transaction.execute(
                "INSERT INTO comparison_supersessions VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    supersession_id,
                    prior_comparison_id,
                    replacement_comparison_id,
                    occurred_at,
                    reason,
                    admission
                ],
            )?;
        }
        Change::LedgerLink { .. } | Change::ProvenanceClaim { .. } => {
            bail!("ledger links and provenance are inserted in dedicated governed passes")
        }
    }
    Ok(())
}

fn cell_axes(
    transaction: &Transaction<'_>,
    cell_id: &str,
) -> Result<(String, String, String, String)> {
    Ok(transaction.query_row(
        "SELECT model_id,material_id,mechanism_id,interface_id FROM siege_cells WHERE cell_id=?1",
        [cell_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?)
}

fn validate_relative(uri: &str) -> Result<()> {
    let path = std::path::Path::new(uri);
    if path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        bail!("URI must be workspace-relative without parent traversal: {uri}");
    }
    Ok(())
}

fn bool_i64(value: bool) -> i64 {
    if value { 1 } else { 0 }
}
fn to_i64(value: u64) -> i64 {
    value.try_into().unwrap_or(i64::MAX)
}
