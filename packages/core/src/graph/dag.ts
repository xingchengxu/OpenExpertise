import type { ExperienceSpec, NodeSpec } from '@openexpertise/schema'

export interface DagNode {
  id: string
  spec: NodeSpec
  predecessors: string[]
  successors: string[]
  incomingEdges: import('@openexpertise/schema').EdgeSpec[]
}

export interface Dag {
  nodes: Map<string, DagNode>
  topoOrder: DagNode[]
}

export function buildDag(spec: ExperienceSpec): Dag {
  const nodes = new Map<string, DagNode>()

  for (const n of spec.graph.nodes) {
    nodes.set(n.id, { id: n.id, spec: n, predecessors: [], successors: [], incomingEdges: [] })
  }

  for (const edge of spec.graph.edges) {
    const from = nodes.get(edge.from)
    const to = nodes.get(edge.to)
    if (!from || !to) {
      throw new Error(`Edge references missing node: ${edge.from} -> ${edge.to}`)
    }
    from.successors.push(edge.to)
    to.predecessors.push(edge.from)
    to.incomingEdges.push(edge)
  }

  const topoOrder = topoSort(nodes)
  return { nodes, topoOrder }
}

function topoSort(nodes: Map<string, DagNode>): DagNode[] {
  const indegree = new Map<string, number>()
  for (const n of nodes.values()) indegree.set(n.id, n.predecessors.length)

  const ready: string[] = []
  for (const [id, deg] of indegree) if (deg === 0) ready.push(id)

  const result: DagNode[] = []
  while (ready.length > 0) {
    const id = ready.shift()!
    const node = nodes.get(id)!
    result.push(node)
    for (const succId of node.successors) {
      const next = (indegree.get(succId) ?? 0) - 1
      indegree.set(succId, next)
      if (next === 0) ready.push(succId)
    }
  }

  if (result.length !== nodes.size) {
    const remaining = [...nodes.keys()].filter((id) => !result.find((r) => r.id === id))
    throw new Error(`Graph contains a cycle involving: ${remaining.join(', ')}`)
  }

  return result
}
