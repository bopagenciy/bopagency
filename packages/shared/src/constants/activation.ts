/**
 * Campaign Activation — enums cerrados (Phase 8A.1).
 *
 * Fuente única de verdad para los valores permitidos de status/canal/
 * proveedor de `CampaignActivation`/`CampaignActivationTarget`. Alineados
 * 1:1 con los ENUMs de Postgres creados en
 * 20260824180000_phase8a1_campaign_activation_domain.sql y con el diseño
 * de docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md §6/§7.
 *
 * NO ampliar estas listas sin actualizar la migración (ENUM de DB) y este
 * archivo a la vez — un valor aceptado aquí pero no en DB (o viceversa)
 * rompe el mapper de infraestructura en tiempo de ejecución.
 */

// ─── Activation status (nivel activation) ──────────────────────────────────────

export const ACTIVATION_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'scheduled',
  'executing',
  'completed',
  'partially_completed',
  'failed',
  'cancelled',
] as const;

export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];

/** Estados terminales — sin transiciones salientes. */
export const ACTIVATION_TERMINAL_STATUSES: readonly ActivationStatus[] = [
  'completed',
  'partially_completed',
  'failed',
  'cancelled',
];

// ─── Activation target status (nivel canal) ────────────────────────────────────

export const ACTIVATION_TARGET_STATUSES = [
  'pending',
  'preparing',
  'ready',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'cancelled',
] as const;

export type ActivationTargetStatus = (typeof ACTIVATION_TARGET_STATUSES)[number];

export const ACTIVATION_TARGET_TERMINAL_STATUSES: readonly ActivationTargetStatus[] = [
  'published',
  'failed',
  'cancelled',
];

// ─── Channel / Provider (cerrados — ver audit §7) ──────────────────────────────

export const ACTIVATION_CHANNELS = [
  'manual',
  'meta_ads',
  'instagram_organic',
  'facebook_organic',
  'google_ads',
  'linkedin_ads',
  'email',
] as const;

export type ActivationChannel = (typeof ACTIVATION_CHANNELS)[number];

export const ACTIVATION_PROVIDERS = ['manual', 'meta', 'google', 'linkedin', 'email'] as const;

export type ActivationProvider = (typeof ACTIVATION_PROVIDERS)[number];

export const ACTIVATION_CHANNEL_LABELS: Record<ActivationChannel, string> = {
  manual: 'Manual',
  meta_ads: 'Meta Ads',
  instagram_organic: 'Instagram (orgánico)',
  facebook_organic: 'Facebook (orgánico)',
  google_ads: 'Google Ads',
  linkedin_ads: 'LinkedIn Ads',
  email: 'Email',
};

/**
 * Mapa channel → provider esperado. Un target `channel: 'meta_ads'` SIEMPRE
 * tiene `provider: 'meta'` — no es una elección libre del caller, es una
 * relación fija (ver audit §7: "provider = quién ejecuta técnicamente").
 */
export const ACTIVATION_CHANNEL_PROVIDER: Record<ActivationChannel, ActivationProvider> = {
  manual: 'manual',
  meta_ads: 'meta',
  instagram_organic: 'meta',
  facebook_organic: 'meta',
  google_ads: 'google',
  linkedin_ads: 'linkedin',
  email: 'email',
};

/** Retorna `true` si `provider` es el proveedor correcto para `channel`. */
export function isValidChannelProviderPair(
  channel: ActivationChannel,
  provider: ActivationProvider,
): boolean {
  return ACTIVATION_CHANNEL_PROVIDER[channel] === provider;
}

// ─── Activation event type (append-only log — ver audit §10) ──────────────────
//
// Conjunto MÍNIMO necesario para 8A.1 (persistencia + transiciones ya
// implementadas en esta subfase). NO se agregan tipos especulativos para
// funcionalidad que todavía no existe (ej. no hay "target_scheduled" como
// evento propio — queda cubierto por 'target_status_changed').

export const ACTIVATION_EVENT_TYPES = [
  'activation_created',
  'target_added',
  'target_removed',
  'activation_status_changed',
  'target_status_changed',
  'activation_cancelled',
] as const;

export type ActivationEventType = (typeof ACTIVATION_EVENT_TYPES)[number];
