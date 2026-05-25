export default async function listDimensions() {
  return {
    state_delta: {
      dimensions: [
        { key: 'bugs', focus: 'logic errors' },
        { key: 'perf', focus: 'regressions' },
        { key: 'tests', focus: 'missing coverage' },
      ],
    },
  }
}
