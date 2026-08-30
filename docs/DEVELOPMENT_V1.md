# WeChatFlow V1.0 详细开发文档

> 文档状态：Development Baseline v1.0-alpha  
> 更新时间：2026-08-30  
> 开发分支：`feat/v1-foundation`  
> 正式定位：**AI 原生微信公众号内容创作、排版与发布工作台**  
> 旧版状态：FastAPI V0.x 保留为技术 POC，不再作为 V1 架构基础。

---

## 1. 文档目的

本文件冻结 WeChatFlow V1.0 的产品边界、开源基座、架构原则、数据模型、页面结构、AI/Agent 协议、渲染策略、图片工作流、微信公众号同步策略、测试标准和开发阶段。

V1 的目标不是继续把现有 FastAPI 项目“补功能”，而是重新建立一个可长期演进的内容工作台。所有后续开发都应优先遵守本文件中的领域模型和架构不变量；如果实现与本文冲突，应先修改设计文档并说明原因，再修改代码。

---

## 2. 产品定义

### 2.1 一句话定义

WeChatFlow 是一个把“一个想法/一份资料”转化为“可持续修改、可实时预览、可智能配图、可审稿、可同步微信公众号草稿”的 AI 原生内容工作台。

### 2.2 主用户流程

```text
Idea / 资料
   ↓
Article Plan
   ↓
AI 初稿
   ↓
人工 + Agent 协同修改
   ↓
图片规划 / 图片生成 / 人工替换
   ↓
公众号实时渲染
   ↓
AI Review
   ↓
人工确认
   ↓
RenderSnapshot
   ├── 富文本复制
   └── 微信 API 草稿同步
          ↓
继续修改
          ↓
版本差异 / 更新微信草稿
```

### 2.3 V1 必须解决的问题

1. **同步微信后仍然可以继续修改。** 微信草稿是远程快照，不是本地稿件状态。
2. **编辑过程中始终能看到真实排版。** Markdown、主题和排版参数变化后立即刷新公众号预览。
3. **排版具有多样性和可组合性。** 不再只有几套固定 CSS。
4. **AI 参与完整内容生产，而不是只负责润色。** AI 需要先策划，再写作，再规划图片，再审稿。
5. **支持外部 Agent。** Codex、WorkBuddy、Claude 等可以通过 MCP/CLI/API 操作同一份稿件。
6. **Web 与 Agent 必须共享同一份数据。** 不允许浏览器本地一份、Agent 文件系统另一份。
7. **Preview / Copy / WeChat 使用同一个 RenderSnapshot。** 防止三条渲染链互相不一致。
8. **微信发布保留人工确认。** V1 自动化边界到“创建/更新草稿”，不默认自动群发。

---

## 3. 开源基座与许可策略

### 3.1 主基座：doocs/md

- Repository: https://github.com/doocs/md
- V1 初始锁定 Commit: `7622b816dbe8019ca2c8fc3d90c33a4aa8589836`
- License: WTFPL
- 角色：**主编辑器 + Markdown 渲染 + 主题 + 组件 + AI 基础 UI + MCP 基础能力**

选择原因：

- 已有成熟 Markdown 编辑器和公众号实时渲染。
- 已有本地草稿自动保存、历史、文件夹读写。
- 已有主题参数系统：主题色、字体、字号、行距、段距、标题样式、引用、代码主题等。
- 已有自定义 CSS 与自定义组件 Registry。
- 已有 AI 对话、文本处理、文生图配置。
- 已有 MCP Server，可继续扩展为 WeChatFlow MCP。
- TypeScript/Vue/pnpm 技术栈适合继续构建完整产品。

### 3.2 AI 工作流参考：liyown/ai-trend-publish

- License: MIT
- 角色：参考 Article Plan、质量审稿、图片 Provider、工作流可观察性、发布门禁和多 Provider Adapter 设计。

复用原则：只在确认许可证兼容、实现确实有复用价值时复制具体实现，并保留许可证与归属；其余情况只借鉴架构。

### 3.3 微信发布参考：caol64/wenyan-mcp

- License: Apache-2.0
- 角色：参考 Markdown 到微信草稿、正文图片处理、封面处理、MCP 发布接口、本地/远程发布模式。

### 3.4 产品与 Agent 协议参考：geekjourneyx/md2wechat-skill

- License: Source Available，商业使用/再分发存在限制。
- 角色：**只做产品行为、Agent discovery、inspect/preview/convert 安全边界研究。**
- 禁止：直接复制受限实现进入 WeChatFlow，除非后续取得兼容授权。

