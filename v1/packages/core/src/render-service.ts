import type { RenderProfile, RenderResult, RenderSnapshotRecord } from '../../domain/src/types.ts'
import { DoocsRendererAdapter } from '../../renderer-doocs/src/adapter.ts'
import { DocumentService } from './document-service.ts'

export class RenderService {
  readonly documents: DocumentService
  readonly renderer: DoocsRendererAdapter

  constructor(documents: DocumentService, renderer = new DoocsRendererAdapter()) {
    this.documents = documents
    this.renderer = renderer
  }

  status() {
    return this.renderer.status()
  }

  async previewWorkingCopy(documentId: string, profile: RenderProfile): Promise<RenderResult & { workingCopyVersion: number }> {
    const view = this.documents.getDocumentView(documentId)
    const result = await this.renderer.render({ markdown: view.workingCopy.markdown, profile })
    return { ...result, workingCopyVersion: view.workingCopy.version }
  }

  async createSnapshot(documentId: string, profile: RenderProfile): Promise<{
    snapshot: RenderSnapshotRecord
    render: RenderResult
    revisionSequence: number
  }> {
    // Snapshot/publication boundaries must always point at an immutable revision.
    const committed = this.documents.commitWorkingCopy(documentId, {
      authorType: 'SYSTEM',
      authorLabel: 'render',
      reason: 'render snapshot checkpoint',
    })
    const render = await this.renderer.render({ markdown: committed.currentRevision.markdown, profile })
    const snapshot = this.documents.createRenderSnapshot(
      documentId,
      committed.currentRevision.id,
      profile,
      render.html,
    )
    return { snapshot, render, revisionSequence: committed.currentRevision.sequence }
  }
}
