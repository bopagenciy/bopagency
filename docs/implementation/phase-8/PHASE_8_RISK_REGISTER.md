# Phase 8 — Risk Register

**Creado en:** Phase 8A — Audit + Architecture
**Estado:** vivo — se actualiza en cada subfase de Phase 8.
**Formato:** mismo criterio que `PHASE_7_RISK_REGISTER.md` (severity /
likelihood / mitigation, sin implementar nada aquí).

| ID | Riesgo | Severity | Likelihood | Mitigation (diseño, a implementar en 8A.1+) |
|---|---|---|---|---|
| R-ACT-01 | **Duplicate publishing** — un target se marca `published` dos veces (doble click, retry manual, condición de carrera) | High | Medium | RPC `mark_target_published` revalida `status IN ('ready','scheduled')` dentro de la transacción antes de escribir; una segunda invocación falla con `INVALID_STATUS`, nunca solo deshabilitar el botón en UI. Ver PHASE_8A_ACTIVATION_AUDIT.md §9. |
| R-ACT-02 | **Approval bypass** — se crea una activation sobre una campaign que no está (o dejó de estar) `approved`, por condición de carrera entre lectura del use case y el INSERT | High | Low | Trigger `BEFORE INSERT` en `campaign_activations` revalida `campaigns.status = 'approved'` dentro de la misma transacción, no solo el use case de aplicación. Ver §13/§16. |
| R-ACT-03 | **Stale snapshot** — el snapshot de una activation queda desincronizado de la campaign real, o alguien introduce un método para "actualizar" el snapshot rompiendo inmutabilidad | High | Low (si se documenta explícitamente) | Snapshot escrito una sola vez en creación; el repositorio de dominio (§18) NO expone ningún método de update sobre `approved_snapshot`; comentario de dominio explícito prohibiendo esa operación (mismo estilo que `campaign-approval.ts`). |
| R-ACT-04 | **Cross-org integration reference** — un target referencia un `client_integration_id` de otra organización/cliente, filtrando la existencia/uso de credenciales ajenas | Critical | Low | Trigger valida `client_integrations.organization_id = target.organization_id` y `client_integrations.client_id = activation.client_id` antes de aceptar el INSERT/UPDATE del target. Ver §11. |
| R-ACT-05 | **Credential leakage** — credenciales de proveedor terminan en `approved_snapshot`, `metadata`, `failure_message` o logs | Critical | Low | El snapshot (§14) es exclusivamente contenido de campaña, nunca `client_integrations.configuration`. Sanitización de metadata con la misma lista `FORBIDDEN_METADATA_KEYS` ya usada en Phase 6F. `service_role` reservado solo para el futuro callback HMAC de proveedor (8E/8F). |
| R-ACT-06 | **Provider API drift** (futuro, 8E/8F) — un cambio en la API de Meta/Google rompe silenciosamente `ChannelPublisherPort` sin que se detecte | Medium | Medium (una vez existan integraciones reales) | Fuera de alcance de 8A implementar, pero el diseño de `ChannelPublisherPort` (§22) devuelve `Result<PublishReceipt>` tipado — cualquier fallo de forma de respuesta se captura como error tipado, no como excepción silenciosa. Monitoreo en 8G. |
| R-ACT-07 | **Partial multi-channel failure oculto como éxito** — la activation se muestra "completed" aunque un canal falló | High | Medium (si no se deriva correctamente el status agregado) | Status de activation es una función PURA derivada de los status de sus targets (§6.A) — existe el estado explícito `partially_completed`, nunca colapsa un fallo parcial en `completed`. |
| R-ACT-08 | **Retries causando duplicate external action** (futuro, 8B) — un retry de publicación ejecuta la acción externa dos veces porque el proveedor sí la procesó la primera vez pero la respuesta se perdió | High | Medium (una vez haya ejecución automática real) | Diferido a 8B: mismo patrón de `idempotencyKey` que `AutomationExecution`, más `external_reference` verificable antes de reintentar (si el target ya tiene una referencia externa, no reintentar sin confirmación humana). |
| R-ACT-09 | **Race conditions** en creación concurrente de activation para la misma campaign | Medium | Medium | Índice único parcial `(campaign_id) WHERE status NOT IN ('completed','cancelled','failed')` — la segunda request recibe `CONFLICT` y se recupera la existente (mismo patrón que `startAutomationExecution`). Ver §9/§15. |
| R-ACT-10 | **Cancellation during execution** — se cancela una activation mientras un target está `publishing` (futuro, canales automáticos) | Medium | Low (no aplica a canales manuales en 8A) | Documentado como pregunta abierta para 8B: la RPC `cancel_activation` debe rechazar la cancelación de targets ya en `publishing` (dejar que terminen) o soportar cancelación "best-effort" con reconciliación posterior — decisión de 8B, no de 8A. |
| R-ACT-11 | **Manual/external state divergence** — el operador marca `published` en el sistema pero la publicación real nunca ocurrió (o viceversa) | Medium | Medium (inherente al camino manual) | Mitigado parcialmente por requerir `actor_user_id` + timestamp + `external_reference` opcional en cada marca manual (auditable, atribuible); mitigación completa (verificación cruzada con el proveedor) solo es posible cuando exista integración real (8E/8F) — riesgo residual aceptado en 8D (Manual Activation Hardening). |
| R-ACT-12 | **Alert spam** — cada evento de progreso normal genera una alerta, saturando el dashboard de alertas | Low | Medium (si no se sigue el patrón de dedupe) | Reutilizar `upsertByAlertKey` con `alert_key` determinístico (§25); solo incidentes (fallo, staleness) generan alert — eventos de progreso normal solo entran al event log, nunca a `alerts`. |
| R-ACT-13 | **Accidental automatic publication** — un futuro cambio hace que `approveCampaign` o cualquier otro flujo cree/ejecute una activation automáticamente, violando "approval != publication" | Critical | Low (si se documenta la regla explícitamente) | Confirmado en §20: la creación de activation permanece 100% manual/explícita en 8A. Ningún use case de campaign escribe en `campaign_activations`. Cualquier PR futuro que lo haga debe tratarse como una regresión de producto, no una mejora — dejar esta regla como comentario de dominio explícito. |
| R-ACT-14 | **Refresh token strategy inexistente** (heredado, no de 8A) — `client_integrations` no tiene hoy ningún escritor ni estrategia de refresh de credenciales | Medium | N/A hasta 8E/8F | Gap heredado documentado en §11/§23 del audit. No se resuelve en Phase 8A — queda como precondición explícita para 8E/8F. |
| R-ACT-15 | **Placement como vector de inyección** — `placement` se usa como campo libre para construir URLs/paths en algún adapter futuro sin sanitizar | Low | Low | `placement` es descriptivo (texto acotado, documentado con lista de valores esperados), nunca se concatena directamente en una URL — cualquier construcción de URL de proveedor real (8E/8F) debe mapear `placement` a un valor server-side conocido, nunca interpolarlo crudo. |

---

## Riesgos explícitamente fuera de alcance de Phase 8A (heredados a subfases futuras)

- Todo lo relacionado con llamadas de red reales a Meta/Google/YouTube
  (R-ACT-06 es el único que se pre-documenta; el resto se descubrirá en
  8E/8F).
- Seguridad de OAuth/token refresh de proveedores (R-ACT-14).
- Rate limiting real de proveedor (documentado como código de error en
  la taxonomía §24 del audit, sin lógica de mitigación en 8A).

Este registro se actualiza (nunca se sobreescribe silenciosamente) en cada
subfase — 8A.1/8A.2/8A.3 deben revisar cada fila marcada `Medium`/`Low`
para confirmar si la mitigación propuesta efectivamente se implementó tal
cual, y 8B en adelante añade filas nuevas específicas de publicación real.