### 3.5 上游管理方式

V1 不把 doocs/md 一次性复制进仓库然后大面积修改。采用“**固定上游 commit + 自动 bootstrap + 我们自己的适配层**”策略：

```text
upstream/doocs-md.lock.json
          ↓
bootstrap-upstream
          ↓
upstream/doocs-md/   # .gitignore，不提交
          ↓
WeChatFlow adapters / domain / server
```

这样做的目的：

- 保留上游更新能力。
- 能明确知道我们的修改在哪里。
- 避免 Fork 后几周内无法继续合并上游。
- 便于许可证与第三方归属管理。

---

## 4. 架构原则（必须遵守）

### 4.1 Document 永远可编辑

禁止把微信草稿状态写成：

```text
Article.status = DRAFT_CREATED
```

然后阻止修改。

正确模型：

```text
Document
  ├── Revision 1
  ├── Revision 2
  └── Revision 3  ← 当前版本

RemoteDraft
  └── syncedRevision = Revision 2

=> syncState = OUTDATED
```

### 4.2 Revision 不可变

Revision 创建以后不能 UPDATE，只能再创建下一版本。

优势：

- AI 修改可以审阅。
- 可以做 Diff。
- 能知道微信当前同步的是哪一版。
- 出问题时可以恢复。
- Agent 与人工协作不会发生无痕覆盖。

### 4.3 RenderSnapshot 不可变

同一篇文章可能同时存在：

- v10 + Tech Theme
- v10 + Minimal Theme
- v11 + Tech Theme

每一次进入微信同步或富文本复制前，生成一个不可变 RenderSnapshot：

```text
revisionId
renderProfile
html
assetMap
hash
createdAt
```

Preview、Clipboard 和微信发布必须读取同一个 Snapshot。

### 4.4 SQLite 是 V1 本地唯一业务 Source of Truth

Pinia、LocalStorage、浏览器文件夹都只能作为 UI 状态或导入导出机制。

核心业务数据统一写入 SQLite：

```text
Vue Web ─┐
         ├── Local API ── Domain ── SQLite
MCP ─────┤
CLI ─────┤
Agent ───┘
```

### 4.5 副作用显式化

以下行为视为副作用：

- 上传微信正文图片
- 上传封面
- 创建微信草稿
- 更新微信草稿
- 调用付费图片生成

副作用命令必须与“预览/检查”分开。

### 4.6 AI 不直接操作危险发布

AI/Agent 可以：

- 建稿
- 写计划
- 改稿
- 生成图片计划
- 生成 Review
- 创建 RenderSnapshot

AI/Agent 默认不能直接：

- 群发
- 自动发布
- 未经批准覆盖远程微信草稿

后续 MCP `sync_draft` 必须要求批准令牌或明确的交互确认上下文。

---

## 5. 技术栈

### 5.1 正式 V1

```text
Node.js >= 22.22.2
TypeScript
Vue 3
Vite
Pinia
pnpm workspace
SQLite
MCP
```

### 5.2 为什么不继续以 FastAPI 为主

旧版 Python 服务已经验证了：

- 微信 token
- 图片上传
- draft/add
- dry-run
- 状态日志

但 V1 的核心难点已经从“API 能否调用”变成：

- 编辑器
- 实时渲染
- 组件排版
- 文档版本
- AI/Agent 协作
- 浏览器与 Agent 共用 Domain

这些能力与 doocs/md 的 TypeScript 栈高度重合。如果继续保留 Python 为核心，会形成跨进程渲染、重复模型和大量 Glue Code。

### 5.3 Python POC 的保留价值

V0.x 不删除，用作：

- 微信 API 行为参考
- 错误码参考
- 已验证的 mock/live 思路
- 旧版本 Demo

但不继续加 V1 功能。

---

## 6. Monorepo 目标结构

```text
WeChatFlow/
├─ v1/
│  ├─ apps/
│  │  ├─ web/                 # Vue 编辑工作台
│  │  └─ api/                 # Local API / Agent Gateway
│  │
│  ├─ packages/
│  │  ├─ domain/              # 纯业务模型
│  │  ├─ core/                # 应用服务 / use cases
│  │  ├─ storage/             # SQLite Repository
│  │  ├─ renderer-adapter/    # doocs/md 渲染适配
│  │  ├─ ai/                  # LLM Provider + Article Agent
│  │  ├─ images/              # 图片规划 + Provider
│  │  ├─ review/              # Reviewer / Quality Gate
│  │  ├─ publish/             # WeChat / Clipboard / Relay
│  │  └─ mcp/                 # MCP Tools
│  │
│  ├─ upstream/
│  │  ├─ doocs-md.lock.json
│  │  └─ doocs-md/            # bootstrap 后生成，不提交
│  │
│  ├─ scripts/
│  ├─ tests/
│  ├─ data/
│  └─ THIRD_PARTY.md
│
├─ app/                       # V0 Python POC，暂保留
└─ specs/                     # 旧 Spec Kit / 后续迁移
```

