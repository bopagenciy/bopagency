# Phase 7 — Registro de Riesgos
**Fecha:** 2026-08-16
**Rama:** main (sobre commit `3fc9fee`)

---

## Escala de Severidad

| Nivel | Probabilidad × Impacto | Acción |
|-------|----------------------|--------|
| 🔴 Crítico | Alta probabilidad, alto impacto | Bloquea la subfase — resolver antes de continuar |
| 🟠 Alto | Media/Alta probabilidad, alto impacto | Mitigar antes de implementar |
| 🟡 Medio | Media probabilidad, impacto acotado | Plan de contingencia documentado |
| 🟢 Bajo | Baja probabilidad o impacto mínimo | Monitorear |

---

## Riesgos de Diseño / Dominio

### R-DOM-01 — `Campaign` sin `organizationId`
**Severidad:** 🔴 Crítico
**Probabilidad:** Alta — ya confirmado en la auditoría (`packages/domain/src/entities/campaign.ts`)
**Impacto:** Si 7B implementa la tabla `campaigns` copiando literalmente los campos de la entidad actual, el sistema queda sin la columna sobre la que descansa todo el modelo de RLS del proyecto (`is_organization_member(organization_id)`), rompiendo el aislamiento multi-tenant desde el diseño.
**Mitigación:** 7B debe añadir `organizationId` a la entidad y a la tabla **antes** de escribir cualquier RLS policy, no como ajuste posterior.
**Acción requerida:** Resolver en el diseño de 7B, primer commit de la subfase.

### R-DOM-02 — `CampaignRepository.delete()` es borrado físico
**Severidad:** 🟠 Alto
**Probabilidad:** Alta — confirmado en la interfaz actual
**Impacto:** Si se implementa tal cual, se pierde el historial de campañas eliminadas y se rompe el patrón de `deleted_at` usado en `clients`/`tasks`/`automations`. Además, `campaign_approvals` referenciando una campaña borrada físicamente pierde integridad referencial de auditoría.
**Mitigación:** Cambiar a soft-delete en la implementación (`update` con `deleted_at`), manteniendo la firma `Promise<Result<void>>` o renombrando explícitamente el método.
**Acción requerida:** Resolver en 7B, antes de implementar `SupabaseCampaignRepository`.

### R-DOM-03 — Confusión entre "campaigns" de Campaign Studio y `client_metrics.campaigns` JSONB
**Severidad:** 🟡 Medio
**Probabilidad:** Media — el nombre es idéntico y ambos aparecen en el mismo dominio de negocio (campañas publicitarias)
**Impacto:** Un desarrollador nuevo (o un agente de IA futuro) podría intentar "unificar" ambos conceptos, o peor, hacer que `createCampaignWithAI` escriba en `client_metrics.campaigns` en vez de en `public.campaigns`, corrompiendo el JSONB de métricas.
**Mitigación:** Nombrar explícitamente en código y documentación: `public.campaigns` = Campaign Studio (creadas y gestionadas internamente); `client_metrics.campaigns` = métricas de campañas externas ingeridas (solo lectura desde la perspectiva de Campaign Studio). No debe existir ningún código que escriba en `client_metrics.campaigns` desde el flujo de Campaign Studio.
**Acción requerida:** Documentar la distinción en el `README` de `packages/domain` o en un comentario en la migración de 7B.

---

## Riesgos Técnicos

