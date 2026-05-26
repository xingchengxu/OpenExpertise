export function slugify(input: string): string {
  let s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (s.length === 0) return 'experience'

  if (s.length > 60) {
    s = s.slice(0, 60)
    // Trim back to a word boundary if we landed mid-word
    const lastSep = s.lastIndexOf('-')
    if (lastSep > 30) s = s.slice(0, lastSep)
    s = s.replace(/-+$/g, '')
  }
  return s
}
