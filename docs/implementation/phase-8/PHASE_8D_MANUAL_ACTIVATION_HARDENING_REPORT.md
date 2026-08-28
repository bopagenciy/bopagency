# Phase 8D — Manual Activation Hardening Implementation Report

**Status:** COMPLETE & VERIFIED ON REAL POSTGRES 17.6 ENGINE
**Base HEAD:** `d462112 feat(phase-8): add content calendar planning layer`
**Branch:** `feat/phase-8-campaign-operations`
**Database Engine:** PostgreSQL 17.6 (Docker container `supabase_db_BopIAgency`)

---

## Executive Summary

Phase 8D hardens the manual activation workflow and operational target cancellation policies without compromising Phase 8B publication domain invariants or Phase 8C editorial calendar derived semantics.

Key accomplishments:
1. **Human Attestation Model**: Confirmed that manual publication is strictly target-level human attestation (`channel = 'manual'`, `provider = 'manual'`). It NEVER creates `CampaignPublicationJob` records or worker fake attempts.
2. **Atomic RPCs**:
   - `mark_activation_target_published`: `operator+` role floor, enforces `manual/manual` target pair, requires non-whitespace external reference or note evidence, updates target status to `published`, and logs `campaign_activation_events`.
   - `cancel_activation_target`: `strategist+` role floor, mandatory reason, enforces global lock order `JOB -> TARGET`. Reuses Phase 8B `public.cancel_publication_job` for `queued`/`claimed` jobs atomically, and rejects `in_progress`, `unknown_outcome`, or `published` targets with `STATE_CONFLICT`.
3. **Global Lock Order Standardization**: Forward-hardened `public.create_publication_job` to enforce strict `JOB -> TARGET` lock acquisition order across all runtime and interactive paths.
4. **Verification**: Executed 24 functional DB test scenarios and 4 concurrent 2-session deadlock race tests against real local Supabase Postgres. All passed 100% with 0 deadlocks.

---

## Modified & Created Files Inventory

### Database Migrations
- `[NEW]` [20260901000000_phase8d_manual_activation_hardening.sql](file:///d:/ProjectIA/BopAgency/BopIAgency/supabase/migrations/20260901000000_phase8d_manual_activation_hardening.sql)

### Infrastructure Layer
- `[MODIFY]` [supabase-campaign-activation.repository.ts](file:///d:/ProjectIA/BopAgency/BopIAgency/packages/infrastructure/src/supabase/repositories/supabase-campaign-activation.repository.ts)

### Application Layer
- `[MODIFY]` [mark-activation-target-published.use-case.ts](file:///d:/ProjectIA/BopAgency/BopIAgency/packages/application/src/use-cases/activations/mark-activation-target-published.use-case.ts)

### Web & UI Layer
- `[NEW]` [ManualPublishModal.tsx](file:///d:/ProjectIA/BopAgency/BopIAgency/apps/web/src/components/activations/ManualPublishModal.tsx)
- `[NEW]` [CancelTargetModal.tsx](file:///d:/ProjectIA/BopAgency/BopIAgency/apps/web/src/components/activations/CancelTargetModal.tsx)
- `[MODIFY]` [ActivationTargetsPanel.tsx](file:///d:/ProjectIA/BopAgency/BopIAgency/apps/web/src/components/activations/ActivationTargetsPanel.tsx)
- `[NEW]` [ManualPublishModal.test.tsx](file:///d:/ProjectIA/BopAgency/BopIAgency/apps/web/src/components/activations/__tests__/ManualPublishModal.test.tsx)
- `[NEW]` [CancelTargetModal.test.tsx](file:///d:/ProjectIA/BopAgency/BopIAgency/apps/web/src/components/activations/__tests__/CancelTargetModal.test.tsx)

### Audit & Scratch Scripts
- `[NEW]` `scratch/real_db_phase8d_suite.sql`
- `[NEW]` `scratch/test_real_db_concurrency_phase8d.mjs`

---

## Concurrency & Lock Order Audit Results

| Race Condition | Session 1 Operation | Session 2 Operation | Result | Lock Order Verified |
|---|---|---|---|---|
| Race 1 | `create_publication_job` | `cancel_activation_target` | Zero Deadlocks / Serialized | `JOB -> TARGET` |
| Race 2 | `mark_activation_target_published` | `mark_activation_target_published` | Zero Deadlocks / `STATE_CONFLICT` | `TARGET` |
| Race 3 | `mark_activation_target_published` | `cancel_activation_target` | Zero Deadlocks / `STATE_CONFLICT` | `JOB -> TARGET` |
| Race 4 | `cancel_activation_target` | `cancel_activation_target` | Zero Deadlocks / `STATE_CONFLICT` | `JOB -> TARGET` |

---

## Safety Directives Enforcement

- **`git add`**: NOT executed.
- **`git commit`**: NOT executed.
- **`git push`**: NOT executed.
- **Pre-existing local files**: Untouched and unmodified (`actions.test.ts`, `ActivationTargetsPanel.test.tsx`, `vitest.config.ts`, `config.toml`).
