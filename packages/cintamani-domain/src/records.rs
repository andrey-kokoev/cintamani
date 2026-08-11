use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdmissionRecord {
    pub record_id: String,
    pub schema_version: u32,
    pub admitted_at: String,
    pub description: String,
    #[serde(default)]
    pub theoretical_models: Vec<TheoreticalModel>,
    #[serde(default)]
    pub materials: Vec<Material>,
    #[serde(default)]
    pub physical_mechanisms: Vec<PhysicalMechanism>,
    #[serde(default)]
    pub interfaces: Vec<Interface>,
    #[serde(default)]
    pub typed_morphisms: Vec<TypedMorphism>,
    #[serde(default)]
    pub siege_cells: Vec<SiegeCell>,
    #[serde(default)]
    pub siege_cell_decisions: Vec<SiegeCellDecision>,
    #[serde(default)]
    pub parameter_definitions: Vec<ParameterDefinition>,
    #[serde(default)]
    pub parameter_regions: Vec<ParameterRegion>,
    #[serde(default)]
    pub parameter_region_values: Vec<ParameterRegionValue>,
    #[serde(default)]
    pub conjectures: Vec<Conjecture>,
    #[serde(default)]
    pub conjecture_dispositions: Vec<ConjectureDisposition>,
    #[serde(default)]
    pub falsification_criteria: Vec<FalsificationCriterion>,
    #[serde(default)]
    pub protocols: Vec<Protocol>,
    #[serde(default)]
    pub runs: Vec<Run>,
    #[serde(default)]
    pub evidence_artifacts: Vec<EvidenceArtifact>,
    #[serde(default)]
    pub gate_results: Vec<GateResult>,
    #[serde(default)]
    pub comparisons: Vec<Comparison>,
    #[serde(default)]
    pub ledger_links: Vec<LedgerLink>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TheoreticalModel {
    pub model_id: String,
    pub name: String,
    pub description: String,
    pub epistemic_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Material {
    pub material_id: String,
    pub name: String,
    pub material_kind: String,
    pub epistemic_status: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhysicalMechanism {
    pub mechanism_id: String,
    pub name: String,
    pub description: String,
    pub epistemic_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Interface {
    pub interface_id: String,
    pub name: String,
    pub observation_kind: String,
    pub units: String,
    pub description: String,
    pub epistemic_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TypedMorphism {
    pub morphism_id: String,
    pub name: String,
    pub source_model_id: String,
    pub material_id: String,
    pub mechanism_id: String,
    pub target_interface_id: String,
    pub morphism_type: String,
    pub validation_status: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiegeCell {
    pub cell_id: String,
    pub name: String,
    pub model_id: String,
    pub material_id: String,
    pub mechanism_id: String,
    pub interface_id: String,
    pub morphism_id: String,
    pub epistemic_status: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SiegeCellDecision {
    pub decision_id: String,
    pub cell_id: String,
    pub revision: u32,
    pub decided_at: String,
    pub status: String,
    pub rationale: String,
    pub decision_scope: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParameterDefinition {
    pub parameter_id: String,
    pub name: String,
    pub symbol: String,
    pub units: String,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParameterRegion {
    pub region_id: String,
    pub cell_id: String,
    pub name: String,
    pub region_kind: String,
    pub predeclared: bool,
    pub decision_scope: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParameterRegionValue {
    pub region_id: String,
    pub parameter_id: String,
    pub lower_value: Option<f64>,
    pub upper_value: Option<f64>,
    pub exact_text: Option<String>,
    pub units: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Conjecture {
    pub conjecture_id: String,
    pub cell_id: String,
    pub label: String,
    pub statement: String,
    pub version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConjectureDisposition {
    pub disposition_id: String,
    pub conjecture_id: String,
    pub revision: u32,
    pub decided_at: String,
    pub status: String,
    pub rationale: String,
    pub decision_scope: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FalsificationCriterion {
    pub criterion_id: String,
    pub conjecture_id: String,
    pub description: String,
    pub metric: String,
    pub comparator: String,
    pub threshold_value: Option<f64>,
    pub threshold_text: Option<String>,
    pub units: String,
    pub predeclared: bool,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Protocol {
    pub protocol_id: String,
    pub name: String,
    pub version: u32,
    pub config_uri: Option<String>,
    pub config_sha256: Option<String>,
    pub config_hash_status: String,
    pub predeclared: bool,
    pub seed_count: u32,
    pub null_trials: Option<u32>,
    pub null_quantile: Option<f64>,
    pub decision_scope: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Run {
    pub run_id: String,
    pub protocol_id: String,
    pub cell_id: String,
    pub code_commit: String,
    pub run_status: String,
    pub epistemic_status: String,
    pub summary: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EvidenceArtifact {
    pub artifact_id: String,
    pub run_id: String,
    pub artifact_kind: String,
    pub artifact_uri: String,
    pub expected_sha256: String,
    pub canonical_detail: bool,
    pub detail_row_count: Option<u64>,
    pub description: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GateResult {
    pub gate_result_id: String,
    pub run_id: String,
    pub criterion_id: Option<String>,
    pub gate_name: String,
    pub evidence_polarity: String,
    pub passed: bool,
    pub metric_value: Option<f64>,
    pub metric_text: Option<String>,
    pub units: String,
    pub seed_pass_count: Option<u32>,
    pub seed_required_count: Option<u32>,
    pub decision_scope: String,
    pub limitation: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Comparison {
    pub comparison_id: String,
    pub run_id: String,
    pub baseline_run_id: Option<String>,
    pub control_relationship: String,
    pub metric: String,
    pub evidence_polarity: String,
    pub minimum_delta: Option<f64>,
    pub maximum_delta: Option<f64>,
    pub mean_delta: Option<f64>,
    pub units: String,
    pub decision_scope: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LedgerLink {
    pub ledger_link_id: String,
    pub ledger_number: u32,
    pub ledger_title: String,
    pub ledger_path: String,
    pub ledger_sha256: String,
    pub relation: String,
    pub admitted_claim: String,
    pub run_id: Option<String>,
    pub cell_id: Option<String>,
    pub conjecture_id: Option<String>,
    pub protocol_id: Option<String>,
    pub artifact_id: Option<String>,
    pub gate_result_id: Option<String>,
    pub comparison_id: Option<String>,
}
