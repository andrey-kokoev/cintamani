use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AdmissionV2 {
    pub record_id: String,
    pub schema_version: u32,
    pub admitted_at: String,
    pub description: String,
    #[serde(default)]
    pub changes: Vec<Change>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentTarget {
    pub target_id: String,
    pub target_order: u32,
    pub target_kind: String,
    pub target_id_value: String,
    pub target_revision: Option<u32>,
    pub target_label: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentProtocol {
    pub protocol_id: String,
    pub protocol_order: u32,
    pub protocol_name: String,
    pub minimal_decisive_test: String,
    pub steps: Vec<String>,
    pub decision_rule: String,
    pub boundary: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentControl {
    pub control_id: String,
    pub control_order: u32,
    pub control_kind: String,
    pub description: String,
    pub controlled_variable: String,
    pub expected_relation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentObservable {
    pub observable_id: String,
    pub observable_order: u32,
    pub name: String,
    pub units: String,
    pub measurement: String,
    pub aggregation: String,
    pub uncertainty_reporting: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentCalibration {
    pub calibration_id: String,
    pub calibration_order: u32,
    pub quantity: String,
    pub units: String,
    pub method: String,
    pub acceptance: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentRepetition {
    pub repetition_id: String,
    pub replicate_unit: String,
    pub minimum_repetitions: u32,
    pub independent_repetitions: u32,
    pub randomization: String,
    pub stopping_rule: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentUncertainty {
    pub uncertainty_id: String,
    pub sources: String,
    pub propagation: String,
    pub reporting: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentCriterion {
    pub criterion_id: String,
    pub criterion_order: u32,
    pub criterion_kind: String,
    pub statement: String,
    pub metric: String,
    pub comparator: String,
    pub threshold_text: String,
    pub units: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentConfound {
    pub confound_id: String,
    pub confound_order: u32,
    pub confound: String,
    pub detection_control: String,
    pub mitigation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentRawArtifact {
    pub raw_artifact_id: String,
    pub artifact_order: u32,
    pub artifact_kind: String,
    pub format: String,
    pub retention: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentDependency {
    pub dependency_id: String,
    pub dependency_order: u32,
    pub target_experiment_id: String,
    pub target_revision: u32,
    pub relation_kind: String,
    pub rationale: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentRelation {
    pub relation_id: String,
    pub target_experiment_id: String,
    pub target_revision: u32,
    pub relation_kind: String,
    pub relation_claim: String,
    pub relation_scope: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ExperimentEquipmentRequirement {
    pub requirement_id: String,
    pub group_id: String,
    pub group_order: u32,
    pub group_kind: String,
    pub selection_rule: String,
    pub quantity: u32,
    pub capability: String,
    pub units: String,
    pub specification: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResearchTopicExperimentLink {
    pub link_id: String,
    pub topic_version_id: String,
    pub relation_kind: String,
    pub rationale: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EquipmentCapability {
    pub capability_id: String,
    pub capability_order: u32,
    pub capability: String,
    pub units: String,
    pub specification: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EquipmentOperatingLimit {
    pub operating_limit_id: String,
    pub limit_order: u32,
    pub parameter: String,
    pub lower_bound: Option<String>,
    pub upper_bound: Option<String>,
    pub units: String,
    pub notes: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EquipmentCalibrationRequirement {
    pub equipment_calibration_id: String,
    pub calibration_order: u32,
    pub quantity: String,
    pub units: String,
    pub method: String,
    pub traceability: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EquipmentSafetyRequirement {
    pub safety_requirement_id: String,
    pub safety_order: u32,
    pub hazard: String,
    pub requirement: String,
    pub mitigation: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct EquipmentInterfaceRequirement {
    pub interface_requirement_id: String,
    pub interface_order: u32,
    pub interface_kind: String,
    pub specification: String,
    pub units: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
// Admission records intentionally keep one self-describing change object per immutable
// revision. ExperimentVersion carries its complete protocol/criteria/equipment definition;
// boxing would change the stable internally-tagged JSON contract.
#[allow(clippy::large_enum_variant)]
pub enum Change {
    TheoreticalModel {
        model_id: String,
        name: String,
        description: String,
    },
    TheoreticalModelAssessment {
        assessment_id: String,
        model_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    Material {
        material_id: String,
        name: String,
        description: String,
    },
    MaterialAssessment {
        assessment_id: String,
        material_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        material_classification: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    PhysicalMechanism {
        mechanism_id: String,
        name: String,
        description: String,
    },
    MechanismAssessment {
        assessment_id: String,
        mechanism_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    Interface {
        interface_id: String,
        name: String,
        observation_kind: String,
        units: String,
        description: String,
    },
    InterfaceAssessment {
        assessment_id: String,
        interface_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    ProcessPort {
        port_id: String,
        name: String,
        port_type: String,
        model_id: String,
        material_id: String,
        mechanism_id: String,
        interface_id: String,
        description: String,
    },
    TypedMorphism {
        morphism_id: String,
        name: String,
        model_id: String,
        material_id: String,
        mechanism_id: String,
        interface_id: String,
        source_port_id: String,
        target_port_id: String,
        morphism_type: String,
        description: String,
    },
    MorphismAssessment {
        assessment_id: String,
        morphism_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        validation_status: String,
        rationale: String,
        scope: String,
    },
    MorphismPath {
        path_id: String,
        name: String,
        model_id: String,
        material_id: String,
        mechanism_id: String,
        interface_id: String,
        source_port_id: String,
        target_port_id: String,
        description: String,
        steps: Vec<String>,
    },
    SiegeCell {
        cell_id: String,
        name: String,
        model_id: String,
        material_id: String,
        mechanism_id: String,
        interface_id: String,
    },
    SiegeCellMorphism {
        cell_id: String,
        morphism_id: String,
        relationship: String,
    },
    SiegeCellPath {
        cell_id: String,
        path_id: String,
        relationship: String,
    },
    SiegeCellAssessment {
        assessment_id: String,
        cell_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    SiegeCellDecision {
        decision_id: String,
        cell_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        status: String,
        rationale: String,
        scope: String,
    },
    ParameterDefinition {
        parameter_id: String,
        name: String,
        symbol: String,
        units: String,
        description: String,
    },
    ParameterRegion {
        region_id: String,
        cell_id: String,
        name: String,
    },
    ParameterRegionVersion {
        region_version_id: String,
        region_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        region_kind: String,
        predeclared: bool,
        rationale: String,
        scope: String,
    },
    ParameterRegionValue {
        region_version_id: String,
        parameter_id: String,
        lower_value: Option<f64>,
        upper_value: Option<f64>,
        exact_text: Option<String>,
        units: String,
    },
    Problem {
        problem_id: String,
        label: String,
    },
    ProblemVersion {
        problem_version_id: String,
        problem_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        problem_statement: String,
        rationale: String,
        scope: String,
    },
    Conjecture {
        conjecture_id: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        problem_id: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        cell_id: Option<String>,
        label: String,
    },
    ConjectureVersion {
        conjecture_version_id: String,
        conjecture_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        statement: String,
        rationale: String,
        scope: String,
    },
    ConjectureFraming {
        framing_id: String,
        conjecture_version_id: String,
        framing_order: u32,
        coordinate_key_version: String,
        coordinate_key: String,
        validation_generation: String,
        model_id: String,
        material_id: String,
        mechanism_id: String,
        interface_id: String,
        coordinate_classification: String,
        cell_id: Option<String>,
        framing_rationale: String,
    },
    ConjectureDisposition {
        disposition_id: String,
        conjecture_id: String,
        conjecture_version_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        status: String,
        rationale: String,
        scope: String,
    },
    ResearchTopic {
        topic_id: String,
        label: String,
    },
    ResearchTopicVersion {
        topic_version_id: String,
        topic_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        title: String,
        open_problem: String,
        why_open: String,
        scope: String,
        next_discriminating_criticism_or_test: String,
        non_claims: String,
    },
    ResearchTopicLocus {
        locus_id: String,
        topic_version_id: String,
        locus_order: u32,
        locus_kind: String,
    },
    ResearchTopicOrigin {
        origin_id: String,
        topic_version_id: String,
        origin_order: u32,
        origin_kind: String,
        problem_version_id: Option<String>,
        conjecture_version_id: Option<String>,
        relationship: String,
        rationale: String,
    },
    ResearchTopicFramingLink {
        framing_link_id: String,
        topic_version_id: String,
        conjecture_framing_id: String,
        relationship: String,
        rationale: String,
    },
    ResearchTopicEvidenceLink {
        evidence_link_id: String,
        topic_version_id: String,
        artifact_id: String,
        relationship: String,
        rationale: String,
    },
    ResearchTopicTestLink {
        test_link_id: String,
        topic_version_id: String,
        criterion_id: String,
        relationship: String,
        rationale: String,
    },
    ResearchTopicPublicLink {
        public_link_id: String,
        topic_version_id: String,
        link_order: u32,
        link_kind: String,
        public_record_id: String,
        target_proposal_id: String,
        target_revision: u32,
        content_sha256: String,
        relationship: String,
        rationale: String,
    },
    ResearchTopicRelation {
        relation_id: String,
        source_topic_version_id: String,
        target_topic_version_id: String,
        relation_kind: String,
        relation_claim: String,
        relation_scope: String,
    },
    ResearchTopicWorkflowEvent {
        workflow_event_id: String,
        topic_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        status: String,
        rationale: String,
        scope: String,
    },
    Experiment {
        experiment_id: String,
        label: String,
    },
    ExperimentVersion {
        experiment_version_id: String,
        experiment_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        title: String,
        experiment_kind: String,
        intent: String,
        targets: Vec<ExperimentTarget>,
        protocols: Vec<ExperimentProtocol>,
        controls: Vec<ExperimentControl>,
        observables: Vec<ExperimentObservable>,
        calibrations: Vec<ExperimentCalibration>,
        repetition: Box<ExperimentRepetition>,
        uncertainty: Box<ExperimentUncertainty>,
        criteria: Vec<ExperimentCriterion>,
        confounds: Vec<ExperimentConfound>,
        raw_artifacts: Vec<ExperimentRawArtifact>,
        non_claims: Vec<String>,
        dependencies: Vec<ExperimentDependency>,
        relations: Vec<ExperimentRelation>,
        equipment_requirements: Vec<ExperimentEquipmentRequirement>,
        topic_links: Vec<ResearchTopicExperimentLink>,
    },
    EquipmentType {
        equipment_type_id: String,
        label: String,
    },
    EquipmentTypeVersion {
        equipment_type_version_id: String,
        equipment_type_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        title: String,
        description: String,
        capabilities: Vec<EquipmentCapability>,
        operating_limits: Vec<EquipmentOperatingLimit>,
        calibrations: Vec<EquipmentCalibrationRequirement>,
        safety_requirements: Vec<EquipmentSafetyRequirement>,
        interface_requirements: Vec<EquipmentInterfaceRequirement>,
        non_claims: Vec<String>,
    },
    FalsificationCriterion {
        criterion_id: String,
        conjecture_version_id: String,
        description: String,
        metric: String,
        comparator: String,
        threshold_value: Option<f64>,
        threshold_text: Option<String>,
        units: String,
        predeclared: bool,
    },
    Protocol {
        protocol_id: String,
        name: String,
    },
    ProtocolVersion {
        protocol_version_id: String,
        protocol_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        predeclared: bool,
        seed_count: u32,
        null_trials: Option<u32>,
        null_quantile: Option<f64>,
        rationale: String,
        scope: String,
    },
    ProtocolProvenanceAssessment {
        assessment_id: String,
        protocol_version_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        config_uri: Option<String>,
        config_sha256: Option<String>,
        completeness_status: String,
        rationale: String,
        scope: String,
    },
    Run {
        run_id: String,
        protocol_version_id: String,
        cell_id: String,
        code_commit: String,
        summary: String,
    },
    RunAssessment {
        assessment_id: String,
        run_id: String,
        revision: u32,
        event_kind: String,
        occurred_at: String,
        operational_status: String,
        epistemic_status: String,
        rationale: String,
        scope: String,
    },
    EvidenceArtifact {
        artifact_id: String,
        run_id: String,
        artifact_kind: String,
        artifact_uri: String,
        expected_sha256: String,
        canonical_detail: bool,
        detail_row_count: Option<u64>,
        description: String,
    },
    GateResult {
        gate_result_id: String,
        run_id: String,
        criterion_id: Option<String>,
        gate_name: String,
        evidence_polarity: String,
        passed: bool,
        metric_value: Option<f64>,
        metric_text: Option<String>,
        units: String,
        seed_pass_count: Option<u32>,
        seed_required_count: Option<u32>,
        decision_scope: String,
        limitation: String,
    },
    GateResultSupersession {
        supersession_id: String,
        prior_gate_result_id: String,
        replacement_gate_result_id: String,
        occurred_at: String,
        reason: String,
    },
    Comparison {
        comparison_id: String,
        run_id: String,
        baseline_run_id: Option<String>,
        control_relationship: String,
        metric: String,
        evidence_polarity: String,
        minimum_delta: Option<f64>,
        maximum_delta: Option<f64>,
        mean_delta: Option<f64>,
        units: String,
        decision_scope: String,
    },
    ComparisonSupersession {
        supersession_id: String,
        prior_comparison_id: String,
        replacement_comparison_id: String,
        occurred_at: String,
        reason: String,
    },
    LedgerLink {
        ledger_link_id: String,
        ledger_number: u32,
        ledger_title: String,
        ledger_path: String,
        ledger_sha256: String,
        relation: String,
        admitted_claim: String,
    },
    ProvenanceClaim {
        provenance_id: String,
        provenance_kind: String,
        ledger_link_id: Option<String>,
        claim_text: String,
        target: ProvenanceTarget,
    },
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "target_kind", content = "target_id", rename_all = "kebab-case")]
pub enum ProvenanceTarget {
    TheoreticalModel(String),
    TheoreticalModelAssessment(String),
    Material(String),
    MaterialAssessment(String),
    Mechanism(String),
    MechanismAssessment(String),
    Interface(String),
    InterfaceAssessment(String),
    ProcessPort(String),
    Morphism(String),
    MorphismAssessment(String),
    Path(String),
    Cell(String),
    CellAssessment(String),
    CellDecision(String),
    Parameter(String),
    Region(String),
    RegionVersion(String),
    Problem(String),
    ProblemVersion(String),
    Conjecture(String),
    ConjectureVersion(String),
    ConjectureFraming(String),
    ConjectureDisposition(String),
    ResearchTopic(String),
    ResearchTopicVersion(String),
    ResearchTopicWorkflowEvent(String),
    ResearchTopicRelation(String),
    Experiment(String),
    ExperimentVersion(String),
    ExperimentTarget(String),
    ExperimentRelation(String),
    ExperimentEquipmentRequirement(String),
    EquipmentType(String),
    EquipmentTypeVersion(String),
    EquipmentCapability(String),
    EquipmentOperatingLimit(String),
    EquipmentCalibration(String),
    EquipmentSafetyRequirement(String),
    EquipmentInterfaceRequirement(String),
    ResearchTopicExperimentLink(String),
    Criterion(String),
    Protocol(String),
    ProtocolVersion(String),
    ProtocolAssessment(String),
    Run(String),
    RunAssessment(String),
    Artifact(String),
    GateResult(String),
    GateSupersession(String),
    Comparison(String),
    ComparisonSupersession(String),
}