### R-TECH-01 — `CampaignStatus` ya en shared, pero sin validador de transición — ✅ RESUELTO en 7C
**Severidad:** 🟠 Alto
**Probabilidad:** Alta
**Impacto:** `CAMPAIGN_STATUSES` incluye 7 estados (`draft, review, approved, active, paused, completed, rejected`) sin ninguna función que valide transiciones permitidas (ej. no debería poderse pasar de `draft` directo a `active`, o de `rejected` a `active`). El error de dominio `campaignInvalidStatus` ya existe (`domain.errors.ts`) pero no se usa en ningún lado.
**Mitigación:** 7C debe definir explícitamente la máquina de estados válida (`draft → review → approved|rejected`, `approved → active → paused|completed`) y usar `campaignInvalidStatus` en el use case `approveCampaign`/`rejectCampaign`.
**Acción requerida:** Resolver en 7C, con tests que verifiquen transiciones inválidas.
**Resolución (7C):** `canTransitionCampaign`/`CAMPAIGN_TRANSITIONS` ya existían desde 7B con la máquina de estados completa (confirmado con evidencia: `campaign-transitions.test.ts` recorre los 7 estados y confirma `draft→approved`/`draft→rejected` inválidos y `rejected` terminal — no existe `rejected→draft`). 7C consume esa función en `submitCampaignForReview`/`approveCampaign`/`rejectCampaign` (verifica la transición ANTES de llamar al repositorio/RPC) y retorna `campaignInvalidStatus` cuando el status actual no permite la transición pedida — cubierto por tests en los tres use cases nuevos.

### R-TECH-02 — `listCampaigns` ya escrito contra un repositorio inexistente
**Severidad:** 🟢 Bajo
**Probabilidad:** N/A (ya ocurrió, es un hecho, no un riesgo futuro)
**Impacto:** Ninguno operativo — el use case simplemente no puede invocarse hoy sin una implementación de `CampaignRepository`, y no hay ningún caller en producción todavía.
**Mitigación:** Ninguna requerida más allá de completar 7B.
**Acción:** Ninguna — se documenta para que quede registrado que el use case ya pasó revisión de forma implícita en una fase anterior y solo necesita la pieza faltante.

### R-TECH-03 — Salida no estructurada / no validada del proveedor de IA — ✅ RESUELTO en 7D
**Severidad:** 🔴 Crítico
**Probabilidad:** Alta — es el modo de falla más común en integraciones LLM sin validación
**Impacto:** Si `createCampaignWithAI` (7D) persiste la respuesta del modelo sin validar contra un schema Zod estricto, un modelo que devuelva JSON malformado, campos faltantes, o contenido que viole compliance puede corromper una fila de `campaigns` o crear una campaña con presupuesto/objetivo inválido.
**Mitigación:** Validación Zod obligatoria de la salida antes de cualquier `INSERT`; en caso de fallo de validación, el use case retorna error, no persiste nada parcial. Nunca confiar en `finishReason: 'stop'` como garantía de validez del contenido.
**Acción requerida:** Diseñar el schema de salida junto con el prompt en 7D, no después.
**Resolución (7D):** `CampaignGeneratorAdapter.generate()` parsea la respuesta cruda del modelo con `campaignGeneratedContentSchema.safeParse` (Zod, unión discriminada por `platform`) antes de retornar cualquier resultado a `application` — no existe ningún `as CampaignGeneratedContent` sin parseo previo en el boundary de IA. Si la validación falla, retorna `invalidAiOutput` (solo con los `path` de los campos que fallaron, nunca el contenido crudo) y ni `generateCampaignDraftWithAI` ni `regenerateCampaignContent` llegan a llamar `create()`/`update()` — cubierto por tests explícitos (`campaign-generator.adapter.test.ts` G4/G5; casos "AI provider failure propagated without persistence"/"platform-mismatch output rejected without persistence" en ambos use cases).

### R-TECH-04 — Notificaciones duplicadas en reintentos (7F)
**Severidad:** 🟡 Medio
**Probabilidad:** Media — el proyecto ya tiene lógica de reintento para `automation_executions` (Phase 6D), y es razonable que campaigns adopte un patrón similar de reintento en `createCampaignWithAI`
**Impacto:** Si `submitCampaignForReview` se reintenta (por timeout, error de red del cliente, etc.) y no es idempotente, se pueden crear múltiples `alerts`/`tasks` para la misma campaña.
**Mitigación:** Idempotencia por `campaign_id` + estado (no crear una nueva alerta si ya existe una `alert` activa no resuelta para la misma campaña en `review`).
**Acción requerida:** Resolver en 7F, con test de idempotencia.

