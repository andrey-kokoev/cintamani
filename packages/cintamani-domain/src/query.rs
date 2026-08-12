use anyhow::{Context, Result, bail};
use rusqlite::{Connection, OpenFlags, params_from_iter, types::Value as SqlValue};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{fmt, path::Path, str::FromStr};

pub const COORDINATE_KEY_VERSION: &str = "cintamani.coordinate-key.v1";

pub fn coordinate_key(model: &str, material: &str, mechanism: &str, interface: &str) -> String {
    format!(
        "{}:{}|{}:{}|{}:{}|{}:{}|{}:{}",
        COORDINATE_KEY_VERSION.len(),
        COORDINATE_KEY_VERSION,
        model.len(),
        model,
        material.len(),
        material,
        mechanism.len(),
        mechanism,
        interface.len(),
        interface
    )
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Collection {
    Models,
    Materials,
    Mechanisms,
    Interfaces,
    Morphisms,
    Paths,
    Cells,
    Problems,
    ProblemVersions,
    Conjectures,
    ConjectureVersions,
    ConjectureFramings,
    ResearchTopics,
    ResearchTopicVersions,
    Criteria,
    Parameters,
    Regions,
    RegionVersions,
    Protocols,
    Runs,
    Artifacts,
    Gates,
    Comparisons,
    Admissions,
    Provenance,
}

impl Collection {
    pub const ALL: [Self; 25] = [
        Self::Models,
        Self::Materials,
        Self::Mechanisms,
        Self::Interfaces,
        Self::Morphisms,
        Self::Paths,
        Self::Cells,
        Self::Problems,
        Self::ProblemVersions,
        Self::Conjectures,
        Self::ConjectureVersions,
        Self::ConjectureFramings,
        Self::ResearchTopics,
        Self::ResearchTopicVersions,
        Self::Criteria,
        Self::Parameters,
        Self::Regions,
        Self::RegionVersions,
        Self::Protocols,
        Self::Runs,
        Self::Artifacts,
        Self::Gates,
        Self::Comparisons,
        Self::Admissions,
        Self::Provenance,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Models => "models",
            Self::Materials => "materials",
            Self::Mechanisms => "mechanisms",
            Self::Interfaces => "interfaces",
            Self::Morphisms => "morphisms",
            Self::Paths => "paths",
            Self::Cells => "cells",
            Self::Problems => "problems",
            Self::ProblemVersions => "problem-versions",
            Self::Conjectures => "conjectures",
            Self::ConjectureVersions => "conjecture-versions",
            Self::ConjectureFramings => "conjecture-framings",
            Self::ResearchTopics => "research-topics",
            Self::ResearchTopicVersions => "research-topic-versions",
            Self::Criteria => "criteria",
            Self::Parameters => "parameters",
            Self::Regions => "regions",
            Self::RegionVersions => "region-versions",
            Self::Protocols => "protocols",
            Self::Runs => "runs",
            Self::Artifacts => "artifacts",
            Self::Gates => "gates",
            Self::Comparisons => "comparisons",
            Self::Admissions => "admissions",
            Self::Provenance => "provenance",
        }
    }
}

