export default async function greet(args) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
