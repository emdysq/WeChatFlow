import { DatabaseSync } from 'node:sqlite'
import type {
  DocumentRecord,
  DocumentStatus,
  RemoteDraftRecord,
  RenderSnapshotRecord,
  RevisionRecord,
  WorkingCopyRecord,
} from '../../domain/src/types.ts'

const LATEST_SCHEMA_VERSION = 2

export class SqliteStore {
  readonly db: DatabaseSync

  constructor(filename = ':memory:') {
    this.db = new DatabaseSync(filename)
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.migrate()
  }

  migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    let version = Number(row.user_version ?? 0)

    if (version < 1) {
      this.db.exec('BEGIN')
      try {
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
        this.db.exec('PRAGMA user_version = 1;')
        this.db.exec('COMMIT')
        version = 1
      }
      catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }

    if (version < 2) {
      this.db.exec('BEGIN')
      try {
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS document_working_copies (
            document_id TEXT PRIMARY KEY,
            base_revision_id TEXT NOT NULL,
            title TEXT NOT NULL,
            markdown TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE,
            FOREIGN KEY(base_revision_id) REFERENCES revisions(id)
          );
          CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
        `)

        // Backfill working copies for databases created by the Foundation build.
        this.db.exec(`
          INSERT OR IGNORE INTO document_working_copies
            (document_id, base_revision_id, title, markdown, content_hash, version, updated_at)
          SELECT d.id, r.id, r.title, r.markdown, r.content_hash, 1, d.updated_at
          FROM documents d
          JOIN revisions r ON r.id = d.current_revision_id;
        `)
        this.db.exec('PRAGMA user_version = 2;')
        this.db.exec('COMMIT')
        version = 2
      }
      catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
    }

    if (version !== LATEST_SCHEMA_VERSION)
      throw new Error(`Unsupported database schema version: ${version}`)
  }

  insertDocument(row: DocumentRecord): void {
    this.db.prepare(`INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?)`).run(
      row.id, row.title, row.status, row.currentRevisionId, row.createdAt, row.updatedAt,
    )
  }

  updateDocumentPointer(documentId: string, title: string, revisionId: string, updatedAt: string): void {
    this.db.prepare(`UPDATE documents SET title=?, current_revision_id=?, updated_at=? WHERE id=?`).run(title, revisionId, updatedAt, documentId)
  }

  updateDocumentTouched(documentId: string, updatedAt: string): void {
    this.db.prepare(`UPDATE documents SET updated_at=? WHERE id=?`).run(updatedAt, documentId)
  }

  updateDocumentStatus(documentId: string, status: DocumentStatus, updatedAt: string): void {
    this.db.prepare(`UPDATE documents SET status=?, updated_at=? WHERE id=?`).run(status, updatedAt, documentId)
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

  listDocuments(status?: DocumentStatus): DocumentRecord[] {
    const rows = status
      ? this.db.prepare(`SELECT id FROM documents WHERE status=? ORDER BY updated_at DESC`).all(status) as any[]
      : this.db.prepare(`SELECT id FROM documents ORDER BY updated_at DESC`).all() as any[]
    return rows.map(row => this.getDocument(row.id)!).filter(Boolean)
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

  insertWorkingCopy(row: WorkingCopyRecord): void {
    this.db.prepare(`
      INSERT INTO document_working_copies
        (document_id, base_revision_id, title, markdown, content_hash, version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(row.documentId, row.baseRevisionId, row.title, row.markdown, row.contentHash, row.version, row.updatedAt)
  }

  getWorkingCopy(documentId: string): WorkingCopyRecord | null {
    const row = this.db.prepare(`SELECT * FROM document_working_copies WHERE document_id=?`).get(documentId) as any
    return row ? {
      documentId: row.document_id,
      baseRevisionId: row.base_revision_id,
      title: row.title,
      markdown: row.markdown,
      contentHash: row.content_hash,
      version: Number(row.version),
      updatedAt: row.updated_at,
    } : null
  }

  updateWorkingCopy(input: {
    documentId: string
    title: string
    markdown: string
    contentHash: string
    updatedAt: string
    expectedVersion?: number
  }): WorkingCopyRecord {
    const current = this.getWorkingCopy(input.documentId)
    if (!current)
      throw new Error(`Working copy not found: ${input.documentId}`)

    if (input.expectedVersion !== undefined && current.version !== input.expectedVersion) {
      const error = new Error(`Working copy version conflict: expected ${input.expectedVersion}, actual ${current.version}`)
      ;(error as any).code = 'WORKING_COPY_CONFLICT'
      ;(error as any).actualVersion = current.version
      throw error
    }

    if (current.contentHash === input.contentHash && current.title === input.title && current.markdown === input.markdown)
      return current

    const nextVersion = current.version + 1
    this.db.prepare(`
      UPDATE document_working_copies
      SET title=?, markdown=?, content_hash=?, version=?, updated_at=?
      WHERE document_id=?
    `).run(input.title, input.markdown, input.contentHash, nextVersion, input.updatedAt, input.documentId)
    this.updateDocumentTouched(input.documentId, input.updatedAt)
    return this.getWorkingCopy(input.documentId)!
  }

  resetWorkingCopyToRevision(documentId: string, revision: RevisionRecord, updatedAt: string): WorkingCopyRecord {
    const current = this.getWorkingCopy(documentId)
    if (!current) {
      this.insertWorkingCopy({
        documentId,
        baseRevisionId: revision.id,
        title: revision.title,
        markdown: revision.markdown,
        contentHash: revision.contentHash,
        version: 1,
        updatedAt,
      })
    }
    else {
      this.db.prepare(`
        UPDATE document_working_copies
        SET base_revision_id=?, title=?, markdown=?, content_hash=?, version=?, updated_at=?
        WHERE document_id=?
      `).run(revision.id, revision.title, revision.markdown, revision.contentHash, current.version + 1, updatedAt, documentId)
    }
    this.updateDocumentTouched(documentId, updatedAt)
    return this.getWorkingCopy(documentId)!
  }

  markWorkingCopyCommitted(documentId: string, revision: RevisionRecord): WorkingCopyRecord {
    const current = this.getWorkingCopy(documentId)
    if (!current)
      throw new Error(`Working copy not found: ${documentId}`)
    this.db.prepare(`
      UPDATE document_working_copies
      SET base_revision_id=?, title=?, markdown=?, content_hash=?, version=?, updated_at=?
      WHERE document_id=?
    `).run(revision.id, revision.title, revision.markdown, revision.contentHash, current.version + 1, revision.createdAt, documentId)
    return this.getWorkingCopy(documentId)!
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

  listSnapshots(documentId: string): RenderSnapshotRecord[] {
    const rows = this.db.prepare(`SELECT id FROM render_snapshots WHERE document_id=? ORDER BY created_at DESC, rowid DESC`).all(documentId) as any[]
    return rows.map(row => this.getSnapshot(row.id)!).filter(Boolean)
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

  listRemoteDrafts(documentId: string): RemoteDraftRecord[] {
    const rows = this.db.prepare(`SELECT * FROM remote_drafts WHERE document_id=? ORDER BY synced_at DESC, rowid DESC`).all(documentId) as any[]
    return rows.map(row => ({
      id: row.id,
      documentId: row.document_id,
      accountId: row.account_id,
      mediaId: row.media_id,
      revisionId: row.revision_id,
      snapshotId: row.snapshot_id,
      syncedAt: row.synced_at,
    }))
  }
}
