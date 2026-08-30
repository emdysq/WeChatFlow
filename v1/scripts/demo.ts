import { DocumentService } from '../packages/core/src/document-service.ts'
import { SqliteStore } from '../packages/storage/src/sqlite-store.ts'

const service = new DocumentService(new SqliteStore(':memory:'))
const first = service.createDocument({ title: 'WeChatFlow V1 Demo', markdown: '# WeChatFlow V1 Demo\n\n正文。' })
const snapshot = service.createRenderSnapshot(first.document.id, first.currentRevision.id, { theme: 'grace' }, '<h1>WeChatFlow V1 Demo</h1><p>正文。</p>')
console.log('before sync', service.recordWechatDraft({ documentId: first.document.id, accountId: 'main', mediaId: 'mock-media', snapshotId: snapshot.id }).syncState)
console.log('after edit', service.saveRevision(first.document.id, { title: 'WeChatFlow V1 Demo', markdown: '# WeChatFlow V1 Demo\n\n正文已经修改。' }).syncState)
