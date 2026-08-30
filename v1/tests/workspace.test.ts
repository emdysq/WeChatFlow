import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { DocumentService } from '../packages/core/src/document-service.ts'
import { DoocsRendererAdapter } from '../packages/renderer-doocs/src/adapter.ts'
import { SqliteStore } from '../packages/storage/src/sqlite-store.ts'

test('working copy autosave does not create immutable revisions', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: 'A', markdown: '# A\nold' })
  const updated = service.saveWorkingCopy(created.document.id, {
    title: 'A', markdown: '# A\nnew', expectedVersion: created.workingCopy.version,
  })
  assert.equal(updated.workingCopyDirty, true)
  assert.equal(updated.currentRevision.sequence, 1)
  assert.equal(service.store.listRevisions(created.document.id).length, 1)

  const committed = service.commitWorkingCopy(created.document.id, { reason: 'manual checkpoint' })
  assert.equal(committed.currentRevision.sequence, 2)
  assert.equal(committed.workingCopyDirty, false)
  assert.equal(service.store.listRevisions(created.document.id).length, 2)
})

test('working copy uses optimistic concurrency so an Agent cannot silently overwrite Web edits', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: 'A', markdown: '# A' })
  const version = created.workingCopy.version
  service.saveWorkingCopy(created.document.id, { title: 'Web', markdown: '# Web', expectedVersion: version })
  assert.throws(
    () => service.saveWorkingCopy(created.document.id, { title: 'Agent', markdown: '# Agent', expectedVersion: version }),
    (error: any) => error.code === 'WORKING_COPY_CONFLICT' && error.actualVersion === version + 1,
  )
})

test('dirty working copy immediately marks a previously synced document OUTDATED', () => {
  const service = new DocumentService(new SqliteStore())
  const created = service.createDocument({ title: 'A', markdown: '# A' })
  const snapshot = service.createRenderSnapshot(created.document.id, created.currentRevision.id, { theme: 'grace' }, '<h1>A</h1>')
  const synced = service.recordWechatDraft({ documentId: created.document.id, accountId: 'main', mediaId: 'media', snapshotId: snapshot.id })
  assert.equal(synced.syncState, 'SYNCED')

  const edited = service.saveWorkingCopy(created.document.id, {
    title: 'A', markdown: '# A\nunsaved checkpoint content', expectedVersion: synced.workingCopy.version,
  })
  assert.equal(edited.currentRevision.sequence, 1)
  assert.equal(edited.syncState, 'OUTDATED')
})

test('restore creates a new immutable revision instead of deleting later history', () => {
  const service = new DocumentService(new SqliteStore())
  const first = service.createDocument({ title: 'v1', markdown: 'one' })
  const second = service.saveRevision(first.document.id, { title: 'v2', markdown: 'two' })
  assert.equal(second.currentRevision.sequence, 2)

  const restored = service.restoreRevision(first.document.id, first.currentRevision.id)
  assert.equal(restored.currentRevision.sequence, 3)
  assert.equal(restored.currentRevision.markdown, 'one')
  assert.match(restored.currentRevision.reason, /restore revision v1/)
  assert.deepEqual(service.store.listRevisions(first.document.id).map(r => r.sequence), [3, 2, 1])
})

test('diff can compare an immutable revision with the current working copy', () => {
  const service = new DocumentService(new SqliteStore())
  const first = service.createDocument({ title: 'A', markdown: 'line 1\nline 2\nline 3' })
  service.saveWorkingCopy(first.document.id, {
    title: 'A changed', markdown: 'line 1\nline changed\nline 3\nline 4', expectedVersion: first.workingCopy.version,
  })
  const diff = service.getDiff(first.document.id, first.currentRevision.id, 'working')
  assert.equal(diff.titleChanged, true)
  assert.equal(diff.lines.some(line => line.type === 'remove' && line.text === 'line 2'), true)
  assert.equal(diff.lines.some(line => line.type === 'add' && line.text === 'line changed'), true)
  assert.equal(diff.lines.some(line => line.type === 'add' && line.text === 'line 4'), true)
})

test('working copy survives service restart because SQLite is the source of truth', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wechatflow-v1-'))
  const file = join(dir, 'workspace.db')
  try {
    const store1 = new SqliteStore(file)
    const service1 = new DocumentService(store1)
    const created = service1.createDocument({ title: 'Persistent', markdown: '# Persistent' })
    service1.saveWorkingCopy(created.document.id, {
      title: 'Persistent changed', markdown: '# Persistent\nnot checkpointed', expectedVersion: created.workingCopy.version,
    })
    store1.db.close()

    const store2 = new SqliteStore(file)
    const service2 = new DocumentService(store2)
    const loaded = service2.getDocumentView(created.document.id)
    assert.equal(loaded.workingCopy.title, 'Persistent changed')
    assert.match(loaded.workingCopy.markdown, /not checkpointed/)
    assert.equal(loaded.workingCopyDirty, true)
    assert.equal(loaded.currentRevision.sequence, 1)
    store2.db.close()
  }
  finally { rmSync(dir, { recursive: true, force: true }) }
})

test('renderer status explains that upstream bootstrap is missing instead of pretending preview is final', () => {
  const adapter = new DoocsRendererAdapter({ v1Root: '/definitely/missing/wechatflow-v1' })
  const status = adapter.status()
  assert.equal(status.available, false)
  assert.equal(status.blockers.includes('UPSTREAM_NOT_BOOTSTRAPPED'), true)
})

test('schema v2 migration backfills working copies for a Foundation database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wechatflow-v1-migration-'))
  const file = join(dir, 'legacy.db')
  try {
    const legacy = new DatabaseSync(file)
    legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
        current_revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE revisions (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        title TEXT NOT NULL, markdown TEXT NOT NULL, author_type TEXT NOT NULL,
        author_label TEXT NOT NULL, reason TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(document_id, sequence), FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE TABLE render_snapshots (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, revision_id TEXT NOT NULL,
        profile_json TEXT NOT NULL, html TEXT NOT NULL, html_hash TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE remote_drafts (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, account_id TEXT NOT NULL, media_id TEXT NOT NULL,
        revision_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, synced_at TEXT NOT NULL
      );
      INSERT INTO documents VALUES ('doc-1','Legacy','EDITING','rev-1','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z');
      INSERT INTO revisions VALUES ('rev-1','doc-1',1,'Legacy','# Legacy','USER','user','create','hash-legacy','2026-01-01T00:00:00Z');
    `)
    legacy.close()

    const migrated = new SqliteStore(file)
    const wc = migrated.getWorkingCopy('doc-1')
    assert.equal(wc?.baseRevisionId, 'rev-1')
    assert.equal(wc?.title, 'Legacy')
    const version = migrated.db.prepare('PRAGMA user_version').get() as { user_version: number }
    assert.equal(version.user_version, 2)
    migrated.db.close()
  }
  finally { rmSync(dir, { recursive: true, force: true }) }
})
