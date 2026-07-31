/**
 * Phase 4 — Alerts Importer
 *
 * Source:  shared-data/alerts/alert-state.json
 * Target:  public.alerts
 * Key:     organization_id + alert_key (unique)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeHash, computeTextHash } from '../hash';
import { Logger } from '../logger';
import { readJsonFile } from '../adapters/filesystem';
import { detectSecrets } from '../adapters/secret-detector';
import { getSupabaseClient } from '../adapters/supabase';
import { extractPostgrestExtra } from '../adapters/postgrest-error';
import type {
  Importer,
  ImporterContext,
  MigrationAction,
  MigrationResult,
  RawAlertEntry,
} from '../types';

const ALERTS_SOURCE = 'shared-data/alerts/alert-state.json';

/**
 * Real schema: { schemaVersion, updatedAt, states: Record<string, RawAlertEntry> }
 * Legacy schemas also accepted: plain array, or { alerts: RawAlertEntry[] }
 */
type AlertState =
  | RawAlertEntry[]
  | { alerts: RawAlertEntry[] }
  | { states: Record<string, RawAlertEntry>; schemaVersion?: string; updatedAt?: string };

// ─── Alert helpers ────────────────────────────────────────────────────────────

export type AlertStatus = 'active' | 'acknowledged' | 'snoozed' | 'resolved';

// Mapeo explícito de tipos conocidos (UPPER → snake_case válido en DB).
// Ampliar aquí cuando aparezcan nuevos tipos en las fuentes.
const KNOWN_ALERT_TYPE_MAP: Record<string, string> = {
  NO_CAMPAIGNS: 'no_campaigns',
  NO_SPEND: 'no_spend',
  HIGH_CPA: 'high_cpa',
  LOW_CTR: 'low_ctr',
  TRACKING_ERROR: 'tracking_error',
  LOW_ROAS: 'low_roas',
  HIGH_CPM: 'high_cpm',
  LOW_CONVERSION_RATE: 'low_conversion_rate',
  BUDGET_DEPLETED: 'budget_depleted',
  AD_REJECTED: 'ad_rejected',
};

/** Formato válido para alert_type en la BD. */
const ALERT_TYPE_RE = /^[a-z][a-z0-9_]{0,99}$/;

/**
 * Convierte una cadena arbitraria a snake_case válido para alert_type.
 * Ej: "HIGH CPA" → "high_cpa",  "trackingError" → "trackingerror" (seguro)
 */
function toAlertTypeSnake(raw: string): string | null {
  const lower = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const cleaned = lower.replace(/^_+|_+$/g, '');
  return ALERT_TYPE_RE.test(cleaned) ? cleaned : null;
}

/**
 * Normaliza un string de tipo de alerta usando el mapa conocido primero,
 * luego intenta conversión a snake_case.
 */
function normalizeAlertTypeString(raw: string): string | null {
  const upper = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
  if (KNOWN_ALERT_TYPE_MAP[upper]) return KNOWN_ALERT_TYPE_MAP[upper];
  return toAlertTypeSnake(raw);
}

/**
 * Extrae el tipo de alerta del sourceKey (clave del states map).
 *
 * Formato esperado: {clientSlug}_{ALERT_PARTS...}_{accountId}
 * Ejemplo: legalink-col_NO_CAMPAIGNS_act_906768512465553
 *   → segmentos separados por _: ['legalink-col', 'NO', 'CAMPAIGNS', 'act', '906768...']
 *   → slug del cliente contiene guiones (legalink-col) → saltarlo
 *   → colectar segmentos en MAYÚSCULAS consecutivos: NO, CAMPAIGNS → NO_CAMPAIGNS
 *   → convertir a snake_case: no_campaigns
 */
function deriveTypeFromSourceKey(sourceKey: string): string | null {
  const segments = sourceKey.split('_');
  const typeParts: string[] = [];
  let inType = false;

  for (const seg of segments) {
    if (!inType) {
      // El slug del cliente contiene guiones; saltarlo y esperar el tipo
      if (seg.includes('-')) continue;
      // Segmento completamente en MAYÚSCULAS (y posiblemente dígitos) → inicio del tipo
      if (/^[A-Z][A-Z0-9]*$/.test(seg)) {
        inType = true;
        typeParts.push(seg);
      }
      // Si es minúsculas/mixto sin guión antes del tipo → parar (no debería pasar)
    } else {
      // Seguir acumulando mientras sea MAYÚSCULAS
      if (/^[A-Z][A-Z0-9]*$/.test(seg)) {
        typeParts.push(seg);
      } else {
        // Llegamos a la sección del accountId (ej. 'act', dígitos) → parar
        break;
      }
    }
  }

  if (typeParts.length === 0) return null;
  const joined = typeParts.join('_'); // e.g. "NO_CAMPAIGNS"
  if (KNOWN_ALERT_TYPE_MAP[joined]) return KNOWN_ALERT_TYPE_MAP[joined];
  return toAlertTypeSnake(joined);
}

