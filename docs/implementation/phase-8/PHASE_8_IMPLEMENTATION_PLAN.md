# Phase 8 — Campaign Operations & Distribution — Plan de implementación

**Rama:** `feat/phase-8-campaign-operations`
**Base:** `a8025ec` (Phase 7 cerrada y mergeada a `main`)
**Estado general de Phase 8:** en curso — 8A.0 completada; 8A (audit +
arquitectura) completada — ver
`docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md`; **8A.1
(Activation Domain + Persistence) COMPLETE** — implementada, migración
aplicada contra Supabase LOCAL, y validada en runtime real (Rounds A–E,
repetibilidad de 2 corridas consecutivas probada) — ver
`docs/implementation/phase-8/PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md`
secciones 26–31; **8A.2 (Activation Application Use Cases +
Authorization/Signals Integration) COMPLETE** — 7 use cases de escritura
(A–G) + 4 use cases de lectura implementados sobre la persistencia de
8A.1, matriz de roles reforzada en application (defensa en profundidad
sobre las RPCs), señal best-effort post-commit acotada a la creación de
activation (sin inventar side effects nuevos) — ver
`docs/implementation/phase-8/PHASE_8A2_APPLICATION_USE_CASES_REPORT.md`;
**8A.3 (Web Integration + Manual Operations UI) COMPLETE** — Server
Actions + composition root expone los 11 use cases de 8A.2, ruta
`/campaigns/[id]/activation` con resumen/targets/timeline/cancelación,
integración en Campaign Studio (§6), operación manual end-to-end (crear →
agregar canal manual → preparar → listo → publicado/cancelar) sin ninguna
llamada a proveedor externo — ver
`docs/implementation/phase-8/PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md`.
**8A queda COMPLETA en su totalidad** (8A.1 + 8A.2 + 8A.3); **8B.0 (Publishing Gateway — Audit + Architecture) COMPLETE** — ver `docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md` (diseño del modelo de datos de publicación, state machine de job con `unknown_outcome`, `ChannelPublisherPort`, orquestación job+n8n+reconciliación, sin código ni migración).

> Regla de producto heredada de Phase 7 y vigente para toda Phase 8: **NO
> publicación externa real** (Meta Ads, Google Ads, YouTube, email
> marketing, redes sociales) hasta que una subfase lo autorice explícita y
> gradualmente, con owner humano y confirmación explícita en cada paso. Ver
> el detalle de alcance de publicación en cada subfase abajo — por defecto,
> toda subfase hasta que se diga lo contrario es **modelo + UI + validación
> interna**, no una integración real con proveedores externos.

## Roadmap

### 8A.0 — Branding & Theming Foundation — ✅ COMPLETA
- **Objetivo:** capa visual corporativa coherente (paleta de marca, logo,
  sidebar/topbar/auth recoloreados) antes de continuar con Campaign
  Operations. Sin rediseño total, sin cambios de arquitectura/navegación/
  lógica funcional.
- **Entregable:** `docs/implementation/phase-8/PHASE_8A0_BRANDING_THEME_REPORT.md`.
- **Estado:** ✅ **COMPLETA**. (sin cambios respecto a la versión anterior
  de este documento).

### 8A — Campaign Activation Model
- **Objetivo:** modelar el dominio de "activación" de una campaña
  aprobada — la frontera explícita y auditable entre `campaign approved` y
  la ejecución externa/manual, sin ejecutar ninguna publicación real. Es la
  base de datos/dominio que 8B–8G consumirán.
