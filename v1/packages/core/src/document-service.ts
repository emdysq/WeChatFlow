import { createHash, randomUUID } from 'node:crypto'
import type {
  DocumentListItem,
  DocumentStatus,
  DocumentView,
  RenderProfile,
  RenderSnapshotRecord,
  RevisionAuthorType,
  RevisionDiff,
  RevisionRecord,
  WorkingCopyRecord,
} from '../../domain/src/types.ts'
import { SqliteStore } from '../../storage/src/sqlite-store.ts'
import { diffLines } from './diff.ts'

function now(): string { return new Date().toISOString() }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }
function contentHash(title: string, markdown: string): string { return sha256(`${title}\n${markdown}`) }

export class DocumentService {
  readonly store: SqliteStore

  constructor(store: SqliteStore) {
    this.store = store
  }

  createDocument(input: { title: string; markdown?: string; authorLabel?: string }): DocumentView {
    const title = input.title.trim()
    if (!title) throw new Error('Document title is required')

    const documentId = randomUUID()
    const revisionId = randomUUID()
    const createdAt = now()
    const markdown = input.markdown ?? `# ${title}\n`
    const hash = contentHash(title, markdown)
    const revision: RevisionRecord = {
      id: revisionId,
      documentId,
      sequence: 1,
      title,
      markdown,
      authorType: 'USER',
      authorLabel: input.authorLabel ?? 'user',
      reason: 'create document',
      contentHash: hash,
      createdAt,
    }
    const workingCopy: WorkingCopyRecord = {
      documentId,
      baseRevisionId: revisionId,
      title,
      markdown,
      contentHash: hash,
      version: 1,
      updatedAt: createdAt,
    }

    // documents.current_revision_id intentionally has no FK so the initial
    // document/revision can be inserted atomically without an insert cycle.
    this.store.db.exec('BEGIN')
    try {
      this.store.insertDocument({ id: documentId, title, status: 'EDITING', currentRevisionId: revisionId, createdAt, updatedAt: createdAt })
      this.store.insertRevision(revision)
      this.store.insertWorkingCopy(workingCopy)
      this.store.db.exec('COMMIT')
    }
    catch (error) {
      this.store.db.exec('ROLLBACK')
      throw error
    }
    return this.getDocumentView(documentId)
  }

  listDocuments(status: DocumentStatus = 'EDITING'): DocumentListItem[] {
    return this.store.listDocuments(status).map((doc) => {
      const view = this.getDocumentView(doc.id)
      const remoteRevision = view.latestRemoteDraft ? this.store.getRevision(view.latestRemoteDraft.revisionId) : null
      return {
        documentId: doc.id,
        title: view.workingCopy.title,
        status: doc.status,
        currentRevisionSequence: view.currentRevision.sequence,
        workingCopyVersion: view.workingCopy.version,
        workingCopyDirty: view.workingCopyDirty,
        syncState: view.syncState,
        remoteRevisionSequence: remoteRevision?.sequence ?? null,
        updatedAt: view.workingCopy.updatedAt,
      }
    })
  }

  saveWorkingCopy(documentId: string, input: {
    title: string
    markdown: string
    expectedVersion?: number
  }): DocumentView {
    this.assertDocument(documentId)
    const title = input.title.trim()
    if (!title) throw new Error('Document title is required')
    this.store.updateWorkingCopy({
      documentId,
      title,
      markdown: input.markdown,
      contentHash: contentHash(title, input.markdown),
      updatedAt: now(),
      expectedVersion: input.expectedVersion,
    })
    return this.getDocumentView(documentId)
  }

  /**
   * Convert the durable working copy into an immutable revision. This is a
   * checkpoint, not an autosave primitive; unchanged content is a no-op.
   */
  commitWorkingCopy(documentId: string, input: {
    authorType?: RevisionAuthorType
    authorLabel?: string
    reason?: string
  } = {}): DocumentView {
    const doc = this.assertDocument(documentId)
    const current = this.store.getRevision(doc.currentRevisionId)!
    const working = this.requireWorkingCopy(documentId)

    if (working.contentHash === current.contentHash) {
      if (working.baseRevisionId !== current.id)
        this.store.markWorkingCopyCommitted(documentId, current)
      return this.getDocumentView(documentId)
    }

    const revision: RevisionRecord = {
      id: randomUUID(),
      documentId,
      sequence: this.store.nextRevisionSequence(documentId),
      title: working.title,
      markdown: working.markdown,
      authorType: input.authorType ?? 'USER',
      authorLabel: input.authorLabel ?? 'user',
      reason: input.reason ?? 'checkpoint',
      contentHash: working.contentHash,
      createdAt: now(),
    }

    this.store.db.exec('BEGIN')
    try {
      this.store.insertRevision(revision)
      this.store.updateDocumentPointer(documentId, revision.title, revision.id, revision.createdAt)
      this.store.markWorkingCopyCommitted(documentId, revision)
      this.store.db.exec('COMMIT')
    }
    catch (error) {
      this.store.db.exec('ROLLBACK')
      throw error
    }
    return this.getDocumentView(documentId)
  }

  /** Compatibility helper for non-Web callers. Saves the working copy then checkpoints it. */
  saveRevision(documentId: string, input: {
    title: string
    markdown: string
    authorType?: RevisionAuthorType
    authorLabel?: string
    reason?: string
  }): DocumentView {
    const view = this.getDocumentView(documentId)
    this.saveWorkingCopy(documentId, { title: input.title, markdown: input.markdown, expectedVersion: view.workingCopy.version })
    return this.commitWorkingCopy(documentId, input)
  }

