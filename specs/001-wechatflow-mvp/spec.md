# Feature Specification: WeChatFlow MVP

**Feature Branch**: `001-wechatflow-mvp`

**Created**: 2026-08-30

**Status**: Implemented MVP

**Input**: Build a lightweight internal product that turns a Markdown article into a validated, previewable WeChat Official Account draft while exposing task state and actionable errors.

## User Scenarios & Testing

### User Story 1 - Prepare and Preview an Article (Priority: P1)

As a content operator, I want to import or paste Markdown, edit title/author/digest, attach a cover, and preview WeChat-style HTML so I can review the content before any external API side effect.

**Why this priority**: Without trustworthy input and preview, no later automation is safe or useful.

**Independent Test**: Create an article with Markdown, save it, request preview, and verify rendered headings/paragraphs are returned without invoking WeChat APIs.

**Acceptance Scenarios**:

1. **Given** a new article, **When** the operator saves Markdown, **Then** the system persists the article and stores rendered HTML.
2. **Given** saved Markdown, **When** preview is requested, **Then** the system returns inline-styled HTML suitable for visual review.

---

### User Story 2 - Run a Preflight Check and Dry-run (Priority: P1)

As a content operator, I want a preflight check and dry-run so I can detect missing title/content/cover and verify the workflow without creating a WeChat draft.

**Why this priority**: It protects the external integration and provides a safe demo path.

**Independent Test**: Run validation on an incomplete article and observe blocking checks; run dry-run on a valid article and verify a SUCCESS job with `DRY_RUN_COMPLETE` and no media ID.

**Acceptance Scenarios**:

1. **Given** an article without a title, **When** validation runs, **Then** readiness is false and `ARTICLE_TITLE_MISSING` is returned.
2. **Given** a valid article, **When** dry-run runs, **Then** the workflow completes without calling image or draft APIs.

---

### User Story 3 - Create a WeChat Draft (Priority: P1)

As a content operator, I want the system to upload article images and cover material, create a WeChat draft, and return the resulting media ID so repetitive publishing steps are reduced.

**Why this priority**: This is the primary business value of the product.

**Independent Test**: In mock mode, publish a valid article with a cover and verify the workflow reaches SUCCESS with a mock media ID and complete stage logs.

**Acceptance Scenarios**:

1. **Given** a valid article and configured integration, **When** draft creation starts, **Then** the system processes article images, uploads the cover, creates the draft, and records SUCCESS.
2. **Given** a WeChat API error, **When** a stage fails, **Then** the job becomes FAILED with a structured error code and operator-readable message.

---

### User Story 4 - Diagnose Publishing Failures (Priority: P2)

As an operator or FDE, I want a task detail view with ordered stage logs, current stage, error code, and error message so I can rapidly diagnose configuration or API failures.

**Why this priority**: Operational visibility turns a script into a supportable B2B workflow product.

**Independent Test**: Force a client failure and verify the persisted job includes FAILED status, error code, message, and log entries.

**Acceptance Scenarios**:

1. **Given** a failed job, **When** the operator opens task details, **Then** all recorded stages are visible in order.
2. **Given** an IP whitelist-related WeChat error, **When** it is mapped, **Then** the operator sees `WX2002` and guidance indicating the IP whitelist as the likely cause.

### Edge Cases

- Empty Markdown, missing title, missing cover for live publish.
- Oversized uploaded image.
- Unsupported non-image file uploaded as a cover.
- Remote article image cannot be downloaded.
- Access token invalid or AppID/AppSecret misconfigured.
- Server IP not present in the WeChat API whitelist.
- WeChat returns a successful HTTP response with an `errcode` payload.
- Dry-run must never require real WeChat credentials.

## Requirements

### Functional Requirements

- **FR-001**: System MUST allow operators to create and update article metadata and Markdown content.
- **FR-002**: System MUST render Markdown to conservative inline-styled HTML for preview and draft content.
- **FR-003**: System MUST provide a preflight validation response with passed, warning, and failed checks.
- **FR-004**: System MUST support uploading image assets to a local upload area with MIME and size validation.
- **FR-005**: System MUST support a dry-run path that does not call WeChat material or draft APIs.
- **FR-006**: System MUST model publish jobs using explicit workflow stages and terminal SUCCESS/FAILED states.
- **FR-007**: System MUST persist operator-readable job logs.
- **FR-008**: System MUST isolate WeChat API calls behind a dedicated client.
- **FR-009**: System MUST support mock mode that completes the draft workflow without external credentials.
- **FR-010**: In live mode, system MUST acquire and cache a WeChat access token.
- **FR-011**: In live mode, system MUST upload article body images to obtain WeChat-hosted URLs.
- **FR-012**: In live mode, system MUST upload cover material and obtain a `thumb_media_id`.
- **FR-013**: In live mode, system MUST create a WeChat draft and persist the returned media ID.
- **FR-014**: System MUST never expose `WECHAT_APP_SECRET` in the UI or repository.
- **FR-015**: System MUST provide a connection test endpoint for mock/live integration verification.

### Key Entities

- **Article**: draft content, metadata, rendered HTML, cover path, and lifecycle status.
- **PublishJob**: one dry-run or draft-creation execution for an article, including stage, terminal status, media ID, and error information.
- **JobLog**: ordered human-readable events emitted by a publish job.
- **WeChat Account Configuration**: environment-provided AppID/AppSecret and API endpoint settings; not persisted as a database entity in MVP.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A reviewer can clone the project, start it in mock mode, create an article, run dry-run, and create a mock draft in under 10 minutes following README only.
- **SC-002**: 100% of publish jobs end in a terminal SUCCESS or FAILED state with at least one operator-readable log event.
- **SC-003**: Missing title/content/cover are detected before any live draft-creation call.
- **SC-004**: Mock-mode draft creation completes without AppID/AppSecret and returns a media ID suitable for end-to-end demonstration.
- **SC-005**: Core unit/integration tests pass in CI from a clean checkout.

## Assumptions

- V1 targets one WeChat Official Account configuration per deployment.
- Final mass-send remains out of scope; humans review the draft in the WeChat backend.
- Article authors have network access when remote images must be fetched in live mode.
- SQLite is sufficient for the MVP/demo scale; database replacement is possible through SQLAlchemy.
- A small team is expected, so authentication/RBAC is out of scope for V0.1 and must be added before multi-tenant production use.
