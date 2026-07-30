# INITIAL ARCHITECTURE PROPOSAL
## BopIAgency — Propuesta de Arquitectura para la Nueva Aplicación
**Fecha:** 2026-07-29  
**Stack objetivo:** Next.js App Router · React · TypeScript estricto · Supabase · Inngest · Claude API · Tailwind CSS · Zod

---

## 1. VISIÓN GENERAL

La nueva aplicación es una **web app multi-empresa, multi-cliente** que actúa como sistema operativo digital de Bop Agency. Centraliza la gestión de clientes, la ejecución de agentes AI, el monitoreo de campañas, la generación de reportes y la automatización de procesos — todo en una interfaz responsive y mantenible.

```
┌─────────────────────────────────────────────────────────────┐
│  USUARIOS (Agencia + Clientes con acceso limitado)          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  NEXT.JS APP (Vercel / Railway)                             │
│                                                             │
│  ┌─────────────────────┐  ┌──────────────────────────────┐  │
│  │  App Router (RSC)   │  │  API Routes / Route Handlers │  │
│  │  - Server Components│  │  - /api/webhooks/inngest     │  │
│  │  - Client Components│  │  - /api/meta/callback        │  │
│  │  - Server Actions   │  │  - /api/...                  │  │
│  └─────────────────────┘  └──────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  lib/ (Business Logic — framework-agnostic)             ││
│  │  - agents/    skills/    templates/    schemas/         ││
│  │  - reports/   metrics/   alerts/       ai/              ││
│  └─────────────────────────────────────────────────────────┘│
└──────┬────────────────┬────────────────┬────────────────────┘
       │                │                │
       ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────────────────┐
│  SUPABASE    │ │  INNGEST     │ │  EXTERNAL APIs            │
│  - PostgreSQL│ │  - Workflows │ │  - Meta Graph API v25.0   │
│  - Auth      │ │  - Crons     │ │  - Claude API             │
│  - Storage   │ │  - Events    │ │  - Resend (email)         │
│  - Realtime  │ │  - Retries   │ │  - Google Ads API         │
│  - RLS       │ └──────────────┘ └───────────────────────────┘
└──────────────┘
```

---

## 2. ESTRUCTURA DE DIRECTORIOS PROPUESTA

```
bop-agency-app/          (nuevo repositorio — o reemplaza agency-dashboard/)
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Sidebar + autenticación requerida
│   │   ├── page.tsx            # Dashboard / Resumen
│   │   ├── clients/
│   │   │   ├── page.tsx        # Lista de clientes
│   │   │   ├── new/page.tsx    # Crear nuevo cliente
│   │   │   └── [id]/
│   │   │       ├── page.tsx    # Detalle del cliente
│   │   │       ├── metrics/page.tsx
│   │   │       ├── tasks/page.tsx
│   │   │       ├── campaigns/page.tsx
│   │   │       ├── reports/page.tsx
│   │   │       └── settings/page.tsx
│   │   ├── metrics/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── reports/page.tsx
│   │   ├── automations/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── ai/
│   │   │   ├── page.tsx        # Hub de agentes y skills
│   │   │   ├── agents/[id]/page.tsx
│   │   │   └── runs/page.tsx   # Historial de ejecuciones AI
│   │   └── settings/
│   │       ├── page.tsx
│   │       ├── organization/page.tsx
│   │       └── integrations/page.tsx
│   ├── api/
│   │   ├── webhooks/
│   │   │   ├── inngest/route.ts
│   │   │   └── meta/route.ts
│   │   └── [...]/route.ts      # Endpoints públicos si necesario
│   └── layout.tsx              # Root layout con providers
│
├── components/
│   ├── ui/                     # shadcn/ui components
│   ├── dashboard/              # Componentes específicos del dashboard
│   ├── clients/
│   ├── metrics/
│   ├── alerts/
│   ├── reports/
│   ├── automations/
│   └── ai/
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Supabase browser client
│   │   ├── server.ts           # Supabase server client
│   │   └── middleware.ts
│   ├── ai/
│   │   ├── claude.ts           # Claude API client wrapper
│   │   ├── agents.ts           # Sistema de agentes
│   │   ├── skills.ts           # Sistema de skills
│   │   └── context.ts          # Gestión de contexto de cliente
│   ├── inngest/
│   │   ├── client.ts           # Inngest client
│   │   └── functions/
│   │       ├── syncMetaMetrics.ts
│   │       ├── sendAlertEmails.ts
│   │       ├── generateReports.ts
│   │       └── sendReportEmails.ts
│   ├── metrics/
│   │   ├── normalize.ts        # Normalización de métricas por plataforma
│   │   └── aggregate.ts        # Agregación de métricas multi-fuente
│   ├── alerts/
│   │   ├── rules.ts            # Reglas de generación de alertas
│   │   └── email.ts            # Templates de email de alertas
│   ├── reports/
│   │   ├── generate.ts         # Generación de reportes
│   │   └── email.ts            # Envío de reportes por email
│   ├── schemas/
│   │   ├── clients.ts          # Zod schemas de clientes
│   │   ├── metrics.ts          # (migrado de metricsSchemas.ts)
│   │   ├── automations.ts      # (migrado de automationSchemas.ts)
│   │   ├── reports.ts          # (migrado de reportSchemas.ts)
│   │   ├── tasks.ts
│   │   └── alerts.ts
│   ├── integrations/
│   │   ├── meta.ts             # Meta Graph API SDK wrapper
│   │   └── google-ads.ts       # Google Ads API SDK wrapper (futuro)
│   └── utils/
│       ├── formatters.ts       # (migrado de formatters.ts)
│       └── dates.ts
│
├── actions/                    # Server Actions (Next.js)
│   ├── clients.ts
│   ├── tasks.ts
│   ├── alerts.ts
│   ├── reports.ts
│   └── ai.ts
│
├── middleware.ts               # Auth + multi-tenant routing
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json               # strict: true + paths
├── package.json
└── .env.local.example
```