  restoreRevision(documentId: string, revisionId: string, input: { authorLabel?: string } = {}): DocumentView {
    const doc = this.assertDocument(documentId)
    const source = this.store.getRevision(revisionId)
    if (!source || source.documentId !== documentId)
      throw new Error('Revision does not belong to document')

    const current = this.store.getRevision(doc.currentRevisionId)!
    if (source.id === current.id && !this.getDocumentView(documentId).workingCopyDirty)
      return this.getDocumentView(documentId)

    const restored: RevisionRecord = {
      id: randomUUID(),
      documentId,
      sequence: this.store.nextRevisionSequence(documentId),
      title: source.title,
      markdown: source.markdown,
      authorType: 'USER',
      authorLabel: input.authorLabel ?? 'user',
      reason: `restore revision v${source.sequence}`,
      contentHash: source.contentHash,
      createdAt: now(),
    }

    this.store.db.exec('BEGIN')
    try {
      this.store.insertRevision(restored)
      this.store.updateDocumentPointer(documentId, restored.title, restored.id, restored.createdAt)
      this.store.resetWorkingCopyToRevision(documentId, restored, restored.createdAt)
      this.store.db.exec('COMMIT')
    }
    catch (error) {
      this.store.db.exec('ROLLBACK')
      throw error
    }
    return this.getDocumentView(documentId)
  }

  setDocumentStatus(documentId: string, status: DocumentStatus): DocumentView {
    this.assertDocument(documentId)
    this.store.updateDocumentStatus(documentId, status, now())
    return this.getDocumentView(documentId)
  }

  getDiff(documentId: string, fromRevisionId: string, to: string): RevisionDiff {
    this.assertDocument(documentId)
    const from = this.store.getRevision(fromRevisionId)
    if (!from || from.documentId !== documentId)
      throw new Error('From revision does not belong to document')

    if (to === 'working') {
      const working = this.requireWorkingCopy(documentId)
      return {
        from: { id: from.id, sequence: from.sequence, title: from.title },
        to: { id: `working:${working.version}`, sequence: 'working', title: working.title },
        titleChanged: from.title !== working.title,
        lines: diffLines(from.markdown, working.markdown),
      }
    }

    const toRevision = this.store.getRevision(to)
    if (!toRevision || toRevision.documentId !== documentId)
      throw new Error('To revision does not belong to document')
    return {
      from: { id: from.id, sequence: from.sequence, title: from.title },
      to: { id: toRevision.id, sequence: toRevision.sequence, title: toRevision.title },
      titleChanged: from.title !== toRevision.title,
      lines: diffLines(from.markdown, toRevision.markdown),
    }
  }

  createRenderSnapshot(documentId: string, revisionId: string, profile: RenderProfile, html: string): RenderSnapshotRecord {
    const revision = this.store.getRevision(revisionId)
    if (!revision || revision.documentId !== documentId)
      throw new Error('Revision does not belong to document')
    if (!html.trim()) throw new Error('Rendered HTML is required')
    const row: RenderSnapshotRecord = {
      id: randomUUID(),
      documentId,
      revisionId,
      profileJson: JSON.stringify(profile),
      html,
      htmlHash: sha256(html),
      createdAt: now(),
    }
    this.store.insertSnapshot(row)
    return row
  }

  recordWechatDraft(input: { documentId: string; accountId: string; mediaId: string; snapshotId: string }): DocumentView {
    const snapshot = this.store.getSnapshot(input.snapshotId)
    if (!snapshot || snapshot.documentId !== input.documentId)
      throw new Error('Snapshot does not belong to document')
    this.store.insertRemoteDraft({
      id: randomUUID(),
      documentId: input.documentId,
      accountId: input.accountId,
      mediaId: input.mediaId,
      revisionId: snapshot.revisionId,
      snapshotId: snapshot.id,
      syncedAt: now(),
    })
    return this.getDocumentView(input.documentId)
  }

  getDocumentView(documentId: string): DocumentView {
    const document = this.store.getDocument(documentId)
    if (!document) throw new Error(`Document not found: ${documentId}`)
    const currentRevision = this.store.getRevision(document.currentRevisionId)
    if (!currentRevision) throw new Error(`Broken current revision pointer: ${document.currentRevisionId}`)
    const workingCopy = this.requireWorkingCopy(documentId)
    const workingCopyDirty = workingCopy.contentHash !== currentRevision.contentHash
    const latestRemoteDraft = this.store.latestRemoteDraft(documentId)
    const syncState = !latestRemoteDraft
      ? 'NEVER_SYNCED'
      : workingCopyDirty || latestRemoteDraft.revisionId !== currentRevision.id
        ? 'OUTDATED'
        : 'SYNCED'
    return { document, currentRevision, workingCopy, workingCopyDirty, latestRemoteDraft, syncState }
  }

  private assertDocument(documentId: string) {
    const document = this.store.getDocument(documentId)
    if (!document) throw new Error(`Document not found: ${documentId}`)
    return document
  }

  private requireWorkingCopy(documentId: string): WorkingCopyRecord {
    const working = this.store.getWorkingCopy(documentId)
    if (working) return working

    // Defensive repair path for a legacy Foundation DB.
    const doc = this.assertDocument(documentId)
    const revision = this.store.getRevision(doc.currentRevisionId)
    if (!revision) throw new Error(`Broken current revision pointer: ${doc.currentRevisionId}`)
    this.store.insertWorkingCopy({
      documentId,
      baseRevisionId: revision.id,
      title: revision.title,
      markdown: revision.markdown,
      contentHash: revision.contentHash,
      version: 1,
      updatedAt: doc.updatedAt,
    })
    return this.store.getWorkingCopy(documentId)!
  }
}
