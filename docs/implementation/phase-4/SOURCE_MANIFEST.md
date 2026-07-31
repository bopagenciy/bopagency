# Phase 4 — Manifiesto de Fuentes

Auditoría: 2026-07-30

## Inventario completo

| #    | Fuente                                              | Archivos       | Formato            | Importador              | Tabla destino         | Incluido         | PII         | Secretos | Estado          |
| ---- | --------------------------------------------------- | -------------- | ------------------ | ----------------------- | --------------------- | ---------------- | ----------- | -------- | --------------- |
| 4.1  | `shared-data/clients-index.json`                    | 1              | JSON schemaV1      | `clients-importer`      | `clients`             | 2 de 3           | NO          | NO       | ✓ listo         |
| 4.2  | `.agencia-ai/clients/*/*.md`                        | ~66            | Markdown           | `documents-importer`    | `client_documents`    | ~22 (2 clientes) | NO          | NO       | ✓ listo         |
| 4.3  | `.agencia-ai/clients/*/tasks.json`                  | 4              | JSON schemaV1      | `tasks-importer`        | `tasks`               | 0 (todos vacíos) | NO          | NO       | ⚠ vacío         |
| 4.4  | `.agencia-ai/clients/*/integrations.json`           | 3              | JSON schemaV1      | `integrations-importer` | `client_integrations` | 0 (todos vacíos) | NO          | NO       | ⚠ vacío         |
| 4.5  | `shared-data/metrics/clients/`                      | 4              | JSON schemaV1 list | `metrics-importer`      | `client_metrics`      | 4 (2 clientes)   | NO          | NO       | ✓ listo         |
| 4.6  | `shared-data/alerts/alert-state.json`               | 1              | JSON schemaV1      | `alerts-importer`       | `alerts`              | 1 (estado)       | NO          | NO       | ✓ listo         |
| 4.7  | `shared-data/reports/clients/`                      | 9              | JSON schemaV1      | `reports-importer`      | `reports`             | 9                | NO          | NO       | ✓ listo         |
| 4.8  | `shared-data/reports/report-recipients.json`        | 1              | JSON schemaV1      | `recipients-importer`   | `report_recipients`   | 0 (vacío)        | SÍ (emails) | NO       | ⚠ vacío         |
| 4.9  | `.agencia-ai/.claude/agents/*.md`                   | 17             | Markdown           | `agents-importer`       | `agents`              | 17 (globales)    | NO          | NO       | ✓ listo         |
| 4.10 | `.agencia-ai/.claude/skills/*/SKILL.md`             | 27             | Markdown           | `skills-importer`       | `skills`              | 27 (globales)    | NO          | NO       | ✓ listo         |
| 4.11 | `.agencia-ai/templates/*.md`                        | 17             | Markdown           | `templates-importer`    | `templates`           | 17 (globales)    | NO          | NO       | ✓ listo         |
| 4.12 | `shared-data/automations/automations-registry.json` | 1              | JSON schemaV1      | `automations-importer`  | `automations`         | 7                | NO          | NO       | ✓ listo         |
| —    | `shared-data/quarantine/`                           | 5              | JSON (contaminado) | NINGUNO                 | —                     | 0                | —           | —        | 🚫 excluido     |
| —    | `.agencia-ai/clients/_template-client/`             | 15             | Mixed              | NINGUNO                 | —                     | 0                | —           | —        | 🚫 excluido     |
| —    | `.agencia-ai/clients/bop-soluciones/`               | 14 MD + 4 JSON | Mixed legacy       | NINGUNO                 | —                     | 0                | —           | —        | ⏸ manual-review |
| —    | `.agencia-ai/clients/the-industrial-depot/`         | 11 MD          | Markdown           | NINGUNO                 | —                     | 0                | —           | —        | ⏸ manual-review |

## Detalle por fuente

### 4.1 clients-index.json