### R-TECH-05 — Ruta del roadmap original (`(dashboard)`) no coincide con la real (`(protected)`)
**Severidad:** 🟢 Bajo
**Probabilidad:** Alta si no se corrige a tiempo — es un error mecánico fácil de arrastrar
**Impacto:** Bajo en sí mismo (un error de ruta se detecta rápido en build), pero puede generar código nuevo en un route group que no existe o duplicar rutas.
**Mitigación:** Ya documentado en `PHASE_7_IMPLEMENTATION_PLAN.md` §7 — usar siempre `app/(protected)/campaigns/...`.
**Acción:** Ninguna adicional, solo atención al implementar 7E.

---

## Riesgos de Seguridad

### R-SEC-01 — RLS de `campaigns`/`campaign_approvals`/`compliance_rules` mal alcanzada
**Severidad:** 🔴 Crítico
**Probabilidad:** Media — depende de que se copie correctamente el patrón ya validado en `clients`
**Impacto:** Sin `organization_id` correctamente indexado y sin políticas `is_organization_member`/`has_organization_role` idénticas en espíritu a las de `clients`, un usuario de una organización podría leer o modificar campañas de otra organización, o un `viewer` podría aprobar campañas.
**Mitigación:** Reutilizar literalmente los helpers `is_organization_member()` y `has_organization_role()` ya existentes y probados (no reimplementar lógica de pertenencia). Añadir tests de RLS (si el proyecto los tiene para `clients`, replicar el mismo patrón de test para `campaigns`).
**Acción requerida:** Confirmar con el usuario los roles mínimos exactos para crear vs. aprobar/rechazar (pendiente, ver `PHASE_7_IMPLEMENTATION_PLAN.md` §9) antes de escribir la migración de RLS en 7B/7C.

### R-SEC-02 — Roles de aprobación indefinidos (decisión de negocio pendiente) — ✅ RESUELTO en 7C
**Severidad:** 🟠 Alto
**Probabilidad:** Alta — es una decisión no técnica que bloquea la migración de RLS
**Impacto:** Si se implementa con una suposición incorrecta (ej. dejar que `operator` apruebe cuando el negocio quiere que solo `admin`/`owner` lo hagan), se necesita una migración correctiva después, con el riesgo de exponer temporalmente una superficie de aprobación más permisiva de lo debido.
**Mitigación:** No escribir la política de `INSERT`/`UPDATE` sobre `campaign_approvals` sin confirmación explícita del usuario.
**Acción requerida:** Pregunta abierta para el usuario antes de iniciar 7C (propuesta en el plan: crear = `operator`+, aprobar/rechazar = `admin`+).
**Resolución (7C):** Se aplicó la matriz propuesta en el plan, sin desviación: `submitCampaignForReview` exige `operator`+ (viewer denegado); `approveCampaign`/`rejectCampaign` exigen `admin`+ (viewer/operator/strategist denegados). El chequeo se aplica en DOS capas independientes — en el use case (vía `hasMinimumRole` sobre `OrganizationRepository.findMember`) y dentro de la RPC `SECURITY DEFINER` (`has_organization_role(v_org_id, 'admin')`) — de forma que la RPC sigue siendo la autoridad final incluso si el use case tuviera un bug. Cubierto por tests explícitos de cada rol denegado/permitido en `approve-campaign.use-case.test.ts`/`reject-campaign.use-case.test.ts`, y por los 16 tests estáticos de `phase7c-migration-security.test.ts` sobre el cuerpo real de la RPC.

