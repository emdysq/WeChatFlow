export type DocumentStatus = 'EDITING' | 'ARCHIVED'
export type SyncState = 'NEVER_SYNCED' | 'SYNCED' | 'OUTDATED'
export type RevisionAuthorType = 'USER' | 'AI' | 'AGENT' | 'SYSTEM'

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
  authorType: RevisionAuthorType
  authorLabel: string
  reason: string
  contentHash: string
  createdAt: string
}

export interface WorkingCopyRecord {
  documentId: string
  baseRevisionId: string
  title: string
  markdown: string
  contentHash: string
  version: number
  updatedAt: string
}

export interface RenderProfile {
  theme: string
  primaryColor?: string
  fontFamily?: string
  fontSize?: string
  lineHeight?: string
  blockSpacing?: string
  linkColor?: string
  blockquoteBackground?: string
  legend?: string
  isMacCodeBlock?: boolean
  isShowLineNumber?: boolean
  citeStatus?: boolean
  countStatus?: boolean
  themeMode?: 'light' | 'dark'
  isUseIndent?: boolean
  isUseJustify?: boolean
  headingStyles?: Record<string, string | undefined>
  codeBlockTheme?: string
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
  workingCopy: WorkingCopyRecord
  workingCopyDirty: boolean
  latestRemoteDraft: RemoteDraftRecord | null
  syncState: SyncState
}

export interface DocumentListItem {
  documentId: string
  title: string
  status: DocumentStatus
  currentRevisionSequence: number
  workingCopyVersion: number
  workingCopyDirty: boolean
  syncState: SyncState
  remoteRevisionSequence: number | null
  updatedAt: string
}

export interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
  oldLine: number | null
  newLine: number | null
}

export interface RevisionDiff {
  from: { id: string; sequence: number; title: string }
  to: { id: string; sequence: number | 'working'; title: string }
  titleChanged: boolean
  lines: DiffLine[]
}

export interface RenderResult {
  html: string
  frontMatter: Record<string, unknown>
  readingTime: { words: number; minutes: number }
  renderer: {
    id: string
    upstreamCommit: string | null
  }
}
