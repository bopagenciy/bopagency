/**
 * Etiquetas en español compartidas para Campaign Studio (Phase 7E).
 * Centralizadas aquí para que el wizard de creación y la página de detalle
 * muestren exactamente el mismo texto para cada objetivo/estado — evitar que
 * cada componente invente su propia copia (como sí ocurre, por convención
 * existente del proyecto, con las etiquetas de estado más simples en
 * CampaignStatusBadge/CampaignsFilters).
 */

import type { CampaignObjective } from '@bop-agency/domain';

export const OBJECTIVE_LABELS: Record<CampaignObjective, string> = {
  brand_awareness: 'Reconocimiento de marca',
  reach: 'Alcance',
  traffic: 'Tráfico',
  engagement: 'Interacción',
  lead_generation: 'Generación de leads',
  conversions: 'Conversiones',
  catalog_sales: 'Ventas de catálogo',
};