/**
 * Normaliza el tipo de alerta con la siguiente prioridad:
 *   1. entry.alert_type  (campo extra en el JSON fuente)
 *   2. entry.alertType   (campo tipado, camelCase — puede ser undefined en runtime)
 *   3. entry.type        (campo genérico en el JSON fuente)
 *   4. entry.rule_id / ruleId (regla conocida → tipo)
 *   5. Derivación controlada desde sourceKey (segmentos en MAYÚSCULAS)
 *
 * Mapeos explícitos para tipos conocidos (NO_CAMPAIGNS, NO_SPEND, etc.).
 * Normaliza a formato: ^[a-z][a-z0-9_]{0,99}$
 *
 * Retorna null si no se puede derivar un tipo válido (→ error ALERT_TYPE_MISSING).
 */
export function normalizeAlertType(entry: RawAlertEntry, sourceKey: string): string | null {
  const ext = entry as unknown as Record<string, unknown>;

  // 1. alert_type (campo extra, snake_case)
  const rawAlertType = ext['alert_type'];
  if (typeof rawAlertType === 'string' && rawAlertType.trim()) {
    const n = normalizeAlertTypeString(rawAlertType);
    if (n) return n;
  }

  // 2. alertType (camelCase — tipado como string pero puede ser undefined en runtime)
  const rawCamel = (entry as { alertType?: string }).alertType;
  if (typeof rawCamel === 'string' && rawCamel.trim()) {
    const n = normalizeAlertTypeString(rawCamel);
    if (n) return n;
  }

  // 3. type (campo genérico)
  const rawType = ext['type'];
  if (typeof rawType === 'string' && rawType.trim()) {
    const n = normalizeAlertTypeString(rawType);
    if (n) return n;
  }

  // 4. rule_id / ruleId (identificador de regla conocido)
  const ruleId = ext['rule_id'] ?? ext['ruleId'];
  if (typeof ruleId === 'string' && ruleId.trim()) {
    const n = normalizeAlertTypeString(ruleId);
    if (n) return n;
  }

  // 5. Derivación desde sourceKey
  return deriveTypeFromSourceKey(sourceKey);
}

/**
 * Normaliza el estado de una alerta al enum real de alert_status.
 * Retorna null para estados desconocidos — no se deben enviar al DB sin revisión.
 *
 * Mapeo explícito:
 *   open         → active
 *   active       → active
 *   acknowledged → acknowledged
 *   snoozed      → snoozed
 *   resolved     → resolved
 *   closed       → resolved
 *   (undefined)  → active  (default: alerta activa sin estado declarado)
 *   (otro)       → null    (desconocido — debe clasificarse como manual-review)
 */
export function normalizeAlertStatus(raw: string | undefined): AlertStatus | null {
  if (raw === undefined || raw === null) return 'active';
  const map: Record<string, AlertStatus> = {
    open: 'active',
    active: 'active',
    acknowledged: 'acknowledged',
    snoozed: 'snoozed',
    resolved: 'resolved',
    closed: 'resolved',
  };
  return map[raw.toLowerCase()] ?? null;
}

/**
 * Deriva una clave de fuente estable para una alerta.
 *
 * Prioridad:
 *   1. entry.id          (campo extendido en el JSON fuente)
 *   2. entry.alertKey    (campo tipado, pero puede ser undefined en runtime)
 *   3. entry.signature   (campo extendido en el JSON fuente)
 *   4. hash determinístico de alertType|platform|accountId|detectedAt
 *
 * Garantías:
 *   - Nunca retorna undefined.
 *   - Máximo 255 caracteres.
 *   - Retorna null SOLO si no hay ningún dato identificador (completamente vacío).
 */