---

## 7. 核心领域模型

### 7.1 Document

表示“用户认知中的一篇稿件”。

字段：

```ts
Document {
  id
  title
  status: EDITING | ARCHIVED
  currentRevisionId
  brandProfileId?
  createdAt
  updatedAt
}
```

Document 自身不保存正文；正文属于 Revision。

### 7.2 Revision

```ts
Revision {
  id
  documentId
  sequence
  title
  markdown
  authorType: USER | AI | AGENT | SYSTEM
  authorLabel
  reason
  contentHash
  createdAt
}
```

任何改变正文或标题的操作都创建 Revision。

不创建无意义 Revision：若 `title + markdown` hash 未变化，保存操作直接返回当前版本。

### 7.3 ArticlePlan

```ts
ArticlePlan {
  id
  documentId
  revisionBaseId
  objective
  audience
  thesis
  tone
  targetLength
  sections[]
  titleDirections[]
  imageSlots[]
  risks[]
  createdByAgentRunId
}
```

### 7.4 ImageSlot

```ts
ImageSlot {
  id
  documentId
  planId
  anchor
  role
  purpose
  prompt
  aspectRatio
  status: PLANNED | GENERATING | READY | SKIPPED | FAILED
  assetId?
}
```

ImageSlot 不是图片本身，而是“文章结构中应该出现什么图片”的意图。

### 7.5 Asset

```ts
Asset {
  id
  kind: COVER | BODY_IMAGE | INFOGRAPHIC | SCREENSHOT
  source: UPLOAD | AI | REMOTE | AGENT
  localPath
  sourceUrl?
  prompt?
  mimeType
  width
  height
  sha256
  wechatUrl?
  wechatMediaId?
}
```

### 7.6 RenderProfile

```ts
RenderProfile {
  theme
  primaryColor
  fontFamily
  fontSize
  lineHeight
  blockSpacing
  headingStyles
  blockquoteStyle
  imageStyle
  codeBlockTheme
  customCss
}
```

### 7.7 RenderSnapshot

```ts
RenderSnapshot {
  id
  documentId
  revisionId
  renderProfile
  html
  htmlHash
  assetMap
  createdAt
}
```

原则：Snapshot 只创建，不更新。

### 7.8 RemoteDraft

```ts
RemoteDraft {
  id
  documentId
  accountId
  mediaId
  revisionId
  snapshotId
  remoteType: WECHAT_DRAFT
  syncedAt
}
```

### 7.9 ReviewReport

```ts
ReviewReport {
  id
  documentId
  revisionId
  overallScore
  dimensions
  issues[]
  recommendation: PASS | REVISE | BLOCK
  createdAt
}
```

### 7.10 AgentRun

```ts
AgentRun {
  id
  documentId
  role
  provider
  model
  instruction
  inputRevisionId
  outputRevisionId?
  status
  tokenUsage?
  startedAt
  endedAt
}
```

---

## 8. 同步状态算法

同步状态不能手动保存，应由数据推导。

```text
没有 RemoteDraft
=> NEVER_SYNCED

latestRemoteDraft.revisionId == currentRevision.id
=> SYNCED

latestRemoteDraft.revisionId != currentRevision.id
=> OUTDATED
```

示例：

```text
v8 同步微信
=> SYNCED

修改产生 v9
=> OUTDATED

v9 更新微信草稿成功
=> SYNCED
```

这条规则是 V1 第一条自动测试不变量。

---

## 9. 编辑器页面设计

### 9.1 主编辑页面

```text
┌──────────────────────────────────────────────────────────────┐
│ ← 稿件中心   AI Agent   版本历史   审稿   微信同步            │
├─────────────┬────────────────────────────┬───────────────────┤
│ 左侧工具区   │          编辑区             │    微信预览        │
│             │                              │                   │
│ 文章计划     │ Markdown / Rich Markdown   │ 手机宽度预览       │
│ 章节目录     │                              │                   │
│ 配图         │                              │                   │
│ 版本历史     │                              │                   │
│ Agent runs  │                              │                   │
├─────────────┴────────────────────────────┴───────────────────┤
│ v12 · 自动保存 · 配图 3/4 · Review 88 · 微信 v10 待同步       │
└──────────────────────────────────────────────────────────────┘
```

