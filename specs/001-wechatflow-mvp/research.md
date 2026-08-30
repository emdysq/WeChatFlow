# Research: WeChatFlow MVP

## Decision 1 — Human-in-the-loop boundary

**Decision**: Automate through WeChat draft creation only; do not mass-send automatically.

**Rationale**: Draft creation captures most repetitive operator work while keeping the irreversible/high-risk publishing decision with a human. It also produces a cleaner FDE/product story than a black-box “auto publish” script.

## Decision 2 — Mock mode as first-class capability

**Decision**: `WECHAT_MOCK=true` is the default for local/demo environments.

**Rationale**: Real WeChat credentials and IP whitelist configuration are not available to every reviewer. Mock mode keeps the complete stage model, generated media ID, logs, UI and API testable without secrets.

## Decision 3 — Synchronous workflow in MVP

**Decision**: Execute publish workflow synchronously in-process.

**Rationale**: Current scope is a small internal tool. A queue would add operational complexity without improving the portfolio value of the core workflow. Explicit stages make future background execution straightforward.

**Deferred alternative**: Celery/RQ/Arq with Redis for multi-worker production workloads.

## Decision 4 — Server-rendered UI

**Decision**: Jinja2 + vanilla JavaScript instead of React/Vue.

**Rationale**: The product has four simple views. Keeping one Python project reduces build/setup cost and makes the repository easier to explain in interviews.

## Decision 5 — WeChat API isolation

**Decision**: All external WeChat behavior lives in `app/clients/wechat_client.py`.

**Rationale**: Keeps business workflow testable, allows `httpx.MockTransport` tests, and makes future relay/server integration possible without rewriting product logic.

## WeChat integration surface used by MVP

The client is designed around the standard Official Account flow:

1. obtain `access_token` with AppID/AppSecret;
2. upload article-body images to receive WeChat-hosted URLs;
3. upload cover image as material to obtain `thumb_media_id`;
4. call draft creation and store returned `media_id`.

Production users should verify account capabilities and current WeChat Official Account documentation before deployment because endpoint permissions and platform constraints can vary by account type and policy.