impl fmt::Display for Collection {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for Collection {
    type Err = anyhow::Error;
    fn from_str(value: &str) -> Result<Self> {
        Self::ALL
            .into_iter()
            .find(|item| item.as_str() == value)
            .with_context(|| format!("unknown collection {value}"))
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct QueryFilters {
    pub model_id: Option<String>,
    pub material_id: Option<String>,
    pub mechanism_id: Option<String>,
    pub interface_id: Option<String>,
    pub status: Option<String>,
    pub source_admission_id: Option<String>,
    pub ledger_number: Option<u32>,
    pub text: Option<String>,
    pub locus: Option<String>,
    pub origin: Option<String>,
    pub coordinate: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FrontierFilters {
    #[serde(default)]
    pub model_ids: Vec<String>,
    #[serde(default)]
    pub material_ids: Vec<String>,
    #[serde(default)]
    pub mechanism_ids: Vec<String>,
    #[serde(default)]
    pub interface_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct SearchSpaceDimensionMember {
    pub member_order: i64,
    pub member_id: String,
    pub member_name: String,
    pub current_assessment_id: Option<String>,
    pub current_assessment_revision: Option<i64>,
    pub current_assessment_status: Option<String>,
    pub current_assessment_detail: Option<String>,
    pub assessed_at: Option<String>,
    pub assessment_rationale: Option<String>,
    pub assessment_scope: Option<String>,
    pub source_admission_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct SearchSpaceDimension {
    pub dimension_order: i64,
    pub dimension_key: String,
    pub dimension_name: String,
    pub dimension_role: String,
    pub member_count: usize,
    pub members: Vec<SearchSpaceDimensionMember>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct SearchSpaceDimensions {
    pub collection: String,
    pub items: Vec<SearchSpaceDimension>,
}

const DIMENSION_DEFINITIONS: [(i64, &str, &str, &str); 4] = [
    (
        1,
        "theoretical-model",
        "Theoretical model",
        "original-three-dimensional-axis",
    ),
    (
        2,
        "physical-material",
        "Physical material",
        "original-three-dimensional-axis",
    ),
    (
        3,
        "physical-calculation-mechanism",
        "Physical calculation mechanism",
        "original-three-dimensional-axis",
    ),
    (
        4,
        "observation-interface",
        "Observation interface",
        "later-added-fourth-dimension",
    ),
];

#[derive(Clone, Debug, Serialize)]
pub struct Page {
    pub collection: String,
    pub limit: usize,
    pub filters: Value,
    pub items: Vec<Value>,
    pub next_cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct CoordinateMetadata {
    pub coordinate_key_version: String,
    pub coordinate_key: String,
    pub validation_generation: String,
    pub model_id: String,
    pub material_id: String,
    pub mechanism_id: String,
    pub interface_id: String,
    pub model_name: String,
    pub material_name: String,
    pub mechanism_name: String,
    pub interface_name: String,
    pub classification: String,
    pub cell_id: Option<String>,
    pub cell_name: Option<String>,
    pub status: Option<String>,
}

pub fn dimensions(database: &Path) -> Result<SearchSpaceDimensions> {
    let connection = open(database)?;
    let mut statement = connection
        .prepare(
            "SELECT dimension_order,dimension_key,dimension_name,dimension_role,
                member_order,member_id,member_name,current_assessment_id,
                current_assessment_revision,current_assessment_status,current_assessment_detail,
                assessed_at,assessment_rationale,assessment_scope,source_admission_id
         FROM siege_space_dimensions ORDER BY dimension_order,member_order,member_id",
        )
        .context(
            "legacy compatibility view siege_space_dimensions is unavailable; rebuild the owned schema-4 projection first",
        )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            SearchSpaceDimensionMember {
                member_order: row.get(4)?,
                member_id: row.get(5)?,
                member_name: row.get(6)?,
                current_assessment_id: row.get(7)?,
                current_assessment_revision: row.get(8)?,
                current_assessment_status: row.get(9)?,
                current_assessment_detail: row.get(10)?,
                assessed_at: row.get(11)?,
                assessment_rationale: row.get(12)?,
                assessment_scope: row.get(13)?,
                source_admission_id: row.get(14)?,
            },
        ))
    })?;

    let mut items = DIMENSION_DEFINITIONS
        .iter()
        .map(|(order, key, name, role)| SearchSpaceDimension {
            dimension_order: *order,
            dimension_key: (*key).to_owned(),
            dimension_name: (*name).to_owned(),
            dimension_role: (*role).to_owned(),
            member_count: 0,
            members: Vec::new(),
        })
        .collect::<Vec<_>>();
    for row in rows {
        let (order, key, name, role, member) = row?;
        let index = usize::try_from(order - 1).context("invalid search dimension order")?;
        let dimension = items
            .get_mut(index)
            .context("search dimension view exposed an unknown axis")?;
        if dimension.dimension_order != order
            || dimension.dimension_key != key
            || dimension.dimension_name != name
            || dimension.dimension_role != role
        {
            bail!("search dimension view metadata does not match the governed four-axis contract");
        }
        let expected_member_order = i64::try_from(dimension.members.len() + 1)?;
        if member.member_order != expected_member_order {
            bail!("search dimension member order is not contiguous");
        }
        dimension.members.push(member);
    }
    for dimension in &mut items {
        dimension.member_count = dimension.members.len();
    }
    Ok(SearchSpaceDimensions {
        collection: "dimensions".to_owned(),
        items,
    })
}

pub fn list_page(
    database: &Path,
    collection: Collection,
    filters: &QueryFilters,
    cursor: Option<&str>,
    limit: usize,
) -> Result<Page> {
    validate_limit(limit)?;
    let digest = filter_digest(collection.as_str(), filters)?;
    let after = decode_cursor(cursor, collection.as_str(), &digest)?;
    let spec = collection_spec(collection);
    let connection = open(database)?;
    let mut sql = format!(
        "SELECT key, payload FROM ({}) q WHERE key > ?",
        spec.base_sql
    );
    let mut values = vec![SqlValue::Text(after)];
    push_filter(&mut sql, &mut values, "model_id", &filters.model_id);
    push_filter(&mut sql, &mut values, "material_id", &filters.material_id);
    push_filter(&mut sql, &mut values, "mechanism_id", &filters.mechanism_id);
    push_filter(&mut sql, &mut values, "interface_id", &filters.interface_id);
    push_filter(&mut sql, &mut values, "status", &filters.status);
    push_filter(
        &mut sql,
        &mut values,
        "source_admission_id",
        &filters.source_admission_id,
    );
    if let Some(number) = filters.ledger_number {
        let target_match = provenance_match(collection, "q.key");
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM provenance_claims p JOIN ledger_links l USING(ledger_link_id)
               WHERE ({target_match}) AND l.ledger_number=?)"
        ));
        values.push(SqlValue::Integer(number.into()));
    }
    if let Some(text) = &filters.text {
        sql.push_str(" AND lower(payload) LIKE ?");
        values.push(SqlValue::Text(format!("%{}%", text.to_ascii_lowercase())));
    }
    push_topic_filters(&mut sql, &mut values, collection, filters)?;
    sql.push_str(" ORDER BY key LIMIT ?");
    values.push(SqlValue::Integer((limit + 1) as i64));
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut keyed = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = keyed.len() > limit;
    keyed.truncate(limit);
    let next_cursor = if has_more {
        keyed
            .last()
            .map(|(key, _)| encode_cursor(collection.as_str(), &digest, key))
    } else {
        None
    };
    let items = keyed
        .into_iter()
        .map(|(_, payload)| serde_json::from_str(&payload))
        .collect::<serde_json::Result<Vec<_>>>()?;
    Ok(Page {
        collection: collection.to_string(),
        limit,
        filters: serde_json::to_value(filters)?,
        items,
        next_cursor,
    })
}

fn push_topic_filters(
    sql: &mut String,
    values: &mut Vec<SqlValue>,
    collection: Collection,
    filters: &QueryFilters,
) -> Result<()> {
    let topic_id = match collection {
        Collection::ResearchTopics => "q.key",
        Collection::ResearchTopicVersions => {
            "(SELECT topic_id FROM research_topic_versions WHERE topic_version_id=q.key)"
        }
        _ if filters.locus.is_some()
            || filters.origin.is_some()
            || filters.coordinate.is_some() =>
        {
            bail!("locus, origin, and coordinate filters apply only to research topics")
        }
        _ => return Ok(()),
    };
    let version_id = format!(
        "(SELECT topic_version_id FROM current_research_topic_versions WHERE topic_id={topic_id})"
    );
    if let Some(locus) = &filters.locus {
        sql.push_str(&format!(
            " AND EXISTS(SELECT 1 FROM research_topic_loci l WHERE l.topic_version_id={version_id} AND l.locus_kind=?)"
        ));
        values.push(SqlValue::Text(locus.clone()));
    }
    if let Some(origin) = &filters.origin {
        sql.push_str(&format!(
            " AND EXISTS(SELECT 1 FROM research_topic_origins o WHERE o.topic_version_id={version_id} AND (o.problem_version_id=? OR o.conjecture_version_id=?))"
        ));
        values.push(SqlValue::Text(origin.clone()));
        values.push(SqlValue::Text(origin.clone()));
    }
    if let Some(coordinate) = &filters.coordinate {
        sql.push_str(&format!(
            " AND EXISTS(SELECT 1 FROM research_topic_framing_links l JOIN conjecture_framings f ON f.framing_id=l.conjecture_framing_id WHERE l.topic_version_id={version_id} AND f.coordinate_key=?)"
        ));
        values.push(SqlValue::Text(coordinate.clone()));
    }
    Ok(())
}

pub fn entity_show(database: &Path, collection: Collection, id: &str) -> Result<Value> {
    let spec = collection_spec(collection);
    let connection = open(database)?;
    let sql = format!("SELECT payload FROM ({}) WHERE key=?1", spec.base_sql);
    let payload: String = connection
        .query_row(&sql, [id], |row| row.get(0))
        .with_context(|| format!("{} entity {id} not found", collection.as_str()))?;
    Ok(serde_json::from_str(&payload)?)
}

pub fn entity_history(
    database: &Path,
    collection: Collection,
    id: &str,
    cursor: Option<&str>,
    limit: usize,
) -> Result<Page> {
    validate_limit(limit)?;
    let scope = format!("history:{}:{id}", collection.as_str());
    let digest = filter_digest(&scope, &json!({"id":id}))?;
    let after = decode_cursor(cursor, &scope, &digest)?;
    let connection = open(database)?;
    let sql = if matches!(collection, Collection::Gates | Collection::Comparisons) {
        supersession_history_sql(&connection, collection, id)?
    } else {
        let base = history_base_sql(collection)
            .context("this collection has no append-only history family")?;
        format!(
            "SELECT key,payload FROM ({base}) WHERE parent_id=?1 AND key>?2 ORDER BY key LIMIT ?3"
        )
    };
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params![id, after, (limit + 1) as i64], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut keyed = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = keyed.len() > limit;
    keyed.truncate(limit);
    let next_cursor = if has_more {
        keyed
            .last()
            .map(|(key, _)| encode_cursor(&scope, &digest, key))
    } else {
        None
    };
    let items = keyed
        .into_iter()
        .map(|(_, value)| serde_json::from_str(&value))
        .collect::<serde_json::Result<Vec<_>>>()?;
    Ok(Page {
        collection: scope,
        limit,
        filters: json!({"id":id}),
        items,
        next_cursor,
    })
}

pub fn why(database: &Path, collection: Collection, id: &str, limit: usize) -> Result<Value> {
    validate_limit(limit)?;
    let entity = entity_show(database, collection, id)?;
    let target_match = provenance_match(collection, "?1");
    let connection = open(database)?;
    let sql = format!(
        "SELECT json_object(
            'provenance_id',p.provenance_id,'provenance_kind',p.provenance_kind,
            'claim_text',p.claim_text,'source_admission_id',p.source_admission_id,
            'ledger_link',CASE WHEN l.ledger_link_id IS NULL THEN NULL ELSE json_object(
                'ledger_link_id',l.ledger_link_id,'ledger_number',l.ledger_number,
                'ledger_path',l.ledger_path,'ledger_sha256',l.ledger_sha256,
                'relation',l.relation,'admitted_claim',l.admitted_claim) END,
            'admission',json_object('admission_id',a.admission_id,'sequence',a.admission_sequence,
                'source_path',a.source_path,'source_sha256',a.source_sha256,
                'authority_kind',a.authority_kind,'authority_ref',a.authority_ref)
         ) FROM provenance_claims p
         JOIN admissions a ON a.admission_id=p.source_admission_id
         LEFT JOIN ledger_links l ON l.ledger_link_id=p.ledger_link_id
         WHERE ({target_match}) ORDER BY p.provenance_id LIMIT ?2"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(rusqlite::params![id, limit as i64], |row| {
        row.get::<_, String>(0)
    })?;
    let provenance = rows
        .map(|row| Ok(serde_json::from_str::<Value>(&row?)?))
        .collect::<Result<Vec<_>>>()?;
    Ok(
        json!({"collection":collection.as_str(),"entity":entity,"provenance":provenance,"bounded_limit":limit}),
    )
}

