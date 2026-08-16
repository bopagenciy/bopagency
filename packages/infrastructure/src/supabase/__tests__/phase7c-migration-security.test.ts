/**
 * Guardas estáticas de contenido sobre la migración SQL de Phase 7C.
 *
 * El repo NO tiene hoy un harness de integración contra una Supabase real en
 * CI (Phase 7B ya documentó esto: "no se ejecutaron tests de migración SQL
 * contra una base de datos real"). Esta migración NO se aplica como parte de
 * esta tarea (restricción explícita). Ante la ausencia de una alternativa
 * mejor, este archivo actúa como una guarda de regresión sobre el TEXTO de
 * la migración: si alguien edita el archivo y accidentalmente retira una de
 * las propiedades de seguridad exigidas (SECURITY DEFINER, search_path,
 * chequeo de auth.uid(), chequeo de rol admin/owner, chequeo de status =
 * review, nota de rechazo, GRANTs correctos), este test falla.
 *
 * LIMITACIÓN EXPLÍCITA: esto NO reemplaza un test de integración real contra
 * Postgres — no ejecuta la función, no verifica el comportamiento en
 * runtime, no prueba condiciones de carrera del FOR UPDATE. Es un test de
 * texto (frágil por naturaleza), aceptado aquí únicamente porque no existe
 * hoy una alternativa mejor sin levantar Supabase local, y porque la tarea
 * lo pidió explícitamente. Verificación real: ejecutar los smoke tests
 * manuales listados en PHASE_7C_APPROVAL_COMPLIANCE_REPORT.md contra
 * Supabase local, una vez el usuario apruebe aplicar la migración.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../../supabase/migrations/20260816140000_phase7c_campaign_approval_workflow.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8');
});

describe('Phase 7C migration — approve_campaign / reject_campaign', () => {
  it('el archivo de migración existe y no está vacío', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('ambas RPCs son SECURITY DEFINER', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/SECURITY DEFINER/);
    expect(rejectBlock).toMatch(/SECURITY DEFINER/);
  });

  it('ambas RPCs fijan search_path explícito y seguro (SET search_path = public)', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/SET search_path = public/);
    expect(rejectBlock).toMatch(/SET search_path = public/);
  });

  it('ambas RPCs rechazan auth.uid() NULL', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/v_actor\s+IS NULL/);
    expect(approveBlock).toMatch(/authentication required/);
    expect(rejectBlock).toMatch(/v_actor\s+IS NULL/);
    expect(rejectBlock).toMatch(/authentication required/);
  });

  it('ambas RPCs exigen has_organization_role(..., \'admin\')', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/has_organization_role\(v_org_id, 'admin'\)/);
    expect(rejectBlock).toMatch(/has_organization_role\(v_org_id, 'admin'\)/);
  });

  it('ambas RPCs exigen status actual = review', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/v_status <> 'review'/);
    expect(rejectBlock).toMatch(/v_status <> 'review'/);
  });

  it('ambas RPCs cargan la campaña con FOR UPDATE (lock de fila)', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/FOR UPDATE/);
    expect(rejectBlock).toMatch(/FOR UPDATE/);
  });

  it('ninguna RPC recibe organization_id como parámetro (se lee de la campaña real)', () => {
    expect(sql).not.toMatch(/approve_campaign\(p_campaign_id uuid, p_organization_id/);
    expect(sql).not.toMatch(/reject_campaign\([^)]*p_organization_id/);
  });

  it('ninguna RPC recibe actor_user_id como parámetro (siempre auth.uid())', () => {
    expect(sql).not.toMatch(/p_actor_user_id/);
    const approveBlock = extractFunction(sql, 'approve_campaign');
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(approveBlock).toMatch(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/);
    expect(rejectBlock).toMatch(/v_actor\s+uuid\s*:=\s*auth\.uid\(\)/);
  });

  it('approve_campaign actualiza campaigns e inserta campaign_approvals dentro del mismo bloque de función', () => {
    const approveBlock = extractFunction(sql, 'approve_campaign');
    expect(approveBlock).toMatch(/UPDATE public\.campaigns/);
    expect(approveBlock).toMatch(/INSERT INTO public\.campaign_approvals/);
    expect(approveBlock).toMatch(/status\s*=\s*'approved'/);
  });

  it('reject_campaign actualiza campaigns e inserta campaign_approvals dentro del mismo bloque de función', () => {
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(rejectBlock).toMatch(/UPDATE public\.campaigns/);
    expect(rejectBlock).toMatch(/INSERT INTO public\.campaign_approvals/);
    expect(rejectBlock).toMatch(/status\s*=\s*'rejected'/);
  });

  it('reject_campaign exige nota no vacía (trim) antes de insertar', () => {
    const rejectBlock = extractFunction(sql, 'reject_campaign');
    expect(rejectBlock).toMatch(/char_length\(trim\(p_note\)\)\s*=\s*0/);
    expect(rejectBlock).toMatch(/rejection note is required/);
  });

  it('las RPCs no tienen EXECUTE para PUBLIC ni anon (solo authenticated)', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.approve_campaign\(uuid\)\s+FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reject_campaign\(uuid, text\)\s+FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.approve_campaign\(uuid\)\s+FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.reject_campaign\(uuid, text\)\s+FROM anon/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.approve_campaign\(uuid\)\s+TO authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.reject_campaign\(uuid, text\)\s+TO authenticated/,
    );
  });

  it('campaign_approvals sigue append-only: retira INSERT directo y no agrega UPDATE/DELETE', () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS campaign_approvals_insert ON public\.campaign_approvals/);
    expect(sql).toMatch(/REVOKE INSERT ON public\.campaign_approvals FROM authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*UPDATE[^;]*ON public\.campaign_approvals/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.campaign_approvals/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_approvals_update/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_approvals_delete/);
  });

  it('es aditiva: no altera la estructura de las tablas creadas en 7B', () => {
    // Referenciar campaigns/campaign_approvals en las RPCs (SELECT/UPDATE de
    // filas, DROP POLICY, REVOKE/GRANT) es esperado; lo que este test
    // descarta es que la migración reabra su DEFINICIÓN (columnas/tipo).
    expect(sql).not.toMatch(/ALTER TABLE public\.campaigns/);
    expect(sql).not.toMatch(/ALTER TABLE public\.campaign_approvals/);
    expect(sql).not.toMatch(/ALTER TABLE public\.compliance_rules/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it('no contiene SQL dinámico (EXECUTE/format() para construir sentencias)', () => {
    expect(sql).not.toMatch(/EXECUTE\s+format\(/i);
    expect(sql).not.toMatch(/EXECUTE\s+'/i);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrae el cuerpo de una función `CREATE OR REPLACE FUNCTION public.<name>`
 * hasta su terminador `$$;` — suficiente para estos asserts de contenido sin
 * necesitar un parser SQL real.
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
