# Phase 8B.1 — Publication Domain + Persistence — Reporte

**Rama:** `feat/phase-8-campaign-operations`
**Fecha:** 2026-08-25
**Subfase:** implementación de dominio + persistencia (sin orquestación de
aplicación, sin adapter de proveedor real, sin endpoint HTTP de webhook).
**Documento base:** `docs/implementation/phase-8/PHASE_8B_PUBLISHING_GATEWAY_AUDIT.md`
(8B.0) — este reporte implementa ese diseño casi 1:1, con una desviación
documentada (§3).

---

## 1. Archivos nuevos / modificados

**Migración (nueva):**
- `supabase/migrations/20260825120000_phase8b1_publication_domain_persistence.sql`

**Dominio (`packages/domain`) — nuevos:**
- `src/entities/campaign-publication-job.ts`
- `src/entities/campaign-publication-attempt.ts`
- `src/entities/campaign-publication-event.ts`
- `src/entities/campaign-publication-webhook-event.ts`
- `src/repositories/campaign-publication.repository.ts`
- `src/__tests__/campaign-publication-job.test.ts`
- `src/__tests__/campaign-publication-attempt.test.ts`
- `src/__tests__/campaign-publication-event.test.ts`
- `src/__tests__/campaign-publication-webhook-event.test.ts`

**Dominio — modificados:**
- `src/repositories/campaign-activation.repository.ts` (2 métodos nuevos: `markTargetPublishing`, `markTargetFailed`)
- `src/index.ts` (exports nuevos)

**Shared (`packages/shared`) — nuevos:**
- `src/constants/publication.ts`
- `src/constants/__tests__/publication.test.ts`

**Shared — modificados:**
- `src/index.ts` (exports nuevos)

**Infraestructura (`packages/infrastructure`) — nuevos:**
- `src/supabase/mappers/campaign-publication.mapper.ts`
- `src/supabase/mappers/__tests__/campaign-publication.mapper.test.ts`
- `src/supabase/repositories/supabase-campaign-publication.repository.ts`
- `src/supabase/__tests__/phase8b1-migration-security.test.ts`

**Infraestructura — modificados:**
- `src/supabase/repositories/supabase-campaign-activation.repository.ts` (implementa `markTargetPublishing`/`markTargetFailed`)
- `src/index.ts` (exports nuevos)

**Application (`packages/application`) — modificados (solo para mantener compilación, NO se implementó orquestación nueva — fuera de alcance de 8B.1):**
- `src/use-cases/activations/__tests__/activation-read-use-cases.test.ts`
- `src/use-cases/activations/__tests__/activation-write-use-cases.role-matrix.test.ts`
- `src/use-cases/activations/__tests__/create-campaign-activation.use-case.test.ts`

Estos 3 archivos mockean `CampaignActivationRepository` completo; al
extender la interfaz con `markTargetPublishing`/`markTargetFailed` (ver
§2), sus mocks dejaron de satisfacer el tipo. Se agregaron los dos stubs
`vi.fn()` correspondientes — ningún comportamiento de negocio fue tocado.