pub fn frontier(
    database: &Path,
    filters: &FrontierFilters,
    cursor: Option<&str>,
    limit: usize,
) -> Result<Page> {
    validate_limit(limit)?;
    for (axis, values) in [
        ("model", &filters.model_ids),
        ("material", &filters.material_ids),
        ("mechanism", &filters.mechanism_ids),
        ("interface", &filters.interface_ids),
    ] {
        if values.len() > 100 {
            bail!("frontier {axis} filter exceeds the 100-value bound");
        }
    }
    let digest = filter_digest("frontier", filters)?;
    let after = decode_cursor(cursor, "frontier", &digest)?;
    let connection = open(database)?;
    let generation: String = connection.query_row(
        "SELECT value FROM metadata WHERE key='chain_generation'",
        [],
        |row| row.get(0),
    )?;
    let mut sql = String::from(
        "SELECT m.model_id||char(31)||a.material_id||char(31)||p.mechanism_id||char(31)||i.interface_id AS key,
         m.model_id,a.material_id,p.mechanism_id,i.interface_id,m.name,a.name,p.name,i.name,
         c.cell_id,c.name,d.status
         FROM theoretical_models m CROSS JOIN materials a CROSS JOIN physical_mechanisms p CROSS JOIN interfaces i
         LEFT JOIN siege_cells c ON c.model_id=m.model_id AND c.material_id=a.material_id
             AND c.mechanism_id=p.mechanism_id AND c.interface_id=i.interface_id
         LEFT JOIN current_siege_cell_decisions d ON d.cell_id=c.cell_id WHERE
         m.model_id||char(31)||a.material_id||char(31)||p.mechanism_id||char(31)||i.interface_id > ?"
    );
    let mut values = vec![SqlValue::Text(after)];
    push_in_filter(&mut sql, &mut values, "m.model_id", &filters.model_ids);
    push_in_filter(
        &mut sql,
        &mut values,
        "a.material_id",
        &filters.material_ids,
    );
    push_in_filter(
        &mut sql,
        &mut values,
        "p.mechanism_id",
        &filters.mechanism_ids,
    );
    push_in_filter(
        &mut sql,
        &mut values,
        "i.interface_id",
        &filters.interface_ids,
    );
    sql.push_str(" ORDER BY key LIMIT ?");
    values.push(SqlValue::Integer((limit + 1) as i64));
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(params_from_iter(values), |row| {
        let model_id = row.get::<_, String>(1)?;
        let material_id = row.get::<_, String>(2)?;
        let mechanism_id = row.get::<_, String>(3)?;
        let interface_id = row.get::<_, String>(4)?;
        let cell_id = row.get::<_, Option<String>>(9)?;
        Ok((
            row.get::<_, String>(0)?,
            CoordinateMetadata {
                coordinate_key_version: COORDINATE_KEY_VERSION.to_owned(),
                coordinate_key: coordinate_key(
                    &model_id,
                    &material_id,
                    &mechanism_id,
                    &interface_id,
                ),
                validation_generation: generation.clone(),
                model_id,
                material_id,
                mechanism_id,
                interface_id,
                model_name: row.get(5)?,
                material_name: row.get(6)?,
                mechanism_name: row.get(7)?,
                interface_name: row.get(8)?,
                classification: if cell_id.is_some() {
                    "admitted-cell"
                } else {
                    "gap"
                }
                .to_owned(),
                cell_id,
                cell_name: row.get(10)?,
                status: row.get(11)?,
            },
        ))
    })?;
    let mut keyed = rows.collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = keyed.len() > limit;
    keyed.truncate(limit);
    let next_cursor = if has_more {
        keyed
            .last()
            .map(|(key, _)| encode_cursor("frontier", &digest, key))
    } else {
        None
    };
    let items = keyed
        .into_iter()
        .map(|(_, value)| serde_json::to_value(value))
        .collect::<serde_json::Result<Vec<_>>>()?;
    Ok(Page {
        collection: "frontier".to_owned(),
        limit,
        filters: serde_json::to_value(filters)?,
        items,
        next_cursor,
    })
}

struct CollectionSpec {
    base_sql: &'static str,
}