### 9.2 自动保存

用户输入不应该每个字符创建 Revision。

设计两层：

- Working Buffer：编辑器 500ms~1000ms debounce 持久化。
- Revision：满足以下任一条件才固化：
  - 用户主动保存版本
  - AI 修改完成并被接受
  - 开始 Review
  - 创建 RenderSnapshot
  - 同步微信前
  - 离开编辑器超过一定时间

因此未来数据库可增加 `document_working_copy`，避免每个输入字符产生版本爆炸。

Phase 1 Foundation 暂时直接 `saveRevision`；Web Editor 接入时实现 Working Copy。

---

## 10. 排版系统

### 10.1 四层结构

```text
Theme
 +
Style Parameters
 +
Semantic Components
 +
AI Layout Decision
```

### 10.2 初始 Theme 分类

- Minimal：极简长文
- Grace：优雅阅读
- Tech：科技媒体
- Magazine：杂志
- Business：商业分析
- Research：学术/研究
- Knowledge：知识科普
- Story：人文故事
- Product：产品发布
- News：资讯

第一阶段不要求一次完成 10 套独立主题。优先使用 doocs 已有主题 + 参数差异建立基础体验，然后逐步添加 WeChatFlow Theme Pack。

### 10.3 Semantic Components

首批 P0：

```text
Hero
Lead
KeyPoint
Callout
Quote
Comparison
Steps
DataCard
Timeline
ProsCons
CaseStudy
Summary
CTA
ImageSlot
```

AI 输出语义，不输出自由 CSS。

示例：

```markdown
:::keypoint
title: 核心判断
AI Agent 改变的不是软件是否存在，而是软件的入口。
:::
```

Renderer 再根据 Theme 映射成微信安全 HTML。

---

## 11. doocs/md Renderer Adapter

### 11.1 目标

WeChatFlow 不直接依赖 doocs/md Web Store；建立 `renderer-adapter`：

```ts
interface RendererAdapter {
  listThemes(): Promise<ThemeDescriptor[]>
  render(input: RenderInput): Promise<RenderResult>
  validateHtml(html: string): Promise<RenderCheck[]>
}
```

### 11.2 RenderInput

```ts
{
  markdown
  profile
  componentRegistry
  assets
}
```

### 11.3 RenderResult

```ts
{
  html
  headings
  readingTime
  warnings
  assetReferences
}
```

### 11.4 关键原则

- Web Preview 调 RendererAdapter。
- Snapshot 也调用同一个 RendererAdapter。
- Copy 不重新 render。
- WeChat 不重新 render。

---

## 12. AI Provider 层

统一协议：

```ts
interface LlmProvider {
  id: string
  listModels(): Promise<ModelInfo[]>
  testConnection(): Promise<ProviderHealth>
  generate(request: LlmRequest): Promise<LlmResponse>
  stream?(request: LlmRequest): AsyncIterable<LlmChunk>
}
```

P0 Provider：

- DeepSeek
- OpenAI-compatible Custom

P1：

- Qwen
- Gemini
- Doubao
- OpenRouter
- SiliconFlow

原因：DeepSeek 本身采用 OpenAI 兼容 API，可以先把通用 OpenAI-compatible Client 做好，再增加 preset。

API Key 必须：

- 只存在本机 Secret Store / 环境变量 /受保护配置。
- 不写文章。
- 不写 Git。
- 不进入 Agent prompt 日志。
- UI 默认不回显完整 Key。

---

## 13. Article Agent 工作流

### 13.1 Planner

输入：

- 用户一句话
- 用户资料
- Brand Profile
- 可选历史文章

输出严格 JSON Schema：

```text
objective
audience
thesis
articleType
tone
targetLength
sections
titleDirections
imageSlots
risks
```

### 13.2 Writer

只能消费 ArticlePlan 与用户提供资料。

输出：

- Markdown
- 语义组件
- ImageSlot anchor

Writer 不允许：

- 上传微信
- 自己决定发布
- 修改 Provider 配置

### 13.3 Image Director

职责：

- 判断哪些位置真的需要图。
- 给出图片类型。
- 生成 Prompt。
- 选择合理比例。
- 生成 alt/caption。

### 13.4 Editor