---

## 3. SCHEMA DE BASE DE DATOS — SUPABASE (PostgreSQL)

```sql
-- =============================================
-- MULTI-TENANCY
-- =============================================

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  plan        text NOT NULL DEFAULT 'starter',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- =============================================
-- AUTENTICACIÓN Y ROLES
-- =============================================

CREATE TABLE user_profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid REFERENCES organizations(id),
  full_name   text,
  role        text NOT NULL DEFAULT 'member',  -- 'owner' | 'admin' | 'member' | 'viewer'
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- CLIENTES
-- =============================================

CREATE TABLE clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  slug        text NOT NULL,  -- ej: 'legalink-col'
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft',  -- 'draft' | 'active' | 'inactive' | 'archived'
  industry    text,
  language    text DEFAULT 'es',
  timezone    text DEFAULT 'America/Bogota',
  schema_version text DEFAULT '1.0.0',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(org_id, slug)
);

CREATE TABLE client_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  key         text NOT NULL,  -- 'brandProfile' | 'services' | 'buyerPersonas' | ...
  content     text,           -- Markdown content
  last_modified_at timestamptz DEFAULT now(),
  UNIQUE(client_id, key)
);

CREATE TABLE client_integrations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform    text NOT NULL,  -- 'meta_ads' | 'google_ads' | 'ga4' | ...
  enabled     boolean DEFAULT false,
  config      jsonb,          -- { accountId, propertyId, etc. }
  credentials jsonb,          -- { accessToken, refreshToken, ... } — cifrado en Supabase Vault
  last_synced_at timestamptz,
  UNIQUE(client_id, platform)
);

-- =============================================
-- TAREAS
-- =============================================

CREATE TABLE tasks (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text DEFAULT '',
  status              text NOT NULL DEFAULT 'pending',
  priority            text NOT NULL DEFAULT 'medium',
  owner_agent         text,
  source              text DEFAULT 'manual',
  reason              text,
  expected_impact     text,
  requires_approval   boolean DEFAULT false,
  acceptance_criteria text[],
  dependencies        uuid[],  -- referencias a otras tasks
  tags                text[],
  due_date            date,
  approved_at         timestamptz,
  completed_at        timestamptz,
  blocked_reason      text,
  rejection_reason    text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE TABLE task_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  user_id     uuid REFERENCES auth.users(id),
  action      text NOT NULL,  -- 'approve' | 'reject' | 'complete' | ...
  from_status text,
  to_status   text,
  reason      text,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- MÉTRICAS
-- =============================================

CREATE TABLE client_metrics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  period      text NOT NULL,  -- 'YYYY-MM'
  platform    text NOT NULL,  -- 'meta_ads' | 'google_ads' | ...
  currency    text DEFAULT 'COP',
  data        jsonb NOT NULL,  -- MonthlyMetrics completo
  data_quality text DEFAULT 'empty',
  generated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, period, platform)
);

CREATE TABLE campaigns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id),
  metric_id   uuid REFERENCES client_metrics(id),
  platform    text NOT NULL,
  external_id text,
  name        text NOT NULL,
  status      text,
  date_start  date,
  date_stop   date,
  metrics     jsonb,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- ALERTAS
-- =============================================

CREATE TABLE alerts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           uuid NOT NULL REFERENCES clients(id),
  type                text NOT NULL,
  severity            text NOT NULL,  -- 'critical' | 'warning' | 'info'
  title               text NOT NULL,
  message             text,
  status              text DEFAULT 'open',  -- 'open' | 'reviewed' | 'snoozed' | 'resolved'
  source              text,
  account_id          text,
  account_name        text,
  metadata            jsonb,
  detected_at         timestamptz DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES auth.users(id),
  resolved_at         timestamptz,
  resolved_by         uuid REFERENCES auth.users(id),
  snoozed_until       timestamptz,
  note                text,
  notification_status text DEFAULT 'pending',
  notification_sent_at timestamptz
);

-- =============================================
-- REPORTES
-- =============================================

CREATE TABLE reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id),
  report_type text NOT NULL,  -- 'monthly' | 'weekly'
  period      text NOT NULL,  -- 'YYYY-MM' | 'YYYY-WNN'
  currency    text DEFAULT 'COP',
  data        jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE(client_id, report_type, period)
);

CREATE TABLE report_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL UNIQUE REFERENCES clients(id),
  enabled     boolean DEFAULT true,
  to_emails   text[],
  cc_emails   text[],
  bcc_emails  text[],
  send_monthly boolean DEFAULT true,
  send_weekly  boolean DEFAULT false,
  language    text DEFAULT 'es',
  subject_prefix text DEFAULT 'Informe de resultados'
);

CREATE TABLE report_deliveries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES reports(id),
  client_id   uuid NOT NULL REFERENCES clients(id),
  status      text DEFAULT 'pending',
  attempts    integer DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at     timestamptz,
  provider_message_id text,
  error       text,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- SISTEMA AI
-- =============================================

CREATE TABLE agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id),
  slug        text UNIQUE NOT NULL,  -- 'meta-ads-specialist'
  name        text NOT NULL,
  description text,
  system_prompt text NOT NULL,  -- Contenido del archivo .md del agente
  category    text,
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE skills (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  prompt      text NOT NULL,
  category    text,
  is_executable boolean DEFAULT false,  -- true para 'new-client', 'add-task'
  is_active   boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid REFERENCES organizations(id),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  content     text NOT NULL,  -- Markdown template
  category    text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE ai_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid REFERENCES clients(id),
  user_id     uuid REFERENCES auth.users(id),
  agent_id    uuid REFERENCES agents(id),
  skill_id    uuid REFERENCES skills(id),
  input       text,
  output      text,
  model       text DEFAULT 'claude-opus-5',
  tokens_used integer,
  duration_ms integer,
  status      text DEFAULT 'completed',
  error       text,
  created_at  timestamptz DEFAULT now()
);

-- =============================================
-- AUTOMATIZACIONES
-- =============================================

CREATE TABLE automations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  category    text,
  provider    text DEFAULT 'inngest',
  client_id   uuid REFERENCES clients(id),
  status      text DEFAULT 'active',
  schedule_type text,
  schedule_cron text,
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error  text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE execution_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES automations(id),
  status      text NOT NULL,  -- 'success' | 'failed'
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  duration_ms integer,
  error       text,
  metadata    jsonb,
  created_at  timestamptz DEFAULT now()
);
```