fn provenance_match(collection: Collection, key: &str) -> String {
    match collection {
        Collection::Models => format!(
            "p.theoretical_model_id={key} OR p.theoretical_model_assessment_id IN (
                SELECT assessment_id FROM theoretical_model_assessments WHERE model_id={key})"
        ),
        Collection::Materials => format!(
            "p.material_id={key} OR p.material_assessment_id IN (
                SELECT assessment_id FROM material_assessments WHERE material_id={key})"
        ),
        Collection::Mechanisms => format!(
            "p.mechanism_id={key} OR p.mechanism_assessment_id IN (
                SELECT assessment_id FROM mechanism_assessments WHERE mechanism_id={key})"
        ),
        Collection::Interfaces => format!(
            "p.interface_id={key} OR p.interface_assessment_id IN (
                SELECT assessment_id FROM interface_assessments WHERE interface_id={key})"
        ),
        Collection::Morphisms => format!(
            "p.morphism_id={key} OR p.morphism_assessment_id IN (
                SELECT assessment_id FROM morphism_assessments WHERE morphism_id={key})"
        ),
        Collection::Paths => format!("p.path_id={key}"),
        Collection::Cells => format!(
            "p.cell_id={key} OR p.cell_assessment_id IN (
                SELECT assessment_id FROM siege_cell_assessments WHERE cell_id={key}) OR
             p.cell_decision_id IN (SELECT decision_id FROM siege_cell_decisions WHERE cell_id={key})"
        ),
        Collection::Problems => format!(
            "p.problem_id={key} OR p.problem_version_id IN (
                SELECT problem_version_id FROM problem_versions WHERE problem_id={key}) OR
             p.conjecture_id IN (SELECT conjecture_id FROM conjectures WHERE problem_id={key}) OR
             p.conjecture_version_id IN (SELECT v.conjecture_version_id FROM conjecture_versions v
                JOIN conjectures q USING(conjecture_id) WHERE q.problem_id={key}) OR
             p.conjecture_framing_id IN (SELECT f.framing_id FROM conjecture_framings f
                JOIN conjecture_versions v USING(conjecture_version_id)
                JOIN conjectures q USING(conjecture_id) WHERE q.problem_id={key})"
        ),
        Collection::ProblemVersions => format!("p.problem_version_id={key}"),
        Collection::Conjectures => format!(
            "p.conjecture_id={key} OR p.conjecture_version_id IN (
                SELECT conjecture_version_id FROM conjecture_versions WHERE conjecture_id={key}) OR
             p.conjecture_disposition_id IN (
                SELECT disposition_id FROM conjecture_dispositions WHERE conjecture_id={key}) OR
             p.criterion_id IN (SELECT f.criterion_id FROM falsification_criteria f
                JOIN conjecture_versions v USING(conjecture_version_id) WHERE v.conjecture_id={key})"
        ),
        Collection::ConjectureVersions => format!(
            "p.conjecture_version_id={key} OR p.conjecture_disposition_id IN (
                SELECT disposition_id FROM conjecture_dispositions WHERE conjecture_version_id={key}) OR
             p.criterion_id IN (SELECT criterion_id FROM falsification_criteria WHERE conjecture_version_id={key})"
        ),
        Collection::ConjectureFramings => format!("p.conjecture_framing_id={key}"),
        Collection::ResearchTopics => format!(
            "p.research_topic_id={key} OR p.research_topic_version_id IN (
                SELECT topic_version_id FROM research_topic_versions WHERE topic_id={key}) OR
             p.research_topic_workflow_event_id IN (
                SELECT workflow_event_id FROM research_topic_workflow_events WHERE topic_id={key}) OR
             p.research_topic_relation_id IN (
                SELECT relation_id FROM research_topic_relations r
                JOIN research_topic_versions v ON v.topic_version_id=r.source_topic_version_id
                WHERE v.topic_id={key})"
        ),
        Collection::ResearchTopicVersions => format!(
            "p.research_topic_version_id={key} OR p.research_topic_relation_id IN (
                SELECT relation_id FROM research_topic_relations
                WHERE source_topic_version_id={key} OR target_topic_version_id={key})"
        ),
        Collection::Criteria => format!("p.criterion_id={key}"),
        Collection::Parameters => format!("p.parameter_id={key}"),
        Collection::Regions => format!(
            "p.region_id={key} OR p.region_version_id IN (
                SELECT region_version_id FROM parameter_region_versions WHERE region_id={key})"
        ),
        Collection::RegionVersions => format!("p.region_version_id={key}"),
        Collection::Protocols => format!(
            "p.protocol_id={key} OR p.protocol_version_id IN (
                SELECT protocol_version_id FROM protocol_versions WHERE protocol_id={key}) OR
             p.protocol_assessment_id IN (SELECT a.assessment_id FROM protocol_provenance_assessments a
                JOIN protocol_versions v USING(protocol_version_id) WHERE v.protocol_id={key})"
        ),
        Collection::Runs => format!(
            "p.run_id={key} OR p.run_assessment_id IN (
                SELECT assessment_id FROM run_assessments WHERE run_id={key})"
        ),
        Collection::Artifacts => format!("p.artifact_id={key}"),
        Collection::Gates => format!(
            "p.gate_result_id={key} OR p.gate_supersession_id IN (
                SELECT supersession_id FROM gate_result_supersessions
                WHERE prior_gate_result_id={key} OR replacement_gate_result_id={key})"
        ),
        Collection::Comparisons => format!(
            "p.comparison_id={key} OR p.comparison_supersession_id IN (
                SELECT supersession_id FROM comparison_supersessions
                WHERE prior_comparison_id={key} OR replacement_comparison_id={key})"
        ),
        Collection::Admissions => format!("p.source_admission_id={key}"),
        Collection::Provenance => format!("p.provenance_id={key}"),
    }
}

