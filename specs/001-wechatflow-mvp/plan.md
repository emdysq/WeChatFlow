# Implementation Plan: WeChatFlow MVP

**Branch**: `001-wechatflow-mvp` | **Date**: 2026-08-30 | **Spec**: `specs/001-wechatflow-mvp/spec.md`

**Input**: Feature specification from `specs/001-wechatflow-mvp/spec.md`

## Summary

Build a lightweight web application for Markdown-based WeChat Official Account publishing. The product separates safe content preparation and dry-run from side-effectful WeChat draft creation, uses explicit workflow stages and structured errors, and defaults to a recruiter-friendly mock mode. The implementation uses FastAPI, SQLAlchemy/SQLite, server-rendered Jinja2 pages, vanilla JavaScript, and a dedicated `WeChatClient` abstraction.

## Technical Context

**Language/Version**: Python 3.11+

**Primary Dependencies**: FastAPI, SQLAlchemy 2.x, Jinja2, Mistune, BeautifulSoup4, httpx, pydantic-settings

**Storage**: SQLite via SQLAlchemy; schema is portable to MySQL/PostgreSQL for later deployment

**Testing**: pytest + FastAPI TestClient + httpx MockTransport

**Target Platform**: Local developer machine or small Linux server/container

**Project Type**: Web application / internal B2B workflow tool

**Performance Goals**: P95 local CRUD/validation under 300 ms excluding external image/API calls; demo workflow supports dozens of jobs/day without additional infrastructure

**Constraints**: Secrets must not be persisted or echoed; mass-send is out of scope; mock mode must work offline from WeChat; no queue/Redis/Celery in MVP

**Scale/Scope**: Single deployment, one account configuration, four web views, five core API groups, three database tables

## Constitution Check

- Workflow before automation: PASS — stops at draft creation and preserves human final review.
- Security by default: PASS — secrets are env-only; upload MIME/size checks included.
- Testable slices: PASS — renderer, validator, client error mapping, dry-run and publish API are testable independently.
- Observable state: PASS — every publish job persists stage/status/error/logs.
- Simplicity/demoability: PASS — no distributed queue; mock mode defaults true.

## Project Structure

### Documentation

```text
specs/001-wechatflow-mvp/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/openapi.yaml
└── tasks.md
```

### Source Code

```text
app/
├── api/
├── clients/
├── models/
├── services/
├── static/
├── templates/
├── config.py
├── database.py
├── dependencies.py
├── schemas.py
├── web.py
└── main.py

tests/
├── unit/
└── integration/
```

**Structure Decision**: Single FastAPI application with explicit service/client layers. Server-rendered pages minimize frontend complexity while still presenting a polished B2B workflow UI.

## Complexity Tracking

No constitution violations. Distributed job infrastructure, authentication, RBAC, multi-account support, and scheduled publishing are intentionally deferred.
