# Tasks: WeChatFlow MVP

## Phase 1 — Foundation

- [x] T001 Create FastAPI application, settings and SQLite database bootstrap.
- [x] T002 Define Article, PublishJob and JobLog models.
- [x] T003 Add environment-based WeChat configuration and safe `.env.example`.

## Phase 2 — P1 Article Workspace

- [x] T004 Implement Markdown-to-WeChat renderer with inline styles.
- [x] T005 Implement article CRUD API.
- [x] T006 Implement image upload endpoint.
- [x] T007 Build article editor/import/cover/preview UI.

## Phase 3 — P1 Validation and Dry-run

- [x] T008 Implement structured preflight checks.
- [x] T009 Implement publish job stage/log persistence.
- [x] T010 Implement dry-run terminal path with no external side effects.

## Phase 4 — P1 Draft Integration

- [x] T011 Implement isolated WeChatClient with mock/live modes.
- [x] T012 Implement access-token caching and WeChat error mapping.
- [x] T013 Implement body-image rewrite/upload flow.
- [x] T014 Implement cover material upload.
- [x] T015 Implement draft creation and persist media ID.

## Phase 5 — P2 Operations

- [x] T016 Build dashboard metrics/recent jobs table.
- [x] T017 Build task detail/timeline view.
- [x] T018 Build settings/connection-test view.

## Phase 6 — Quality and Delivery

- [x] T019 Add unit tests for rendering, validation and client errors.
- [x] T020 Add integration tests for article/dry-run/mock-publish API.
- [x] T021 Add GitHub Actions CI.
- [x] T022 Add Dockerfile, Compose, README and demo content.