export function deriveAlertSourceKey(entry: RawAlertEntry): string | null {
  const ext = entry as unknown as Record<string, unknown>;

  // 1. id (campo extra en el JSON fuente)
  const extId = ext['id'];
  if (typeof extId === 'string' && extId.trim().length > 0) {
    return extId.slice(0, 255);
  }

  // 2. alertKey (tipado como string pero puede ser undefined at runtime)
  const alertKey = (entry as { alertKey?: string }).alertKey;
  if (typeof alertKey === 'string' && alertKey.trim().length > 0) {
    return alertKey.slice(0, 255);
  }

  // 3. signature (campo extra en el JSON fuente)
  const signature = ext['signature'];
  if (typeof signature === 'string' && signature.trim().length > 0) {
    return signature.slice(0, 255);
  }

  // 4. Hash determinístico de campos identificadores
  const parts = [
    entry.alertType ?? '',
    entry.platform ?? '',
    entry.accountId ?? '',
    entry.detectedAt ?? '',
  ].join('|');

  if (parts === '|||') {
    // No hay ningún dato identificador — imposible derivar clave estable
    return null;
  }

  return `alert-${computeTextHash(parts)}`.slice(0, 255);
}

function parseAlertEntries(raw: AlertState): RawAlertEntry[] {
  if (Array.isArray(raw)) return raw;
  if ('states' in raw) {
    // Preservar la clave del map como alertKey si la entrada no lo define explícitamente.
    // En el JSON fuente, la clave del states map ES el alertKey, pero el objeto interno
    // puede no tener el campo alertKey seteado.
    return Object.entries(raw.states).map(([stateKey, alertEntry]) => ({
      ...alertEntry,
      alertKey: (alertEntry as { alertKey?: string }).alertKey ?? stateKey,
    }));
  }
  if ('alerts' in raw) return raw.alerts ?? [];
  return [];
}

export class AlertsImporter implements Importer {
  readonly entityType = 'alert' as const;
  private readonly logger: Logger;

  constructor(verbose: boolean) {
    this.logger = new Logger(verbose);
  }

