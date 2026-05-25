export default async function aggregate(args) {
  const rows = args._state?.rows ?? []
  const total = rows.reduce((acc, r) => acc + Number(r.amount ?? 0), 0)
  return { state_delta: { total } }
}
