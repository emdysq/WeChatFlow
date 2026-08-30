# WeChatFlow

> 面向微信公众号内容团队的自动化投稿与草稿发布工作台。

WeChatFlow 将 **Markdown 内容、发布前检查、微信公众号兼容排版、素材处理、草稿创建、任务状态与错误追踪** 串成一条可观察、可验证的工作流。

项目采用 GitHub Spec Kit 的 Spec-Driven Development 思路组织需求、架构与实现，并保留 Mock 模式，方便在没有真实公众号凭据的环境中演示完整流程。

## 核心能力

- Markdown / 文本文章录入与预览
- 发布前 Preflight Check
- 微信公众号兼容 HTML 渲染
- 正文图片与封面素材处理
- 微信公众号 access token 与草稿接口封装
- Dry-run 无副作用演练
- Mock / Live 双模式
- 显式发布状态机与结构化错误码
- 任务日志与问题定位
- FastAPI + SQLite + SQLAlchemy
- Docker、GitHub Actions 与 pytest

## MVP 工作流

```text
文章输入
  ↓
VALIDATING
  ↓
RENDERING
  ↓
UPLOADING_ASSETS
  ↓
UPLOADING_COVER
  ↓
CREATING_DRAFT
  ↓
SUCCESS / FAILED
```

正式群发不属于 V0.1 范围。系统只负责把内容安全地推进到公众号草稿箱，保留人工最终审核。

## 快速开始

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Windows 可使用：

```powershell
copy .env.example .env
```

访问：

- Web UI: `http://127.0.0.1:8000`
- API Docs: `http://127.0.0.1:8000/docs`

默认 `.env.example` 使用：

```env
WECHAT_MOCK=true
```

因此无需 AppID / AppSecret 即可体验文章校验、渲染、Dry-run、Mock 草稿创建和任务日志。

## Demo 数据

```bash
python scripts/seed_demo.py
```

或：

```bash
make seed
```

## 测试

```bash
pytest -q
```

当前 MVP 测试覆盖：

- Markdown 渲染
- 发布前校验
- Mock 微信客户端
- 文章/API/发布任务集成流程

## Live 模式

真实微信公众号联调时，在本地 `.env` 设置：

```env
WECHAT_MOCK=false
WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret
```

请勿将真实 AppSecret 提交到 GitHub。运行环境还需要满足微信公众号 API 的账号权限及 IP 白名单要求。

## 项目结构

```text
app/
├── api/          # REST API
├── clients/      # 微信 API Client
├── models/       # SQLAlchemy Models
├── services/     # 业务服务
├── static/       # CSS / JavaScript
├── templates/    # B 端 Web UI
├── config.py
├── database.py
├── dependencies.py
├── schemas.py
├── web.py
└── main.py

specs/001-wechatflow-mvp/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
└── contracts/openapi.yaml

tests/
├── unit/
└── integration/
```

## Spec-Driven Development

WeChatFlow 的 MVP 按以下链路组织：

```text
Constitution
   ↓
Specification
   ↓
Implementation Plan
   ↓
Tasks
   ↓
Implementation
   ↓
Verification
```

对应文档位于 `.specify/` 与 `specs/001-wechatflow-mvp/`。

## V0.1 范围

### P0

- 文章创建和编辑
- Markdown 渲染
- 发布预览
- Preflight Check
- Dry-run
- 图片/封面素材处理
- 草稿创建
- 发布任务状态
- 错误日志
- Mock 微信客户端

### 后续方向

- 多公众号管理
- 批量投稿
- 定时任务
- 失败任务重试
- 排版主题
- 发布历史统计
- AI 摘要、标题与内容检查

## 安全设计

- `.env` 不进入 Git
- AppSecret 不写入前端页面
- 正式草稿创建前执行校验
- Dry-run 不调用有副作用的微信写接口
- 微信 API 错误转换为内部结构化错误码
- V0.1 不提供自动群发能力

## License

MIT
