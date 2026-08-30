# WeChatFlow V1 foundation

This directory is the new V1 line. The old FastAPI implementation remains a POC and is not the V1 architectural base.

## Current status

- Phase 0: upstream strategy frozen; `doocs/md` pinned by commit and bootstrap scripts added.
- Phase 1 foundation: `Document` / immutable `Revision` / immutable `RenderSnapshot` / `RemoteDraft` model implemented.
- SQLite is the shared source of truth for Web and future MCP/Agent clients.
- A local HTTP API exists for document creation, revision saving, snapshot recording and remote draft sync bookkeeping.
- Core invariant is tested: creating a WeChat draft never locks the local document; later edits move sync state from `SYNCED` to `OUTDATED`.

## Requirements

V1 follows the doocs/md toolchain baseline and targets Node.js >= 22.22.2.

## Foundation test

```bash
cd v1
node --experimental-strip-types --test tests/foundation.test.ts
```

## API

```bash
cd v1
node --experimental-strip-types apps/api/src/server.ts
```

Health:

```text
GET http://127.0.0.1:8787/health
```

## Bootstrap pinned doocs/md

Windows PowerShell:

```powershell
cd v1
powershell -ExecutionPolicy Bypass -File scripts/bootstrap-upstream.ps1
```

Cross-platform Node:

```bash
node scripts/bootstrap-upstream.mjs
```

The upstream checkout is ignored by Git. WeChatFlow-specific changes will live in our own packages/adapters so upstream can be upgraded deliberately instead of becoming an unmergeable fork.
