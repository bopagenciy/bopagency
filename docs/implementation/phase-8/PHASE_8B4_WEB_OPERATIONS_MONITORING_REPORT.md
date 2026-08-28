# Phase 8B.4: Web Operations / Monitoring Report

## Resumen Ejecutivo
Subfase 8B.4 de la Fase 8 (Operaciones de Campaña). Implementa la experiencia web de monitoreo y control de operaciones de publicación (`/campaigns/[id]/activation`) manteniendo estrictamente los límites de autoridad y seguridad establecidos en las subfases 8B.1–8B.3:

1. **Límite de Autoridad (Sin Dispatch Interactivo)**: `dispatchPublicationJob` permanece como una operación exclusiva de workers/cron con cliente `service_role`. La interfaz interactiva del usuario (Operator+) únicamente encola publicaciones (`queuePublicationAction`) para su procesamiento asincrónico en segundo plano. Ninguna Server Action ni componente interactivo importa o ejecuta `dispatchPublicationJob`.
2. **Modelo de Lectura de Evidencia de Webhooks**: Nuevo use case sanitizado `listPublicationWebhookEvidenceByJob` en `@bop-agency/application` respaldado por `listWebhookEventsByJob` en el repositorio Supabase. Expora exclusivamente metadatos seguros (ID de evento, proveedor, timestamp de recepción, estado, hash truncado, código de error) sin exponer jamás payloads crudos, firmas HMAC, secretos ni tokens.
3. **Semántica de Reintento Compuesta**: Acción de UI unificada `retryPublicationAction` (Strategist+) que invoca el use case compuesto `retryPublication`. El trabajo fallido histórico permanece inmutable. Los trabajos en `unknown_outcome` tienen el botón de reintento desactivado.
4. **Reconciliación Manual (`unknown_outcome`)**: Formulario modal `PublicationReconciliationModal` (Strategist+) con selecciones de resultado (`published` vs `not_published`), nota obligatoria y advertencia explícita de auditoría.
5. **Cancelación Cooperativa**: Botón "Solicitar Cancelación" para trabajos `in_progress` que marca la solicitud de cancelación sin simular des-publicación externa.

---

### Componentes Implementados

- `PublicationOperationsPanel.tsx`: Panel contenedor principal con métricas resumidas, botón de refresco y advertencia de `unknown_outcome`.
- `PublicationJobsTable.tsx`: Tabla de trabajos con estado, proveedor, linaje de reintentos y botones según rol.
- `PublicationJobStatusBadge.tsx`: Badge accesible con ícono + texto (incluye `unknown_outcome` -> "Resultado indeterminado").
- `PublicationJobDetailsDrawer.tsx`: Drawer deslizable para inspeccionar intentos y evidencia de webhooks.
- `PublicationReconciliationModal.tsx`: Modal para reconciliación manual de resultados ambiguos (Strategist+).
- `PublicationWebhookEvidenceTable.tsx`: Tabla de evidencias de webhooks sanitizadas.
- `publication-actions.ts`: Server Actions seguras derivadas de sesión.

---

### Verificación de Pruebas

- **Focused 8B.4 Tests**:
  - Use case evidence read test: `list-publication-webhook-evidence-by-job.test.ts` (PASS).
  - Server Actions test: `publication-actions.test.ts` (PASS).
  - Component tests: `PublicationJobStatusBadge.test.tsx`, `PublicationJobsTable.test.tsx`, `PublicationReconciliationModal.test.tsx`, `PublicationWebhookEvidenceTable.test.tsx` (PASS).
- **Workspace Regression Tests**:
  - `@bop-agency/application`: PASS
  - `@bop-agency/domain`: PASS
  - `@bop-agency/infrastructure`: PASS
  - `@bop-agency/shared`: PASS
  - `@bop-agency/web`: PASS
- **Typecheck & Lint**:
  - `npm run typecheck`: PASS (0 errors)
  - `npm run lint`: PASS (0 errors)