  async run(ctx: ImporterContext): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];
    const { runId, organizationId, config } = ctx;
    const client = getSupabaseClient(config);

    const rawData = readJsonFile<AlertState>(config.repositoryRoot, ALERTS_SOURCE);
    if (!rawData) {
      this.logger.warn(`[alerts-importer] ${ALERTS_SOURCE} no encontrado`);
      return results;
    }

    const secretScan = detectSecrets(rawData);
    if (secretScan.hasSecrets) {
      this.logger.warn('[alerts-importer] Secretos detectados — excluido', {
        fields: secretScan.detectedFields,
      });
      results.push(
        this.makeResult(
          runId,
          organizationId,
          ALERTS_SOURCE,
          'alert-state',
          null,
          'excluded-secret',
          'SECRET_DETECTED',
          'Secretos detectados',
        ),
      );
      return results;
    }

    const entries: RawAlertEntry[] = parseAlertEntries(rawData);

    if (entries.length === 0) {
      this.logger.info('[alerts-importer] 0 alertas activas en states — archivo válido pero vacío');
      return results;
    }

    const limit = config.limit;
    let processed = 0;

    for (const entry of entries) {
      if (limit !== null && processed >= limit) break;

      // Derivar sourceKey ANTES de cualquier operación — rechazar si no es derivable.
      const derivedKey = deriveAlertSourceKey(entry);
      if (!derivedKey) {
        const sourceHash = computeHash(entry);
        const fallbackKey = `alert-invalid-${computeTextHash(JSON.stringify(entry))}`.slice(0, 255);
        const fallbackPath = `${ALERTS_SOURCE}#${fallbackKey}`;
        this.logger.error('[alerts-importer] No se pudo derivar sourceKey — alerta rechazada', {
          alertType: entry.alertType,
        });
        results.push(
          this.makeResult(
            runId,
            organizationId,
            fallbackPath,
            fallbackKey,
            sourceHash,
            'error',
            'SOURCE_KEY_MISSING',
            'No se pudo derivar sourceKey para esta alerta: sin id, alertKey, signature ni campos identificadores',
          ),
        );
        processed++;
        continue;
      }

      const sourceKey = derivedKey;
      const sourcePath = `${ALERTS_SOURCE}#${sourceKey}`;
      const start = Date.now();
      const sourceHash = computeHash(entry);

      try {
        const r = await this.upsertAlert(
          client,
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          entry,
          derivedKey,
          config.mode,
        );
        results.push({ record: r, durationMs: Date.now() - start });
        processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`[alerts-importer] Error en ${sourceKey}`, { message });
        results.push(
          this.makeResult(
            runId,
            organizationId,
            sourcePath,
            sourceKey,
            sourceHash,
            'error',
            'IMPORT_ERROR',
            message,
          ),
        );
        processed++;
      }
    }

    return results;
  }

  private async upsertAlert(
    client: SupabaseClient,
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string,
    entry: RawAlertEntry,
    alertKey: string, // clave derivada por deriveAlertSourceKey — nunca undefined
    mode: string,
  ): Promise<MigrationResult['record']> {
    // Normalizar alert_type — rechazar si no se puede derivar (null value prohibido)
    const normalizedAlertType = normalizeAlertType(entry, sourceKey);
    if (normalizedAlertType === null) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
        null,
        'error',
        'ALERT_TYPE_MISSING',
        `No se pudo derivar alert_type para "${sourceKey}". ` +
          'Añadir el tipo al KNOWN_ALERT_TYPE_MAP o corregir los campos en el JSON fuente.',
      );
    }

    // Normalizar status ANTES de cualquier escritura — rechazar si desconocido
    const normalizedStatus = normalizeAlertStatus(entry.status);
    if (normalizedStatus === null) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
        null,
        'error',
        'UNKNOWN_STATUS',
        `Estado de alerta desconocido: "${entry.status}". Valores válidos: active, acknowledged, snoozed, resolved, open, closed.`,
      );
    }

    const { data: existing } = await client
      .from('migration_records')
      .select('source_hash, target_id')
      .eq('organization_id', organizationId)
      .eq('source_key', sourceKey)
      .eq('target_table', 'alerts')
      .eq('action', 'insert')
      .maybeSingle();

    if (existing && (existing as { source_hash: string }).source_hash === sourceHash) {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
        (existing as { target_id: string }).target_id,
        'skip-preexisting',
        null,
        null,
      );
    }

    if (mode === 'dry_run') {
      return this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
        null,
        'insert',
        null,
        null,
      );
    }

    const { data: inserted, error } = await client
      .from('alerts')
      .upsert(
        {
          organization_id: organizationId,
          alert_key: alertKey, // clave derivada — nunca undefined
          alert_type: normalizedAlertType, // normalizado — nunca null ni undefined
          severity: entry.severity ?? 'info',
          status: normalizedStatus, // valor validado del enum alert_status
          title: entry.title ?? null,
          description: entry.description ?? null,
          platform: entry.platform ?? null,
          account_id: entry.accountId ?? null,
          detected_at: entry.detectedAt ?? null,
          acknowledged_at: entry.acknowledgedAt ?? null,
          snoozed_until: entry.snoozedUntil ?? null,
          resolved_at: entry.resolvedAt ?? null,
          metadata: entry.metadata ?? {},
          legacy_path: sourcePath,
          migrated_at: new Date().toISOString(),
          migration_version: '4.0.0',
          source_hash: sourceHash,
        },
        { onConflict: 'organization_id,alert_key' },
      )
      .select('id')
      .single();

    if (error) {
      return {
        ...this.makeRecord(
          runId,
          organizationId,
          sourcePath,
          sourceKey,
          sourceHash,
          'alerts',
          null,
          'error',
          'UPSERT_FAILED',
          error.message,
        ),
        ...extractPostgrestExtra(error),
      };
    }

    return this.makeRecord(
      runId,
      organizationId,
      sourcePath,
      sourceKey,
      sourceHash,
      'alerts',
      (inserted as { id: string }).id,
      'insert',
      null,
      null,
    );
  }

  private makeRecord(
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string | null,
    targetTable: string,
    targetId: string | null,
    action: MigrationAction,
    errorCode: string | null,
    errorMessage: string | null,
  ): MigrationResult['record'] {
    return {
      runId,
      organizationId,
      entityType: 'alert',
      sourcePath,
      sourceKey,
      sourceHash,
      targetTable,
      targetId,
      action,
      errorCode,
      errorMessage,
    };
  }

  private makeResult(
    runId: string,
    organizationId: string,
    sourcePath: string,
    sourceKey: string,
    sourceHash: string | null,
    action: MigrationAction,
    errorCode: string | null,
    errorMessage: string | null,
  ): MigrationResult {
    return {
      record: this.makeRecord(
        runId,
        organizationId,
        sourcePath,
        sourceKey,
        sourceHash,
        'alerts',
        null,
        action,
        errorCode,
        errorMessage,
      ),
      durationMs: 0,
    };
  }
}
