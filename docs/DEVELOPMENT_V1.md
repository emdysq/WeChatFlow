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
  test(): Promise<ProviderCheck>
  generate(request: LlmRequest): Promise<LlmResponse>
  stream?(request: LlmRequest): AsyncIterable<LlmChunk>
}
```

Provider：

```text
DeepSeek
OpenAI
Qwen
Gemini
Doubao
OpenRouter
SiliconFlow
Custom OpenAI-compatible
```

V1 第一批至少完成：

- DeepSeek
- Custom OpenAI-compatible

不要把具体 Provider 写入 Planner/Writer。

---

## 13. Article Agent 工作流

### 13.1 Planner

输入：用户一句话、资料、Brand Profile。

输出严格 JSON：

```json
{
  "objective": "解释 AI Agent 对 SaaS 产品交互的影响",
  "audience": ["产品经理", "AI 从业者"],
  "thesis": "GUI 不会消失，但将不再是唯一入口",
  "targetLength": 3200,
  "sections": [],
  "imageSlots": [],
  "riskNotes": []
}
```

Planner 不直接写全文。

### 13.2 Writer

输入 ArticlePlan。

职责：

- 完成 Markdown 初稿。
- 遵循 Brand Profile。
- 不凭空删除 ImageSlot。
- 不输出自由 CSS。
- 不调用 Publisher。

### 13.3 Image Director

职责：

- 判断哪里真的需要图。
- 选择视觉类型：概念图、流程图、数据图、截图、信息图。
- 输出 Prompt、比例、ALT、说明。

### 13.4 Editor

负责定向改写，而不是每次整篇生成。

### 13.5 Reviewer

负责质量评分和 issue 列表，不直接静默修改正文。

### 13.6 Revision Agent

根据 Reviewer 或用户指令形成 Patch Proposal。

### 13.7 Publisher

Publisher 不是 LLM Agent，而是确定性服务。

---

## 14. AI 改稿 Diff 协议

AI 修改不能直接覆盖当前 Revision。

模型输出：

```ts
RevisionProposal {
  id
  documentId
  baseRevisionId
  instruction
  operations: [
    {
      type: REPLACE_RANGE
      startAnchor
      endAnchor
      oldTextHash
      newText
      explanation
    }
  ]
}
```

Web 展示：

```diff
- 随着人工智能技术的快速发展，我们正在迎来一个全新的时代。
+ 过去我们使用软件，首先得学会它的界面；Agent 出现之后，这件事开始变化。
```

用户：

```text
接受
拒绝
继续修改
```

Accept 时必须检查：

```text
proposal.baseRevisionId == currentRevision.id
```

否则返回 Conflict，要求重新生成/重放，不能盲目套用旧 Patch。

---

## 15. 图片工作流

### 15.1 图片来源

```text
用户上传
远程 URL
AI 图片 Provider
宿主 Agent ImageGen
截图/图表
```

### 15.2 文本模型与图片模型分离

```text
LLM
→ 决定“需要什么图”
→ ImagePlan

