# PHASE 0 CHANGELOG
## BopIAgency — Registro de Cambios de la Fase 0: Saneamiento y Seguridad
**Fecha de ejecución:** 2026-07-29  
**Ejecutado por:** Claude (Asistente IA) + Francisco Roncallo  
**Rama git activa:** `master` (en `agency-dashboard/` — único repositorio git existente)  
**Commit base:** `a463fc6` — "Add automated client reports module"

---

## RESUMEN DE CAMBIOS

| Tipo | Archivos afectados | Descripción |
|------|-------------------|-------------|
| Archivos creados | 7 | Documentación de seguridad en `docs/security/` |
| Archivos modificados | 8 | 7 ADRs (estado), 1 `.env.example` |
| Archivos inspeccionados | 50+ | Sin modificaciones |
| Comandos ejecutados | 20+ | git, bash, tsc — solo lectura/análisis |
| Archivos eliminados | 0 | Ninguno |
| Archivos movidos | 0 | Ninguno |
| Paquetes instalados | 0 | Ninguno |
| SQL ejecutado | 0 | Ninguno |

---

## 1. ARCHIVOS CREADOS

### 1.1 `docs/security/SECRET_SCAN_REPORT.md`
**Razón:** Tarea #17 — Escaneo de secretos (requerida en Fase 0)  
**Contenido:** 15 hallazgos clasificados (5 Confirmados, 3 Posibles, 4 Identificadores de configuración, 3 Falsos positivos, 1 No determinado). Conclusión: ningún secreto está versionado en git.

### 1.2 `docs/security/ENVIRONMENT_VARIABLE_INVENTORY.md`
**Razón:** Tarea #18 — Inventario de variables de entorno (requerida en Fase 0)  
**Contenido:** 13 variables de `agency-dashboard/.env`, 10 de `n8n-local/.env`, 7 faltantes en `.env.example` (todas corregidas), tabla de variables futuras Next.js.

### 1.3 `docs/security/GENERATED_FILES_CLASSIFICATION.md`
**Razón:** Tarea #21 — Clasificación de archivos generados (requerida en Fase 0)  
**Contenido:** Clasificación completa de todos los archivos del repositorio en 8 categorías. 12 directorios vacíos identificados (no eliminados). Decisiones de versionado por directorio.

### 1.4 `docs/security/N8N_BACKUP_SECURITY_REVIEW.md`
**Razón:** Tarea #22 — Revisión de seguridad de backups n8n (requerida en Fase 0)  
**Contenido:** Análisis de los 4 workflows JSON en `backups/n8n-workflows/`. Conclusión: ninguno contiene credenciales reales. Todos pueden versionarse con condiciones. Bug crítico documentado en W-03 (cross-client data).

### 1.5 `docs/security/SHARED_DATA_SECURITY_REVIEW.md`
**Razón:** Tarea #23 — Revisión de seguridad de shared-data (requerida en Fase 0)  
**Contenido:** Análisis de los 25 archivos JSON en `shared-data/`. PII encontrada: email personal `f.roncallo@gmail.com`. Nombre personal: "Francisco Roncallo Nader". Datos financieros reales: 159,048 COP. Recomendación: no versionar `shared-data/`.

### 1.6 `docs/security/TECHNICAL_BASELINE.md`
**Razón:** Tarea #24 — Baseline técnico (requerida en Fase 0)  
**Contenido:** Resultados de typecheck (0 errores, ~10,815ms), estado de ESLint (no instalado), Vite (disponible pero no ejecutado). Node v22.22.3, npm 10.9.8. 9 archivos con cambios no commiteados. 5 archivos untracked en agency-dashboard.

### 1.7 `docs/security/PHASE_0_CHANGELOG.md`
**Razón:** Tarea #26 — Registro de cambios de Fase 0 (requerida en Fase 0)  
**Contenido:** Este archivo.

---

## 2. ARCHIVOS MODIFICADOS

