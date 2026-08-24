/**
 * Guardas estáticas de contenido sobre la migración SQL de Phase 8A.1.
 *
 * Mismo criterio y mismas limitaciones explícitas que
 * phase7c-migration-security.test.ts: el repo no tiene hoy un harness de
 * integración contra una Supabase real en CI, y esta migración
 * (20260824180000_phase8a1_campaign_activation_domain.sql) NO se aplicó
 * contra ninguna base de datos en esta tarea (restricción explícita del
 * kickoff de 8A.1 §21/§27 — "local ONLY, y ningún supabase/docker/psql CLI
 * disponible en este entorno"). Este archivo es una guarda de regresión
 * sobre el TEXTO de la migración: verifica por contrato de texto que las
 * propiedades de seguridad exigidas por el kickoff (RLS habilitado, grants
 * correctos, append-only real, constraints críticos, sin service_role,
 * enforcement de mismo-tenant, enforcement de linkage de aprobación) están
 * presentes — NO ejecuta la migración, NO prueba comportamiento en runtime,
 * NO prueba condiciones de carrera del FOR UPDATE de las RPCs. Verificación
 * real pendiente: aplicar la migración contra Supabase local cuando el
 * usuario lo autorice, y correr los smoke tests manuales documentados en el
 * reporte de 8A.1.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../../supabase/migrations/20260824180000_phase8a1_campaign_activation_domain.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8');
});

describe('Phase 8A.1 migration — existencia y estructura básica', () => {
  it('el archivo de migración existe y no está vacío', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('crea exactamente las 3 tablas del aggregate (y ninguna otra tabla nueva)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_activations/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_activation_targets/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_activation_events/);
    // Explícitamente fuera de alcance de 8A.1 — ver kickoff §11/§33.
    expect(sql).not.toMatch(/CREATE TABLE[^;]*publication_jobs/);
    expect(sql).not.toMatch(/CREATE TABLE[^;]*execution_jobs/);
  });

  it('no altera tablas de Phase 7 ni ninguna otra tabla existente (es aditiva)', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.campaigns/);
    expect(sql).not.toMatch(/ALTER TABLE public\.campaign_approvals/);
    expect(sql).not.toMatch(/ALTER TABLE public\.automation_executions/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it('no contiene SQL dinámico (EXECUTE/format() para construir sentencias)', () => {
    expect(sql).not.toMatch(/EXECUTE\s+format\(/i);
    expect(sql).not.toMatch(/EXECUTE\s+'/i);
  });

  it('no otorga ningún privilegio a service_role (solo referencias en comentarios explicando su ausencia)', () => {
    expect(sql).not.toMatch(/GRANT[^;]*TO service_role/);
    expect(sql).not.toMatch(/TO\s+service_role/);
  });
});

describe('Phase 8A.1 migration — RLS habilitado en las 3 tablas', () => {
  it('ENABLE ROW LEVEL SECURITY en las 3 tablas', () => {
    expect(sql).toMatch(/ALTER TABLE public\.campaign_activations\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_activation_targets ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_activation_events\s+ENABLE ROW LEVEL SECURITY/);
  });

  it('SELECT de las 3 tablas está acotado por is_organization_member (org-scoped, no helper duplicado)', () => {
    expect(sql).toMatch(
      /CREATE POLICY campaign_activations_select ON public\.campaign_activations FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_activations\.organization_id\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY campaign_activation_targets_select ON public\.campaign_activation_targets FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_activation_targets\.organization_id\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY campaign_activation_events_select ON public\.campaign_activation_events FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_activation_events\.organization_id\)\)/,
    );
  });

  it('usa exclusivamente los helpers existentes (is_organization_member / has_organization_role) — no define un helper duplicado', () => {
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.is_organization_member/);
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.has_organization_role/);
  });

  it('INSERT/UPDATE de campaign_activations exige rol strategist+', () => {
    const insertPolicy = extractPolicy(sql, 'campaign_activations_insert');
    const updatePolicy = extractPolicy(sql, 'campaign_activations_update');
    expect(insertPolicy).toMatch(/has_organization_role\(campaign_activations\.organization_id, 'strategist'\)/);
    expect(updatePolicy).toMatch(/has_organization_role\(campaign_activations\.organization_id, 'strategist'\)/);
  });

  it('campaign_activations no tiene policy de DELETE (lifecycle vía cancel, nunca borrado físico)', () => {
    expect(sql).not.toMatch(/CREATE POLICY campaign_activations_delete/);
  });

  it('campaign_activation_targets: INSERT/DELETE exigen strategist+, UPDATE exige operator+', () => {
    const insertPolicy = extractPolicy(sql, 'campaign_activation_targets_insert');
    const deletePolicy = extractPolicy(sql, 'campaign_activation_targets_delete');
    const updatePolicy = extractPolicy(sql, 'campaign_activation_targets_update');
    expect(insertPolicy).toMatch(/has_organization_role\(campaign_activation_targets\.organization_id, 'strategist'\)/);
    expect(deletePolicy).toMatch(/has_organization_role\(campaign_activation_targets\.organization_id, 'strategist'\)/);
    expect(updatePolicy).toMatch(/has_organization_role\(campaign_activation_targets\.organization_id, 'operator'\)/);
  });

  it('campaign_activation_events no tiene ninguna policy de INSERT/UPDATE/DELETE', () => {
    expect(sql).not.toMatch(/CREATE POLICY campaign_activation_events_insert/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_activation_events_update/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_activation_events_delete/);
  });
});

describe('Phase 8A.1 migration — grants (append-only real de events)', () => {
  it('REVOKE ALL inicial de anon/authenticated en las 3 tablas antes de otorgar explícito', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.campaign_activations\s+FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.campaign_activation_targets\s+FROM anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON public\.campaign_activation_events\s+FROM anon, authenticated/);
  });

  it('campaign_activation_events: authenticated SOLO tiene SELECT — ningún INSERT/UPDATE/DELETE', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.campaign_activation_events TO authenticated;/);
    expect(sql).not.toMatch(/GRANT[^;]*INSERT[^;]*ON public\.campaign_activation_events/);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*ON public\.campaign_activation_events/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.campaign_activation_events/);
  });

  it('campaign_activations: UPDATE column-level acotado a notes/metadata (no status ni timestamps)', () => {
    expect(sql).toMatch(/GRANT UPDATE \(notes, metadata\) ON public\.campaign_activations TO authenticated;/);
    expect(sql).not.toMatch(/GRANT UPDATE ON public\.campaign_activations TO authenticated/);
  });

  it('campaign_activation_targets: UPDATE column-level acotado a readiness_checklist/metadata (no status)', () => {
    expect(sql).toMatch(
      /GRANT UPDATE \(readiness_checklist, metadata\) ON public\.campaign_activation_targets TO authenticated;/,
    );
    expect(sql).not.toMatch(/GRANT UPDATE ON public\.campaign_activation_targets TO authenticated/);
  });

  it('campaign_activations no tiene GRANT DELETE para authenticated', () => {
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.campaign_activations TO authenticated/);
  });
});

describe('Phase 8A.1 migration — RPCs SECURITY DEFINER (transiciones críticas)', () => {
  const RPCS = [
    'prepare_activation_target',
    'mark_activation_target_ready',
    'mark_activation_target_published',
    'cancel_activation_target',
    'cancel_campaign_activation',
  ];

  it('las 5 RPCs son SECURITY DEFINER con search_path fijo', () => {
    for (const name of RPCS) {
      const block = extractFunction(sql, name);
      expect(block).toMatch(/SECURITY DEFINER/);
      expect(block).toMatch(/SET search_path = public/);
    }
  });

  it('las 5 RPCs rechazan auth.uid() NULL', () => {
    for (const name of RPCS) {
      const block = extractFunction(sql, name);
      expect(block).toMatch(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/);
      expect(block).toMatch(/authentication required/);
    }
  });

  it('las 5 RPCs cargan la fila con FOR UPDATE (lock)', () => {
    for (const name of RPCS) {
      const block = extractFunction(sql, name);
      expect(block).toMatch(/FOR UPDATE/);
    }
  });

  it('ninguna RPC recibe actor_user_id ni organization_id como parámetro', () => {
    expect(sql).not.toMatch(/p_actor_user_id/);
    expect(sql).not.toMatch(/prepare_activation_target\([^)]*p_organization_id/);
    expect(sql).not.toMatch(/cancel_campaign_activation\([^)]*p_organization_id/);
  });

  it('cancel_activation_target y cancel_campaign_activation exigen reason no vacío', () => {
    const cancelTarget = extractFunction(sql, 'cancel_activation_target');
    const cancelActivation = extractFunction(sql, 'cancel_campaign_activation');
    expect(cancelTarget).toMatch(/char_length\(trim\(p_reason\)\)\s*=\s*0/);
    expect(cancelTarget).toMatch(/reason is required/);
    expect(cancelActivation).toMatch(/char_length\(trim\(p_reason\)\)\s*=\s*0/);
    expect(cancelActivation).toMatch(/reason is required/);
  });

  it('las 5 RPCs no tienen EXECUTE para PUBLIC ni anon (solo authenticated)', () => {
    for (const name of RPCS) {
      const revokePublicRe = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC`);
      const revokeAnonRe = new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM anon`);
      const grantAuthenticatedRe = new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO authenticated`);
      expect(sql).toMatch(revokePublicRe);
      expect(sql).toMatch(revokeAnonRe);
      expect(sql).toMatch(grantAuthenticatedRe);
    }
  });

  it('cancel_campaign_activation rechaza cancelar mientras executing y cascada targets no-terminales', () => {
    const block = extractFunction(sql, 'cancel_campaign_activation');
    expect(block).toMatch(/cannot cancel activation.*while executing/);
    expect(block).toMatch(/UPDATE public\.campaign_activation_targets/);
    expect(block).toMatch(/status NOT IN \('published', 'failed', 'cancelled'\)/);
  });
});

describe('Phase 8A.1 migration — tenencia y linkage de aprobación (enforcement en BD, no solo application)', () => {
  it('campaign_activations tiene FKs a organizations/clients/campaigns/campaign_approvals', () => {
    expect(sql).toMatch(/organization_id\s+uuid\s+NOT NULL\s*\n?\s*REFERENCES public\.organizations\(id\)/);
    expect(sql).toMatch(/client_id\s+uuid\s+NOT NULL\s*\n?\s*REFERENCES public\.clients\(id\)/);
    expect(sql).toMatch(/campaign_id\s+uuid\s+NOT NULL\s*\n?\s*REFERENCES public\.campaigns\(id\)/);
    expect(sql).toMatch(/campaign_approval_id\s+uuid\s+NOT NULL\s*\n?\s*REFERENCES public\.campaign_approvals\(id\)/);
  });

  it('existe un trigger que valida el origen de la activation (campaign approved + approval real)', () => {
    const checkSourceFn = extractFunction(sql, 'check_activation_source');
    expect(checkSourceFn.length).toBeGreaterThan(0);
    expect(sql).toMatch(/check_activation_source/);
    // Debe referenciar tanto el status de la campaña como el campaign_id del approval
    expect(checkSourceFn).toMatch(/campaigns/);
    expect(checkSourceFn).toMatch(/campaign_approvals/);
  });

  it('existe un trigger que valida same-tenant + cross-org integration guard en targets', () => {
    const checkMatchFn = extractFunction(sql, 'check_activation_target_match');
    expect(checkMatchFn.length).toBeGreaterThan(0);
    expect(checkMatchFn).toMatch(/organization_id/);
    expect(checkMatchFn).toMatch(/client_integrations/);
  });

  it('los triggers de check_activation_source y check_activation_target_match están efectivamente conectados (CREATE TRIGGER)', () => {
    expect(sql).toMatch(/CREATE TRIGGER[^;]*check_activation_source/);
    expect(sql).toMatch(/CREATE TRIGGER[^;]*check_activation_target_match/);
  });

  it('client_integration_id, si no-NULL, referencia public.client_integrations', () => {
    expect(sql).toMatch(/client_integration_id\s+uuid\s+NULL\s*\n?\s*REFERENCES public\.client_integrations\(id\)/);
  });
});

describe('Phase 8A.1 migration — constraints críticos', () => {
  it('approved_snapshot es NOT NULL y exige jsonb_typeof = object', () => {
    expect(sql).toMatch(/approved_snapshot\s+jsonb\s+NOT NULL\s*\n?\s*CHECK \(jsonb_typeof\(approved_snapshot\) = 'object'\)/);
  });

  it('cancellation_reason es requerido (no vacío) cuando status = cancelled', () => {
    expect(sql).toMatch(/CONSTRAINT ck_campaign_activations_cancellation_reason CHECK \(/);
    expect(sql).toMatch(/status <> 'cancelled' OR \(cancellation_reason IS NOT NULL AND char_length\(trim\(cancellation_reason\)\) > 0\)/);
  });

  it('channel/provider deben corresponder (constraint cerrado, no combinación libre)', () => {
    expect(sql).toMatch(/CONSTRAINT ck_activation_targets_channel_provider CHECK \(/);
    expect(sql).toMatch(/channel = 'manual'\s+AND provider = 'manual'/);
  });

  it('manual nunca referencia client_integration_id; cualquier otro canal lo requiere', () => {
    expect(sql).toMatch(/CONSTRAINT ck_activation_targets_manual_integration CHECK \(/);
    expect(sql).toMatch(/channel = 'manual' AND client_integration_id IS NULL/);
    expect(sql).toMatch(/channel <> 'manual' AND client_integration_id IS NOT NULL/);
  });

  it('campaign_activation_events: actor_user_id NULL solo si is_system = true', () => {
    expect(sql).toMatch(/CONSTRAINT ck_activation_events_actor CHECK \(/);
    expect(sql).toMatch(/\(is_system = true\) OR \(actor_user_id IS NOT NULL\)/);
  });

  it('idempotencia: índice único parcial de una sola activation no-terminal por campaña', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_activations_active_per_campaign\s+ON public\.campaign_activations\(campaign_id\)\s+WHERE status NOT IN \('completed', 'partially_completed', 'failed', 'cancelled'\)/,
    );
  });

  it('idempotencia: índice único de dedupe de targets por activation+channel+provider+placement', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_targets_dedupe\s+ON public\.campaign_activation_targets\(activation_id, channel, provider, COALESCE\(placement, ''\)\)/,
    );
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae el cuerpo de una función `CREATE OR REPLACE FUNCTION public.<name>`
 * hasta su terminador `$$;` — suficiente para estos asserts de contenido sin
 * necesitar un parser SQL real. Mismo helper que
 * phase7c-migration-security.test.ts.
 */
function extractFunction(source: string, name: string): string {
  const startMarker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`No se encontró la función ${name} en la migración`);
  }
  const endIndex = source.indexOf('$$;', startIndex);
  if (endIndex === -1) {
    throw new Error(`No se encontró el fin del cuerpo de la función ${name}`);
  }
  return source.slice(startIndex, endIndex + 3);
}

/**
 * Extrae el cuerpo de una policy `CREATE POLICY <name> ON ...` hasta el
 * siguiente `;` de nivel superior.
 */
function extractPolicy(source: string, name: string): string {
  const startMarker = `CREATE POLICY ${name} ON `;
  const startIndex = source.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`No se encontró la policy ${name} en la migración`);
  }
  const endIndex = source.indexOf(';', startIndex);
  if (endIndex === -1) {
    throw new Error(`No se encontró el fin de la policy ${name}`);
  }
  return source.slice(startIndex, endIndex + 1);
}
