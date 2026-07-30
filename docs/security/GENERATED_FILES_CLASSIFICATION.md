# GENERATED FILES CLASSIFICATION
## BopIAgency — Clasificación de Archivos Generados y Temporales
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad

---

## LEYENDA DE CLASIFICACIONES

| Clasificación | Descripción |
|--------------|-------------|
| 📌 **Source controlled** | Debe estar bajo control de versiones |
| 🔄 **Generated** | Archivo generado automáticamente — puede regenerarse |
| 🕐 **Temporary** | Archivo temporal — no debe persistir |
| 🔐 **Sensitive** | Contiene datos sensibles — proteger o excluir de git |
| 💾 **Backup** | Copia de seguridad — archivar |
| 🗄️ **Runtime data** | Datos de runtime — evolucionan en tiempo real |
| 📦 **Archive candidate** | Candidato para archivar en `legacy/` |
| 🗑️ **Delete candidate** | Sin valor — puede eliminarse (NO borrar en Fase 0) |

---

## 1. RAÍZ DEL REPOSITORIO (BopIAgency/)

| Ruta | Clasificación | Razón | Acción recomendada |
|------|--------------|-------|-------------------|
| `.agencia-ai/` | 📌 Source controlled | Decisión aprobada #4 — permanece versionado en Git | Incluir en git raíz cuando se inicialice |
| `agency-dashboard/` | 📦 Archive candidate | Dashboard legado — mantener durante migración, archivar en Fase 12 | Mantener operativo durante Fases 0-11 |
| `agency-dashboard/.git/` | 📌 Source controlled | Repositorio git independiente del dashboard | Conservar. Evaluar consolidar en Fase 1 |
| `n8n-local/` | 🗄️ Runtime data | Infraestructura Docker activa — no se puede archivar mientras n8n corre | Mantener hasta Fase 8; archivar tras apagar n8n |
| `n8n-local/.env` | 🔐 Sensitive | Contiene N8N_ENCRYPTION_KEY — ver S-01 | Proteger con `.gitignore` raíz (ya incluido) |
| `n8n-local/local-files/` | 🕐 Temporary | Vacío — directorio de montaje para n8n | Ignorar en git |
| `shared-data/` | 🗄️ Runtime data | Fuente de verdad actual — leer/escribir por n8n y Express | Preservar hasta Fase 12; migrar a Supabase en Fase 4 |
| `backups/` | 💾 Backup | Respaldos históricos de workflows, templates y métricas | Conservar. Revisar datos sensibles antes de versionar |
| `clientbop/` | 🗑️ Delete candidate | Directorio vacío sin propósito identificado | No eliminar en Fase 0. Confirmar con Francisco antes de borrar |
| `docs/` | 📌 Source controlled | Documentación de auditoría y arquitectura | Siempre versionar |
| `.gitignore` (raíz) | 📌 Source controlled | **Creado en Fase 0** — protege secrets | Versionar en el primer commit del repo raíz |

---

## 2. AGENCY-DASHBOARD (agency-dashboard/)

| Ruta | Clasificación | Razón | Acción recomendada |
|------|--------------|-------|-------------------|
| `src/` | 📌 Source controlled | Código fuente del frontend React | Mantener durante migración |
| `server/` | 📌 Source controlled | Código fuente del backend Express | Mantener durante migración |
| `package.json` | 📌 Source controlled | Dependencias del proyecto | Mantener |
| `tsconfig.json` | 📌 Source controlled | Configuración TypeScript | Mantener |
| `vite.config.ts` | 📌 Source controlled | Configuración de Vite | Mantener |
| `.env.example` | 📌 Source controlled | **Actualizado en Fase 0** con todas las vars | Versionar siempre |
| `.env` | 🔐 Sensitive | Contiene API keys reales — correctamente ignorado | Nunca versionar |
| `.gitignore` | 📌 Source controlled | Protege .env y node_modules | Mantener y extender si necesario |
| `node_modules/` | 🔄 Generated | Dependencias instaladas — regenerable con `npm install` | Ignorar en git ✅ (ya ignorado) |
| `dist/` | 🔄 Generated | Build compilado de Vite+TypeScript — regenerable con `npm run build` | Ignorar en git ✅ (ya ignorado) |
| `data/audit/task-actions.jsonl` | 🗄️ Runtime data | Log de mutaciones de tareas — crece indefinidamente | Ignorar en git ✅ (ya ignorado por `data/audit/`). Migrar a Supabase en Fase 5 |
| `data/audit/` | 🗄️ Runtime data | Directorio de logs de auditoría | Ignorar en git ✅ |

