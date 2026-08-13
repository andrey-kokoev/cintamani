import experimentCatalog from '../data/experiment-fixtures.json' with { type: 'json' }
import equipmentCatalog from '../data/equipment-fixtures.json' with { type: 'json' }
import topicFixture from '../data/research-topic-fixture.json' with { type: 'json' }

export const illustrativeExperimentCatalog = Object.freeze(experimentCatalog)
export const illustrativeEquipmentCatalog = Object.freeze(equipmentCatalog)
export const volumetricOriginStory = Object.freeze(experimentCatalog.origin_story)

const requiredExperimentKinds = new Set(['physical', 'simulation', 'analytical', 'hybrid'])
const requiredExperimentIntents = new Set(['falsification', 'discrimination', 'characterization', 'calibration', 'replication'])

const requiredExperimentFields = [
  'experiment_id',
  'revision',
  'title',
  'experiment_kind',
  'intent',
  'status',
  'targets',
  'protocols',
  'controls',
  'observables',
  'calibration',
  'repetitions',
  'uncertainty',
  'success_criteria',
  'falsifiers',
  'confounds',
  'raw_artifacts',
  'nonclaims',
  'equipment_requirements',
  'topic_links',
  'provenance',
]

const forbiddenFixtureKeys = new Set(['rank', 'confidence', 'epistemic_status', 'result', 'run_id', 'admission_id'])
const knownTopicVersions = new Set([
  ...topicFixture.items.map((item) => `${item.topic_id}@1`),
  `${experimentCatalog.origin_story.story_id}@1`,
])

