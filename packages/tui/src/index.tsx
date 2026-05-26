import React from 'react'
import { render, type Instance } from 'ink'
import { Dashboard } from './dashboard.js'
import type { EventBus } from '@openexpertise/core'

export { Dashboard } from './dashboard.js'

export interface StartTuiOpts {
  events: EventBus
  nodes: { id: string; phase?: string }[]
}

export function startTui(opts: StartTuiOpts): Instance {
  return render(<Dashboard events={opts.events} nodes={opts.nodes} />)
}
