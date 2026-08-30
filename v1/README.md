# WeChatFlow V1

V1 is the new product line for an **AI-native WeChat Official Account content workspace**. The old FastAPI V0.x implementation remains a technical POC; it is not the V1 architectural base.

## Current status

### Phase 0 — complete

- `doocs/md` pinned by commit and bootstrap scripts.
- Third-party license strategy documented.
- Domain foundation: `Document`, immutable `Revision`, immutable `RenderSnapshot`, `RemoteDraft`.

### Phase 1 — Document Workspace complete

- Durable `WorkingCopy` stored in SQLite.
- Web autosave updates the working copy without polluting revision history.
- Manual/idle checkpoints create immutable revisions.
- Optimistic concurrency protects Web and future Agent clients from silent overwrite.
- Revision history, line diff and restore-as-new-revision are implemented.
- Sync state becomes `OUTDATED` as soon as the working copy diverges from the synced revision.
- Working copy survives process/browser restart.
- A local Web workspace is served by the same process as the API.

### Phase 2 — Renderer integration in progress

- doocs renderer adapter + bridge scaffold is implemented.
- Renderer readiness is explicit (`UPSTREAM_NOT_BOOTSTRAPPED`, `UPSTREAM_DEPENDENCIES_NOT_INSTALLED`, ...).
- Preview endpoint renders the working copy when doocs is available.
- RenderSnapshot endpoint checkpoints the working copy and renders the immutable revision server-side.
- Rich clipboard is enabled only for a real doocs render; fallback preview cannot be mistaken for final WeChat HTML.

## Requirements

V1 follows the doocs/md baseline and targets Node.js >= 22.22.2.

## Run tests

```bash
cd v1
node --experimental-strip-types --test tests/*.test.ts
```

Current baseline:

```text
14 passed
```

## Run the local workspace

```bash
cd v1
node --experimental-strip-types apps/api/src/server.ts
```

Open:

```text
http://127.0.0.1:8787
```

Health:

```text
GET http://127.0.0.1:8787/health
```

The UI already supports:

```text
Document list
→ open editor
→ autosave Working Copy
→ manual/30s idle checkpoint
→ revision history
→ diff with current Working Copy
→ restore old revision as a new revision
→ local/WeChat sync-state display
```

## Bootstrap pinned doocs/md

Windows PowerShell:

```powershell
cd v1
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-upstream.ps1
cd upstream/doocs-md
pnpm install
cd ../..
```

Cross-platform:

```bash
cd v1
node scripts/bootstrap-upstream.mjs
cd upstream/doocs-md
pnpm install
cd ../..
```

Then restart WeChatFlow. `/api/v1/renderer` should change from `available: false` to `available: true`.

The upstream checkout is ignored by Git. WeChatFlow-specific changes live in our own domain/adapters so upstream can be upgraded deliberately instead of becoming an unmergeable fork.
