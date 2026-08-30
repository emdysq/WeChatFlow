import { createHash, randomUUID } from 'node:crypto'
import type { DocumentView, RenderProfile, RenderSnapshotRecord, RevisionRecord } from '../../domain/src/types.ts'
import { SqliteStore } from '../../storage/src/sqlite-store.ts'

function now(): string { return new Date().toISOString() }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

export class DocumentService {
  readonly store: SqliteStore

  constructor(store: SqliteStore) {
    this.store = store
  }

  createDocument(input: { title: string; markdown?: string; authorLabel?: string }): DocumentView {
    const documentId = randomUUID()
    const revisionId = randomUUID()
    const createdAt = now()
    const markdown = input.markdown ?? `# ${input.title}\n`
    const revision: RevisionRecord = {
      id: revisionId, documentId, sequence: 1, title: input.title, markdown,
      authorType: 'USER', authorLabel: input.authorLabel ?? 'user', reason: 'create document',
      contentHash: sha256(`${input.title}\n${markdown}`), createdAt,
    }
    this.store.db.exec('BEGIN')
    try {
      this.store.insertDocument({ id: documentId, title: input.title, status: 'EDITING', currentRevisionId: revisionId, createdAt, updatedAt: createdAt })
      this.store.insertRevision(revision)
      this.store.db.exec('COMMIT')
    } catch (error) {
      this.store.db.exec('ROLLBACK')
      throw error
    }
    return this.getDocumentView(documentId)
  }

  saveRevision(documentId: string, input: {
    title: string; markdown: string; authorType?: RevisionRecord['authorType']; authorLabel?: string; reason?: string
  }): DocumentView {
    const doc = this.store.getDocument(documentId)
    if (!doc) throw new Error(`Document not found: ${documentId}`)
    const current = this.store.getRevision(doc.currentRevisionId)!
    const hash = sha256(`${input.title}\n${input.markdown}`)
    if (hash === current.contentHash) return this.getDocumentView(documentId)

    const revision: RevisionRecord = {
      id: randomUUID(), documentId, sequence: this.store.nextRevisionSequence(documentId),
      title: input.title, markdown: input.markdown, authorType: input.authorType ?? 'USER',
      authorLabel: input.authorLabel ?? 'user', reason: input.reason ?? 'edit', contentHash: hash, createdAt: now(),
    }
    this.store.db.exec('BEGIN')
    try {
      this.store.insertRevision(revision)
      this.store.updateDocumentPointer(documentId, revision.title, revision.id, revision.createdAt)
      this.store.db.exec('COMMIT')
    } catch (error) {
      this.store.db.exec('ROLLBACK')
      throw error
    }
    return this.getDocumentView(documentId)
  }

  createRenderSnapshot(documentId: string, revisionId: string, profile: RenderProfile, html: string): RenderSnapshotRecord {
    const revision = this.store.getRevision(revisionId)
    if (!revision || revision.documentId !== documentId) throw new Error('Revision does not belong to document')
    const row: RenderSnapshotRecord = {
      id: randomUUID(), documentId, revisionId, profileJson: JSON.stringify(profile), html, htmlHash: sha256(html), createdAt: now(),
    }
    this.store.insertSnapshot(row)
    return row
  }

  recordWechatDraft(input: { documentId: string; accountId: string; mediaId: string; snapshotId: string }): DocumentView {
    const snapshot = this.store.getSnapshot(input.snapshotId)
    if (!snapshot || snapshot.documentId !== input.documentId) throw new Error('Snapshot does not belong to document')
    this.store.insertRemoteDraft({
      id: randomUUID(), documentId: input.documentId, accountId: input.accountId, mediaId: input.mediaId,
      revisionId: snapshot.revisionId, snapshotId: snapshot.id, syncedAt: now(),
    })
    return this.getDocumentView(input.documentId)
  }

  getDocumentView(documentId: string): DocumentView {
    const document = this.store.getDocument(documentId)
    if (!document) throw new Error(`Document not found: ${documentId}`)
    const currentRevision = this.store.getRevision(document.currentRevisionId)
    if (!currentRevision) throw new Error(`Broken current revision pointer: ${document.currentRevisionId}`)
    const latestRemoteDraft = this.store.latestRemoteDraft(documentId)
    const syncState = !latestRemoteDraft ? 'NEVER_SYNCED' : latestRemoteDraft.revisionId === currentRevision.id ? 'SYNCED' : 'OUTDATED'
    return { document, currentRevision, latestRemoteDraft, syncState }
  }
}