- **Estado de la subfase de AUDIT + ARQUITECTURA:** ✅ **COMPLETA** —
  entregable: `docs/implementation/phase-8/PHASE_8A_ACTIVATION_AUDIT.md`
  (auditoría de código real de Campaigns/Clients-Integrations/Automation
  runtime/Tasks-Alerts/n8n/legacy Meta-Google; aggregate propuesto
  `CampaignActivation` + `CampaignActivationTarget` +
  `CampaignActivationEvent`; snapshot inmutable del contenido aprobado;
  status machine de 3 niveles; modelo multi-canal cerrado; camino manual
  de primera clase; idempotencia vía constraints DB; auditabilidad vía
  event log append-only; seguridad/tenancy con triggers + RPCs
  `SECURITY DEFINER` (mismo patrón que `approve_campaign`); matriz de
  roles; propuesta de tablas (sin migración); RLS conceptual; use cases;
  contratos de repositorio; arquitectura de UI; relación con Phase 6
  runtime (`AutomationExecution`, deliberadamente NO reutilizada como
  tabla/state machine); relación con Phase 7 (approval boundary, no
  auto-creación de activation al aprobar); diseño del futuro
  `ChannelPublisherPort` (8B, sin implementar); taxonomía de errores;
  observabilidad vía `tasks`/`alerts` existentes). **Ningún código,
  migración, entidad, use case, componente ni Server Action fue creado en
  esta ronda.**
