// Verifies the ledger projection of domain records is lossless against the fixtures:
// every fixture experiment/equipment item must appear in the projection with identical content.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const read = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))

const projection = read('packages/cintamani-site/src/data/ledger-domain.json')
const experiments = read('packages/cintamani-site/src/data/experiment-fixtures.json')
const equipment = read('packages/cintamani-site/src/data/equipment-fixtures.json')

assert.equal(projection.schema, 'cintamani.public-ledger-domain.v1')
const byId = new Map(projection.entities.map((entity) => [entity.entity_id, entity]))

for (const item of equipment.items) {
  const { equipment_type_id, revision, ...payload } = item
  const entity = byId.get(`equip:${equipment_type_id}`)
  assert.ok(entity, `missing equipment type ${equipment_type_id}`)
  assert.equal(entity.kind, 'cintamani:equipment_type')
  assert.equal(entity.version, String(revision ?? 1))
  assert.deepEqual(entity.domain, payload, `equipment payload drift for ${equipment_type_id}`)
}

for (const item of experiments.items) {
  const { experiment_id, revision, equipment_requirements, ...payload } = item
  const entity = byId.get(`exp:${experiment_id}`)
  assert.ok(entity, `missing experiment ${experiment_id}`)
  assert.equal(entity.kind, 'cintamani:experiment')
  assert.equal(entity.version, String(revision ?? 1))
  assert.deepEqual(entity.domain, { ...payload, equipment_requirements }, `experiment payload drift for ${experiment_id}`)

  for (const req of equipment_requirements ?? []) {
    for (const typeId of req.equipment_type_ids ?? []) {
      const relation = projection.relations.find(
        (candidate) =>
          candidate.relation_type === 'cintamani:requires_equipment' &&
          candidate.source_id === `exp:${experiment_id}` &&
          candidate.target_id === `equip:${typeId}` &&
          candidate.detail?.requirement_id === req.requirement_id,
      )
      assert.ok(relation, `missing requires_equipment relation ${experiment_id} -> ${typeId} (${req.requirement_id})`)
      assert.equal(relation.detail.capability, req.capability)
    }
  }
}

console.log(
  `ledger-domain roundtrip ok: ${equipment.items.length} equipment types, ${experiments.items.length} experiments, ${projection.relations.length} relations`,
)