### 2.1 `agency-dashboard/.env.example`
**Razón:** 7 variables presentes en `.env` real no estaban documentadas en el ejemplo  
**Cambios:**
- Agregado: `API_HOST=127.0.0.1`
- Agregado: `API_PORT=3101`
- Agregado: `VITE_API_BASE_URL=http://127.0.0.1:3101`
- Agregado: `N8N_BASE_URL=http://127.0.0.1:5678`
- Agregado: `N8N_API_BASE_URL=http://127.0.0.1:5678/api/v1`
- Agregado: `N8N_API_KEY=replace-with-n8n-api-key`
- Agregado: `N8N_CLIENT_SCAN_WORKFLOW_NAME=CORE - Escanear Clientes`
- Agregados: comentarios de sección y nota `openssl rand -hex 32` para secretos

**Ningún valor real fue incluido — todos son placeholders.**

### 2.2 `.gitignore` (raíz de BopIAgency/)
**Razón:** La raíz del repositorio no tenía `.gitignore`. Protección preventiva antes de que se inicialice git en la raíz.  
**Cambios (archivo creado, no preexistente):**
- Protege `n8n-local/.env` (contiene `N8N_ENCRYPTION_KEY`)
- Excluye `shared-data/reports/report-recipients.json` (contiene emails personales)
- Ignora: `node_modules/`, `dist/`, `.next/`, `*.log`, `coverage/`, `.DS_Store`, `.idea/`, etc.
- Conserva explícitamente: `.agencia-ai/`, `templates/`, `docs/`, `backups/n8n-workflows/`

### 2.3 `docs/architecture/decisions/ADR-001-application-framework.md`
**Razón:** Tarea #25 — Actualización de estado de ADRs  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Decisión aprobada #2 — "Next.js será el framework objetivo."

### 2.4 `docs/architecture/decisions/ADR-002-database-and-auth.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Decisión aprobada #3 — "Supabase será la plataforma objetivo."

### 2.5 `docs/architecture/decisions/ADR-003-automation-engine.md`
**Razón:** Tarea #25 — Contradicción documentada, estado mantenido  
**Cambio:** Estado permanece `Propuesto`. Se agregó bloque de contradicción al inicio del documento.  
**Fundamento:** Decisión aprobada #9 — "Inngest NO se utilizará obligatoriamente para todos los procesos." Contradice el ADR que lo declara "motor principal obligatorio". Revisar en Fase 8.

### 2.6 `docs/architecture/decisions/ADR-004-ai-provider-abstraction.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Compatible con modelo híbrido (Decisión #5) — la abstracción AIProvider es ortogonal al motor de automatización.

### 2.7 `docs/architecture/decisions/ADR-005-monorepo-structure.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Compatible con migración incremental (Decisión #1) — npm Workspaces permite coexistencia de dashboard legado y nueva app Next.js.

### 2.8 `docs/architecture/decisions/ADR-006-multi-tenancy.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Alineado con Decisión #3 (Supabase) y Decisión #5 (modelo híbrido) — RLS es una característica nativa de Supabase.

### 2.9 `docs/architecture/decisions/ADR-007-storage-strategy.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Compatible con Decisión #5 (modelo híbrido Git + Supabase) y Decisión #4 (`.agencia-ai/` en Git).

### 2.10 `docs/architecture/decisions/ADR-008-migration-strategy.md`
**Razón:** Tarea #25  
**Cambio:** `**Estado:** Propuesto` → `**Estado:** Aceptado`  
**Fundamento:** Perfectamente alineado con Decisiones #1 (migración incremental), #6 (dashboard sigue funcionando), #7 (n8n temporal), #8 (workflows migran individualmente). El patrón Strangler Fig es exactamente lo que las decisiones aprobadas describen.

---

## 3. ARCHIVOS INSPECCIONADOS (sin modificación)

