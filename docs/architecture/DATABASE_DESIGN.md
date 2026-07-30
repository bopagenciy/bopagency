# DATABASE DESIGN
## BopIAgency — Diseño Conceptual y Lógico de Base de Datos
**Fecha:** 2026-07-29  
**Estado:** Propuesta — pendiente de revisión antes de implementación  
**Motor:** PostgreSQL 15 vía Supabase  
**Nota:** Este documento es conceptual/lógico. **No contiene SQL ejecutable.**

---

## 1. PRINCIPIOS DE DISEÑO

| Principio | Implementación |
|-----------|---------------|
| Multi-tenancy | `org_id` en todas las tablas operacionales |
| Aislamiento de datos | Row Level Security (RLS) en todas las tablas |
| Soft delete | Columna `deleted_at` en todas las entidades principales |
| Auditoría | Tabla `audit_log` centralizada + `updated_at` automático |
| Idempotencia | Claves únicas compuestas en operaciones repetibles |
| Secrets cifrados | Supabase Vault para tokens de plataformas externas |
| UUIDs | `gen_random_uuid()` como PK en todas las tablas |
| Versioning | `version` integer en entidades que evolucionen (agentes, skills) |
| Timestamps | `created_at` y `updated_at` en todas las tablas, con triggers |

---

## 2. CORRECCIONES AL ESQUEMA PRELIMINAR

Las siguientes correcciones se aplican respecto al esquema propuesto en `docs/audit/INITIAL_ARCHITECTURE_PROPOSAL.md`:

| # | Problema en propuesta inicial | Corrección aplicada |
|---|------------------------------|---------------------|
| C-01 | Tokens OAuth en columna JSONB sin cifrar en `client_integrations` | Los tokens van a Supabase Vault; `client_integrations` almacena solo el `vault_secret_id` |
| C-02 | `users` modelados como 1:1 con `organizations` | Un usuario puede pertenecer a múltiples organizaciones vía tabla puente `user_org_memberships` |
| C-03 | UUIDs arrays para dependencias en workflows | Las dependencias se modelan como tabla relacional `workflow_step_dependencies` |
| C-04 | Slugs declarados como `UNIQUE` globales | Los slugs son únicos **dentro de la organización**: `UNIQUE(org_id, slug)` |
| C-05 | `client.contacts` como JSONB array de objetos | Tabla separada `client_contacts` con FK a `clients` |
| C-06 | Métricas como JSONB plano | JSONB estructurado con schema Zod validado al escribir; columnas de índice para queries frecuentes |
| C-07 | `tasks.dependencies` como UUID array | Tabla relacional `task_dependencies (task_id, depends_on_task_id)` |
| C-08 | Rol de usuario como campo en `users` | El rol vive en `user_org_memberships.role` — distinto por organización |
| C-09 | `ai_runs.messages` como JSONB sin límite | Limitar almacenamiento: guardar resumen + referencia a Storage para conversaciones largas |
| C-10 | Sin tabla de `report_recipients` | Tabla separada para configurar destinatarios de reportes por cliente |
| C-11 | `automations` mezclando config y estado | Separar en `automations` (config) + `automation_executions` (historial de ejecuciones) |
| C-12 | Sin tabla de `compliance_rules` | Tabla separada para reglas de compliance por industria, referenciadas en validación de campañas |

---

## 3. DIAGRAMA ER CONCEPTUAL

