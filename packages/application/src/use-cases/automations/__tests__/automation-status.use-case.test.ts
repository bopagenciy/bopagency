/**
 * Tests for getAutomation, activateAutomation, pauseAutomation, archiveAutomation
 * Phase 6E — Automation Admin UI use cases
 */

import { describe, it, expect, vi } from 'vitest';
import { ok, err } from '@bop-agency/shared';
import type { Automation, AutomationId, AutomationRepository, OrganizationId } from '@bop-agency/domain';
import { automationId as makeAutomationId } from '@bop-agency/domain';
import type { LoggerPort } from '../../../ports/logger.port';
import { getAutomation } from '../get-automation.use-case';
import { activateAutomation } from '../activate-automation.use-case';
import { pauseAutomation } from '../pause-automation.use-case';
import { archiveAutomation } from '../archive-automation.use-case';
import type { GetAutomationDeps } from '../get-automation.use-case';
import type { ActivateAutomationDeps } from '../activate-automation.use-case';
import type { PauseAutomationDeps } from '../pause-automation.use-case';
import type { ArchiveAutomationDeps } from '../archive-automation.use-case';

// ─── Factories ────────────────────────────────────────────────────────────────

const ORG_ID = 'org-1' as OrganizationId;
const AUTO_ID = makeAutomationId('auto-1');

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: AUTO_ID,
    organizationId: ORG_ID,
    clientId: null,
    name: 'Test Automation',
    description: null,
    status: 'draft',
    triggerConfig: { type: 'manual' },
    retryPolicy: { maxAttempts: 3, initialDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 30000 },
    n8nWorkflowId: null,
    metadata: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeRepo(
  automation: Automation | null = makeAutomation(),
  updateResult: Automation | null = null,
): AutomationRepository {
  const findResult = automation ? ok(automation) : err({ code: 'NOT_FOUND' as const, message: 'nf' });
  const updResult = updateResult ? ok(updateResult) : ok(automation!);
  return {
    findById: vi.fn().mockResolvedValue(findResult),
    update: vi.fn().mockResolvedValue(updResult),
    archive: vi.fn().mockResolvedValue(ok(undefined)),
    create: vi.fn(),
    findByOrganization: vi.fn(),
    findByClient: vi.fn(),
    existsByName: vi.fn(),
    countByStatus: vi.fn(),
  } as unknown as AutomationRepository;
}

function makeLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const INPUT = { automationId: AUTO_ID, organizationId: ORG_ID };

// ─── getAutomation ────────────────────────────────────────────────────────────

describe('getAutomation', () => {
  it('returns automation when found', async () => {
    const automation = makeAutomation();
    const deps: GetAutomationDeps = { automationRepository: makeRepo(automation), logger: makeLogger() };
    const result = await getAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.id).toBe(AUTO_ID);
  });

  it('returns NOT_FOUND when automation does not exist', async () => {
    const deps: GetAutomationDeps = { automationRepository: makeRepo(null), logger: makeLogger() };
    const result = await getAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── activateAutomation ───────────────────────────────────────────────────────

describe('activateAutomation', () => {
  it('activates a draft automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'draft' }), makeAutomation({ status: 'active' }));
    const deps: ActivateAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await activateAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(AUTO_ID, ORG_ID, { status: 'active' });
  });

  it('activates a paused automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'paused' }), makeAutomation({ status: 'active' }));
    const deps: ActivateAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await activateAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.update).toHaveBeenCalled();
  });

  it('is idempotent — already active returns ok without update', async () => {
    const repo = makeRepo(makeAutomation({ status: 'active' }));
    const deps: ActivateAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await activateAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects activation of archived automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'archived' }));
    const deps: ActivateAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await activateAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND when automation does not exist', async () => {
    const deps: ActivateAutomationDeps = { automationRepository: makeRepo(null), logger: makeLogger() };
    const result = await activateAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── pauseAutomation ──────────────────────────────────────────────────────────

describe('pauseAutomation', () => {
  it('pauses an active automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'active' }), makeAutomation({ status: 'paused' }));
    const deps: PauseAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await pauseAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(AUTO_ID, ORG_ID, { status: 'paused' });
  });

  it('is idempotent — already paused returns ok without update', async () => {
    const repo = makeRepo(makeAutomation({ status: 'paused' }));
    const deps: PauseAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await pauseAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rejects pausing a draft automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'draft' }));
    const deps: PauseAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await pauseAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects pausing an archived automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'archived' }));
    const deps: PauseAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await pauseAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns NOT_FOUND when automation does not exist', async () => {
    const deps: PauseAutomationDeps = { automationRepository: makeRepo(null), logger: makeLogger() };
    const result = await pauseAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});

// ─── archiveAutomation ────────────────────────────────────────────────────────

describe('archiveAutomation', () => {
  it('archives an active automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'active' }));
    const deps: ArchiveAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await archiveAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.archive).toHaveBeenCalledWith(AUTO_ID, ORG_ID);
  });

  it('archives a paused automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'paused' }));
    const deps: ArchiveAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await archiveAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.archive).toHaveBeenCalled();
  });

  it('archives a draft automation', async () => {
    const repo = makeRepo(makeAutomation({ status: 'draft' }));
    const deps: ArchiveAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await archiveAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.archive).toHaveBeenCalled();
  });

  it('is idempotent — already archived returns ok without archive call', async () => {
    const repo = makeRepo(makeAutomation({ status: 'archived' }));
    const deps: ArchiveAutomationDeps = { automationRepository: repo, logger: makeLogger() };
    const result = await archiveAutomation(INPUT, deps);
    expect(result.success).toBe(true);
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when automation does not exist', async () => {
    const deps: ArchiveAutomationDeps = { automationRepository: makeRepo(null), logger: makeLogger() };
    const result = await archiveAutomation(INPUT, deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('NOT_FOUND');
  });
});
