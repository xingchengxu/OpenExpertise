export default async function greet(args: { name: string }) {
  return { state_delta: { greeting: `hello, ${args.name}` } }
}
