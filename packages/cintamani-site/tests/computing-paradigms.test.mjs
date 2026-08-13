import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const testRoot = dirname(fileURLToPath(import.meta.url))
const siteRoot = resolve(testRoot, '..')
const pagesRoot = resolve(siteRoot, 'src/pages/computing-paradigms')
const readPage = (name) => readFileSync(resolve(pagesRoot, name), 'utf8')

const expectedPages = [
  'cellular-automata.md',
  'compute-in-memory.md',
  'functional-graph-reduction.md',
  'index.md',
  'interaction-nets.md',
  'molecular-and-chemical-computing.md',
  'neuromorphic-and-spiking.md',
  'photonic-analog-computing.md',
  'quantum-computing.md',
  'reversible-and-adiabatic.md',
  'spatial-dataflow.md',
  'thermodynamic-and-probabilistic.md',
]

test('computing-paradigms routes are complete, styled by the shared layout, and discoverable', () => {
  assert.deepEqual(
    readdirSync(pagesRoot).filter((name) => name.endsWith('.md')).sort(),
    expectedPages,
  )

  for (const page of expectedPages) {
    const content = readPage(page)
    assert.match(content, /^---\nlayout: \.\.\/\.\.\/layouts\/ArticleLayout\.astro\n/u)
  }

  const index = readPage('index.md')
  assert.doesNotMatch(index, /<style>/u)

  const layout = readFileSync(resolve(siteRoot, 'src/layouts/SiteLayout.astro'), 'utf8')
  assert.match(layout, /href="\/computing-paradigms\/">Paradigms<\/a>/u)

  const css = readFileSync(resolve(siteRoot, 'src/styles/global.css'), 'utf8')
  assert.match(css, /\/\* Computing paradigms \*\//u)
  assert.match(css, /\.paradigm-page \.maturity-matrix/u)
  assert.match(css, /\.paradigm-page \.cell-evidence/u)
})

test('every marked matrix cell opens matching claim, evidence, criticism, and sources', () => {
  const index = readPage('index.md')
  const links = [...index.matchAll(/class="matrix-cell-link[^"]*" href="([^"]+)"/gu)].map(
    (match) => match[1],
  )
  assert.equal(links.length, 50)
  assert.equal((index.match(/matrix-state--none"/gu) ?? []).length, 17)

  for (const href of links) {
    const match = href.match(/^\/computing-paradigms\/([^/]+)\/#([a-z-]+)$/u)
    assert.ok(match, `unexpected matrix link: ${href}`)
    const [, slug, anchor] = match
    const detail = readPage(`${slug}.md`)
    const sectionStart = detail.indexOf(`<h2 id="${anchor}">`)
    assert.notEqual(sectionStart, -1, `missing ${slug}#${anchor}`)
    const nextSection = detail.indexOf('<h2 id="', sectionStart + 1)
    const section = detail.slice(sectionStart, nextSection === -1 ? undefined : nextSection)
    assert.match(section, /<div class="cell-evidence">/u)
    for (const field of ['Claim', 'Evidence', 'Criticism', 'Sources']) {
      assert.match(section, new RegExp(`<dt>${field}<\\/dt>`, 'u'), `${href} lacks ${field}`)
    }
  }
})
