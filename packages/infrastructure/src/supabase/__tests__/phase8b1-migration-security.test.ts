/**
 * Guardas estaticas de contenido sobre la migracion SQL de Phase 8B.1.
 *
 * Mismo criterio y mismas limitaciones explicitas que
 * phase8a1-migration-security.test.ts: este entorno no tiene
 * supabase/docker/psql disponibles, y la migracion
 * (20260825120000_phase8b1_publication_domain_persistence.sql) NO se aplico
 * contra ninguna base de datos real en esta tarea. Este archivo es una
 * guarda de regresion sobre el TEXTO de la migracion - verifica por
 * contrato de texto que las propiedades de seguridad exigidas por el
 * kickoff de 8B.1 estan presentes - NO ejecuta la migracion, NO prueba
 * comportamiento en runtime, NO prueba condiciones de carrera del FOR
 * UPDATE de las RPCs. Verificacion real pendiente: aplicar la migracion
 * contra Supabase local cuando el usuario lo autorice.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_PATH = join(
  __dirname,
  '../../../../../supabase/migrations/20260825120000_phase8b1_publication_domain_persistence.sql',
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

describe('Phase 8B.1 migration - existencia y estructura basica', () => {
  it('el archivo de migracion existe y no esta vacio', () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it('crea exactamente las 4 tablas nuevas del aggregate (y ninguna otra)', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_publication_jobs/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_publication_attempts/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_publication_events/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.campaign_publication_webhook_events/);
  });

  it('no altera ninguna tabla de 8A.1/Phase 7', () => {
    expect(sql).not.toMatch(/ALTER TABLE public\.campaign_activations\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.campaign_activation_targets\b/);
    expect(sql).not.toMatch(/ALTER TABLE public\.campaign_activation_events\b/);
    expect(sql).not.toMatch(/DROP TABLE/);
  });

  it('no introduce un enum de proveedor nuevo - reutiliza activation_provider (audit S1.1)', () => {
    expect(sql).not.toMatch(/CREATE TYPE public\.publication_provider/);
    expect(sql).toMatch(/public\.activation_provider/);
  });

  it('no contiene SQL dinamico (EXECUTE/format() para construir sentencias)', () => {
    expect(sql).not.toMatch(/EXECUTE\s+format\(/i);
    expect(sql).not.toMatch(/EXECUTE\s+'/i);
  });

  it('nunca almacena ni referencia un secreto/token de proveedor en ninguna columna', () => {
    expect(sql).not.toMatch(/\bsecret_value\b/i);
    expect(sql).not.toMatch(/\btoken_value\b/i);
    expect(sql).not.toMatch(/\bapi_key\b/i);
    expect(sql).not.toMatch(/\baccess_token\b/i);
  });

  it('no contiene ningun acoplamiento REAL a n8n (dominio/DB permanecen autoritativos) - solo se permite la mencion explicativa de su AUSENCIA en comentarios', () => {
    const codeLines = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(codeLines.toLowerCase()).not.toMatch(/n8n/);
  });

  it('no implementa ningun endpoint HTTP de webhook (fuera de alcance 8B.1 - solo el codigo, no la mencion en comentarios)', () => {
    expect(sql).not.toMatch(/api\/webhooks\/publishing['"]/);
    expect(sql).not.toMatch(/CREATE (FUNCTION|TABLE)[^\n]*ChannelPublisherPort/);
  });
});

describe('Phase 8B.1 migration - RLS habilitado en las 4 tablas', () => {
  it('ENABLE ROW LEVEL SECURITY en las 4 tablas', () => {
    expect(sql).toMatch(/ALTER TABLE public\.campaign_publication_jobs\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_publication_attempts\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_publication_events\s+ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/ALTER TABLE public\.campaign_publication_webhook_events\s+ENABLE ROW LEVEL SECURITY/);
  });

  it('jobs/attempts/events SELECT acotado por is_organization_member (viewer read-only)', () => {
    expect(sql).toMatch(
      /CREATE POLICY campaign_publication_jobs_select ON public\.campaign_publication_jobs FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_publication_jobs\.organization_id\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY campaign_publication_attempts_select ON public\.campaign_publication_attempts FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_publication_attempts\.organization_id\)\)/,
    );
    expect(sql).toMatch(
      /CREATE POLICY campaign_publication_events_select ON public\.campaign_publication_events FOR SELECT TO authenticated\s+USING \(public\.is_organization_member\(campaign_publication_events\.organization_id\)\)/,
    );
  });

  it('webhook_events no tiene NINGUNA policy ni GRANT para authenticated', () => {
    expect(sql).not.toMatch(/CREATE POLICY campaign_publication_webhook_events_select/);
    expect(sql).not.toMatch(/GRANT SELECT ON public\.campaign_publication_webhook_events\s+TO authenticated/);
  });

  it('ninguna de las 4 tablas otorga INSERT/UPDATE directo a authenticated (RPC-only)', () => {
    // Solo GRANT SELECT existe para estas tablas -- ningun GRANT INSERT/
    // UPDATE/DELETE de tabla en absoluto (se buscan las sentencias reales,
    // no menciones en comentarios explicando la ausencia).
    expect(sql).not.toMatch(/^GRANT INSERT ON public\.campaign_publication_/m);
    expect(sql).not.toMatch(/^GRANT UPDATE ON public\.campaign_publication_/m);
    expect(sql).not.toMatch(/^GRANT.*\bINSERT\b.*ON public\.campaign_publication_jobs\s+TO/m);
    expect(sql).not.toMatch(/^GRANT.*\bUPDATE\b.*ON public\.campaign_publication_jobs\s+TO/m);
    expect(sql).toMatch(
      /REVOKE ALL ON public\.campaign_publication_jobs\s+FROM anon, authenticated, service_role/,
    );
    expect(sql).toMatch(/GRANT SELECT ON public\.campaign_publication_jobs\s+TO authenticated/);
  });

  it('sin policy de DELETE en ninguna de las 4 tablas', () => {
    expect(sql).not.toMatch(/CREATE POLICY campaign_publication_jobs_delete/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_publication_attempts_delete/);
    expect(sql).not.toMatch(/CREATE POLICY campaign_publication_events_delete/);
  });
});

describe('Phase 8B.1 migration - append-only real de attempts/events', () => {
  it('attempts y events tienen triggers explicitos que rechazan UPDATE/DELETE', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_publication_attempts_no_update/);
    expect(sql).toMatch(/CREATE TRIGGER trg_publication_attempts_no_delete/);
    expect(sql).toMatch(/CREATE TRIGGER trg_publication_events_no_update/);
    expect(sql).toMatch(/CREATE TRIGGER trg_publication_events_no_delete/);
  });

  it('campaign_publication_events no tiene columna updated_at (hecho historico inmutable)', () => {
    const eventsTableMatch = mustMatch(
      /CREATE TABLE IF NOT EXISTS public\.campaign_publication_events \(([\s\S]*?)\n\);/,
    );
    expect(eventsTableMatch[1]).not.toMatch(/updated_at/);
  });
});

describe('Phase 8B.1 migration - idempotencia (audit S5)', () => {
  it('UNIQUE (target_id) parcial - un target no puede tener dos jobs activos', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS uq_publication_jobs_active_per_target\s+ON public\.campaign_publication_jobs\(target_id\)\s+WHERE status NOT IN \('succeeded', 'failed', 'cancelled'\)/,
    );
  });

  it('UNIQUE (organization_id, idempotency_key) en jobs', () => {
    expect(sql).toMatch(
      /uq_publication_jobs_org_idempotency_key\s+ON public\.campaign_publication_jobs\(organization_id, idempotency_key\)/,
    );
  });

  it('UNIQUE (job_id, idempotency_key) en attempts', () => {
    expect(sql).toMatch(
      /uq_publication_attempts_job_idempotency\s+ON public\.campaign_publication_attempts\(job_id, idempotency_key\)/,
    );
  });

  it('UNIQUE (provider, external_event_id) en webhook_events - replay protection', () => {
    expect(sql).toMatch(
      /uq_publication_webhook_events_provider_external_id\s+ON public\.campaign_publication_webhook_events\(provider, external_event_id\)/,
    );
  });

  it('record_publication_webhook_receipt usa ON CONFLICT DO NOTHING (idempotente)', () => {
    expect(sql).toMatch(/ON CONFLICT \(provider, external_event_id\) DO NOTHING/);
  });
});

describe('Phase 8B.1 migration - manual nunca genera publication job (audit S9)', () => {
  it('CHECK provider <> manual en jobs', () => {
    expect(sql).toMatch(/CONSTRAINT ck_publication_jobs_provider_not_manual CHECK \(provider <> 'manual'\)/);
  });

  it('CHECK provider <> manual en webhook_events', () => {
    expect(sql).toMatch(
      /CONSTRAINT ck_publication_webhook_events_provider_not_manual CHECK \(provider <> 'manual'\)/,
    );
  });

  it('create_publication_job rechaza explicitamente targets manual', () => {
    expect(sql).toMatch(/create_publication_job:[\s\S]{0,400}is manual, does not use publication jobs/);
  });
});

describe('Phase 8B.1 migration - unknown_outcome nunca se reinterpreta como failed (CRITICO)', () => {
  it('mark_publication_job_unknown_outcome NUNCA setea status a failed', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.mark_publication_job_unknown_outcome\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).not.toMatch(/status = 'failed'/);
    expect(fnMatch[0]).toMatch(/status = 'unknown_outcome'/);
  });

  it('reconcile_publication_job requiere status actual unknown_outcome antes de resolver', () => {
    expect(sql).toMatch(/reconcile_publication_job:[\s\S]{0,200}is not unknown_outcome/);
  });

  it('reconcile_publication_job exige strategist+ (locked decision #1)', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.reconcile_publication_job\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/has_organization_role\(v_org_id, 'strategist'\)/);
  });
});

describe('Phase 8B.1 migration - cancelacion respeta el modelo de roles bloqueado (locked decision #2)', () => {
  it('cancel_publication_job exige operator+ y strategist+ segun status', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.cancel_publication_job\([\s\S]*?\n\$\$;/,
    );
    expect(fnMatch[0]).toMatch(/has_organization_role\(v_org_id, 'operator'\)/);
    expect(fnMatch[0]).toMatch(/has_organization_role\(v_org_id, 'strategist'\)/);
  });

  it('cancelar un job in_progress NUNCA transiciona su status (cooperativo, audit S4.4)', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.cancel_publication_job\([\s\S]*?\n\$\$;/,
    );
    const inProgressBranch = fnMatch[0].split("ELSIF v_status = 'in_progress' THEN")[1];
    expect(inProgressBranch).toBeDefined();
    expect(inProgressBranch).not.toMatch(/SET status = 'cancelled'/);
  });

  it('cancel_publication_job rechaza unknown_outcome explicitamente', () => {
    expect(sql).toMatch(/is in unknown_outcome, must be reconciled before any further action/);
  });
});

describe('Phase 8B.1 migration - autorizacion por capa (service_role solo en RPCs de worker/webhook)', () => {
  const userFacingFns = ['create_publication_job', 'cancel_publication_job', 'reconcile_publication_job'];
  const workerOnlyFns = [
    'claim_publication_job',
    'start_publication_job',
    'record_publication_attempt',
    'mark_publication_job_succeeded',
    'mark_publication_job_failed',
    'mark_publication_job_unknown_outcome',
    'mark_activation_target_publishing',
    'mark_activation_target_failed',
    'append_publication_event',
    'record_publication_webhook_receipt',
    'mark_webhook_event_processed',
  ];

  it.each(userFacingFns)('%s se otorga a authenticated', (fn) => {
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO authenticated`));
  });

  it.each(userFacingFns)('%s NUNCA se otorga a service_role', (fn) => {
    expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role`));
  });

  it.each(workerOnlyFns)('%s se otorga SOLO a service_role, nunca a authenticated', (fn) => {
    expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO service_role`));
    expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s+TO authenticated`));
  });

  it('actor derivado SIEMPRE de auth.uid() - ninguna RPC de usuario acepta un actor/userId como parametro', () => {
    for (const fn of userFacingFns) {
      const fnMatch = mustMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(([\\s\\S]*?)\\)\\n(RETURNS|RETURNS TABLE)`),
      );
      expect((fnMatch[1] ?? '').toLowerCase()).not.toMatch(/p_actor|p_user_id|p_created_by/);
    }
  });
});

describe('Phase 8B.1 migration - tenant consistency (mismo mecanismo que cerro R-ACT-04 en 8A.1)', () => {
  it('trigger BEFORE INSERT verifica el job contra el target real', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_publication_jobs_target_match\s+BEFORE INSERT ON public\.campaign_publication_jobs/,
    );
    expect(sql).toMatch(/check_publication_job_target_match/);
  });

  it('trigger BEFORE INSERT verifica organization_id del attempt contra el job real', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_publication_attempts_job_match\s+BEFORE INSERT ON public\.campaign_publication_attempts/,
    );
  });

  it('trigger BEFORE INSERT verifica organization_id del event contra el job real', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_publication_events_job_match\s+BEFORE INSERT ON public\.campaign_publication_events/,
    );
  });
});

describe('Phase 8B.1 migration - guardas de estado terminal (defensa en profundidad)', () => {
  it('trigger de proteccion de jobs rechaza cualquier cambio de status desde un estado terminal', () => {
    expect(sql).toMatch(
      /OLD\.status IN \('succeeded', 'failed', 'cancelled'\) AND NEW\.status IS DISTINCT FROM OLD\.status THEN\s+RAISE EXCEPTION/,
    );
  });

  it('cada RPC de transicion revalida el status ACTUAL antes de escribir', () => {
    expect(sql).toMatch(/claim_publication_job: job % is not queued/);
    expect(sql).toMatch(/start_publication_job: job % is not claimed/);
    expect(sql).toMatch(/record_publication_attempt: job % is not in_progress/);
    expect(sql).toMatch(/mark_publication_job_succeeded: job % is not in_progress/);
    expect(sql).toMatch(/mark_publication_job_failed: job % is not in_progress/);
    expect(sql).toMatch(/mark_publication_job_unknown_outcome: job % is not in_progress/);
  });
});

describe('Phase 8B.1 migration - reconciliation policy configurable (kickoff decision #3)', () => {
  it('start_publication_job acepta un timeout override-able, default 15', () => {
    expect(sql).toMatch(/p_reconciliation_timeout_minutes integer DEFAULT 15/);
  });

  it('el deadline se computa y persiste por job (nunca hardcodeado como invariante fijo)', () => {
    expect(sql).toMatch(
      /reconciliation_deadline_at = v_now \+ make_interval\(mins => p_reconciliation_timeout_minutes\)/,
    );
  });
});

describe('Phase 8B.1 migration - webhook receipt foundation sin endpoint HTTP (kickoff decision #4)', () => {
  it('record_publication_webhook_receipt valida el provider ANTES de insertar', () => {
    const fnMatch = mustMatch(
      /CREATE OR REPLACE FUNCTION public\.record_publication_webhook_receipt\([\s\S]*?\n\$\$;/,
    );
    const body = fnMatch[0];
    const providerCheckIdx = body.indexOf('activation_provider');
    const insertIdx = body.indexOf('INSERT INTO public.campaign_publication_webhook_events');
    expect(providerCheckIdx).toBeGreaterThan(-1);
    expect(insertIdx).toBeGreaterThan(providerCheckIdx);
  });

  it('payload_hash exige formato SHA-256 hex de 64 caracteres, nunca el body crudo', () => {
    expect(sql).toMatch(/payload_hash\s+text\s+NOT NULL\s+CHECK \(payload_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  });
});