- **Subfases de implementación derivadas de 8A (a ejecutar en orden,
  cada una requiere aprobación explícita del usuario antes de empezar):**
  - **8A.1 — Activation Domain + Persistence**: ✅ **COMPLETE** (ver
    `PHASE_8A1_ACTIVATION_DOMAIN_PERSISTENCE_REPORT.md`) — entidades de
    dominio (`CampaignActivation`, `CampaignActivationTarget`,
    `CampaignActivationEvent`) + funciones puras de transición de status
    (3 niveles) + `deriveActivationStatus`, migración aditiva de las 3
    tablas propuestas en el audit §15 (con 5 RPCs `SECURITY DEFINER` de
    transición crítica — el audit mencionaba 3, el diseño final usó 5:
    prepare/ready/published/cancelTarget/cancelActivation, sin desviación
    de fondo), RLS (audit §16), repositorios de infraestructura (audit
    §18). Migración **aplicada contra Supabase LOCAL** y **validada en
    runtime real** (Rounds A–E: 32 aserciones de comportamiento runtime
    con verificación semántica del motivo exacto de rechazo en cada caso
    negativo, repetibilidad de 2 corridas consecutivas sin limpieza
    manual, sin ningún defecto encontrado en la migración misma — ver
    reporte secciones 26–27). 1012 tests pasando en `packages/shared` +
    `packages/domain` + `packages/infrastructure` (typecheck/lint limpios
    en los 3), revisión de seguridad de 10 puntos sin hallazgos (reporte
    sección 30). 11.3 (piso de rol operator) queda como limitación
    estructural no bloqueante por falta de fixture de usuario local
    disponible — ver reporte sección 22.
  - **8A.2 — Activation Application Use Cases + Authorization / Signals
    Integration**: ✅ **COMPLETE** (ver
    `PHASE_8A2_APPLICATION_USE_CASES_REPORT.md`) — capa de aplicación
    sobre la persistencia de 8A.1. Implementado: (1)
    `createCampaignActivation` — único punto autorizado para construir un
    `CampaignActivationSnapshot` real desde una `Campaign`/
    `CampaignApproval` reales (incluye el `generatedContent` real de la
    campaña, congelado, cuando existe y matchea el schema de Phase 7D —
    corregido en esta ronda, ver reporte §"generatedContent"), con
    re-verificación explícita de `campaign.status === 'approved'` en
    application (defensa en profundidad sobre el trigger `check_activation
    _source`), nunca disparado automáticamente desde `approveCampaign`;
    (2) `addCampaignActivationTarget` (rol mínimo strategist+, valida par
    channel/provider cerrado — nunca un string arbitrario) y los 4 use
    cases de transición de target (`prepareActivationTarget`/
    `markActivationTargetReady`/`markActivationTargetPublished`, rol
    mínimo operator+; `cancelActivationTarget`, rol mínimo strategist+) y
    de activation (`cancelCampaignActivation`, rol mínimo strategist+),
    todos wrappers delgados sobre `CampaignActivationRepository` que
    delegan las transiciones críticas a las 5 RPCs `SECURITY DEFINER` de
    8A.1 (la RPC sigue siendo la autoridad final); (3) 4 use cases de
    lectura pura (`getCampaignActivation`, `listCampaignActivationsBy
    Campaign`, `listCampaignActivationsByClient`,
    `getActivationWithTargetsAndEvents`) — cualquier rol miembro,
    NUNCA mutan `tasks`/`alerts`; (4) integración de señales best-effort,
    post-commit, acotada deliberadamente: SOLO `createCampaignActivation`
    crea una tarea operativa ("Configurar y publicar canales de
    activación"), con dedupe por `activationId`; cancelación de
    activation/target y las transiciones de target NO generan ninguna
    alerta/tarea nueva (decisión de producto documentada explícitamente en
    `activation-signals.ts` y en el reporte — no se inventa un side effect
    solo para usar la capa de señales); (5) autorización end-to-end en
    application (rol mínimo por use case, nunca solo BD) para los 7 use
    cases de escritura. `removeActivationTarget` (mencionado en la versión
    anterior de este plan) NO se implementó como use case de aplicación en
    esta ronda — no forma parte del alcance A–G confirmado con el usuario
    para 8A.2 (el método de repositorio ya existe en 8A.1 para 8A.3/8D si
    se necesita). Sigue explícitamente fuera de 8A.2: cualquier UI (8A.3),
    cualquier publicación externa real (8B+), `AutomationExecution`,
    `publication_jobs`, n8n, transición automática `campaign approved` →
    `activation`/`campaign.status = 'active'`.
  - **8A.3 — Activation UI / Manual Activation**: ✅ **COMPLETE** (ver
    `PHASE_8A3_WEB_MANUAL_OPERATIONS_REPORT.md`) — composition root
    (`activation.composition.ts`) + 11 Server Actions (7 escritura + 4
    lectura) sobre los use cases de 8A.2; ruta
    `/campaigns/[id]/activation` (sin `[activationId]` — desviación
    deliberada y documentada en el reporte §1: el índice único parcial de
    8A.1 garantiza como máximo una activación NO-terminal por campaña, así
    que "la activación de esta campaña" no necesita un ID en la URL; el
    historial de activaciones terminales se muestra en la misma página) con
    resumen (A), tabla de targets (B), workflow manual completo — agregar
    canal manual, preparar, marcar listo, marcar publicado, cancelar (C) —,
    cancelación de la activación completa con razón obligatoria y
    confirmación en dos pasos (D), y timeline de eventos append-only (E);
    integración en Campaign Studio (`CampaignActivationEntryCard` en
    `/campaigns/[id]`, §6) sin auto-crear activación al aprobar ni cambiar
    `campaign.status`; matriz de roles reforzada en dos capas (Server
    Action + use case, ninguna nueva) exactamente igual a la definida en
    8A.2; "marcar publicado" documentado como confirmación manual en cada
    capa (Server Action, UI, composition root) — nunca una llamada real a
    Meta/Google/LinkedIn/email, verificado también por un test que audita
    el código fuente en busca de imports/strings de proveedor. 43 tests
    nuevos (6 archivos) cubriendo matriz de roles, actor spoofing,
    transición inválida, duplicado, cancelación con razón, y los tres
    estados (empty / historial terminal / nueva activación tras terminal).
    Esta subfase absorbe funcionalmente lo que el roadmap anterior llamaba
    **8D "Manual Activation"** — ver nota de resolución de solapamiento
    abajo. `removeActivationTarget` sigue sin exponerse como Server Action
    (fuera de alcance de 8A.2, por lo tanto de 8A.3 — ver reporte §12).
- **Explícitamente fuera de alcance de TODA la subfase 8A (incluidas
  8A.1/8A.2/8A.3):** cualquier llamada real a un proveedor externo,
  cualquier implementación de `ChannelPublisherPort`, cualquier escritor
  de `client_integrations`.

### 8B — Publishing Gateway — Estado de la subfase de AUDIT +
  ARQUITECTURA: ✅ **COMPLETA (8B.0)** — entregable:
  `docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md`
  (auditoría de código real de Phase 8A/6/7 + client_integrations +
  n8n/webhooks; confirma `ChannelPublisherPort` como nombre de puerto
  (audit 8A §22, no reabierto); diseña el modelo de datos de publicación
  — `campaign_publication_jobs` / `campaign_publication_attempts` /
  `campaign_publication_events` / `campaign_publication_webhook_events`,
  ninguno de los cuales existía en el modelo de 8A — sin migración;
  state machine de job (`queued → claimed → in_progress → succeeded|
  failed|cancelled|unknown_outcome`, con `unknown_outcome` como adición
  central para prevenir publicación duplicada tras timeout); arquitectura
  de idempotencia (`publish:{orgId}:{targetId}:{retryCount}`,
  constraints únicos); contrato completo del puerto (`validateTarget`/
  `publish`/`getStatus`/`cancel`, con `PublishReceipt.outcome:
  'confirmed'|'unknown'`); arquitectura de adapters vía factory/registry
  (mismo patrón que `campaign-ai-provider.factory.ts` de Phase 7D, con
  divergencia justificada por resolución dinámica de credenciales
  multi-tenant); auditoría de `client_integrations` (confirma que hoy no
  puede representar credenciales reales de forma segura sin cambios de
  schema, y que el patrón `vault_reference`/Supabase Vault ya diseñado en
  `automation_secrets_metadata` — Phase 6B, sin escritor — es reutilizable
  en vez de inventar infraestructura de secretos nueva); recomendación de
  orquestación **job + n8n + reconciliación periódica**, con la regla no
  negociable de que la DB permanece la única autoridad de estado y n8n
  nunca lo es; modelo de coexistencia manual/externo (una sola entidad de
  target con enrutamiento, no dos modelos); matriz de roles extendida;
  modelo de fallo/reconciliación con la categoría `UNKNOWN_OUTCOME`
  explícita; diseño de señales reutilizando el patrón de dedupe de
  Phase 6F/7F/8A2; diseño de webhook/reconciliación (sin implementar)
  generalizando `/api/webhooks/n8n/route.ts` y `automation_webhook_events`;
  revisión de seguridad de 14 puntos; propuesta de DB/RLS (sin migración);
  4 preguntas abiertas para confirmación explícita antes de 8B.1 (rol de
  reconciliación manual, rol de cancelación in-progress, umbral de
  reconciliación periódica, alcance del primer webhook real en 8B.3).
  **Ningún código, migración, entidad, use case, componente ni Server
  Action fue creado en esta ronda.**
  - **Subfases de implementación derivadas de 8B (a ejecutar en orden,
    cada una requiere aprobación explícita del usuario antes de
    empezar, mismo criterio que 8A):**
    - **8B.1 — Publication Domain + Persistence**: entidades de dominio
      (`CampaignPublicationJob`, `CampaignPublicationAttempt`,
      `CampaignPublicationEvent`) + funciones puras de transición +
      migración aditiva de las 4 tablas propuestas en el audit §15 +
      RPCs `SECURITY DEFINER` de transición crítica + las 2 transiciones
      nuevas de `CampaignActivationTarget` (`markPublishing`/
      `markFailed`) + RLS. Sin adapters de proveedor real.
    - **8B.2 — Publication Application Orchestration**:
      `ChannelPublisherPort` como contrato (sin implementación real —
      adapter de prueba determinístico), factory/registry, use case
      `publishActivationTarget` (bifurcación manual/automatizado),
      retry/cancel/reconcile, integración de señales.
    - **8B.3 — Publishing Gateway Runtime**: transporte real hacia n8n
      para dispatch de jobs, endpoint `/api/webhooks/publishing/[provider]`,
      worker/cron de reconciliación periódica. Sin credenciales reales de
      ningún proveedor.
    - **8B.4 — Web Operations / Monitoring**: UI de jobs/attempts,
      vista de reconciliación manual, mapeo de errores de proveedor a la
      taxonomía cerrada.
  - **Explícitamente fuera de alcance de TODA la subfase 8B (incluida
    8B.0):** cualquier llamada real a Meta/Google/LinkedIn/email,
    cualquier credencial real, cualquier adapter de proveedor
    implementado — eso pertenece a 8E/8F.

### 8C — Content / Asset Calendar
- **Objetivo:** vista de calendario de contenido/activos asociados a
  campañas (fechas de publicación planeadas, no ejecutadas).

### 8D — Manual Activation Hardening *(redefinida — ver nota de
  solapamiento)*
- **Objetivo original (roadmap anterior):** "primer flujo de activación
  real, pero manual". **Este alcance funcional se movió a 8A.3** (ver
  nota abajo) porque el audit de 8A concluyó que crear una activation y
  marcarla publicada manualmente es UNA sola implementación del modelo de
  dominio, no dos fases separadas — el camino manual es de primera clase
  desde el diseño mismo de la entidad (audit §8), no un fallback
  posterior.
