# MIGRATION RISKS
## BopIAgency — Riesgos de Migración
**Fecha:** 2026-07-29

---

## MATRIZ DE RIESGOS

| ID | Riesgo | Probabilidad | Impacto | Severidad | Mitigación |
|----|--------|-------------|---------|-----------|-----------|
| R-01 | Pérdida de credenciales de n8n durante migración | Media | Crítico | 🔴 Alta | Exportar tokens antes de migrar |
| R-02 | N8N_ENCRYPTION_KEY en texto plano en el repo | Alta | Alto | 🔴 Alta | Rotar la clave inmediatamente |
| R-03 | Sin tests — imposible verificar equivalencia funcional | Alta | Alto | 🔴 Alta | Escribir tests antes de migrar |
| R-04 | Inconsistencia de schemas entre clientes | Media | Medio | 🟠 Media | Normalizar todos los JSON antes de migrar a Supabase |
| R-05 | Pérdida de historial de ejecuciones de n8n | Alta | Bajo | 🟡 Baja | Exportar historial antes de apagar n8n |
| R-06 | host.docker.internal no funciona en Linux | Alta (si se despliega en Linux) | Alto | 🟠 Media | Ya no aplica en Next.js — el riesgo se resuelve |
| R-07 | Sin autenticación de usuarios — cualquiera con acceso a la URL puede ver datos | Alta | Crítico | 🔴 Alta | Implementar Supabase Auth desde el primer PR |
| R-08 | CORS hardcodeado rompe en staging/producción | Alta | Alto | 🔴 Alta | Configurar CORS vía env vars en Next.js |
| R-09 | Sin .gitignore en raíz — .env puede commitarse | Media | Alto | 🟠 Media | Crear .gitignore raíz antes de primer commit |
| R-10 | Meta Access Token puede expirar durante migración | Media | Alto | 🟠 Media | Verificar token de larga duración antes de migrar |
| R-11 | bop-soluciones NO está en shared-data — datos incompletos | Alta | Medio | 🟠 Media | Decidir qué hacer con bop-soluciones antes de migrar |
| R-12 | El routing manual sin React Router puede ocultar bugs de navegación | Media | Bajo | 🟡 Baja | Next.js App Router reemplaza todo el routing |
| R-13 | task-actions.jsonl crecimiento ilimitado | Baja | Bajo | 🟡 Baja | Migrar a tabla en Supabase con paginación |
| R-14 | Dos formatos de integrations.json coexistiendo | Alta | Medio | 🟠 Media | Normalizar durante migración de datos |
| R-15 | Sin schema de base de datos definido — riesgo de diseño incorrecto | Media | Alto | 🟠 Media | Revisar y aprobar el schema propuesto antes de implementar |

---

## RIESGOS DE SEGURIDAD DETALLADOS

### R-02: N8N_ENCRYPTION_KEY en texto plano

**Archivo:** `n8n-local/.env`  
**Valor expuesto:** `N8N_ENCRYPTION_KEY=sh3faGEVNHgPcWUj4F5ST8AJzQ1lO6uYnvDBLiIyZ7mboC2XKkpdxrMwqt0eR9`

**Riesgo:** Si este archivo está o estuvo en git, cualquier persona con acceso al historial puede descifrar las credenciales de Meta y Gmail almacenadas en n8n.

**Acciones inmediatas:**
1. Verificar si `n8n-local/.env` está en `.gitignore` (actualmente hay `.gitignore` solo en `agency-dashboard/`, no en raíz)
2. Si estuvo en git, rotar la clave (`N8N_ENCRYPTION_KEY`), lo que requiere re-configurar todas las credenciales en n8n
3. Rotar el Meta Access Token y el Gmail OAuth2

---

### R-07: Sin autenticación de usuarios

**Contexto:** El dashboard Express en `127.0.0.1:3101` solo está accesible localmente. Pero en la migración a Next.js con Supabase, la app estará en internet.

**Riesgo en producción:** Todos los datos de clientes, métricas, reportes y alertas estarán accesibles sin autenticación.

**Mitigación obligatoria:** Implementar Supabase Auth con middleware de Next.js como primera tarea del sprint 1 de desarrollo.

---

### R-01: Pérdida de credenciales de n8n

**Contexto:** Las credenciales de Meta Ads y Gmail están almacenadas en el volumen Docker `n8n_data`, cifradas con `N8N_ENCRYPTION_KEY`. Si el volumen se borra o la clave cambia, se pierden.

**Acciones antes de migrar:**
1. Documentar todas las credenciales configuradas en n8n (nombres, tipos)
2. Extraer el Meta Access Token desde n8n o desde Meta Business Manager
3. Regenerar OAuth2 de Gmail para las nuevas integraciones en Next.js

---

## RIESGOS TÉCNICOS DETALLADOS

### R-03: Sin tests