负责定向改稿，不重新生成整篇。

### 13.5 Reviewer

只输出问题、评分和可修建议。

### 13.6 Revision Agent

接收 Reviewer issue，只修 `autoFixable=true` 的问题，默认最多一轮。

### 13.7 Publisher

只处理已经冻结的 RenderSnapshot。

---

## 14. AI 改稿 Diff 协议

Agent 不直接覆盖当前稿。

返回：

```ts
RevisionProposal {
  baseRevisionId
  instruction
  changes[]
  proposedMarkdown
}
```

UI：

```text
原文             建议
----             ----
旧句子           新句子

[接受全部]
[逐项接受]
[拒绝]
[继续让 AI 修改]
```

接受后才创建新的 Revision。

后续冲突检测：如果 proposal.baseRevisionId 不再等于当前 revision，则标记：

```text
REVISION_CONFLICT
```

要求用户选择：

- 基于新版本重新生成
- 手工合并

---

## 15. 图片工作流

### 15.1 图片来源

```text
UPLOAD
AI_PROVIDER
AGENT_HOST
REMOTE_URL
SCREENSHOT
```

### 15.2 文本模型与图片模型分离

LLM 负责“这里需要什么图”。

Image Provider 负责“生成图”。

```ts
interface ImageProvider {
  generate(request: ImageRequest): Promise<ImageAsset>
}
```

### 15.3 V1 图片失败策略

图片生成失败不能导致文章丢失。

```text
GENERATING → FAILED
```

用户可以：

- 重试
- 换 Provider
- 上传本地图
- 跳过

### 15.4 微信前置处理

Snapshot 创建前可以使用本地图片。

真正同步微信前：

```text
Asset Resolver
   ↓
所有正文图片上传微信
   ↓
wechatUrl
   ↓
Final WeChat HTML
```

注意：Web Preview 的 Snapshot 与 WeChat 最终 Snapshot 可以是同一个逻辑 snapshot family，但微信上传会产生 resolved asset map。实现时应避免无意义修改正文 Revision。

---

## 16. Brand Profile

```ts
BrandProfile {
  id
  name
  accountPositioning
  audience
  topics[]
  tone
  preferredLength
  titleStyle
  bannedPhrases[]
  preferredStructures[]
  imageStyle
  defaultRenderProfile
  authorName
}
```

示例禁止词：

```text
随着时代发展
在当今数字化时代
让我们一起
值得注意的是
不难发现
综上所述（高频时）
```

Planner / Writer / Reviewer 均读取 Brand Profile。

---

## 17. Review 与质量门禁

P0 Review 维度：

- 主线清晰度
- 结构
- 可读性
- 重复
- AI 套话
- 标题质量
- 摘要质量
- 图片相关性
- 微信 HTML 合规
- 事实风险

输出：

```ts
ReviewIssue {
  id
  severity: INFO | WARNING | BLOCKER
  category
  location
  message
  suggestion
  autoFixable
}
```

默认门禁：

```text
BLOCKER 存在 → 禁止微信同步
未处理 ImageSlot 且 marked required → 禁止微信同步
HTML 检查失败 → 禁止微信同步
```

用户可以对非高风险问题显式忽略；忽略操作也要记录。

---

## 18. 微信账号模型

现有 doocs 账号信息更多偏前端帐号资料。WeChatFlow 需要拆成：

```ts
WechatAccount {
  id
  name
  appIdMasked
  secretRef
  mode: LIVE | MOCK
  defaultBrandProfileId?
  lastConnectionCheck
}
```

真实 Secret 不进入 SQLite 明文字段；`secretRef` 指向系统密钥或环境配置。

V1 最初仍可单账号，但数据模型直接支持多账号。

---

## 19. 微信 Publisher Adapter

统一接口：

```ts
interface PublisherAdapter {
  inspect(snapshotId, accountId): Promise<PublishReadiness>
  createDraft(snapshotId, accountId, approval): Promise<RemoteDraft>
  updateDraft(remoteDraftId, snapshotId, approval): Promise<RemoteDraft>
}
```

实现：

```text
WeChatDirectPublisher
WeChatRelayPublisher  (后续)
ClipboardPublisher
MockPublisher
```

### 19.1 Direct 流程

```text
access_token
→ 正文图片 uploadimg
→ 封面 material/add_material
→ HTML 图片 URL 替换
→ draft/add 或 draft/update
→ 保存 RemoteDraft
```

### 19.2 Clipboard 流程

复制的必须是与 Preview 同源的 Snapshot HTML。

