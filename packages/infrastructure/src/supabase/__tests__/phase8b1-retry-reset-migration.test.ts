/**
 * Guardas estaticas de contenido sobre la migracion forward de "retry
 * unlock" de Phase 8B.1
 * (20260828100000_phase8b1_publication_retry_reset.sql).
 *
 * Mismo criterio y mismas limitaciones que
 * phase8b1-hardening-migration.test.ts: no ejecuta la migracion contra una
 * base de datos real, es una guarda de regresion sobre el TEXTO de la
 * migracion. Verificacion en runtime real: Run 5 (Supabase local),
 * pendiente de autorizacion del usuario.
 *
 * Contexto (Run 4): create_publication_job(retry_of_job_id=...) ya
 * validaba correctamente la elegibilidad de retry, pero esa rama es
 * inalcanzable en la practica porque mark_publication_job_failed siempre
 * deja el target en 'failed', nunca 'ready'/'scheduled' -- el guard previo
 * de create_publication_job rechaza antes de llegar a esa validacion. Esta
 * migracion agrega `prepare_publication_retry` (rol strategist+) como
 * unica via autorizada para resetear el target de 'failed' a 'ready',
 * habilitando el camino real, SIN reabrir jamas el job historico.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../../supabase/migrations/20260828100000_phase8b1_publication_retry_reset.sql',
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

describe('Phase 8B.1 retry-reset migration - existencia y no-edicion de migraciones previas', () => {
  it('el archivo de migracion existe y no esta vacio', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('no reemplaza ninguna tabla (solo CREATE OR REPLACE FUNCTION + ALTER TABLE ... CONSTRAINT + GRANT/REVOKE)', () => {
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.is_publication_failure_retryable/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.create_publication_job/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.prepare_publication_retry/);
  });
});

describe('Phase 8B.1 retry-reset migration - helper compartido de elegibilidad', () => {
  it('is_publication_failure_retryable espeja PUBLICATION_RETRYABLE_FAILURE_CATEGORIES exactamente', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.is_publication_failure_retryable\(p_failure_category text\)[\s\S]*?\n\$\$;/,
    );
    const body = fnMatch[0];
    for (const cat of [
      'INTEGRATION_NOT_AVAILABLE',
      'RATE_LIMITED',
      'DISPATCH_FAILED',
      'PROVIDER_OUTAGE',
      'UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED',
    ]) {
      expect(body).toContain(cat);
    }
  });

  it('create_publication_job usa el helper compartido, no una lista inline duplicada', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.create_publication_job\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/public\.is_publication_failure_retryable\(v_prev_failure_cat\)/);
  });

  it('prepare_publication_retry usa el MISMO helper compartido', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.prepare_publication_retry\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/public\.is_publication_failure_retryable\(v_failure_cat\)/);
  });
});

describe('Phase 8B.1 retry-reset migration - prepare_publication_retry: guards de autorizacion y elegibilidad', () => {
  function retryFn(): string {
    return mustMatch(
      /CREATE OR REPLACE FUNCTION public\.prepare_publication_retry\([\s\S]*?\n\$\$;/,
    )[0];
  }

  it('exige autenticacion', () => {
    expect(retryFn()).toMatch(/authentication required/);
  });

  it('exige rol strategist\\+ (misma barra que reconcile_publication_job)', () => {
    expect(retryFn()).toMatch(/has_organization_role\(v_org_id, 'strategist'\)/);
  });

  it('exige que el job este failed (no succeeded/cancelled/queued/claimed/in_progress/unknown_outcome)', () => {
    const body = retryFn();
    expect(body).toMatch(/IF v_status <> 'failed' THEN/);
    expect(body).toMatch(/job % is not failed/);
  });

  it('exige que el target este actualmente failed antes de resetear (defensa contra doble-reset)', () => {
    const body = retryFn();
    expect(body).toMatch(/IF v_target_status <> 'failed' THEN/);
  });

  it('bloquea preparar un retry cuando el target ya tiene un job activo (duplicado bloqueado)', () => {
    const body = retryFn();
    expect(body).toMatch(/already has an active publication job/);
  });

  it('nunca muta el job historico -- solo hace UPDATE sobre campaign_activation_targets, nunca sobre campaign_publication_jobs', () => {
    const body = retryFn();
    expect(body).not.toMatch(/UPDATE public\.campaign_publication_jobs/);
    expect(body).toMatch(/UPDATE public\.campaign_activation_targets\s+SET status = 'ready'/);
  });

  it('limpia los campos de diagnostico del fallo anterior en el target (failed_at/failure_code/failure_message -> NULL)', () => {
    const body = retryFn();
    expect(body).toMatch(/failed_at = NULL/);
    expect(body).toMatch(/failure_code = NULL/);
    expect(body).toMatch(/failure_message = NULL/);
  });

  it('registra un evento retry_prepared sobre el job original (auditoria, no autoridad)', () => {
    const body = retryFn();
    expect(body).toMatch(/'retry_prepared'/);
  });

  it('la funcion mantiene SECURITY DEFINER y search_path fijo', () => {
    const body = retryFn();
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path = public/);
  });
});

describe('Phase 8B.1 retry-reset migration - event_type CHECK ampliado (aditivo)', () => {
  it('agrega retry_prepared preservando los 9 tipos existentes', () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT campaign_publication_events_event_type_check CHECK \(event_type IN \(/,
    );
    const constraintMatch = mustMatch(
      /ADD CONSTRAINT campaign_publication_events_event_type_check CHECK \(event_type IN \(([\s\S]*?)\)\);/,
    );
    const list = constraintMatch[1];
    for (const t of [
      'job_queued', 'job_claimed', 'job_started', 'job_succeeded',
      'job_failed', 'job_cancelled', 'job_marked_unknown_outcome',
      'job_reconciled', 'webhook_received', 'retry_prepared',
    ]) {
      expect(list).toContain(t);
    }
  });

  it('usa DROP CONSTRAINT IF EXISTS antes del ADD (no falla si el nombre difiere)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS campaign_publication_events_event_type_check/);
  });
});

describe('Phase 8B.1 retry-reset migration - GRANTS de prepare_publication_retry (capa "flujo de usuario normal")', () => {
  it('se otorga a authenticated', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.prepare_publication_retry\(uuid, text\)\s+TO authenticated/,
    );
  });

  it('NUNCA se otorga a service_role', () => {
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.prepare_publication_retry\(uuid, text\)\s+TO service_role/,
    );
  });

  it('se revoca de PUBLIC y anon antes de otorgar a authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.prepare_publication_retry\(uuid, text\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.prepare_publication_retry\(uuid, text\) FROM anon/);
  });
});
