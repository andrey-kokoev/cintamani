import { announce, element, loadSessionWithStatus, publicAuthor, readJson } from './public-api.mjs'

function renderProposalList(root, data) {
  const list = root.querySelector('[data-proposal-list]')
  list.replaceChildren()
  if (data.items.length === 0) {
    list.append(element('li', { className: 'empty-public-list', text: 'No public proposals match this view yet.' }))
    list.dataset.settled = 'true'
    return
  }
  for (const item of data.items) {
    const card = element('li', { className: 'public-proposal-card' })
    const header = element('div', { className: 'proposal-card-meta' })
    header.append(
      element('span', { className: 'status-pill status-pill--submitted', text: item.current_admin_state }),
      element('span', { className: 'unreviewed-label', text: 'unreviewed until an audited transition says otherwise' }),
    )
    const title = element('h3')
    title.append(
      element('a', {
        text: item.title,
        attributes: { href: `/proposals/detail/?proposal=${encodeURIComponent(item.proposal_id)}` },
      }),
    )
    const authorLine = element('p', { className: 'proposal-author' })
    authorLine.append('Submitted by ', publicAuthor(item), ` · revision ${item.current_revision}`)
    card.append(
      header,
      title,
      element('p', { text: item.summary }),
      element('code', { text: item.proposal_kind }),
      authorLine,
    )
    list.append(card)
  }
  list.dataset.settled = 'true'
}

function renderSiegeOverlay(root, config, proposals) {
  const overlay = root.querySelector('[data-siege-overlay]')
  overlay.replaceChildren()
  const kindForAxis = {
    'theoretical-model': 'theoretical-model-member',
    'physical-material': 'physical-material-member',
    'physical-calculation-mechanism': 'physical-calculation-mechanism-member',
    'observation-interface': 'observation-interface-member',
  }
  for (const axis of config.dimensions) {
    const proposalCount = proposals.filter((item) => item.proposal_kind === kindForAxis[axis.dimension_key]).length
    const card = element('article', {
      className: axis.dimension_order === 4 ? 'overlay-axis overlay-axis--later' : 'overlay-axis',
    })
    card.append(
      element('p', {
        className: 'dimension-role',
        text: axis.dimension_order === 4 ? 'Later-added fourth dimension' : `Original 3D axis ${axis.dimension_order}`,
      }),
      element('h3', { text: axis.dimension_name }),
      element('p', {
        text: `${axis.members.length} canonical members · ${proposalCount} public member proposals`,
      }),
    )
    overlay.append(card)
  }
}

export async function initializeProposalHub(root = document) {
  const [config] = await Promise.all([readJson('/api/config'), loadSessionWithStatus(root)])
  const status = root.querySelector('[data-hub-status]')

  const refresh = async () => {
    delete root.querySelector('[data-proposal-list]').dataset.settled
    const filters = new URLSearchParams({ limit: '50' })
    const kind = root.querySelector('[data-filter-kind]').value
    const state = root.querySelector('[data-filter-state]').value
    if (kind) filters.set('kind', kind)
    if (state) filters.set('state', state)
    const data = await readJson(`/api/proposals?${filters}`)
    renderProposalList(root, data)
    renderSiegeOverlay(root, config, data.items)
    status.hidden = true
  }

  const refreshWithDiagnostic = async () => {
    try {
      await refresh()
    } catch (error) {
      announce(status, `Public proposal listing unavailable: ${error.message}`, 'error')
    }
  }
  for (const filter of root.querySelectorAll('[data-proposal-filter]')) {
    filter.addEventListener('change', refreshWithDiagnostic)
  }
  await refresh()
}