- **Objetivo redefinido:** *endurecimiento* operativo del camino manual ya
  funcional desde 8A.3 — checklist estructurado por tipo de cliente/canal
  (reemplazando el `readiness_checklist: jsonb` freeform del MVP), SLA/
  alertas de "publicación manual pendiente hace demasiado tiempo" (audit
  §25), acciones en bulk sobre múltiples targets. Se ubica después de
  8B/8C porque puede reutilizar patrones de observabilidad más maduros y
  porque no bloquea a 8E/8F.

### 8E — Meta Integration
- **Objetivo:** primera integración real con un proveedor externo (Meta
  Ads). Requiere aprobación explícita separada antes de conectar
  credenciales reales o hacer la primera llamada de publicación real —
  sigue el mismo patrón de "REGLA CRÍTICA DE PRODUCTO" usado en Phase 7
  para IA (nunca activar por accidente, siempre con guardas explícitas).
  Precondición documentada en el audit de 8A (§11/§23, riesgo R-ACT-14 del
  risk register): hoy `client_integrations` no tiene ningún escritor ni
  estrategia de refresh de token — 8E debe resolver esto antes de conectar
  credenciales reales.

### 8F — Google Integration
- **Objetivo:** análogo a 8E para Google Ads. Misma precondición de
  `client_integrations` que 8E.

