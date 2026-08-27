/**
 * Guardas estaticas de contenido sobre la migracion de hardening forward de
 * Phase 8B.1 (20260827090000_phase8b1_publication_domain_hardening.sql).
 *
 * Mismo criterio y mismas limitaciones que
 * phase8b1-migration-security.test.ts: no ejecuta la migracion contra una
 * base de datos real, es una guarda de regresion sobre el TEXTO de la
 * migracion. Verificacion en runtime real: Runtime Run 3 (Supabase local),
 * pendiente de autorizacion del usuario.
 *
 * Esta migracion corrige DOS defectos reales confirmados por ejecucion en
 * runtime contra la migracion original (20260825120000), sin editarla:
 *  1) campaign_publication_attempts append-only demasiado estricto (el
 *     trigger rechazaba incluso el UPDATE de cierre legitimo hecho por las
 *     RPCs de completado).
 *  2) mark_webhook_event_processed no era idempotente frente a reintentos
 *     (duplicaba el evento de auditoria webhook_received en cada llamada).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../../supabase/migrations/20260827090000_phase8b1_publication_domain_hardening.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf-8');
});

function mustMatch(re: RegExp): RegExpMatchArray {
  const m = sql.match(re);
  expect(m).not.toBeNull();
  return m as RegExpMatchArray;
}

describe('Phase 8B.1 hardening migration - existencia y no-edicion de la migracion original', () => {
  it('el archivo de migracion existe y no esta vacio', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('no reemplaza la migracion original ya aplicada (no CREATE TABLE, solo CREATE OR REPLACE FUNCTION)', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed/);
  });
});

describe('Phase 8B.1 hardening migration - attempts: append-only relajado SOLO para el cierre legitimo', () => {
  it('DELETE sigue rechazado incondicionalmente', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation\(\)[\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION/);
  });

  it('re-cerrar un attempt ya cerrado (OLD.completed_at IS NOT NULL) sigue rechazado', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation\(\)[\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/IF OLD\.completed_at IS NOT NULL THEN\s+RAISE EXCEPTION/);
  });

  it('un UPDATE que NO cierra el attempt (NEW.completed_at IS NULL) sigue rechazado', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation\(\)[\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/IF NEW\.completed_at IS NULL THEN\s+RAISE EXCEPTION/);
  });

  it('la unica transicion permitida es el cierre exacto (no hay ningun RETURN NEW incondicional temprano)', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation\(\)[\s\S]*?\n\$\$;/,
    );
    const body = fnMatch[0];
    const lastDeleteCheck = body.indexOf("IF TG_OP = 'DELETE'");
    const oldClosedCheck = body.indexOf('OLD.completed_at IS NOT NULL');
    const newOpenCheck = body.indexOf('NEW.completed_at IS NULL');
    const returnNew = body.indexOf('RETURN NEW;');
    expect(lastDeleteCheck).toBeGreaterThan(-1);
    expect(oldClosedCheck).toBeGreaterThan(lastDeleteCheck);
    expect(newOpenCheck).toBeGreaterThan(oldClosedCheck);
    expect(returnNew).toBeGreaterThan(newOpenCheck);
  });

  it('la funcion mantiene SECURITY DEFINER y search_path fijo', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reject_publication_attempt_mutation\(\)[\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/SECURITY DEFINER/);
    expect(fnMatch[0]).toMatch(/SET search_path = public/);
  });
});

describe('Phase 8B.1 hardening migration - mark_webhook_event_processed idempotente', () => {
  it('lee el status ACTUAL antes de mutar (FOR UPDATE) y es NO-OP si ya es terminal', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed\([\s\S]*?\n\$\$;/,
    );
    const body = fnMatch[0];
    expect(body).toMatch(/SELECT status INTO v_current_status[\s\S]*?FOR UPDATE;/);
    expect(body).toMatch(/IF v_current_status IN \('processed', 'failed'\) THEN\s+RETURN;\s+END IF;/);
  });

  it('el guard de idempotencia ocurre ANTES del UPDATE y del INSERT del evento de auditoria', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed\([\s\S]*?\n\$\$;/,
    );
    const body = fnMatch[0];
    const guardIdx = body.indexOf("IF v_current_status IN ('processed', 'failed')");
    const updateIdx = body.indexOf('UPDATE public.campaign_publication_webhook_events');
    const insertIdx = body.indexOf('INSERT INTO public.campaign_publication_events');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(guardIdx);
    expect(insertIdx).toBeGreaterThan(updateIdx);
  });

  it('sigue validando p_status IN (processed, failed) antes de cualquier otra cosa', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/status must be processed or failed/);
  });

  it('sigue rechazando un webhook_event_id inexistente (NOT FOUND)', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/webhook event not found/);
  });

  it('la funcion mantiene SECURITY DEFINER y search_path fijo', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_webhook_event_processed\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/SECURITY DEFINER/);
    expect(fnMatch[0]).toMatch(/SET search_path = public/);
  });
});

describe('Phase 8B.1 hardening migration - no toca GRANT/REVOKE ya aplicados', () => {
  it('no contiene ninguna sentencia GRANT/REVOKE real (solo se mencionan en comentarios explicativos -- los privilegios de funcion ya otorgados por 20260825120000 se preservan)', () => {
    expect(sql).not.toMatch(/^GRANT\b/m);
    expect(sql).not.toMatch(/^REVOKE\b/m);
  });
});
