# Phase 8 — Campaign Operations & Distribution — Plan de implementación

**Rama:** `feat/phase-8-campaign-operations`
**Base:** `a8025ec` (Phase 7 cerrada y mergeada a `main`)
**Estado general de Phase 8:** en curso — 8A.0 completada, 8A pendiente de arrancar.

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
- **Estado:** ✅ **COMPLETA**. Implementada (design tokens, `packages/ui`,
  navegación, auth, logo recortado con aspect-ratio corregido, favicon,
  barrido dirigido de CTAs/focus rings, foco `focus-visible` corregido en
  navegación), pulida tras smoke visual real, y **cerrada con evidencia de
  validación Windows definitiva**: `apps/web` 29 test files / 356 tests
  passed / 0 failed; `packages/ui` 0 test files (sin suite propia), exit
  code 0 vía `--passWithNoTests` — no se declara "PASS" de una suite
  inexistente en `packages/ui`. Typecheck y lint en PASS en ambos
  workspaces. Smoke visual manual del usuario: PASS. Detalle completo en
  `PHASE_8A0_BRANDING_THEME_REPORT.md` §21 (cierre final).
- **Bloquea:** nada — 8A.0 está formalmente cerrada, 8A puede arrancar
  cuando el usuario lo indique.
- **Follow-up no bloqueante heredado a Phase 8 (no resuelto en 8A.0):**
  isotipo/favicon compacto dedicado de BopIAgency para tamaños muy
  pequeños (ver reporte §5/§16/§21.6) — a diseñar en una fase posterior,
  nunca inventado por código.

### 8A — Campaign Activation Model
- **Objetivo:** modelar el dominio de "activación" de una campaña aprobada
  — qué significa que una campaña `approved` pase a `active` en términos de
  datos (nuevo estado, nuevos campos de programación/fecha de inicio,
  vínculo con los canales de distribución previstos), sin ejecutar ninguna
  publicación real todavía. Es la base de datos/dominio que 8B–8G
  consumirán.
- **Alcance esperado:** entidades/casos de uso de dominio y aplicación,
  posible migración aditiva (a proponer y aprobar explícitamente, nunca
  ejecutada sin autorización), RLS equivalente al patrón ya usado en
  `campaigns`/`campaign_approvals`.
- **Explícitamente fuera de alcance:** cualquier llamada real a un
  proveedor externo.

### 8B — Publishing Gateway
- **Objetivo:** la capa de abstracción (puerto/adaptador, mismo patrón que
  `CampaignGeneratorPort` de Phase 7D) para "publicar" una campaña activa a
  un canal, con proveedores intercambiables — sin implementar todavía
  ningún proveedor real conectado a una cuenta de anuncios de verdad.
- **Explícitamente fuera de alcance:** credenciales reales, llamadas de red
  reales a Meta/Google/YouTube.

### 8C — Content / Asset Calendar
- **Objetivo:** vista de calendario de contenido/activos asociados a
  campañas (fechas de publicación planeadas, no ejecutadas).

### 8D — Manual Activation
- **Objetivo:** primer flujo de activación real, pero **manual** — un
  humano confirma explícitamente cada paso de "publicación" (posiblemente
  incluso fuera del sistema, con el sistema solo registrando el estado),
  antes de construir cualquier integración automática con un proveedor.

### 8E — Meta Integration
- **Objetivo:** primera integración real con un proveedor externo (Meta
  Ads). Requiere aprobación explícita separada antes de conectar
  credenciales reales o hacer la primera llamada de publicación real —
  sigue el mismo patrón de "REGLA CRÍTICA DE PRODUCTO" usado en Phase 7
  para IA (nunca activar por accidente, siempre con guardas explícitas).

### 8F — Google Integration
- **Objetivo:** análogo a 8E para Google Ads.

### 8G — Activation Monitoring
- **Objetivo:** monitoreo del estado real de las campañas activadas
  (métricas de entrega, errores de proveedor) — reutilizando el patrón de
  `tasks`/`alerts` ya establecido en Phase 6/7 para side effects internos,
  nunca inventando infraestructura nueva de notificación.

### 8H — E2E + Security + Closure
- **Objetivo:** cierre de Phase 8, mismo estándar de rigor que
  `PHASE_7_CLOSURE_REPORT.md` — auditoría completa de RLS/RPCs, matriz de
  roles, barrido de publicación externa (esta vez confirmando qué SÍ está
  autorizado a publicar y bajo qué guardas, en vez de confirmar que nada
  publica), regresión de tests, clasificación de merge-readiness.

## Registro de riesgos de Phase 8 (inicial)

Se documentarán en `docs/implementation/phase-8/PHASE_8_RISK_REGISTER.md`
(a crear cuando 8A arranque) siguiendo el mismo formato que
`PHASE_7_RISK_REGISTER.md`. Riesgo ya identificado durante 8A.0, registrado
aquí como nota temprana:

- **Contraste del naranja de marca en botones de texto** — el naranja
  "puro" del logo (`#F35A13`) no cumple AA de texto normal (3.34:1); se
  ajustó `--primary` a `#D9480F` (4.30:1) para botones/CTA de texto,
  reservando `#F35A13` como `--primary-accent` para superficies grandes/
  decorativas. Ver detalle completo en
  `PHASE_8A0_BRANDING_THEME_REPORT.md` §4. Riesgo: si un futuro diseño
  visual asume que `--primary` es el naranja "puro" del logo, puede haber
  una discrepancia leve de tono entre lo diseñado y lo implementado — mitigado
  documentando ambos tokens claramente.
- **Favicon a 16×16 pierde detalle** — ver
  `PHASE_8A0_BRANDING_THEME_REPORT.md` §5/§16. Follow-up recomendado: un
  isotipo compacto dedicado, a pedir al equipo de diseño, no a inventar por
  código.
- **Entorno de este puente no puede ejecutar `vitest`** — limitación
  heredada de Phase 7 (binario nativo de Rollup para Linux ausente, sin
  acceso de red), documentada de nuevo en 8A.0. Para 8A.0 esto ya no es un
  gap: el usuario ejecutó la suite completa en su entorno Windows real
  (`apps/web` 356/356 tests passed, `packages/ui` 0 test files vía
  `--passWithNoTests`) — ver `PHASE_8A0_BRANDING_THEME_REPORT.md` §21.
  Aplicará igual a las subfases siguientes de Phase 8 mientras el entorno
  de este puente no cambie: se recomienda repetir el mismo patrón
  (typecheck/lint en el puente, tests en Windows) en cada cierre.