---

## 3. SHARED-DATA (shared-data/)

| Ruta | Clasificación | Datos sensibles | Acción recomendada |
|------|--------------|----------------|-------------------|
| `clients-index.json` | 🗄️ Runtime data | IDs de clientes, nombres de empresa | Fuente de verdad actual. Migrar a Supabase (Fase 4). No versionar |
| `metrics/clients/legalink-col/periods/*.json` | 🗄️ Runtime data | `accountId: act_906...553`, métricas financieras | Migrar a Supabase. Proteger con `.gitignore` raíz |
| `metrics/clients/magic-bungalow/periods/*.json` | 🗄️ Runtime data + 🔐 Sensitive | `accountId: act_425...10`, nombre personal "Francisco Roncallo Nader", métricas + datos de campañas | Migrar a Supabase. No versionar |
| `metrics/metrics-index.json` | 🗑️ Delete candidate | Vacío (`{"clients": []}`) — sin uso | No eliminar en Fase 0. Verificar si n8n lo usa |
| `reports/clients/*/monthly/*.json` | 🗄️ Runtime data + 🔐 Sensitive | Reportes de performance de clientes | Migrar a Supabase (tabla `reports`). No versionar |
| `reports/clients/*/weekly/*.json` | 🗄️ Runtime data + 🔐 Sensitive | Reportes semanales de clientes | Idem |
| `reports/report-recipients.json` | 🔐 Sensitive | **Contiene emails personales**: `f.ron...@gmail.com` | No versionar. Migrar a tabla `report_recipients` en Fase 5. Ya excluido en `.gitignore` raíz |
| `reports/report-delivery-state.json` | 🗄️ Runtime data | Estado de entregas de reportes | Migrar a Supabase. No versionar |
| `alerts/alert-state.json` | 🗄️ Runtime data | Estado de alertas por cliente | Migrar a Supabase (tabla `alerts`). No versionar |
| `alerts/notification-state.json` | 🗄️ Runtime data | Historial de notificaciones enviadas | Migrar a Supabase. No versionar |
| `automations/automations-registry.json` | 🗄️ Runtime data | Catálogo de automatizaciones | Migrar a Supabase (tabla `automations`). No versionar |
| `automations/executions/*.json` | 🗄️ Runtime data | Historial de ejecuciones (7 archivos) | Migrar a Supabase. No versionar |
| `shared-data/logs/` | 🕐 Temporary | Vacío — directorio para logs futuros | Ignorar en git. Agregar al `.gitignore` raíz ✅ |
| `shared-data/exports/` | 🕐 Temporary | Vacío — directorio para exportaciones | Ignorar en git |
| `shared-data/imports/` | 🕐 Temporary | Vacío — directorio para importaciones | Ignorar en git |
| `shared-data/raw-metrics/` | 🕐 Temporary | Vacío | Ignorar en git |
| `shared-data/processed-metrics/` | 🕐 Temporary | Vacío | Ignorar en git |

---

## 4. BACKUPS (backups/)

