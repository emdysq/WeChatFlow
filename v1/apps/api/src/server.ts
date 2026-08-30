import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DocumentService } from '../../../packages/core/src/document-service.ts'
import { RenderService } from '../../../packages/core/src/render-service.ts'
import { DoocsRendererAdapter } from '../../../packages/renderer-doocs/src/adapter.ts'
import { SqliteStore } from '../../../packages/storage/src/sqlite-store.ts'
import type { DocumentStatus, RenderProfile, RevisionAuthorType } from '../../../packages/domain/src/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const v1Root = resolve(here, '../../..')
const webRoot = resolve(v1Root, 'apps/web/public')

function writeJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function writeText(res: ServerResponse, status: number, body: string, contentType: string): void {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
    'cache-control': contentType.includes('text/html') ? 'no-store' : 'public, max-age=60',
  })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const next = Buffer.from(chunk)
    size += next.length
    if (size > 2_000_000) {
      const error = new Error('Request body too large')
      ;(error as any).code = 'REQUEST_TOO_LARGE'
      throw error
    }
    chunks.push(next)
  }
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  try { return JSON.parse(raw) }
  catch {
    const error = new Error('Invalid JSON body')
    ;(error as any).code = 'INVALID_JSON'
    throw error
  }
}

function errorPayload(error: unknown) {
  const err = error instanceof Error ? error : new Error(String(error))
  const code = (err as any).code ?? inferErrorCode(err.message)
  const details: Record<string, unknown> = {}
  if ((err as any).actualVersion !== undefined) details.actualVersion = (err as any).actualVersion
  if ((err as any).blockers !== undefined) details.blockers = (err as any).blockers
  return { code, message: err.message, details: Object.keys(details).length ? details : undefined }
}

function inferErrorCode(message: string): string {
  if (message.startsWith('Document not found')) return 'DOCUMENT_NOT_FOUND'
  if (message.includes('Revision') && message.includes('document')) return 'REVISION_INVALID'
  if (message.includes('Snapshot') && message.includes('document')) return 'SNAPSHOT_INVALID'
  if (message.includes('title is required') || message.includes('title is required'.replace('title', 'Document title'))) return 'VALIDATION_ERROR'
  return 'INTERNAL_ERROR'
}

function statusForError(error: ReturnType<typeof errorPayload>): number {
  if (error.code === 'DOCUMENT_NOT_FOUND') return 404
  if (error.code === 'WORKING_COPY_CONFLICT') return 409
  if (error.code === 'RENDERER_UNAVAILABLE') return 503
  if (error.code === 'REQUEST_TOO_LARGE') return 413
  if (['INVALID_JSON', 'VALIDATION_ERROR', 'REVISION_INVALID', 'SNAPSHOT_INVALID'].includes(error.code)) return 400
  return 500
}

function parseRenderProfile(body: any): RenderProfile {
  const profile = body?.profile
  if (!profile || typeof profile !== 'object' || typeof profile.theme !== 'string') {
    const error = new Error('profile.theme is required')
    ;(error as any).code = 'VALIDATION_ERROR'
    throw error
  }
  return profile as RenderProfile
}

