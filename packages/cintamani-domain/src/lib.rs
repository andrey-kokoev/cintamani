mod admission;
mod chain;
mod mcp;
mod projection;
mod projection_v2;
mod query;
mod records;
mod v2_records;

pub use admission::{
    AdmissionAuthority, AdmissionPreview, AdmissionReceipt, draft_admission, preview_admission,
    promote_admission, validate_admission,
};
pub use chain::{
    AdmissionManifest, CHAIN_SCHEMA, DEFAULT_CHAIN_ROOT, ManifestEntry, VerifiedAdmission,
    VerifiedChain, compute_entry_hash, verify_chain,
};
pub use mcp::{MCP_PROTOCOL_VERSION, MCP_SERVER_NAME, handle_mcp_request, tool_descriptors};
pub use projection::{
    IntegrityReport, PROJECTION_KIND, RebuildReport, RegistryPaths, SCHEMA_VERSION,
    deterministic_logical_readback, discover_workspace_root, inspect, rebuild,
};
pub use query::{
    Collection, FrontierFilters, Page, QueryFilters, SiegeSpaceDimension,
    SiegeSpaceDimensionMember, SiegeSpaceDimensions, dimensions, entity_history, entity_show,
    frontier, list_page, why,
};
pub use v2_records::{AdmissionV2, Change, ProvenanceTarget};