**Impacto:** No hay manera de verificar que los Inngest functions producen el mismo resultado que los workflows de n8n. No hay manera de verificar que los endpoints de Next.js devuelven los mismos datos que los de Express.

**Plan de mitigación:**
- Escribir tests de integración sobre la Express API actual (golden tests) antes de migrar
- Usar los resultados como baseline para comparar con la nueva implementación

---

### R-04: Inconsistencia de schemas entre clientes

**Problema específico:**

| Cliente | integrations.json formato |
|---------|--------------------------|
| `_template-client` | `{ connections: { metaAds: {...}, ... } }` (objeto con todas las plataformas) |
| `cliente-prueba` | `{ connections: { metaAds: {...}, ... } }` (template nuevo) |
| `legalink-col` | `{ clientId: "...", integrations: [] }` (formato antiguo) |
| `magic-bungalow` | `{ clientId: "...", integrations: [] }` (formato antiguo) |
| `bop-soluciones` | Sin `integrations.json` detectado |
| `the-industrial-depot` | Sin `integrations.json` detectado |

**Mitigación:** Script de migración que normalice todos al formato del template antes de insertar en Supabase.

---

### R-11: bop-soluciones — cliente huérfano

**Problema:** `bop-soluciones` existe en `.agencia-ai/clients/` con documentos ricos (brand profile, buyer personas, estrategia de 30 días, guiones de reels, etc.) pero **no está en `shared-data/clients-index.json`** — no tiene el archivo `.ready` o el flujo de escaneo nunca lo indexó.

Sus métricas están en `.agencia-ai/clients/bop-soluciones/metrics.json` con un formato distinto a `MonthlyMetrics`.

**Decisión requerida:**
- ¿Migrar bop-soluciones a la nueva app como cliente activo?
- ¿Es BOP Soluciones la propia agencia? En ese caso, requiere un tratamiento especial (cliente "interno")

---

### R-15: Diseño de schema de Supabase

**Riesgo:** Si el schema de Supabase se diseña incorrectamente al inicio, las migraciones posteriores serán costosas.

**Riesgos específicos de diseño:**
- `metrics` como JSONB vs. columnas separadas (afecta queries de agregación)
- Multi-tenancy: `organization` vs. `user` como nivel superior de aislamiento
- Cómo modelar las ejecuciones de agentes AI (historial de prompts/respuestas)
- Row Level Security (RLS): qué nivel de granularidad implementar

---

## RIESGOS DE NEGOCIO

### Continuidad operativa durante migración

**Riesgo:** Durante la migración, si n8n se apaga, las métricas de Meta Ads dejan de sincronizarse y las alertas dejan de enviarse.

**Plan:**
- Mantener n8n operativo hasta que Inngest esté probado en staging
- Migrar un cliente a la vez en producción
- Definir un rollback plan: los archivos JSON son la fuente de verdad — siempre se puede volver a leerlos

---

### Dependencia de Meta Graph API v25.0

**Riesgo:** Meta depreca versiones de la Graph API regularmente. La v25.0 puede quedar obsoleta.

**Mitigación:** En la implementación de Inngest, abstraer el cliente de Meta API para facilitar upgrades.

---

## RIESGOS DE DEUDA TÉCNICA HEREDADA

### Sin ESLint ni Prettier

El código TypeScript actual no tiene linting ni formateo automático. Esto significa que puede haber code smells o patterns incorrectos que serán difíciles de identificar sin revisión manual.

**Mitigación:** Configurar ESLint + Prettier como parte del setup inicial del nuevo proyecto Next.js (no herencia).

---

### React sin React Router

El routing manual con `window.history.pushState` no es detectable por herramientas de análisis de rutas. En la migración a Next.js App Router, todas las rutas deben ser redefinidas conscientemente.

**Rutas actuales identificadas:**
- `/` — SummaryPage
- `/reports` — ReportsPage
- `/automations` — AutomationsPage
- Estado de tabs en `activeTab` (sin URL): clientes, tareas, métricas, alertas

---

## CHECKLIST PRE-MIGRACIÓN

- [ ] Verificar que `n8n-local/.env` NO está en el historial de git
- [ ] Rotar `N8N_ENCRYPTION_KEY` si estuvo en git
- [ ] Exportar Meta Access Token de n8n credentials
- [ ] Exportar configuración Gmail OAuth2
- [ ] Crear `.gitignore` en la raíz del repositorio
- [ ] Verificar que `agency-dashboard/.env` NO está commiteado
- [ ] Documentar Account ID de Meta Ads de magic-bungalow
- [ ] Decidir el rol de bop-soluciones en la nueva app
- [ ] Normalizar `integrations.json` de legalink-col y magic-bungalow
- [ ] Exportar historial de ejecuciones de n8n si se quiere preservar
- [ ] Escribir al menos tests smoke de la Express API como baseline
- [ ] Aprobar schema de Supabase antes de empezar implementación

---

*Generado automáticamente el 2026-07-29 como parte de la auditoría de modernización BopIAgency.*
