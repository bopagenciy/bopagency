/**
 * campaign-automation-types.ts — Phase 7F.
 *
 * Tipos cerrados de evento/automatización interna de Campaign Studio.
 * Ninguna otra parte del código debe usar strings mágicos para estos
 * conceptos — todo caller importa estas constantes/tipos.
 *
 * Espejo deliberado de `automation-incident-severity.ts` (Phase 6F): mismo
 * criterio (union cerrado + mapping determinístico), pero para eventos de
 * negocio de campaña en vez de incidentes técnicos de automatización.
 */

import type { AlertSeverity } from '@bop-agency/shared';
import type { TaskPriority } from '@bop-agency/domain';

// ─── Business events ──────────────────────────────────────────────────────────
//
// Eventos internos de Campaign Studio (§2 de la especificación de Phase 7F).
// `campaign.created` / `campaign.updated` / `campaign.ai_generated` /
// `campaign.ai_regenerated` se dejan documentados aquí como parte del modelo
// de eventos, pero NO disparan side effects de automatización en esta fase
// (no hay tarea/alerta de alto valor definida para ellos en §3) — el único
// evento derivado de generación IA que sí dispara algo es el de FALLO del
// proveedor, modelado por separado como `CampaignAutomationType` porque no es
// un evento de negocio sino un incidente técnico (igual que Phase 6F separa
// eventos de negocio de incidentes de automatización).

export const CAMPAIGN_BUSINESS_EVENTS = [
  'campaign.created',
  'campaign.updated',
  'campaign.submitted_for_review',
  'campaign.approved',
  'campaign.rejected',
  'campaign.ai_generated',
  'campaign.ai_regenerated',
] as const;

export type CampaignBusinessEvent = (typeof CAMPAIGN_BUSINESS_EVENTS)[number];

// ─── Automation types — closed set, no magic strings ──────────────────────────
//
// Subconjunto de CampaignBusinessEvent (+ un incidente técnico) que sí
// produce un side effect interno (task y/o alert) vía
// `evaluateCampaignAutomation`.

export const CAMPAIGN_AUTOMATION_TYPES = [
  'campaign_review_requested',
  'campaign_rejected',
  'campaign_approved',
  'campaign_ai_provider_failure',
] as const;

export type CampaignAutomationType = (typeof CAMPAIGN_AUTOMATION_TYPES)[number];

// ─── Severity / priority mapping — determinístico, testeable ─────────────────

const ALERT_SEVERITY_MAP: Record<CampaignAutomationType, AlertSeverity> = {
  campaign_review_requested: 'info',
  campaign_rejected: 'info',
  campaign_approved: 'info',
  campaign_ai_provider_failure: 'warning',
};

const TASK_PRIORITY_MAP: Record<CampaignAutomationType, TaskPriority> = {
  campaign_review_requested: 'medium',
  campaign_rejected: 'medium',
  campaign_approved: 'medium',
  campaign_ai_provider_failure: 'high',
};

export function getAlertSeverityForCampaignAutomation(type: CampaignAutomationType): AlertSeverity {
  return ALERT_SEVERITY_MAP[type];
}

export function getTaskPriorityForCampaignAutomation(type: CampaignAutomationType): TaskPriority {
  return TASK_PRIORITY_MAP[type];
}

/**
 * Tipos de automatización de campaña que deben producir una TASK operativa
 * (además o en vez de un alert). `campaign_ai_provider_failure` NO crea
 * tarea — solo alert (ver §3D: no crear ruido operativo por fallos de
 * proveedor externo; el equipo se entera vía dashboard de alertas, no vía
 * cola de tareas).
 */
const TASKABLE_TYPES: ReadonlySet<CampaignAutomationType> = new Set([
  'campaign_review_requested',
  'campaign_rejected',
  'campaign_approved',
]);

export function campaignAutomationTypeCreatesTask(type: CampaignAutomationType): boolean {
  return TASKABLE_TYPES.has(type);
}

/**
 * Tipos que producen un ALERT (además de/en vez de una task). En 7F, solo el
 * fallo de proveedor IA se modela como alert — los eventos de aprobación son
 * puramente tareas operativas para un humano, no incidentes técnicos.
 */
const ALERTABLE_TYPES: ReadonlySet<CampaignAutomationType> = new Set([
  'campaign_ai_provider_failure',
]);

export function campaignAutomationTypeCreatesAlert(type: CampaignAutomationType): boolean {
  return ALERTABLE_TYPES.has(type);
}