---

## 4. AUTENTICACIÓN Y ROLES

```typescript
// Roles del sistema
type UserRole = 'owner' | 'admin' | 'member' | 'viewer';

// middleware.ts
export async function middleware(request: NextRequest) {
  const { data: { user } } = await supabase.auth.getUser();
  
  // Redirigir a login si no está autenticado
  if (!user && !isPublicRoute(request.pathname)) {
    return NextResponse.redirect('/login');
  }
  
  // Multi-tenant: resolver organización del usuario
  const orgId = await getUserOrgId(user.id);
  // Inyectar en headers para Server Components
  request.headers.set('x-org-id', orgId);
}
```

**Row Level Security (RLS) — principio general:**
```sql
-- Cada tabla con datos sensibles tiene RLS activado
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_org_isolation" ON clients
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
```

---

## 5. SISTEMA DE AGENTES AI (Claude API)

```typescript
// lib/ai/agents.ts
export async function runAgent(params: {
  agentSlug: string;
  clientId: string;
  userMessage: string;
  additionalContext?: string;
}) {
  // 1. Cargar el agente desde Supabase
  const agent = await getAgent(params.agentSlug);
  
  // 2. Cargar el contexto del cliente (brand profile, compliance rules, etc.)
  const clientContext = await buildClientContext(params.clientId);
  
  // 3. Construir el system prompt con contexto del cliente
  const systemPrompt = `
    ${agent.system_prompt}
    
    ## CLIENTE ACTIVO
    ${clientContext}
    
    ## REGLAS GLOBALES
    ${GLOBAL_CLAUDE_RULES}
  `;
  
  // 4. Llamar a Claude API
  const response = await anthropic.messages.create({
    model: 'claude-opus-5',
    max_tokens: 8096,
    system: systemPrompt,
    messages: [{ role: 'user', content: params.userMessage }]
  });
  
  // 5. Guardar en historial
  await logAIRun({ agentId: agent.id, clientId: params.clientId, ... });
  
  return response;
}
```

