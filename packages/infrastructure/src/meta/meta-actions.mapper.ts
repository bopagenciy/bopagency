/**
 * meta-actions.mapper.ts — Mapeo centralizado de acciones y valores de conversión de Meta Insights (Phase 9B.1 Endurecida).
 * Evita doble contabilización de tipos de acción superpuestos de Meta y garantiza que la cantidad de conversiones
 * y el valor de ingresos (revenue) se resuelvan de la misma familia de acciones.
 */

export type MetaActionItem = {
  action_type: string;
  value: string | number;
};

export const LEAD_ACTION_TYPES_PRIORITY = [
  'lead',
  'onsite_conversion.lead_grouped',
  'offsite_conversion.fb_pixel_lead',
] as const;

export const PURCHASE_ACTION_TYPES_PRIORITY = [
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
] as const;

export type ResolvedPurchaseMetrics = {
  actionType: string | null;
  conversions: number | null;
  revenue: string | null;
};

/**
 * Extrae de forma determinista la cantidad de clientes potenciales (leads) evitando la duplicidad de eventos.
 */
export function extractMetaLeads(actions?: readonly MetaActionItem[] | null): number | null {
  if (!actions || actions.length === 0) return null;

  for (const targetType of LEAD_ACTION_TYPES_PRIORITY) {
    const found = actions.find((item) => item.action_type === targetType);
    if (found && found.value !== undefined && found.value !== null) {
      const val = Number(found.value);
      if (!Number.isNaN(val) && val >= 0) {
        return Math.floor(val);
      }
    }
  }

  return null;
}

/**
 * Resuelve conjuntamente la cantidad de conversiones de compra y el valor de ingresos (revenue)
 * desde la MISMA familia de acciones priorizada para evitar discrepancias entre conteo y valor.
 */
export function resolveMetaPurchaseMetrics(
  actions?: readonly MetaActionItem[] | null,
  actionValues?: readonly MetaActionItem[] | null,
): ResolvedPurchaseMetrics {
  if (!actions || actions.length === 0) {
    return { actionType: null, conversions: null, revenue: null };
  }

  for (const targetType of PURCHASE_ACTION_TYPES_PRIORITY) {
    const actionFound = actions.find((item) => item.action_type === targetType);
    if (actionFound && actionFound.value !== undefined && actionFound.value !== null) {
      const convCount = Number(actionFound.value);
      if (!Number.isNaN(convCount) && convCount >= 0) {
        const conversions = Math.floor(convCount);

        // Buscar el valor de ingresos coincidente en actionValues de la MISMA familia
        let revenue: string | null = null;
        if (actionValues && actionValues.length > 0) {
          const valFound = actionValues.find((item) => item.action_type === targetType);
          if (valFound && valFound.value !== undefined && valFound.value !== null) {
            const valStr = String(valFound.value).trim();
            if (/^\d+(\.\d+)?$/.test(valStr)) {
              revenue = valStr;
            }
          }
        }

        return {
          actionType: targetType,
          conversions,
          revenue,
        };
      }
    }
  }

  return { actionType: null, conversions: null, revenue: null };
}
