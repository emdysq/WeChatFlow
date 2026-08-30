import assert from 'node:assert/strict'
import test from 'node:test'
import { createApiServer } from '../apps/api/src/server.ts'

async function withServer(run: (base: string) => Promise<void>) {
  const { server } = createApiServer({ dbFile: ':memory:' })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('unexpected address')
  try { await run(`http://127.0.0.1:${address.port}`) }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

async function json(base: string, path: string, init?: RequestInit) {
  const response = await fetch(base + path, {
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  return { response, body: await response.json() }
}

test('workspace HTTP API supports create -> autosave -> checkpoint -> history -> diff', async () => {
  await withServer(async (base) => {
    const created = await json(base, '/api/v1/documents', { method: 'POST', body: JSON.stringify({ title: 'API draft', markdown: '# API draft\nold' }) })
    assert.equal(created.response.status, 201)
    const id = created.body.document.id
    const version = created.body.workingCopy.version

    const saved = await json(base, `/api/v1/documents/${id}/working-copy`, {
      method: 'PATCH', body: JSON.stringify({ title: 'API draft', markdown: '# API draft\nnew', expectedVersion: version }),
    })
    assert.equal(saved.body.workingCopyDirty, true)
    assert.equal(saved.body.currentRevision.sequence, 1)

    const committed = await json(base, `/api/v1/documents/${id}/commit`, {
      method: 'POST', body: JSON.stringify({ reason: 'test checkpoint', authorLabel: 'test' }),
    })
    assert.equal(committed.body.currentRevision.sequence, 2)
    assert.equal(committed.body.workingCopyDirty, false)

    const history = await json(base, `/api/v1/documents/${id}/revisions`)
    assert.deepEqual(history.body.items.map((r: any) => r.sequence), [2, 1])

    const diff = await json(base, `/api/v1/documents/${id}/diff?from=${history.body.items[1].id}&to=${history.body.items[0].id}`)
    assert.equal(diff.body.lines.some((line: any) => line.type === 'add' && line.text === 'new'), true)
  })
})

test('stale working-copy version returns 409 instead of overwriting newer content', async () => {
  await withServer(async (base) => {
    const created = await json(base, '/api/v1/documents', { method: 'POST', body: JSON.stringify({ title: 'Conflict' }) })
    const id = created.body.document.id
    const version = created.body.workingCopy.version
    await json(base, `/api/v1/documents/${id}/working-copy`, {
      method: 'PATCH', body: JSON.stringify({ title: 'First', markdown: '# First', expectedVersion: version }),
    })
    const conflict = await json(base, `/api/v1/documents/${id}/working-copy`, {
      method: 'PATCH', body: JSON.stringify({ title: 'Second', markdown: '# Second', expectedVersion: version }),
    })
    assert.equal(conflict.response.status, 409)
    assert.equal(conflict.body.error.code, 'WORKING_COPY_CONFLICT')
  })
})

test('web workspace and renderer discovery are served by the same local process', async () => {
  await withServer(async (base) => {
    const home = await fetch(base + '/')
    assert.equal(home.status, 200)
    assert.match(await home.text(), /WeChatFlow V1/)

    const renderer = await json(base, '/api/v1/renderer')
    assert.equal(renderer.body.id, 'doocs-md')
    assert.equal(renderer.body.available, false)

    const health = await json(base, '/health')
    assert.equal(health.body.schemaVersion, 2)
  })
})