```
┌──────────────────┐         ┌──────────────────────┐
│  organizations   │◄────────│  user_org_memberships │
│──────────────────│  1:N    │──────────────────────│
│  id (PK)         │         │  user_id (FK)         │
│  name            │         │  org_id (FK)          │
│  slug            │         │  role                 │
│  settings (JSONB)│         │  joined_at            │
│  plan            │         └──────────────────────┘
└──────┬───────────┘                    ▲
       │ 1:N                            │ N:1
       ▼                        ┌───────┴────────┐
┌──────────────────┐            │     users      │
│     clients      │            │────────────────│
│──────────────────│            │  id (PK)       │
│  id (PK)         │            │  email         │
│  org_id (FK)     │            │  full_name     │
│  slug (per org)  │            │  avatar_url    │
│  name            │            └────────────────┘
│  industry        │
│  status          │
│  deleted_at      │
└──────┬───────────┘
       │
       │ 1:N (vía client_id)
       ├──────────────────────────────────────────────────┐
       ▼                                                  ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  client_documents│    │  client_contacts  │    │client_integrations│
│──────────────────│    │──────────────────│    │──────────────────│
│  id (PK)         │    │  id (PK)         │    │  id (PK)         │
│  client_id (FK)  │    │  client_id (FK)  │    │  client_id (FK)  │
│  key             │    │  name            │    │  platform        │
│  content (text)  │    │  role            │    │  enabled         │
│  version         │    │  email           │    │  account_id      │
│  created_by (FK) │    │  phone           │    │  vault_secret_id │
│  updated_at      │    │  is_primary      │    │  last_synced_at  │
└──────────────────┘    └──────────────────┘    └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│     campaigns    │    │    client_metrics │    │      tasks       │
│──────────────────│    │──────────────────│    │──────────────────│
│  id (PK)         │    │  id (PK)         │    │  id (PK)         │
│  client_id (FK)  │    │  client_id (FK)  │    │  client_id (FK)  │
│  org_id (FK)     │    │  org_id (FK)     │    │  org_id (FK)     │
│  title           │    │  platform        │    │  title           │
│  platform        │    │  period          │    │  status          │
│  status          │    │  data (JSONB)    │    │  priority        │
│  type            │    │  synced_at       │    │  assigned_to (FK)│
│  brief (JSONB)   │    │  source          │    │  due_date        │
│  content (JSONB) │    └──────────────────┘    │  deleted_at      │
│  approved_by(FK) │                            └──────────────────┘
│  approved_at     │
│  deleted_at      │
└──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│      alerts      │    │     reports      │    │  report_deliveries│
│──────────────────│    │──────────────────│    │──────────────────│
│  id (PK)         │    │  id (PK)         │    │  id (PK)         │
│  client_id (FK)  │    │  client_id (FK)  │    │  report_id (FK)  │
│  org_id (FK)     │    │  org_id (FK)     │    │  recipient_id(FK)│
│  type            │    │  type            │    │  status          │
│  severity        │    │  period          │    │  attempted_at    │
│  status          │    │  data (JSONB)    │    │  sent_at         │
│  alert_id_hash   │    │  generated_at    │    │  error           │
│  resolved_at     │    │  file_url        │    └──────────────────┘
│  notified_at     │    └──────────────────┘
└──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│      agents      │    │      skills      │    │    templates     │
│──────────────────│    │──────────────────│    │──────────────────│
│  id (PK)         │    │  id (PK)         │    │  id (PK)         │
│  org_id (FK)     │    │  org_id (FK)     │    │  org_id (FK)     │
│  slug            │    │  slug            │    │  slug            │
│  name            │    │  name            │    │  name            │
│  system_prompt   │    │  type            │    │  category        │
│  version         │    │  prompt          │    │  content (text)  │
│  is_global       │    │  version         │    │  version         │
│  category        │    │  is_global       │    │  is_global       │
└──────────────────┘    └──────────────────┘    └──────────────────┘

┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│     ai_runs      │    │   automations    │    │automation_exec.  │
│──────────────────│    │──────────────────│    │──────────────────│
│  id (PK)         │    │  id (PK)         │    │  id (PK)         │
│  org_id (FK)     │    │  org_id (FK)     │    │  automation_id   │
│  client_id (FK)  │    │  slug            │    │  started_at      │
│  agent_id (FK)   │    │  name            │    │  finished_at     │
│  skill_id (FK)   │    │  type            │    │  status          │
│  user_id (FK)    │    │  category        │    │  trigger         │
│  status          │    │  schedule        │    │  error           │
│  input           │    │  enabled         │    │  inngest_run_id  │
│  output          │    │  last_run_at     │    └──────────────────┘
│  tokens_used     │    │  health_status   │
│  duration_ms     │    │  config (JSONB)  │
│  idempotency_key │    └──────────────────┘
│  started_at      │
│  completed_at    │
└──────────────────┘

┌──────────────────────────────────────────────┐
│                  audit_log                   │
│──────────────────────────────────────────────│
│  id · org_id · user_id · entity_type         │
│  entity_id · action · changes (JSONB)        │
│  ip_address · user_agent · created_at        │
└──────────────────────────────────────────────┘
```

---

## 4. DEFINICIÓN DE ENTIDADES

### 4.1 organizations

