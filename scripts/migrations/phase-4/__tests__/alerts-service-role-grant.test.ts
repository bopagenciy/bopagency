/**
 * Tests estructurales — migración correctiva 20260807150000
 * (GRANT service_role sobre public.alerts).
 *
 * Contexto: segundo defecto encontrado en validación E2E post-fix del
 * recovery best-effort de alertas. El fix de `resolved_by` (uuid) era
 * necesario pero no suficiente: `public.alerts` (Phase 4,
 * 20260730150000_phase4_data_migration_targets.sql) nunca otorgó GRANT a
 * `service_role`, causando `42501 permission denied for table alerts` en
 * cualquier operación de `SupabaseAlertRepository` vía adminClient
 * (`upsertByAlertKey`, `resolveActiveByAlertKeyPrefixes`).
 *
 * Como Phase 4 ya está en `main` (no se edita in-place), la corrección es
 * una migración nueva y aditiva. Estos tests son estáticos, igual que
 * `migration-sql.test.ts` y `phase6b-grants.test.ts`: no ejecutan SQL contra
 * una base de datos real, verifican el contenido del archivo .sql.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

let correctiveSql: string;
let phase4Sql: string;

beforeAll(() => {
  const correctivePath = path.resolve(
    __dirname,
    '../../../../supabase/migrations/20260807150000_fix_alerts_service_role_grant.sql',
  );
  correctiveSql = fs.readFileSync(correctivePath, 'utf-8');

  const phase4Path = path.resolve(
    __dirname,
    '../../../../supabase/migrations/20260730150000_phase4_data_migration_targets.sql',
  );
  phase4Sql = fs.readFileSync(phase4Path, 'utf-8');
});

describe('migración correctiva 20260807150000 — grant service_role sobre alerts', () => {
  it('otorga explícitamente SELECT, INSERT, UPDATE a service_role', () => {
    expect(correctiveSql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.alerts TO service_role;/,
    );
  });

  it('NO otorga DELETE a service_role sobre alerts', () => {
    const grants = [...correctiveSql.matchAll(
      /GRANT\s+([A-Z, ]+)\s+ON public\.alerts TO service_role;/g,
    )].map((m) => m[1]);
    expect(grants.length).toBeGreaterThan(0);
    for (const privileges of grants) {
      expect(privileges).not.toContain('DELETE');
    }
  });

  it('NO usa GRANT ALL', () => {
    expect(correctiveSql).not.toMatch(/GRANT ALL ON public\.alerts/);
  });

  it('NO otorga nada nuevo a anon ni authenticated (migración de solo service_role)', () => {
    // Solo se valida la única sentencia GRANT ejecutable del archivo (no los
    // comentarios explicativos, que sí mencionan "TO authenticated" al citar
    // el estado previo de la migración Phase 4 como contexto).
    const executableGrants = correctiveSql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');
    expect(executableGrants).not.toMatch(/GRANT[^;]*TO\s+anon\b/);
    expect(executableGrants).not.toMatch(/GRANT[^;]*TO\s+authenticated\b/);
  });

  it('no modifica filas, RLS, triggers ni constraints (es un GRANT puro)', () => {
    expect(correctiveSql).not.toMatch(/\bALTER TABLE\b/);
    expect(correctiveSql).not.toMatch(/\bUPDATE public\.alerts SET\b/);
    expect(correctiveSql).not.toMatch(/\bCREATE TRIGGER\b/);
    expect(correctiveSql).not.toMatch(/\bCREATE POLICY\b/);
    expect(correctiveSql).not.toMatch(/\bDROP TABLE\b/);
  });
});

describe('confirmación del defecto original en la migración Phase 4', () => {
  it('Phase 4 revoca todo de anon/authenticated y solo otorga a authenticated (sin service_role)', () => {
    expect(phase4Sql).toMatch(
      /REVOKE ALL ON public\.alerts\s+FROM anon, authenticated;/,
    );
    expect(phase4Sql).toMatch(
      /GRANT SELECT, INSERT, UPDATE ON public\.alerts\s+TO authenticated;/,
    );
  });

  it('Phase 4 NO contiene ningún GRANT a service_role sobre alerts (por eso hace falta la migración correctiva)', () => {
    expect(phase4Sql).not.toMatch(
      /GRANT[^;]*ON public\.alerts TO[^;]*service_role/,
    );
  });
});
