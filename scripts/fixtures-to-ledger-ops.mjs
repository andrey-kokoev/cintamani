// Generate epistemic-ledger admission ops from cintamani-site experiment/equipment fixtures.
// Usage: node scripts/fixtures-to-ledger-ops.mjs  (from repo root) -> .ai/tmp/eg-admit-domain.json
import { readFileSync, writeFileSync } from 'node:fs'

const experiments = JSON.parse(readFileSync('packages/cintamani-site/src/data/experiment-fixtures.json', 'utf8'))
const equipment = JSON.parse(readFileSync('packages/cintamani-site/src/data/equipment-fixtures.json', 'utf8'))

const ops = []
const expRef = (id) => `exp:${id}`
const equipRef = (id) => `equip:${id}`

for (const item of equipment.items) {
  const { equipment_type_id, revision, ...payload } = item
  ops.push({
    op: 'entity.declare',
    entity_id: equipRef(equipment_type_id),
    local_ref: equipRef(equipment_type_id),
    kind: 'cintamani:equipment_type',
    title: payload.title ?? equipment_type_id,
    version: String(revision ?? 1),
    payload,
  })
}

for (const item of experiments.items) {
  const { experiment_id, revision, equipment_requirements, ...payload } = item
  ops.push({
    op: 'entity.declare',
    entity_id: expRef(experiment_id),
    local_ref: expRef(experiment_id),
    kind: 'cintamani:experiment',
    title: payload.title ?? experiment_id,
    version: String(revision ?? 1),
    payload: { ...payload, equipment_requirements },
  })
  for (const req of equipment_requirements ?? []) {
    for (const typeId of req.equipment_type_ids ?? []) {
      ops.push({
        op: 'relation.declare',
        relation_id: `rel:cintamani:requires_equipment-${experiment_id}-${req.requirement_id}`,
        relation_type: 'cintamani:requires_equipment',
        source_id: expRef(experiment_id),
        target_id: equipRef(typeId),
        requirement_id: req.requirement_id,
        group_kind: req.group_kind,
        selection_rule: req.selection_rule,
        capability: req.capability,
      })
    }
  }
}

const call = [{
  tool: 'epistemic_graph_submit_review_admit',
  arguments: {
    actor: 'kimi-code-agent',
    authority_basis: {
      kind: 'operator_request',
      summary: 'Migrate cintamani-site proposal-layer experiment/equipment fixtures into the epistemic ledger as namespaced extension kinds (domain-in-ledger vertical slice). Fixtures remain illustrative-unadmitted scientifically; this records their structure only.',
    },
    idempotency_key: 'cintamani-domain-fixtures-to-ledger-v1',
    expected_ledger_head: '0e5e7ec26c5327cba7cc7f5df72143a3c848e1a5d6ebc3b4b58eb9a049f25001',
    operations: ops,
  },
}]

writeFileSync('.ai/tmp/eg-admit-domain.json', JSON.stringify(call))
console.log(`wrote ${ops.length} ops (${equipment.items.length} equipment types, ${experiments.items.length} experiments, ${ops.length - equipment.items.length - experiments.items.length} relations)`)