**Documentación:**
- `docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md` (este archivo, nuevo)
- `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md` (actualizado)
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` (actualizado)

**No tocado (deliberadamente):** ningún archivo de `apps/web`, ningún
adapter de proveedor, ningún endpoint HTTP, ninguna migración existente,
`.agencia-ai/.claude/commands/new-client.md`, ninguno de los fixtures
`supabase/fixtures/phase8a1_runtime_output*.txt`.

---

## 2. Modelo de dominio implementado

| Concepto del audit | Implementado como | Desviación de terminología |
|---|---|---|
| `CampaignPublicationJob` | `packages/domain/src/entities/campaign-publication-job.ts` | Ninguna |
| `CampaignPublicationAttempt` | `packages/domain/src/entities/campaign-publication-attempt.ts` | Ninguna |
| `CampaignPublicationEvent` | `packages/domain/src/entities/campaign-publication-event.ts` | Ninguna |
| `CampaignPublicationWebhookEvent` | `packages/domain/src/entities/campaign-publication-webhook-event.ts` | Ninguna |
| 2 transiciones nuevas de `CampaignActivationTarget` | Métodos `markTargetPublishing`/`markTargetFailed` en `CampaignActivationRepository`, respaldados por las RPCs `mark_activation_target_publishing`/`mark_activation_target_failed` | Ninguna — el state machine de `CampaignActivationTarget` (8A.1) **no se modificó**; `publishing`/`failed` ya existían en el enum/grafo, solo se les dio un caller. |

Se mantiene la separación de aggregates exigida: `CampaignPublicationJob`
no colapsa con `CampaignActivation`/`CampaignActivationTarget`/
`AutomationExecution` — cada uno vive en su propia tabla, con su propio
repositorio (`CampaignPublicationRepository` es un repositorio **agregado
nuevo**, separado de `CampaignActivationRepository`, que solo gana los 2
métodos de transición de target).

`CampaignPublicationRepository` sigue el mismo criterio "repositorio único
agregado" que 8A.1 (no 4 repos separados) — cubre jobs + attempts +
events + webhook-events porque comparten el mismo boundary transaccional
(todo gira en torno a `jobId`).

---

## 3. Desviación documentada frente al audit 8B.0

El audit §15.2 enumera las RPCs esperadas como: `create_publication_job,
claim_publication_job (...), record_publication_attempt,
mark_publication_job_succeeded/_failed/_unknown_outcome (...),
cancel_publication_job (...), reconcile_publication_job` — sin mencionar
explícitamente una RPC `start_publication_job` separada de `claim`.

**Esta implementación SÍ agrega `start_publication_job`** como RPC
independiente, justificado por el propio grafo de estados que el audit ya
definía (§4.1): `claimed` (el worker tomó posesión, vía `SELECT ... FOR
UPDATE SKIP LOCKED`) es un estado explícitamente DISTINTO de `in_progress`
(ya se hizo/se está haciendo la llamada HTTP real). Sin una RPC separada,
esa lógica tendría que vivir dentro de `claim` (mezclando "tomar posesión"
con "ya llamé al proveedor" — exactamente la ambigüedad que el audit dice
que `claimed` existe para evitar) o dentro de `record_publication_attempt`
(que puede invocarse más de una vez por job en reintentos internos, y por
tanto no es el lugar correcto para una transición de job que debe ocurrir
una sola vez). `start_publication_job` es también el punto exacto donde el
target padre transiciona atómicamente a `publishing` y se computa
`reconciliation_deadline_at` — ambos hechos que el audit sitúa
explícitamente en el momento de "entrar en `in_progress`", no en "ser
reclamado". Documentado también como comentario en la cabecera de la
migración.

Ninguna otra desviación de fondo respecto al audit.

---

## 4. State machine del job

```
queued     → claimed, cancelled
claimed    → in_progress, cancelled
in_progress→ succeeded, failed, unknown_outcome
unknown_outcome → succeeded, failed        (SOLO vía reconcile_publication_job)
succeeded / failed / cancelled             (terminal)
```

- **Terminales:** `succeeded`, `failed`, `cancelled`. `unknown_outcome`
  **NO es terminal** — es la adición central del audit (§4.1) y así se
  implementó: distinta de `failed`, sin ninguna transición automática de
  salida.
- **Guardas de dominio puras** en `campaign-publication-job.ts`:
  `canTransitionPublicationJob(from, to)`, `transitionPublicationJob`
  (lanza en transición ilegal), `isPublicationJobTerminal`,
  `canDirectlyCancelPublicationJob` (queued/claimed),
  `canRequestCooperativeCancel` (in_progress),
  `canRetryPublicationJob` (SOLO `failed` + categoría retryable — NUNCA
  `unknown_outcome`), `canReconcilePublicationJob` (SOLO
  `unknown_outcome`).
- **Guarda de estado terminal a nivel DB** (defensa en profundidad,
  además de las RPCs): trigger `protect_publication_job_immutable_fields`
  rechaza cualquier `UPDATE` de `status` cuando `OLD.status` ya es
  terminal.
- **Cancelación** (locked decision #2): `queued`/`claimed` → transición
  directa a `cancelled`, rol `operator+`. `in_progress` → **cooperativa**,
  nunca transiciona el status del job — solo registra
  `cancellation_requested_at/by` (rol `strategist+`); el job se resuelve
  después según lo que realmente pasó con el proveedor. `unknown_outcome`
  rechaza cualquier cancelación (debe reconciliarse primero).
- **Reconciliación** (locked decision #1): única vía de salida de
  `unknown_outcome`, rol `strategist+`, exige `note` no vacío, dos
  resultados posibles: `published` (→ `succeeded`, requiere `externalId`)
  o `not_published` (→ `failed` con `failure_category =
  UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED`, elegible para retry).
- **Retry** (audit §4.3): nunca reabre un job terminal — `retry_of_job_id`
  encadena un job NUEVO, `retry_count` incrementado, solo permitido si el
  job anterior es `failed` con `failure_category` retryable
  (`INTEGRATION_NOT_AVAILABLE`, `RATE_LIMITED`, `DISPATCH_FAILED`,
  `PROVIDER_OUTAGE`, `UNKNOWN_OUTCOME_RESOLVED_NOT_PUBLISHED`).

---

## 5. Idempotencia

- **Formato exacto:** `publish:{organizationId}:{targetId}:{retryCount}`
  (`buildPublicationIdempotencyKey`, dominio; replicado en SQL dentro de
  `create_publication_job`). `retryCount` se lee del job anterior en DB
  (nunca un contador client-side).
- **Uniqueness scope:**
  - `campaign_publication_jobs`: `UNIQUE (target_id) WHERE status NOT IN
    ('succeeded','failed','cancelled')` — un target no puede tener dos
    jobs activos; y `UNIQUE (organization_id, idempotency_key)` como
    defensa adicional.
  - `campaign_publication_attempts`: `UNIQUE (job_id, idempotency_key)` —
    protege doble ejecución de worker dentro del mismo job.
  - `campaign_publication_webhook_events`: `UNIQUE (provider,
    external_event_id)` — replay protection.
- **Retry semantics:** un job terminal (`succeeded`/`cancelled`) **nunca**
  se reutiliza — el `UNIQUE (target_id) WHERE NOT terminal` libera la
  ranura una vez el job anterior es terminal, y `create_publication_job`
  con `retry_of_job_id` crea una fila NUEVA con `retry_count + 1` y una
  key nueva (`...:{retryCount+1}`) — nunca reescribe la key anterior.
  Tras `cancelled`, un nuevo job puede crearse libremente para el mismo
  target (no requiere `retry_of_job_id`, porque cancelar antes de llamar
  al proveedor no consumió ningún intento real) — validado por el CHECK
  de estado (`ready`/`scheduled`) en `create_publication_job`, que
  revalida el target, no el job cancelado.

---

## 6. Esquema DB implementado

4 tablas nuevas, todas con `organization_id` denormalizado y verificado
por trigger contra el padre real:

- **`campaign_publication_jobs`**: `id, organization_id, client_id,
  activation_id, target_id, channel, provider, client_integration_id,
  status, idempotency_key, retry_of_job_id, retry_count, claimed_at,
  claimed_by_worker, started_at, completed_at,
  reconciliation_deadline_at, cancellation_requested_at/by,
  failure_category, reconciled_by/at/note, metadata, created_by,
  created_at, updated_at`. Constraints clave: `CHECK (provider <>
  'manual')`, `UNIQUE (target_id) WHERE NOT terminal`, `UNIQUE
  (organization_id, idempotency_key)`, `CHECK` de coherencia de
  `reconciled_*`.
- **`campaign_publication_attempts`**: `id, job_id, organization_id,
  attempt_number, idempotency_key, external_id, external_url,
  provider_status, provider_error_code, http_status, outcome
  (confirmed|unknown), duration_ms, started_at, completed_at,
  created_at`. Append-only real (sin `updated_at`); `UNIQUE (job_id,
  idempotency_key)`; triggers `trg_publication_attempts_no_update/delete`
  rechazan explícitamente cualquier mutación tras el INSERT.
- **`campaign_publication_events`**: `id, organization_id, job_id
  (NOT NULL), attempt_id (nullable), event_type (CHECK contra lista
  cerrada de 9 valores), actor_user_id, is_system, note, metadata,
  created_at`. Append-only real, mismos triggers de rechazo que attempts.
- **`campaign_publication_webhook_events`**: `id, organization_id
  (nullable hasta correlación), provider, external_event_id (NOT NULL),
  payload_hash (CHECK regex SHA-256 hex), status, job_id, attempt_id,
  error_code, received_at, processed_at, created_at`. `UNIQUE (provider,
  external_event_id)`.

Ninguna tabla tiene columna de secreto/token/credencial. Ningún GRANT
INSERT/UPDATE/DELETE directo a `authenticated` ni `service_role` en
ninguna de las 4 tablas — toda escritura pasa por las RPCs (§8/§9).

---

## 7. Autorización (RLS / RPC)

Modelo de 2 capas, replicando exactamente el patrón `SECURITY DEFINER` de
8A.1:

| Rol | Permitido |
|---|---|
| `viewer` | SELECT en jobs/attempts/events (RLS `is_organization_member`). Sin acceso a `webhook_events` bajo ninguna circunstancia (ni SELECT — mismo criterio que `automation_webhook_events`). |
| `operator` | `create_publication_job` (crear/reintentar), `cancel_publication_job` cuando el job está `queued`/`claimed`. |
| `strategist` | Todo lo de `operator` + `cancel_publication_job` cuando el job está `in_progress` (cooperativo) + `reconcile_publication_job` (única vía de salida de `unknown_outcome`). |
| `admin`/`owner` | Heredan `strategist+` vía `has_organization_role` (jerarquía ya establecida en 8A.1). |
| *(sistema — worker/webhook, nunca un usuario)* | `claim_publication_job`, `start_publication_job`, `record_publication_attempt`, `mark_publication_job_succeeded/_failed/_unknown_outcome`, `mark_activation_target_publishing/_failed`, `append_publication_event`, `record_publication_webhook_receipt`, `mark_webhook_event_processed` — GRANT EXECUTE **solo a `service_role`**, nunca a `authenticated`. |

Puntos verificados explícitamente (por test estático, §12):
- El actor de toda RPC de usuario se deriva de `auth.uid()` — ninguna
  acepta un `p_actor_id`/`p_user_id`/`p_created_by` como parámetro.
- Ninguna RPC de la capa "sistema" tiene GRANT a `authenticated`.
- Ninguna RPC de la capa "usuario" tiene GRANT a `service_role` (no
  requerido en el flujo normal).
- `cancel_publication_job` nunca transiciona el status cuando el job está
  `in_progress` (cooperativo real, no solo documentado).
- `reconcile_publication_job` exige `strategist+` y solo aplica desde
  `unknown_outcome`.

---

## 8. Repositorio / mapper

- **Dominio:** `CampaignPublicationRepository` (interfaz agregada) en
  `packages/domain/src/repositories/campaign-publication.repository.ts`
  — 16 operaciones (reads + writes RPC-backed), alineadas 1:1 con las 14
  RPCs de escritura + 2 lecturas paginadas.
- **Infraestructura:** `SupabaseCampaignPublicationRepository` +
  `campaign-publication.mapper.ts` — mapeo tipado fila→entidad con
  parsers estrictos (`parseEnum`/`parseJsonObject`/`parseDate`, mismo
  criterio que `CampaignActivationMapper`), nunca expone tipos Supabase
  al dominio/aplicación. Errores de RPC mapeados a
  `NOT_FOUND|FORBIDDEN|CONFLICT|VALIDATION_ERROR|INTERNAL_ERROR` via
  `mapPublicationRpcError` (mismo patrón que
  `mapActivationRpcError`).
- `CampaignActivationRepository` (8A.1) se extendió con
  `markTargetPublishing`/`markTargetFailed`, implementados en
  `SupabaseCampaignActivationRepository` llamando a las 2 RPCs nuevas de
  target.

---

## 9. Webhook receipt foundation

Persistido, **sin endpoint HTTP** (diferido a 8B.3 por decisión explícita
del kickoff):
- `record_publication_webhook_receipt(provider, external_event_id,
  payload_hash)` — valida `provider` (cast a enum cerrado, rechaza
  `'manual'`) ANTES de cualquier INSERT, inserta con `ON CONFLICT (provider,
  external_event_id) DO NOTHING`, retorna `isNew: false` cuando detecta
  replay.
- `mark_webhook_event_processed(...)` — correlaciona `job_id`/
  `organization_id`/`attempt_id` una vez resueltos, marca
  `processed|failed`, inserta un evento `webhook_received` cuando aplica.
- `payload_hash` exige regex `^[0-9a-f]{64}$` (SHA-256 hex) — el body
  crudo nunca se persiste.
- Sin GRANT ni política RLS para `authenticated` en
  `campaign_publication_webhook_events` — acceso exclusivo vía las 2 RPCs
  `service_role`, mismo criterio que `automation_webhook_events`.

---

## 10. Política de reconciliación

- **Default:** `DEFAULT_PUBLICATION_RECONCILIATION_TIMEOUT_MINUTES = 15`
  en `packages/shared/src/constants/publication.ts` — constante nombrada,
  no un número mágico disperso.
- **Persistencia:** `start_publication_job(p_job_id, p_reconciliation_
  timeout_minutes integer DEFAULT 15)` computa y persiste
  `reconciliation_deadline_at = now() + p_reconciliation_timeout_minutes`
  por job — el valor exacto queda en la fila, no depende de releer la
  constante después.
- **Override:** cualquier caller (8B.3, o un futuro proveedor con SLA
  distinto) puede pasar un valor distinto en la llamada — la RPC no
  hardcodea 15 como invariante irreversible.
- Índice parcial `idx_publication_jobs_in_progress_deadline` deja lista
  la consulta que un futuro worker de reconciliación periódica (8B.3)
  necesitará (`WHERE status = 'in_progress'`).
- Esta subfase NO implementa el worker/cron — solo la persistencia y el
  cómputo del deadline.

---

## 11. Runtime validation

**No se aplicó la migración contra ningún Postgres real.** Verificado
explícitamente en este entorno:
```
$ which supabase docker psql     → ninguno instalado
$ npx supabase --version         → "No matching Supabase CLI binary package found for linux-x64"
```
Mismo bloqueo exacto que 8A.1 documentó. En su lugar, se realizó:

1. **Revisión estática de sintaxis**: conteo de balance de `CREATE
   FUNCTION`/`AS $$`/cierres `$$;` (21/21/21), balance de paréntesis
   (499/499), balance de `DO $$`/`$$;` (3 bloques adicionales) — sin
   discrepancias.
2. **56 tests de contrato de texto** (`phase8b1-migration-security.test.ts`)
   que verifican por regex/estructura las 17 propiedades de seguridad del
   kickoff §16 que son verificables estáticamente:

| # | Check del kickoff §16 | Resultado |
|---|---|---|
| 1 | Creación válida de job | No ejecutable sin DB — verificado por lectura de `create_publication_job` (revalida rol/status/provider antes de INSERT). |
| 2 | Rechazo de idempotencia duplicada | Constraint `UNIQUE` presente y verificada por test estático (no ejecutada). |
| 3 | Rechazo cross-org/cliente | Trigger `check_publication_job_target_match` presente y verificado por test estático. |
| 4 | Rechazo de provider/channel inválido | `CHECK (provider <> 'manual')` + cast a enum cerrado en webhook RPC, verificado estáticamente. |
| 5 | Role enforcement | 14/14 RPCs verificadas por test: 3 `authenticated`-only, 11 `service_role`-only, sin solapamiento. |
| 6 | Cancelación queued/claimed por operator+ | Verificado por lectura de `cancel_publication_job` + test estático de `has_organization_role(..., 'operator')`. |
| 7 | Cancelación in_progress denegada a operator | Verificado: la rama `in_progress` exige `'strategist'`, no `'operator'`. |
| 8 | Cancelación in_progress permitida a strategist+ | Verificado por lectura de código. |
| 9 | Reconciliación unknown_outcome denegada a operator | `reconcile_publication_job` exige `'strategist'` explícitamente. |
| 10 | Reconciliación unknown_outcome permitida a strategist+ | Verificado por lectura de código. |
| 11 | Append-only de eventos (UPDATE/DELETE rechazados) | Triggers `trg_publication_events_no_update/delete` presentes, verificados por test estático (comportamiento en runtime NO ejecutado). |
| 12 | Dedupe de replay de webhook | `ON CONFLICT (provider, external_event_id) DO NOTHING` verificado por test estático. |
| 13 | Guardas de transición terminal | Trigger `protect_publication_job_immutable_fields` + revalidación de status en cada RPC, verificados por test estático. |
| 14 | Sin auto-transición de activation/campaign | Ninguna RPC de esta migración hace `UPDATE` sobre `campaign_activations`/`campaigns` — solo sobre `campaign_activation_targets` (transición ya prevista por 8A.1) — verificado por lectura completa del archivo. |
| 15–17 | (duplicados de 2/3/4 en la lista original) | Cubiertos arriba. |

**Conclusión de validación (al momento de esta subfase):** 100% revisión
estática, 0% runtime real. Documentado como R-PUB-11 en el risk register
— idéntico en naturaleza al que 8A.1 dejó abierto.

### Actualización — 2026-08-27 (post-aplicación por el usuario)

El usuario confirmó que aplicó `20260825120000_phase8b1_publication_domain_persistence.sql`
exitosamente contra su Supabase local (fuera de este entorno de
ejecución, que sigue sin `supabase`/`docker`/`psql` disponibles). Estado
actualizado:

1. **Migración: APLICADA** (por el usuario, contra Postgres local real).
   No aplicada ni ejecutada desde este entorno — solo se recibió la
   confirmación del usuario, no se pidió ni se recibió el output crudo de
   `supabase db push`/`migration up` (fuera del alcance de esta
   actualización; si se necesita auditar ESE paso específico, es un pedido
   separado).
2. **Fixture de validación runtime: CREADO Y REVISADO, EJECUCIÓN
   PENDIENTE.** `supabase/fixtures/phase8b1_local_runtime_validation.sql`
   (24 checks) + `supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql`
   ya existen, siguen el mismo patrón exacto que
   `phase8a1_local_runtime_validation.sql` (guarda de entorno local,
   `set_config`/`SET ROLE` para simular actores reales, `DO $$ ...
   EXCEPTION WHEN OTHERS` por verificación negativa, salida
   `RESULT: <n> ... = PASS|FAIL` grep-eable) y fueron re-revisados línea
   por línea en esta ronda (ver "Nota de re-revisión 2026-08-27" más abajo).
   **Ningún check de runtime se marca como PASS en este reporte** hasta
   que el usuario ejecute el fixture y pegue el output real de vuelta —
   ver sección 18 para el comando exacto.
3. Los 17 checks de runtime originales del kickoff siguen sin datos reales
   — el fixture los cubre (y añade 7 más, hasta #24), pero **cero líneas
   de output real han sido observadas todavía por esta sesión.**

**Regla explícita de esta actualización: ningún check de la tabla de
arriba, ni ningún ítem del veredicto (sección 17), cambia de "revisado
estáticamente" a "confirmado en runtime" hasta que el usuario pegue el
output completo del fixture.**

### Nota de re-revisión 2026-08-27 (static review de esta ronda)

Se re-ejecutaron, en esta misma ronda, typecheck + lint de los 4 paquetes
tocados por 8B.1 (`shared`, `domain`, `infrastructure`, `application`) —
los 4 limpios, sin cambios necesarios. Se re-corrieron los tests
específicos de publication: `domain` (70/70 passed), `infrastructure`
(mapper + `phase8b1-migration-security`, 71/71 passed), y la suite
completa de `application/src/use-cases/activations` (65/65 passed,
incluye los 3 archivos cuyos mocks fueron extendidos con
`markTargetPublishing`/`markTargetFailed`). Cero regresiones.

Se revisó línea por línea cada uno de los 4 archivos de Phase 8A que
8B.1 modificó, para confirmar que ninguno introdujo acoplamiento fuera de
alcance:

- **`packages/domain/src/repositories/campaign-activation.repository.ts`**:
  únicamente 2 firmas de método nuevas agregadas al final de la interfaz
  (`markTargetPublishing`, `markTargetFailed`) — ningún método existente
  fue modificado ni removido. Ambas firmas devuelven
  `Result<CampaignActivationTarget>` (mismo tipo que el resto de
  transiciones de target) y no importan ningún tipo de `campaign-publication`
  — la interfaz de activation permanece sin conocer la existencia de
  `CampaignPublicationJob`.
- **`packages/infrastructure/src/supabase/repositories/supabase-campaign-activation.repository.ts`**:
  2 métodos nuevos, cada uno siguiendo el patrón exacto ya establecido por
  `markTargetReady`/`markTargetPublished` (fetch existente →  RPC → re-fetch
  → mapeo de error). Ninguna llamada a ningún adapter de proveedor, ningún
  import de `campaign-publication.*`, ningún acceso a n8n.
- **`packages/domain/src/index.ts`** / **`packages/infrastructure/src/index.ts`**:
  puramente aditivos — bloques de export nuevos para las entidades/
  repositorio/mapper de `campaign-publication`, insertados después de los
  bloques existentes de Phase 8A. Ningún export existente fue reordenado,
  renombrado, ni removido.

**Conclusión de la re-revisión: no se encontró ningún acoplamiento
innecesario que revertir.** La única superficie nueva que 8A expone hacia
8B es exactamente las 2 transiciones de status que el propio diseño de
8A.1 ya dejó previstas en el enum (`publishing`/`failed` ya existían en
`ActivationTargetStatus` desde 8A.1 — 8B.1 solo les dio un caller real,
un worker/RPC de sistema, nunca un usuario). No se requirió ningún
revert.

---

## 12. Tests — totales exactos

Comandos ejecutados: `npm run --workspace @bop-agency/<pkg> test`
(vitest run), en lotes por archivo cuando el suite completo excedía el
límite de 45s del bridge de este entorno (overhead de arranque de vitest
por archivo, no un problema de código — confirmado corriendo cada lote
hasta cubrir el 100% de los archivos).

| Paquete | Archivos corridos | Tests | Resultado |
|---|---|---|---|
| `@bop-agency/shared` | 8/8 (100%) | 115 | 115 passed, 0 failed |
| `@bop-agency/domain` | 19/19 (100%) | 402 | 402 passed, 0 failed |
| `@bop-agency/infrastructure` | 26/35 (74% — `src/ai/*` y `src/n8n/*`, 9 archivos no tocados por esta subfase, no re-corridos) | 511 | 511 passed, 0 failed |
| `@bop-agency/application` | 3/3 archivos de `use-cases/activations` (los únicos afectados por el cambio de interfaz) | 65 | 65 passed, 0 failed |

Tests nuevos de esta subfase: 70 en `domain` (job: 54, attempt: 7, event:
6, webhook-event: 3), 9 en `shared`, 71 en `infrastructure` (56 de guarda
estática de migración + 15 del mapper).

---

## 13. Typecheck / lint

| Paquete | typecheck | lint |
|---|---|---|
| `@bop-agency/shared` | ✅ limpio | ✅ limpio |
| `@bop-agency/domain` | ✅ limpio | ✅ limpio |
| `@bop-agency/infrastructure` | ✅ limpio (tras corregir un `*/ ` accidental en un comentario que cerraba el bloque JSDoc antes de tiempo, y un `no-non-null-assertion` en el test estático — ver detalle abajo) | ✅ limpio |
| `@bop-agency/application` | ✅ limpio (tras actualizar 3 mocks de test para incluir los 2 métodos nuevos de la interfaz) | ✅ limpio |
| `apps/web` | ✅ limpio (sin cambios de código en este paquete; typecheck completo re-verificado tras el cambio de interfaz de dominio) | *(no corrido — sin cambios)* |

Detalle de correcciones durante el ciclo typecheck/lint: (1) un comentario
JSDoc en `supabase-campaign-publication.repository.ts` contenía la
secuencia literal `*/` dentro de una lista (`record*/mark_*`), cerrando el
bloque de comentario antes de tiempo y produciendo ~30 errores de parseo
en cascada — corregido reescribiendo la lista sin asteriscos. (2) 9
usos de `!` (non-null assertion) en el archivo de test estático de la
migración, prohibidos por la regla `@typescript-eslint/no-non-null-assertion`
del proyecto — refactorizados con un helper `mustMatch()` que hace
`expect(m).not.toBeNull()` y retorna el match ya tipado sin `!`.

---

## 14. Seguridad — respuestas explícitas (kickoff §18)

| Punto | Respuesta |
|---|---|
| Sin providers arbitrarios | `provider` en `campaign_publication_jobs` es `activation_provider` (enum ya cerrado de 8A.1) con `CHECK (provider <> 'manual')`; el webhook RPC castea a ese mismo enum antes de cualquier INSERT — un valor no reconocido lanza excepción de Postgres, nunca se persiste. |
| Sin actor spoofing | Las 3 RPCs de usuario (`create_publication_job`, `cancel_publication_job`, `reconcile_publication_job`) derivan el actor exclusivamente de `auth.uid()`; ninguna acepta un parámetro de actor/usuario — verificado por test estático. |
| Sin dependencia de service_role en flujos normales | Las 3 RPCs de usuario tienen GRANT a `authenticated` y explícitamente NO a `service_role`; las 11 RPCs de sistema tienen GRANT solo a `service_role` y nunca a `authenticated` — ambas direcciones verificadas por test. |
| Sin almacenamiento de secretos | Ninguna columna de las 4 tablas nuevas almacena `secret_value`/`token_value`/`api_key`/`access_token` (grep negativo verificado); `client_integration_id` es solo una FK de referencia, nunca copia `configuration`. |
| Sin logging de tokens crudos | `provider_error_code`/`failure_message`/`note` tienen límites de longitud y el diseño documenta que el CALLER debe sanitizar antes de invocar — la migración no re-expone ningún campo sin sanitizar por diseño propio (no hay ningún `RAISE NOTICE`/log de payload crudo en ninguna RPC). |
| Sin referencia cross-client de integración | Trigger `check_publication_job_target_match` verifica `client_integration_id` del job contra el del target real — un valor distinto lanza excepción antes del INSERT. |
| Sin ruta de publicación duplicada | `UNIQUE (target_id) WHERE status NOT IN terminal` a nivel DB (no solo aplicación) — protege doble-click, retry de red, y creación concurrente. |
| Sin retry ciego desde unknown_outcome | `canRetryPublicationJob` (dominio) y `create_publication_job` (RPC, valida `failure_category` del job referenciado) excluyen explícitamente `unknown_outcome`; solo `failed` con categoría retryable es elegible. |
| Eventos append-only | Triggers `trg_publication_events_no_update/delete` + ausencia total de GRANT UPDATE/DELETE — doble capa. |
| Replay protection de webhook | `UNIQUE (provider, external_event_id)` + `ON CONFLICT DO NOTHING` en `record_publication_webhook_receipt`. |
| Chequeos de rol en RPC | Las 3 RPCs de usuario verifican `has_organization_role` con el rol mínimo correcto en cada rama de status — verificado línea por línea y por test. |
| Aislamiento de tenant | `organization_id` denormalizado + verificado por trigger en las 4 tablas; RLS `is_organization_member` en SELECT de jobs/attempts/events. |
| Sin auto-activación de campaña | Ninguna RPC de esta migración toca `campaign_activations.status`/`campaigns.status` — solo `campaign_activation_targets.status` (transición ya prevista y cerrada en 8A.1: `publishing`/`failed`). |
| Sin autoridad de dominio en n8n | Cero menciones de código a n8n en la migración (solo un comentario explicando su ausencia, verificado por test que excluye líneas de comentario). |
| Sin llamadas HTTP a proveedor en todo el código | No se agregó ningún cliente HTTP, fetch, ni SDK de Meta/Google/LinkedIn en ningún paquete — grep confirmado, y el diseño (§9 del kickoff) es explícito en que esta subfase es persistencia pura. |

---

## 15. Documentación actualizada

- ✅ `PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md` (este archivo, nuevo).
- ✅ `PHASE_8_IMPLEMENTATION_PLAN.md` — 8B.1 marcada COMPLETE, resumen top actualizado.
- ✅ `PHASE_8_RISK_REGISTER.md` — sección "Actualización — Phase 8B.1" con el estado de R-PUB-01..10 tras esta implementación, y R-PUB-11 (riesgo nuevo: falta de validación runtime real) agregado.

---

## 16. Riesgos abiertos

1. **R-PUB-11 (actualizado 2026-08-27 — High→Medium)** — la migración
   completa (4 tablas, 7 triggers de integridad, 14 RPCs) **ya fue
   aplicada por el usuario contra su Supabase local**. Lo que sigue
   abierto es exclusivamente la EJECUCIÓN del fixture de validación
   runtime (`supabase/fixtures/phase8b1_local_runtime_validation.sql`,
   creado y revisado en esta ronda) y la revisión del output real por
   parte de esta sesión — ningún check de los 24 del fixture se
   considera pasado hasta que el usuario pegue ese output de vuelta. Ver
   sección 11 y sección 18 (comando exacto).
2. **R-PUB-02** (credential leakage vía error de proveedor) — sigue sin
   poder verificarse en la práctica porque no existe ningún adapter real
   todavía; la mitigación de diseño (límites de longitud + responsabilidad
   del caller de sanitizar) está en su lugar pero no ejercitada.
3. **R-PUB-06** (job huérfano) — el fundamento (deadline persistido +
   índice) está listo, pero el worker de reconciliación periódica en sí
   no existe (correctamente diferido a 8B.3).
4. **R-PUB-09** (vault para `client_integrations`) — sin cambio, precondición dura para 8E/8F, no tocada en 8B.1.
5. Cobertura de tests de `packages/infrastructure/src/ai` y `src/n8n` no
   fue re-corrida en esta ronda (paquetes no tocados por 8B.1) — riesgo
   bajo, ningún archivo de esos directorios fue modificado.

---

## 17. Verdict

**NO LISTO para commit — actualizado 2026-08-27 tras Run 1.** La
migración ya fue aplicada por el usuario contra Postgres local real, y el
resto del código (dominio/aplicación/infraestructura) sigue con
typecheck/lint limpios y 1093+ tests pasando (sin regresiones). Pero
**Run 1 del fixture de validación runtime NO pasó** — un bug de setup del
propio fixture (SECCIÓN 3, ver sección 19.1) hizo que la mayoría de los
checks nunca se ejecutaran de verdad. El fixture fue corregido y
endurecido en esta ronda (ver sección 19 completa); se requiere una
**Run 2** antes de poder evaluar el veredicto final de R-PUB-11. Ningún
adapter de proveedor real, orquestación de aplicación, UI, ni
acoplamiento a n8n fueron agregados — el alcance de 8B.1 sigue siendo
exactamente el definido por el kickoff y el audit 8B.0.

**IMPORTANTE — esta sesión NO marca ningún check de runtime como pasado.**
Los checks del fixture se consideran PASS únicamente cuando el usuario
pega el output real de la Run 2 y esta sesión lo revisa línea por línea
contra `grep '^RESULT:.*FAIL'` (debe estar vacío) — ver sección 19.7 y 20.

---

## 18. Ejecución del fixture — instrucciones exactas para el usuario

**Archivo del fixture:** `supabase/fixtures/phase8b1_local_runtime_validation.sql`
**Archivo de cleanup (opcional, NO se ejecuta automáticamente):**
`supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql`

### Prerrequisito

El fixture asume que ya existe, en la misma base de datos local, la
organización `"BopAgency Local"` con al menos un miembro `owner` — el
mismo fixture/organización que `phase8a1_local_runtime_validation.sql`
ya creó en la subfase 8A.1. Si esa organización NO existe todavía en esta
base local, el fixture aborta de inmediato (SECCIÓN 0) con el mensaje
`ABORT phase8b1_local_runtime_validation: no existe organizacion
"BopAgency Local"` — en ese caso, correr primero
`phase8a1_local_runtime_validation.sql` (o crear esa organización
manualmente) antes de este fixture. Ningún UUID ni credencial adicional
es necesario — el script resuelve todos los IDs que necesita por sí
mismo (owner de esa organización, org "foránea" B, clientes, campaña,
etc.), todos con nombres/slugs prefijados `phase8b1-smoke-*` /
`Phase8B1 Smoke *` para no chocar con datos reales.

### Comando exacto — PowerShell (Windows), asumiendo Supabase local vía Docker Desktop

```powershell
# Desde la raíz del repo (donde está la carpeta `supabase\`):
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabaseixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabaseixtures\phase8b1_runtime_output.txt
```

Si el nombre del contenedor de tu Postgres local no es exactamente
`supabase_db_BopIAgency`, confírmalo primero con:

```powershell
docker ps --format "table {{.Names}}	{{.Image}}" | Select-String "supabase_db"
```

y sustituye el nombre real en el comando de arriba.

### Alternativa — PowerShell sin Docker, contra el puerto expuesto por `supabase start`

Según `supabase/config.toml` (`[db] port = 54722` — puerto local
personalizado de este proyecto, no el 54322 por defecto de Supabase):

```powershell
psql "postgresql://postgres:postgres@127.0.0.1:54722/postgres" `
  -v ON_ERROR_STOP=0 `
  -f supabaseixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabaseixtures\phase8b1_runtime_output.txt
