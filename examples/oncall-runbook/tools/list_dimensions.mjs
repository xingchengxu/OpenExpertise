export default async function listDimensions() {
  return {
    state_delta: {
      dimensions: [
        { key: 'observability', focus: 'metrics, logs, traces — what signals fired and when' },
        { key: 'blast-radius', focus: 'which downstream services and customers are affected' },
        { key: 'similar-past-incidents', focus: 'matching prior incidents and their mitigations' },
      ],
    },
  }
}
