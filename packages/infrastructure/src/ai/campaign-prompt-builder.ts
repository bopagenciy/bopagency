/**
 * campaign-prompt-builder — Phase 7D.
 *
 * Construye el `AIRequest` (@bop-agency/ai-engine) enviado al proveedor de
 * IA para generar una propuesta de campaña. Versionado explícito
 * (`CAMPAIGN_BUILDER_PROMPT_VERSION`) — cualquier cambio de estructura de
 * prompt que altere el comportamiento del modelo debe incrementar esta
 * versión, ya que se persiste en `campaigns.metadata.ai.promptVersion` (ver
 * generate-campaign-draft-with-ai.use-case.ts).
 *
 * Secciones separadas (§10 de la tarea — NO un string gigante inline):
 * - SYSTEM/POLICY CONTEXT: reglas duras del generador (idioma, qué NO
 *   inventar, formato de salida). Va en el mensaje `system`.
 * - CLIENT CONTEXT: datos reales del cliente (nombre/industria/website/
 *   brand-profile opcional) — nunca inventados.
 * - CAMPAIGN BRIEF: objetivo/plataforma/presupuesto/fechas/brief tal cual
 *   los proveyó el caller.
 * - COMPLIANCE CONTEXT: reglas aplicables (título/descripción/severidad) —
 *   contexto, NO garantía de cumplimiento (ver nota en evaluación
 *   determinística de dominio).
 * - OUTPUT CONTRACT: contrato JSON exacto esperado, específico por
 *   plataforma (discriminated union — meta_ads vs. google_ads tienen
 *   estructuras distintas, ver campaign-generated-content.schema.ts).
 *
 * Informado por (no copiado literalmente de) los skills legacy
 * `.agencia-ai/.claude/skills/meta-ads-campaign-builder` y
 * `google-ads-campaign-builder` — ver PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md
 * §"Auditoría de legacy" para la clasificación completa.
 */

import type { AIRequest } from '@bop-agency/ai-engine';
import type { GenerateCampaignInput } from '@bop-agency/application';
import { GENERATED_CONTENT_SCHEMA_VERSION } from '@bop-agency/shared';

export const CAMPAIGN_BUILDER_PROMPT_VERSION = 'campaign-builder-v1';

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.4;

// ─── Section builders ───────────────────────────────────────────────────────────

function buildSystemPolicySection(input: GenerateCampaignInput): string {
  return [
    'Eres un estratega de marketing digital senior generando una PROPUESTA de campaña publicitaria estructurada para revisión humana posterior. NUNCA se publica automáticamente lo que generes.',
    '',
    'REGLAS DURAS (no negociables):',
    `- Responde EXCLUSIVAMENTE en idioma "${input.language}" — todo el contenido generado (textos, títulos, CTAs) debe estar en ese idioma.`,
    '- Responde EXCLUSIVAMENTE con un único objeto JSON válido que cumpla el CONTRATO DE SALIDA descrito más abajo. Sin texto antes ni después, sin markdown, sin backticks, sin comentarios.',
    `- schemaVersion debe ser exactamente "${GENERATED_CONTENT_SCHEMA_VERSION}".`,
    '- NUNCA inventes datos del cliente que no te hayan sido provistos (nombre legal, certificaciones, premios, años de operación, testimonios, casos de éxito, cifras de resultados pasados). Si necesitas asumir algo para completar la propuesta, decláralo explícitamente en el campo "assumptions" — no lo presentes como un hecho.',
    '- NUNCA prometas resultados garantizados (ej. "duplicarás tus ventas", "#1 en Google") ni uses lenguaje de garantía de performance.',
    '- NUNCA inventes precios, ofertas, descuentos, promociones, ni condiciones comerciales que no estén en el brief.',
    '- NUNCA inventes certificaciones, licencias, premios ni testimonios de clientes.',
    '- Considera el CONTEXTO DE COMPLIANCE provisto como guía, pero NO declares que la campaña "cumple" o "es compliant" — esa evaluación es responsabilidad de un revisor humano/sistema determinístico separado. Si una regla de compliance es relevante para el contenido que generas, anótalo en "complianceNotes".',
    '- Todo el contenido debe ser específico y accionable — evita frases genéricas de relleno.',
  ].join('\n');
}

function buildClientContextSection(input: GenerateCampaignInput): string {
  const lines = [
    'CONTEXTO DE CLIENTE:',
    `- Nombre: ${input.clientContext.name}`,
    `- Industria: ${input.clientContext.industry ?? '(no especificada)'}`,
    `- Sitio web: ${input.clientContext.website ?? '(no especificado)'}`,
  ];
  if (input.clientContext.brandProfile) {
    lines.push('- Perfil de marca (documento estructurado del cliente):', input.clientContext.brandProfile);
  } else {
    lines.push(
      '- Perfil de marca: no disponible. Basa la propuesta únicamente en el brief provisto abajo y marca cualquier suposición sobre tono/voz de marca en "assumptions".',
    );
  }
  return lines.join('\n');
}