Nivel raíz del sistema multi-tenant. Toda la data operacional se aísla por organización.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Identificador único |
| name | text | NOT NULL | Nombre de la organización (ej: "Bop Agency") |
| slug | text | NOT NULL, UNIQUE | Identificador URL-amigable global |
| settings | jsonb | NOT NULL, default '{}' | Configuraciones de la org (timezone, idioma, etc.) |
| plan | text | NOT NULL, default 'free' | Plan de suscripción |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | Actualizado por trigger |

**Decisiones de diseño:**

| Decisión | Opción elegida | Alternativa | Justificación |
|----------|---------------|-------------|---------------|
| Slug | Global único | Por tenant | Las orgs son globales y el slug se usa en URLs públicas |
| Settings | JSONB | Columnas | Configuraciones variables según plan — JSONB más flexible |
| Soft delete | No aplica | — | Las organizaciones no se eliminan, se desactivan vía `plan='cancelled'` |

---

### 4.2 users

Gestionado principalmente por Supabase Auth. La tabla pública extiende `auth.users`.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK, FK → auth.users(id) | Mismo ID que Supabase Auth |
| email | text | NOT NULL | Sincronizado desde auth.users |
| full_name | text | | Nombre completo |
| avatar_url | text | | URL de avatar (puede ser de OAuth provider) |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

**Nota:** Los roles NO viven aquí — viven en `user_org_memberships.role`.

---

### 4.3 user_org_memberships

Tabla puente N:M entre usuarios y organizaciones. Define el rol de cada usuario en cada org.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| role | text | NOT NULL, CHECK IN ('owner','admin','member','viewer') | |
| joined_at | timestamptz | NOT NULL, default now() | |
| invited_by | uuid | FK → users(id) | Usuario que envió la invitación |

**Unique constraint:** `(user_id, org_id)` — un usuario tiene un solo rol por organización.

---

### 4.4 clients

Entidad central. Representa a los clientes de la agencia.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | NOT NULL, FK → organizations(id) | Organización propietaria |
| slug | text | NOT NULL | Identificador único dentro de la org |
| name | text | NOT NULL | Nombre del cliente |
| industry | text | NOT NULL | Industria (ej: 'legal', 'real_estate') |
| status | text | NOT NULL, default 'active' | active, paused, offboarded |
| country | text | | País (ej: 'CO', 'US') |
| timezone | text | default 'America/Bogota' | |
| metadata | jsonb | NOT NULL, default '{}' | Datos adicionales no estructurados |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | | Soft delete |

**Unique constraint:** `(org_id, slug)` — el slug es único dentro de la organización.

**Migración desde:** `shared-data/clients-index.json` + `.agencia-ai/clients/*/client.json`

---

### 4.5 client_documents