| Directorio | Archivos | Propósito de inspección |
|-----------|---------|------------------------|
| `backups/n8n-workflows/` | 4 JSON | Búsqueda de credenciales embebidas |
| `shared-data/` | 25 JSON | Búsqueda de PII, datos financieros, account IDs |
| `agency-dashboard/.env` | 1 | Inventario de variables reales (no versionado) |
| `n8n-local/.env` | 1 | Inventario de variables n8n (no versionado) |
| `agency-dashboard/src/` | ~15 | Verificación de imports y typecheck |
| `agency-dashboard/server/` | ~8 | Verificación de endpoints y configuración |
| `.agencia-ai/clients/*/` | ~6 | Verificación de datos de clientes en documentos markdown |
| `docs/audit/` | 8 | Lectura de auditorías de Fase 2 |
| `docs/architecture/` | 14 | Lectura de documentos de arquitectura de Fase 3 |

---

## 4. COMANDOS EJECUTADOS

| Comando | Directorio | Propósito | Resultado |
|---------|-----------|----------|----------|
| `git status` | `agency-dashboard/` | Estado de git | 9 modified, 5 untracked |
| `git log --oneline -5` | `agency-dashboard/` | Historial de commits | Último: `a463fc6` |
| `git diff --stat HEAD` | `agency-dashboard/` | Cambios no commiteados | 9 archivos, +1,377 líneas |
| `git diff --name-only HEAD` | `agency-dashboard/` | Nombres de archivos modificados | 9 archivos listados |
| `git log --all --oneline --follow -- .env` | `agency-dashboard/` | Historial de .env | Sin resultados — nunca commiteado ✅ |
| `find . -name "*.env*"` | `BopIAgency/` | Localizar archivos .env | 2 encontrados (ninguno en git) |
| `grep -r "password\|secret\|token\|key" ...` | varios | Escaneo de secretos | 15 hallazgos documentados |
| `tsc --noEmit` | `agency-dashboard/` | Verificación de tipos | 0 errores, 0 advertencias ✅ |
| `ls node_modules/.bin/eslint` | `agency-dashboard/` | Verificar ESLint | No instalado |
| `node --version && npm --version` | sistema | Versiones de runtime | Node v22.22.3, npm 10.9.8 |
| `cat shared-data/**/*.json` | `BopIAgency/` | Inspección de datos de runtime | PII y financieros encontrados |
| `cat backups/n8n-workflows/*.json` | `BopIAgency/` | Inspección de workflows | Sin credenciales embebidas |

---

## ADDENDUM — 2026-07-29: CORRECCIÓN W-03 Y CIERRE DE FASE 0

### A.1 Corrección del bug W-03 (Magic Bungalow)

**Workflow corregido:** `META - Sincronizar Métricas - Magic Bungalow`  
**Fecha de ejecución manual:** 2026-07-29  
**Resultado:** Workflow executed successfully — todos los nodos en verde.

Correcciones aplicadas en n8n:

| Nodo | Corrección |
|------|-----------|
| `Configurar Cliente` | clientId=`magic-bungalow`, accountId=`act_800960387807740`, accountName=`Glampings, hotel y cabaña Magic Bungalow Villa de Leyva` |
| `Construir JSON Meta` | Eliminados valores fijos de Legalink. Ahora usa valores dinámicos de `Configurar Cliente` |
| `Read/Write Files from Disk` | Ruta corregida a `=/shared-data/metrics/clients/{{ $('Configurar Cliente').first().json.clientId }}/periods/...` |
| `Registrar ejecución exitosa` | workflowName=`META - Sincronizar Métricas - Magic Bungalow`, clientId=`magic-bungalow` |

### A.2 Backup actualizado

El workflow corregido fue descargado desde n8n y guardado como:  
`backups/n8n-workflows/META - Sincronizar Métricas - Magic Bungalow.json`  
Fecha de modificación del archivo: 2026-07-29T18:58:25.

### A.3 Verificación del archivo de métricas 2026-07.json

