#!/usr/bin/env ts-node
/**
 * Phase 4 Migration CLI
 *
 * Usage:
 *   npm run migrate:phase4 -- --dry-run --organization-id=<UUID>
 *   npm run migrate:phase4 -- --execute --organization-id=<UUID>
 *   npm run migrate:phase4 -- --rollback --run-id=<UUID> --execute
 *   npm run migrate:phase4 -- --list-runs --organization-id=<UUID>
 *
 * SECURITY:
 * - SUPABASE_SERVICE_ROLE_KEY must be set in environment — never in CLI args.
 * - --organization-id validates UUID format before any DB access.
 * - Dry-run is the default; --execute is explicit opt-in.
 * - NO secrets are printed, logged, or saved to output files.
 */

import * as path from 'path';
import { loadConfig } from './config';
import { Logger } from './logger';
import { MigrationRunner } from './runner';
import { verifyConnection } from './adapters/supabase';
import { ClientsImporter } from './importers/clients-importer';
import { DocumentsImporter } from './importers/documents-importer';
import { MetricsImporter } from './importers/metrics-importer';
import { AlertsImporter } from './importers/alerts-importer';
import { ReportsImporter } from './importers/reports-importer';
import { AgentsImporter } from './importers/agents-importer';
import { SkillsImporter } from './importers/skills-importer';
import { TemplatesImporter } from './importers/templates-importer';
import { AutomationsImporter } from './importers/automations-importer';
import { writeRunReport } from './adapters/report-writer';
import type { CliArgs, MigrationMode, RunSummary } from './types';

// ─── Arg parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);

  let mode: MigrationMode = 'dry_run';
  let organizationId: string | undefined;
  let actorUserId: string | undefined;
  const clients: string[] = [];
  let limit: number | null = null;
  let verbose = false;
  let resume = false;
  let rollback = false;
  let runId: string | null = null;
  let listRuns = false;
  let repositoryRoot: string | undefined;

  for (const arg of args) {
    if (arg === '--dry-run') {
      mode = 'dry_run';
      continue;
    }
    if (arg === '--execute') {
      mode = 'execute';
      continue;
    }
    if (arg === '--verbose' || arg === '-v') {
      verbose = true;
      continue;
    }
    if (arg === '--resume') {
      resume = true;
      continue;
    }
    if (arg === '--rollback') {
      rollback = true;
      continue;
    }
    if (arg === '--list-runs') {
      listRuns = true;
      continue;
    }

    const orgMatch = arg.match(/^--organization-id=(.+)$/);
    if (orgMatch) {
      organizationId = orgMatch[1];
      continue;
    }

    const actorMatch = arg.match(/^--actor-user-id=(.+)$/);
    if (actorMatch) {
      actorUserId = actorMatch[1];
      continue;
    }

    const clientMatch = arg.match(/^--client=(.+)$/);
    if (clientMatch) {
      clients.push(clientMatch[1] as string);
      continue;
    }

    const limitMatch = arg.match(/^--limit=(\d+)$/);
    if (limitMatch) {
      limit = parseInt(limitMatch[1] as string, 10);
      continue;
    }

    const runIdMatch = arg.match(/^--run-id=(.+)$/);
    if (runIdMatch) {
      runId = runIdMatch[1] as string;
      continue;
    }

    const repoRootMatch = arg.match(/^--repository-root=(.+)$/);
    if (repoRootMatch) {
      repositoryRoot = repoRootMatch[1];
      continue;
    }
  }

  return {
    mode,
    organizationId,
    actorUserId,
    clients,
    limit,
    verbose,
    resume,
    rollback,
    runId,
    listRuns,
    repositoryRoot,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const logger = new Logger(args.verbose);

  logger.info('[CLI] BopIAgency Phase 4 Migration', {
    mode: args.mode,
    clients: args.clients.length > 0 ? args.clients : 'all-approved',
  });

  // Load and validate config
  let config;
  try {
    config = loadConfig({
      mode: args.mode,
      organizationId: args.organizationId,
      actorUserId: args.actorUserId,
      verbose: args.verbose,
      clients: args.clients,
      limit: args.limit,
      repositoryRoot: args.repositoryRoot,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[CLI] Error de configuración', { message });
    process.exitCode = 1;
    return;
  }

  // Verify DB connection
  try {
    const org = await verifyConnection(config);
    logger.info('[CLI] Conexión verificada', { organizationName: org.organizationName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[CLI] Error de conexión', { message });
    process.exitCode = 1;
    return;
  }

  // Build importer list
  const importers = [
    new ClientsImporter(config.verbose),
    new DocumentsImporter(config.verbose),
    new MetricsImporter(config.verbose),
    new AlertsImporter(config.verbose),
    new ReportsImporter(config.verbose),
    new AgentsImporter(config.verbose),
    new SkillsImporter(config.verbose),
    new TemplatesImporter(config.verbose),
    new AutomationsImporter(config.verbose),
  ];

  // Run migration
  const { getSupabaseClient } = await import('./adapters/supabase');
  const client = getSupabaseClient(config);
  const runner = new MigrationRunner(config);

  let summary: RunSummary;
  try {
    summary = await runner.run(client, importers);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[CLI] Migración fallida', { message });
    process.exitCode = 1;
    return;
  }

  // Write output report (never logs secrets)
  const outputDir = path.join(config.projectRoot, 'migration-output');
  writeRunReport(outputDir, summary, config.repositoryRoot);

  // Print summary table
  logger.info('[CLI] === RESUMEN DE MIGRACIÓN ===');
  logger.info(`[CLI] Modo: ${summary.mode.toUpperCase()}`);
  logger.info(`[CLI] Run ID: ${summary.runId}`);
  for (const imp of summary.importers) {
    logger.info(
      `[CLI]   ${imp.entityType.padEnd(20)} total=${imp.total} insert=${imp.inserted} skip=${imp.skipped} err=${imp.errors} excl=${imp.excluded}`,
    );
  }
  logger.info(
    `[CLI] TOTALES: total=${summary.totals.total} insert=${summary.totals.inserted} skip=${summary.totals.skipped} err=${summary.totals.errors} excl=${summary.totals.excluded}`,
  );
  logger.info(`[CLI] Reporte guardado en: migration-output/`);

  if (summary.totals.errors > 0) {
    const modeSlug = summary.mode === 'dry_run' ? 'dry-run' : 'execute';
    logger.warn(
      `[CLI] ${summary.totals.errors} error(s) durante la migración. Revisar migration-output/phase-4-${modeSlug}-latest-errors.json`,
    );
    process.exitCode = 1;
    return;
  }

  process.exitCode = 0;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[CLI] Error fatal: ${message}\n`);
  process.exitCode = 1;
});