function buildCampaignBriefSection(input: GenerateCampaignInput): string {
  const lines = [
    'BRIEF DE CAMPAÑA:',
    `- Plataforma: ${input.platform}`,
    `- Objetivo: ${input.objective}`,
    `- Presupuesto: ${input.budget} ${input.currency}`,
    `- Fecha de inicio: ${input.startDate ? input.startDate.toISOString().slice(0, 10) : '(no especificada)'}`,
    `- Fecha de fin: ${input.endDate ? input.endDate.toISOString().slice(0, 10) : '(no especificada)'}`,
  ];
  if (input.market) lines.push(`- Mercado/jurisdicción: ${input.market}`);
  lines.push('- Brief (texto libre del cliente/estratega):', input.brief);
  return lines.join('\n');
}

function buildComplianceContextSection(input: GenerateCampaignInput): string {
  if (input.complianceRules.length === 0) {
    return 'CONTEXTO DE COMPLIANCE: no hay reglas de compliance activas aplicables a este cliente/plataforma/organización.';
  }
  const rules = input.complianceRules
    .map((rule) => `- [${rule.severity}] ${rule.title} (${rule.ruleKey}): ${rule.description}`)
    .join('\n');
  return [
    'CONTEXTO DE COMPLIANCE (reglas activas aplicables — considéralas al redactar, pero NO declares cumplimiento):',
    rules,
  ].join('\n');
}

function buildOutputContractSection(platform: GenerateCampaignInput['platform']): string {
  const common = [
    'CONTRATO DE SALIDA — responde SOLO con un objeto JSON con esta forma exacta (sin texto adicional):',
    '',
    '{',
    `  "schemaVersion": "${GENERATED_CONTENT_SCHEMA_VERSION}",`,
    `  "platform": "${platform}",`,
    '  "language": "<idioma solicitado>",',
    '  "campaignConcept": "<concepto central de la campaña, 1-3 frases>",',
    '  "targetAudience": "<descripción de audiencia objetivo>",',
    '  "valueProposition": "<propuesta de valor central>",',
    '  "messaging": ["<mensaje clave 1>", "<mensaje clave 2>", "..."],',
    '  "callsToAction": ["<CTA 1>", "..."],',
    '  "landingPageRecommendations": ["<recomendación 1>", "..."],',
    '  "complianceNotes": ["<nota 1 si aplica>", "..."],',
    '  "assumptions": ["<suposición 1 si aplica>", "..."],',
  ];

  const platformSpecific =
    platform === 'meta_ads'
      ? [
          '  "adSets": [',
          '    {',
          '      "name": "<nombre del ad set>",',
          '      "audienceType": "cold" | "warm" | "retargeting",',
          '      "targetingSummary": "<resumen de segmentación>",',
          '      "placementSuggestions": ["<placement 1>", "..."],',
          '      "creatives": [',
          '        { "hook": "<gancho>", "headline": "<titular>", "primaryText": "<texto principal>", "format": "<formato: imagen única/video/carrusel/etc>", "visualSuggestion": "<sugerencia visual>" }',
          '      ]',
          '    }',
          '  ]',
        ]
      : [
          '  "adGroups": [',
          '    { "name": "<nombre del ad group>", "theme": "<tema>", "headlines": ["<titular 1 (máx 30 caracteres)>", "... (mínimo 3, máximo 15)"], "descriptions": ["<descripción 1 (máx 90 caracteres)>", "... (máximo 4)"] }',
          '  ],',
          '  "keywordSuggestions": ["<keyword 1>", "..."],',
          '  "negativeKeywordSuggestions": ["<keyword negativa 1>", "..."]',
        ];

  return [...common, ...platformSpecific, '}'].join('\n');
}

// ─── Public builder ───────────────────────────────────────────────────────────

export function buildCampaignGenerationPrompt(input: GenerateCampaignInput): AIRequest {
  const userContent = [
    buildClientContextSection(input),
    buildCampaignBriefSection(input),
    buildComplianceContextSection(input),
    buildOutputContractSection(input.platform),
  ].join('\n\n');

  return {
    model: '', // Resuelto por el provider (ANTHROPIC_MODEL / default) si se deja vacío.
    messages: [
      { role: 'system', content: buildSystemPolicySection(input) },
      { role: 'user', content: userContent },
    ],
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: DEFAULT_TEMPERATURE,
  };
}
