/**
 * ai-provider-config — Phase 7D.1.1.
 *
 * Fija los defaults de configuración que cambiaron a raíz del smoke real:
 * el timeout por intento (30 s era insuficiente para la regeneración con
 * Gemini) y el modelo por defecto de Gemini (`gemini-1.5-flash` estaba
 * obsoleto).
 *
 * Cobertura:
 *   C1. el default de timeout es 60 000 ms
 *   C2. el rango de seguridad del timeout se respeta (5 000–120 000)
 *   C3. un valor fuera de rango o no numérico cae al default
 *   C4. el default de intentos es 3 (1 + 2 reintentos), acotado a 1–3
 *   C5. el backoff base por defecto es 500 ms
 *   C6. el presupuesto total por defecto es el doble del timeout por intento
 *   C7. el presupuesto total es configurable y está acotado
 *   C8. el modelo por defecto de Gemini NO es el obsoleto gemini-1.5-flash
 *   C9. el modelo por defecto de Gemini es el verificado en el smoke
 *   C10. GEMINI_MODEL del entorno tiene prioridad sobre el default de código
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DEFAULT_CAMPAIGN_AI_MAX_ATTEMPTS,
  DEFAULT_CAMPAIGN_AI_RETRY_BASE_DELAY_MS,
  DEFAULT_CAMPAIGN_AI_TIMEOUT_MS,
  DEFAULT_MODELS,
  getCampaignAiMaxAttempts,
  getCampaignAiRetryBaseDelayMs,
  getCampaignAiTimeoutMs,
  getCampaignAiTotalBudgetMs,
  getProviderModel,
} from './ai-provider-config';

beforeEach(() => {
  vi.unstubAllEnvs();
  for (const name of [
    'CAMPAIGN_AI_TIMEOUT_MS',
    'CAMPAIGN_AI_MAX_ATTEMPTS',
    'CAMPAIGN_AI_RETRY_BASE_DELAY_MS',
    'CAMPAIGN_AI_TOTAL_BUDGET_MS',
    'GEMINI_MODEL',
  ]) {
    vi.stubEnv(name, '');
  }
});

describe('timeout y reintentos', () => {
  it('C1: el default de timeout por intento es 60 000 ms (subido desde 30 000 en 7D.1.1)', () => {
    expect(DEFAULT_CAMPAIGN_AI_TIMEOUT_MS).toBe(60_000);
    expect(getCampaignAiTimeoutMs()).toBe(60_000);
  });

  it('C2: un valor dentro del rango de seguridad se respeta', () => {
    vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', '90000');
    expect(getCampaignAiTimeoutMs()).toBe(90_000);

    vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', '5000');
    expect(getCampaignAiTimeoutMs()).toBe(5_000);

    vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', '120000');
    expect(getCampaignAiTimeoutMs()).toBe(120_000);
  });

  it('C3: fuera de rango o no numérico cae al default documentado', () => {
    for (const raw of ['1000', '999999', 'sesenta', '-1']) {
      vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', raw);
      expect(getCampaignAiTimeoutMs(), raw).toBe(DEFAULT_CAMPAIGN_AI_TIMEOUT_MS);
    }
  });

  it('C4: el default de intentos es 3 y está acotado a 1–3', () => {
    expect(DEFAULT_CAMPAIGN_AI_MAX_ATTEMPTS).toBe(3);
    expect(getCampaignAiMaxAttempts()).toBe(3);

    vi.stubEnv('CAMPAIGN_AI_MAX_ATTEMPTS', '1');
    expect(getCampaignAiMaxAttempts()).toBe(1);

    // Por encima del máximo se ignora: nunca más de 3 intentos totales.
    vi.stubEnv('CAMPAIGN_AI_MAX_ATTEMPTS', '10');
    expect(getCampaignAiMaxAttempts()).toBe(3);
  });

  it('C5: el backoff base por defecto es 500 ms', () => {
    expect(DEFAULT_CAMPAIGN_AI_RETRY_BASE_DELAY_MS).toBe(500);
    expect(getCampaignAiRetryBaseDelayMs()).toBe(500);

    vi.stubEnv('CAMPAIGN_AI_RETRY_BASE_DELAY_MS', '0');
    expect(getCampaignAiRetryBaseDelayMs()).toBe(0);
  });

  it('C6: el presupuesto total por defecto es el doble del timeout por intento', () => {
    expect(getCampaignAiTotalBudgetMs()).toBe(120_000);

    vi.stubEnv('CAMPAIGN_AI_TIMEOUT_MS', '30000');
    expect(getCampaignAiTotalBudgetMs()).toBe(60_000);
  });

  it('C7: el presupuesto total es configurable y está acotado a 240 000 ms', () => {
    vi.stubEnv('CAMPAIGN_AI_TOTAL_BUDGET_MS', '90000');
    expect(getCampaignAiTotalBudgetMs()).toBe(90_000);

    vi.stubEnv('CAMPAIGN_AI_TOTAL_BUDGET_MS', '999999');
    expect(getCampaignAiTotalBudgetMs()).toBe(120_000); // fuera de rango → default derivado
  });
});

describe('modelo por defecto de Gemini', () => {
  it('C8: el default ya NO es el obsoleto gemini-1.5-flash', () => {
    expect(DEFAULT_MODELS.gemini).not.toBe('gemini-1.5-flash');
  });

  it('C9: el default es el identificador verificado en el smoke real', () => {
    expect(DEFAULT_MODELS.gemini).toBe('gemini-3.6-flash');
    expect(getProviderModel('gemini')).toBe('gemini-3.6-flash');
  });

  it('C10: GEMINI_MODEL del entorno tiene prioridad sobre el default de código', () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-otro-modelo');
    expect(getProviderModel('gemini')).toBe('gemini-otro-modelo');
  });
});