- **Esquema**: `{ schemaVersion, generatedAt, clientCount, clients[] }`
- **Campos por cliente**: id, name, status, industry, language, timezone, createdAt, updatedAt, documents{}, dataFiles{}, folderPath, isValid
- **Mapeo de industry**:
  - "Marketing Digital / Agencia" → `other`
  - "Servicios legales digitales" → `legal`
  - "Hotelería / Turismo / Glamping" → `hospitality`
- **Campos faltantes en BD**: legalName, currency, website, email, phone, notes → se dejan en NULL
- **Clave idempotente**: `organization_id + slug`

### 4.2 Documentos Markdown

- **Archivos por cliente**: brand-profile, services, buyer-personas, offers, campaigns, content-calendar, reports, assets, notes, compliance-rules, automation-map
- **Excluidos siempre**: backups/, `.ready`, archivos ocultos, archivos JSON
- **document_key**: nombre de archivo sin extensión (ej: `brand-profile.md` → `brand-profile`)
- **Categoría**: derivada del nombre del archivo
- **Status inicial**: `published`
- **Clave idempotente**: `client_id + document_key`

### 4.5 Métricas (client_metrics)

- **Formato**: Array JSON, cada item = `{ schemaVersion, clientId, period{start,end,timezone}, currency, sources[], aggregate{}, dataQuality{} }`
- **Fuentes por item**: `sources[]` con `platform, accountId, accountName, status, metrics{}, campaigns[]`
- **Plataformas detectadas**: `meta_ads`
- **Clave idempotente**: `client_id + platform + account_id + period_start + period_end`
- **NO migrar**: nada de `shared-data/quarantine/`

### 4.6 Alertas

- **Formato**: `{ schemaVersion, updatedAt, states: { [alertKey]: { status, updatedAt, ... } } }`
- **1 estado de alerta**: legalink-col / meta_ads / sin campañas activas
- **alertKey**: `{clientSlug}_{alertType}_{accountId}`
- **No hay datos sensibles**; no hay `active_alerts` (lista vacía)

### 4.7 Reportes

- **Formato**: `{ schemaVersion, reportId, clientId, clientName, reportType, period, generatedAt, currency, summary, ... }`
- **reportId**: `{clientId}_{reportType}_{period}` — clave natural
- **Clave idempotente**: `client_id + report_type + period_start + period_end`

### 4.8 Destinatarios

- Todos los clientes tienen 0 recipients → nada que importar en esta iteración

### 4.9–4.11 Agents, Skills, Templates

- **Formato**: Markdown puro con posible YAML frontmatter
- **Scope**: global (no ligados a un client_id específico)
- **Slug**: derivado del nombre del archivo o carpeta
- **Clave idempotente**: `organization_id + slug` (para organización propietaria) o `slug` (si son globales del sistema)

### 4.12 Automations

- **Formato**: `{ schemaVersion, updatedAt, automations[] }`
- **workflowId**: `null` en todos — indica que los workflows n8n no están aún vinculados
- **Status inicial en BD**: `inactive` (workflowId nulo → no activar)
- **Clave idempotente**: `organization_id + legacy_id`

## Datos con PII potencial

- `report-recipients.json`: contiene emails (0 en esta iteración)
- `bop-soluciones/insights.json`: puede contener datos de audiencia; excluido (manual-review)

## Datos con posibles secretos

- `cliente-prueba/integrations.json`: todas las cuentas null/disabled — SIN secretos
- `legalink-col/integrations.json`: lista vacía — SIN secretos
- `magic-bungalow/integrations.json`: lista vacía — SIN secretos
- `bop-soluciones/`: no se procesa
- **Fuente real de secretos**: `n8n-local/.env` — NO procesada en esta iteración, documentada en VAULT_SETUP.md
- Los accountIds de Meta (act_XXXXXXXXX) en métricas NO son secretos; son identificadores públicos de cuenta publicitaria
