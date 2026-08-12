export interface TopicOriginView {
  kind: string
  id: string
  relationship: string
  rationale?: string
  source_admission_id?: string
}

export interface ResearchTopicView {
  topic_id: string
  revision: number
  title: string
  loci: string[]
  open_problem: string
  why_open: string
  scope: string
  next_discriminating_criticism_or_test: string
  non_claims: string
  origins: TopicOriginView[]
  coordinate: { coordinate_key: string } | null
  coordinate_framings?: Array<{ coordinate_key: string }>
  status?: 'active' | 'paused' | 'retired'
  history?: unknown[]
  provenance?: unknown[]
}
