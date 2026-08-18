/**
 * createCampaignAIProvider — tests unitarios (Phase 7D.1).
 *
 * Sin llamadas de red: la factoría solo lee `process.env` y construye
 * instancias. Cobertura (§21 "PROVIDER FACTORY"):
 *   F1.  'openai' con OPENAI_API_KEY → OpenAIAPIProvider
 *   F2.  'gemini' con GEMINI_API_KEY → GeminiAPIProvider
 *   F3.  'anthropic' con ANTHROPIC_API_KEY → ClaudeAPIProvider
 *   F4.  provider no soportado → err VALIDATION_ERROR (AI_UNSUPPORTED_PROVIDER)
 *   F5.  provider soportado SIN API key → err EXTERNAL_SERVICE_ERROR (AI_PROVIDER_NOT_CONFIGURED)
 *   F6.  sin argumento → usa CAMPAIGN_AI_DEFAULT_PROVIDER
 *   F7.  sin argumento y sin CAMPAIGN_AI_DEFAULT_PROVIDER → default documentado ('anthropic')
 *   F8.  CAMPAIGN_AI_DEFAULT_PROVIDER inválido → error explícito, NO cae al default
 *   F9.  modelo resuelto desde *_MODEL, con fallback a DEFAULT_MODELS
 *   F10. el resultado NUNCA expone la API key
 *   F11. sin fallback automático: default configurado sin key NO prueba otro proveedor
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getAiErrorKind } from '@bop-agency/domain';
import { createCampaignAIProvider } from './campaign-ai-provider.factory';
import { DEFAULT_MODELS } from './ai-provider-config';
import { ClaudeAPIProvider } from './claude-api.provider';
import { OpenAIAPIProvider } from './openai-api.provider';
import { GeminiAPIProvider } from './gemini-api.provider';

const OPENAI_KEY = 'sk-openai-test-key-1234567890';
const GEMINI_KEY = 'AIza-gemini-test-key-1234567890';
const ANTHROPIC_KEY = 'sk-ant-test-key-1234567890';

beforeEach(() => {
  vi.unstubAllEnvs();
  // Ninguna key por defecto: cada test declara explícitamente lo que necesita.
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('CAMPAIGN_AI_DEFAULT_PROVIDER', '');
});

describe('createCampaignAIProvider', () => {
  it('F1: "openai" con OPENAI_API_KEY construye OpenAIAPIProvider', () => {
    vi.stubEnv('OPENAI_API_KEY', OPENAI_KEY);

    const result = createCampaignAIProvider('openai');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.providerId).toBe('openai');
      expect(result.value.provider).toBeInstanceOf(OpenAIAPIProvider);
    }
  });

  it('F2: "gemini" con GEMINI_API_KEY construye GeminiAPIProvider', () => {
    vi.stubEnv('GEMINI_API_KEY', GEMINI_KEY);

    const result = createCampaignAIProvider('gemini');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.providerId).toBe('gemini');
      expect(result.value.provider).toBeInstanceOf(GeminiAPIProvider);
    }
  });

  it('F3: "anthropic" con ANTHROPIC_API_KEY construye ClaudeAPIProvider', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);

    const result = createCampaignAIProvider('anthropic');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.providerId).toBe('anthropic');
      expect(result.value.provider).toBeInstanceOf(ClaudeAPIProvider);
    }
  });

  it('F4: provider no soportado retorna VALIDATION_ERROR con kind AI_UNSUPPORTED_PROVIDER', () => {
    // Se fuerza el cast porque el punto del test es justamente el caso en que
    // un valor NO validado llegara a la factoría (defensa en profundidad).
    const result = createCampaignAIProvider('mistral' as never);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(getAiErrorKind(result.error)).toBe('AI_UNSUPPORTED_PROVIDER');
    }
  });

  it('F5: provider soportado sin API key retorna EXTERNAL_SERVICE_ERROR con kind AI_PROVIDER_NOT_CONFIGURED', () => {
    const result = createCampaignAIProvider('openai');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(getAiErrorKind(result.error)).toBe('AI_PROVIDER_NOT_CONFIGURED');
      expect(result.error.message).toContain('OPENAI_API_KEY');
    }
  });

  it('F6: sin argumento usa CAMPAIGN_AI_DEFAULT_PROVIDER', () => {
    vi.stubEnv('CAMPAIGN_AI_DEFAULT_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', GEMINI_KEY);

    const result = createCampaignAIProvider();

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.providerId).toBe('gemini');
  });

  it('F7: sin argumento y sin CAMPAIGN_AI_DEFAULT_PROVIDER usa el default documentado (anthropic)', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);

    const result = createCampaignAIProvider();

    expect(result.success).toBe(true);
    if (result.success) expect(result.value.providerId).toBe('anthropic');
  });

  it('F8: CAMPAIGN_AI_DEFAULT_PROVIDER con valor inválido falla explícitamente y NO cae al default', () => {
    vi.stubEnv('CAMPAIGN_AI_DEFAULT_PROVIDER', 'not-a-provider');
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);

    const result = createCampaignAIProvider();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(result.error.message).toContain('CAMPAIGN_AI_DEFAULT_PROVIDER');
    }
  });

  it('F9: el modelo sale de *_MODEL, con fallback a DEFAULT_MODELS', () => {
    vi.stubEnv('OPENAI_API_KEY', OPENAI_KEY);
    vi.stubEnv('OPENAI_MODEL', 'gpt-test-model');
    const withOverride = createCampaignAIProvider('openai');
    expect(withOverride.success).toBe(true);
    if (withOverride.success) expect(withOverride.value.model).toBe('gpt-test-model');

    vi.stubEnv('OPENAI_MODEL', '');
    const withDefault = createCampaignAIProvider('openai');
    expect(withDefault.success).toBe(true);
    if (withDefault.success) expect(withDefault.value.model).toBe(DEFAULT_MODELS.openai);
  });

  it('F10: el resultado no expone la API key en ninguna forma', () => {
    vi.stubEnv('GEMINI_API_KEY', GEMINI_KEY);

    const result = createCampaignAIProvider('gemini');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(JSON.stringify(result.value)).not.toContain(GEMINI_KEY);
      expect(Object.keys(result.value)).toEqual(['providerId', 'model', 'provider']);
    }
  });

  it('F11: sin fallback automático — default sin key NO prueba otro proveedor configurado', () => {
    vi.stubEnv('CAMPAIGN_AI_DEFAULT_PROVIDER', 'gemini');
    // Gemini SIN key, pero OpenAI y Anthropic sí configurados.
    vi.stubEnv('OPENAI_API_KEY', OPENAI_KEY);
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);

    const result = createCampaignAIProvider();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('GEMINI_API_KEY');
      expect(result.error.message).not.toContain('OPENAI');
    }
  });
});