Almacena todos los documentos de un cliente (brand profile, buyer personas, compliance, etc.)

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| key | text | NOT NULL | Identificador del documento: 'brand-profile', 'buyer-persona-1', etc. |
| title | text | NOT NULL | Título legible del documento |
| content | text | NOT NULL | Contenido en Markdown |
| version | integer | NOT NULL, default 1 | Se incrementa en cada actualización |
| created_by | uuid | FK → users(id) | |
| updated_by | uuid | FK → users(id) | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(client_id, key)` — un documento de tipo X por cliente.

**Migración desde:** `.agencia-ai/clients/*/` archivos Markdown (brand-profile.md, buyer-persona-1.md, etc.)

---

### 4.6 client_contacts

Contactos del cliente (receptores de reportes, punto de contacto).

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| name | text | NOT NULL | |
| role | text | | Rol en la empresa del cliente (ej: 'CEO', 'Marketing Manager') |
| email | text | | |
| phone | text | | |
| is_primary | boolean | NOT NULL, default false | Contacto principal |
| receives_reports | boolean | NOT NULL, default false | Recibe reportes por email |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `shared-data/reports/report-recipients.json`

---

### 4.7 client_integrations

Configuración de plataformas conectadas por cliente. Los tokens OAuth van a Vault.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| platform | text | NOT NULL | meta_ads, google_ads, ga4, etc. |
| enabled | boolean | NOT NULL, default false | |
| account_id | text | | ID de cuenta en la plataforma (ej: act_906768512465553) |
| vault_secret_id | text | | Referencia al secret en Supabase Vault (acceso_token, refresh_token, etc.) |
| config | jsonb | NOT NULL, default '{}' | Configuración adicional sin datos sensibles |
| last_synced_at | timestamptz | | Última sincronización exitosa |
| sync_error | text | | Último error de sincronización |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(client_id, platform)` — una integración por plataforma por cliente.

**Migración desde:** `.agencia-ai/clients/*/integrations.json` (normalizando ambos formatos — ver C-01, R-04)

---

### 4.8 campaigns

Campañas de marketing creadas en BopIAgency (representación interna).

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | Para RLS sin JOIN |
| title | text | NOT NULL | |
| platform | text | NOT NULL | meta_ads, google_ads, youtube, etc. |
| type | text | NOT NULL | awareness, traffic, conversion, engagement, leads |
| status | text | NOT NULL, default 'draft' | draft, awaiting_approval, approved, active, paused, completed, rejected |
| brief | jsonb | NOT NULL, default '{}' | Briefing inicial: objetivo, presupuesto, duración, audiencia |
| content | jsonb | NOT NULL, default '{}' | Copies, imágenes, formatos generados |
| external_id | text | | ID de la campaña en la plataforma externa (post-publicación) |
| approved_by | uuid | FK → users(id) | |
| approved_at | timestamptz | | |
| rejection_reason | text | | |
| created_by | uuid | FK → users(id) | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | | Soft delete |

---

### 4.9 campaign_approvals

Historial de aprobaciones y rechazos de campañas.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| campaign_id | uuid | NOT NULL, FK → campaigns(id) | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| action | text | NOT NULL, CHECK IN ('approved','rejected','revision_requested') | |
| note | text | | Comentario del revisor |
| created_at | timestamptz | NOT NULL | |

---

### 4.10 client_metrics

Métricas sincronizadas de plataformas de advertising. Una fila = un cliente + período + plataforma.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | Para RLS |
| platform | text | NOT NULL | meta_ads, google_ads, ga4, etc. |
| period | text | NOT NULL | Formato: 'YYYY-MM' (ej: '2026-06') |
| data | jsonb | NOT NULL | MonthlyMetrics schema — ver `server/schemas/metricsSchemas.ts` |
| spend_total | numeric | | Índice para queries de agregación (desnormalizado de data.spend) |
| impressions_total | bigint | | Índice para queries de agregación |
| synced_at | timestamptz | NOT NULL | |
| source | text | NOT NULL, default 'api' | api, manual, import |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(client_id, platform, period)` — idempotencia del UPSERT.

**Migración desde:** `shared-data/metrics/clients/{id}/periods/*.json`

---

### 4.11 tasks

Tareas internas de la agencia. Incluye tareas de campañas, onboarding, administración, etc.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | FK → clients(id) | Puede ser nulo para tareas de agencia sin cliente |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| title | text | NOT NULL | |
| description | text | | |
| status | text | NOT NULL, default 'pending' | idea, pending, awaiting_approval, approved, in_progress, in_review, blocked, completed, cancelled |
| priority | text | NOT NULL, default 'medium' | low, medium, high, urgent |
| type | text | | campaign, content, analytics, admin, onboarding, etc. |
| assigned_to | uuid | FK → users(id) | |
| created_by | uuid | NOT NULL, FK → users(id) | |
| due_date | date | | |
| completed_at | timestamptz | | |
| metadata | jsonb | NOT NULL, default '{}' | Datos adicionales (URLs, referencias, etc.) |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| deleted_at | timestamptz | | Soft delete |

**Migración desde:** `.agencia-ai/clients/*/tasks.json`

---

### 4.12 task_dependencies

Dependencias entre tareas (reemplaza el UUID array de la propuesta inicial).

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| task_id | uuid | NOT NULL, FK → tasks(id) | |
| depends_on_task_id | uuid | NOT NULL, FK → tasks(id) | La tarea que debe completarse primero |

**PK compuesta:** `(task_id, depends_on_task_id)`

---

### 4.13 task_audit_log

Historial de cambios de estado de tareas.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| task_id | uuid | NOT NULL, FK → tasks(id) | |
| user_id | uuid | FK → users(id) | Puede ser nulo si fue cambio automático |
| from_status | text | | Estado anterior |
| to_status | text | NOT NULL | Nuevo estado |
| note | text | | Comentario opcional |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `agency-dashboard/data/audit/task-actions.jsonl`