### R-SEC-03 — Prompt injection / fuga de contexto en `createCampaignWithAI` — ✅ RESUELTO en 7D
**Severidad:** 🟠 Alto
**Probabilidad:** Media — cualquier campo de brief que el usuario controle (nombre de campaña, notas) y se interpole directamente en el prompt del sistema es vector potencial
**Impacto:** Un usuario malicioso (o un cliente final cuyo brief se pega tal cual) podría intentar manipular el prompt para que el modelo ignore las reglas de compliance inyectadas, o para extraer el `systemPrompt`/reglas de otros clientes si el contexto no está correctamente aislado por `organization_id`/`client_id`.
**Mitigación:** Separar claramente en el `AIRequest` los mensajes de `system` (compliance rules + instrucciones, no editables por el usuario) de los de `user` (brief); nunca inyectar reglas de compliance de otro cliente/organización en el contexto de una generación; validar que la salida no filtra el `systemPrompt`.
**Acción requerida:** Diseñar el ensamblado del `AIRequest` en 7D con esta separación explícita desde el primer commit.
**Resolución (7D):** `campaign-prompt-builder.ts` separa explícitamente el mensaje `system` (política/reglas/instrucciones, nunca contenido editable por el usuario) del mensaje `user` (brief + contexto de cliente + reglas de compliance, siempre las del `clientId`/`organizationId` real de la campaña, obtenidas vía `ComplianceRuleRepository`/`ClientRepository` con aislamiento de organización ya existente desde 7B/7C — nunca reglas de otro cliente/organización). El brief del usuario nunca se interpola dentro de la sección de política de sistema. Cubierto por tests de estructura (`campaign-prompt-builder.test.ts`: mensaje `system` vs `user` separados, secciones correctas, reglas de compliance incluidas solo cuando aplican al cliente/organización de la campaña).

### R-SEC-04 — Costo no controlado de llamadas a IA — ✅ RESUELTO en 7D
**Severidad:** 🟡 Medio
**Probabilidad:** Media — no hay ningún control de límite hoy, ni siquiera el tipo `AIUsage` se persiste en ningún lado
**Impacto:** Sin límite de `maxTokensPerCall` (ya existe como campo en `AgentDefinition`, pero no se aplica en runtime) ni tracking de costo agregado por organización, un uso intensivo o un bug en un loop de reintento podría generar costos inesperados de la API del proveedor de IA.
**Mitigación:** Aplicar `maxTokensPerCall` de `AgentDefinition` como límite real al construir el `AIRequest`; persistir `AIUsage` (tokens) por generación desde el primer commit de 7D, aunque sea en una tabla simple, para tener visibilidad antes de escalar.
**Acción requerida:** Resolver en 7D — no lanzar `createCampaignWithAI` sin al menos el límite de tokens aplicado y el uso persistido.
**Resolución (7D):** `ClaudeAPIProvider` aplica `CAMPAIGN_AI_TIMEOUT_MS` (default 30000ms, acotado entre 5000–120000ms) vía `AbortController`, limitando llamadas colgadas; no existe ningún loop de reintento en `ClaudeAPIProvider`/`CampaignGeneratorAdapter` (consistente con el resto del proyecto, que tampoco reintenta en sus adapters), eliminando el vector de costo por reintento descontrolado. `response.usage` (tokens) se persiste en `campaigns.metadata.ai.tokenUsage` en cada generación/regeneración exitosa (`CampaignGeneratorAdapter.generate()` → `GeneratedCampaignMetadata.tokenUsage`), dando visibilidad por campaña sin requerir tabla nueva. Queda diferido para 7E/7F (documentado como riesgo nuevo más abajo): agregación de costo/tokens a nivel de organización y un límite duro de tokens por llamada más allá del timeout.

---

## Riesgos de Producto / Alcance