| Ruta | Clasificación | Datos sensibles | Acción recomendada |
|------|--------------|----------------|-------------------|
| `backups/n8n-workflows/*.json` | 💾 Backup + ℹ️ | Credential IDs (referencias, no tokens reales). Account IDs de Meta. Email `bopagencia@gmail.com`. n8n instanceId | Ver `N8N_BACKUP_SECURITY_REVIEW.md` para decisión de versionado |
| `backups/cliente-prueba-metrics/` | 💾 Backup | Métricas de cliente de prueba (sin datos reales) | Conservar como referencia. No versionar |
| `backups/legacy-commands/new-client.md` | 💾 Backup | Sin datos sensibles | Versionar como referencia histórica. Archivar en Fase 12 |
| `backups/new-client-20260617-085929.md` | 💾 Backup | Sin datos sensibles | Idem |
| `backups/template-client-20260617-085436/` | 💾 Backup | Sin datos sensibles | Copia exacta del template. Archivar en Fase 12 |

---

## 5. N8N-LOCAL (n8n-local/)

| Ruta | Clasificación | Datos sensibles | Acción recomendada |
|------|--------------|----------------|-------------------|
| `n8n-local/docker-compose.yml` | 📌 Source controlled | Sin secretos directos — lee N8N_ENCRYPTION_KEY de `.env` | Versionar |
| `n8n-local/.env` | 🔐 Sensitive | `N8N_ENCRYPTION_KEY` en texto plano (S-01) | NO versionar. Protegido por `.gitignore` raíz ✅ |
| `n8n-local/local-files/` | 🕐 Temporary | Vacío | Ignorar en git |

---

## 6. AGENCIA-AI (.agencia-ai/)

| Ruta | Clasificación | Notas |
|------|--------------|-------|
| `.agencia-ai/.claude/agents/` | 📌 Source controlled | 16 agentes — Decisión #4 y #5 (modelo híbrido) |
| `.agencia-ai/.claude/skills/` | 📌 Source controlled | 32 skills |
| `.agencia-ai/.claude/commands/` | 📌 Source controlled | 26 comandos |
| `.agencia-ai/.claude/workflows/` | 📌 Source controlled | 8 workflows |
| `.agencia-ai/.claude/references/` | 📌 Source controlled | Guías de compliance y contexto |
| `.agencia-ai/templates/` | 📌 Source controlled | 17 plantillas |
| `.agencia-ai/clients/*/` | 🗄️ Runtime data + 📌 | Documentos de clientes — bajo git según Decisión #4. Revisar si contienen datos sensibles antes de versionar |
| `.agencia-ai/clients/legalink-col/brand-profile.md` | 📌 + ℹ️ | Contiene email: `legalinkcol@gmail.com` — dato de contacto del cliente |
| `.agencia-ai/assets/` | 🗑️ Delete candidate | Vacío |
| `.agencia-ai/automations/` | 🗑️ Delete candidate | Vacío |
| `.agencia-ai/proposals/` | 🗑️ Delete candidate | Vacío |
| `.agencia-ai/references/` | 🗑️ Delete candidate | Vacío |
| `.agencia-ai/reports/` | 🗑️ Delete candidate | Vacío |

---

## 7. RECOMENDACIONES GENERALES

### No versionar nunca (agregar a `.gitignore` raíz):
- `shared-data/` — datos de runtime con IDs publicitarios y emails
- `n8n-local/.env` — contiene encryption key ✅ ya en `.gitignore`
- `agency-dashboard/node_modules/` ✅ ya ignorado
- `agency-dashboard/dist/` ✅ ya ignorado

### Versionar con cuidado (revisar contenido primero):
- `backups/n8n-workflows/*.json` — sin secretos directos, con credential IDs y account IDs
- `.agencia-ai/clients/*/` — revisar que no contengan tokens ni contraseñas

### Eliminar en fases futuras (no en Fase 0):
- `clientbop/` — directorio vacío sin propósito
- `.agencia-ai/assets/`, `automations/`, `proposals/`, `references/`, `reports/` — vacíos
- `shared-data/metrics/metrics-index.json` — vacío y sin uso

---

*Clasificación realizada el 2026-07-29. No se eliminó ni movió ningún archivo.*
