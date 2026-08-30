# WeChatFlow Constitution

## Core Principles

### I. Workflow Before Automation
Every feature MUST make the publishing workflow more observable, reversible, or efficient. We do not automate high-risk final mass-publishing in MVP; the system stops at WeChat draft creation so a human retains final review.

### II. Security by Default
Secrets MUST come from environment variables or a secret manager and MUST never be committed, logged, echoed in UI, or stored as plaintext application records. External URLs and uploaded files MUST be validated before processing.

### III. Testable Slices
Each user story MUST be independently testable. Core services (rendering, validation, WeChat client, publish workflow) MUST have unit or integration coverage before the feature is considered complete.

### IV. Observable State
Long-running or multi-step work MUST expose an explicit stage, status, error code, and operator-readable message. Failure must identify the stage and next action whenever possible.

### V. Simplicity and Demoability
The MVP MUST favor a small, explainable architecture over infrastructure-heavy design. A clean local mock mode MUST allow recruiters, reviewers, and developers to demonstrate the complete workflow without possessing production WeChat credentials.

## Product & Technical Constraints

- MVP target user: a small content/operations team publishing Markdown-based articles to one WeChat Official Account.
- Primary output: WeChat draft, never automatic mass-send.
- Primary stack: Python 3.11+, FastAPI, SQLAlchemy, SQLite, Jinja2/vanilla JavaScript.
- External integration: WeChat Official Account API behind a dedicated client abstraction.
- Credentials: environment variables only for MVP.
- Mock mode must remain the default in `.env.example`.

## Development Workflow & Quality Gates

1. Specification precedes implementation.
2. Requirements and success criteria must be measurable or explicitly marked as assumptions.
3. The implementation plan must pass this constitution before coding.
4. New workflow stages require corresponding operator logs and tests.
5. CI must run the test suite on every push and pull request.
6. README and quickstart must stay runnable from a clean checkout.

## Governance

This constitution supersedes convenience decisions. Any exception must be documented in the implementation plan under Complexity Tracking with a reason and a simpler rejected alternative. Changes to security, human-review boundaries, or credential handling require a constitution amendment.

**Version**: 1.0.0 | **Ratified**: 2026-08-30 | **Last Amended**: 2026-08-30
