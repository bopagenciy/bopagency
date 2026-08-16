/**
 * campaign-prompt-builder — tests unitarios (Phase 7D).
 *
 * Cubre: estructura de mensajes (system separado de user), presencia de
 * las 5 secciones (policy/client/brief/compliance/output contract),
 * idioma solicitado, contrato de salida específico por plataforma
 * (meta_ads vs google_ads), reglas de compliance incluidas cuando existen
 * y omitidas de forma segura cuando no, versión de prompt estable.
 */
import { describe, it, expect } from 'vitest';
import { buildCampaignGenerationPrompt, CAMPAIGN_BUILDER_PROMPT_VERSION } from './campaign-prompt-builder';
import type { AIRequest } from '@bop-agency/ai-engine';
import type { GenerateCampaignInput } from '@bop-agency/application';

/** noUncheckedIndexedAccess: acceso indexado a un array retorna `T | undefined`. */
function systemOf(request: AIRequest): string {
  const message = request.messages[0];
  if (!message) throw new Error('expected a system message at index 0');
  return message.content;
}
function userOf(request: AIRequest): string {
  const message = request.messages[1];
  if (!message) throw new Error('expected a user message at index 1');
  return message.content;
}

function baseInput(overrides: Partial<GenerateCampaignInput> = {}): GenerateCampaignInput {
  return {
    platform: 'meta_ads',
    objective: 'lead_generation',
    brief: 'El cliente quiere generar leads calificados para su clínica dental.',
    budget: 3000000,
    currency: 'COP',
    startDate: null,
    endDate: null,
    language: 'es',
    clientContext: {
      name: 'Clínica Dental Sonrisa',
      industry: 'healthcare',
      website: 'https://clinicasonrisa.example.com',
      brandProfile: null,
    },
    complianceRules: [],
    ...overrides,
  };
}

describe('buildCampaignGenerationPrompt', () => {
  it('produce un mensaje system y un mensaje user', () => {
    const request = buildCampaignGenerationPrompt(baseInput());
    expect(request.messages).toHaveLength(2);
    expect(request.messages[0]?.role).toBe('system');
    expect(request.messages[1]?.role).toBe('user');
  });

  it('el mensaje user incluye las 4 secciones no-system (client/brief/compliance/output contract)', () => {
    const request = buildCampaignGenerationPrompt(baseInput());
    const userContent = userOf(request);
    expect(userContent).toContain('CONTEXTO DE CLIENTE:');
    expect(userContent).toContain('BRIEF DE CAMPAÑA:');
    expect(userContent).toContain('CONTEXTO DE COMPLIANCE');
    expect(userContent).toContain('CONTRATO DE SALIDA');
  });

  it('el mensaje system incluye la regla de idioma solicitado', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ language: 'en' }));
    expect(systemOf(request)).toContain('idioma "en"');
  });

  it('el mensaje system prohíbe explícitamente inventar precios/certificaciones/testimonios/garantías', () => {
    const request = buildCampaignGenerationPrompt(baseInput());
    const system = systemOf(request);
    expect(system).toMatch(/precios/i);
    expect(system).toMatch(/certificaciones/i);
    expect(system).toMatch(/testimonios/i);
    expect(system).toMatch(/garantizados/i);
  });

  it('incluye el nombre real del cliente, nunca inventado', () => {
    const request = buildCampaignGenerationPrompt(baseInput());
    expect(userOf(request)).toContain('Clínica Dental Sonrisa');
  });

  it('cuando no hay brandProfile, indica explícitamente que no está disponible', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ clientContext: { ...baseInput().clientContext, brandProfile: null } }));
    expect(userOf(request)).toContain('Perfil de marca: no disponible');
  });

  it('cuando hay brandProfile, lo incluye tal cual', () => {
    const request = buildCampaignGenerationPrompt(
      baseInput({ clientContext: { ...baseInput().clientContext, brandProfile: 'Tono cercano y profesional.' } }),
    );
    expect(userOf(request)).toContain('Tono cercano y profesional.');
  });

  it('sin reglas de compliance, indica explícitamente que no hay reglas activas', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ complianceRules: [] }));
    expect(userOf(request)).toContain('no hay reglas de compliance activas');
  });

  it('con reglas de compliance, las incluye con severidad/título/descripción', () => {
    const request = buildCampaignGenerationPrompt(
      baseInput({
        complianceRules: [
          { ruleKey: 'health_disclaimer', title: 'Disclaimer de salud', description: 'Requiere disclaimer legal.', severity: 'high' },
        ],
      }),
    );
    const content = userOf(request);
    expect(content).toContain('health_disclaimer');
    expect(content).toContain('Disclaimer de salud');
    expect(content).toContain('Requiere disclaimer legal.');
    expect(content).toContain('[high]');
  });

  it('el contrato de salida para meta_ads describe adSets/creatives', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ platform: 'meta_ads' }));
    const content = userOf(request);
    expect(content).toContain('"adSets"');
    expect(content).toContain('"creatives"');
    expect(content).not.toContain('"adGroups"');
  });

  it('el contrato de salida para google_ads describe adGroups/keywordSuggestions', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ platform: 'google_ads' }));
    const content = userOf(request);
    expect(content).toContain('"adGroups"');
    expect(content).toContain('"keywordSuggestions"');
    expect(content).not.toContain('"adSets"');
  });

  it('incluye el market cuando se provee', () => {
    const request = buildCampaignGenerationPrompt(baseInput({ market: 'MX' }));
    expect(userOf(request)).toContain('Mercado/jurisdicción: MX');
  });

  it('model se deja vacío (el provider resuelve el default) salvo que no se sobreescriba en el request', () => {
    const request = buildCampaignGenerationPrompt(baseInput());
    expect(request.model).toBe('');
  });

  it('CAMPAIGN_BUILDER_PROMPT_VERSION es estable y con formato "campaign-builder-v<N>"', () => {
    expect(CAMPAIGN_BUILDER_PROMPT_VERSION).toMatch(/^campaign-builder-v\d+$/);
  });
});