```

Requiere `psql` en el PATH de Windows (viene con la instalación de
PostgreSQL, o con `scoop install postgresql` / la CLI de Supabase local).

### Qué debes pegar de vuelta

El contenido completo de `supabaseixtures\phase8b1_runtime_output.txt`
(o, como mínimo, todas las líneas que empiecen con `RESULT:` — puedes
extraerlas tú mismo antes de pegar con:
`Select-String -Path supabaseixtures\phase8b1_runtime_output.txt -Pattern '^RESULT:'`).
Hay 24 checks numerados (`RESULT: <sección>.<n> ... = PASS|FAIL`); esta
sesión no dará por buena ninguna corrida donde aparezca al menos una
línea `= FAIL` sin antes analizar cuál y por qué.

### Qué esperar si todo sale bien

- El bloque de la SECCIÓN 0 debe imprimir exactamente una línea:
  `RESULT: 0.1 guarda de entorno local = PASS (...)`. Si en cambio ves un
  `ERROR: ABORT phase8b1_local_runtime_validation: ...` y el script se
  detiene ahí, tu base no es local, o le falta el fixture de
  `"BopAgency Local"` — ningún dato fue escrito.
- Las 24 líneas `RESULT:` restantes deben decir todas `= PASS`. Un `=
  FAIL` en cualquiera de ellas es información real y valiosa — pégalo tal
  cual, no lo omitas ni lo resumas; esta sesión necesita el texto
  exacto (incluye el detalle entre paréntesis, p. ej. el `SQLERRM` real)
  para diagnosticar.
- El script es repetible: correrlo dos veces seguidas no debe romper nada
  (organización/cliente/integraciones se de-duplican por slug; la
  campaña smoke se reusa state-aware; activations/targets/jobs nuevos se
  crean en cada corrida, sin colisión).
- Duración esperada: pocos segundos (todo en una sesión `psql`, sin
  llamadas de red externas).

### Limpieza (opcional, después de revisar el output)

Si quieres borrar la smoke data no-histórica (organización "foránea" B,
sus clientes/integraciones, y la campaña+approval smoke) una vez
confirmado el resultado:

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabaseixtures\phase8b1_local_runtime_validation_cleanup.sql
```

