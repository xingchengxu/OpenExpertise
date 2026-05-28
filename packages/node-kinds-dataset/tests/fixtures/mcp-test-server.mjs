#!/usr/bin/env node
// Minimal MCP test server — responds to initialize + resources/read.
// Uses raw JSON-RPC stdio so we don't need the SDK on the server side
// (the SDK is needed on the CLIENT side which is what we're testing).

import { createInterface } from 'node:readline'

const stdin = createInterface({ input: process.stdin })
const stdout = process.stdout

function send(msg) {
  stdout.write(JSON.stringify(msg) + '\n')
}

const RESOURCES = {
  'test://items/list': {
    contents: [
      {
        uri: 'test://items/list',
        mimeType: 'application/json',
        text: JSON.stringify([
          { id: 1, name: 'alpha' },
          { id: 2, name: 'beta' },
          { id: 3, name: 'gamma' },
        ]),
      },
    ],
  },
  'test://doc': {
    contents: [
      {
        uri: 'test://doc',
        mimeType: 'text/plain',
        text: 'Hello from MCP test server.',
      },
    ],
  },
  'test://single-obj': {
    contents: [
      {
        uri: 'test://single-obj',
        mimeType: 'application/json',
        text: JSON.stringify({ kind: 'singleton', value: 42 }),
      },
    ],
  },
}

stdin.on('line', (line) => {
  let req
  try {
    req = JSON.parse(line)
  } catch {
    return
  }
  if (req.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { resources: {} },
        serverInfo: { name: 'mcp-test-server', version: '0.0.1' },
      },
    })
  } else if (req.method === 'notifications/initialized') {
    // no response for notifications
  } else if (req.method === 'resources/read') {
    const uri = req.params?.uri
    const data = RESOURCES[uri]
    if (data) {
      send({ jsonrpc: '2.0', id: req.id, result: data })
    } else {
      send({
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32602, message: `unknown uri: ${uri}` },
      })
    }
  } else if (req.method === 'resources/list') {
    send({
      jsonrpc: '2.0',
      id: req.id,
      result: { resources: Object.keys(RESOURCES).map((uri) => ({ uri })) },
    })
  } else {
    send({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32601, message: `method not found: ${req.method}` },
    })
  }
})