### R-PROD-01 — Expectativa de publicación real en Meta/Google/YouTube dentro de Phase 7
**Severidad:** 🟡 Medio
**Probabilidad:** Media — el roadmap original menciona explícitamente Meta/Google/YouTube en el propósito de Campaign Studio, lo cual puede generar la expectativa de que Phase 7 "publica" campañas
**Impacto:** Si no se comunica claramente, se puede asumir que al cerrar Phase 7 las campañas aprobadas quedan corriendo en las plataformas reales, cuando en realidad `AdvertisingPlatformProvider` solo tiene métodos de lectura y la publicación es una fase posterior explícita del propio roadmap (ítem 11).
**Mitigación:** Reforzado en las restricciones de esta tarea y en `PHASE_7_IMPLEMENTATION_PLAN.md` §9 ("No publicar campañas externamente en Phase 7"). Comunicar explícitamente en el cierre de cada subfase que "approved" significa "lista para publicación humana/fase posterior", no "publicada".
**Acción:** Mantener el lenguaje de UI y documentación consistente con esto durante 7E.

### R-PROD-02 — Duplicación de reglas de compliance entre el agente `compliance-reviewer.md` y la guía maestra
**Severidad:** 🟡 Medio
**Probabilidad:** Alta — ya confirmado, ambas fuentes existen hoy con contenido solapado pero no idéntico
**Impacto:** Si se importa solo la guía maestra a `compliance_rules` y se deja el agente `.claude` con su propia copia desactualizada, futuras ediciones de compliance divergirán entre el sistema (tabla) y el prompt del agente legacy, generando inconsistencia entre lo que Campaign Studio valida y lo que un operador usando Claude Code directamente cree que aplica.
**Mitigación:** Al importar reglas (fuera de Phase 7, según instrucción explícita de no importar todavía), tratar la guía maestra como fuente única de verdad y actualizar/deprecar el contenido duplicado en `compliance-reviewer.md` en un paso de limpieza posterior.
**Acción:** No requerida dentro de Phase 7 — documentado para la fase en que se ejecute la importación real.

---

## Riesgos nuevos identificados en 7D (diferidos a 7E/7F o monitoreo)

### R-TECH-06 — Solo `meta_ads`/`google_ads` tienen builder de generación
**Severidad:** 🟢 Bajo
**Probabilidad:** Alta si un usuario intenta generar para `youtube_ads` u otra plataforma de `AD_PLATFORMS`
**Impacto:** `generateCampaignDraftWithAI`/`regenerateCampaignContent` rechazan explícitamente (`unsupportedCampaignPlatform`, verificado por `isSupportedGenerationPlatform()` antes de tocar cliente/IA) cualquier plataforma fuera de `SUPPORTED_GENERATION_PLATFORMS = ['meta_ads', 'google_ads']`. No es un bug, pero la UI de 7E debe reflejar esta limitación (no ofrecer el flujo de generación IA para plataformas no soportadas) para no generar una expectativa incorrecta.
**Mitigación:** Documentado explícitamente aquí y en `PHASE_7D_AI_CAMPAIGN_BUILDER_REPORT.md`. Ampliar `SUPPORTED_GENERATION_PLATFORMS` (y el contrato de salida del prompt builder por plataforma) es trabajo de una subfase futura, no de 7E/7F en sí.
**Acción requerida:** 7E debe consultar `isSupportedGenerationPlatform`/`SUPPORTED_GENERATION_PLATFORMS` (exportado desde domain) al construir el wizard, no hardcodear la lista de plataformas con IA disponible.

### R-TECH-07 — Sin historial de regeneraciones
**Severidad:** 🟡 Medio
**Probabilidad:** Alta — es el comportamiento diseñado, no un bug
**Impacto:** `regenerateCampaignContent` sobrescribe `generated_content` y `metadata.ai` en cada llamada (documentado como decisión de diseño explícita en el use case). No queda ningún registro de generaciones anteriores; si un operador regenera y el nuevo resultado es peor, no hay forma de volver al `generated_content` previo salvo que la campaña no se haya guardado/cerrado todavía en la UI.
**Mitigación:** Aceptado como límite de 7D. Si el negocio lo requiere, una tabla `campaign_ai_generations` (histórico append-only) puede añadirse en una subfase posterior sin romper el contrato actual de `CampaignGeneratorPort`.
**Acción requerida:** Confirmar con el usuario si 7E/7F necesita historial de regeneraciones antes de diseñar el wizard de edición.

