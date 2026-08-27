# Phase 8B.3 — Publishing Gateway Runtime Report

**Repository:** `D:\ProjectIA\BopAgency\BopIAgency`
**Branch:** `feat/phase-8-campaign-operations`
**Completed Date:** 2026-08-27

---

## Executive Summary

Phase 8B.3 establishes the **Publishing Gateway Runtime** in **MODEL A (Synchronous n8n Execution)**. It connects the 8B.1 persistence state machine and the 8B.2 application orchestration use cases to real HTTP transport, multi-tenant worker dispatching, webhook evidence tracking, and deterministic test stubs without compromising database authority or security boundaries.

Key architectural principle enforced: **`dispatchPublicationJob` remains the single, exclusive outcome authority.** The publication webhook endpoint is strictly for **auditing and evidence logging**, completely preventing race conditions or competing outcome writers.

---

## Completed Architecture & Scope

### 1. N8n Publication Transport Adapter
* **File:** `packages/infrastructure/src/n8n/n8n-publication-transport.adapter.ts`
* Implements `ChannelPublisherPort` for HTTP transport towards n8n.
* Signs requests with HMAC SHA-256 using `PUBLICATION_WEBHOOK_SECRET` (`x-bop-timestamp`, `x-bop-signature`, `x-bop-event-id`).
* Enforces bounded timeouts via `AbortController`.
* Safe outcome mapping:
  * 2xx with `succeeded` & `externalId` -> `succeeded`
  * 2xx with `failed` -> `failed`
  * 202 (Accepted) -> `unknown_outcome` (transport acceptance is NOT publication success)
  * Timeout, 5xx, network error, malformed body -> `unknown_outcome`

### 2. Multi-Tenant Worker Dispatching (Model W1)
* **Files:**
  * `packages/application/src/use-cases/publications/list-dispatchable-publication-jobs.use-case.ts`
  * `apps/web/src/app/api/cron/publish-jobs/route.ts`
* Global service-role query (`listDispatchableJobs`) returning `queued` jobs across organizations in `created_at ASC, id ASC` order.
* Bounded batch size (hard cap 50, cron default 10).
* Worker route (`POST /api/cron/publish-jobs`) protected by `CRON_SECRET`.
* Authoritative row claiming via Postgres RPC `claim_publication_job`. Concurrent worker claims result in `CONFLICT` and are skipped gracefully.

### 3. Webhook Evidence Processing & Hash Mismatch Detection
* **Files:**
  * `packages/application/src/use-cases/publications/process-publication-webhook-evidence.use-case.ts`
  * `apps/web/src/lib/webhooks/publication-hmac.ts`
  * `apps/web/src/app/api/webhooks/publishing/callback/route.ts`
* **HMAC Verification**: Signed requests verified BEFORE `service_role` admin client is created. Requires `PUBLICATION_WEBHOOK_SECRET` (>=32 chars, no fallback to `AUTOMATION_WEBHOOK_SECRET`).
* **Hash Mismatch Detection**:
  * Same event ID + same hash -> `200 { ok: true, duplicate: true }` (benign duplicate).
  * Same event ID + different hash -> `409 Conflict` (suspicious replay). 0 job outcome mutations.
* **Evidence Only**: `processPublicationWebhookEvidence` correlates jobs and records evidence, but NEVER invokes `recordSuccess`, `recordFailure`, or `recordUnknownOutcome`.

### 4. Test Provider Stub
* **File:** `apps/web/src/app/api/test/publishing-provider-stub/route.ts`
* Usable only when `TEST_PROVIDER_ENABLED=true` env var is set (otherwise returns `404 Not Found`).
* Requires valid HMAC signature.
* Supports deterministic test modes: `succeeded`, `failed`, `unknown_outcome`, `timeout`, `malformed_success`.

---

## File Inventory

### Created (14 files):
1. `packages/infrastructure/src/n8n/n8n-publication-transport.adapter.ts`
2. `packages/infrastructure/src/n8n/__tests__/n8n-publication-transport.adapter.test.ts`
3. `packages/application/src/use-cases/publications/list-dispatchable-publication-jobs.use-case.ts`
4. `packages/application/src/use-cases/publications/process-publication-webhook-evidence.use-case.ts`
5. `packages/application/src/use-cases/publications/__tests__/list-dispatchable-and-callback.test.ts`
6. `apps/web/src/lib/webhooks/publication-hmac.ts`
7. `apps/web/src/lib/webhooks/__tests__/publication-hmac.test.ts`
8. `apps/web/src/app/api/webhooks/publishing/callback/route.ts`
9. `apps/web/src/app/api/webhooks/publishing/callback/payload.schema.ts`
10. `apps/web/src/app/api/webhooks/publishing/callback/__tests__/route.test.ts`
11. `apps/web/src/app/api/cron/publish-jobs/route.ts`
12. `apps/web/src/app/api/cron/publish-jobs/__tests__/route.test.ts`
13. `apps/web/src/app/api/test/publishing-provider-stub/route.ts`
14. `docs/implementation/phase-8/PHASE_8B3_PUBLISHING_GATEWAY_RUNTIME_REPORT.md`

### Modified (7 files):
1. `packages/domain/src/repositories/campaign-publication.repository.ts`
2. `packages/infrastructure/src/supabase/repositories/supabase-campaign-publication.repository.ts`
3. `packages/application/src/index.ts`
4. `packages/infrastructure/src/index.ts`
5. `apps/web/src/lib/composition/publication.composition.ts`
6. `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md`
7. `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md`

---

## Deferred Scope & Future Phase Hand-off

* **Phase 8B.4**: Web Operations UI & manual reconciliation workspace.
* **Phase 8E / 8F**: Real Meta Graph API, Google Ads API, and LinkedIn API SDK integrations with OAuth token vault.
