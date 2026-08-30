import { DatabaseSync } from 'node:sqlite'
import type { DocumentRecord, RemoteDraftRecord, RenderSnapshotRecord, RevisionRecord } from '../../domain/src/types.ts'

export class SqliteStore {
  readonly db: DatabaseSync

  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL,
        current_revision_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revisions (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, sequence INTEGER NOT NULL,
        title TEXT NOT NULL, markdown TEXT NOT NULL, author_type TEXT NOT NULL,
        author_label TEXT NOT NULL, reason TEXT NOT NULL, content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(document_id, sequence), FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS render_snapshots (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, revision_id TEXT NOT NULL,
        profile_json TEXT NOT NULL, html TEXT NOT NULL, html_hash TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(revision_id) REFERENCES revisions(id)
      );
      CREATE TABLE IF NOT EXISTS remote_drafts (
        id TEXT PRIMARY KEY, document_id TEXT NOT NULL, account_id TEXT NOT NULL, media_id TEXT NOT NULL,
        revision_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, synced_at TEXT NOT NULL,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY(revision_id) REFERENCES revisions(id),
        FOREIGN KEY(snapshot_id) REFERENCES render_snapshots(id)
      );
      CREATE INDEX IF NOT EXISTS idx_revisions_document_sequence ON revisions(document_id, sequence DESC);
      CREATE INDEX IF NOT EXISTS idx_remote_drafts_document_synced ON remote_drafts(document_id, synced_at DESC);
    `)
  }

  insertDocument(row: DocumentRecord): void {
    this.db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)`).run(
      row.id, row.title, row.status, row.currentRevisionId, row.createdAt, row.updatedAt,
    )
  }

  updateDocumentPointer(documentId: string, title: string, revisionId: string, updatedAt: string): void {
    this.db.prepare(`UPDATE documents SET title=?, current_revision_id=?, updated_at=? WHERE id=?`).run(title, revisionId, updatedAt, documentId)
  }

  insertRevision(row: RevisionRecord): void {
    this.db.prepare(`INSERT INTO revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.documentId, row.sequence, row.title, row.markdown, row.authorType, row.authorLabel, row.reason, row.contentHash, row.createdAt,
    )
  }

  getDocument(id: string): DocumentRecord | null {
    const row = this.db.prepare(`SELECT id,title,status,current_revision_id,created_at,updated_at FROM documents WHERE id=?`).get(id) as any
    return row ? { id: row.id, title: row.title, status: row.status, currentRevisionId: row.current_revision_id, createdAt: row.created_at, updatedAt: row.updated_at } : null
  }

  getRevision(id: string): RevisionRecord | null {
    const row = this.db.prepare(`SELECT * FROM revisions WHERE id=?`).get(id) as any
    return row ? { id: row.id, documentId: row.document_id, sequence: row.sequence, title: row.title, markdown: row.markdown, authorType: row.author_type, authorLabel: row.author_label, reason: row.reason, contentHash: row.content_hash, createdAt: row.created_at } : null
  }

  nextRevisionSequence(documentId: string): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(sequence),0)+1 AS next FROM revisions WHERE document_id=?`).get(documentId) as any
    return Number(row.next)
  }

  listRevisions(documentId: string): RevisionRecord[] {
    return (this.db.prepare(`SELECT id FROM revisions WHERE document_id=? ORDER BY sequence DESC`).all(documentId) as any[]).map(r => this.getRevision(r.id)!)
  }

  insertSnapshot(row: RenderSnapshotRecord): void {
    this.db.prepare(`INSERT INTO render_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.documentId, row.revisionId, row.profileJson, row.html, row.htmlHash, row.createdAt,
    )
  }

  getSnapshot(id: string): RenderSnapshotRecord | null {
    const row = this.db.prepare(`SELECT * FROM render_snapshots WHERE id=?`).get(id) as any
    return row ? { id: row.id, documentId: row.document_id, revisionId: row.revision_id, profileJson: row.profile_json, html: row.html, htmlHash: row.html_hash, createdAt: row.created_at } : null
  }

  insertRemoteDraft(row: RemoteDraftRecord): void {
    this.db.prepare(`INSERT INTO remote_drafts VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      row.id, row.documentId, row.accountId, row.mediaId, row.revisionId, row.snapshotId, row.syncedAt,
    )
  }

  latestRemoteDraft(documentId: string): RemoteDraftRecord | null {
    const row = this.db.prepare(`SELECT * FROM remote_drafts WHERE document_id=? ORDER BY synced_at DESC, rowid DESC LIMIT 1`).get(documentId) as any
    return row ? { id: row.id, documentId: row.document_id, accountId: row.account_id, mediaId: row.media_id, revisionId: row.revision_id, snapshotId: row.snapshot_id, syncedAt: row.synced_at } : null
  }
}