### R-TECH-08 — Duplicación de `GENERATED_CONTENT_SCHEMA_VERSION` (domain vs. shared)
**Severidad:** 🟢 Bajo
**Probabilidad:** Baja — requiere que alguien edite una constante sin editar la otra
**Impacto:** `GENERATED_CONTENT_SCHEMA_VERSION = 'campaign-content-v1'` existe como dos constantes independientes: una en `packages/domain/src/entities/campaign-generated-content.ts` (domain debe permanecer libre de dependencia a Zod) y otra en `packages/shared/src/schemas/campaign-generated-content.schema.ts`. Si una futura edición cambia solo una de las dos, domain y shared quedarían de acuerdo en el nombre del schema pero no en su versión real.
**Mitigación:** Un test de dominio (`campaign-generated-content.test.ts`) importa la constante de `@bop-agency/shared` y assert-a igualdad contra la de domain, fallando el build si divergen.
**Acción requerida:** Ninguna inmediata — riesgo aceptado y cubierto por test de regresión; revisar si domain gana una capa de "tipos compartidos sin Zod" en una refactorización futura que elimine la duplicación de raíz.

### R-TECH-09 — Suite de tests de `apps/web` no verificada end-to-end en la sesión de 7D
**Severidad:** 🟡 Medio
**Probabilidad:** N/A — es una limitación de herramienta de esta sesión, no del código
**Impacto:** El entorno de ejecución de esta sesión (`device_bash`) tiene un límite duro de 45 segundos por comando; el arranque de Vitest sobre `apps/web` (Next.js) no completa ni un solo archivo de test dentro de ese límite, a diferencia de `domain`/`shared`/`application`/`infrastructure`, que corren completos sin problema. `tsc --noEmit` y `eslint` sobre `apps/web` sí se ejecutaron limpios en esta sesión, pero los tests unitarios de `apps/web` (si existen para campaigns) no pudieron confirmarse en esta sesión.
**Mitigación:** Ejecutar `npm run test --workspace=apps/web` manualmente (fuera de esta sesión, en un entorno sin el límite de 45s) antes de dar por cerrada la revisión de 7D.
**Acción requerida:** El usuario (o una sesión sin esta restricción de tiempo) debe correr y confirmar la suite de `apps/web` antes de aprobar 7D para commit.

### R-ENV-01 — `.git/index.lock` no se pudo eliminar vía el puente de dispositivo (informativo)
**Severidad:** 🟢 Bajo
**Probabilidad:** N/A — hallazgo de entorno, no de código
**Impacto:** `device_bash` (el puente hacia el equipo del usuario) no puede borrar archivos (`rm`/`unlink` fallan con "Operation not permitted" sobre carpetas montadas); se observó una advertencia de `unlink` sobre `.git/index.lock` durante un `git status`. No bloqueó ninguna operación git posterior en esta sesión.
**Mitigación:** Ninguna requerida — es una restricción conocida del entorno, no un defecto de la migración/código de Phase 7. Si un `.git/index.lock` residual llegara a bloquear git de verdad, el usuario debe borrarlo manualmente desde su propio equipo (no vía el puente).
**Acción requerida:** Ninguna para 7D. Documentado para que futuras sesiones no lo interpreten como corrupción del repositorio.

---

## Resumen ejecutivo de riesgos que bloquean el inicio de 7B

1. **R-DOM-01** (`organizationId` faltante) — debe resolverse en el diseño antes de escribir la migración.
2. **R-SEC-02** (roles de aprobación indefinidos) — requiere una respuesta del usuario antes de escribir RLS completo (se puede empezar 7B con las tablas y dejar las policies de `campaign_approvals` como último paso de 7B, una vez confirmados los roles).

Ningún otro riesgo listado bloquea el inicio de 7B; el resto se mitiga durante las subfases correspondientes (7C–7G) según lo indicado.
