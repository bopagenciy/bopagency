/**
 * DATOS PLACEHOLDER — Solo para visualización de la interfaz
 *
 * ⚠️ DEMO: Ningún dato aquí es real.
 * - Sin correos reales
 * - Sin nombres reales de clientes
 * - Sin account IDs reales
 * - Sin gastos reales
 *
 * Fase 4+: reemplazar con datos reales de Supabase
 */

export type DemoClient = {
  id: string;
  name: string;
  industry: string;
  status: 'active' | 'inactive' | 'onboarding';
  activeCampaigns: number;
  _demo: true;
};

export type DemoCampaign = {
  id: string;
  clientId: string;
  name: string;
  platform: 'meta' | 'google' | 'youtube';
  status: 'draft' | 'review' | 'approved' | 'paused';
  budget: number;
  currency: 'COP';
  _demo: true;
};

export type DemoAlert = {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  clientId: string;
  createdAt: string;
  _demo: true;
};

export type DemoAutomation = {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'error';
  lastRun: string;
  nextRun: string | null;
  _demo: true;
};

export type DemoMetric = {
  label: string;
  value: string;
  change: number;
  _demo: true;
};

// ─── Demo Clients ──────────────────────────────────────────────────────────

export const demoClients: DemoClient[] = [
  {
    id: 'demo-client-01',
    name: 'Cliente Demo Uno',
    industry: 'Hospitalidad',
    status: 'active',
    activeCampaigns: 3,
    _demo: true,
  },
  {
    id: 'demo-client-02',
    name: 'Cliente Demo Dos',
    industry: 'Servicios Legales',
    status: 'active',
    activeCampaigns: 2,
    _demo: true,
  },
  {
    id: 'demo-client-03',
    name: 'Cliente Demo Tres',
    industry: 'E-commerce',
    status: 'onboarding',
    activeCampaigns: 0,
    _demo: true,
  },
];

// ─── Demo Campaigns ────────────────────────────────────────────────────────

export const demoCampaigns: DemoCampaign[] = [
  {
    id: 'demo-camp-01',
    clientId: 'demo-client-01',
    name: 'Campaña de Ejemplo — Temporada Alta',
    platform: 'meta',
    status: 'draft',
    budget: 5000000,
    currency: 'COP',
    _demo: true,
  },
  {
    id: 'demo-camp-02',
    clientId: 'demo-client-01',
    name: 'Campaña de Ejemplo — Remarketing',
    platform: 'google',
    status: 'review',
    budget: 2000000,
    currency: 'COP',
    _demo: true,
  },
  {
    id: 'demo-camp-03',
    clientId: 'demo-client-02',
    name: 'Campaña de Ejemplo — Captación',
    platform: 'meta',
    status: 'approved',
    budget: 3000000,
    currency: 'COP',
    _demo: true,
  },
];

// ─── Demo Alerts ───────────────────────────────────────────────────────────

export const demoAlerts: DemoAlert[] = [
  {
    id: 'demo-alert-01',
    title: 'CTR por debajo del umbral mínimo',
    severity: 'warning',
    clientId: 'demo-client-01',
    createdAt: '2026-07-29T10:00:00Z',
    _demo: true,
  },
  {
    id: 'demo-alert-02',
    title: 'Presupuesto mensual al 80%',
    severity: 'info',
    clientId: 'demo-client-02',
    createdAt: '2026-07-28T15:30:00Z',
    _demo: true,
  },
];

// ─── Demo Automations ──────────────────────────────────────────────────────

export const demoAutomations: DemoAutomation[] = [
  {
    id: 'demo-auto-01',
    name: 'META — Sincronizar Métricas — Cliente Demo Uno',
    status: 'active',
    lastRun: '2026-07-29T00:00:00Z',
    nextRun: '2026-07-30T00:00:00Z',
    _demo: true,
  },
  {
    id: 'demo-auto-02',
    name: 'META — Sincronizar Métricas — Cliente Demo Dos',
    status: 'active',
    lastRun: '2026-07-29T00:05:00Z',
    nextRun: '2026-07-30T00:05:00Z',
    _demo: true,
  },
  {
    id: 'demo-auto-03',
    name: 'ALERTAS — Enviar Correos Críticos',
    status: 'paused',
    lastRun: '2026-07-28T09:00:00Z',
    nextRun: null,
    _demo: true,
  },
];

// ─── Demo Metrics ──────────────────────────────────────────────────────────

export const demoMetrics: DemoMetric[] = [
  { label: 'Clientes activos', value: '2', change: 0, _demo: true },
  { label: 'Campañas en borrador', value: '1', change: 0, _demo: true },
  { label: 'Alertas abiertas', value: '2', change: -1, _demo: true },
  { label: 'Automatizaciones activas', value: '2', change: 0, _demo: true },
];
