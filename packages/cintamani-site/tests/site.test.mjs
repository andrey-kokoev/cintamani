import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { readFrontier } from '../scripts/generate-domain-snapshots.mjs'

const testRoot = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(testRoot, '..')
const readJson = (relative) => JSON.parse(readFileSync(resolve(siteRoot, relative), 'utf8'))

test('tracked snapshots preserve the ordered siege and scientific boundary', () => {
  const dimensions = readJson('src/data/dimensions.json')
  assert.deepEqual(
    dimensions.items.map((axis) => [axis.dimension_order, axis.dimension_key, axis.dimension_role]),
    [
      [1, 'theoretical-model', 'original-three-dimensional-axis'],
      [2, 'physical-material', 'original-three-dimensional-axis'],
      [3, 'physical-calculation-mechanism', 'original-three-dimensional-axis'],
      [4, 'observation-interface', 'later-added-fourth-dimension'],
    ],
  )
  for (const axis of dimensions.items) {
    assert.equal(axis.member_count, axis.members.length)
    axis.members.forEach((member, index) => {
      assert.equal(member.member_order, index + 1)
      assert.ok(member.current_assessment_id)
      assert.ok(member.current_assessment_revision)
      assert.ok(member.current_assessment_status)
      assert.ok(member.assessment_rationale)
      assert.ok(member.assessment_scope)
      assert.ok(member.source_admission_id)
    })
  }
  const litao3 = dimensions.items[1].members.find(
    (member) => member.member_id === 'thin-film-litao3-candidate',
  )
  assert.equal(litao3.current_assessment_status, 'unvalidated-candidate')

  const frontier = readJson('src/data/frontier.json')
  assert.equal(frontier.item_count, frontier.items.length)
  assert.equal(frontier.items.filter((item) => item.gap).length, 2)
  assert.equal(frontier.items.filter((item) => !item.gap).length, 2)

  const summary = readJson('src/data/registry-summary.json')
  assert.equal(summary.snapshot_mode, 'build-time-static')
  assert.equal(summary.mutable_edge_registry, false)
  assert.equal(summary.check_status, 'passed')
  assert.equal(summary.integrity, 'ok')
  assert.ok(Object.values(summary.invariant_counts).every((count) => count === 0))
})

test('snapshot generator check mode is byte-deterministic and fail-closed', () => {
  const result = spawnSync(process.execPath, ['scripts/generate-domain-snapshots.mjs', '--check'], {
    cwd: siteRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /snapshots: verified/)
})

test('frontier pagination rejects repeated coordinates, cursors, and unbounded traversal', () => {
  const item = (suffix) => ({
    model_id: `model-${suffix}`,
    material_id: 'material',
    mechanism_id: 'mechanism',
    interface_id: 'interface',
  })
  assert.throws(
    () =>
      readFrontier((command, args) => {
        assert.equal(command, 'frontier')
        return args.includes('--cursor')
          ? { collection: 'frontier', items: [item('a')], next_cursor: null }
          : { collection: 'frontier', items: [item('a')], next_cursor: 'cursor-a' }
      }),
    /repeated coordinate/,
  )

  let cursorCall = 0
  assert.throws(
    () =>
      readFrontier(() => {
        cursorCall += 1
        return {
          collection: 'frontier',
          items: [item(cursorCall)],
          next_cursor: 'same-cursor',
        }
      }),
    /repeated a cursor/,
  )

  let boundCall = 0
  assert.throws(
    () =>
      readFrontier(
        () => {
          boundCall += 1
          return {
            collection: 'frontier',
            items: [item(boundCall)],
            next_cursor: `cursor-${boundCall}`,
          }
        },
        { maxPages: 2, maxRows: 10 },
      ),
    /exceeded the 2-page safety bound/,
  )
})

test('Astro page and Workers Assets config state the static authority boundary', () => {
  const page = readFileSync(resolve(siteRoot, 'src/pages/index.astro'), 'utf8')
  for (const statement of [
    'No LiTaO3 validation.',
    'No physical detector calibration.',
    'No replicated nonlinear computation.',
    'No Conjecture 5 or connected-region claim.',
    'There is no D1 database and no mutable',
  ]) {
    assert.ok(page.includes(statement), `missing UI boundary: ${statement}`)
  }
  const wrangler = readJson('wrangler.jsonc')
  assert.equal(wrangler.name, 'cintamani')
  assert.equal(wrangler.assets.directory, './dist')
  assert.equal(wrangler.assets.not_found_handling, '404-page')
  const astro = readFileSync(resolve(siteRoot, 'astro.config.mjs'), 'utf8')
  assert.match(astro, /output: 'static'/)
  assert.match(astro, /PUBLIC_SITE_URL/)
})

test('Narada ochre primary and semantic colors retain readable contrast', () => {
  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }
  const luminance = (hex) => {
    const bytes = hex
      .slice(1)
      .match(/../g)
      .map((part) => Number.parseInt(part, 16))
    return 0.2126 * channel(bytes[0]) + 0.7152 * channel(bytes[1]) + 0.0722 * channel(bytes[2])
  }
  const contrast = (left, right) => {
    const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a)
    return (lighter + 0.05) / (darker + 0.05)
  }
  const pairs = [
    ['#ffae62', '#071117', 'ochre text on page ground'],
    ['#2b1606', '#ffae62', 'CTA foreground on ochre'],
    ['#72d6aa', '#071117', 'passed status on page ground'],
    ['#b4c4c6', '#1c3034', 'neutral status on its soft surface'],
    ['#dda5c2', '#3d2734', 'gap status on its soft surface'],
    ['#a9bfe4', '#1c283c', 'later-axis label on its panel'],
    ['#9db2b3', '#071117', 'body-muted copy on page ground'],
  ]
  for (const [foreground, background, label] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5, `${label} must meet WCAG AA`)
  }

  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')
  assert.match(css, /--ochre: #ffae62/)
  assert.doesNotMatch(css, /mint|#68e0c3|rgb\(104 224 195/)
  assert.match(css, /outline: 2px solid var\(--ochre\)/)
})
