import React, { useEffect, useReducer } from 'react'
import { Box, Text } from 'ink'
import type { EventBus, RunEvent } from '@openexpertise/core'
import {
  initialDashboardState,
  reduceDashboardState,
  type NodeState,
} from './reducer.js'

interface Props {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function Dashboard({ events, nodes }: Props): React.ReactElement {
  const [state, dispatch] = useReducer(
    reduceDashboardState,
    nodes,
    initialDashboardState,
  )

  useEffect(() => {
    const unsub = events.subscribe((event: RunEvent) => dispatch(event))
    return () => {
      unsub()
    }
  }, [events])

  const { input_tokens, output_tokens } = state.totals

  return (
    <Box flexDirection="column">
      <Text>
        OpenExpertise run — {state.runStatus}
        {(input_tokens > 0 || output_tokens > 0) && (
          <Text dimColor>
            {'  · Σ in='}
            {input_tokens}
            {' out='}
            {output_tokens}
          </Text>
        )}
      </Text>
      {Object.values(state.nodes).map((n) => (
        <NodeRow key={n.id} node={n} />
      ))}
    </Box>
  )
}

function NodeRow({ node }: { node: NodeState }): React.ReactElement {
  return (
    <Box>
      <Text color={colorFor(node.status)}>
        {symbolFor(node.status)} {node.id}
      </Text>
      {node.phase && <Text dimColor> [{node.phase}]</Text>}
      {node.activity && <Text dimColor> · {truncate(node.activity, 40)}</Text>}
      {node.tokens && (node.tokens.input > 0 || node.tokens.output > 0) && (
        <Text dimColor>
          {' · '}
          {node.tokens.input}
          {'/'}
          {node.tokens.output}
        </Text>
      )}
      {node.error && <Text color="red"> — {node.error}</Text>}
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + '…'
}
