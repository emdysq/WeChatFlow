export type DocumentStatus = 'EDITING' | 'ARCHIVED'
export type SyncState = 'NEVER_SYNCED' | 'SYNCED' | 'OUTDATED'

export interface DocumentRecord {
  id: string
  title: string
  status: DocumentStatus
  currentRevisionId: string
  createdAt: string
  updatedAt: string
}

export interface RevisionRecord {
  id: string
  documentId: string
  sequence: number
  title: string
  markdown: string
  authorType: 'USER' | 'AI' | 'AGENT' | 'SYSTEM'
  authorLabel: string
  reason: string
  contentHash: string
  createdAt: string
}

export interface RenderProfile {
  theme: string
  primaryColor?: string
  fontSize?: string
  lineHeight?: string
  blockSpacing?: string
  headingStyle?: string
  customCss?: string
}

export interface RenderSnapshotRecord {
  id: string
  documentId: string
  revisionId: string
  profileJson: string
  html: string
  htmlHash: string
  createdAt: string
}

export interface RemoteDraftRecord {
  id: string
  documentId: string
  accountId: string
  mediaId: string
  revisionId: string
  snapshotId: string
  syncedAt: string
}

export interface DocumentView {
  document: DocumentRecord
  currentRevision: RevisionRecord
  latestRemoteDraft: RemoteDraftRecord | null
  syncState: SyncState
}
