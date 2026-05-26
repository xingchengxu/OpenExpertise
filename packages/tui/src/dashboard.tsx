import React, { useEffect, useState } from 'react'
import { Box, Text } from 'ink'
import type { EventBus, RunEvent } from '@openexpertise/core'

interface NodeState {
  id: string
  phase?: string
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error?: string
}

interface Props {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function Dashboard({ events, nodes }: Props): React.ReactElement {
  const [state, setState] = useState<Record<string, NodeState>>(() => {
    const initial: Record<string, NodeState> = {}
    for (const n of nodes) {
      initial[n.id] = { id: n.id, status: 'pending', ...(n.phase ? { phase: n.phase } : {}) }
    }
    return initial
  })
  const [runStatus, setRunStatus] = useState<string>('starting')

  useEffect(() => {
    const unsub = events.subscribe((event: RunEvent) => {
      if (event.type === 'run.started') setRunStatus('running')
      else if (event.type === 'run.finished') setRunStatus(`finished: ${event.status}`)
      else if (
        event.type === 'node.started' ||
        event.type === 'node.finished' ||
        event.type === 'node.failed' ||
        event.type === 'node.skipped'
      ) {
        setState((prev) => {
          const current = prev[event.node_id] ?? { id: event.node_id, status: 'pending' as const }
          let nextStatus: NodeState['status'] = current.status
          if (event.type === 'node.started') nextStatus = 'running'
          if (event.type === 'node.finished') nextStatus = 'done'
          if (event.type === 'node.failed') nextStatus = 'failed'
          if (event.type === 'node.skipped') nextStatus = 'skipped'
          const next: NodeState = { ...current, status: nextStatus }
          if (event.type === 'node.failed') next.error = event.error
          return { ...prev, [event.node_id]: next }
        })
      }
    })
    return () => {
      unsub()
    }
  }, [events])

  return (
    <Box flexDirection="column">
      <Text>OpenExpertise run — {runStatus}</Text>
      {Object.values(state).map((n) => (
        <Box key={n.id}>
          <Text color={colorFor(n.status)}>
            {symbolFor(n.status)} {n.id}
          </Text>
          {n.phase && <Text dimColor> [{n.phase}]</Text>}
          {n.error && <Text color="red"> — {n.error}</Text>}
        </Box>
      ))}
    </Box>
  )
}

function symbolFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending':
      return '·'
    case 'running':
      return '▶'
    case 'done':
      return '✓'
    case 'failed':
      return '✗'
    case 'skipped':
      return '–'
  }
}
function colorFor(s: NodeState['status']): string {
  switch (s) {
    case 'pending':
      return 'gray'
    case 'running':
      return 'cyan'
    case 'done':
      return 'green'
    case 'failed':
      return 'red'
    case 'skipped':
      return 'yellow'
  }
}
