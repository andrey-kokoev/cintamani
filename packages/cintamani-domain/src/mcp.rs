use crate::{
    AdmissionAuthority, Collection, FrontierFilters, QueryFilters, RegistryPaths, dimensions,
    entity_history, entity_show, frontier, inspect, list_page, preview_admission,
    promote_admission, validate_admission, why,
};
use anyhow::{Result, bail};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    path::{Component, Path, PathBuf},
    str::FromStr,
};

pub const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
pub const MCP_SERVER_NAME: &str = "cintamani-domain";

pub fn handle_mcp_request(paths: &RegistryPaths, request: &Value) -> Option<Value> {
    let id = request.get("id").cloned();
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    id.as_ref()?;
    let result = match method {
        "initialize" => Ok(json!({
            "protocolVersion":MCP_PROTOCOL_VERSION,
            "capabilities":{"tools":{"listChanged":false}},
            "serverInfo":{"name":MCP_SERVER_NAME,"version":env!("CARGO_PKG_VERSION")},
            "instructions":"Governed Cintamani registry queries and authority-receipted admission promotion. Task Lifecycle remains external."
        })),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({"tools":tool_descriptors()})),
        "tools/call" => call_tool(
            paths,
            request.get("params").cloned().unwrap_or_else(|| json!({})),
        ),
        _ => return Some(rpc_error(id, -32601, format!("method not found: {method}"))),
    };
    Some(match result {
        Ok(value) => json!({"jsonrpc":"2.0","id":id,"result":value}),
        Err(error) => rpc_error(id, -32602, error.to_string()),
    })
}

pub fn tool_descriptors() -> Vec<Value> {
    vec![
        tool(
            "cintamani_domain_check",
            "Check chain, schema, histories, paths, provenance, tracked sources, and artifacts.",
            json!({"type":"object","additionalProperties":false}),
            true,
        ),
        tool(
            "cintamani_domain_admission_validate",
            "Validate one workspace-local typed v2 admission draft without mutation.",
            draft_schema(false),
            true,
        ),
        tool(
            "cintamani_domain_admission_preview",
            "Validate and diff one authority-bound prospective admission without changing governed HEAD.",
            draft_schema(true),
            true,
        ),
        tool(
            "cintamani_domain_admission_promote",
            "Promote one validated admission with an external authority receipt and expected-HEAD concurrency guard.",
            draft_schema(true),
            false,
        ),
        tool(
            "cintamani_domain_list",
            "List one registry family with filters and deterministic cursor pagination.",
            json!({
        "type":"object","required":["collection"],"additionalProperties":false,"properties":{
            "collection":{"type":"string","enum":Collection::ALL.map(|item|item.as_str())},
            "filters":filter_schema(),"cursor":{"type":["string","null"]},
            "limit":{"type":"integer","minimum":1,"maximum":100,"default":50}}}),
            true,
        ),
        tool(
            "cintamani_domain_show",
            "Show one stable identity/current-state view.",
            entity_schema(false),
            true,
        ),
        tool(
            "cintamani_domain_history",
            "Page the append-only history for one entity.",
            entity_schema(true),
            true,
        ),
        tool(
            "cintamani_domain_why",
            "Traverse exact typed provenance to admission and Ledger claims.",
            entity_schema(false),
            true,
        ),
        tool(
            "cintamani_domain_dimensions",
            "Show the ordered siege-space axes and their currently assessed members.",
            json!({"type":"object","additionalProperties":false}),
            true,
        ),
        tool(
            "cintamani_domain_frontier",
            "Page a bounded four-axis frontier matrix including absent cells.",
            json!({
        "type":"object","additionalProperties":false,"properties":{
            "filters":{"type":"object","additionalProperties":false,"properties":{
                "model_ids":string_array(),"material_ids":string_array(),"mechanism_ids":string_array(),"interface_ids":string_array()}},
            "cursor":{"type":["string","null"]},"limit":{"type":"integer","minimum":1,"maximum":100,"default":50}}}),
            true,
        ),
    ]
}