用户手工粘贴到微信后台时，页面明确提示：

```text
这是人工导出，不会生成 RemoteDraft media_id。
```

后续可允许用户标记“已手工同步”。

---

## 20. MCP / Agent 协议

### 20.1 只读 discovery

```text
wechatflow.capabilities
wechatflow.list_documents
wechatflow.get_document
wechatflow.list_themes
wechatflow.get_sync_status
wechatflow.review_status
```

### 20.2 安全写操作

```text
wechatflow.create_document
wechatflow.propose_revision
wechatflow.accept_revision
wechatflow.create_article_plan
wechatflow.plan_images
wechatflow.attach_asset
wechatflow.create_render_snapshot
```

### 20.3 有副作用操作

```text
wechatflow.prepare_wechat_sync
wechatflow.sync_wechat_draft
wechatflow.update_wechat_draft
```

`prepare_*` 不产生微信副作用，只生成 readiness 与 approval challenge。

`sync_*` 需要：

```text
approvalToken
snapshotId
accountId
```

并校验 token 与 snapshot/account 一致，防止 Agent 用 A 文章批准去发布 B 文章。

---

## 21. Local API 初始 Contract

Phase 1 Foundation 已开始实现：

```text
GET  /health
POST /api/v1/documents
GET  /api/v1/documents/{id}
GET  /api/v1/documents/{id}/revisions
POST /api/v1/documents/{id}/revisions
POST /api/v1/documents/{id}/snapshots
POST /api/v1/documents/{id}/remote-drafts
```

注意：当前 `remote-drafts` 是领域状态与测试接口，不等于真实微信 API 已接入。

后续目标：

```text
PATCH /api/v1/documents/{id}/working-copy
POST  /api/v1/documents/{id}/working-copy/commit
POST  /api/v1/documents/{id}/plan
POST  /api/v1/documents/{id}/review
POST  /api/v1/documents/{id}/images/plan
POST  /api/v1/documents/{id}/render
POST  /api/v1/documents/{id}/wechat/prepare
POST  /api/v1/documents/{id}/wechat/sync
```

---

## 22. Error Model

统一结构：

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "当前稿件已从 v8 更新到 v9",
    "action": "refresh_and_retry",
    "details": {}
  }
}
```

类别：

```text
DOCxxxx  文档
REVxxxx  版本
RENxxxx  渲染
AIxxxx   LLM
IMGxxxx  图片
RVWxxxx  审稿
WXxxxx   微信
SECxxxx  安全
SYSxxxx  系统
```

保留旧 POC 里实用的微信错误映射思想，但重新统一到 V1 error envelope。

---

## 23. 安全要求

### 23.1 Secrets

禁止：

- Git 提交 `.env`
- AppSecret 写数据库明文
- Agent 输出 Secret
- 错误日志打印完整 Key
- 前端获取 Secret

### 23.2 SSRF

V0 已存在从远程 URL 获取图片的潜在 SSRF 风险，V1 必须在正式 URL Asset Provider 中：

- DNS resolve 后拦截 loopback/private/link-local/reserved。
- 禁止 `file://`、`ftp://` 等非 HTTP(S)。
- 限制最大响应体。
- 验证 MIME 与 magic bytes。
- 限制 redirect 次数并重新验证目标。

### 23.3 HTML

渲染产物必须：

- sanitize
- inline CSS
- 去除 script/iframe/object/embed
- 过滤危险 URL scheme
- 微信发布前再次 validate

### 23.4 Agent Tool 权限

按能力分级：

```text
READ
WRITE_LOCAL
EXTERNAL_SIDE_EFFECT
```

默认 Agent 只开放前两级。

---

## 24. 可观察性

每一个长期任务形成 Run：

```text
ArticlePlanRun
WriterRun
ImageRun
ReviewRun
PublishRun
```

公共字段：

```text
id
kind
documentId
inputRevisionId
outputRevisionId
status
startedAt
endedAt
provider
model
error?
```

Web 可看到：

```text
16:30 Planner 完成  2.8s
16:31 Writer 完成   18.4s
16:32 Image #1 完成 9.2s
16:32 Image #2 失败 Provider timeout
16:34 Reviewer 完成 6.3s
```

---

## 25. 测试战略

### 25.1 Domain Unit Tests

P0：