export function createApiServer(options: { dbFile?: string } = {}) {
  const dbFile = options.dbFile ?? process.env.WECHATFLOW_DB ?? resolve(v1Root, 'data/wechatflow-v1.db')
  const documents = new DocumentService(new SqliteStore(dbFile))
  const renderer = new DoocsRendererAdapter({ v1Root })
  const renders = new RenderService(documents, renderer)

  const server = createServer(async (req, res) => {
    try {
      const method = req.method ?? 'GET'
      const url = new URL(req.url ?? '/', 'http://localhost')

      if (method === 'GET' && url.pathname === '/health') {
        const rendererStatus = renders.status()
        return writeJson(res, 200, {
          status: 'ok',
          app: 'WeChatFlow V1',
          storage: 'sqlite',
          schemaVersion: 2,
          renderer: rendererStatus,
        })
      }

      if (method === 'GET' && url.pathname === '/api/v1/renderer')
        return writeJson(res, 200, renders.status())

      if (method === 'GET' && url.pathname === '/api/v1/documents') {
        const status = (url.searchParams.get('status') ?? 'EDITING') as DocumentStatus
        if (!['EDITING', 'ARCHIVED'].includes(status))
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'status must be EDITING or ARCHIVED' } })
        return writeJson(res, 200, { items: documents.listDocuments(status) })
      }

      if (method === 'POST' && url.pathname === '/api/v1/documents') {
        const body = await readBody(req)
        if (!body.title || typeof body.title !== 'string')
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'title is required' } })
        return writeJson(res, 201, documents.createDocument({ title: body.title, markdown: body.markdown, authorLabel: body.authorLabel }))
      }

      const docMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)$/)
      if (method === 'GET' && docMatch)
        return writeJson(res, 200, documents.getDocumentView(docMatch[1]!))

      const workingMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/working-copy$/)
      if (method === 'PATCH' && workingMatch) {
        const body = await readBody(req)
        if (typeof body.title !== 'string' || typeof body.markdown !== 'string')
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'title and markdown are required' } })
        const expectedVersion = body.expectedVersion === undefined ? undefined : Number(body.expectedVersion)
        return writeJson(res, 200, documents.saveWorkingCopy(workingMatch[1]!, { title: body.title, markdown: body.markdown, expectedVersion }))
      }

      // Best-effort browser-unload path. It uses the same optimistic concurrency
      // protection; conflicts are intentionally ignored because the newer copy
      // must win rather than being overwritten during page unload.
      const beaconMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/working-copy-beacon$/)
      if (method === 'POST' && beaconMatch) {
        const body = await readBody(req)
        if (typeof body.title === 'string' && typeof body.markdown === 'string') {
          try {
            documents.saveWorkingCopy(beaconMatch[1]!, {
              title: body.title,
              markdown: body.markdown,
              expectedVersion: body.expectedVersion === undefined ? undefined : Number(body.expectedVersion),
            })
          } catch (error) {
            if ((error as any).code !== 'WORKING_COPY_CONFLICT') throw error
          }
        }
        res.writeHead(204)
        return res.end()
      }

      const commitMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/commit$/)
      if (method === 'POST' && commitMatch) {
        const body = await readBody(req)
        const authorType = body.authorType as RevisionAuthorType | undefined
        if (authorType && !['USER', 'AI', 'AGENT', 'SYSTEM'].includes(authorType))
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'invalid authorType' } })
        return writeJson(res, 200, documents.commitWorkingCopy(commitMatch[1]!, {
          authorType,
          authorLabel: typeof body.authorLabel === 'string' ? body.authorLabel : undefined,
          reason: typeof body.reason === 'string' ? body.reason : undefined,
        }))
      }

      const restoreMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/restore$/)
      if (method === 'POST' && restoreMatch) {
        const body = await readBody(req)
        if (typeof body.revisionId !== 'string')
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'revisionId is required' } })
        return writeJson(res, 200, documents.restoreRevision(restoreMatch[1]!, body.revisionId, { authorLabel: body.authorLabel }))
      }

      const statusMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/status$/)
      if (method === 'POST' && statusMatch) {
        const body = await readBody(req)
        if (!['EDITING', 'ARCHIVED'].includes(body.status))
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'status must be EDITING or ARCHIVED' } })
        return writeJson(res, 200, documents.setDocumentStatus(statusMatch[1]!, body.status))
      }

      const revisionsMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/revisions$/)
      if (revisionsMatch && method === 'GET')
        return writeJson(res, 200, { items: documents.store.listRevisions(revisionsMatch[1]!) })
      if (revisionsMatch && method === 'POST') {
        // Compatibility endpoint: explicit full-content revision creation.
        const body = await readBody(req)
        if (typeof body.title !== 'string' || typeof body.markdown !== 'string')
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'title and markdown are required' } })
        return writeJson(res, 201, documents.saveRevision(revisionsMatch[1]!, {
          title: body.title,
          markdown: body.markdown,
          authorType: body.authorType,
          authorLabel: body.authorLabel,
          reason: body.reason,
        }))
      }

      const diffMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/diff$/)
      if (diffMatch && method === 'GET') {
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to') ?? 'working'
        if (!from)
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'from revision id is required' } })
        return writeJson(res, 200, documents.getDiff(diffMatch[1]!, from, to))
      }

      const previewMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/preview$/)
      if (previewMatch && method === 'POST') {
        const body = await readBody(req)
        return writeJson(res, 200, await renders.previewWorkingCopy(previewMatch[1]!, parseRenderProfile(body)))
      }

      const snapshotMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/snapshots$/)
      if (snapshotMatch && method === 'GET')
        return writeJson(res, 200, { items: documents.store.listSnapshots(snapshotMatch[1]!) })
      if (snapshotMatch && method === 'POST') {
        const body = await readBody(req)
        return writeJson(res, 201, await renders.createSnapshot(snapshotMatch[1]!, parseRenderProfile(body)))
      }

      const remoteMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/remote-drafts$/)
      if (remoteMatch && method === 'GET')
        return writeJson(res, 200, { items: documents.store.listRemoteDrafts(remoteMatch[1]!) })
      if (remoteMatch && method === 'POST') {
        // Foundation bookkeeping endpoint only. Real WeChat side effects are
        // introduced in Phase 7 behind prepare/approval semantics.
        const body = await readBody(req)
        if (typeof body.accountId !== 'string' || typeof body.mediaId !== 'string' || typeof body.snapshotId !== 'string')
          return writeJson(res, 400, { error: { code: 'VALIDATION_ERROR', message: 'accountId, mediaId and snapshotId are required' } })
        return writeJson(res, 201, documents.recordWechatDraft({ documentId: remoteMatch[1]!, accountId: body.accountId, mediaId: body.mediaId, snapshotId: body.snapshotId }))
      }

      if (method === 'GET' && (url.pathname === '/' || /^\/editor\/[^/]+$/.test(url.pathname)))
        return writeText(res, 200, readFileSync(resolve(webRoot, 'index.html'), 'utf8'), 'text/html; charset=utf-8')
      if (method === 'GET' && url.pathname === '/assets/app.js')
        return writeText(res, 200, readFileSync(resolve(webRoot, 'app.js'), 'utf8'), 'text/javascript; charset=utf-8')
      if (method === 'GET' && url.pathname === '/assets/styles.css')
        return writeText(res, 200, readFileSync(resolve(webRoot, 'styles.css'), 'utf8'), 'text/css; charset=utf-8')

      return writeJson(res, 404, { error: { code: 'NOT_FOUND', message: 'not found' } })
    }
    catch (error) {
      const payload = errorPayload(error)
      return writeJson(res, statusForError(payload), { error: payload })
    }
  })

  return { server, documents, renders, dbFile }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const { server, dbFile } = createApiServer()
  const port = Number(process.env.PORT ?? 8787)
  server.listen(port, '127.0.0.1', () => {
    console.log(`WeChatFlow V1 listening on http://127.0.0.1:${port}`)
    console.log(`SQLite: ${dbFile}`)
  })
}
