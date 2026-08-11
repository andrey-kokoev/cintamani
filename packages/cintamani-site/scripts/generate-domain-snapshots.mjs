import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const scriptPath = fileURLToPath(import.meta.url)
const siteRoot = resolve(dirname(scriptPath), '..')
const workspaceRoot = resolve(siteRoot, '../..')
const domainManifest = resolve(workspaceRoot, 'packages/cintamani-domain/Cargo.toml')
const dataRoot = resolve(siteRoot, 'src/data')
const MAX_FRONTIER_PAGES = 1_000
const MAX_FRONTIER_ROWS = 100_000

const snapshotPaths = {
  dimensions: resolve(dataRoot, 'dimensions.json'),
  frontier: resolve(dataRoot, 'frontier.json'),
  summary: resolve(dataRoot, 'registry-summary.json'),
}

function fail(message) {
  throw new Error(message)
}

function runDomain(command, args = []) {
  const result = spawnSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--manifest-path',
      domainManifest,
      '--',
      '--workspace-root',
      workspaceRoot,
      '--format',
      'json',
      command,
      ...args,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    const detail = [result.stdout, result.stderr]
      .filter((part) => part && part.trim().length > 0)
      .join('\n')
      .trim()
    const reason = result.error?.message ?? `exit ${result.status}`
    fail(`domain ${command} failed closed (${reason})${detail ? `:\n${detail}` : ''}`)
  }

  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    fail(`domain ${command} returned non-JSON output: ${error.message}`)
  }
}

function assertCleanCheck(report) {
  const zeroFields = [
    'foreign_key_violations',
    'migration_violations',
    'history_violations',
    'path_violations',
    'provenance_violations',
    'ledger_source_mismatches',
    'protocol_config_mismatches',
    'mismatched_artifacts',
    'artifact_observation_drift',
  ]
  if (
    report.schema_version !== '2' ||
    report.projection_kind !== 'rebuildable-site-domain-registry' ||
    report.integrity !== 'ok' ||
    report.admission_chain_consistent !== true
  ) {
    fail('registry identity, integrity, or admission-chain check is not clean')
  }
  for (const field of zeroFields) {
    if (report[field] !== 0) fail(`registry check is not clean: ${field}=${report[field]}`)
  }
}

function assertDimensions(value) {
  const expected = [
    [1, 'theoretical-model', 'original-three-dimensional-axis'],
    [2, 'physical-material', 'original-three-dimensional-axis'],
    [3, 'physical-calculation-mechanism', 'original-three-dimensional-axis'],
    [4, 'observation-interface', 'later-added-fourth-dimension'],
  ]
  if (value.collection !== 'dimensions' || !Array.isArray(value.items) || value.items.length !== 4) {
    fail('dimensions query did not return the fixed four-axis contract')
  }
  value.items.forEach((axis, index) => {
    const [order, key, role] = expected[index]
    if (
      axis.dimension_order !== order ||
      axis.dimension_key !== key ||
      axis.dimension_role !== role ||
      axis.member_count !== axis.members?.length
    ) {
      fail(`dimension ${index + 1} violates the ordered axis contract`)
    }
  })
}

function frontierKey(item) {
  return [item.model_id, item.material_id, item.mechanism_id, item.interface_id].join('\u001f')
}

export function readFrontier(
  run = runDomain,
  { maxPages = MAX_FRONTIER_PAGES, maxRows = MAX_FRONTIER_ROWS } = {},
) {
  const items = []
  const seenKeys = new Set()
  const seenCursors = new Set()
  let cursor = null

  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const args = ['--limit', '100']
    if (cursor) args.push('--cursor', cursor)
    const page = run('frontier', args)
    if (page.collection !== 'frontier' || !Array.isArray(page.items)) {
      fail(`frontier page ${pageNumber} has an invalid shape`)
    }
    for (const item of page.items) {
      const key = frontierKey(item)
      if (seenKeys.has(key)) fail(`frontier pagination repeated coordinate ${key}`)
      seenKeys.add(key)
      items.push(item)
      if (items.length > maxRows) {
        fail(`frontier snapshot exceeded the ${maxRows}-row safety bound`)
      }
    }

    const next = page.next_cursor ?? null
    if (!next) return items
    if (page.items.length === 0) fail('frontier returned a cursor without rows')
    if (seenCursors.has(next)) fail('frontier pagination repeated a cursor')
    seenCursors.add(next)
    cursor = next
  }

  fail(`frontier pagination exceeded the ${maxPages}-page safety bound`)
}

function stableSummary(report) {
  const counts = report.relation_counts ?? {}
  return {
    snapshot_schema: 'cintamani.site-registry-summary.v1',
    snapshot_mode: 'build-time-static',
    registry_authority: 'Rust/SQLite Cintamani domain registry',
    mutable_edge_registry: false,
    schema_version: report.schema_version,
    projection_kind: report.projection_kind,
    chain_generation: report.chain_generation,
    check_status: 'passed',
    integrity: report.integrity,
    admission_chain_consistent: report.admission_chain_consistent,
    invariant_counts: {
      foreign_key_violations: report.foreign_key_violations,
      migration_violations: report.migration_violations,
      history_violations: report.history_violations,
      path_violations: report.path_violations,
      provenance_violations: report.provenance_violations,
      ledger_source_mismatches: report.ledger_source_mismatches,
      protocol_config_mismatches: report.protocol_config_mismatches,
    },
    registry_counts: {
      admissions: counts.admissions,
      theoretical_models: counts.theoretical_models,
      materials: counts.materials,
      physical_mechanisms: counts.physical_mechanisms,
      interfaces: counts.interfaces,
      siege_cells: counts.siege_cells,
      provenance_claims: counts.provenance_claims,
    },
  }
}

function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function generateSnapshots() {
  runDomain('rebuild')
  const report = runDomain('check')
  assertCleanCheck(report)
  const dimensions = runDomain('dimensions')
  assertDimensions(dimensions)
  const frontierItems = readFrontier()
  return {
    dimensions: serialize(dimensions),
    frontier: serialize({
      collection: 'frontier',
      item_count: frontierItems.length,
      items: frontierItems,
    }),
    summary: serialize(stableSummary(report)),
  }
}

function checkSnapshots(snapshots) {
  for (const [name, expected] of Object.entries(snapshots)) {
    const path = snapshotPaths[name]
    if (!existsSync(path)) fail(`missing generated snapshot ${path}`)
    if (readFileSync(path, 'utf8') !== expected) {
      fail(`generated snapshot drift: ${path}; run pnpm generate:data`)
    }
  }
}

function writeSnapshots(snapshots) {
  mkdirSync(dataRoot, { recursive: true })
  const staged = []
  try {
    for (const [name, content] of Object.entries(snapshots)) {
      const target = snapshotPaths[name]
      const temporary = `${target}.next-${process.pid}`
      writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' })
      staged.push([temporary, target])
    }
    for (const [temporary, target] of staged) renameSync(temporary, target)
  } finally {
    for (const [temporary] of staged) rmSync(temporary, { force: true })
  }
}

function main() {
  const mode = process.argv[2]
  if (!['--write', '--check'].includes(mode) || process.argv.length !== 3) {
    fail('usage: generate-domain-snapshots.mjs --write|--check')
  }
  const snapshots = generateSnapshots()
  if (mode === '--write') writeSnapshots(snapshots)
  else checkSnapshots(snapshots)
  console.log(`domain snapshots: ${mode === '--write' ? 'generated' : 'verified'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  try {
    main()
  } catch (error) {
    console.error(`domain snapshots: FAIL — ${error.message}`)
    process.exitCode = 1
  }
}
