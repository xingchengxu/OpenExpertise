import type { RunEvent } from '@openexpertise/core'

export type NodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped'

export interface NodeState {
  id: string
  phase?: string
  status: NodeStatus
  error?: string
  activity?: string
  tokens?: { input: number; output: number }
}

export interface DashboardState {
  runStatus: string
  nodes: Record<string, NodeState>
  totals: { input_tokens: number; output_tokens: number }
}

export function initialDashboardState(nodes: { id: string; phase?: string }[]): DashboardState {
  const map: Record<string, NodeState> = {}
  for (const n of nodes) {
    map[n.id] = {
      id: n.id,
      status: 'pending',
      ...(n.phase ? { phase: n.phase } : {}),
    }
  }
  return {
    runStatus: 'starting',
    nodes: map,
    totals: { input_tokens: 0, output_tokens: 0 },
  }
}

export function reduceDashboardState(prev: DashboardState, event: RunEvent): DashboardState {
  switch (event.type) {
    case 'run.started':
      return { ...prev, runStatus: 'running' }
    case 'run.finished':
      return { ...prev, runStatus: `finished: ${event.status}` }
    case 'node.started':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'running' }))
    case 'node.finished':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'done' }))
    case 'node.failed':
      return updateNode(prev, event.node_id, (n) => ({
        ...n,
        status: 'failed',
        error: event.error,
      }))
    case 'node.skipped':
      return updateNode(prev, event.node_id, (n) => ({ ...n, status: 'skipped' }))
    case 'node.activity':
      return updateNode(prev, event.node_id, (n) => ({ ...n, activity: event.activity }))
    case 'node.tokens': {
      const next = updateNode(prev, event.node_id, (n) => {
        const t = n.tokens ?? { input: 0, output: 0 }
        return {
          ...n,
          tokens: {
            input: t.input + event.input_tokens,
            output: t.output + event.output_tokens,
          },
        }
      })
      if (next === prev) return prev // unknown node
      return {
        ...next,
        totals: {
          input_tokens: prev.totals.input_tokens + event.input_tokens,
          output_tokens: prev.totals.output_tokens + event.output_tokens,
        },
      }
    }
    case 'node.ready':
    case 'state.write':
      return prev
  }
}

function updateNode(
  state: DashboardState,
  nodeId: string,
  updater: (n: NodeState) => NodeState,
): DashboardState {
  const existing = state.nodes[nodeId]
  if (!existing) return state
  return {
    ...state,
    nodes: { ...state.nodes, [nodeId]: updater(existing) },
  }
}