fn collection_spec(collection: Collection) -> CollectionSpec {
    let (base_sql, _provenance_column) = match collection {
        Collection::Models => (
            "SELECT m.model_id key,json_object('model_id',m.model_id,'name',m.name,'description',m.description,'status',a.epistemic_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,m.model_id model_id,NULL material_id,NULL mechanism_id,NULL interface_id,a.epistemic_status status,a.source_admission_id FROM theoretical_models m JOIN theoretical_model_assessments a ON a.model_id=m.model_id AND a.revision=(SELECT MAX(x.revision) FROM theoretical_model_assessments x WHERE x.model_id=m.model_id)",
            Some("theoretical_model_id"),
        ),
        Collection::Materials => (
            "SELECT m.material_id key,json_object('material_id',m.material_id,'name',m.name,'description',m.description,'classification',a.material_classification,'status',a.epistemic_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,NULL model_id,m.material_id material_id,NULL mechanism_id,NULL interface_id,a.epistemic_status status,a.source_admission_id FROM materials m JOIN material_assessments a ON a.material_id=m.material_id AND a.revision=(SELECT MAX(x.revision) FROM material_assessments x WHERE x.material_id=m.material_id)",
            Some("material_id"),
        ),
        Collection::Mechanisms => (
            "SELECT m.mechanism_id key,json_object('mechanism_id',m.mechanism_id,'name',m.name,'description',m.description,'status',a.epistemic_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,NULL model_id,NULL material_id,m.mechanism_id mechanism_id,NULL interface_id,a.epistemic_status status,a.source_admission_id FROM physical_mechanisms m JOIN mechanism_assessments a ON a.mechanism_id=m.mechanism_id AND a.revision=(SELECT MAX(x.revision) FROM mechanism_assessments x WHERE x.mechanism_id=m.mechanism_id)",
            Some("mechanism_id"),
        ),
        Collection::Interfaces => (
            "SELECT i.interface_id key,json_object('interface_id',i.interface_id,'name',i.name,'observation_kind',i.observation_kind,'units',i.units,'description',i.description,'status',a.epistemic_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,i.interface_id interface_id,a.epistemic_status status,a.source_admission_id FROM interfaces i JOIN interface_assessments a ON a.interface_id=i.interface_id AND a.revision=(SELECT MAX(x.revision) FROM interface_assessments x WHERE x.interface_id=i.interface_id)",
            Some("interface_id"),
        ),
        Collection::Morphisms => (
            "SELECT m.morphism_id key,json_object('morphism_id',m.morphism_id,'name',m.name,'model_id',m.model_id,'material_id',m.material_id,'mechanism_id',m.mechanism_id,'interface_id',m.interface_id,'source_port_id',m.source_port_id,'target_port_id',m.target_port_id,'morphism_type',m.morphism_type,'status',a.validation_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,m.model_id,m.material_id,m.mechanism_id,m.interface_id,a.validation_status status,a.source_admission_id FROM typed_morphisms m JOIN morphism_assessments a ON a.morphism_id=m.morphism_id AND a.revision=(SELECT MAX(x.revision) FROM morphism_assessments x WHERE x.morphism_id=m.morphism_id)",
            Some("morphism_id"),
        ),
        Collection::Paths => (
            "SELECT p.path_id key,json_object('path_id',p.path_id,'name',p.name,'model_id',p.model_id,'material_id',p.material_id,'mechanism_id',p.mechanism_id,'interface_id',p.interface_id,'source_port_id',p.source_port_id,'target_port_id',p.target_port_id,'step_count',(SELECT COUNT(*) FROM morphism_path_steps s WHERE s.path_id=p.path_id),'source_admission_id',p.source_admission_id) payload,p.model_id,p.material_id,p.mechanism_id,p.interface_id,NULL status,p.source_admission_id FROM morphism_paths p",
            Some("path_id"),
        ),
        Collection::Cells => (
            "SELECT c.cell_id key,json_object('cell_id',c.cell_id,'name',c.name,'model_id',c.model_id,'material_id',c.material_id,'mechanism_id',c.mechanism_id,'interface_id',c.interface_id,'status',d.status,'decision_revision',d.revision,'epistemic_status',a.epistemic_status,'source_admission_id',d.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,d.status,d.source_admission_id FROM siege_cells c JOIN current_siege_cell_decisions d ON d.cell_id=c.cell_id JOIN siege_cell_assessments a ON a.cell_id=c.cell_id AND a.revision=(SELECT MAX(x.revision) FROM siege_cell_assessments x WHERE x.cell_id=c.cell_id)",
            Some("cell_id"),
        ),
        Collection::Problems => (
            "SELECT p.problem_id key,json_object('problem_id',p.problem_id,'label',p.label,'current_version_id',v.problem_version_id,'revision',v.revision,'problem_statement',v.problem_statement,'rationale',v.rationale,'scope',v.problem_scope,'source_admission_id',v.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,v.event_kind status,v.source_admission_id FROM problems p JOIN current_problem_versions v ON v.problem_id=p.problem_id",
            Some("problem_id"),
        ),
        Collection::ProblemVersions => (
            "SELECT v.problem_version_id key,json_object('problem_version_id',v.problem_version_id,'problem_id',v.problem_id,'revision',v.revision,'event_kind',v.event_kind,'problem_statement',v.problem_statement,'rationale',v.rationale,'scope',v.problem_scope,'source_admission_id',v.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,v.event_kind status,v.source_admission_id FROM problem_versions v",
            Some("problem_version_id"),
        ),
        Collection::Conjectures => (
            "SELECT q.conjecture_id key,json_object('conjecture_id',q.conjecture_id,'problem_id',q.problem_id,'label',q.label,'version_id',v.conjecture_version_id,'version_revision',v.revision,'statement',v.statement,'status',d.status,'disposition_revision',d.revision,'framing_count',(SELECT COUNT(*) FROM conjecture_framings f WHERE f.conjecture_version_id=v.conjecture_version_id),'source_admission_id',d.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,d.status,d.source_admission_id FROM conjectures q JOIN current_conjecture_versions v ON v.conjecture_id=q.conjecture_id JOIN current_conjecture_dispositions d ON d.conjecture_id=q.conjecture_id",
            Some("conjecture_id"),
        ),
        Collection::ConjectureVersions => (
            "SELECT v.conjecture_version_id key,json_object('conjecture_version_id',v.conjecture_version_id,'conjecture_id',v.conjecture_id,'problem_id',q.problem_id,'revision',v.revision,'event_kind',v.event_kind,'statement',v.statement,'rationale',v.rationale,'scope',v.formulation_scope,'framing_count',(SELECT COUNT(*) FROM conjecture_framings f WHERE f.conjecture_version_id=v.conjecture_version_id),'source_admission_id',v.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,v.event_kind status,v.source_admission_id FROM conjecture_versions v JOIN conjectures q ON q.conjecture_id=v.conjecture_id",
            Some("conjecture_version_id"),
        ),
        Collection::ConjectureFramings => (
            "SELECT f.framing_id key,json_object('framing_id',f.framing_id,'conjecture_version_id',f.conjecture_version_id,'framing_order',f.framing_order,'coordinate_key_version',f.coordinate_key_version,'coordinate_key',f.coordinate_key,'validation_generation',f.validation_generation,'model_id',f.model_id,'material_id',f.material_id,'mechanism_id',f.mechanism_id,'interface_id',f.interface_id,'classification',f.coordinate_classification,'cell_id',f.cell_id,'framing_rationale',f.framing_rationale,'source_admission_id',f.source_admission_id) payload,f.model_id,f.material_id,f.mechanism_id,f.interface_id,f.coordinate_classification status,f.source_admission_id FROM conjecture_framings f",
            Some("conjecture_framing_id"),
        ),
        Collection::ResearchTopics => (
            "SELECT t.topic_id key,json_object(
                'topic_id',t.topic_id,'topic_kind',t.topic_kind,'label',t.label,
                'current_version_id',v.topic_version_id,'revision',v.revision,'title',v.title,
                'open_problem',v.open_problem,'why_open',v.why_open,'scope',v.topic_scope,
                'next_discriminating_criticism_or_test',v.next_discriminating_criticism_or_test,
                'non_claims',v.non_claims,'status',w.status,'workflow_revision',w.revision,
                'workflow_event_id',w.workflow_event_id,'workflow_occurred_at',w.occurred_at,
                'workflow_rationale',w.rationale,'workflow_scope',w.workflow_scope,
                'loci',json((SELECT json_group_array(locus_kind) FROM (
                    SELECT locus_kind FROM research_topic_loci l WHERE l.topic_version_id=v.topic_version_id ORDER BY locus_order))),
                'origins',json((SELECT json_group_array(json_object(
                    'origin_id',origin_id,'kind',origin_kind,
                    'id',coalesce(problem_version_id,conjecture_version_id),
                    'relationship',relationship,'rationale',rationale,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT * FROM research_topic_origins o WHERE o.topic_version_id=v.topic_version_id ORDER BY origin_order))),
                'coordinate_framings',json((SELECT json_group_array(json_object(
                    'framing_link_id',framing_link_id,'conjecture_framing_id',conjecture_framing_id,
                    'coordinate_key',coordinate_key,'coordinate_key_version',coordinate_key_version,
                    'validation_generation',validation_generation,'model_id',model_id,
                    'material_id',material_id,'mechanism_id',mechanism_id,'interface_id',interface_id,
                    'classification',coordinate_classification,'cell_id',cell_id,
                    'relationship',relationship,'rationale',rationale,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT l.*,f.coordinate_key,f.coordinate_key_version,f.validation_generation,
                           f.model_id,f.material_id,f.mechanism_id,f.interface_id,
                           f.coordinate_classification,f.cell_id
                    FROM research_topic_framing_links l
                    JOIN conjecture_framings f ON f.framing_id=l.conjecture_framing_id
                    WHERE l.topic_version_id=v.topic_version_id ORDER BY l.framing_link_id))),
                'evidence_links',json((SELECT json_group_array(json_object(
                    'evidence_link_id',evidence_link_id,'artifact_id',artifact_id,
                    'relationship',relationship,'rationale',rationale,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT * FROM research_topic_evidence_links e WHERE e.topic_version_id=v.topic_version_id ORDER BY evidence_link_id))),
                'test_links',json((SELECT json_group_array(json_object(
                    'test_link_id',test_link_id,'criterion_id',criterion_id,
                    'relationship',relationship,'rationale',rationale,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT * FROM research_topic_test_links x WHERE x.topic_version_id=v.topic_version_id ORDER BY test_link_id))),
                'public_links',json((SELECT json_group_array(json_object(
                    'public_link_id',public_link_id,'link_kind',link_kind,
                    'public_record_id',public_record_id,'target_proposal_id',target_proposal_id,
                    'target_revision',target_revision,'content_sha256',content_sha256,
                    'relationship',relationship,'rationale',rationale,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT * FROM research_topic_public_links p WHERE p.topic_version_id=v.topic_version_id ORDER BY link_order))),
                'relations',json((SELECT json_group_array(json_object(
                    'relation_id',relation_id,'source_topic_version_id',source_topic_version_id,
                    'target_topic_version_id',target_topic_version_id,'kind',relation_kind,
                    'claim',relation_claim,'scope',relation_scope,
                    'source_admission_id',source_admission_id)) FROM (
                    SELECT * FROM research_topic_relations r
                    WHERE r.source_topic_version_id=v.topic_version_id OR r.target_topic_version_id=v.topic_version_id
                    ORDER BY relation_id))),
                'identity_source_admission_id',t.source_admission_id,
                'version_source_admission_id',v.source_admission_id,
                'workflow_source_admission_id',w.source_admission_id
             ) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,
             w.status status,v.source_admission_id
             FROM research_topics t JOIN current_research_topic_versions v USING(topic_id)
             JOIN current_research_topic_workflow w USING(topic_id)",
            Some("research_topic_id"),
        ),
        Collection::ResearchTopicVersions => (
            "SELECT v.topic_version_id key,json_object(
                'topic_version_id',v.topic_version_id,'topic_id',v.topic_id,'revision',v.revision,
                'event_kind',v.event_kind,'title',v.title,'open_problem',v.open_problem,
                'why_open',v.why_open,'scope',v.topic_scope,
                'next_discriminating_criticism_or_test',v.next_discriminating_criticism_or_test,
                'non_claims',v.non_claims,
                'loci',json((SELECT json_group_array(locus_kind) FROM (
                    SELECT locus_kind FROM research_topic_loci l WHERE l.topic_version_id=v.topic_version_id ORDER BY locus_order))),
                'origins',json((SELECT json_group_array(json_object(
                    'origin_kind',origin_kind,'problem_version_id',problem_version_id,
                    'conjecture_version_id',conjecture_version_id,'relationship',relationship,'rationale',rationale))
                    FROM (SELECT * FROM research_topic_origins o WHERE o.topic_version_id=v.topic_version_id ORDER BY origin_order))),
                'source_admission_id',v.source_admission_id
             ) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,
             v.event_kind status,v.source_admission_id FROM research_topic_versions v",
            Some("research_topic_version_id"),
        ),
        Collection::Criteria => (
            "SELECT f.criterion_id key,json_object('criterion_id',f.criterion_id,'conjecture_version_id',f.conjecture_version_id,'description',f.description,'metric',f.metric,'comparator',f.comparator,'threshold_value',f.threshold_value,'threshold_text',f.threshold_text,'units',f.units,'predeclared',json(iif(f.predeclared=1,'true','false')),'source_admission_id',f.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,NULL status,f.source_admission_id FROM falsification_criteria f",
            Some("criterion_id"),
        ),
        Collection::Parameters => (
            "SELECT p.parameter_id key,json_object('parameter_id',p.parameter_id,'name',p.name,'symbol',p.symbol,'units',p.units,'description',p.description,'source_admission_id',p.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,NULL status,p.source_admission_id FROM parameter_definitions p",
            Some("parameter_id"),
        ),
        Collection::Regions => (
            "SELECT r.region_id key,json_object('region_id',r.region_id,'cell_id',r.cell_id,'name',r.name,'current_version_id',v.region_version_id,'revision',v.revision,'region_kind',v.region_kind,'predeclared',json(iif(v.predeclared=1,'true','false')),'source_admission_id',v.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,v.region_kind status,v.source_admission_id FROM parameter_regions r JOIN siege_cells c ON c.cell_id=r.cell_id JOIN parameter_region_versions v ON v.region_id=r.region_id AND v.revision=(SELECT MAX(x.revision) FROM parameter_region_versions x WHERE x.region_id=r.region_id)",
            Some("region_id"),
        ),
        Collection::RegionVersions => (
            "SELECT v.region_version_id key,json_object('region_version_id',v.region_version_id,'region_id',v.region_id,'revision',v.revision,'event_kind',v.event_kind,'region_kind',v.region_kind,'predeclared',json(iif(v.predeclared=1,'true','false')),'source_admission_id',v.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,v.region_kind status,v.source_admission_id FROM parameter_region_versions v JOIN parameter_regions r ON r.region_id=v.region_id JOIN siege_cells c ON c.cell_id=r.cell_id",
            Some("region_version_id"),
        ),
        Collection::Protocols => (
            "SELECT p.protocol_id key,json_object('protocol_id',p.protocol_id,'name',p.name,'current_version_id',v.protocol_version_id,'revision',v.revision,'predeclared',json(iif(v.predeclared=1,'true','false')),'seed_count',v.seed_count,'source_admission_id',v.source_admission_id) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,v.event_kind status,v.source_admission_id FROM protocols p JOIN protocol_versions v ON v.protocol_id=p.protocol_id AND v.revision=(SELECT MAX(x.revision) FROM protocol_versions x WHERE x.protocol_id=p.protocol_id)",
            Some("protocol_id"),
        ),
        Collection::Runs => (
            "SELECT r.run_id key,json_object('run_id',r.run_id,'protocol_version_id',r.protocol_version_id,'cell_id',r.cell_id,'code_commit',r.code_commit,'summary',r.summary,'operational_status',a.operational_status,'epistemic_status',a.epistemic_status,'revision',a.revision,'source_admission_id',a.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,a.operational_status status,a.source_admission_id FROM runs r JOIN siege_cells c ON c.cell_id=r.cell_id JOIN current_run_assessments a ON a.run_id=r.run_id",
            Some("run_id"),
        ),
        Collection::Artifacts => (
            "SELECT a.artifact_id key,json_object('artifact_id',a.artifact_id,'run_id',a.run_id,'artifact_kind',a.artifact_kind,'artifact_uri',a.artifact_uri,'expected_sha256',a.expected_sha256,'canonical_detail',json(iif(a.canonical_detail=1,'true','false')),'detail_row_count',a.detail_row_count,'source_admission_id',a.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,NULL status,a.source_admission_id FROM evidence_artifacts a JOIN runs r ON r.run_id=a.run_id JOIN siege_cells c ON c.cell_id=r.cell_id",
            Some("artifact_id"),
        ),
        Collection::Gates => (
            "SELECT g.gate_result_id key,json_object('gate_result_id',g.gate_result_id,'run_id',g.run_id,'criterion_id',g.criterion_id,'gate_name',g.gate_name,'evidence_polarity',g.evidence_polarity,'passed',json(iif(g.passed=1,'true','false')),'metric_value',g.metric_value,'metric_text',g.metric_text,'units',g.units,'decision_scope',g.decision_scope,'limitation',g.limitation,'superseded_by',(SELECT s.replacement_gate_result_id FROM gate_result_supersessions s WHERE s.prior_gate_result_id=g.gate_result_id),'is_current',json(iif(EXISTS(SELECT 1 FROM gate_result_supersessions s WHERE s.prior_gate_result_id=g.gate_result_id),'false','true')),'source_admission_id',g.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,g.evidence_polarity status,g.source_admission_id FROM gate_results g JOIN runs r ON r.run_id=g.run_id JOIN siege_cells c ON c.cell_id=r.cell_id",
            Some("gate_result_id"),
        ),
        Collection::Comparisons => (
            "SELECT x.comparison_id key,json_object('comparison_id',x.comparison_id,'run_id',x.run_id,'baseline_run_id',x.baseline_run_id,'control_relationship',x.control_relationship,'metric',x.metric,'evidence_polarity',x.evidence_polarity,'minimum_delta',x.minimum_delta,'maximum_delta',x.maximum_delta,'mean_delta',x.mean_delta,'units',x.units,'decision_scope',x.decision_scope,'superseded_by',(SELECT s.replacement_comparison_id FROM comparison_supersessions s WHERE s.prior_comparison_id=x.comparison_id),'is_current',json(iif(EXISTS(SELECT 1 FROM comparison_supersessions s WHERE s.prior_comparison_id=x.comparison_id),'false','true')),'source_admission_id',x.source_admission_id) payload,c.model_id,c.material_id,c.mechanism_id,c.interface_id,x.evidence_polarity status,x.source_admission_id FROM comparisons x JOIN runs r ON r.run_id=x.run_id JOIN siege_cells c ON c.cell_id=r.cell_id",
            Some("comparison_id"),
        ),
        Collection::Admissions => (
            "SELECT a.admission_id key,json_object('admission_id',a.admission_id,'sequence',a.admission_sequence,'record_schema_version',a.record_schema_version,'source_path',a.source_path,'source_sha256',a.source_sha256,'entry_hash',a.entry_hash,'predecessor_entry_hash',a.predecessor_entry_hash,'admitted_at',a.admitted_at,'admitted_by',a.admitted_by,'authority_kind',a.authority_kind,'authority_ref',a.authority_ref,'description',a.description) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,NULL status,a.admission_id source_admission_id FROM admissions a",
            None,
        ),
        Collection::Provenance => (
            "SELECT p.provenance_id key,json_object('provenance_id',p.provenance_id,'provenance_kind',p.provenance_kind,'source_admission_id',p.source_admission_id,'ledger_link_id',p.ledger_link_id,'claim_text',p.claim_text) payload,NULL model_id,NULL material_id,NULL mechanism_id,NULL interface_id,p.provenance_kind status,p.source_admission_id FROM provenance_claims p",
            None,
        ),
    };
    CollectionSpec { base_sql }
}

fn history_base_sql(collection: Collection) -> Option<String> {
    let single = |table: &str,
                  parent: &str,
                  event_id: &str,
                  time: &str,
                  status: &str,
                  rationale: &str,
                  scope: &str,
                  family: &str| {
        format!(
            "SELECT printf('%010d:{family}:%s',revision,{event_id}) key,{parent} parent_id,
             json_object('history_family','{family}','event_id',{event_id},'revision',revision,
                'event_kind',event_kind,'occurred_at',{time},'status',{status},
                'rationale',{rationale},'scope',{scope},'source_admission_id',source_admission_id) payload
             FROM {table}"
        )
    };
    Some(match collection {
        Collection::Models => single("theoretical_model_assessments", "model_id", "assessment_id",
            "assessed_at", "epistemic_status", "rationale", "assessment_scope", "assessment"),
        Collection::Materials => single("material_assessments", "material_id", "assessment_id",
            "assessed_at", "epistemic_status", "rationale", "assessment_scope", "assessment"),
        Collection::Mechanisms => single("mechanism_assessments", "mechanism_id", "assessment_id",
            "assessed_at", "epistemic_status", "rationale", "assessment_scope", "assessment"),
        Collection::Interfaces => single("interface_assessments", "interface_id", "assessment_id",
            "assessed_at", "epistemic_status", "rationale", "assessment_scope", "assessment"),
        Collection::Morphisms => single("morphism_assessments", "morphism_id", "assessment_id",
            "assessed_at", "validation_status", "rationale", "assessment_scope", "assessment"),
        Collection::Cells => format!("{} UNION ALL {}",
            single("siege_cell_assessments", "cell_id", "assessment_id", "assessed_at",
                "epistemic_status", "rationale", "assessment_scope", "assessment"),
            single("siege_cell_decisions", "cell_id", "decision_id", "decided_at",
                "status", "rationale", "decision_scope", "decision")),
        Collection::Problems =>
            "SELECT printf('%010d:version:%s',revision,problem_version_id) key,problem_id parent_id,
                json_object('history_family','version','event_id',problem_version_id,'revision',revision,
                    'event_kind',event_kind,'occurred_at',formulated_at,'problem_statement',problem_statement,
                    'rationale',rationale,'scope',problem_scope,'source_admission_id',source_admission_id) payload
             FROM problem_versions".to_owned(),
        Collection::Conjectures => format!(
            "SELECT printf('%010d:version:%s',revision,conjecture_version_id) key,conjecture_id parent_id,
                json_object('history_family','version','event_id',conjecture_version_id,'revision',revision,
                    'event_kind',event_kind,'occurred_at',formulated_at,'statement',statement,
                    'rationale',rationale,'scope',formulation_scope,'source_admission_id',source_admission_id) payload
             FROM conjecture_versions UNION ALL {}",
            single("conjecture_dispositions", "conjecture_id", "disposition_id", "decided_at",
                "status", "rationale", "decision_scope", "disposition")),
        Collection::ResearchTopics => format!(
            "SELECT printf('%010d:version:%s',revision,topic_version_id) key,topic_id parent_id,
                json_object('history_family','version','event_id',topic_version_id,'revision',revision,
                    'event_kind',event_kind,'occurred_at',formulated_at,'title',title,
                    'open_problem',open_problem,'why_open',why_open,'scope',topic_scope,
                    'next_discriminating_criticism_or_test',next_discriminating_criticism_or_test,
                    'non_claims',non_claims,'source_admission_id',source_admission_id) payload
             FROM research_topic_versions UNION ALL {}",
            single("research_topic_workflow_events", "topic_id", "workflow_event_id", "occurred_at",
                "status", "rationale", "workflow_scope", "administrative-workflow")),
        Collection::Regions =>
            "SELECT printf('%010d:version:%s',revision,region_version_id) key,region_id parent_id,
                json_object('history_family','version','event_id',region_version_id,'revision',revision,
                    'event_kind',event_kind,'occurred_at',defined_at,'status',region_kind,
                    'predeclared',json(iif(predeclared=1,'true','false')),'rationale',rationale,
                    'scope',decision_scope,'source_admission_id',source_admission_id) payload
             FROM parameter_region_versions".to_owned(),
        Collection::Protocols =>
            "SELECT printf('%010d:version:%s',revision,protocol_version_id) key,protocol_id parent_id,
                json_object('history_family','version','event_id',protocol_version_id,'revision',revision,
                    'event_kind',event_kind,'occurred_at',defined_at,'predeclared',json(iif(predeclared=1,'true','false')),
                    'seed_count',seed_count,'null_trials',null_trials,'null_quantile',null_quantile,
                    'rationale',rationale,'scope',decision_scope,'source_admission_id',source_admission_id) payload
             FROM protocol_versions UNION ALL
             SELECT printf('%010d:provenance:%010d:%s',v.revision,a.revision,a.assessment_id) key,v.protocol_id parent_id,
                json_object('history_family','provenance-assessment','event_id',a.assessment_id,
                    'protocol_version_id',a.protocol_version_id,'revision',a.revision,'event_kind',a.event_kind,
                    'occurred_at',a.assessed_at,'status',a.completeness_status,'config_uri',a.config_uri,
                    'config_sha256',a.config_sha256,'rationale',a.rationale,'scope',a.assessment_scope,
                    'source_admission_id',a.source_admission_id) payload
             FROM protocol_provenance_assessments a JOIN protocol_versions v USING(protocol_version_id)".to_owned(),
        Collection::Runs => single("run_assessments", "run_id", "assessment_id", "assessed_at",
            "operational_status", "rationale", "assessment_scope", "assessment"),
        Collection::Gates | Collection::Comparisons => unreachable!(),
        _ => return None,
    })
}

fn supersession_history_sql(
    _connection: &Connection,
    collection: Collection,
    _id: &str,
) -> Result<String> {
    let (results, result_id, supersessions, prior, replacement, extra) = match collection {
        Collection::Gates => (
            "gate_results",
            "gate_result_id",
            "gate_result_supersessions",
            "prior_gate_result_id",
            "replacement_gate_result_id",
            "'gate_name',r.gate_name,'evidence_polarity',r.evidence_polarity,'passed',json(iif(r.passed=1,'true','false'))",
        ),
        Collection::Comparisons => (
            "comparisons",
            "comparison_id",
            "comparison_supersessions",
            "prior_comparison_id",
            "replacement_comparison_id",
            "'metric',r.metric,'control_relationship',r.control_relationship,'evidence_polarity',r.evidence_polarity",
        ),
        _ => bail!("collection has no typed supersession history"),
    };
    Ok(format!(
        "WITH RECURSIVE up(id) AS (
            SELECT ?1 UNION SELECT s.{prior} FROM {supersessions} s JOIN up ON s.{replacement}=up.id
         ), root(id) AS (
            SELECT id FROM up WHERE NOT EXISTS(SELECT 1 FROM {supersessions} s WHERE s.{replacement}=up.id) LIMIT 1
         ), chain(id,revision,visited) AS (
            SELECT id,1,char(31)||id||char(31) FROM root
            UNION ALL
            SELECT s.{replacement},chain.revision+1,chain.visited||s.{replacement}||char(31)
            FROM chain JOIN {supersessions} s ON s.{prior}=chain.id
            WHERE instr(chain.visited,char(31)||s.{replacement}||char(31))=0
         )
         SELECT printf('%010d:result:%s',chain.revision,r.{result_id}) key,
            json_object('history_family','result','event_id',r.{result_id},'revision',chain.revision,
                {extra},'superseded_by',(SELECT s.{replacement} FROM {supersessions} s WHERE s.{prior}=r.{result_id}),
                'source_admission_id',r.source_admission_id) payload
         FROM chain JOIN {results} r ON r.{result_id}=chain.id
         WHERE printf('%010d:result:%s',chain.revision,r.{result_id})>?2
         ORDER BY key LIMIT ?3"
    ))
}

fn open(path: &Path) -> Result<Connection> {
    Ok(Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?)
}
fn validate_limit(limit: usize) -> Result<()> {
    if !(1..=100).contains(&limit) {
        bail!("limit must be between 1 and 100")
    }
    Ok(())
}
fn push_filter(sql: &mut String, values: &mut Vec<SqlValue>, column: &str, value: &Option<String>) {
    if let Some(value) = value {
        sql.push_str(&format!(" AND {column}=?"));
        values.push(SqlValue::Text(value.clone()));
    }
}
fn push_in_filter(sql: &mut String, values: &mut Vec<SqlValue>, column: &str, filter: &[String]) {
    if filter.is_empty() {
        return;
    }
    sql.push_str(&format!(
        " AND {column} IN ({})",
        vec!["?"; filter.len()].join(",")
    ));
    values.extend(filter.iter().cloned().map(SqlValue::Text));
}
fn filter_digest<T: Serialize>(scope: &str, filters: &T) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(format!("{scope}\n{}", serde_json::to_string(filters)?).as_bytes())
    ))
}
fn encode_cursor(scope: &str, digest: &str, key: &str) -> String {
    hex(format!("{scope}\n{digest}\n{key}").as_bytes())
}
fn decode_cursor(cursor: Option<&str>, scope: &str, digest: &str) -> Result<String> {
    let Some(cursor) = cursor else {
        return Ok(String::new());
    };
    let decoded = String::from_utf8(unhex(cursor)?)?;
    let mut parts = decoded.splitn(3, '\n');
    if parts.next() != Some(scope) || parts.next() != Some(digest) {
        bail!("cursor does not match collection/filter set")
    }
    Ok(parts.next().unwrap_or_default().to_owned())
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}
fn unhex(value: &str) -> Result<Vec<u8>> {
    if !value.len().is_multiple_of(2) || !value.chars().all(|c| c.is_ascii_hexdigit()) {
        bail!("invalid cursor encoding")
    }
    (0..value.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&value[i..i + 2], 16).map_err(Into::into))
        .collect()
}