ImageProvider
→ 负责“实际生成图”
```

DeepSeek 不需要具有生图能力也可以担任 Image Director。

### 15.3 V1 图片失败策略

图片生成失败不能毁掉正文。

```text
ImageSlot = FAILED
文章 = 可继续编辑
发布 readiness = blocker/warning（取决于 slot required）
```

### 15.4 微信前置处理

发布前所有图片必须解析成确定 Asset：

```text
Markdown image
→ Asset Resolver
→ 本地/远程读取
→ 安全校验
→ 微信上传
→ wechatUrl
→ Final Snapshot image rewrite
```

注意后续实现顺序：为严格满足 Snapshot 单一来源原则，可以把“平台中立 Snapshot”和“微信 Finalization”拆成两个不可变 artifact，但绝不能在发布时偷偷重新渲染正文。

---

## 16. Brand Profile

```ts
BrandProfile {
  id
  name
  accountPositioning
  audience
  preferredTopics
  tone
  titleStyle
  lengthRange
  bannedPhrases
  defaultRenderProfileId
  defaultImageStyle
  signature
}
```

示例 banned phrases：

```text
随着时代的发展
在当今数字化时代
让我们一起
值得注意的是
总而言之（频繁使用）
```

Brand Profile 被：

```text
Planner
Writer
Image Director
Reviewer
Layout Advisor
```

共同读取。

---

## 17. Review 与质量门禁

Review 输出：

```text
主线清晰度
结构
可读性
AI 套话
重复
标题质量
事实风险
图片相关性
公众号排版
```

示例：

```json
{
  "overallScore": 86,
  "recommendation": "REVISE",
  "issues": [
    {
      "severity": "medium",
      "type": "AI_CLICHE",
      "location": "section-2:p3",
      "message": "存在模板化 AI 总结句",
      "autoFixable": true
    }
  ]
}
```

只有 `autoFixable` issue 可以进入自动定向修订。

默认不无限重写，最多 1~2 轮。

---

## 18. 微信账号模型

```ts
WechatAccount {
  id
  name
  appId
  secretRef
  enabled
  connectionMode: DIRECT | RELAY
  relayUrl?
  createdAt
}
```

`secretRef` 指向环境/系统 Secret Store，而不是明文 Secret。

本地第一版可继续通过环境变量：

```text
WECHAT_APP_ID
WECHAT_APP_SECRET
```

但前端永远只显示 masked status。

---

## 19. 微信 Publisher Adapter

```ts
interface PublishAdapter {
  check(): Promise<PublishReadiness>
  uploadBodyImage(asset): Promise<WechatImage>
  uploadCover(asset): Promise<WechatCover>
  createDraft(snapshot, metadata): Promise<RemoteDraftResult>
  updateDraft(remoteDraft, snapshot, metadata): Promise<RemoteDraftResult>
}
```

实现：

```text
WechatDirectAdapter
WechatRelayAdapter
ClipboardAdapter
```

### 19.1 Direct 流程

```text
access_token
→ 正文图片 uploadimg
→ 封面 material
→ draft/add 或 draft/update
```

### 19.2 Clipboard 流程

Clipboard 不重新渲染。

```text
RenderSnapshot.html
→ ClipboardItem(text/html)
→ 微信后台粘贴
```

复制前显示：

```text
快照 v12
主题 Tech
Hash 3d7a...
```

---

## 20. MCP / Agent 协议

### 20.1 只读 discovery

```text
wechatflow.capabilities
wechatflow.list_documents
wechatflow.get_document
wechatflow.get_revision
wechatflow.list_themes
wechatflow.get_sync_state
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

### Phase 0 — Foundation / Upstream（已完成）

目标：停止旧架构扩张，建立 V1 干净入口。

- [x] 创建 `feat/v1-foundation` 分支
- [x] 锁定 doocs/md commit
- [x] 加入 bootstrap 脚本
- [x] 加入第三方许可说明
- [x] 定义 Document/Revision/Snapshot/RemoteDraft
- [x] SQLite Foundation
- [x] Local API Foundation
- [x] 第一批领域测试

### Phase 1 — Document Workspace（已完成）

目标：先解决用户当前最痛的问题。

- [x] Working Copy
- [x] Revision commit policy
- [x] Revision history UI
- [x] Diff UI
- [x] Document list
- [x] Auto save
- [x] OUTDATED/SYNCED UI
- [x] 恢复历史版本
- [x] Web/Agent 乐观并发控制（Working Copy version）
- [x] SQLite 重启恢复
- [x] schema user_version 迁移到 v2

**验收：**同步远程草稿后继续编辑不会锁稿；关闭浏览器重开不丢内容；能查看历史版本和差异。

### Phase 2 — doocs Renderer Integration（进行中）

- [ ] bootstrap 后安装 upstream 依赖（需要在有网络的开发机执行）
- [x] Renderer Adapter / bridge scaffold
- [ ] Theme discovery
- [x] 实时 Preview API 与 Web 接口
- [x] RenderProfile 基础映射
- [x] Snapshot 统一由 Renderer 生成，客户端不能注入最终 HTML
- [x] Copy Rich HTML UI（仅真实 doocs Preview 可用）
- [ ] renderer golden tests（等待 upstream 本地安装后固化）

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

当前代码已经进入可操作的 **Document Workspace** 阶段：

