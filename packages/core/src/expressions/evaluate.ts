// Tiny boolean-expression evaluator for when:/until: predicates.
// Supports: $.field paths, numeric/string literals, ==, !=, >, <, >=, <=, &&, ||, length(...)
// No `eval`, no full JS. Tokenize → parse → evaluate.

type Token =
  | { kind: 'path'; value: string }
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'op'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue }
    if (c === '(') { tokens.push({ kind: 'lparen' }); i++; continue }
    if (c === ')') { tokens.push({ kind: 'rparen' }); i++; continue }
    if (c === '$' && src[i + 1] === '.') {
      let j = i + 2
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j]!)) j++
      tokens.push({ kind: 'path', value: src.slice(i, j) })
      i = j; continue
    }
    if (c === '"' || c === "'") {
      const quote = c
      let j = i + 1
      while (j < src.length && src[j] !== quote) j++
      if (j >= src.length) throw new Error(`Unterminated string in expression: ${src}`)
      tokens.push({ kind: 'str', value: src.slice(i + 1, j) })
      i = j + 1; continue
    }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i + 1
      while (j < src.length && /[0-9.]/.test(src[j]!)) j++
      tokens.push({ kind: 'num', value: parseFloat(src.slice(i, j)) })
      i = j; continue
    }
    if (c === '=' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '==' }); i += 2; continue }
    if (c === '!' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '!=' }); i += 2; continue }
    if (c === '>' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '>=' }); i += 2; continue }
    if (c === '<' && src[i + 1] === '=') { tokens.push({ kind: 'op', value: '<=' }); i += 2; continue }
    if (c === '>') { tokens.push({ kind: 'op', value: '>' }); i++; continue }
    if (c === '<') { tokens.push({ kind: 'op', value: '<' }); i++; continue }
    if (c === '&' && src[i + 1] === '&') { tokens.push({ kind: 'op', value: '&&' }); i += 2; continue }
    if (c === '|' && src[i + 1] === '|') { tokens.push({ kind: 'op', value: '||' }); i += 2; continue }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j]!)) j++
      const word = src.slice(i, j)
      if (word === 'true') tokens.push({ kind: 'bool', value: true })
      else if (word === 'false') tokens.push({ kind: 'bool', value: false })
      else tokens.push({ kind: 'ident', value: word })
      i = j; continue
    }
    throw new Error(`Unexpected character "${c}" in expression: ${src}`)
  }
  return tokens
}

interface ParseCtx {
  pos: number
  tokens: Token[]
}

function peek(ctx: ParseCtx): Token | undefined {
  return ctx.tokens[ctx.pos]
}

function consume(ctx: ParseCtx): Token {
  const t = ctx.tokens[ctx.pos]
  if (!t) throw new Error('Unexpected end of expression')
  ctx.pos++
  return t
}

type Ast =
  | { kind: 'lit'; value: unknown }
  | { kind: 'path'; value: string }
  | { kind: 'binop'; op: string; lhs: Ast; rhs: Ast }
  | { kind: 'call'; fn: string; args: Ast[] }

function parseOr(ctx: ParseCtx): Ast {
  let lhs = parseAnd(ctx)
  while (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === '||') {
    consume(ctx)
    const rhs = parseAnd(ctx)
    lhs = { kind: 'binop', op: '||', lhs, rhs }
  }
  return lhs
}

function parseAnd(ctx: ParseCtx): Ast {
  let lhs = parseCmp(ctx)
  while (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === '&&') {
    consume(ctx)
    const rhs = parseCmp(ctx)
    lhs = { kind: 'binop', op: '&&', lhs, rhs }
  }
  return lhs
}

function parseCmp(ctx: ParseCtx): Ast {
  let lhs = parseAtom(ctx)
  const t = peek(ctx)
  if (t && t.kind === 'op' && ['==', '!=', '>', '<', '>=', '<='].includes(t.value)) {
    consume(ctx)
    const rhs = parseAtom(ctx)
    lhs = { kind: 'binop', op: t.value, lhs, rhs }
  }
  return lhs
}

function parseAtom(ctx: ParseCtx): Ast {
  const t = consume(ctx)
  if (t.kind === 'lparen') {
    const inside = parseOr(ctx)
    const close = consume(ctx)
    if (close.kind !== 'rparen') throw new Error('Expected )')
    return inside
  }
  if (t.kind === 'num' || t.kind === 'str' || t.kind === 'bool') return { kind: 'lit', value: t.value }
  if (t.kind === 'path') return { kind: 'path', value: t.value }
  if (t.kind === 'ident') {
    if (peek(ctx)?.kind === 'lparen') {
      consume(ctx)
      const args: Ast[] = []
      while (peek(ctx)?.kind !== 'rparen') {
        args.push(parseOr(ctx))
        if (peek(ctx)?.kind === 'op' && (peek(ctx) as { value: string }).value === ',') consume(ctx)
      }
      consume(ctx) // rparen
      return { kind: 'call', fn: t.value, args }
    }
    throw new Error(`Unexpected identifier "${t.value}" without parens`)
  }
  throw new Error(`Unexpected token: ${JSON.stringify(t)}`)
}

function resolvePath(path: string, state: Record<string, unknown>): unknown {
  const parts = path.slice(2).split('.')
  let cur: unknown = state
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function evalAst(ast: Ast, state: Record<string, unknown>): unknown {
  switch (ast.kind) {
    case 'lit': return ast.value
    case 'path': return resolvePath(ast.value, state)
    case 'call': {
      if (ast.fn === 'length') {
        const v = evalAst(ast.args[0]!, state)
        if (Array.isArray(v) || typeof v === 'string') return v.length
        return 0
      }
      throw new Error(`Unknown function: ${ast.fn}`)
    }
    case 'binop': {
      if (ast.op === '&&') return Boolean(evalAst(ast.lhs, state)) && Boolean(evalAst(ast.rhs, state))
      if (ast.op === '||') return Boolean(evalAst(ast.lhs, state)) || Boolean(evalAst(ast.rhs, state))
      const l = evalAst(ast.lhs, state)
      const r = evalAst(ast.rhs, state)
      if (l === undefined || r === undefined) {
        // Missing fields produce false (per Plan 3 design)
        if (ast.op === '!=') return l !== r
        return false
      }
      switch (ast.op) {
        case '==': return l === r
        case '!=': return l !== r
        case '>': return (l as number) > (r as number)
        case '<': return (l as number) < (r as number)
        case '>=': return (l as number) >= (r as number)
        case '<=': return (l as number) <= (r as number)
      }
      throw new Error(`Unknown binop: ${ast.op}`)
    }
  }
}

export function evaluateExpression(src: string, state: Record<string, unknown>): unknown {
  const tokens = tokenize(src)
  const ast = parseOr({ pos: 0, tokens })
  return evalAst(ast, state)
}