Nota: las filas de `campaign_activations`/`campaign_activation_targets`/
`campaign_publication_jobs` (y sus tablas de auditoría) del fixture
quedan como histórico permanente por diseño — la migración de 8B.1 no
otorga ningún `DELETE` sobre esas 4 tablas nuevas, y los triggers de 8A.1
protegen los targets que salieron de `pending`. Esto es intencional (ver
el encabezado del propio archivo de cleanup) y NO requiere ninguna acción
de tu parte — no se debe deshabilitar RLS/triggers para forzar ese
borrado.

---

## 19. Run 1 — Defect triage + hardening (2026-08-27)

El usuario ejecutó el fixture de la sección 18 contra su Supabase local
real. **Run 1 NO pasó.** Esta sección documenta la triage completa, las
correcciones aplicadas al fixture, y deja explícito que **ningún check de
runtime se considera pasado todavía** — se requiere una Run 2.

### 19.1 Hallazgo primario — fallo de setup del fixture (no de la migración)

`RESULT: 3.4 activations/targets de trabajo creados = FAIL` —
`23505 duplicate key value violates unique constraint
"uq_campaign_activations_active_per_campaign"`.

**Causa raíz confirmada por lectura línea por línea:** la versión original
de la SECCIÓN 3 usaba **una sola** campaña aprobada compartida y creaba 6
`campaign_activations` sobre ella (una por escenario: happy-path,
failure-retry, unknown-outcome, cancel-queued, cancel-in-progress,
manual-rejected) dentro de la misma corrida. `uq_campaign_activations_active_per_campaign`
(constraint de 8A.1, correcto por diseño) permite como mucho **una**
activation no-terminal por campaña — la 2ª INSERT (escenario B) violaba
el constraint de inmediato. Como el bloque `DO $seed_targets$` es una
única transacción implícita, la excepción revirtió **todo** el trabajo del
bloque (incluida la activation A que sí se había insertado), dejando los
13 ids de setup (`campaign_a`, `activation_a..e`/`manual`,
`target_a..e`/`manual`) en NULL para el resto del script — de ahí la
cascada de `target not found (id: <NULL>)` / `job not found (id: <NULL>)`
en las secciones 4-13.

**Clasificación: defecto de FIXTURE (harness), no de la migración.** El
constraint hizo exactamente lo que debía.

**Fix aplicado** (`supabase/fixtures/phase8b1_local_runtime_validation.sql`,
SECCIÓN 3 reescrita):
1. Cada escenario ahora usa **su propia** campaña aprobada aislada
   (`'Phase8B1 Smoke Campaign A (happy path)'` … `'... Manual (rejected)'`,
   6 en total) vía un nuevo helper parametrizado
   `pg_temp.p8b1_get_or_create_approved_campaign(p_name)` — evita el
   constraint sin tocarlo, y preserva el diseño original de aislamiento
   total por escenario (necesario para los checks #21/#22/#23 de
   auto-transición, que ya dependían de que cada activation derive su
   status solo de sus propios targets).
2. `pg_temp.p8b1_new_activation` ahora es **state-aware**: reusa la
   activation no-terminal existente de esa campaña si ya hay una, y solo
   crea una nueva si no existe ninguna o si la anterior ya es terminal —
   necesario porque los escenarios D/E/manual terminan a propósito en un
   status no-terminal permanente (cancelar un job `in_progress` nunca
   transiciona el target — R-PUB-08; un target manual nunca se toca en
   este script), así que sin este reuso una 2ª corrida volvería a violar
   el mismo constraint.
3. Nueva SECCIÓN 3.5 ("guarda de setup"): verifica que los 13 ids críticos
   existan antes de continuar, y reporta `RESULT: 3.5 ... = PASS|FAIL`
   explícito.
4. Nuevo guard `\gset`/`\if :setup_ok` (control de flujo nativo de psql,
   client-side) envolviendo las SECCIONES 4-13 completas: si el setup no
   produjo los 13 ids, esas ~40 checks se **saltan** con una única línea
   `RESULT: 4-13 (...) = SKIPPED (...)` en vez de generar docenas de FAIL
   engañosos. Se eligió `\if` (no editar los 43 bloques `EXCEPTION WHEN
   OTHERS` de esas secciones) porque `ON_ERROR_STOP=0` — necesario para
   que la SECCIÓN 1/2, de solo inspección, no aborte el script ante una
   diferencia de columna — hace que un `RAISE EXCEPTION` sin capturar
   dentro de un `DO` no detenga el resto del script; `\if` es la única
   herramienta de este harness que sí puede saltar un rango completo de
   statements.
5. Limitación residual documentada (no resuelta, no bloqueante para Run
   2): en corridas 3+ del fixture, targets no-terminales acumulados de
   corridas anteriores en escenarios D/E/manual podrían, en teoría,
   afectar el status derivado de la activation reusada antes de que el
   target fresco de esa corrida exista (`deriveActivationStatus` prioriza
   "algún target publishing → executing"). No ejercitado ni verificado —
   ver el encabezado del fixture. Recomendación: para una validación de
   múltiples corridas completamente limpia, resetear la base local entre
   corridas; una única corrida (o una 2ª inmediata) es el caso que esta
   corrección garantiza.
6. `supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql`
   actualizado para borrar las 6 campañas (`LIKE 'Phase8B1 Smoke Campaign %'`)
   en vez de 1 sola.

### 19.2 Potencial defecto #1 — append-only (8.8a/8.8b/8.9): NO es un defecto real

**Clasificación: falso positivo, 100% cascada del hallazgo 19.1.**

Verificado por lectura de la migración
(`20260825120000_phase8b1_publication_domain_persistence.sql`, líneas
~567-628): `trg_publication_events_no_update`/`no_delete` y
`trg_publication_attempts_no_update`/`no_delete` son triggers `BEFORE
UPDATE/DELETE FOR EACH ROW` que `RAISE EXCEPTION` incondicionalmente — la
definición es correcta y no distingue por rol (ni siquiera el
superusuario/dueño de tabla los evade, por diseño).

El problema es que `v_any_event_id`/`v_attempt1` en el fixture se
resolvían buscando filas por `job_id = job_a1` (o por la clave
`attempt_a1`) — ambos NULL por la cascada de 19.1. Un
`UPDATE/DELETE ... WHERE id = NULL` no afecta ninguna fila, por lo que el
trigger `FOR EACH ROW` **nunca se ejecuta** — el statement "tiene éxito"
(0 filas afectadas) sin ningún error, y el check reportaba
`= FAIL (¡se permitió, DEFECTO!)` de forma **falsa**: nunca se intentó
mutar una fila real.

**Fix aplicado:** guardas explícitas — si el id resuelto es NULL, el check
ahora reporta `SKIPPED` (nunca `FAIL` ni `PASS` fabricado) y no intenta
ningún UPDATE/DELETE. Una vez que 19.1 esté corregido (ya lo está), estos
3 checks deberían ejercitar una fila real y probar el trigger de verdad
en la Run 2.

### 19.3 Potencial defecto #2 — mark_webhook_event_processed (12.5): defecto de FIXTURE confirmado

**Clasificación: defecto de FIXTURE (harness), NO de la migración/RPC —
confirmado por lectura exacta del GRANT/REVOKE, no por suposición.**

`public.mark_webhook_event_processed` es `SECURITY DEFINER SET search_path
= public` — corre con los privilegios de su dueño (quien aplicó la
migración), no del caller; su lógica interna solo hace `INSERT INTO
campaign_publication_events` cuando `p_job_id IS NOT NULL AND
p_organization_id IS NOT NULL` (no aplica en este caso porque el checkeo
completo del bloque también resolvía `v_job` desde `job_a1`, NULL por la
cascada — pero **ese no era el origen real del error**, ver abajo).

El check 12.5 hacía, en el fixture original:
```sql
SET ROLE service_role;
PERFORM public.mark_webhook_event_processed(...);
SELECT count(*) INTO v_events_after_1 FROM public.campaign_publication_events ...;  -- <- BUG: aún como service_role
PERFORM public.mark_webhook_event_processed(...);
SELECT count(*) INTO v_events_after_2 FROM public.campaign_publication_events ...;  -- <- BUG: aún como service_role
RESET ROLE;  -- <- demasiado tarde, solo resetea DESPUÉS de ambos SELECT
```

Verificado en la migración (línea 1772): `REVOKE ALL ON public.campaign_publication_events
FROM anon, authenticated, service_role;` seguido de `GRANT SELECT ...  TO
authenticated;` — **`service_role` no tiene ningún grant sobre esta tabla,
ni siquiera SELECT** (por diseño: toda escritura pasa por las RPCs
`SECURITY DEFINER`, que corren como su dueño, no como el caller). Los dos
`SELECT count(*) ... FROM campaign_publication_events` de diagnóstico
quedaban atrapados dentro de la ventana `SET ROLE service_role` (el
`RESET ROLE` solo ocurría al final, después de ambos) — un SELECT directo
como `service_role` contra esa tabla, sin ningún grant, produce
exactamente `permission denied for table campaign_publication_events`.
**La migración/RPC están correctas** — el diseño deliberado es que
`service_role` no tenga acceso ambiental directo a estas tablas.

**Fix aplicado:** `RESET ROLE` ahora ocurre inmediatamente después de cada
llamada a la RPC, antes de cada SELECT de diagnóstico — mismo criterio ya
usado por `v_events_before` (que sí corría fuera de la ventana de rol
elevado y nunca falló).

### 19.4 Role matrix — auth.users insuficientes: se mantiene ESTRUCTURAL (opción B)

