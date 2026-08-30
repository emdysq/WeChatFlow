import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentService } from '../packages/core/src/document-service.ts'
import { SqliteStore } from '../packages/storage/src/sqlite-store.ts'

test('document remains editable after a remote draft is recorded', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: '第一稿', markdown: '# 第一稿\n正文' })
  const snapshot = service.createRenderSnapshot(created.document.id, created.currentRevision.id, { theme: 'grace' }, '<h1>第一稿</h1><p>正文</p>')
  const synced = service.recordWechatDraft({ documentId: created.document.id, accountId: 'main', mediaId: 'media-001', snapshotId: snapshot.id })
  assert.equal(synced.syncState, 'SYNCED')

  const edited = service.saveRevision(created.document.id, { title: '第一稿（修订）', markdown: '# 第一稿（修订）\n正文修订' })
  assert.equal(edited.currentRevision.sequence, 2)
  assert.equal(edited.syncState, 'OUTDATED')
  assert.equal(edited.latestRemoteDraft?.revisionId, created.currentRevision.id)
})

test('unchanged content does not create a useless revision', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: 'A', markdown: '# A' })
  const same = service.saveRevision(created.document.id, { title: 'A', markdown: '# A' })
  assert.equal(same.currentRevision.sequence, 1)
  assert.equal(service.store.listRevisions(created.document.id).length, 1)
})

test('render snapshot is tied to an immutable revision', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: 'A', markdown: '# A' })
  const snapshot = service.createRenderSnapshot(created.document.id, created.currentRevision.id, { theme: 'minimal', primaryColor: '#0F4C81' }, '<h1>A</h1>')
  service.saveRevision(created.document.id, { title: 'B', markdown: '# B' })
  const stored = service.store.getSnapshot(snapshot.id)!
  assert.equal(stored.revisionId, created.currentRevision.id)
  assert.equal(stored.html, '<h1>A</h1>')
})