Archivo creado: `shared-data/metrics/clients/magic-bungalow/periods/2026-07.json`  
Metadatos verificados: clientId=`magic-bungalow`, accountId=`act_800960387807740`, accountName correcto, currency=COP, timezone=America/Bogota.  
Estado de datos: campaigns vacía, métricas en 0.

### A.4 Bug residual detectado — W-03b (NUEVO)

Durante la verificación del backup actualizado se detectó que los nodos de llamada a la API Meta (`Meta - Métricas de campaña` y `Meta - Métricas de Cuenta`) siguen con URLs hardcodeadas usando `act_906768512465553` (Legalink). La corrección de W-03 actualizó la identidad y el registro, pero no los nodos de extracción de datos. Ver `docs/security/PHASE_0_CLOSURE.md` sección 1.2.

### A.5 Contaminación histórica confirmada

Se confirmaron 4 archivos contaminados en la carpeta de Magic Bungalow con datos de Legalink:
- `shared-data/metrics/clients/magic-bungalow/periods/2026-06.json` (clientId=`legalink-col`)
- `shared-data/reports/clients/magic-bungalow/monthly/2026-06.json` (source.accountId de Legalink)
- `shared-data/reports/clients/magic-bungalow/weekly/2026-W25.json` (source.accountId de Legalink)
- `shared-data/reports/clients/magic-bungalow/weekly/2026-W27.json` (source.accountId de Legalink)

Causa raíz adicional: el backup del workflow Legalink Colombia (2026-06-22) tiene el nodo `Read/Write Files from Disk` con ruta hardcodeada a `magic-bungalow/`. Este bug simétrico es el origen de la contaminación de junio.

### A.6 Riesgos residuales pendientes antes de Fase 1

| ID | Riesgo | Prioridad |
|----|--------|-----------|
| W-03b | URLs de API Meta con account ID de Legalink en workflow Magic Bungalow | 🔴 Crítica |
| W-02b | Bug simétrico en workflow Legalink Colombia (ruta escribe en magic-bungalow/) | 🔴 Crítica |
| DATA-01 | 4 archivos de datos históricos de Magic Bungalow contaminados con datos de Legalink | 🟡 Media |

### A.7 Veredicto (primera verificación)

⚠️ **Fase 0 cerrada con observaciones.** Backup de MB desactualizado; W27 aún contaminado; W-03b pendiente de verificación en backup.

---

## ADDENDUM 2 — 2026-07-29: CIERRE DEFINITIVO

### B.1 Corrección W-03b verificada por evidencia de datos

Los archivos de métricas de Magic Bungalow confirman que el workflow fue corregido y ejecutó contra la cuenta correcta:
- `magic-bungalow/periods/2026-07.json` (mtime: 19:40) — 55 campañas, `act_800960387807740` ✅
- `magic-bungalow/periods/2026-06.json` (mtime: 21:43) — 55 campañas, `act_800960387807740` ✅

El backup en disco (mtime: 18:58) sigue siendo anterior a la ejecución corregida y no ha sido re-descargado.

### B.2 Corrección W-02b verificada en backup

El backup de Legalink Colombia (mtime: 19:29) tiene URLs dinámicas y ruta correcta. Cero referencias a Magic Bungalow. ✅

### B.3 Métricas regeneradas — verificación completa

| Archivo | Estado |
|---------|--------|
| `magic-bungalow/periods/2026-06.json` | ✅ Limpio — 55 campañas, `act_800960387807740` |
| `magic-bungalow/periods/2026-07.json` | ✅ Limpio — 55 campañas, `act_800960387807740` |
| `legalink-col/periods/2026-07.json` | ✅ Correcto — `act_906768512465553`, sin refs a MB |

### B.4 Reportes regenerados — verificación completa