Run 1 no pudo runtime-testear viewer/operator/strategist por falta de
`auth.users` libres en la base local del usuario. Este mismo patrón
("reusa auth.users existentes que aún no son miembros, nunca fabrica uno
nuevo, reporta ESTRUCTURAL si no alcanza") ya es la decisión **aceptada**
de 8A.1 (`phase8a1_local_runtime_validation.sql` SECCIÓN 11.3, texto casi
idéntico) — no hay ningún precedente en este repositorio de crear
`auth.users` de forma segura (requeriría reproducir correctamente
`instance_id`/`auth.identities`/formato de `encrypted_password` de GoTrue,
con riesgo real de desestabilizar el Auth local si algo queda mal). **No
se implementó creación de `auth.users`** — se mantiene la Opción B
(estructural), consistente con la decisión ya aceptada en 8A.1. Si el
usuario quiere cobertura runtime completa del role matrix, la vía más
segura es crear 3 usuarios de prueba desechables una vez, manualmente,
vía Supabase Studio/CLI local (fuera de este fixture) — no algo que este
script deba automatizar dado el riesgo/beneficio.

### 19.5 Checks que ya pasaron en Run 1 (preservados, no se tocaron)

Confirmado que el fix de 19.1 no modifica ninguna de las secciones que ya
pasaban: guarda de entorno (0.1), existencia de las 14 RPCs (1.1), split
de grants 3 authenticated/11 service_role (1.2), resolución de fixtures
org/cliente/integración (2.x), campaña aprobada + approval real (3.1 —
ahora ×6, ver 19.1), rechazo de provider inválido, rechazo de channel
inválido, rechazo de actor no autenticado, primera recepción de webhook
(12.1), dedupe de replay de webhook (12.2), rechazo de provider inválido
en webhook (12.3), rechazo de provider manual en webhook (12.4), ausencia
de side-effects de tasks/alerts/automation/n8n (13.x). Ninguno de estos
bloques fue modificado en esta ronda salvo donde se indica explícitamente
arriba (12.5).

### 19.6 Archivos modificados en esta ronda

- `supabase/fixtures/phase8b1_local_runtime_validation.sql` — SECCIÓN 3
  reescrita (6 campañas aisladas + reuso state-aware de activation),
  nueva SECCIÓN 3.5 (guarda de setup), nuevo guard `\gset`/`\if`/`\endif`
  envolviendo SECCIONES 4-13, guardas NULL en 8.8a/8.8b/8.9, fix de
  `SET ROLE`/`RESET ROLE` en 12.5, cabecera actualizada.
- `supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql` —
  actualizado a `LIKE 'Phase8B1 Smoke Campaign %'` (6 campañas, no 1) +
  nota de corrección en el encabezado.
- `docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md`
  (esta sección, nueva).
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` (actualizado —
  ver sección correspondiente).

**Ningún archivo de migración fue modificado.**
`20260825120000_phase8b1_publication_domain_persistence.sql` permanece
exactamente como fue aplicado por el usuario — no se necesitó ninguna
migración correctiva nueva, porque los 2 "potenciales defectos" resultaron
ser, tras la investigación, defectos de fixture (harness), no de la
migración/RPCs. Si una Run 2 revelara un defecto REAL de la migración, la
corrección iría en una migración forward nueva (nunca editando la ya
aplicada) — no aplica en esta ronda.

### 19.7 Veredicto de esta ronda

**8B.1 sigue NO LISTO.** Ningún check de runtime se marca como pasado
todavía — Run 1 nunca llegó a ejercitar la mayoría de la superficie real
(cascada de NULL desde 3.4). Se requiere una **Run 2** con el fixture
corregido. Ver sección 20 para el comando exacto.

---

## 20. Comando exacto para la Run 2 (retry)

Mismo comando que la sección 18 (el fixture es el mismo archivo, ahora
corregido — no cambió de nombre ni de ubicación):

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabase\fixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabase\fixtures\phase8b1_runtime_output_run2.txt
```

(Nombrar el archivo de salida `..._run2.txt`, distinto del de Run 1, para
no perder la evidencia de la corrida anterior — mismo criterio que
`phase8a1_runtime_output_run1.txt`/`_run2.txt`.)

Si tu contenedor no se llama `supabase_db_BopIAgency`, confírmalo con:
```powershell
docker ps --format "table {{.Names}}\t{{.Image}}" | Select-String "supabase_db"
```

Qué pegar de vuelta: el output completo, o como mínimo todas las líneas
`RESULT:` (`Select-String -Path supabase\fixtures\phase8b1_runtime_output_run2.txt -Pattern '^RESULT:'`).
Presta atención especial a:
- `RESULT: 3.4 ... = PASS` (antes fallaba aquí — si Run 2 también falla
  aquí, es una segunda causa distinta, no la ya corregida).
- `RESULT: 3.5 guarda de setup (13/13 ids criticos presentes) = PASS`.
- Si 3.5 = FAIL, deberías ver **una sola** línea
  `RESULT: 4-13 (...) = SKIPPED (...)` y nada más de las secciones 4-13 —
  si en cambio ves las ~40 líneas individuales otra vez, el guard `\if` no
  se activó (avísame con el output completo).
- `RESULT: 8.8a/8.8b/8.9` — deberían decir `PASS` (rechazado por trigger)
  esta vez, no `SKIPPED` ni el falso `FAIL` de Run 1.
- `RESULT: 12.5` — ya no debería fallar por `permission denied`.

**No se marca ningún check como PASS hasta que pegues el output real de
la Run 2.**

## 21. Run 2 — Defect triage + hardening (2026-08-27)

Run 2 (con el fixture ya corregido de la ronda anterior) confirmó que el
setup quedó sano: `3.4 = PASS`, `3.5 = PASS (13/13 ids críticos)`. A partir
de ahí el runtime real (Postgres/Supabase local, no inspección estática)
expuso 5 problemas nuevos, triagenados uno por uno abajo. Ninguno de los
checks "CONFIRMADOS BUENOS" de rondas anteriores (guarda de entorno, 14
RPCs, split de grants, resolución org/client/integration, rechazo
cross-org/cross-client/cross-integration/provider inválido/canal
inválido/job activo duplicado, constraint única de job activo, rechazo de
actor no autenticado, append-only real de `campaign_publication_events`,
unicidad de replay de webhook, rechazo de provider inválido/manual en
webhook, ausencia de side-effects fuera de alcance) se re-litiga aquí — se
preservan tal cual.

### 21.1 Issue 1 — `claim_publication_job`: "permission denied for table
campaign_publication_jobs" (defecto de FIXTURE, no de la migración)

**Clasificación: defecto de fixture (harness), NO defecto de
migración/RPC.**

`claim_publication_job` es `SECURITY DEFINER SET search_path = public`,
por lo que se ejecuta con los privilegios del OWNER de la función (el
superusuario que aplicó la migración), no del caller — el `GRANT EXECUTE
... TO service_role` de la función es suficiente para que `service_role`
pueda invocarla, sin importar qué privilegios de tabla tenga `service_role`
por fuera de la RPC. Se confirmó, además, que ningún archivo de migración
hace `GRANT ALL`/`ALTER DEFAULT PRIVILEGES` a `service_role` sobre las 4
tablas nuevas de 8B.1 — al contrario, la migración
`20260825120000_phase8b1_publication_domain_persistence.sql` hace
explícitamente `REVOKE ALL ON campaign_publication_jobs/attempts/events/
webhook_events FROM anon, authenticated, service_role` y sólo re-otorga
`GRANT SELECT` a `authenticated` (ni siquiera a `webhook_events`). Esto es
diseño deliberado: **`service_role` no tiene NINGÚN grant de tabla directo
sobre las 4 tablas nuevas; la única vía de acceso es a través de las RPCs
SECURITY DEFINER.**

La causa raíz real: el bloque `DO $claim_ok$` (check 8.3) hacía
`SET ROLE service_role; PERFORM claim_publication_job(...); SELECT status
INTO v_status FROM campaign_publication_jobs ...; RESET ROLE;` — el SELECT
de diagnóstico quedaba **dentro** de la ventana `SET ROLE service_role`,
así que Postgres lo ejecutaba como `service_role` (sin grants), no como el
rol de sesión original. Es el MISMO patrón de bug que ya se había
corregido para el check 12.5 en Run 1, pero esa corrección no se propagó
al resto del archivo.

**Barrido sistemático completo:** un script que recorre cada bloque
`DO $tag$ ... $tag$;`, rastrea el estado `SET ROLE`/`RESET ROLE` línea a
línea DENTRO de cada bloque, y marca cualquier `SELECT ... INTO ...`
(nunca `PERFORM`) contra una de las 4 tablas protegidas mientras el rol
activo es `service_role`, encontró **7 ocurrencias en 6 bloques**, no sólo
la reportada:

| Check | Bloque | Tabla afectada |
| --- | --- | --- |
| 8.3 | `claim_ok` | `campaign_publication_jobs` |
| 8.4 | `start_ok` | `campaign_publication_jobs` (el SELECT sobre `campaign_activation_targets` en el mismo bloque era seguro — `service_role` conserva su acceso por defecto sobre las tablas de 8A.1, que sólo revocan de `anon, authenticated`, no de `service_role`) |
| 8.5 | `attempts_numbering` (×2) | `campaign_publication_attempts` |
| 8.6 | `succeed_ok` | `campaign_publication_jobs` (idem 8.4, el SELECT de `campaign_activation_targets` era seguro) |
| 9.1 | `failure_path` | `campaign_publication_jobs` / `campaign_activation_targets` (target aquí SÍ estaba dentro de la ventana `service_role`, a diferencia de 8.4/8.6, por eso también se movió) |
| 10.1 | `unknown_outcome_setup` | `campaign_publication_jobs` / `campaign_activation_targets` (idem 9.1) |

Fix aplicado en las 7 ocurrencias: mover el `SELECT ... INTO ...` de
diagnóstico a **después** del `RESET ROLE` correspondiente (nunca antes),
igual que la corrección de Run 1 en 12.5. Verificado con el mismo script
tras el fix: **0 ocurrencias restantes en los 48 bloques `DO` del
archivo.**

Como el fallo real era del fixture y no de la RPC, **8.4/8.5/8.6 dejan de
ser "cascada no clasificable"** — con el fix de ordenamiento, cada uno
puede ejecutarse y evaluarse de forma independiente en la Run 3.

### 21.2 Issue 2 — `campaign_publication_attempts` append-only vs ciclo de
vida de la RPC (defecto real de MIGRACIÓN/TRIGGER — corregido en migración
forward)

**Clasificación: defecto real de migración/trigger. Opción B del kickoff
("el attempt tiene un ciclo de vida real, se requieren updates
controlados vía RPC").**

Evidencia decisiva, leída directamente (no asumida):
- `packages/domain/src/entities/campaign-publication-attempt.ts` define
  `isPublicationAttemptOpen(attempt) = attempt.completedAt === null &&
  attempt.outcome === null` — el modelo de dominio está diseñado
  explícitamente alrededor de un ciclo abierto→cerrado.
- Las 3 RPCs de cierre (`mark_publication_job_succeeded`,
  `mark_publication_job_failed`, `mark_publication_job_unknown_outcome`),
  las tres `SECURITY DEFINER`, hacen legítimamente
  `UPDATE campaign_publication_attempts SET outcome=..., completed_at=...
  WHERE id = p_attempt_id` como parte de su diseño ya aplicado en
  `20260825120000`.
- El trigger `reject_publication_attempt_mutation()` (líneas ~560-576 de
  esa migración), sin embargo, rechaza **incondicionalmente** cualquier
  UPDATE, sin distinguir quién lo ejecuta ni qué cambia — bloqueando
  también el UPDATE legítimo de las 3 RPCs anteriores.

Por qué es seguro relajar el trigger (no es un downgrade de seguridad):
`campaign_publication_attempts` ya tiene `REVOKE ALL ... FROM anon,
authenticated, service_role` — ningún caller de aplicación tiene GRANT
UPDATE directo sobre esta tabla; la única vía de escritura es a través de
las RPCs SECURITY DEFINER (que corren como el owner de la función, no como
el caller). Relajar el trigger para permitir *exclusivamente* la
transición exacta de cierre no abre ninguna superficie nueva a ningún
caller real.

**Fix**: nueva migración forward
`supabase/migrations/20260827090000_phase8b1_publication_domain_hardening.sql`
(NO se editó `20260825120000`, que ya está aplicada localmente). El
trigger `reject_publication_attempt_mutation()` ahora:
- Rechaza **siempre** DELETE.
- Para UPDATE, rechaza si `OLD.completed_at IS NOT NULL` (attempt ya
  cerrado — no se puede re-cerrar).
- Para UPDATE, rechaza si `NEW.completed_at IS NULL` (esto es
  importante: no basta con que el attempt *estuviera* abierto — cualquier
  otra mutación sobre un attempt abierto que NO lo cierre, p.ej. alterar
  `provider_status` sin fijar `completed_at`, sigue rechazada. Esto es lo
  que mantiene el check 8.9 — `UPDATE ... SET provider_status = 'tampered'`
  sobre un attempt todavía abierto — como un `PASS` real tras el fix, no
  un falso negativo).
- Sólo permite la transición exacta `OLD.completed_at IS NULL AND
  NEW.completed_at IS NOT NULL`, que es precisamente lo que hacen las 3
  RPCs de cierre.

### 21.3 Issue 3 — chequeo de cancelación terminal (8.7a/8.7b) inválido en
Run 2 como evidencia (defecto de FIXTURE — corregido con guarda de
prerrequisito)

**Clasificación: defecto de fixture.** En Run 2, `claim`/`start`/`succeed`
fallaron (por el Issue 1), así que `job_a1` nunca llegó a `succeeded` — se
quedó en `queued`. Por eso `cancel_publication_job` sobre `job_a1` en 8.7a
tuvo éxito legítimamente (un job `queued` SÍ puede cancelarse) y 8.7b
reportó el status actual como `cancelled`. Esto **no es evidencia de un
defecto de estado terminal** — es exactamente el comportamiento correcto
dado que el job nunca alcanzó un estado terminal `succeeded` real.

**Fix**: ambos bloques (`terminal_guard_cancel`, `terminal_guard_resurrect`)
ahora leen el status actual de `job_a1` ANTES de intentar la aserción de
terminal-state; si `job_a1.status IS DISTINCT FROM 'succeeded'`, emiten
`RESULT: ... = SKIPPED (job_a1.status=%, ...)` y retornan, en vez de
producir un FAIL/DEFECTO engañoso. Con el fix del Issue 1 ya aplicado, se
espera que en Run 3 `job_a1` sí alcance `succeeded` de forma real (8.3→
8.4→8.5→8.6 ya no deberían fallar por el bug de ordenamiento), y estos dos
checks deberían ejecutar la aserción real, no el SKIPPED.

### 21.4 Issue 4 — repetibilidad del webhook (12.1/12.2) entre corridas
(defecto de FIXTURE — corregido con nonce por corrida)

**Clasificación: defecto de fixture.** El `external_event_id` usado por
12.1 era un literal fijo (`'phase8b1-smoke-webhook-event-1'`), ya
persistido por Run 1 — así que en Run 2, `record_publication_webhook_receipt`
correctamente devolvía `is_new=false` (era, de hecho, un replay real contra
una fila de una corrida anterior), pero el fixture esperaba `is_new=true`
("primera recepción"), y por lo tanto el check era inválido — no probaba
lo que decía probar.

**Fix**: se agregó `p8b1_meta_text` (tabla temporal) con una fila
`run_nonce = gen_random_uuid()::text`, generada una vez por ejecución del
fixture (sin requerir limpieza entre corridas — cada ejecución genera un
nonce nuevo, así que nunca puede colisionar con una fila de una corrida
anterior). 12.1 ahora usa `'phase8b1-smoke-webhook-event-1-' || v_nonce`
como `external_event_id`, y persiste ese valor exacto en `p8b1_meta_text`
bajo la clave `webhook_1_external_event_id`. 12.2 lee esa MISMA clave y
reutiliza el MISMO `external_event_id` para el replay dentro de la misma
corrida — preservando el contrato: primera llamada (12.1) `is_new=true`,
segunda llamada MISMO run (12.2) `is_new=false`, `count=1`.

### 21.5 Issue 5 — efectos duplicados de `mark_webhook_event_processed`
(defecto real de PERSISTENCIA — corregido en migración forward)

**Clasificación: defecto real, NO diferible a 8B.3.** Run 2 mostró
`campaign_publication_events` (evento `webhook_received`) creciendo
`antes=0 → tras 1a llamada=1 → tras 2a llamada=2` al invocar
`mark_webhook_event_processed` dos veces con el mismo
`webhook_event_id`. El fixture original lo etiquetaba PASS/informativo sin
tratarlo como invariante.

Análisis: el estado AUTORITATIVO del job (su `status`) nunca se duplica —
está protegido por separado por los guards de status de las 3 RPCs de
transición de job (confirmado en 8.7b: un job ya `succeeded` rechaza un
segundo `mark_publication_job_succeeded`). Pero `mark_webhook_event_processed`
en sí no tenía NINGÚN guard de idempotencia propio: `UPDATE ...
campaign_publication_webhook_events` e `INSERT INTO
campaign_publication_events (...'webhook_received'...)` se ejecutaban
incondicionalmente en cada llamada, sin comprobar si el webhook ya había
sido procesado. Un reintento de aplicación (p.ej. por un ack perdido tras
un timeout de red) generaría, silenciosamente, una fila de auditoría
duplicada por cada reintento — un invariante de persistencia real de 8B.1
(procesamiento de webhook idempotente/replay-safe), independiente de que
8B.3 agregue el proveedor de test firmado.

**Fix**: la misma migración forward
`20260827090000_phase8b1_publication_domain_hardening.sql` reemplaza
`mark_webhook_event_processed` para que lea el `status` ACTUAL del
webhook event (`SELECT ... FOR UPDATE`) antes de mutar; si ya está en un
status terminal (`processed`/`failed`), la llamada es un **NO-OP
idempotente** — no repite el UPDATE ni el INSERT del evento de auditoría.
El check 12.5 del fixture se reescribió para afirmar esto como PASS/FAIL
real: `eventos_después_de_1a_llamada = eventos_antes + 1` (procesamiento
real) Y `eventos_después_de_2a_llamada = eventos_después_de_1a_llamada`
(sin cambio, NO-OP).

### 21.6 Role matrix — sin cambios

Igual que en Run 1: los checks de viewer/operator/strategist siguen
ESTRUCTURAL cuando no hay un `auth.users` libre para asignarle ese rol —
no se fabrica ningún PASS. Sigue sin existir, en este repo, un precedente
seguro para crear usuarios `auth.users` temporales dentro de un fixture
SQL.

### 21.7 Hardening general adicional — aserciones "prerequisite-aware"

Además de los 5 issues específicos, se agregaron guardas de prerrequisito
(SKIPPED explícito, nunca FAIL/DEFECTO engañoso) en checks que dependían
de un estado previo que podía no haberse alcanzado:

- 9.2 (`retry_chain`): SKIPPED si no existe `job_b1` (SECCIÓN 9.1 no lo
  produjo).
- 10.2/10.3 (`unknown_outcome_no_cancel`/`unknown_outcome_no_direct_fail`):
  SKIPPED si no existe `job_c1` (SECCIÓN 10.1 no lo produjo).
- 11.7/11.8 (role matrix sobre `job_c1`): SKIPPED si no existe `job_c1`,
  además del SKIPPED ya existente por ausencia de `auth.users` libre.
- 12.5 (`webhook_processed_twice`): SKIPPED si falta `webhook_1`, `org_a`
  o `job_a1`.
- 8.7a/8.7b: ver Issue 3 arriba.
- 8.9 (append-only de attempts): ya tenía guarda NULL de Run 1, sin
  cambios — se revalidó que sigue siendo un PASS real tras el fix del
  Issue 2 (ver 21.2 arriba, el UPDATE de "tampering" sigue rechazado
  porque no fija `completed_at`).

### 21.8 Archivos modificados en esta ronda (Run 2 triage)

- `supabase/fixtures/phase8b1_local_runtime_validation.sql` — 7 fixes de
  ordenamiento `SET ROLE`/`SELECT` (Issue 1), guardas de prerrequisito en
  8.7a/8.7b (Issue 3), nonce por corrida en 12.1/12.2 (Issue 4), reescritura
  de la aserción 12.5 (Issue 5), guardas SKIPPED adicionales en 9.2/10.2/
  10.3/11.7/11.8/12.5 (hardening general).
- `supabase/migrations/20260827090000_phase8b1_publication_domain_hardening.sql`
  (NUEVO) — corrige `reject_publication_attempt_mutation()` (Issue 2) y
  `mark_webhook_event_processed()` (Issue 5). NO se editó
  `20260825120000_phase8b1_publication_domain_persistence.sql`.
- `packages/infrastructure/src/supabase/__tests__/phase8b1-hardening-migration.test.ts`
  (NUEVO) — 13 guardas estáticas de contenido sobre la nueva migración
  forward (mismo criterio que `phase8b1-migration-security.test.ts`).
- `docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md`
  — esta sección (§21) y §22 (comando para Run 3).
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` — actualización
  de R-PUB-11 y nueva entrada para el hallazgo de append-only de attempts.

### 21.9 Tests re-ejecutados y totales exactos

```
packages/infrastructure: phase8b1-migration-security.test.ts (56),
  phase8a1-migration-security.test.ts (36), phase8b1-hardening-migration.test.ts (13, NUEVO),
  campaign-publication.mapper.test.ts (15)
  => 4 test files, 120 tests, 120 passed, 0 failed

packages/domain: campaign-publication-attempt.test.ts (7)
  => 1 test file, 7 tests, 7 passed, 0 failed

TOTAL: 127 tests, 127 passed, 0 failed
```

### 21.10 Veredicto de esta ronda

Issues 1, 3 y 4 eran defectos de fixture (harness), corregidos sin tocar
ninguna migración aplicada. Issues 2 y 5 eran defectos reales de
persistencia/trigger, corregidos con UNA migración forward nueva
(`20260827090000`) que no reemplaza ni edita la migración ya aplicada.
Ningún check se marca como PASS sin evidencia de ejecución real — Run 3 es
necesaria para confirmar en runtime que las 7 correcciones de Issue 1
permiten que la cadena 8.3→8.4→8.5→8.6→8.7 corra de punta a punta, que la
migración de hardening se aplica limpiamente, y que 12.5/9.2/10.x/11.x
producen los resultados esperados (PASS real o SKIPPED explícito, nunca
FAIL engañoso).

**8B.1 sigue NO READY.** Pendiente: Run 3 contra Supabase local real,
confirmación del usuario, y sólo entonces marcar READY.

## 22. Comando exacto para la Run 3

Primero, aplicar la nueva migración de hardening (no reemplaza la
anterior, se aplica ADEMÁS de `20260825120000`, que ya está aplicada):

```powershell
Get-Content supabase\migrations\20260827090000_phase8b1_publication_domain_hardening.sql `
  | docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

(`ON_ERROR_STOP=1` aquí a propósito — a diferencia del fixture, esta
migración debe aplicarse limpiamente sin ningún error; si falla, detente y
pega el error completo antes de continuar.)

Luego, correr el fixture corregido (mismo comando que Run 2, output a un
archivo nuevo para no perder evidencia de rondas anteriores):

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabase\fixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabase\fixtures\phase8b1_runtime_output_run3.txt
```

Qué pegar de vuelta: el output completo, o como mínimo todas las líneas
`RESULT:` (`Select-String -Path supabase\fixtures\phase8b1_runtime_output_run3.txt -Pattern '^RESULT:'`).
Presta atención especial a:
- `RESULT: 8.3/8.4/8.5/8.6` — ya no deberían fallar por "permission
  denied" (Issue 1 corregido). Si alguno SIGUE fallando, es un defecto
  real distinto, no el ya corregido.
- `RESULT: 8.7a/8.7b` — deberían ejecutar la aserción real (PASS
  esperado: rechazo del intento de resucitar un job succeeded), no
  SKIPPED, dado que la cadena 8.3-8.6 ahora debería completar.
- `RESULT: 8.9` — debe seguir en PASS (el UPDATE de tampering sigue
  rechazado tras el fix del Issue 2, porque no cierra el attempt).
- `RESULT: 12.1/12.2` — 12.1 debe ser `is_new=true` esta vez (nonce nuevo
  por corrida), 12.2 debe ser `is_new=false, count=1` sobre el MISMO id.
- `RESULT: 12.5` — debe ser PASS con el patrón `+1, luego sin cambio`
  (idempotente), no el conteo creciente de Run 2.
- Cualquier línea `SKIPPED` — es información, no una falla; pero si ves
  un SKIPPED donde antes esperabas un PASS real (p.ej. 8.7a/8.7b), avísame
  con el status real del job en cuestión.

**No se marca ningún check como PASS, ni 8B.1 como READY, hasta que pegues
el output real de la Run 3.**

## 23. Run 3 — fixture repeatability defect (2026-08-27)

Run 3 (con `20260827090000_phase8b1_publication_domain_hardening.sql` ya
aplicada correctamente contra Supabase local) **no llegó a ejecutar
ninguna sección de validación de ciclo de vida** — falló en el setup:

```
RESULT: 3.4 = FAIL (23505 duplicate key value violates unique constraint
"uq_activation_targets_dedupe")
RESULT: 3.5 = FAIL (0/13 ids críticos)
```

Secciones 4-13 se saltaron correctamente vía el guard `\if :setup_ok` —
comportamiento CORRECTO del harness (ver §19.5/§21.7), no un defecto
adicional. **Run 3 NO aporta ninguna evidencia nueva** sobre
`claim_publication_job`, `start_publication_job`, el ciclo de vida
abierto→cerrado del attempt, el camino de éxito/fallo/unknown_outcome, los
guards terminales, ni la idempotencia de procesamiento de webhook — todos
siguen pendientes de una corrida que efectivamente los ejecute.

### 23.1 Clasificación

**Defecto de fixture (repetibilidad), no de la migración.** No se tocó
`uq_activation_targets_dedupe`, no se debilitó, y no se modificó la
migración de hardening ya aplicada.

### 23.2 Constraint/clave de dedupe exacta

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_activation_targets_dedupe
  ON public.campaign_activation_targets(activation_id, channel, provider, COALESCE(placement, ''));
```
(`20260824180000_phase8a1_campaign_activation_domain.sql`, línea 272 —
comentario original: "Evita target duplicado por doble click".)

### 23.3 Causa raíz exacta

`pg_temp.p8b1_new_activation()` (SECCIÓN 3.2) ya era state-aware para la
**activation**: reusa la activation no-terminal existente de la campaña si
la hay. Pero `pg_temp.p8b1_new_ready_target()` (SECCIÓN 3.3) **nunca fue
state-aware para el target** — siempre hacía un `INSERT` incondicional de
un target `(activation_id, 'meta_ads', 'meta', client_integration_id)`.
Como las 6 campañas de la SECCIÓN 3 usaban nombres literales fijos
(`'Phase8B1 Smoke Campaign A (happy path)'`, etc.) y
`p8b1_get_or_create_approved_campaign()` resuelve por nombre EXACTO, Run 3
reutilizó la misma campaña/activation ya creada por Run 2 — y al intentar
crear un nuevo target sobre esa MISMA activation, colisionó con el target
que Run 2 ya había insertado (mismo `activation_id` + `channel='meta_ads'`
+ `provider='meta'` + `placement` NULL → misma clave de dedupe).

Importante: incluso si el dedupe se hubiera resuelto reusando el target
existente en vez de fallar, ese target ya había sido mutado por el ciclo
de vida real de Run 2 (potencialmente `published`/`failed`/etc. según qué
tan lejos llegó cada corrida) — reusarlo NO le habría dado a Run 3 un
ciclo de vida fresco e independiente que ejercitar. Por eso se optó por la
Opción A del kickoff (aislamiento fresco por corrida) en vez de la Opción
B (reuso determinista por clave de dedupe).

### 23.4 Estrategia de repetibilidad elegida y por qué

**Opción A — aislamiento fresco total por corrida.** Se reutilizó el
mismo nonce por corrida ya introducido en la SECCIÓN 12 (para webhooks,
`p8b1_meta_text.run_nonce`, un `gen_random_uuid()::text` generado una vez
por ejecución) y se incrustó en el nombre de cada una de las 6 campañas de
la SECCIÓN 3 (p.ej. `'Phase8B1 Smoke Campaign A (happy path) [<nonce>]'`).
Como `p8b1_get_or_create_approved_campaign()` busca por nombre EXACTO,
cada corrida ahora genera un nombre que NINGUNA corrida anterior pudo
haber creado — por lo tanto SIEMPRE crea 6 campañas/approvals/
activations/targets frescos, nunca reutiliza estado de una corrida
anterior, y el `INSERT` de cada target en `p8b1_new_ready_target()` nunca
puede colisionar con `uq_activation_targets_dedupe` (la activation es
nueva, no puede tener ningún target previo).

Por qué A y no B: los targets de trabajo de este fixture pasan
deliberadamente por el ciclo de vida real completo (ready→publishing→
published/failed) para poder probar las RPCs de 8B.1 — su estado SIEMPRE
puede haber sido mutado por una corrida anterior. Reusar por clave de
dedupe determinista (Opción B) habría requerido, además, verificar el
estado exacto del target reusado antes de cada check downstream (¿ya está
`published`? ¿ya tiene un job `succeeded`?) — mucho más frágil y con más
superficie de falsos negativos que simplemente garantizar aislamiento
total por corrida.

Se cumplen todos los requisitos del kickoff: nunca se viola
`uq_campaign_activations_active_per_campaign` (cada corrida usa una
campaña nueva, sin competencia); nunca se viola
`uq_activation_targets_dedupe` (activation siempre nueva); no se requiere
limpieza entre corridas (el nonce garantiza que nunca hay colisión, viejo
o nuevo); cada corrida ejercita estado de ciclo de vida fresco; los IDs de
webhook siguen siendo únicos por corrida (sin cambios, ya cubierto desde
Run 2); se mantiene el guard de setup (3.5, sin cambios); ningún check
downstream puede ejecutar con IDs de prerrequisito NULL (el guard 3.5 y el
`\if :setup_ok` siguen intactos).

### 23.5 Archivos modificados en esta ronda

- `supabase/fixtures/phase8b1_local_runtime_validation.sql` — SECCIÓN 3.4
  (`DO $seed_targets$`): se agregó `v_nonce` (leído de
  `p8b1_meta_text.run_nonce`) y se incrustó en los 6 nombres de campaña.
  Ningún otro bloque tocado.
- `supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql` —
  comentario actualizado documentando que el patrón `LIKE 'Phase8B1 Smoke
  Campaign %'` ya existente cubre cualquier número de corridas acumuladas
  sin necesitar cambios (el nonce es un sufijo, el prefijo fijo no
  cambió) — verificado, no se modificó el patrón SQL en sí.
- `docs/implementation/phase-8/PHASE_8B1_PUBLICATION_DOMAIN_PERSISTENCE_REPORT.md`
  — esta sección (§23) y §24 (comando para Run 4).
- `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md` — addendum en
  R-PUB-11.

**Ninguna migración fue modificada.** `20260825120000` y `20260827090000`
permanecen exactamente como se aplicaron.

### 23.6 Tests estáticos re-ejecutados

Sin cambios de código de dominio/infraestructura/migración en esta ronda
(el fix fue exclusivamente en los archivos de fixture SQL, que no tienen
tests estáticos propios de contenido — son ejecutados en runtime, no
inspeccionados por vitest). Se re-corrieron, por completitud, los mismos
suites relevantes de la ronda anterior para confirmar que nada se rompió:

```
packages/infrastructure: phase8b1-migration-security.test.ts (56),
  phase8a1-migration-security.test.ts (36), phase8b1-hardening-migration.test.ts (13),
  campaign-publication.mapper.test.ts (15)
  => 4 test files, 120 tests, 120 passed, 0 failed
```

### 23.7 Veredicto de esta ronda

Defecto de repetibilidad del fixture, corregido con aislamiento total por
corrida (Opción A), sin tocar ningún invariante de dominio ni ninguna
migración. Run 3 no validó ningún comportamiento de ciclo de vida — eso
sigue pendiente de Run 4. **8B.1 sigue NO READY.**

## 24. Comando exacto para la Run 4

La migración de hardening (`20260827090000`) ya está aplicada — NO
reaplicar. Sólo correr el fixture (ya corregido) contra Supabase local:

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabase\fixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabase\fixtures\phase8b1_runtime_output_run4.txt
```

Qué pegar de vuelta: el output completo, o como mínimo
`Select-String -Path supabase\fixtures\phase8b1_runtime_output_run4.txt -Pattern '^RESULT:'`.
Presta atención especial a:
- `RESULT: 3.4 = PASS` y `RESULT: 3.5 (13/13) = PASS` — si esto falla de
  nuevo, pega el error `SQLSTATE`/`SQLERRM` completo antes de seguir.
- `RESULT: 8.3/8.4/8.5/8.6` — deberían completar sin "permission denied"
  (Issue 1 de Run 2, ya corregido).
- `RESULT: 8.7a/8.7b` — deberían ejecutar la aserción real (no SKIPPED),
  dado que la cadena 8.3-8.6 ahora debería completar.
- `RESULT: 8.9` — debe seguir PASS (el trigger de hardening sigue
  rechazando el tampering que no cierra el attempt).
- `RESULT: 12.1/12.2/12.5` — 12.1 `is_new=true`, 12.2 `is_new=false,
  count=1` (mismo nonce dentro de la corrida), 12.5 idempotente (`+1,
  luego sin cambio`).

**No se marca ningún check como PASS, ni 8B.1 como READY, hasta que pegues
el output real de la Run 4.**

## 25. Run 4 — retry path unreachable (2026-08-27)

Run 4 confirmed the ENTIRE main publication lifecycle works end to end
against real Postgres/Supabase local: create/claim/start/succeed/fail/
unknown_outcome/reconcile, terminal guards, append-only protections, all
role-matrix checks reachable, webhook receipt/replay/idempotency, and no
out-of-scope side effects. The only remaining defect was a real
forward-design gap: after `mark_publication_job_failed`, the target is
left `failed`, and `create_publication_job(retry_of_job_id=...)` requires
the target to be `ready`/`scheduled` — a guard evaluated BEFORE the retry
eligibility check, so retry is structurally unreachable for any job that
really failed via the real lifecycle.

### 25.1 Design decision

**Chosen: preferred option (explicit, separate reset RPC), not the atomic
alternative.** New RPC `prepare_publication_retry(job_id, note)` —
strategist+ — is the sole authorized path to transition a target from
`failed` back to `ready` for the express purpose of enabling a retry.
`create_publication_job` is otherwise unchanged (same guards, same
signature, same operator+ bar) — once the target is `ready` again via the
new RPC, its existing guard simply stops blocking the real path.

Why separate instead of folding the reset into `create_publication_job`:
8A.1 already models every `campaign_activation_targets` status transition
as its own single-purpose RPC (`prepare_activation_target`,
`mark_activation_target_ready`, `mark_activation_target_published`,
`cancel_activation_target`) — never a transition "on the side" inside an
RPC whose aggregate root is the job. Folding the reset into
`create_publication_job` would also conflate two authorization decisions
of different sensitivity (creating a job = operator+; deciding a failure
is retryable and authorizing the reopen = a more deliberate decision) into
one RPC. Keeping them separate makes the "authorize this retry" moment
independently auditable (`retry_prepared` event, distinct from the
`job_queued` event the follow-up `create_publication_job` call emits).

The original `failed` job is **never** mutated — `prepare_publication_retry`
only reads its `status`/`failure_category` to validate eligibility (the
exact same rule `canRetryPublicationJob` already encoded in the domain
layer) and writes only to the target row + a new audit event on the
original job. The retry is always a brand-new job (`retry_count + 1`,
`retry_of_job_id` pointing at the original), matching the invariant
already documented for `create_publication_job`.

### 25.2 Authorization rule

**strategist+** (`has_organization_role(org_id, 'strategist')`) — same bar
as `reconcile_publication_job`. Rationale: authorizing a retry after a
confirmed failure is a deliberate operational decision of the same order
as reconciling an ambiguous `unknown_outcome` — both are humans explicitly
deciding how to treat an outcome that already happened, as opposed to the
routine mechanical act of creating a job (`create_publication_job`,
operator+, unchanged). The retryable-category allowlist
(`is_publication_failure_retryable`) is an additional, independent gate —
even a strategist cannot prepare a retry for a non-retryable failure
category (e.g. `PROVIDER_REJECTED`, `INVALID_ASSET`).

### 25.3 Files modified

- `supabase/migrations/20260828100000_phase8b1_publication_retry_reset.sql`
  (NEW) — `is_publication_failure_retryable()` helper (single source of
  truth for both RPCs, mirrors `PUBLICATION_RETRYABLE_FAILURE_CATEGORIES`);
  `create_publication_job` forward-patched to use the helper (no behavior
  change); new `prepare_publication_retry(job_id, note)`; `event_type`
  CHECK on `campaign_publication_events` extended (additive) with
  `retry_prepared`; GRANT/REVOKE for the new RPC (authenticated only, same
  pattern as `create_publication_job`/`cancel_publication_job`/
  `reconcile_publication_job`).
- `packages/shared/src/constants/publication.ts` — `retry_prepared` added
  to `PUBLICATION_EVENT_TYPES`.
- `packages/shared/src/constants/__tests__/publication.test.ts` — updated
  length assertion (9→10) + new `toContain`.
- `packages/domain/src/entities/campaign-publication-job.ts` — doc-only
  update on `canRetryPublicationJob` cross-referencing the new RPCs (no
  logic change — the existing predicate already encodes the exact rule
  both RPCs need).
- `packages/domain/src/repositories/campaign-publication.repository.ts` —
  new `PrepareRetryInput` type + `prepareRetry()` method on
  `CampaignPublicationRepository`.
- `packages/domain/src/index.ts` — exports `PrepareRetryInput`.
- `packages/infrastructure/src/supabase/repositories/supabase-campaign-publication.repository.ts`
  — `prepareRetry()` implementation (calls `prepare_publication_retry` RPC).
- `packages/infrastructure/src/supabase/__tests__/phase8b1-retry-reset-migration.test.ts`
  (NEW) — 19 static guards on the new migration.
- `supabase/fixtures/phase8b1_local_runtime_validation.sql` — SECCION 3
  gains a 7th isolated scenario (target_f, dedicated to retry-state
  negative tests); setup guard now expects 15/15 ids; SECCION 9.2 rewritten
  into 9.2-9.7 (precondition-still-blocked, auth guard, successful
  prepare+reset, new retry job created + original job immutable, duplicate
  active retry blocked, invalid-states via target_f: queued/claimed/
  in_progress/unknown_outcome); new SECCION 11.9 (invalid states
  succeeded/cancelled, using job_a1/job_d1, both status-guarded SKIPPED).
- `supabase/fixtures/phase8b1_local_runtime_validation_cleanup.sql` — no
  changes needed; the existing `LIKE 'Phase8B1 Smoke Campaign %'` pattern
  already matches scenario F's name.
- Report (this file, §25/§26) and risk register (R-PUB-13, new).

**No already-applied migration was rewritten.** `20260825120000` and
`20260827090000` are untouched.

### 25.4 Tests rerun

```
packages/infrastructure: phase8b1-migration-security.test.ts (56),
  phase8a1-migration-security.test.ts (36), phase8b1-hardening-migration.test.ts (13),
  phase8b1-retry-reset-migration.test.ts (19, NEW),
  campaign-publication.mapper.test.ts (15)
  => 5 test files, 139 tests, 139 passed, 0 failed

packages/domain: campaign-publication-job.test.ts (54),
  campaign-publication-attempt.test.ts (7), campaign-publication-event.test.ts (6),
  campaign-publication-webhook-event.test.ts (3)
  => 4 test files, 70 tests, 70 passed, 0 failed

packages/shared: publication.test.ts (9, updated for retry_prepared)
  => 1 test file, 9 tests, 9 passed, 0 failed

tsc --noEmit: packages/domain, packages/infrastructure, packages/shared — all clean.

TOTAL: 218 tests, 218 passed, 0 failed.
```

### 25.5 Updated fixture checks (summary)

- 9.2: `create_publication_job(retry_of_job_id)` WITHOUT a prior reset
  still rejected — confirms the existing target-status guard is unchanged.
- 9.3: operator lacks strategist+ for `prepare_publication_retry`
  (ESTRUCTURAL if no spare `auth.users`).
- 9.4: strategist+ (owner) prepares the retry — target_b resets to
  `ready`, diagnostic fields cleared, `retry_prepared` event logged on the
  original job.
- 9.5: `create_publication_job(retry_of_job_id=job_b1)` now succeeds — new
  job_b2 (`retry_of_job_id=job_b1`, `retry_count=1`, `queued`); job_b1
  verified unchanged (`failed`, same `failure_category`).
- 9.6: a second `prepare_publication_retry(job_b1)` is rejected — target_b
  already has an active job (job_b2).
- 9.7: `prepare_publication_retry` rejected from `queued`/`claimed`/
  `in_progress`/`unknown_outcome` (dedicated scenario F, job_f1).
- 11.9: `prepare_publication_retry` rejected from `succeeded` (job_a1) and
  `cancelled` (job_d1), both status-guarded SKIPPED if the prerequisite
  didn't materialize this run.

### 25.6 Verdict

Real forward-design defect, resolved with a new forward migration and full
domain/infra/shared/test consistency. **8B.1 still NOT READY** — pending
Run 5 confirming the retry path in real runtime.

## 26. Commands for Run 5

Apply the new migration (does not replace `20260825120000`/`20260827090000`,
applies in addition):

```powershell
Get-Content supabase\migrations\20260828100000_phase8b1_publication_retry_reset.sql `
  | docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres -v ON_ERROR_STOP=1
```

Then run the fixture:

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabase\fixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabase\fixtures\phase8b1_runtime_output_run5.txt
```

Attention points for Run 5: `RESULT: 3.4/3.5` should show 15/15 ids (7
scenarios now); `RESULT: 9.2-9.7` and `RESULT: 11.9a/11.9b` are all new —
paste every line matching `^RESULT: 9\.|^RESULT: 11\.9`. Any `ESTRUCTURAL`
or `SKIPPED` among them is expected/honest if the prerequisite role/job
genuinely isn't available this run — only a `FAIL` needs investigation.

**No check is marked PASS, and 8B.1 is not READY, until the real Run 5
output is pasted back.**

## 27. Run 5 — cancelled-retry check decoupled from role-matrix residual (2026-08-27)

Run 5 confirmed the full retry design from §25 works in real runtime: retry
preparation, new-job creation, original-job immutability, duplicate-retry
blocking, and rejection from `queued`/`claimed`/`in_progress`/
`unknown_outcome`/`succeeded` all passed. The only gap was `11.9b`
(`prepare_publication_retry` rejected from `cancelled`), which stayed
`SKIPPED` because it depended on `job_d1` (SECCION 11.2/11.3), which in
turn depends on `operator_user` — a disposable `auth.users` role-matrix
actor that doesn't exist in this local Supabase.

**Fixture-only fix, no migration, no domain/authorization change.** Added
scenario G to SECCION 3 (`Phase8B1 Smoke Campaign G (cancelled retry
guard)`, nonce-isolated exactly like scenarios A-F — `activation_g`/
`target_g`) and rewrote `11.9b` to be fully self-contained: it creates its
own job on `target_g` as `owner`, cancels it while `queued` (`owner`
satisfies `operator`+ via the existing role hierarchy, so no
`operator_user`/`strategist_user` dependency at all), confirms
`status = cancelled`, then calls `prepare_publication_retry` and asserts
rejection with `is not failed`. Setup guard count updated from 15/15 to
17/17 ids (2 new: `activation_g`, `target_g`). The role matrix itself is
unchanged and can remain `ESTRUCTURAL` when no spare `auth.users` exist —
this fix only removes an *unrelated* coverage check's accidental coupling
to that residual, it does not resolve or paper over the residual itself.

Repeatability preserved: scenario G uses the same per-run nonce as every
other scenario, requires no cleanup between runs, and creates entirely
fresh campaign/activation/target state each execution — same pattern as
scenarios A-F.

No static tests needed updating (fixture-only change); the existing 218
tests (139 infrastructure + 70 domain + 9 shared) were re-run for
regression safety and all still pass.

**8B.1 still NOT READY** — pending Run 6 confirming `11.9b` now passes for
real (or reports a genuine `FAIL` if something else is wrong), together
with a final re-confirmation of everything Run 5 already passed.

## 28. Command for Run 6

No new migration to apply (fixture-only change). Just re-run the fixture:

```powershell
docker exec -i supabase_db_BopIAgency psql -U postgres -d postgres `
  -v ON_ERROR_STOP=0 `
  -f - < supabase\fixtures\phase8b1_local_runtime_validation.sql `
  | Tee-Object -FilePath supabase\fixtures\phase8b1_runtime_output_run6.txt
```

Attention: `RESULT: 3.4/3.5` should now show 17/17 ids (8 scenarios);
`RESULT: 11.9b-setup` (new, job_g1 queued->cancelled) and `RESULT: 11.9b`
(the retry-rejection assertion itself) should both be real `PASS` this
time, not `SKIPPED`. Everything else that passed in Run 5 should still
pass unchanged.

**No check is marked PASS, and 8B.1 is not READY, until the real Run 6
output is pasted back.**

## 29. Run 6 + Run 7 — real Postgres closure, repeatability proven (2026-08-27)

The user applied all 3 migrations (`20260825120000`, `20260827090000`
hardening, `20260828100000` retry-reset) against their real local
Supabase/Postgres and ran `phase8b1_local_runtime_validation.sql` twice:

- **Run 6**: clean. Every scenario from §27's fix confirmed for real —
  `3.4/3.5` showed 8 isolated campaigns / 17-of-17 ids, `11.9b-setup` and
  `11.9b` both real `PASS` (job_g1 queued→cancelled, then
  `prepare_publication_retry` rejected with `is not failed`), and every
  check that had already passed in Run 5 (full success/failure/
  unknown_outcome lifecycle, attempt append-only protection, terminal
  guards, retry preparation/new-job/immutability/duplicate-block/
  invalid-source-state rejection, webhook first-receipt/replay-dedupe/
  processing-idempotency, tenant/idempotency/auth guards, no tasks/
  alerts/n8n side effects) still passed.
- **Run 7**: run immediately after Run 6, **with no cleanup in between**,
  and also came back clean — proving the per-run-nonce isolation pattern
  (§23/§24) makes the fixture genuinely repeatable by design, not by
  coincidence of a single lucky execution.

**Remaining residual, unchanged and documented honestly (not converted to
PASS):** the role-matrix checks specific to `viewer`/`operator`/
`strategist` stay `ESTRUCTURAL` because this local Supabase has no spare
`auth.users` to play those roles. This is a local-environment fixture
limitation, not a code or authorization defect — the `owner` path and the
static role-matrix tests (`activation-write-use-cases.role-matrix.test.ts`
and the `has_organization_role` hierarchy itself, confirmed by direct
migration read in Run 4/5) already exercise the same authorization logic
those checks would otherwise re-confirm at the `operator`/`strategist`
tier specifically.

R-PUB-11, R-PUB-12, and R-PUB-13 are all marked **CLOSED** in
`PHASE_8_RISK_REGISTER.md` on the strength of this Run 6 + Run 7 evidence.

## 30. Final pre-commit audit (2026-08-27)

**Scope discipline confirmed:** no 8B.2 code, no new product scope, no
redesign of already-validated behavior was introduced in this audit pass
— it is documentation-only plus a full regression re-run.

**Final test totals (all re-run this pass, all green):**

| Suite | Files | Tests |
|---|---|---|
| `shared` | 8 | 115 |
| `domain` | 19 | 402 |
| `infrastructure` — migration-security (phase7c/phase8a1/phase8b1×3) | 5 | 140 |
| `infrastructure` — mappers | 13 | 199 |
| `infrastructure` — repositories | 10 | 204 |
| `infrastructure` — ai/n8n adapters | 10 | 134 |
| `application` — `use-cases/activations` | 3 | 65 |
| **Total** | **68** | **1,259** |

`typecheck` and `lint` re-run clean on `shared`, `domain`,
`infrastructure`, and `application` (0 errors, 0 warnings surfaced).

**Known, pre-existing test-coverage gap (disclosed, not fixed in this
pass per "do not redesign working behavior"):** there is no dedicated
`supabase-campaign-publication.repository.test.ts` unit-test file for
`SupabaseCampaignPublicationRepository` — only `campaign-publication.mapper.test.ts`
(row↔entity mapping) and the migration-security static-text-guard suites
(`phase8b1-*-migration.test.ts`) cover this area from the infrastructure
side. The adapter itself is a thin, pattern-consistent RPC wrapper
(verified by direct code read to mirror `SupabaseCampaignActivationRepository`'s
existing conventions exactly), and its correctness is what Run 6/Run 7
validated end-to-end against real Postgres — but a future round could add
a dedicated unit-test file for it as a coverage improvement. Not a blocker
for 8B.1 closure.

**Git diff audit — no accidental changes found.** Every modified
pre-existing file was individually diffed and confirmed as expected 8B.1
scope: `campaign-activation.repository.ts` and
`supabase-campaign-activation.repository.ts` only add the 2
already-designed `markTargetPublishing`/`markTargetFailed` methods (8B.1's
own §1 scope, not new); `domain/src/index.ts`, `infrastructure/src/index.ts`,
`shared/src/index.ts` only add the new 8B.1 entity/repository/constant
exports; the 3 `activations/__tests__/*.test.ts` files only add the 2 new
mock methods to their `makeActivationRepo` fixtures (required so those
suites still type-check against the extended interface). `supabase/config.toml`'s
diff is confirmed to be **only** a pre-existing local port remap
(54321→54721 etc., unrelated to this work, not made by this session) —
left untouched and excluded from commit per standing instruction.

**Confirmed:**
- No provider HTTP calls: the only URL-shaped string anywhere in the
  migrations/fixture is a literal `https://example.invalid/ad/1` test
  value passed as smoke-test data to `mark_publication_job_succeeded`,
  never an actual outbound call.
- No n8n authority: migration comments explicitly state "NO crea ningun
  acoplamiento a n8n (dominio/DB permanecen autoritativos)"; the fixture's
  §13.2 check inspects every real trigger function body on the 4 new
  tables and asserts none references `n8n`/`http`/`tasks`/`alerts`.
- No secrets/tokens persisted: grepped all new/modified SQL and the
  `.agencia-ai` command file for password/secret/API-key/token patterns —
  none found.
- `supabase/config.toml` is excluded from staging (confirmed unrelated
  port-remap diff, not 8B.1 work).
- Runtime output files (`phase8a1_runtime_output*.txt`,
  `phase8b1_runtime_output_run*.txt`, now including `run6.txt`/`run7.txt`)
  are local evidence artifacts, excluded from staging.
- `.agencia-ai/.claude/commands/new-client.md` is unrelated local tooling,
  excluded from staging.

**8B.1 is READY.** All runtime validation the kickoff required is
complete and repeatable; the only residual is the explicitly-accepted,
honestly-documented role-matrix `ESTRUCTURAL` limitation, which does not
block closure.

## 31. RPC/grant inventory correction — 14→15, 3→4 authenticated (2026-08-27, pre-commit)

**Finding:** §5's kickoff-check table, §16's original risk note, and §19.5
all say "14 RPCs" / "3 authenticated, 11 service_role" — accurate at the
time each was written (before the retry-reset migration existed), but
stale as a description of the **final** architecture. Those entries are
left as-is: they are dated, point-in-time records of what was true in
their own round, not a live status. This section is the authoritative
correction for anyone reading top-to-bottom.

**Root cause:** `20260828100000_phase8b1_publication_retry_reset.sql`
(Run 4) added `prepare_publication_retry` as a genuinely new,
user-facing, `authenticated`-granted RPC — the 15th, not a replacement of
any of the original 14. The runtime fixture's SECCION 1 structural
inventory (RPC existence count + grant-shape check) was never updated to
include it — Run 4 onward added *behavioral* fixture coverage for
`prepare_publication_retry` (SECCION 9.2-9.7, 11.9a/11.9b) but the
separate, earlier-written *structural* inventory checks (1.1 existence
count, 1.2 grant split) kept asserting the pre-retry-reset numbers. Since
those checks only ever counted a hardcoded name list that didn't include
`prepare_publication_retry`, they kept passing at `14`/`3+11` in Run
4 through Run 7 without ever actually validating the post-retry-reset
inventory — a silent blind spot, not a false PASS on a real defect.

**DB state was already correct — only the fixture and docs were stale.**
Direct read of `20260828100000`'s GRANT section confirms
`prepare_publication_retry` is `SECURITY DEFINER`, `SET search_path =
public`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO
authenticated` (never `service_role`) — exactly the same pattern as
`create_publication_job`/`cancel_publication_job`/`reconcile_publication_job`,
and its body enforces `strategist+` internally via
`has_organization_role(v_org_id, 'strategist')` before doing anything.
**No new migration was needed or written.**

**Final, correct inventory: 15 RPCs total — 4 `authenticated`
(`create_publication_job`, `cancel_publication_job`,
`reconcile_publication_job`, `prepare_publication_retry`), 11
`service_role`** (`claim_publication_job`, `start_publication_job`,
`record_publication_attempt`, `mark_publication_job_succeeded`,
`mark_publication_job_failed`, `mark_publication_job_unknown_outcome`,
`mark_activation_target_publishing`, `mark_activation_target_failed`,
`append_publication_event`, `record_publication_webhook_receipt`,
`mark_webhook_event_processed`).

**Incidental finding (disclosed, not fixed — out of this task's scope):**
`is_publication_failure_retryable(text)`, the pure `IMMUTABLE` SQL helper
added alongside `prepare_publication_retry`, has no explicit
`REVOKE`/`GRANT` statement in the retry-reset migration, so it keeps
Postgres's default `PUBLIC` EXECUTE grant. It is not counted as a
user-facing RPC (same treatment as the 7 trigger functions, which are
also never counted) and calling it leaks nothing — it only echoes
membership in the same 5-category allow-list already public in
`packages/shared/src/constants/publication.ts`. Not remediated here per
the "no product redesign, no new migration unless real DB grants are
wrong" instruction for this round — flagged for a future hygiene pass if
desired.

**Fixed:** `supabase/fixtures/phase8b1_local_runtime_validation.sql`
SECCION 1 — the `1.1` existence-count query/assertion (14→15, list now
includes `prepare_publication_retry`), the `1e` grant-inspection `SELECT`
(same list addition), and the `1.2` grant-shape `DO` block (authenticated
list/count 3→4 with `prepare_publication_retry` added, service_role list/
count unchanged at 11). DO-block balance re-verified (60 balanced
`$tag$` pairs, 0 unclosed) after the edit.

**Static tests:** no static migration-security test encodes a combined
"14 total"/"3+11 split" contract across migrations — each test file
(`phase8b1-migration-security.test.ts` for the original migration,
`phase8b1-retry-reset-migration.test.ts` for the retry-reset migration)
only asserts facts about its own single migration file, and both already
correctly describe `prepare_publication_retry`'s own grants. **No static
test file needed updating.** Full regression re-run for safety: 1,259
tests (115 shared + 402 domain + 677 infrastructure + 65 application
activations), all passing; typecheck/lint clean on all 4 touched
packages.

**8B.1 status:** still READY per §30 — this was a documentation/fixture
consistency correction, not a defect requiring re-triage of Run 6/7's
lifecycle evidence, which remains fully valid.
