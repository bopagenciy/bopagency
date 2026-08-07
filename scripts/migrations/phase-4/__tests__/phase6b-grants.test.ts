/**
 * Tests estructurales — grants de Phase 6B (automation runtime).
 *
 * Contexto: cierre de los pendientes técnicos de Phase 6 local staging.
 * Evidencia local: POST /api/webhooks/n8n devolvía HTTP 403 / SQLSTATE 42501
 * ("permission denied for table automation_webhook_events") porque service_role
 * solo tenía REFERENCES/TRIGGER/TRUNCATE sobre las tablas nuevas de Phase 6B —
 * sin SELECT/INSERT/UPDATE/DELETE explícitos. El comentario original de la
 * migración ("service_role hereda por defecto en Supabase — no necesita GRANT
 * explícito") era incorrecto para esta instancia.
 *
 * Estos tests son estáticos: no ejecutan la migración contra una base de datos
 * real (igual que scripts/migrations/phase-4/__tests__/migration-sql.test.ts).
 * Verifican que el archivo .sql contiene las sentencias GRANT/REVOKE/RLS
 * esperadas. Como la migración se re-ejecuta íntegra en cada `supabase db
 * reset`, que estas aserciones sigan pasando demuestra que los grants
 * sobreviven a la reconstrucción de la base de datos (no son un fix aplicado
 * a mano vía psql que se perdería en un reset).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

let sql: string;

beforeAll(() => {
  const sqlPath = path.resolve(
    __dirname,
    '../../../../supabase/migrations/20260804000000_phase6b_automation_runtime.sql',
  );
  sql = fs.readFileSync(sqlPath, 'utf-8');
});

// ─── automation_executions ─────────────────────────────────────────────────

describe('automation_executions grants', () => {
  it('revoca todo de anon y authenticated antes de otorgar', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.automation_executions\s+FROM anon, authenticated;/,
    );
  });

  it('authenticated conserva SELECT, INSERT, UPDATE (sin DELETE)', () => {
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.automation_executions TO authenticated;/,
    );
    expect(sql).not.toMatch(
      /GRANT [^;]*DELETE[^;]* ON public\.automation_executions TO authenticated/,
    );
  });

  it('service_role tiene explícitamente SELECT y UPDATE', () => {
    expect(sql).toMatch(
      /GRANT SELECT, UPDATE ON public\.automation_executions TO service_role;/,
    );
  });

  it('service_role NO recibe INSERT/DELETE (la creación de ejecuciones pasa por RLS/authenticated)', () => {
    const grantsToServiceRole = [...sql.matchAll(
      /GRANT\s+([A-Z, ]+)\s+ON public\.automation_executions TO service_role;/g,
    )].map((m) => m[1]);
    for (const privileges of grantsToServiceRole) {
      expect(privileges).not.toContain('INSERT');
      expect(privileges).not.toContain('DELETE');
    }
  });

  it('RLS está habilitado', () => {
    expect(sql).toContain('ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;');
  });
});

// ─── automation_execution_logs ─────────────────────────────────────────────

describe('automation_execution_logs grants', () => {
  it('revoca todo de anon y authenticated antes de otorgar', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.automation_execution_logs\s+FROM anon, authenticated;/,
    );
  });

  it('authenticated solo tiene SELECT (sin INSERT/UPDATE/DELETE) — logs son de solo lectura para la UI', () => {
    expect(sql).toMatch(
      /GRANT SELECT ON public\.automation_execution_logs TO authenticated;/,
    );
    const grantsToAuthenticated = [...sql.matchAll(
      /GRANT\s+([A-Z, ]+)\s+ON public\.automation_execution_logs TO authenticated;/g,
    )].map((m) => m[1]);
    for (const privileges of grantsToAuthenticated) {
      expect(privileges).not.toContain('INSERT');
      expect(privileges).not.toContain('UPDATE');
      expect(privileges).not.toContain('DELETE');
    }
  });

  it('service_role tiene explícitamente INSERT', () => {
    expect(sql).toMatch(
      /GRANT INSERT ON public\.automation_execution_logs TO service_role;/,
    );
  });

  it('service_role NO recibe UPDATE/DELETE (los logs son append-only)', () => {
    const grantsToServiceRole = [...sql.matchAll(
      /GRANT\s+([A-Z, ]+)\s+ON public\.automation_execution_logs TO service_role;/g,
    )].map((m) => m[1]);
    for (const privileges of grantsToServiceRole) {
      expect(privileges).not.toContain('UPDATE');
      expect(privileges).not.toContain('DELETE');
    }
  });

  it('RLS está habilitado y no existe política INSERT para authenticated', () => {
    expect(sql).toContain('ALTER TABLE public.automation_execution_logs ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY [a-z_]+ ON public\.automation_execution_logs\s+FOR INSERT/);
  });
});

// ─── automation_webhook_events ─────────────────────────────────────────────

describe('automation_webhook_events grants', () => {
  it('revoca todo de anon y authenticated', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.automation_webhook_events\s+FROM anon, authenticated;/,
    );
  });

  it('anon no tiene ningún GRANT operativo sobre esta tabla', () => {
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.automation_webhook_events TO[^;]*anon/,
    );
  });

  it('authenticated no tiene ningún GRANT operativo sobre esta tabla', () => {
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.automation_webhook_events TO[^;]*authenticated/,
    );
  });

  it('service_role tiene explícitamente SELECT, INSERT, UPDATE, DELETE', () => {
    expect(sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON public\.automation_webhook_events TO service_role;/,
    );
  });

  it('RLS está habilitado', () => {
    expect(sql).toContain('ALTER TABLE public.automation_webhook_events ENABLE ROW LEVEL SECURITY;');
  });

  it('NO existe ninguna policy para authenticated sobre esta tabla', () => {
    expect(sql).not.toMatch(
      /CREATE POLICY [a-z_]+ ON public\.automation_webhook_events/,
    );
  });
});

// ─── automation_secrets_metadata ───────────────────────────────────────────

describe('automation_secrets_metadata grants', () => {
  it('revoca todo de anon y authenticated antes de otorgar', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON public\.automation_secrets_metadata\s+FROM anon, authenticated;/,
    );
  });

  it('authenticated solo tiene SELECT (INSERT/UPDATE quedan detrás de RLS admin+)', () => {
    expect(sql).toMatch(
      /GRANT SELECT ON public\.automation_secrets_metadata TO authenticated;/,
    );
  });

  it('NO se otorga acceso a service_role todavía (sin consumidor en código — mínimo privilegio)', () => {
    expect(sql).not.toMatch(
      /GRANT[^;]*ON public\.automation_secrets_metadata TO[^;]*service_role/,
    );
  });

  it('RLS está habilitado', () => {
    expect(sql).toContain('ALTER TABLE public.automation_secrets_metadata ENABLE ROW LEVEL SECURITY;');
  });
});

// ─── Invariantes generales ─────────────────────────────────────────────────

describe('invariantes de grants Phase 6B', () => {
  const phase6bTables = [
    'automation_executions',
    'automation_execution_logs',
    'automation_webhook_events',
    'automation_secrets_metadata',
  ];

  it('ninguna tabla Phase 6B usa GRANT ALL', () => {
    for (const table of phase6bTables) {
      expect(sql).not.toMatch(new RegExp(`GRANT ALL ON public\\.${table}`));
    }
  });

  it('ninguna tabla Phase 6B otorga privilegios operativos a anon', () => {
    for (const table of phase6bTables) {
      expect(sql).not.toMatch(
        new RegExp(`GRANT [A-Z, ]+ ON public\\.${table} TO[^;]*\\banon\\b`),
      );
    }
  });

  it('las cuatro tablas Phase 6B tienen RLS habilitado explícitamente', () => {
    for (const table of phase6bTables) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
  });
});