| Archivo | Estado |
|---------|--------|
| `magic-bungalow/monthly/2026-06.json` | ✅ Limpio — `act_800960387807740` |
| `magic-bungalow/weekly/2026-W25.json` | ✅ Limpio — `act_800960387807740` |
| `magic-bungalow/weekly/2026-W26.json` | ✅ Limpio — nunca contaminado |
| `magic-bungalow/weekly/2026-W27.json` | 🔴 **AÚN CONTAMINADO** — archivo idéntico al de cuarentena (mismo MD5). No fue reemplazado. |

### B.5 Cuarentena verificada

5 archivos en `shared-data/quarantine/magic-bungalow-contaminated/`. Los 4 archivos contaminados originales están correctamente aislados. El `2026-07-CONTAMINATED.json` fue quarantineado preventivamente con metadatos correctos (versión intermedia del proceso).

### B.6 Riesgos residuales al cierre

| ID | Riesgo | Severidad |
|----|--------|-----------|
| R-01 | Backup MB desactualizado en disco | 🟡 Media |
| R-02 | `reports/magic-bungalow/weekly/2026-W27.json` aún contaminado en producción | 🟡 Media |
| R-04 | 9 archivos sin commit en `agency-dashboard/` | 🟡 Media |
| R-05 | `N8N_ENCRYPTION_KEY` pendiente de rotación | 🟡 Media |

### B.7 Veredicto definitivo

✅ **Fase 0 cerrada.** Ver `docs/security/PHASE_0_CLOSURE.md` (versión 2.0) para el veredicto completo.

---

## 5. HALLAZGOS CRÍTICOS

| ID | Hallazgo | Acción tomada | Acción pendiente |
|----|---------|--------------|-----------------|
| S-01 | `N8N_ENCRYPTION_KEY` en `n8n-local/.env` | `.gitignore` raíz protege el archivo | Rotar la clave en próximo reinicio planificado de n8n (Francisco) |
| S-02 | `N8N_API_KEY` JWT en `agency-dashboard/.env` | No versionado ✅ | Rotar cuando n8n se migre (Fase 8) |
| S-03/04/05 | 3 API keys internas de Express en `.env` | No versionadas ✅ | Reemplazar por Supabase Auth en Fase 4 |
| S-11 | Nombre personal "Francisco Roncallo Nader" en métricas 2026-07 | Documentado | Verificar si la cuenta Meta `act_42577810` es personal |
| S-12 | Email `f.roncallo@gmail.com` en report-recipients | `.gitignore` raíz protege el archivo | Migrar a Supabase + usar email de agencia |
| BUG-W03 | Workflow Magic Bungalow usa datos de Legalink (CLIENT_ID='legalink-col') | Documentado en N8N_BACKUP_SECURITY_REVIEW | Francisco debe corregir el workflow en n8n y re-sincronizar métricas de junio |

---

## 6. ACCIONES QUE REQUIEREN APROBACIÓN HUMANA

Las siguientes acciones fueron identificadas pero NO ejecutadas en Fase 0. Requieren decisión explícita de Francisco:

| Acción | Riesgo si no se ejecuta | Fase sugerida |
|--------|------------------------|--------------|
| Rotación de `N8N_ENCRYPTION_KEY` | Si alguien accede al archivo `.env`, puede descifrar todas las credenciales de n8n | Antes de Fase 1 |
| Rotación de `N8N_API_KEY` | Acceso no autorizado a la API de n8n | Antes de Fase 8 |
| Corrección del bug en workflow W-03 (Magic Bungalow) | Las métricas de Magic Bungalow de junio son incorrectas | Inmediatamente (antes de Fase 1) |
| Verificar si `act_42577810` es cuenta personal o de cliente | Si es personal, los datos de julio mezclan gasto personal con gasto de cliente | Inmediatamente |
| Confirmar que n8n NO está expuesto a internet (puerto 5678) | Si está expuesto, el webhook UUID de ALERTAS puede dispararse externamente | Verificar ahora |
| Agregar `shared-data/` al `.gitignore` raíz | Si se inicializa git en raíz, los datos operacionales con PII podrían commitearse | Antes de `git init` en raíz |
| Committear los cambios pendientes en `agency-dashboard/` | 1,377 líneas de trabajo no versionado — riesgo de pérdida | Antes de Fase 1 |

