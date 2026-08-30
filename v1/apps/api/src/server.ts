import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { DocumentService } from '../../../packages/core/src/document-service.ts'
import { SqliteStore } from '../../../packages/storage/src/sqlite-store.ts'

const dbFile = process.env.WECHATFLOW_DB ?? resolve('data/wechatflow-v1.db')
const service = new DocumentService(new SqliteStore(dbFile))

function json(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

async function readBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const server = createServer(async (req, res) => {
  try {
    const method = req.method ?? 'GET'
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { status: 'ok', app: 'WeChatFlow V1', storage: 'sqlite', upstreamRenderer: 'pending-bootstrap' })
    }

    if (method === 'POST' && url.pathname === '/api/v1/documents') {
      const body = await readBody(req)
      if (!body.title || typeof body.title !== 'string') return json(res, 400, { error: 'title is required' })
      return json(res, 201, service.createDocument({ title: body.title, markdown: body.markdown, authorLabel: body.authorLabel }))
    }

    const docMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)$/)
    if (method === 'GET' && docMatch) return json(res, 200, service.getDocumentView(docMatch[1]))

    const revisionsMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/revisions$/)
    if (revisionsMatch && method === 'GET') return json(res, 200, { items: service.store.listRevisions(revisionsMatch[1]) })
    if (revisionsMatch && method === 'POST') {
      const body = await readBody(req)
      if (typeof body.title !== 'string' || typeof body.markdown !== 'string') return json(res, 400, { error: 'title and markdown are required' })
      return json(res, 201, service.saveRevision(revisionsMatch[1], {
        title: body.title, markdown: body.markdown, authorType: body.authorType, authorLabel: body.authorLabel, reason: body.reason,
      }))
    }

    const snapshotMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/snapshots$/)
    if (snapshotMatch && method === 'POST') {
      const body = await readBody(req)
      if (typeof body.revisionId !== 'string' || typeof body.html !== 'string' || typeof body.profile !== 'object') return json(res, 400, { error: 'revisionId, profile and html are required' })
      return json(res, 201, service.createRenderSnapshot(snapshotMatch[1], body.revisionId, body.profile, body.html))
    }

    const remoteMatch = url.pathname.match(/^\/api\/v1\/documents\/([^/]+)\/remote-drafts$/)
    if (remoteMatch && method === 'POST') {
      const body = await readBody(req)
      if (typeof body.accountId !== 'string' || typeof body.mediaId !== 'string' || typeof body.snapshotId !== 'string') return json(res, 400, { error: 'accountId, mediaId and snapshotId are required' })
      return json(res, 201, service.recordWechatDraft({ documentId: remoteMatch[1], accountId: body.accountId, mediaId: body.mediaId, snapshotId: body.snapshotId }))
    }

    return json(res, 404, { error: 'not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json(res, message.startsWith('Document not found') ? 404 : 500, { error: message })
  }
})

const port = Number(process.env.PORT ?? 8787)
server.listen(port, '127.0.0.1', () => {
  console.log(`WeChatFlow V1 API listening on http://127.0.0.1:${port}`)
  console.log(`SQLite: ${dbFile}`)
})
