/**
 * SupabaseComplianceRuleRepository
 *
 * Implementación de ComplianceRuleRepository respaldada por Supabase —
 * Phase 7C. Usa el cliente del usuario con RLS activo — nunca service_role
 * en esta capa.
 *
 * ESTRATEGIA DE QUERY (documentada a propósito):
 * El filtro real que se necesita es "organization_id IS NULL (global) OR
 * organization_id = :org" combinado con "client_id IS NULL (org/global) OR
 * client_id = :client" — un AND de dos ORs independientes. PostgREST soporta
 * `.or()` con `and()` anidado para expresar esto en una sola query, pero el
 * propio historial de este repo (ver comentario extenso en
 * SupabaseAlertRepository.resolveActiveByAlertKeyPrefixes) documenta 2
 * defectos reales al combinar la gramática `or=(...)` de PostgREST con
 * operaciones no triviales. Para un SELECT simple el riesgo es menor, pero
 * se opta deliberadamente por el enfoque más simple y verificable: un único
 * `.or()` de UNA sola columna (`organization_id`, sin anidar `and()`) para
 * acotar la consulta a "global o de esta organización" — reduciendo el
 * volumen de filas al mínimo relevante sin arriesgarse a la gramática
 * anidada — y el resto de la lógica de scope (client_id/platform/
 * jurisdiction) se aplica en TypeScript sobre ese conjunto ya acotado. Esto
 * NUNCA puede filtrar de más hacia otra organización (la query en BD ya lo
 * impide), solo puede traer de más reglas de OTROS CLIENTES de la MISMA
 * organización, que se descartan aquí antes de retornar — sin fuga de datos
 * fuera de la organización del actor.
 *
 * SEMÁNTICA de platform/jurisdiction en el filtro:
 * - Si el caller LOS especifica (evaluando una campaña concreta), se
 *   devuelven las reglas globales-de-ese-eje (platform/jurisdiction NULL en
 *   la regla) MÁS las que coinciden exactamente — nunca las de otro valor.
 * - Si el caller NO los especifica (listado general, sin campaña concreta),
 *   no se filtra por ese eje en absoluto — se devuelven todas las reglas
 *   aplicables por organización/cliente, sin importar su platform/
 *   jurisdiction.
 */

import { ok, err } from '@bop-agency/shared';
import type { Result } from '@bop-agency/shared';
import type { ComplianceRule, ComplianceRuleFilter, ComplianceRuleRepository } from '@bop-agency/domain';
import { resolveComplianceRulePrecedence } from '@bop-agency/domain';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rowToComplianceRule, type ComplianceRuleRow } from '../mappers/compliance-rule.mapper';

export class SupabaseComplianceRuleRepository implements ComplianceRuleRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findApplicableRules(filter: ComplianceRuleFilter): Promise<Result<ComplianceRule[]>> {
    const orgId = String(filter.organizationId);

    const { data, error } = await this.supabase
      .from('compliance_rules')
      .select('*')
      .or(`organization_id.is.null,organization_id.eq.${orgId}`)
      .eq('active', true);

    if (error) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al buscar reglas de compliance aplicables',
        details: error.message,
      });
    }

    let rules: ComplianceRule[];
    try {
      rules = (data ?? []).map((row) => rowToComplianceRule(row as unknown as ComplianceRuleRow));
    } catch (mappingError) {
      return err({
        code: 'INTERNAL_ERROR' as const,
        message: 'Error al procesar las reglas de compliance',
        details: mappingError,
      });
    }

    // Scope de cliente: global, org-level (client_id NULL), o del cliente
    // solicitado — nunca reglas de OTROS clientes de la misma organización.
    const clientId = filter.clientId;
    const scoped = rules.filter((rule) => rule.clientId === null || rule.clientId === clientId);

    // Plataforma: si el caller no especifica una, no se filtra por este eje.
    const platform = filter.platform;
    const byPlatform =
      platform === undefined
        ? scoped
        : scoped.filter((rule) => rule.platform === null || rule.platform === platform);

    // Jurisdicción: si el caller no especifica una, no se filtra por este eje.
    const jurisdiction = filter.jurisdiction;
    const byJurisdiction =
      jurisdiction === undefined
        ? byPlatform
        : byPlatform.filter((rule) => rule.jurisdiction === null || rule.jurisdiction === jurisdiction);

    return ok(resolveComplianceRulePrecedence(byJurisdiction));
  }
}
