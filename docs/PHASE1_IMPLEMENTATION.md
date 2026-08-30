# WeChatFlow V1 — Phase 1 实现报告

> 分支：`feat/v1-foundation`  
> 日期：2026-08-30  
> 状态：Phase 1 完成；Phase 2 Renderer Integration 已进入 scaffold / 本地联调阶段。

## 1. 本阶段解决的问题

Phase 1 不接 AI、不接真实微信，先把稿件生命周期做正确：

```text
Document
  ├─ immutable Revision v1
  ├─ immutable Revision v2
  └─ durable Working Copy  ← 用户当前继续编辑

RemoteDraft
  └─ syncedRevision = v1

Working Copy 修改后：syncState = OUTDATED
```

因此“已经进微信草稿箱”不再等于“本地稿件锁死”。

## 2. Working Copy 与 Revision Policy

编辑输入先写 `document_working_copies`，不会每个字符都产生 Revision。

Web 端策略：

```text
输入
→ 600ms debounce
→ SQLite Working Copy
→ 30s idle checkpoint（或用户点击保存版本）
→ immutable Revision
```

以下边界也会形成 Revision：未来 AI 修改被接受、Review、RenderSnapshot、微信同步前。

## 3. 并发保护

Working Copy 带自增 `version`。Web/Agent 更新时携带 `expectedVersion`：

```text
expectedVersion != actualVersion
→ HTTP 409
→ WORKING_COPY_CONFLICT
→ 禁止静默覆盖
```

这是后续 Codex / WorkBuddy / MCP 与浏览器共同编辑同一篇文章的基础。

## 4. 历史、Diff 与恢复

已经实现：

- Revision 历史列表；
- Revision → Working Copy 行级 Diff；
- Revision → Revision Diff；
- 恢复旧版本时不删除后续历史，而是创建新的 `restore revision vN`。

## 5. SQLite migration

Schema 使用 `PRAGMA user_version = 2`。

新增：

```text
document_working_copies
- document_id
- base_revision_id
- title
- markdown
- content_hash
- version
- updated_at
```

旧 Foundation DB 会自动 backfill Working Copy。

## 6. Web Workspace

同一个本地 Node 进程现在提供：

```text
http://127.0.0.1:8787/
```

包含：

- 稿件中心；
- 新建稿件；
- Markdown 编辑；
- 自动保存状态；
- Working Copy version；
- 本地/微信版本与同步状态；
- Revision History；
- Diff；
- Restore；
- 手动/idle checkpoint；
- Renderer Preview 面板。

## 7. doocs/md Renderer Phase 2 scaffold

已经增加：

```text
packages/renderer-doocs/src/adapter.ts
packages/renderer-doocs/src/bridge.ts
packages/core/src/render-service.ts
```

Renderer readiness 会明确列出 blocker：

```text
UPSTREAM_NOT_BOOTSTRAPPED
UPSTREAM_RENDERER_SOURCE_MISSING
UPSTREAM_DEPENDENCIES_NOT_INSTALLED
```

在 doocs 未连接时，Web 只能显示带警告的基础 Markdown 回退预览；不能创建正式 RenderSnapshot，也不能把回退 HTML 当作微信最终结果。

在用户开发机完成：

```powershell
cd v1
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-upstream.ps1
cd upstream/doocs-md
pnpm install
```

重启 V1 后，`GET /api/v1/renderer` 应变为 `available: true`。

正式 Renderer 可用后：

```text
Working Copy → Preview
Revision → RenderSnapshot
RenderSnapshot → Copy Rich HTML
未来 RenderSnapshot → WeChat
```

都使用同一个 doocs adapter。

## 8. API 增量

新增或完善：

```text
GET   /api/v1/documents
GET   /api/v1/documents/{id}
PATCH /api/v1/documents/{id}/working-copy
POST  /api/v1/documents/{id}/commit
POST  /api/v1/documents/{id}/restore
POST  /api/v1/documents/{id}/status
GET   /api/v1/documents/{id}/revisions
GET   /api/v1/documents/{id}/diff
GET   /api/v1/renderer
POST  /api/v1/documents/{id}/preview
GET   /api/v1/documents/{id}/snapshots
POST  /api/v1/documents/{id}/snapshots
GET   /api/v1/documents/{id}/remote-drafts
```

`POST remote-drafts` 暂时仍只是 Foundation bookkeeping，Phase 7 才会产生真实微信副作用。

## 9. 自动测试

当前本地基线：

```text
14 passed
```

覆盖：

- 微信草稿后继续编辑；
- 相同内容不制造 Revision；
- Snapshot 绑定 immutable Revision；
- Working Copy autosave 与 checkpoint 分离；
- optimistic concurrency；
- dirty Working Copy 立即 OUTDATED；
- restore-as-new-revision；
- line diff；
- SQLite restart persistence；
- schema v2 migration/backfill；
- HTTP API happy path；
- HTTP 409 conflict；
- Web 静态页面；
- Renderer readiness。

## 10. 下一阶段

Phase 2 的下一步不是继续写“模拟主题”，而是在用户 Windows 开发机完成真实 doocs/md bootstrap 后：

1. 跑第一批真实 Renderer smoke test；
2. 加 Theme discovery；
3. 固化 10~20 个 Renderer golden fixtures；
4. 检查微信 HTML 是否需要额外 inline / clipboard finalization；
5. 确保 Preview / Copy / Snapshot 的最终 HTML hash 一致；
6. 再开始 Phase 3 Semantic Components。