fn call_tool(paths: &RegistryPaths, params: Value) -> Result<Value> {
    #[derive(Deserialize)]
    struct Call {
        name: String,
        #[serde(default)]
        arguments: Value,
    }
    let call: Call = serde_json::from_value(params)?;
    let result = (|| -> Result<Value> {
        match call.name.as_str() {
            "cintamani_domain_check" => {
                let report = inspect(paths)?;
                if !report.passes() {
                    bail!("registry check failed: {}", serde_json::to_string(&report)?)
                }
                serde_json::to_value(report).map_err(Into::into)
            }
            "cintamani_domain_admission_validate" => {
                let args: DraftArgs = serde_json::from_value(call.arguments)?;
                serde_json::to_value(validate_admission(&draft_path(paths, &args.draft)?)?)
                    .map_err(Into::into)
            }
            "cintamani_domain_admission_preview" => {
                let args: AuthorityDraftArgs = serde_json::from_value(call.arguments)?;
                let draft = draft_path(paths, &args.draft)?;
                serde_json::to_value(preview_admission(paths, &draft, &args.authority())?)
                    .map_err(Into::into)
            }
            "cintamani_domain_admission_promote" => {
                let args: AuthorityDraftArgs = serde_json::from_value(call.arguments)?;
                let draft = draft_path(paths, &args.draft)?;
                serde_json::to_value(promote_admission(paths, &draft, &args.authority())?)
                    .map_err(Into::into)
            }
            "cintamani_domain_list" => {
                let args: ListArgs = serde_json::from_value(call.arguments)?;
                let collection = Collection::from_str(&args.collection)?;
                serde_json::to_value(list_page(
                    &paths.database_path,
                    collection,
                    &args.filters,
                    args.cursor.as_deref(),
                    args.limit(),
                )?)
                .map_err(Into::into)
            }
            "cintamani_domain_show" => {
                let args: EntityArgs = serde_json::from_value(call.arguments)?;
                entity_show(
                    &paths.database_path,
                    Collection::from_str(&args.collection)?,
                    &args.id,
                )
            }
            "cintamani_domain_history" => {
                let args: EntityArgs = serde_json::from_value(call.arguments)?;
                serde_json::to_value(entity_history(
                    &paths.database_path,
                    Collection::from_str(&args.collection)?,
                    &args.id,
                    args.cursor.as_deref(),
                    args.limit(),
                )?)
                .map_err(Into::into)
            }
            "cintamani_domain_why" => {
                let args: EntityArgs = serde_json::from_value(call.arguments)?;
                why(
                    &paths.database_path,
                    Collection::from_str(&args.collection)?,
                    &args.id,
                    args.limit(),
                )
            }
            "cintamani_domain_dimensions" => {
                serde_json::to_value(dimensions(&paths.database_path)?).map_err(Into::into)
            }
            "cintamani_domain_frontier" => {
                let args: FrontierArgs = serde_json::from_value(call.arguments)?;
                serde_json::to_value(frontier(
                    &paths.database_path,
                    &args.filters,
                    args.cursor.as_deref(),
                    args.limit(),
                )?)
                .map_err(Into::into)
            }
            _ => bail!("unknown tool {}", call.name),
        }
    })();
    Ok(match result {
        Ok(value) => tool_result(value, false),
        Err(error) => tool_result(json!({"error":error.to_string()}), true),
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct DraftArgs {
    draft: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AuthorityDraftArgs {
    draft: String,
    admitted_by: String,
    authority_kind: String,
    authority_ref: String,
    expected_head: String,
}
impl AuthorityDraftArgs {
    fn authority(&self) -> AdmissionAuthority<'_> {
        AdmissionAuthority {
            admitted_by: &self.admitted_by,
            authority_kind: &self.authority_kind,
            authority_ref: &self.authority_ref,
            expected_head: &self.expected_head,
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ListArgs {
    collection: String,
    #[serde(default)]
    filters: QueryFilters,
    cursor: Option<String>,
    limit: Option<usize>,
}
impl ListArgs {
    fn limit(&self) -> usize {
        self.limit.unwrap_or(50)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EntityArgs {
    collection: String,
    id: String,
    cursor: Option<String>,
    limit: Option<usize>,
}
impl EntityArgs {
    fn limit(&self) -> usize {
        self.limit.unwrap_or(50)
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FrontierArgs {
    #[serde(default)]
    filters: FrontierFilters,
    cursor: Option<String>,
    limit: Option<usize>,
}
impl FrontierArgs {
    fn limit(&self) -> usize {
        self.limit.unwrap_or(50)
    }
}

fn draft_path(paths: &RegistryPaths, value: &str) -> Result<PathBuf> {
    let path = Path::new(value);
    if path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        bail!("MCP draft path must be workspace-relative without parent traversal");
    }
    let absolute = paths.workspace_root.join(path);
    if !absolute.starts_with(&paths.workspace_root) {
        bail!("MCP draft path escaped the workspace")
    }
    Ok(absolute)
}

fn tool(name: &str, description: &str, input_schema: Value, read_only: bool) -> Value {
    json!({"name":name,"description":description,
    "inputSchema":input_schema,"annotations":{"title":name,"readOnlyHint":read_only,
        "destructiveHint":false,"idempotentHint":read_only,"openWorldHint":false}})
}
fn tool_result(value: Value, is_error: bool) -> Value {
    json!({"content":[{"type":"text","text":serde_json::to_string_pretty(&value).unwrap_or_else(|_|value.to_string())}],
    "structuredContent":value,"isError":is_error})
}
fn rpc_error(id: Option<Value>, code: i64, message: String) -> Value {
    json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})
}
fn draft_schema(authority: bool) -> Value {
    let mut required = vec!["draft"];
    if authority {
        required.extend([
            "admitted_by",
            "authority_kind",
            "authority_ref",
            "expected_head",
        ])
    }
    json!({"type":"object","required":required,"additionalProperties":false,"properties":{
        "draft":{"type":"string"},"admitted_by":{"type":"string"},"authority_kind":{"type":"string"},
        "authority_ref":{"type":"string"},"expected_head":{"type":"string"}}})
}
fn entity_schema(history: bool) -> Value {
    let mut properties = json!({"collection":{"type":"string","enum":Collection::ALL.map(|item|item.as_str())},"id":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":50}});
    if history {
        properties["cursor"] = json!({"type":["string","null"]});
    }
    json!({"type":"object","required":["collection","id"],"additionalProperties":false,"properties":properties})
}
fn filter_schema() -> Value {
    json!({"type":"object","additionalProperties":false,"properties":{
    "model_id":{"type":["string","null"]},"material_id":{"type":["string","null"]},
    "mechanism_id":{"type":["string","null"]},"interface_id":{"type":["string","null"]},
    "status":{"type":["string","null"]},"source_admission_id":{"type":["string","null"]},
    "ledger_number":{"type":["integer","null"]},"text":{"type":["string","null"]}}})
}
fn string_array() -> Value {
    json!({"type":"array","maxItems":100,"items":{"type":"string"}})
}
