import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RenderProfile, RenderResult } from '../../domain/src/types.ts'

export interface RendererStatus {
  available: boolean
  id: 'doocs-md'
  upstreamCommit: string | null
  blockers: string[]
}

export interface RenderInput {
  markdown: string
  profile: RenderProfile
}

export class DoocsRendererAdapter {
  readonly v1Root: string
  readonly upstreamRoot: string
  readonly bridgePath: string
  readonly upstreamCommit: string | null

  constructor(options: { v1Root?: string } = {}) {
    const here = dirname(fileURLToPath(import.meta.url))
    this.v1Root = options.v1Root ?? resolve(here, '../../..')
    this.upstreamRoot = resolve(this.v1Root, 'upstream/doocs-md')
    this.bridgePath = resolve(this.v1Root, 'packages/renderer-doocs/src/bridge.ts')
    try {
      const lock = JSON.parse(readFileSync(resolve(this.v1Root, 'upstream/doocs-md.lock.json'), 'utf8')) as { commit?: string }
      this.upstreamCommit = lock.commit ?? null
    }
    catch {
      this.upstreamCommit = null
    }
  }

  status(): RendererStatus {
    const blockers: string[] = []
    if (!existsSync(this.upstreamRoot))
      blockers.push('UPSTREAM_NOT_BOOTSTRAPPED')
    if (!existsSync(resolve(this.upstreamRoot, 'packages/mcp-server/src/render-article.ts')))
      blockers.push('UPSTREAM_RENDERER_SOURCE_MISSING')
    if (!existsSync(resolve(this.upstreamRoot, 'node_modules')))
      blockers.push('UPSTREAM_DEPENDENCIES_NOT_INSTALLED')
    return {
      available: blockers.length === 0,
      id: 'doocs-md',
      upstreamCommit: this.upstreamCommit,
      blockers,
    }
  }

  async render(input: RenderInput): Promise<RenderResult> {
    const status = this.status()
    if (!status.available) {
      const error = new Error(`doocs renderer unavailable: ${status.blockers.join(', ')}`)
      ;(error as any).code = 'RENDERER_UNAVAILABLE'
      ;(error as any).blockers = status.blockers
      throw error
    }

    const payload = {
      markdown: input.markdown,
      theme: input.profile.theme,
      primaryColor: input.profile.primaryColor,
      fontFamily: input.profile.fontFamily,
      fontSize: input.profile.fontSize,
      lineHeight: input.profile.lineHeight,
      blockSpacing: input.profile.blockSpacing,
      linkColor: input.profile.linkColor,
      blockquoteBackground: input.profile.blockquoteBackground,
      legend: input.profile.legend,
      isMacCodeBlock: input.profile.isMacCodeBlock,
      isShowLineNumber: input.profile.isShowLineNumber,
      citeStatus: input.profile.citeStatus,
      countStatus: input.profile.countStatus,
      themeMode: input.profile.themeMode,
      isUseIndent: input.profile.isUseIndent,
      isUseJustify: input.profile.isUseJustify,
      headingStyles: input.profile.headingStyles,
      codeBlockTheme: input.profile.codeBlockTheme ?? '',
      customCSS: input.profile.customCss,
    }

    const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    const child = spawn(executable, ['exec', 'tsx', this.bridgePath], {
      cwd: this.upstreamRoot,
      env: { ...process.env, WECHATFLOW_DOOCS_ROOT: this.upstreamRoot },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.stdin.end(JSON.stringify(payload))

    const timeout = setTimeout(() => child.kill(), 20_000)
    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child.on('error', reject)
      child.on('close', resolveExit)
    }).finally(() => clearTimeout(timeout))

    if (exitCode !== 0) {
      const error = new Error(`doocs renderer failed (${exitCode}): ${stderr.trim() || 'no stderr'}`)
      ;(error as any).code = 'RENDERER_FAILED'
      throw error
    }

    let result: { html: string; frontMatter?: Record<string, unknown>; readingTime?: { words: number; minutes: number } }
    try {
      result = JSON.parse(stdout.trim())
    }
    catch (cause) {
      const error = new Error('doocs renderer returned invalid JSON', { cause })
      ;(error as any).code = 'RENDERER_INVALID_OUTPUT'
      throw error
    }

    return {
      html: result.html,
      frontMatter: result.frontMatter ?? {},
      readingTime: result.readingTime ?? { words: 0, minutes: 0 },
      renderer: { id: 'doocs-md', upstreamCommit: this.upstreamCommit },
    }
  }
}