---

### 4.14 alerts

Estado de alertas del sistema de monitoreo.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| type | text | NOT NULL | MISSING_METRICS_FILE, STALE_SYNC, ACTIVE_CAMPAIGNS_NO_SPEND, NO_CAMPAIGNS, SYNC_ERROR |
| severity | text | NOT NULL | critical, warning, info |
| status | text | NOT NULL, default 'active' | active, acknowledged, resolved, ignored |
| alert_id_hash | text | NOT NULL | Hash determinístico: SHA256(client_id + type + period) — para idempotencia |
| period | text | | Período al que aplica (ej: '2026-06') |
| details | jsonb | NOT NULL, default '{}' | Información adicional de la alerta |
| acknowledged_by | uuid | FK → users(id) | |
| acknowledged_at | timestamptz | | |
| resolved_at | timestamptz | | |
| notified_at | timestamptz | | Última notificación enviada |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(org_id, alert_id_hash)` — evita alertas duplicadas.

**Migración desde:** `shared-data/alerts/alert-state.json`

---

### 4.15 reports

Reportes generados (mensuales, semanales).

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| type | text | NOT NULL | monthly, weekly |
| period | text | NOT NULL | Formato: 'YYYY-MM' o 'YYYY-W##' |
| status | text | NOT NULL, default 'generated' | generating, generated, error |
| data | jsonb | NOT NULL | Contenido del reporte (métricas, insights, etc.) |
| file_url | text | | URL del PDF en Supabase Storage (si se genera PDF) |
| generated_at | timestamptz | | |
| created_at | timestamptz | NOT NULL | |

**Unique constraint:** `(client_id, type, period)` — un reporte de tipo X por período.

**Migración desde:** `shared-data/reports/clients/{id}/{type}/*.json`

---

### 4.16 report_recipients

Configuración de destinatarios de reportes por cliente.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| client_id | uuid | NOT NULL, FK → clients(id) | |
| contact_id | uuid | FK → client_contacts(id) | Si es un contacto registrado |
| email | text | NOT NULL | |
| name | text | | |
| report_types | text[] | NOT NULL, default '{"monthly"}' | Tipos de reporte que recibe |
| active | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `shared-data/reports/report-recipients.json`

---

### 4.17 report_deliveries

Historial de intentos de entrega de reportes.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| report_id | uuid | NOT NULL, FK → reports(id) | |
| recipient_id | uuid | NOT NULL, FK → report_recipients(id) | |
| status | text | NOT NULL, default 'pending' | pending, attempting, sent, failed, skipped |
| email_provider_id | text | | ID del mensaje en Resend/Sendgrid |
| attempted_at | timestamptz | | |
| sent_at | timestamptz | | |
| error | text | | Descripción del error si status = 'failed' |
| retry_count | integer | NOT NULL, default 0 | |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `shared-data/reports/report-delivery-state.json`

---

### 4.18 agents

Agentes de IA registrados. Equivalente al sistema actual en `.agencia-ai/.claude/agents/`.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | FK → organizations(id) | NULL = agente global (disponible para todas las orgs) |
| slug | text | NOT NULL | Identificador (ej: 'meta-ads-specialist') |
| name | text | NOT NULL | |
| category | text | | campaign, analytics, content, compliance, reporting, operations |
| description | text | | |
| system_prompt | text | NOT NULL | Contenido del archivo `.md` del agente |
| model | text | NOT NULL, default 'claude-sonnet-5' | Modelo de Claude a usar |
| version | integer | NOT NULL, default 1 | |
| is_global | boolean | NOT NULL, default false | Disponible para todas las organizaciones |
| active | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(org_id, slug)` — slug único por org; para globales `(NULL, slug)`.

**Migración desde:** `.agencia-ai/.claude/agents/*.md` (16 agentes)

---

### 4.19 skills

Skills de IA disponibles. Equivalente al sistema actual en `.agencia-ai/.claude/skills/`.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | FK → organizations(id) | NULL = skill global |
| slug | text | NOT NULL | |
| name | text | NOT NULL | |
| type | text | NOT NULL | instruction, executable |
| category | text | | |
| description | text | | |
| prompt | text | NOT NULL | Contenido del SKILL.md |
| version | integer | NOT NULL, default 1 | |
| is_global | boolean | NOT NULL, default false | |
| active | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Migración desde:** `.agencia-ai/.claude/skills/*/SKILL.md` (32 skills — 2 ejecutables, 30 de instrucciones)

---

### 4.20 templates

Plantillas de contenido. Equivalente a `.agencia-ai/templates/*.md`.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | FK → organizations(id) | NULL = template global |
| slug | text | NOT NULL | |
| name | text | NOT NULL | |
| category | text | | ads, copies, emails, reports, social, etc. |
| content | text | NOT NULL | Contenido en Markdown con variables `{{variable}}` |
| variables | text[] | NOT NULL, default '{}' | Lista de variables esperadas |
| version | integer | NOT NULL, default 1 | |
| is_global | boolean | NOT NULL, default false | |
| active | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `.agencia-ai/templates/*.md` (17 plantillas)

---

### 4.21 ai_runs

Historial de ejecuciones de agentes y skills de IA.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| client_id | uuid | FK → clients(id) | Cliente con contexto activo (puede ser nulo) |
| agent_id | uuid | FK → agents(id) | |
| skill_id | uuid | FK → skills(id) | |
| user_id | uuid | NOT NULL, FK → users(id) | |
| status | text | NOT NULL, default 'running' | running, completed, failed, cancelled |
| input | text | NOT NULL | Mensaje del usuario |
| output | text | | Respuesta del modelo |
| model | text | NOT NULL | Modelo usado (ej: 'claude-sonnet-5') |
| tokens_input | integer | | Tokens en el prompt |
| tokens_output | integer | | Tokens en la respuesta |
| duration_ms | integer | | Duración total en milisegundos |
| idempotency_key | text | | Clave opcional para evitar duplicados |
| error | text | | Descripción del error si status = 'failed' |
| started_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | | |

**Nota C-09:** Para conversaciones largas (>50 mensajes), el historial completo se almacena en Supabase Storage y `output` contiene solo el resumen.

---

### 4.22 automations

Catálogo de automatizaciones configuradas.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| slug | text | NOT NULL | |
| name | text | NOT NULL | |
| type | text | NOT NULL | cron, event, manual |
| category | text | NOT NULL | core, metrics, alerts, reports, notifications, other |
| schedule | text | | Expresión cron (si type=cron) |
| event_name | text | | Nombre del evento Inngest (si type=event) |
| inngest_function_id | text | | ID de la función en Inngest |
| enabled | boolean | NOT NULL, default true | |
| health_status | text | NOT NULL, default 'unknown' | healthy, warning, error, unknown |
| last_run_at | timestamptz | | |
| last_error | text | | |
| config | jsonb | NOT NULL, default '{}' | Configuración adicional (scope de clientes, etc.) |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |

**Unique constraint:** `(org_id, slug)`

**Migración desde:** `shared-data/automations/automations-registry.json`

---

### 4.23 automation_executions

Historial de ejecuciones de automatizaciones.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| automation_id | uuid | NOT NULL, FK → automations(id) | |
| org_id | uuid | NOT NULL, FK → organizations(id) | |
| status | text | NOT NULL | success, failure, running |
| trigger | text | NOT NULL | cron, manual, event |
| inngest_run_id | text | | ID del run en Inngest para trazabilidad |
| started_at | timestamptz | NOT NULL | |
| finished_at | timestamptz | | |
| duration_ms | integer | | |
| error | text | | |
| output | jsonb | default '{}' | Resultado resumido de la ejecución |

**Migración desde:** `shared-data/automations/executions/*.json`

---

### 4.24 compliance_rules

Reglas de compliance por industria (nuevo — no existía en la propuesta inicial).

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | FK → organizations(id) | NULL = regla global |
| industry | text | NOT NULL | Industria aplicable (legal, real_estate, health, etc.) |
| platform | text | | Plataforma específica (NULL = todas) |
| rule_key | text | NOT NULL | Identificador de la regla |
| title | text | NOT NULL | Título legible |
| description | text | NOT NULL | Descripción completa de la restricción |
| severity | text | NOT NULL | error, warning |
| active | boolean | NOT NULL, default true | |
| created_at | timestamptz | NOT NULL | |

**Migración desde:** `.agencia-ai/.claude/references/compliance-master-guide.md` (extraer y estructurar)

---

### 4.25 audit_log

Log centralizado de todas las mutaciones importantes del sistema.

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| id | uuid | PK | |
| org_id | uuid | NOT NULL | Organización donde ocurrió la acción |
| user_id | uuid | FK → users(id) | NULL si fue acción automatizada |
| entity_type | text | NOT NULL | Tipo de entidad: 'client', 'campaign', 'task', etc. |
| entity_id | uuid | NOT NULL | ID de la entidad afectada |
| action | text | NOT NULL | create, update, delete, approve, reject, etc. |
| changes | jsonb | NOT NULL, default '{}' | `{ before: {...}, after: {...} }` |
| ip_address | inet | | IP del request |
| user_agent | text | | User agent del browser |
| created_at | timestamptz | NOT NULL, default now() | |

**Retención:** 90 días en caliente. Particionamiento por `created_at` recomendado para > 1M filas.

---

## 5. ROW LEVEL SECURITY (RLS)

### Principio de diseño

Toda tabla tiene RLS habilitado. Las policies usan la función auxiliar `get_my_org_ids()` para obtener las organizaciones del usuario autenticado:

```
-- Función auxiliar (Propuesto — no ejecutar)
-- Retorna los org_ids a los que pertenece el usuario actual
get_my_org_ids() → uuid[]
```

### Tabla de policies por tabla

| Tabla | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| organizations | Miembro de la org | Público (onboarding) | Owner/Admin | Solo owner |
| clients | Miembro de la org | Admin+ de la org | Admin+ de la org | Soft delete — Admin+ |
| client_documents | Miembro de la org | Member+ | Member+ | Admin+ |
| client_integrations | Admin+ de la org | Admin+ | Admin+ | Admin+ |
| campaigns | Miembro de la org | Member+ | Member+ (owner) / Admin (cualquiera) | Admin+ |
| client_metrics | Miembro de la org | Sistema (service role) | Sistema (service role) | Admin+ |
| tasks | Miembro de la org | Member+ | Asignado o Admin+ | Admin+ |
| alerts | Miembro de la org | Sistema (service role) | Member+ (estado) | Admin+ |
| reports | Miembro de la org | Sistema (service role) | Sistema | Admin+ |
| report_deliveries | Admin+ de la org | Sistema | Sistema | Admin+ |
| ai_runs | Autor o Admin+ | Member+ | Nadie | Admin+ |
| automations | Admin+ de la org | Admin+ | Admin+ | Admin+ |
| automation_executions | Admin+ de la org | Sistema | Nadie | Admin+ |
| audit_log | Admin+ de la org | Sistema + triggers | Nadie | Nadie |
| agents | Todos los miembros (is_global) / Admin+ (org) | Admin+ | Admin+ | Admin+ |
| skills | Todos los miembros (is_global) / Admin+ (org) | Admin+ | Admin+ | Admin+ |
| templates | Todos los miembros (is_global) / Admin+ (org) | Admin+ | Admin+ | Admin+ |

**Nota:** "Sistema (service role)" significa que el cliente de Supabase con `service_role_key` (usado en Inngest functions) puede escribir sin restricciones RLS. Este cliente **nunca se usa en el frontend**.

---

## 6. SOFT DELETE

Las siguientes entidades implementan soft delete vía columna `deleted_at`:

- `clients` — un cliente "eliminado" no aparece en queries normales pero sus datos se preservan
- `campaigns` — se archivan, no se borran
- `tasks` — se archivan

**Convención:** todas las queries en la capa de repositorio filtran `WHERE deleted_at IS NULL` por defecto. Para incluir eliminados, se pasa `{ includeDeleted: true }` al repositorio.

Los indexes se crean como `WHERE deleted_at IS NULL` para eficiencia.

---

## 7. VERSIONADO DE ENTIDADES

Las entidades que evolucionan con el tiempo tienen columna `version integer`:

- `client_documents` — historial de contenido de documentos
- `agents` — actualizaciones de prompts de agentes
- `skills` — actualizaciones de prompts de skills
- `templates` — actualizaciones de plantillas

**Estrategia:** el `version` se incrementa en cada `UPDATE`. El historial completo de versiones no se almacena en la tabla principal — se puede implementar vía `client_document_versions` en el futuro si se requiere.

---

## 8. EVENTOS DE DOMINIO (EVENT SOURCING PARCIAL)

No se implementa Event Sourcing completo. Sin embargo, ciertos eventos críticos se persisten explícitamente para trazabilidad:

| Evento | Tabla | Descripción |
|--------|-------|-------------|
| metrics.synced | `automation_executions` | Registro de cada sincronización exitosa |
| alert.created | `alerts` | Registro permanente con estado evolutivo |
| campaign.approved/rejected | `campaign_approvals` | Historial completo de decisiones |
| task.status_changed | `task_audit_log` | Historial de todos los cambios de estado |
| agent.run | `ai_runs` | Registro de cada ejecución de IA |
| report.sent | `report_deliveries` | Registro de cada intento de entrega |

---

## 9. IDEMPOTENCIA EN BASE DE DATOS

| Operación | Clave idempotente | Mecanismo |
|-----------|------------------|-----------|
| Upsert métricas | `(client_id, platform, period)` | ON CONFLICT DO UPDATE |
| Crear alerta | `(org_id, alert_id_hash)` | ON CONFLICT DO NOTHING |
| Entregar reporte | Verificar `status != 'sent'` | Check pre-ejecución |
| Crear ai_run | `idempotency_key` (opcional) | ON CONFLICT DO NOTHING |

---

## 10. GESTIÓN DE SECRETOS (SUPABASE VAULT)

Los tokens de plataformas externas se almacenan en Supabase Vault, no en columnas JSONB:

```
-- Flujo (conceptual — no ejecutar)
1. Al conectar una integración:
   vault_id = vault.create_secret(name="meta_access_token_client_X", secret=token)
   UPDATE client_integrations SET vault_secret_id = vault_id

2. Al sincronizar métricas (desde Inngest con service_role):
   token = vault.read_secret(vault_secret_id)
   meta_api.call(token)
```

**Secretos almacenados en Vault:**
- Meta Ads Access Token (por cliente)
- Google OAuth2 tokens (access + refresh) por cliente
- API keys de GoHighLevel por cliente

---

## 11. POLÍTICAS DE RETENCIÓN

| Tabla | Retención | Criterio |
|-------|-----------|---------|
| audit_log | 90 días activo → exportar a Storage | Por `created_at` |
| automation_executions | 60 días activo → eliminar | Por `started_at` |
| ai_runs | 30 días activo | Por `started_at` |
| report_deliveries | Permanente (mientras exista el report) | N/A |
| alerts resueltas | 180 días | Por `resolved_at` |
| client_metrics | Permanente | N/A |
| reports | Permanente | N/A |

---

## 12. ÍNDICES RECOMENDADOS (CONCEPTUAL)

| Tabla | Columnas indexadas | Tipo | Justificación |
|-------|------------------|------|---------------|
| clients | `(org_id, status, deleted_at)` | BTREE | Query principal: listar clientes activos de la org |
| client_metrics | `(client_id, period, platform)` | BTREE | Query principal: métricas por cliente y período |
| client_metrics | `(org_id, period)` | BTREE | Vista resumen de la agencia |
| campaigns | `(client_id, status, deleted_at)` | BTREE | Query principal: campañas por cliente |
| tasks | `(client_id, status, deleted_at)` | BTREE | Query principal: tareas por cliente |
| tasks | `(assigned_to, status)` | BTREE | Vista personal de tareas |
| alerts | `(org_id, status, severity)` | BTREE | Panel de alertas |
| alerts | `(alert_id_hash)` | BTREE | Idempotencia |
| ai_runs | `(org_id, user_id, started_at)` | BTREE | Historial por usuario |
| audit_log | `(org_id, entity_type, entity_id)` | BTREE | Consultas de auditoría |
| automation_executions | `(automation_id, started_at)` | BTREE | Historial de ejecuciones |

---

## 13. TABLA DE DECISIONES POR ENTIDAD

| Entidad | UUID PK | Soft Delete | Versión | RLS | Audit Log | Vault | JSONB |
|---------|---------|-------------|---------|-----|-----------|-------|-------|
| organizations | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | settings |
| users | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| clients | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | metadata |
| client_documents | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| client_integrations | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ | config |
| campaigns | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | brief, content |
| client_metrics | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | data |
| tasks | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | metadata |
| alerts | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | details |
| reports | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | data |
| ai_runs | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| agents | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| skills | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| automations | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | config |
| audit_log | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | changes |

---

*Diseño conceptual/lógico — 2026-07-29. No ejecutar SQL hasta aprobación de este documento.*
