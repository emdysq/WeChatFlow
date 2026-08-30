import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

async function readStdin(): Promise<string> {
  let data = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin)
    data += chunk
  return data
}

const upstreamRoot = process.env.WECHATFLOW_DOOCS_ROOT
if (!upstreamRoot)
  throw new Error('WECHATFLOW_DOOCS_ROOT is required')

// Verify the pinned checkout before importing it. This keeps renderer failures
// actionable instead of surfacing as opaque module-resolution errors.
await readFile(resolve(upstreamRoot, 'packages/mcp-server/src/render-article.ts'), 'utf8')

const moduleUrl = pathToFileURL(resolve(upstreamRoot, 'packages/mcp-server/src/render-article.ts')).href
const { buildRenderedOutput } = await import(moduleUrl) as {
  buildRenderedOutput: (input: Record<string, unknown>) => Promise<{
    html: string
    frontMatter: Record<string, unknown>
    readingTime: { words: number; minutes: number }
  }>
}

const raw = await readStdin()
const input = JSON.parse(raw || '{}') as Record<string, unknown>
// Avoid a network fetch for a remote highlight.js theme unless the caller
// explicitly configured one. This makes default rendering deterministic.
if (input.codeBlockTheme === undefined)
  input.codeBlockTheme = ''

const result = await buildRenderedOutput(input)
process.stdout.write(JSON.stringify(result))
