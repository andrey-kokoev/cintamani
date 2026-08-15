// Project the epistemic-ledger domain records (experiments, equipment types) into a
// public read-only JSON for cintamani-site, mirroring marici's project-public-epistemic-graph.mjs.
// Input:  epistemic_graph_export snapshot (.ai/tmp/epistemic-graph-snapshot.json)
// Output: packages/cintamani-site/src/data/ledger-domain.json
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function argument(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : fallback
}

const inputPath = resolve(argument('--input', '.ai/tmp/epistemic-graph-snapshot.json'))
const outputPath = resolve(
  argument('--output', 'packages/cintamani-site/src/data/ledger-domain.json'),
)

const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const snapshot = input.structuredContent ?? input
if (snapshot.schema !== 'narada.epistemic.graph_snapshot.v1') {
  throw new Error(`Expected narada.epistemic.graph_snapshot.v1, received ${snapshot.schema ?? 'unknown'}`)
}

const DOMAIN_KINDS = new Set(['cintamani:experiment', 'cintamani:equipment_type'])
const DOMAIN_RELATIONS = new Set(['cintamani:requires_equipment'])

const entities = (snapshot.entities ?? [])
  .filter((entity) => DOMAIN_KINDS.has(entity.kind))
  .map((entity) => ({
    entity_id: String(entity.entity_id),
    kind: String(entity.kind),
    title: String(entity.payload?.title ?? entity.entity_id),
    version: entity.payload?.version ? String(entity.payload.version) : undefined,
    domain: entity.payload?.payload ?? {},
    event_id: entity.event_id,
  }))

const knownIds = new Set(entities.map((entity) => entity.entity_id))
const relations = (snapshot.relations ?? [])
  .filter(
    (relation) =>
      DOMAIN_RELATIONS.has(relation.relation_type) &&
      knownIds.has(relation.source_id) &&
      knownIds.has(relation.target_id),
  )
  .map((relation) => ({
    relation_id: String(relation.relation_id),
    relation_type: String(relation.relation_type),
    source_id: String(relation.source_id),
    target_id: String(relation.target_id),
    detail: relation.payload
      ? Object.fromEntries(
          Object.entries(relation.payload).filter(
            ([key]) => !['op', 'relation_id', 'relation_type', 'source_id', 'target_id'].includes(key),
          ),
        )
      : {},
  }))

entities.sort((a, b) => a.kind.localeCompare(b.kind) || a.entity_id.localeCompare(b.entity_id))

const output = {
  schema: 'cintamani.public-ledger-domain.v1',
  ledger_head: String(snapshot.ledger_head),
  entity_count: entities.length,
  relation_count: relations.length,
  entities,
  relations,
}

writeFileSync(outputPath, JSON.stringify(output, null, 1) + '\n', 'utf8')
console.log(`Projected ${entities.length} domain entities and ${relations.length} relations at ${output.ledger_head}`)