- 创建 Document 自动创建 Revision 1。
- 相同内容不创建重复 Revision。
- 新内容产生 sequence +1。
- RemoteDraft 记录以后 Document 仍可继续修改。
- 当前 Revision 与远程 Revision 一致 => SYNCED。
- 当前 Revision 更新 => OUTDATED。
- RenderSnapshot 绑定旧 Revision 后不能随当前 Revision 改变。

### 25.2 Renderer Golden Tests

选 10~20 篇固定 Markdown：

```text
基础长文
大量标题
引用
代码
表格
多图
数学公式
Mermaid
语义组件
复杂链接
```

保存 HTML hash/DOM 结构作为回归基线。

### 25.3 Agent Contract Tests

模型可以 Mock，只验证：

- Planner JSON Schema。
- Writer 不能调用 Publisher。
- RevisionProposal 必须含 baseRevisionId。
- 冲突拒绝旧 proposal。

### 25.4 WeChat Contract Tests

使用 Mock HTTP Server：

- token success/error
- image upload
- cover upload
- draft add
- draft update
- IP whitelist error
- auth error
- missing media_id

### 25.5 Live E2E

Live 微信测试只能在用户本地配置 Secret 后执行。

验收：

```text
真实微信连接成功
→ 一篇含 2 张图文章
→ 草稿创建
→ 微信后台可见
→ 本地修改产生 v2
→ update draft
→ 微信后台内容更新
```

---

## 26. 开发阶段

### Phase 0 — Foundation / Upstream（当前进行中）

目标：停止旧架构扩张，建立 V1 干净入口。

- [x] 创建 `feat/v1-foundation` 分支
- [x] 锁定 doocs/md commit
- [x] 加入 bootstrap 脚本
- [x] 加入第三方许可说明
- [x] 定义 Document/Revision/Snapshot/RemoteDraft
- [x] SQLite Foundation
- [x] Local API Foundation
- [x] 第一批领域测试

### Phase 1 — Document Workspace

目标：先解决用户当前最痛的问题。

- [ ] Working Copy
- [ ] Revision commit policy
- [ ] Revision history UI
- [ ] Diff UI
- [ ] Document list
- [ ] Auto save
- [ ] OUTDATED/SYNCED UI
- [ ] 恢复历史版本

**验收：**同步远程草稿后继续编辑不会锁稿；关闭浏览器重开不丢内容；能查看历史版本和差异。

### Phase 2 — doocs Renderer Integration

- [ ] bootstrap 后安装 upstream 依赖
- [ ] Renderer Adapter
- [ ] Theme discovery
- [ ] 实时 Preview
- [ ] RenderProfile
- [ ] Snapshot
- [ ] Copy Rich HTML
- [ ] golden tests

**验收：**编辑器右侧实时显示真实公众号 HTML；Preview/Copy/Snapshot hash 一致。

### Phase 3 — Layout / Components

- [ ] WeChatFlow Semantic Components
- [ ] Component Palette
- [ ] Theme Pack
- [ ] 自定义参数面板
- [ ] AI Layout advisor

### Phase 4 — AI Article Agent

- [ ] Provider abstraction
- [ ] DeepSeek preset
- [ ] Custom OpenAI-compatible
- [ ] Brand Profile
- [ ] Planner
- [ ] Writer
- [ ] Revision Proposal
- [ ] Diff accept/reject

### Phase 5 — Image Workflow

- [ ] ImageSlot
- [ ] Image Director
- [ ] Upload
- [ ] AI Image Provider
- [ ] Host Agent image handoff
- [ ] Asset panel

### Phase 6 — Review

- [ ] Reviewer schema
- [ ] AI-style detection prompt
- [ ] risk/blocker
- [ ] targeted revision
- [ ] quality gate

### Phase 7 — WeChat Sync

- [ ] Account config
- [ ] Secret abstraction
- [ ] access token
- [ ] image resolver
- [ ] cover
- [ ] draft/add
- [ ] draft/update
- [ ] prepare/approval
- [ ] RemoteDraft UI

### Phase 8 — MCP / WorkBuddy / Codex

- [ ] MCP discovery
- [ ] Document tools
- [ ] Agent revision tools
- [ ] Render tools
- [ ] Review tools
- [ ] prepare sync
- [ ] approval sync

### Phase 9 — Product polish

- [ ] Onboarding
- [ ] 示例稿
- [ ] Demo GIF
- [ ] Error UX
- [ ] Metrics
- [ ] Docker / desktop packaging investigation

---

## 27. Windows 本地开发环境

V1 与旧 Miniconda 环境独立。

推荐：

