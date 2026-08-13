import resultCatalog from '../data/experiment-results.json' with { type: 'json' }
import memoryCatalog from '../data/research-memory.json' with { type: 'json' }

export const experimentResultCatalog = Object.freeze(resultCatalog)
export const researchMemoryCatalog = Object.freeze(memoryCatalog)

const requiredResultFields = [
  'result_id',
  'title',
  'status',
  'review_status',
  'experiment_id',
  'run_id',
  'run_scope',
  'inputs',
  'method',
  'convention',
  'catalan_counts',
  'cases',
  'sample_runs',
  'validation_fixtures',
  'hvm',
  'artifacts',
  'linked_fixture',
  'nonclaims',
]

export function validateExperimentResultCatalog() {
  if (resultCatalog.collection !== 'experiment-results') throw new Error('unexpected experiment result collection')
  if (resultCatalog.items.length < 1) throw new Error('experiment result catalog is empty')
  const resultIds = new Set()
  for (const result of resultCatalog.items) {
    for (const field of requiredResultFields) {
      if (!(field in result)) throw new Error(`experiment result ${result.result_id ?? '<unknown>'} is missing ${field}`)
    }
    if (resultIds.has(result.result_id)) throw new Error(`duplicate experiment result ${result.result_id}`)
    resultIds.add(result.result_id)
    if (result.status !== 'experimental-unreviewed' || result.review_status !== 'unreviewed') {
      throw new Error(`result ${result.result_id} crossed the review boundary`)
    }
    if (result.cases.length < 1 || result.artifacts.length < 1 || result.nonclaims.length < 1) {
      throw new Error(`result ${result.result_id} lacks bounded evidence or nonclaim coverage`)
    }
    if (result.method.expression !== 'A_n(z) = sum_T product_{e in T} 1/(X_e + z w_e)') {
      throw new Error(`result ${result.result_id} does not expose the exact rational expression`)
    }
    if (result.cases.some((item) => !item.reducer.oracle_matches_reducer || !item.exact_coefficients?.length)) {
      throw new Error(`result ${result.result_id} contains an exact reducer mismatch or empty coefficient window`)
    }
    if (result.cases.some((item) => !item.finite_z_cross_check?.values?.length || item.finite_z_cross_check.values.some((check) => !check.passed))) {
      throw new Error(`result ${result.result_id} contains a failed finite-z tail-bounded cross-check`)
    }
    if (!result.catalan_counts.every((item) => item.verified)) {
      throw new Error(`result ${result.result_id} contains an unverified Catalan count`)
    }
    if (!result.validation_fixtures.every((item) => item.status === 'unavailable-underspecified')) {
      throw new Error(`result ${result.result_id} fabricated or admitted a missing validation fixture`)
    }
    if (result.linked_fixture.experiment_id !== result.experiment_id) {
      throw new Error(`result ${result.result_id} is not linked to its experiment fixture`)
    }
    if (result.hvm.status !== 'not-installed') throw new Error(`unexpected HVM status for ${result.result_id}`)
    if (!result.sample_runs.some((run) => run.sample?.kind === 'special-cancellation-control' && run.cancellation_observed)) {
      throw new Error(`result ${result.result_id} lacks an honestly labelled special cancellation control`)
    }
  }
  return true
}

export function resultForId(resultId) {
  return experimentResultCatalog.items.find((result) => result.result_id === resultId)
}

export function resultsForExperiment(experimentId) {
  return experimentResultCatalog.items.filter((result) => result.experiment_id === experimentId)
}

export function validateResearchMemoryCatalog() {
  if (memoryCatalog.collection !== 'research-memory') throw new Error('unexpected research memory collection')
  const resultIds = new Set(experimentResultCatalog.items.map((result) => result.result_id))
  for (const item of memoryCatalog.items) {
    if (item.status !== 'experimental-unreviewed' || item.review_status !== 'unreviewed') {
      throw new Error(`research memory item ${item.memory_id} crossed the review boundary`)
    }
    if (!resultIds.has(item.result_id)) throw new Error(`research memory item ${item.memory_id} points to an unknown result`)
  }
  return true
}
