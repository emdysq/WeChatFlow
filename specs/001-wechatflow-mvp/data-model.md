# Data Model: WeChatFlow MVP

## Article

| Field | Type | Notes |
|---|---|---|
| id | integer PK | Auto-increment |
| title | string | Required for readiness |
| author | string | Optional |
| digest | string | Optional, warning when long |
| markdown_content | text | Source of truth for editing |
| html_content | text | Latest rendered output |
| cover_path | string/null | Local path or URL-like asset path |
| status | string | `DRAFT` / `DRAFT_CREATED` |
| created_at | datetime | UTC |
| updated_at | datetime | UTC |

## PublishJob

| Field | Type | Notes |
|---|---|---|
| id | string PK | Human-readable `WF-YYYYMMDD-NNNN` |
| article_id | FK | Related Article |
| status | string | `RUNNING`, `SUCCESS`, `FAILED` |
| current_stage | string | Workflow stage |
| media_id | string/null | Returned by mock/live draft API |
| error_code | string/null | Structured operator-facing code |
| error_message | text/null | Human-readable diagnosis |
| dry_run | bool | If true no side-effectful WeChat calls |
| started_at | datetime | UTC |
| finished_at | datetime/null | UTC |

## JobLog

| Field | Type | Notes |
|---|---|---|
| id | integer PK | Ordered event id |
| job_id | FK | Related PublishJob |
| stage | string | Stage that emitted event |
| level | string | INFO / ERROR |
| message | text | Operator-readable event |
| created_at | datetime | UTC |

## Workflow State Model

`CREATED → VALIDATING → RENDERING → [DRY_RUN_COMPLETE]`

Live path:

`CREATED → VALIDATING → RENDERING → UPLOADING_ASSETS → UPLOADING_COVER → CREATING_DRAFT → SUCCESS`

Any live or dry-run path can terminate at `FAILED`.
