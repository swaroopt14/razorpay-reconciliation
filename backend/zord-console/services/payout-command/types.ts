// Shared types for the payout command view — conversation, AI responses, and
// prompt-layer API shapes. Kept separate from model.ts (simulation data) so
// each file has a single clear responsibility.

export type WorkspaceLoadingPhase =
  | 'understanding'
  | 'fetching'
  | 'listing'
  | 'checking'
  | 'summarizing'

export type WorkspaceConversationMessage = {
  id: string
  role: 'user' | 'assistant'
  body: string
  timestamp: string
  status: 'typing' | 'done' | 'error'
  loadingPhase?: WorkspaceLoadingPhase | null
  confidence?: string | null
  citationSnippet?: string | null
  citations?: PromptLayerCitation[]
  hasVisualization?: boolean
  visualization?: PromptLayerVisualization | null
}

export type WorkspaceChatThread = {
  id: string
  tab: string
  title: string
  createdAt: string
  updatedAt: string
  messages: WorkspaceConversationMessage[]
  sessionId: string
}

export type PromptLayerCitation = {
  source_type?: string
  record_id?: string
  chunk_id?: string
  snippet?: string
  score?: number
}
export type PromptLayerVisualizationPoint = {
  label: string
  value: number
}

export type PromptLayerVisualizationMetric = {
  key: string
  value: string
}

export type PromptLayerVisualizationWindow = {
  from_utc?: string
  to_utc?: string
  label?: string
}

export type PromptLayerVisualization = {
  visualization_id?: string
  chart_type?: 'bar' | 'line' | 'stacked_bar' | 'donut' | 'table'
  title: string
  subtitle?: string
  description?: string
  x_axis: string
  y_axis: string
  series: PromptLayerVisualizationPoint[]
  legend?: string[]
  insights?: string[]
  summary_metrics?: PromptLayerVisualizationMetric[]
  time_window?: PromptLayerVisualizationWindow
  confidence?: string
  empty_state_message?: string
}
export type WorkspaceLiveAnswer = {
  title: string
  body: string
  confidence: string | null
  citations: PromptLayerCitation[]
  visualization: PromptLayerVisualization | null
}

export type AskZordResponse = {
  title: string
  body: string
}