```text
v1/upstream/doocs-md.lock.json
v1/scripts/bootstrap-upstream.*
v1/packages/domain/src/types.ts
v1/packages/storage/src/sqlite-store.ts
v1/packages/core/src/document-service.ts
v1/packages/core/src/diff.ts
v1/packages/core/src/render-service.ts
v1/packages/renderer-doocs/src/adapter.ts
v1/packages/renderer-doocs/src/bridge.ts
v1/apps/api/src/server.ts
v1/apps/web/public/index.html
v1/apps/web/public/app.js
v1/apps/web/public/styles.css
v1/tests/foundation.test.ts
v1/tests/workspace.test.ts
v1/tests/api.test.ts
```

已经验证的领域行为：

```text
1. 创建 Document + Revision 1 + Working Copy
2. 编辑时只更新 Working Copy，不制造无意义 Revision
3. 600ms Web debounce 自动保存 Working Copy
4. 30s idle 或手动“保存版本”才生成 immutable Revision
5. Working Copy 使用 version 做乐观并发控制，防止 Web/Agent 静默互相覆盖
6. 创建微信远程草稿后仍可继续修改
7. Working Copy 一旦有修改，syncState 立即从 SYNCED 变为 OUTDATED
8. 历史恢复不会删除后续版本，而是创建新的 restore Revision
9. Revision ↔ Working Copy / Revision ↔ Revision 可做行级 Diff
10. SQLite 重启后未 checkpoint 的 Working Copy 仍然存在
11. Dashboard 可以列出稿件、本地版本、微信版本和同步状态
12. Editor 已有版本历史、Diff、恢复、自动保存、Checkpoint、Preview 面板
```

当前自动测试基线：

```text
14 passed
```

这意味着 V1 第一条核心产品不变量已经完整进入代码和 UI，而不再只是设计：

> **创建微信草稿永远不会锁死本地文档；自动保存也不会污染不可变版本历史。**

Phase 2 也已经建立 doocs renderer bridge。服务器会明确返回 renderer readiness；如果 upstream 尚未 bootstrap 或依赖未安装，Web 只显示带警告的基础 Markdown 回退预览，并禁止把它当作正式 RenderSnapshot。真实 doocs renderer 可用后，Preview、富文本复制和 RenderSnapshot 都走同一个 adapter。

---

## 29. 当前 Foundation 数据库 Schema

Schema 已升级到 `PRAGMA user_version = 2`，并支持从 Foundation 数据库自动 backfill Working Copy：

```sql
CREATE TABLE documents (...);
CREATE TABLE revisions (...);
CREATE TABLE document_working_copies (...);
CREATE TABLE render_snapshots (...);
CREATE TABLE remote_drafts (...);
```

`document_working_copies` 保存：

```text
document_id
base_revision_id
title
markdown
content_hash
version          # 乐观并发版本号
updated_at
```

后续阶段继续增加：

```text
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

从现在开始所有 schema 变化必须递增 `user_version` 并提供迁移逻辑，不允许只依赖最新建表 SQL。

---

## 30. 当前技术债务（明确记录）

当前剩余技术债务：

1. 当前使用 Node 22 `node:sqlite`；部分 Node 22 版本仍显示实验警告。V1 本地单用户阶段继续使用，桌面打包前再评估驱动切换。
2. Local API 仍使用 Node 原生 `http`；Phase 1 已证明足够稳定，后续是否迁移 Hono/Fastify 以真实需求为准，不能为换框架而换框架。
3. `remote-drafts` POST 仍只是 Foundation bookkeeping，不调用真实微信；Phase 7 才加入 prepare/approval + 微信副作用。
4. doocs Renderer Adapter/bridge 已写好，但当前执行环境无外网，无法 clone/install 上游依赖；需要在用户 Windows 开发机完成 bootstrap + `pnpm install` 后做真实 golden test。
5. 当前 Web 是 V1 Workspace 的轻量原生实现，目的是先冻结 Domain 行为；Phase 2/3 接入 doocs 编辑器能力后再决定是继续嵌入还是迁移 Vue 页面。
6. 未加入 Auth；服务仍只绑定 `127.0.0.1`。未来若允许 LAN/公网访问，必须先加认证。
7. `beforeunload` 的 sendBeacon 仅做 best-effort；真正可靠性来自 600ms 持久化 Working Copy，而不是关闭页面瞬间的请求。
8. Renderer Theme discovery 尚未接入；当前 Web 只暴露 doocs 基础 `default/grace/simple`。

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