export function validateIllustrativeCatalog() {
  const ids = new Set()
  const observedKinds = new Set()
  const observedIntents = new Set()
  for (const item of experimentCatalog.items) {
    for (const field of requiredExperimentFields) {
      if (!(field in item)) throw new Error(`illustrative experiment ${item.experiment_id ?? '<unknown>'} is missing ${field}`)
    }
    if (ids.has(item.experiment_id)) throw new Error(`duplicate illustrative experiment ${item.experiment_id}`)
    ids.add(item.experiment_id)
    for (const key of Object.keys(item)) {
      if (forbiddenFixtureKeys.has(key)) throw new Error(`illustrative experiment ${item.experiment_id} exposes forbidden field ${key}`)
    }
    if (item.status !== 'illustrative-unadmitted' || item.canonical_admission || item.public_d1_seed || item.evidence_claim) {
      throw new Error(`illustrative experiment ${item.experiment_id} crossed the admission boundary`)
    }
    if (!requiredExperimentKinds.has(item.experiment_kind) || !requiredExperimentIntents.has(item.intent)) {
      throw new Error(`illustrative experiment ${item.experiment_id} uses an unsupported kind or intent`)
    }
    observedKinds.add(item.experiment_kind)
    observedIntents.add(item.intent)
    if (item.targets.length < 1 || item.protocols.length < 1 || item.observables.length < 1) {
      throw new Error(`illustrative experiment ${item.experiment_id} lacks a decisive target/protocol/observable`)
    }
    if (item.success_criteria.length < 1 || item.falsifiers.length < 1 || item.nonclaims.length < 1 || item.equipment_requirements.length < 1) {
      throw new Error(`illustrative experiment ${item.experiment_id} lacks falsifier/nonclaim/equipment coverage`)
    }
    if (!item.topic_links?.length) throw new Error(`illustrative experiment ${item.experiment_id} is not linked to a research topic`)
    if (!Array.isArray(item.provenance?.citations) || item.provenance.citations.length < 1) {
      throw new Error(`illustrative experiment ${item.experiment_id} lacks an available citation record`)
    }
    for (const link of item.topic_links) {
      if (!knownTopicVersions.has(link.topic_version_id)) {
        throw new Error(`illustrative experiment ${item.experiment_id} links to unknown topic version ${link.topic_version_id}`)
      }
    }
    const criterionIds = new Set()
    for (const criterion of [...item.success_criteria, ...item.falsifiers]) {
      if (criterionIds.has(criterion.criterion_id)) throw new Error(`illustrative experiment ${item.experiment_id} repeats criterion ${criterion.criterion_id}`)
      criterionIds.add(criterion.criterion_id)
    }
    const groups = new Map()
    for (const observable of item.observables) {
      if (!observable.units) throw new Error(`illustrative experiment ${item.experiment_id} has an ununitized observable`)
    }
    for (const requirement of item.equipment_requirements) {
      if (!requirement.group_id || !requirement.group_kind || !requirement.selection_rule || !requirement.quantity) {
        throw new Error(`illustrative experiment ${item.experiment_id} has an incomplete equipment group`)
      }
      if (requirement.selection_rule === 'any-one' && requirement.quantity !== 1) {
        throw new Error(`illustrative experiment ${item.experiment_id} has an invalid any-one quantity`)
      }
      const group = groups.get(requirement.group_id) ?? { kind: requirement.group_kind, selection: requirement.selection_rule, quantity: requirement.quantity, count: 0 }
      if (group.kind !== requirement.group_kind || group.selection !== requirement.selection_rule || group.quantity !== requirement.quantity) {
        throw new Error(`illustrative experiment ${item.experiment_id} has inconsistent equipment group semantics`)
      }
      group.count += 1
      groups.set(requirement.group_id, group)
    }
    for (const [groupId, group] of groups) {
      if (group.kind === 'alternative' && group.count < 2) throw new Error(`alternative group ${groupId} needs at least two options`)
      if (group.selection === 'at-least-n' && group.count < group.quantity) throw new Error(`at-least-n group ${groupId} has too few options`)
    }
  }
  if (![...requiredExperimentKinds].every((kind) => observedKinds.has(kind))) {
    throw new Error('illustrative experiment catalog must exercise all four experiment kinds')
  }
  if (![...requiredExperimentIntents].every((intent) => observedIntents.has(intent))) {
    throw new Error('illustrative experiment catalog must exercise all five experiment intents')
  }
  const equipmentIds = new Set(equipmentCatalog.items.map((item) => item.equipment_type_id))
  const equipmentTypeIds = new Set()
  for (const item of equipmentCatalog.items) {
    for (const field of ['equipment_type_id', 'revision', 'title', 'description', 'capabilities', 'operating_limits', 'calibrations', 'safety_requirements', 'interface_requirements', 'nonclaims', 'citations']) {
      if (!(field in item)) throw new Error(`illustrative equipment ${item.equipment_type_id ?? '<unknown>'} is missing ${field}`)
    }
    if (equipmentTypeIds.has(item.equipment_type_id)) throw new Error(`duplicate illustrative equipment ${item.equipment_type_id}`)
    equipmentTypeIds.add(item.equipment_type_id)
    if (item.revision < 1 || item.capabilities.length < 1 || item.safety_requirements.length < 1 || item.nonclaims.length < 1) {
      throw new Error(`illustrative equipment ${item.equipment_type_id} lacks required capability/safety/nonclaim coverage`)
    }
    if (item.citations.length < 1) throw new Error(`illustrative equipment ${item.equipment_type_id} lacks an available citation record`)
  }
  for (const experiment of experimentCatalog.items) {
    for (const requirement of experiment.equipment_requirements) {
      for (const equipmentId of requirement.equipment_type_ids ?? []) {
        if (!equipmentIds.has(equipmentId)) throw new Error(`unknown fixture equipment type ${equipmentId}`)
      }
    }
  }
  return true
}

export function experimentForTopic(topicId) {
  return experimentCatalog.items.filter((item) =>
    item.topic_links.some((link) => link.topic_version_id === topicId || link.topic_version_id === `${topicId}@1`),
  )
}

export function equipmentForExperiment(experiment) {
  const ids = new Set(experiment.equipment_requirements.flatMap((requirement) => requirement.equipment_type_ids ?? []))
  return equipmentCatalog.items.filter((item) => ids.has(item.equipment_type_id))
}

export function humanExperimentSearchText(experiment) {
  return [
    experiment.experiment_id,
    experiment.title,
    experiment.experiment_kind,
    experiment.intent,
    ...experiment.targets.map((target) => target.target_label),
    ...experiment.observables.map((observable) => `${observable.name} ${observable.units}`),
    ...experiment.equipment_requirements.map((requirement) => requirement.capability),
  ].join(' ')
}