---

## 6. FUNCIONES INNGEST

### Estructura de eventos
```typescript
// Eventos del sistema
type AgencyEvent =
  | { name: 'agency/client.created';      data: { clientId: string } }
  | { name: 'agency/metrics.sync-requested'; data: { clientId?: string; platform: string } }
  | { name: 'agency/alert.created';       data: { alertId: string; severity: string } }
  | { name: 'agency/report.generated';    data: { reportId: string; clientId: string } }
  | { name: 'agency/clients.scan-requested'; data: {} };
```

### Patrones de funciones
```typescript
// inngest/functions/syncMetaMetrics.ts
export const syncMetaMetrics = inngest.createFunction(
  {
    id: 'sync-meta-metrics',
    retries: 3,
    concurrency: { limit: 5 }
  },
  [
    { cron: '0 6 * * *' },                              // Diario 06:00
    { event: 'agency/metrics.sync-requested' }          // Manual desde UI
  ],
  async ({ event, step }) => { ... }
);
```

---

## 7. VARIABLES DE ENTORNO (.env.local.example)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Claude API
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-opus-5

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=signkey-prod-...

# Meta Graph API
META_APP_ID=...
META_APP_SECRET=...

# Email (Resend)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@bopagencia.com

# App
NEXT_PUBLIC_APP_URL=https://app.bopagencia.com
```

---

## 8. PRINCIPIOS DE ARQUITECTURA LIMPIA (SOLID)

| Principio | Implementación |
|-----------|---------------|
| **S** — Single Responsibility | Cada Server Action hace una sola cosa. Cada Inngest function tiene un propósito. |
| **O** — Open/Closed | Los agentes y skills se extienden agregando registros en Supabase, sin cambiar código. |
| **L** — Liskov Substitution | Las integraciones de plataformas (Meta, Google) implementan la misma interfaz `MetricsPlatform`. |
| **I** — Interface Segregation | Los schemas Zod son específicos por dominio — no un schema monolítico. |
| **D** — Dependency Inversion | Los Server Actions dependen de interfaces (`MetricsRepository`, no `SupabaseClient` directamente). |

---

## 9. DECISIONES TÉCNICAS PENDIENTES

| Decisión | Opciones | Recomendación |
|---------|---------|---------------|
| Proveedor de email | Resend vs. Nodemailer vs. SendGrid | **Resend** — mejor DX, nativo con Next.js |
| Proveedor de componentes UI | shadcn/ui vs. Radix vs. Mantine | **shadcn/ui** — ya especificado en el objetivo |
| Gráficas | Recharts (heredado) vs. Chart.js vs. Tremor | **Recharts** — ya usado, conocido |
| Autenticación | Supabase Auth vs. Auth.js | **Supabase Auth** — integración nativa con RLS |
| Multi-tenancy nivel | Organization > User vs. User solo | **Organization > User** — necesario para equipo de agencia |
| Despliegue | Vercel vs. Railway | **Vercel** — mejor integración con Next.js, Inngest tiene integración oficial |
| Storage de archivos | Supabase Storage vs. S3 vs. Vercel Blob | **Supabase Storage** — menor complejidad, integrado |
| Claude API modelo | claude-opus-5 vs. claude-sonnet-5 | **claude-sonnet-5** para operaciones rutinarias, **claude-opus-5** para tareas complejas |

---

## 10. MÉTRICAS DE ÉXITO DE LA MIGRACIÓN

| Métrica | Baseline actual | Objetivo |
|---------|----------------|---------|
| Tiempo de carga de dashboard | N/A (local) | < 2s (LCP) |
| Cobertura de tests | 0% | > 70% |
| Endpoints documentados | 50+ sin doc | 100% documentados con tipos TS |
| Clientes soportados | 5 | 50+ (multi-empresa) |
| Usuarios concurrentes | 1 (local) | 20+ |
| Tiempo de sincronización de métricas | Diario (n8n) | Diario (Inngest, confiable) |
| Tiempo de recuperación ante fallos | Manual | Automático (Inngest retries) |

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