---

## 7. TAREAS DIFERIDAS (no ejecutadas en Fase 0)

| Tarea | Razón de diferimiento | Fase sugerida |
|-------|----------------------|--------------|
| Instalar ESLint | Prohíbe modificar `package.json` en Fase 0 | Fase 1 |
| Ejecutar `vite build` | Fuera del alcance de Fase 0 | Antes de Fase 1 |
| Configurar Vitest | Requiere modificar `package.json` | Fase 1 |
| Eliminar 12 directorios vacíos | Prohíbe eliminar archivos en Fase 0 | Fase 1 |
| Consolidar git en raíz de BopIAgency/ | Requiere `git init` + revisión de scope | Fase 1 |
| Migrar `shared-data/` a Supabase | Requiere crear esquema y ejecutar SQL | Fases 3-9 |

---

## 8. VERIFICACIÓN FINAL

### 8.1 Archivos de seguridad creados

| Archivo | Existe |
|---------|-------|
| `docs/security/SECRET_SCAN_REPORT.md` | ✅ |
| `docs/security/ENVIRONMENT_VARIABLE_INVENTORY.md` | ✅ |
| `docs/security/GENERATED_FILES_CLASSIFICATION.md` | ✅ |
| `docs/security/N8N_BACKUP_SECURITY_REVIEW.md` | ✅ |
| `docs/security/SHARED_DATA_SECURITY_REVIEW.md` | ✅ |
| `docs/security/TECHNICAL_BASELINE.md` | ✅ |
| `docs/security/PHASE_0_CHANGELOG.md` | ✅ (este archivo) |

### 8.2 Estado final de ADRs

| ADR | Estado |
|-----|--------|
| ADR-001 (Next.js) | ✅ Aceptado |
| ADR-002 (Supabase) | ✅ Aceptado |
| ADR-003 (Inngest) | ⚠️ Propuesto — contradicción con Decisión #9 documentada |
| ADR-004 (Claude API) | ✅ Aceptado |
| ADR-005 (npm Workspaces) | ✅ Aceptado |
| ADR-006 (RLS multi-tenancy) | ✅ Aceptado |
| ADR-007 (Storage) | ✅ Aceptado |
| ADR-008 (Strangler Fig) | ✅ Aceptado |

### 8.3 Restricciones de Fase 0 — Cumplimiento

| Restricción | Cumplida |
|------------|---------|
| ❌ No instalar Next.js | ✅ No instalado |
| ❌ No crear monorepo | ✅ No creado |
| ❌ No instalar Supabase | ✅ No instalado |
| ❌ No instalar Inngest | ✅ No instalado |
| ❌ No crear migraciones SQL | ✅ No creadas |
| ❌ No ejecutar SQL | ✅ No ejecutado |
| ❌ No modificar package.json | ✅ No modificado |
| ❌ No actualizar paquetes | ✅ No actualizados |
| ❌ No eliminar archivos | ✅ Ninguno eliminado |
| ❌ No mover archivos | ✅ Ninguno movido |
| ❌ No reescribir Git | ✅ Historial intacto |
| ❌ No hacer commit | ✅ Sin commits |
| ❌ No hacer push | ✅ Sin push |
| ❌ No revocar credenciales | ✅ Sin revocaciones |
| ❌ No modificar secretos reales | ✅ Sin modificaciones |
| ❌ No detener n8n | ✅ n8n no tocado |
| ❌ No modificar workflows | ✅ Workflows intactos |
| ❌ No cambiar el dashboard | ✅ Dashboard sin cambios |
| ❌ No implementar funcionalidades nuevas | ✅ Sin implementaciones |

---

*Fase 0 completada el 2026-07-29.*
