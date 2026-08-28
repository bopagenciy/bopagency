import { describe, it, expect } from 'vitest';
import {
  rowToCampaignPublicationJob,
  rowToCampaignPublicationAttempt,
  rowToCampaignPublicationEvent,
  rowToCampaignPublicationWebhookEvent,
  type CampaignPublicationJobRow,
  type CampaignPublicationAttemptRow,
  type CampaignPublicationEventRow,
  type CampaignPublicationWebhookEventRow,
} from '../campaign-publication.mapper';

const makeJobRow = (overrides: Partial<CampaignPublicationJobRow> = {}): CampaignPublicationJobRow => ({
  id: 'job-uuid-1',
  organization_id: 'org-uuid-1',
  client_id: 'client-uuid-1',
  activation_id: 'activation-uuid-1',
  target_id: 'target-uuid-1',
  channel: 'meta_ads',
  provider: 'meta',
  client_integration_id: 'integration-uuid-1',
  status: 'queued',
  idempotency_key: 'publish:org-uuid-1:target-uuid-1:0',
  retry_of_job_id: null,
  retry_count: 0,
  claimed_at: null,
  claimed_by_worker: null,
  started_at: null,
  completed_at: null,
  reconciliation_deadline_at: null,
  cancellation_requested_at: null,
  cancellation_requested_by: null,
  failure_category: null,
  reconciled_by: null,
  reconciled_at: null,
  reconciliation_note: null,
  metadata: {},
  created_by: 'user-uuid-1',
  created_at: '2026-08-25T00:00:00.000Z',
  updated_at: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

const makeAttemptRow = (
  overrides: Partial<CampaignPublicationAttemptRow> = {},
): CampaignPublicationAttemptRow => ({
  id: 'attempt-uuid-1',
  job_id: 'job-uuid-1',
  organization_id: 'org-uuid-1',
  attempt_number: 1,
  idempotency_key: 'publish:org-uuid-1:target-uuid-1:0',
  external_id: null,
  external_url: null,
  provider_status: null,
  provider_error_code: null,
  http_status: null,
  outcome: null,
  duration_ms: null,
  started_at: '2026-08-25T00:00:00.000Z',
  completed_at: null,
  created_at: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

const makeEventRow = (overrides: Partial<CampaignPublicationEventRow> = {}): CampaignPublicationEventRow => ({
  id: 'event-uuid-1',
  organization_id: 'org-uuid-1',
  job_id: 'job-uuid-1',
  attempt_id: null,
  event_type: 'job_queued',
  actor_user_id: 'user-uuid-1',
  is_system: false,
  note: null,
  metadata: {},
  created_at: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

const makeWebhookEventRow = (
  overrides: Partial<CampaignPublicationWebhookEventRow> = {},
): CampaignPublicationWebhookEventRow => ({
  id: 'webhook-uuid-1',
  organization_id: null,
  provider: 'meta',
  external_event_id: 'ext-evt-1',
  payload_hash: 'a'.repeat(64),
  status: 'received',
  job_id: null,
  attempt_id: null,
  error_code: null,
  received_at: '2026-08-25T00:00:00.000Z',
  processed_at: null,
  created_at: '2026-08-25T00:00:00.000Z',
  ...overrides,
});

describe('rowToCampaignPublicationJob', () => {
  it('mapea un row valido', () => {
    const job = rowToCampaignPublicationJob(makeJobRow());
    expect(job.id).toBe('job-uuid-1');
    expect(job.status).toBe('queued');
    expect(job.provider).toBe('meta');
    expect(job.retryCount).toBe(0);
    expect(job.idempotencyKey).toBe('publish:org-uuid-1:target-uuid-1:0');
  });

  it('rechaza un status invalido', () => {
    expect(() => rowToCampaignPublicationJob(makeJobRow({ status: 'bogus' }))).toThrow();
  });

  it('rechaza un provider invalido', () => {
    expect(() => rowToCampaignPublicationJob(makeJobRow({ provider: 'unknown-provider' }))).toThrow();
  });

  it('rechaza failure_category invalida cuando no es null', () => {
    expect(() =>
      rowToCampaignPublicationJob(makeJobRow({ failure_category: 'NOT_A_REAL_CATEGORY' })),
    ).toThrow();
  });

  it('acepta failure_category null', () => {
    const job = rowToCampaignPublicationJob(makeJobRow({ failure_category: null }));
    expect(job.failureCategory).toBeNull();
  });

  it('mapea metadata jsonb como objeto', () => {
    const job = rowToCampaignPublicationJob(makeJobRow({ metadata: { note: 'x' } }));
    expect(job.metadata).toEqual({ note: 'x' });
  });
});

describe('rowToCampaignPublicationAttempt', () => {
  it('mapea un row valido (attempt abierto)', () => {
    const attempt = rowToCampaignPublicationAttempt(makeAttemptRow());
    expect(attempt.outcome).toBeNull();
    expect(attempt.completedAt).toBeNull();
  });

  it('mapea un attempt completado con outcome confirmed', () => {
    const attempt = rowToCampaignPublicationAttempt(
      makeAttemptRow({ outcome: 'confirmed', completed_at: '2026-08-25T00:00:05.000Z', duration_ms: 5000 }),
    );
    expect(attempt.outcome).toBe('confirmed');
    expect(attempt.durationMs).toBe(5000);
  });

  it('rechaza outcome invalido', () => {
    expect(() => rowToCampaignPublicationAttempt(makeAttemptRow({ outcome: 'maybe' }))).toThrow();
  });
});

describe('rowToCampaignPublicationEvent', () => {
  it('mapea un row valido', () => {
    const event = rowToCampaignPublicationEvent(makeEventRow());
    expect(event.eventType).toBe('job_queued');
    expect(event.isSystem).toBe(false);
  });

  it('rechaza event_type invalido', () => {
    expect(() => rowToCampaignPublicationEvent(makeEventRow({ event_type: 'job_deleted' }))).toThrow();
  });

  it('permite actorUserId null para eventos de sistema', () => {
    const event = rowToCampaignPublicationEvent(
      makeEventRow({ actor_user_id: null, is_system: true, event_type: 'job_started' }),
    );
    expect(event.actorUserId).toBeNull();
    expect(event.isSystem).toBe(true);
  });
});

describe('rowToCampaignPublicationWebhookEvent', () => {
  it('mapea un row valido con organization_id null (no correlacionado aun)', () => {
    const webhookEvent = rowToCampaignPublicationWebhookEvent(makeWebhookEventRow());
    expect(webhookEvent.organizationId).toBeNull();
    expect(webhookEvent.status).toBe('received');
    expect(webhookEvent.provider).toBe('meta');
  });

  it('rechaza status invalido', () => {
    expect(() => rowToCampaignPublicationWebhookEvent(makeWebhookEventRow({ status: 'bogus' }))).toThrow();
  });

  it('rechaza provider invalido', () => {
    expect(() =>
      rowToCampaignPublicationWebhookEvent(makeWebhookEventRow({ provider: 'not-a-provider' })),
    ).toThrow();
  });
});