### 8G — Activation Monitoring
- **Objetivo:** monitoreo del estado real de las campañas activadas
  (métricas de entrega, errores de proveedor) — reutilizando el patrón de
  `tasks`/`alerts` ya establecido en Phase 6/7 para side effects internos
  (y ya diseñado para activation en el audit de 8A §25), nunca inventando
  infraestructura nueva de notificación. También candidato natural para
  evaluar si conviene un módulo `/activations` cross-campaign (descartado
  en 8A.3 por falta de evidencia de necesidad, ver audit §19).

### 8H — E2E + Security + Closure
- **Objetivo:** cierre de Phase 8, mismo estándar de rigor que
  `PHASE_7_CLOSURE_REPORT.md` — auditoría completa de RLS/RPCs, matriz de
  roles, barrido de publicación externa (esta vez confirmando qué SÍ está
  autorizado a publicar y bajo qué guardas, en vez de confirmar que nada
  publica), regresión de tests, clasificación de merge-readiness.

## Nota de resolución de solapamiento (8A.3 vs. antiguo 8D)

El roadmap original listaba **8A.3 "Activation UI / Manual Preparation"**
y **8D "Manual Activation"** como subfases separadas. El audit de 8A
(`PHASE_8A_ACTIVATION_AUDIT.md` §27) detectó que ambas cubrían la misma
superficie funcional bajo el diseño de dominio elegido — el camino manual
no es un flujo aparte del modelo de activación, es una instancia del
MISMO modelo con `channel = 'manual'`. Mantenerlas separadas hubiera
significado construir la UI de creación en 8A.3 y luego "activación
manual" otra vez en 8D, duplicando trabajo. Se resolvió fusionando el
alcance funcional original de 8D dentro de 8A.3, y redefiniendo 8D como
el endurecimiento operativo posterior (ver arriba). Las letras del
roadmap se mantienen sin cambios para no invalidar referencias ya
existentes en otros documentos.

## Registro de riesgos de Phase 8

Documentado en `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md`
(creado durante 8A, siguiendo el mismo formato que
`PHASE_7_RISK_REGISTER.md`). Incluye los riesgos identificados durante la
auditoría de 8A.0 (contraste de color, favicon, límite del entorno de
tests) más 15 riesgos nuevos específicos de activación (R-ACT-01 a
R-ACT-15) cubriendo duplicate publishing, approval bypass, stale
snapshot, cross-org integration reference, credential leakage, provider
API drift, partial multi-channel failure, retries duplicando acción
externa, race conditions, cancelación durante ejecución, divergencia
manual/externa, alert spam, publicación automática accidental, y la
estrategia de refresh token ausente heredada de Phase 3.
