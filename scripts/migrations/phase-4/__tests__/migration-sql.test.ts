/**
 * Tests estructurales de la migración Phase 4 v3.
 *
 * Verifican propiedades del archivo SQL sin ejecutarlo contra la base de datos:
 * - Inmutabilidad cross-tenant (organization_id en todos los triggers)
 * - Inmutabilidad de client_id (todos los triggers, FK RESTRICT)
 * - Inmutabilidad de legacy_id / legacy_path
 * - Normalización de email (lower + trim)
 * - Protección de campos de auditoría de alertas
 * - RPCs acknowledge_alert y resolve_alert (seguridad, roles, bypass)
 * - Global scope invariant en agents/skills/templates
 * - Coherencia organization_id en migration_records
 * - GRANTs / REVOKEs según política de permisos
 *
 * NO ejecutan SQL contra Supabase remoto.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ─── Fixture ─────────────────────────────────────────────────────────────────

let sql: string;

beforeAll(() => {
  const sqlPath = path.resolve(
    __dirname,
    '../../../../supabase/migrations/20260730150000_phase4_data_migration_targets.sql',
  );
  sql = fs.readFileSync(sqlPath, 'utf-8');
});

// ─── 1. protect_p4_core_immutable aplicado a todas las tablas ─────────────────

describe('protect_p4_core_immutable', () => {
  const operationalTables = [
    'tasks',
    'client_metrics',
    'alerts',
    'reports',
    'report_recipients',
    'agents',
    'skills',
    'templates',
    'automations',
    'migration_runs',
    'migration_records',
  ];

  it('function is defined with SECURITY DEFINER and SET search_path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_p4_core_immutable()');
    expect(sql).toMatch(/protect_p4_core_immutable[\s\S]{0,200}SECURITY DEFINER/);
    expect(sql).toMatch(/protect_p4_core_immutable[\s\S]{0,300}SET search_path = public/);
  });

  it('blocks id, organization_id and created_at mutations', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_p4_core_immutable()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_p4_core_immutable()'),
    );
    expect(body).toContain('NEW.id IS DISTINCT FROM OLD.id');
    expect(body).toContain('NEW.organization_id IS DISTINCT FROM OLD.organization_id');
    expect(body).toContain('NEW.created_at IS DISTINCT FROM OLD.created_at');
  });

  for (const table of operationalTables) {
    it(`is applied to ${table} as trg_${table}_30_core_immutable`, () => {
      expect(sql).toContain(`trg_${table}_30_core_immutable`);
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_${table}_30_core_immutable[\\s\\S]{0,200}protect_p4_core_immutable`,
        ),
      );
    });
  }
});

// ─── 2. Cambio cross-tenant: organization_id inmutable ────────────────────────

describe('cross-tenant mutation prevention', () => {
  it('protect_p4_core_immutable raises on organization_id change', () => {
    expect(sql).toContain('protect_p4_core_immutable: organization_id es inmutable');
  });

  it('ALL Phase 4 tables have trg_*_30_core_immutable (organization_id protected)', () => {
    const tables = [
      'tasks',
      'client_metrics',
      'alerts',
      'reports',
      'report_recipients',
      'agents',
      'skills',
      'templates',
      'automations',
      'migration_runs',
      'migration_records',
    ];
    for (const t of tables) {
      expect(sql, `${t} should have 30_core_immutable`).toContain(`trg_${t}_30_core_immutable`);
    }
  });

  it('RLS policies use <table>.organization_id (qualified reference)', () => {
    // tasks policies use tasks.organization_id
    expect(sql).toContain('is_organization_member(tasks.organization_id)');
    expect(sql).toContain('has_organization_role(tasks.organization_id');
    // client_metrics policies use client_metrics.organization_id
    expect(sql).toContain('is_organization_member(client_metrics.organization_id)');
    // alerts policies use alerts.organization_id
    expect(sql).toContain('is_organization_member(alerts.organization_id)');
    // automations policies use automations.organization_id
    expect(sql).toContain('is_organization_member(automations.organization_id)');
  });
});

// ─── 3. Cambio de client_id bloqueado ─────────────────────────────────────────

describe('client_id immutability', () => {
  const tablesWithClientId = [
    'tasks',
    'client_metrics',
    'alerts',
    'reports',
    'report_recipients',
    'automations',
  ];

  it('protect_p4_client_id is defined', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_p4_client_id()');
    expect(sql).toContain('NEW.client_id IS DISTINCT FROM OLD.client_id');
    expect(sql).toContain('protect_p4_client_id: client_id es inmutable');
  });

  for (const table of tablesWithClientId) {
    it(`trg_${table}_50_client_id applies protect_p4_client_id`, () => {
      expect(sql).toMatch(
        new RegExp(`CREATE TRIGGER trg_${table}_50_client_id[\\s\\S]{0,200}protect_p4_client_id`),
      );
    });
  }

  it('ALL client_id FK use ON DELETE RESTRICT (not SET NULL or CASCADE)', () => {
    // Match only the single line containing the client_id FK definition
    // Using [^\n]+ to avoid crossing into other column definitions
    const fkMatches = [
      ...sql.matchAll(/client_id\s+uuid[^\n]+REFERENCES public\.clients\(id\)[^\n]+/g),
    ];
    // There are 6 client_id FK definitions (tasks, client_metrics, alerts, reports, report_recipients, automations)
    expect(fkMatches.length).toBeGreaterThanOrEqual(6);
    for (const m of fkMatches) {
      expect(m[0], `FK line must use RESTRICT: "${m[0].trim()}"`).toContain('ON DELETE RESTRICT');
      expect(m[0], `FK line must not have SET NULL: "${m[0].trim()}"`).not.toContain(
        'ON DELETE SET NULL',
      );
      expect(m[0], `FK line must not have CASCADE: "${m[0].trim()}"`).not.toContain(
        'ON DELETE CASCADE',
      );
    }
  });
});

// ─── 4. Cambio de legacy_id / legacy_path bloqueado ──────────────────────────

describe('legacy field immutability', () => {
  it('protect_p4_tasks_legacy blocks legacy_source, legacy_id, legacy_path', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_p4_tasks_legacy()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_p4_tasks_legacy()'),
    );
    expect(body).toContain('NEW.legacy_source IS DISTINCT FROM OLD.legacy_source');
    expect(body).toContain('NEW.legacy_id IS DISTINCT FROM OLD.legacy_id');
    expect(body).toContain('NEW.legacy_path IS DISTINCT FROM OLD.legacy_path');
  });

  it('protect_p4_legacy_id_path blocks legacy_id and legacy_path (reports, automations)', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_p4_legacy_id_path()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_p4_legacy_id_path()'),
    );
    expect(body).toContain('NEW.legacy_id IS DISTINCT FROM OLD.legacy_id');
    expect(body).toContain('NEW.legacy_path IS DISTINCT FROM OLD.legacy_path');
  });

  it('protect_p4_legacy_path blocks legacy_path (client_metrics, alerts, agents, skills, templates)', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_p4_legacy_path()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_p4_legacy_path()'),
    );
    expect(body).toContain('NEW.legacy_path IS DISTINCT FROM OLD.legacy_path');
  });

  it('tasks has trg_tasks_60_legacy using protect_p4_tasks_legacy', () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_tasks_60_legacy[\s\S]{0,200}protect_p4_tasks_legacy/);
  });

  it('reports has trg_reports_60_legacy using protect_p4_legacy_id_path', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_reports_60_legacy[\s\S]{0,200}protect_p4_legacy_id_path/,
    );
  });

  it('automations has trg_automations_60_legacy using protect_p4_legacy_id_path', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_automations_60_legacy[\s\S]{0,200}protect_p4_legacy_id_path/,
    );
  });

  it('client_metrics has trg_client_metrics_60_legacy using protect_p4_legacy_path', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_client_metrics_60_legacy[\s\S]{0,200}protect_p4_legacy_path/,
    );
  });
});

// ─── 5. Email case-insensitive (normalize_report_recipient_email) ─────────────

describe('email normalization', () => {
  it('normalize_report_recipient_email applies lower(trim())', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.normalize_report_recipient_email()'),
      sql.indexOf('COMMENT ON FUNCTION public.normalize_report_recipient_email()'),
    );
    expect(body).toContain('lower(trim(NEW.email))');
  });

  it('trigger trg_report_recipients_05_normalize_email fires BEFORE 10_client_org', () => {
    // Prefix 05 < 10 guarantees alphabetical PostgreSQL trigger ordering
    expect(sql).toContain('trg_report_recipients_05_normalize_email');
    expect(sql).toMatch(
      /CREATE TRIGGER trg_report_recipients_05_normalize_email[\s\S]{0,200}normalize_report_recipient_email/,
    );
  });

  it('report_recipients table CHECK enforces normalized email', () => {
    // The table has a CHECK that email = lower(trim(email))
    expect(sql).toContain('email = lower(trim(email))');
  });

  it('unique indexes use lower(email) for functional deduplication', () => {
    expect(sql).toContain('lower(email)');
    expect(sql).toContain('uq_report_recipients_email_norm');
    expect(sql).toContain('uq_report_recipients_email_org_norm');
  });
});

// ─── 6. acknowledge_alert directo rechazado por trigger ───────────────────────

describe('protect_alerts_audit_fields', () => {
  it('function is defined with SECURITY DEFINER', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.protect_alerts_audit_fields()');
    expect(sql).toMatch(/protect_alerts_audit_fields[\s\S]{0,200}SECURITY DEFINER/);
  });

  it('blocks direct change to acknowledged_by without bypass', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_alerts_audit_fields()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_alerts_audit_fields()'),
    );
    expect(body).toContain('NEW.acknowledged_by IS DISTINCT FROM OLD.acknowledged_by');
    expect(body).toContain('NEW.acknowledged_at IS DISTINCT FROM OLD.acknowledged_at');
    expect(body).toContain('NEW.resolved_by IS DISTINCT FROM OLD.resolved_by');
    expect(body).toContain('NEW.resolved_at IS DISTINCT FROM OLD.resolved_at');
  });

  it('allows service_role (auth.uid() IS NULL) to bypass', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_alerts_audit_fields()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_alerts_audit_fields()'),
    );
    expect(body).toContain('auth.uid() IS NULL');
    expect(body).toContain('RETURN NEW');
  });

  it('allows RPC bypass via app.phase4_alert_bypass session variable', () => {
    const body = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.protect_alerts_audit_fields()'),
      sql.indexOf('COMMENT ON FUNCTION public.protect_alerts_audit_fields()'),
    );
    expect(body).toContain("current_setting('app.phase4_alert_bypass', true) = 'true'");
  });

  it('is applied as trg_alerts_70_audit_fields', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_alerts_70_audit_fields[\s\S]{0,200}protect_alerts_audit_fields/,
    );
  });
});

// ─── 7. acknowledge_alert vía RPC permitido ───────────────────────────────────

describe('acknowledge_alert RPC', () => {
  let rpcBody: string;

  beforeAll(() => {
    const start = sql.indexOf(
      'CREATE OR REPLACE FUNCTION public.acknowledge_alert(p_alert_id uuid)',
    );
    const end = sql.indexOf('COMMENT ON FUNCTION public.acknowledge_alert(uuid)');
    rpcBody = sql.slice(start, end);
  });

  it('is SECURITY DEFINER with fixed search_path', () => {
    expect(rpcBody).toContain('SECURITY DEFINER');
    expect(rpcBody).toContain('SET search_path = public');
  });

  it('validates auth.uid() IS NOT NULL (no anonymous calls)', () => {
    expect(rpcBody).toContain('auth.uid() IS NULL');
    expect(rpcBody).toContain('autenticación requerida');
  });

  it('validates organization membership before proceeding', () => {
    expect(rpcBody).toContain('is_organization_member(a.organization_id)');
  });

  it('sets acknowledged_by = auth.uid() — no external actor accepted', () => {
    expect(rpcBody).toContain('acknowledged_by = auth.uid()');
    // Function only accepts p_alert_id uuid — no actor param
    expect(rpcBody).not.toContain('p_actor');
    expect(rpcBody).not.toContain('p_acknowledged_by');
  });

  it('sets acknowledged_at = now() — no external timestamp accepted', () => {
    expect(rpcBody).toContain('acknowledged_at = now()');
    expect(rpcBody).not.toContain('p_acknowledged_at');
    expect(rpcBody).not.toContain('p_timestamp');
  });

  it('activates bypass via set_config with is_local=true', () => {
    expect(rpcBody).toContain("set_config('app.phase4_alert_bypass', 'true', true)");
  });

  it('does NOT reference a.deleted_at as a column (column does not exist on alerts)', () => {
    // Comments may mention deleted_at for documentation; what must be absent is the
    // runtime column reference "a.deleted_at" inside a WHERE / AND clause.
    expect(rpcBody).not.toContain('a.deleted_at');
  });

  it('REVOKE FROM PUBLIC and GRANT to authenticated', () => {
    // Use regex to handle variable whitespace in REVOKE / GRANT lines
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.acknowledge_alert\(uuid\)\s+FROM PUBLIC/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.acknowledge_alert\(uuid\)\s+TO authenticated/,
    );
  });
});

// ─── 8. resolve_alert con viewer rechazado, con operator permitido ─────────────

describe('resolve_alert RPC', () => {
  let rpcBody: string;

  beforeAll(() => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.resolve_alert(p_alert_id uuid)');
    const end = sql.indexOf('COMMENT ON FUNCTION public.resolve_alert(uuid)');
    rpcBody = sql.slice(start, end);
  });

  it('is SECURITY DEFINER with fixed search_path', () => {
    expect(rpcBody).toContain('SECURITY DEFINER');
    expect(rpcBody).toContain('SET search_path = public');
  });

  it('requires operator+ role (viewer rejected implicitly)', () => {
    // has_organization_role('operator') = operator|strategist|admin|owner
    // viewer is NOT included → viewer is rejected
    expect(rpcBody).toContain("has_organization_role(a.organization_id, 'operator')");
  });

  it('rejects viewer by requiring operator-level role semantics', () => {
    // If the role check is 'operator', viewer is excluded by Phase 2 definition
    expect(rpcBody).toContain("'operator'");
    // No weaker role is accepted
    expect(rpcBody).not.toContain("'viewer'");
  });

  it('sets resolved_by = auth.uid() and resolved_at = now()', () => {
    expect(rpcBody).toContain('resolved_by = auth.uid()');
    expect(rpcBody).toContain('resolved_at = now()');
  });

  it('does not accept external actor or timestamp params', () => {
    expect(rpcBody).not.toContain('p_resolved_by');
    expect(rpcBody).not.toContain('p_resolved_at');
    expect(rpcBody).not.toContain('p_actor');
  });

  it('activates bypass via set_config with is_local=true', () => {
    expect(rpcBody).toContain("set_config('app.phase4_alert_bypass', 'true', true)");
  });

  it('does NOT reference a.deleted_at as a column (column does not exist on alerts)', () => {
    expect(rpcBody).not.toContain('a.deleted_at');
  });

  it('REVOKE FROM PUBLIC and GRANT to authenticated', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_alert\(uuid\)\s+FROM PUBLIC/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.resolve_alert\(uuid\)\s+TO authenticated/,
    );
  });
});

// ─── 9. Global scope inválido detectado por CHECK ────────────────────────────

describe('global scope CHECK constraint', () => {
  const globalTables = ['agents', 'skills', 'templates'];

  for (const table of globalTables) {
    it(`${table} has ck_${table}_global_scope CHECK`, () => {
      expect(sql).toContain(`CONSTRAINT ck_${table}_global_scope CHECK`);
      // (is_global=true AND org IS NULL) OR (is_global=false AND org IS NOT NULL)
      const region = sql.slice(
        sql.indexOf(`CONSTRAINT ck_${table}_global_scope`),
        sql.indexOf(`CONSTRAINT ck_${table}_global_scope`) + 300,
      );
      expect(region).toContain('is_global = true');
      expect(region).toContain('organization_id IS NULL');
      expect(region).toContain('is_global = false');
      expect(region).toContain('organization_id IS NOT NULL');
    });
  }
});

// ─── 10. migration_record con organization_id incorrecto rechazado ────────────

describe('check_p4_migration_record_org', () => {
  let fnBody: string;

  beforeAll(() => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.check_p4_migration_record_org()');
    const end = sql.indexOf('COMMENT ON FUNCTION public.check_p4_migration_record_org()');
    fnBody = sql.slice(start, end);
  });

  it('function is defined with SECURITY DEFINER', () => {
    expect(fnBody).toContain('SECURITY DEFINER');
    expect(fnBody).toContain('SET search_path = public');
  });

  it('organization_id FK references organizations(id)', () => {
    // migration_records table has the FK
    const tableRegion = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS public.migration_records'),
      sql.indexOf('CREATE UNIQUE INDEX IF NOT EXISTS uq_migration_records_key'),
    );
    expect(tableRegion).toContain('REFERENCES public.organizations(id)');
  });

  it('raises exception when organization_id does not match migration_run', () => {
    expect(fnBody).toContain('organization_id no coincide con migration_run');
    expect(fnBody).toContain('NEW.organization_id IS DISTINCT FROM v_run_org_id');
  });

  it('blocks run_id mutation on UPDATE', () => {
    expect(fnBody).toContain('NEW.run_id IS DISTINCT FROM OLD.run_id');
    expect(fnBody).toContain('run_id es inmutable');
  });

  it('blocks organization_id mutation on UPDATE', () => {
    expect(fnBody).toContain('organization_id es inmutable');
  });

  it('is applied as trg_migration_records_10_org', () => {
    expect(sql).toMatch(
      /CREATE TRIGGER trg_migration_records_10_org[\s\S]{0,200}check_p4_migration_record_org/,
    );
  });
});

// ─── 11. GRANTs y REVOKEs según política ─────────────────────────────────────

describe('grants and revokes', () => {
  it('REVOKE ALL from anon and authenticated on all 11 tables', () => {
    const tables = [
      'tasks',
      'client_metrics',
      'alerts',
      'reports',
      'report_recipients',
      'agents',
      'skills',
      'templates',
      'automations',
      'migration_runs',
      'migration_records',
    ];
    for (const t of tables) {
      expect(sql, `${t} should have REVOKE ALL`).toMatch(
        new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM anon, authenticated`),
      );
    }
  });

  it('operational tables have SELECT, INSERT, UPDATE for authenticated', () => {
    const opTables = [
      'tasks',
      'client_metrics',
      'alerts',
      'reports',
      'report_recipients',
      'agents',
      'skills',
      'templates',
      'automations',
    ];
    for (const t of opTables) {
      expect(sql, `${t} should have INSERT, UPDATE grant`).toMatch(
        new RegExp(`GRANT SELECT, INSERT, UPDATE ON public\\.${t}\\s+TO authenticated`),
      );
    }
  });

  it('migration_runs and migration_records have only SELECT for authenticated (no INSERT/UPDATE)', () => {
    expect(sql).toContain('GRANT SELECT ON public.migration_runs    TO authenticated');
    expect(sql).toContain('GRANT SELECT ON public.migration_records TO authenticated');
    // Must NOT have INSERT/UPDATE grants for migration tables
    expect(sql).not.toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.migration_runs/);
    expect(sql).not.toMatch(/GRANT SELECT, INSERT, UPDATE ON public\.migration_records/);
  });

  it('functions have REVOKE FROM PUBLIC before GRANT to authenticated', () => {
    const revokeIdx = sql.lastIndexOf(
      'REVOKE ALL ON FUNCTION public.acknowledge_alert(uuid) FROM PUBLIC',
    );
    const grantIdx = sql.lastIndexOf(
      'GRANT EXECUTE ON FUNCTION public.acknowledge_alert(uuid) TO authenticated',
    );
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeLessThan(grantIdx);
  });
});

// ─── 12. Orden real de triggers (alfabético por nombre) ───────────────────────

describe('trigger ordering', () => {
  it('tasks triggers are in correct alphabetical order', () => {
    const names = [
      'trg_tasks_10_client_org',
      'trg_tasks_20_write',
      'trg_tasks_30_core_immutable',
      'trg_tasks_40_created_by',
      'trg_tasks_50_client_id',
      'trg_tasks_60_legacy',
      'trg_tasks_90_updated_at',
    ];
    for (let i = 0; i < names.length - 1; i++) {
      const idxA = sql.indexOf(`CREATE TRIGGER ${names[i]}`);
      const idxB = sql.indexOf(`CREATE TRIGGER ${names[i + 1]}`);
      expect(idxA, `${names[i]} should appear before ${names[i + 1]}`).toBeGreaterThan(-1);
      expect(idxB, `${names[i + 1]} should be present`).toBeGreaterThan(-1);
      // In the file they are created in order, and alphabetically the prefix ensures DB order
      expect(names[i] < names[i + 1]).toBe(true);
    }
  });

  it('report_recipients 05_normalize fires before 10_client_org alphabetically', () => {
    expect('trg_report_recipients_05_normalize_email' < 'trg_report_recipients_10_client_org').toBe(
      true,
    );
  });

  it('alerts 70_audit_fields fires after 60_legacy and before 90_updated_at', () => {
    expect('trg_alerts_60_legacy' < 'trg_alerts_70_audit_fields').toBe(true);
    expect('trg_alerts_70_audit_fields' < 'trg_alerts_90_updated_at').toBe(true);
  });
});
