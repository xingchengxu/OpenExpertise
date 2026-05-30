const CYAN = '\x1b[36m'
const RESET = '\x1b[0m'

export function printNextSteps(hints: string[]): void {
  if (hints.length === 0) return
  process.stdout.write('\n')
  for (const h of hints) process.stdout.write(`${CYAN}→${RESET} ${h}\n`)
}
