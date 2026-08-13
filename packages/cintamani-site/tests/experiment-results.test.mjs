import assert from 'node:assert/strict'
import test from 'node:test'
import {
  experimentResultCatalog,
  researchMemoryCatalog,
  resultForId,
  validateExperimentResultCatalog,
  validateResearchMemoryCatalog,
} from '../src/lib/experiment-results.mjs'

test('experimental result and research-memory catalogs preserve the review boundary', () => {
  assert.equal(validateExperimentResultCatalog(), true)
  assert.equal(validateResearchMemoryCatalog(), true)
  assert.equal(experimentResultCatalog.items.length, 1)
  assert.equal(researchMemoryCatalog.items.length, 1)
  const result = resultForId('task-11-exact-generic-20260812')
  assert.ok(result)
  assert.equal(result.status, 'experimental-unreviewed')
  assert.equal(result.review_status, 'unreviewed')
  assert.equal(result.hvm.status, 'not-installed')
  assert.equal(result.method.expression, 'A_n(z) = sum_T product_{e in T} 1/(X_e + z w_e)')
  assert.deepEqual(result.catalan_counts.map((item) => item.observed), [2, 5, 14, 42, 132, 429])
  assert.deepEqual(result.cases.map((item) => item.triangulation_count), [2, 5, 14, 42, 132])
  assert.ok(result.cases.every((item) => item.reducer.oracle_matches_reducer && item.exact_coefficients.length > 0))
  assert.ok(result.cases.every((item) => item.finite_z_cross_check.values.every((check) => check.passed)))
  const n8 = result.cases.find((item) => item.n === 8)
  assert.equal(n8.triangulation_count, 132)
  assert.equal(n8.assignment_digest, 'fnv1a64:12f72e9deea80f1c')
  assert.equal(n8.assignments.length, 20)
  assert.ok(n8.assignments.every((assignment) => Number.isInteger(assignment.X) && Number.isInteger(assignment.w)))
  assert.ok(n8.exact_coefficients.every((item) => item.coefficient.text.includes('/')))
  assert.equal(n8.first_surviving_order, 0)
  assert.equal(n8.cancellation.cancellation_order, 0)
  assert.equal(n8.oracle.digest, n8.reducer.digest)
  assert.match(result.convention.weight_definition, /declared channel weights rather than g-vectors/)
  assert.match(result.convention.source_boundary, /Published n=5\/6\/7 geometry is not reproduced/)
  assert.ok(result.nonclaims.some((claim) => claim.includes('q generating-function surrogate')))
  assert.match(result.hvm.comparison_status, /no external HVM\/Bend result is claimed/)
  assert.deepEqual(result.validation_fixtures.map((item) => item.n), [5, 6, 7])
  assert.ok(result.validation_fixtures.every((item) => item.status === 'unavailable-underspecified'))
  assert.ok(result.sample_runs.some((run) => run.sample.kind === 'special-cancellation-control' && run.cancellation_observed))
})

test('research memory links the run to the existing Rust/HVM fixture', () => {
  const memory = researchMemoryCatalog.items[0]
  const result = resultForId(memory.result_id)
  assert.equal(memory.status, 'experimental-unreviewed')
  assert.ok(memory.links.some((link) => link.href === `/experiment-results/${memory.result_id}/`))
  assert.ok(memory.links.some((link) => link.href === '/experiments/rust-exact-oracle-hvm-amplitudes-infinity/'))
  assert.equal(result.linked_fixture.experiment_id, memory.experiment_id)
})