```powershell
node --version
# >= 22.22.2

corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Clone 用户仓库：

```powershell
git clone https://github.com/emdysq/WeChatFlow.git
cd WeChatFlow
git checkout feat/v1-foundation
cd v1
```

拉取固定 doocs 上游：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-upstream.ps1
```

Foundation 测试：

```powershell
node --experimental-strip-types --test tests/foundation.test.ts
```

当前 Foundation 使用 Node 内置 `node:sqlite`，因此目前不需要 Miniconda，也没有 Python 依赖。

正式接入 doocs 后将运行：

```powershell
cd upstream/doocs-md
pnpm install
```

注意：doocs 上游自身 Node 版本要求应优先遵循其锁定版本。

---

## 28. 当前已经完成的 V1 代码

当前基础代码已经包含：

```text
v1/upstream/doocs-md.lock.json
v1/scripts/bootstrap-upstream.*
v1/packages/domain/src/types.ts
v1/packages/storage/src/sqlite-store.ts
v1/packages/core/src/document-service.ts
v1/apps/api/src/server.ts
v1/tests/foundation.test.ts
```

已经验证：

```text
1. 创建本地稿件
2. 产生 Revision 1
3. 创建 RenderSnapshot
4. 记录一个远程草稿
5. syncState = SYNCED
6. 继续编辑产生 Revision 2
7. syncState = OUTDATED
```

这意味着 V1 第一条核心产品不变量已经进入代码，而不再只是设计：

> **创建微信草稿永远不会锁死本地文档。**

---

## 29. 当前 Foundation 数据库 Schema

已经落地：

```sql
CREATE TABLE documents (...);
CREATE TABLE revisions (...);
CREATE TABLE render_snapshots (...);
CREATE TABLE remote_drafts (...);
```

下阶段迁移增加：

```text
document_working_copies
article_plans
image_slots
assets
brand_profiles
review_reports
agent_runs
wechat_accounts
sync_attempts
approval_tokens
```

数据库迁移不能继续长期靠 `CREATE TABLE IF NOT EXISTS`；进入 Phase 2 前引入 schema version / migrations。

---

## 30. 当前技术债务（明确记录）

Foundation 有意保持轻量，以下不是最终实现：

1. 当前使用 Node 22 `node:sqlite`；Node 22 中仍可能带实验警告。Phase 1 结束前评估继续使用、升级 Node baseline 或切换成熟 SQLite driver。
2. 当前 Local API 使用 Node 原生 `http`，只是 Domain 验证入口；正式 API 可迁移到 Hono/Fastify 等轻量框架，但不能因此改变 Domain。
3. 当前 `remote-drafts` API 只记录领域状态，不调用微信。
4. Renderer Adapter 尚未真正执行 doocs/md，因为需要用户本地 bootstrap upstream 并安装 pnpm 依赖。
5. Working Copy 尚未实现，所以现在每次显式 save 都可能创建 Revision；Web 接入时必须修正。
6. 未加入 Auth；V1 本地单用户可以不做复杂 RBAC，但如果服务绑定非 localhost，必须增加认证。
7. 尚未实现 migrations。

---

## 31. Definition of Done

一个功能只有同时满足以下要求才算完成：

- 产品行为与文档一致。
- Domain 不变量有自动测试。
- Error 有明确 code/action。
- Secret 不进入日志/数据库明文/Git。
- UI 不会隐藏危险副作用。
- 对用户可恢复：失败不丢正文。
- Agent 接口使用结构化输入输出。
- 如果涉及微信副作用，有 inspect/prepare 阶段。
- README/Development doc 同步更新。

---

## 32. V1.0 最终验收场景

用户输入：

```text
写一篇“为什么 AI Agent 会改变传统 SaaS”的公众号文章，
面向产品经理，3000 字，少 AI 味，规划 3~4 张真正有信息价值的配图。
```

系统应完成：

```text
Article Plan
→ 用户确认/调整
→ AI 初稿
→ 图片位置与 Prompt
→ 实时公众号排版
→ 用户修改
→ Agent 定向修改 + Diff
→ AI Review
→ 用户处理问题
→ RenderSnapshot
→ 微信 readiness
→ 用户确认
→ 创建微信草稿
```

用户随后修改一句话：

```text
Local v10
WeChat v9
OUTDATED
```

用户点击“更新微信草稿”：

```text
生成 v10 Snapshot
→ readiness
→ confirm
→ draft/update
→ Local v10 / WeChat v10 / SYNCED
```

同时，富文本复制必须来自相同 Snapshot。

这才是 WeChatFlow V1.0 的完成标准。
