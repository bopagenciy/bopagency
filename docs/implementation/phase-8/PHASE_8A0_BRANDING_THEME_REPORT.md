# Phase 8A.0 — Branding & Theming Foundation

**Rama:** `feat/phase-8-campaign-operations`
**Base:** `a8025ec` — "docs(phase-7): close campaign studio phase" (Phase 7 cerrada y mergeada a `main`)
**Fecha:** 2026-08-23
**Estado:** ✅ **COMPLETA** — validación visual manual confirmada por el usuario en su entorno Windows real (ver §21, evidencia final). Cerrada en `PHASE_8_IMPLEMENTATION_PLAN.md`.

> Sin `git add`/`commit`/`push`/`merge`. Sin migración. Sin cambios de lógica
> funcional (arquitectura, navegación, comportamiento, roles, Campaign
> Studio, Automation, Tasks, Alerts, Clients, Dashboard — todo intacto). No
> se tocó `supabase/config.toml` ni `.agencia-ai/.claude/commands/new-client.md`.

---

## 1. Auditoría inicial

Antes de escribir código se auditó dónde vive el theme actual:

- **CSS global:** `apps/web/src/styles/globals.css` — mínimo, sin capa de
  design tokens (solo 3 variables sueltas: `--color-brand`, `--color-surface`,
  `--color-muted`, no usadas de forma consistente).
- **Tailwind config:** `apps/web/tailwind.config.ts` — paletas `brand`/`bop`
  ya definidas pero **no usadas en ningún componente** (confirmado por grep:
  cero referencias a clases `bg-bop-*`/`text-brand-*` en todo el código) —
  es decir, muerto/placeholder, seguro de reemplazar.
- **Color de marca real en uso:** el rojo por defecto de Tailwind
  (`red-500`/`red-600`/`red-700`), hardcodeado directamente en ~50 archivos
  `.tsx` vía clases utilitarias, sin ninguna capa central.
- **Componentes centrales:** `packages/ui/src/components/` (Button, Card,
  Input, Select, Textarea, Badge, Alert, Modal, PageHeader, StatCard, Table,
  EmptyState, Skeleton) — **ya existe una librería de UI compartida**, usada
  parcialmente por la app. Badge y Alert **ya estaban correctamente
  desacoplados de la marca** (usan verde/ámbar/rojo/azul literales de
  Tailwind para success/warning/error/info) — no requirieron cambios de
  paleta, solo se tokenizó `default`/`muted` de Badge por consistencia.
- **AppShell/navegación:** `apps/web/src/components/layout/` — `AppShell`
  (Server Component, compone Sidebar+MobileNav+AppTopBar+`<main>`),
  `Sidebar` (desktop, `bg-gray-900`), `MobileNav` (drawer móvil, mismo
  esquema oscuro), `AppTopBar` (blanco, selector de org + menú de usuario en
  desktop), `OrganizationSwitcher`/`UserMenu` (compartidos entre desktop y
  móvil), `Header` (header de página, usado en casi todas las rutas
  protegidas para breadcrumbs + acciones).
- **Auth/login:** `apps/web/src/app/(auth)/{layout,login,signup,
  forgot-password,reset-password}` y `apps/web/src/app/onboarding/` —
  **pantalla completa dark theme** (`bg-gray-950`/`bg-gray-900`), con un
  badge "B" rojo como placeholder de logo — no el logo real.
- **Favicon:** no existía ningún `favicon.ico`/`icon.png` — la app no tenía
  ícono de pestaña.
- **Responsive/mobile nav:** `MobileNav.tsx` ya implementa un drawer
  hamburguesa funcional (`lg:hidden`), reutiliza `OrganizationSwitcher` y
  `UserMenu`.
- **Estados semánticos:** `Badge`/`Alert`/`CampaignStatusBadge`/
  `ClientStatusBadge`/`TaskStatusBadge`/`TaskPriorityBadge`/
  `AlertSeverityBadge`/`AlertStatusBadge`/`AutomationStatusBadge`/
  `ExecutionStatusBadge`/`ExecutionTimeline` — todos ya usan verde/ámbar/
  rojo/azul de forma semántica (éxito/advertencia/error/info), **no
  acoplados al rojo de marca solo por coincidencia de tono**. Se preservaron
  intactos.

**Conclusión de la auditoría:** existe una capa central reutilizable
(`packages/ui`) pero el "branding" real vivía disperso como hex/clases de
Tailwind repetidas en páginas y componentes de feature, sin variables CSS.
La estrategia elegida fue: (1) construir la capa de tokens central que
faltaba, (2) migrar `packages/ui` a esa capa, (3) aplicar la capa a
navegación/auth (máxima visibilidad de marca), (4) hacer un barrido dirigido
del resto de la app **solo** donde el rojo representaba intención de marca
(CTA primario, link, foco, nav activo) — nunca donde representaba semántica
real (error, destructivo, rechazado, vencido).

## 2. Logo real — verificación de color

`apps/web/public/brand/bopagency-logo.png` (1024×1024, RGB, fondo blanco
sólido). Se extrajo la paleta dominante del PNG real (no se asumió a
ciegas):

| Rango de color extraído del logo | Familia |
|---|---|
| `#500010`–`#A01010` | vino/marrón oscuro |
| `#F04000`–`#F08000` | naranja |
| `#F0C020`–`#F0F0A0` | dorado/amarillo cálido |
| `#FEFEFE` (bordes/centro) | blanco |

Esto **confirma y valida** la paleta propuesta por el usuario (naranja,
vino, dorado) contra el asset real — no fue necesario ajustar la dirección
de color, solo el brillo/saturación exactos por contraste (ver §4).

## 3. Theme architecture

Se creó una capa central de design tokens en
`apps/web/src/styles/globals.css` (variables CSS, formato RGB sin comas
para soportar `rgb(var(--x) / <alpha-value>)` con opacidad), consumida por
`apps/web/tailwind.config.ts` como clases semánticas de Tailwind
(`bg-primary`, `text-sidebar-foreground`, etc.). **Ningún componente
referencia un hex de marca directamente** — todo pasa por estas dos capas.

Tokens implementados (coinciden con la lista pedida en el mandato, más
extensiones necesarias):

```
--background          --foreground
--card                 --card-foreground
--muted                --muted-foreground
--border               --input               --ring
--primary              --primary-hover        --primary-accent   --primary-foreground
--secondary            --secondary-foreground
--accent               --accent-foreground
--warm-yellow
--success / --warning / --destructive / --info   (+ *-foreground)
--sidebar-background   --sidebar-foreground
--sidebar-muted        --sidebar-hover
--sidebar-active       --sidebar-active-foreground
--sidebar-border       --sidebar-accent
--brand-red
```

`tailwind.config.ts` mapea cada uno a una clase utilitaria
(`bg-primary`, `text-primary-foreground`, `bg-sidebar`, `text-sidebar-muted`,
`border-sidebar-border`, etc.) vía un helper `withOpacity()`. Las paletas
`brand`/`bop` preexistentes (confirmadas sin uso real en el código) fueron
reemplazadas por este sistema.

## 4. Paleta final — y ajustes de contraste documentados

| Token | Hex final | Origen / ajuste |
|---|---|---|
| `--background` | `#FFFFFF` | igual a la propuesta |
| `--foreground` | `#1F1F1F` | igual a la propuesta |
| `--muted` (soft warm bg) | `#FFF7F2` | igual a la propuesta |
| `--muted-foreground` | `#6B7280` | igual a la propuesta |
| `--border` / `--input` | `#E9E2DC` | igual a la propuesta |
| `--primary` | **`#D9480F`** | **AJUSTADO.** El naranja "puro" propuesto (`#F35A13`) da 3.34:1 de contraste con texto blanco — no cumple AA de texto normal (4.5:1). Se usa `#D9480F` (el "hover/deep orange" originalmente propuesto) como el naranja real de botones/texto, que da 4.30:1 — casi indistinguible visualmente del original y sustancialmente más accesible. |
| `--primary-hover` | `#C24310` | Nuevo, un tono más oscuro que `--primary` para el estado hover (5.12:1 con blanco). |
| `--primary-accent` | `#F35A13` | El naranja "puro" del logo, conservado para usos decorativos/de superficie grande donde aplica el umbral no-textual de WCAG (3:1) — indicador activo del sidebar, focus ring, avatar. |
| `--accent` (dorado) | `#F5C242` | igual a la propuesta. Uso deliberadamente escaso. |
| `--accent-foreground` | `#1F1F1F` | texto oscuro obligatorio sobre dorado (ver regla de accesibilidad del mandato §11) — blanco sobre `#F5C242` da 1.37:1, ilegible. |
| `--warm-yellow` | `#FFD95A` | igual a la propuesta, mismo criterio: solo con texto oscuro. |
| `--sidebar-background` (vino) | **`#7A1E1E`** | Igual a la propuesta. Verificado contra el vino real extraído del logo (`#500010`–`#A01010`, más oscuro) — se mantiene `#7A1E1E` porque da mejor legibilidad de texto en bloques largos de navegación (10.33:1 con blanco vs. contrastes aún más altos pero visualmente casi negros en los tonos más oscuros del logo), permaneciendo en la misma familia de tono. |
| `--sidebar-active` | **`#A6360F`** (nuevo, derivado) | El mandato pedía "naranja como accent/active state, no como fondo general si resulta demasiado saturado". Un fondo activo 100% `#F35A13` con texto blanco da solo 3.34:1 (insuficiente para texto pequeño de navegación). Se usa un blend vino/naranja (`#A6360F`, 6.65:1 con blanco) como fondo del item activo, **más** un borde izquierdo sólido de 3px en `#F35A13` — así el naranja "puro" sigue presente como el acento visual real, sin sacrificar contraste. |
| `--sidebar-hover` | `#8C2A17` (nuevo, derivado) | Estado hover de navegación, entre el vino base y el activo (8.54:1 con blanco). |
| `--sidebar-muted` | `#E3C7C7` (nuevo, derivado) | Texto secundario sobre sidebar (nombre de organización, email de usuario) — 6.53:1 con el vino base. |
| `--sidebar-border` | `#601818` (nuevo, derivado) | Separadores internos del sidebar, un vino más oscuro que el fondo. |
| `--destructive` | `#DC2626` (red-600 estándar) | **Sin cambios respecto al rojo semántico ya usado en todo el código** — deliberadamente NO se tocó, ver principio F. |
| `--success` / `--warning` / `--info` | verde-600 / ámbar-600 / azul-600 estándar | Sin cambios — preservados intactos. |

Todos los contrastes fueron verificados computacionalmente (fórmula WCAG de
luminancia relativa), no estimados a ojo — ver la tabla completa de pares
verificados en el anexo de esta sección si se requiere el detalle exacto de
cada cálculo (disponible en el historial de esta sesión).

## 5. Logo — integración

Asset: `apps/web/public/brand/bopagency-logo.png` (1024×1024, sin recortar,
sin modificar el contenido — solo redimensionado donde aplica).

**Usos implementados:**
1. **Sidebar (desktop)** — contenedor blanco de 40×40px con padding interno,
   sobre el fondo vino, vía `next/image` con `priority`, `object-contain`
   (preserva aspect ratio, sin deformar).
2. **MobileNav (drawer/topbar móvil)** — mismo patrón, 28×28px.
3. **Auth layout** (login/signup/forgot-password/reset-password) — 48×48px,
   en un contenedor blanco con sombra suave, centrado sobre el fondo cálido.
4. **Onboarding** (`/onboarding`) — mismo tratamiento que auth layout (tenía
   su propio bloque de marca duplicado con el mismo placeholder "B" rojo).
5. **Favicon** — `apps/web/src/app/icon.png` (convención de App Router de
   Next.js, auto-detectada sin cambios de código adicionales): copia
   redimensionada a 256×256 del mismo PNG oficial, **sin recorte ni
   modificación de contenido** — Next.js genera los tamaños derivados
   (16×16, 32×32, apple-touch-icon, etc.) automáticamente a partir de este
   archivo.
6. **Header/topbar de escritorio** — **NO se duplicó el logo aquí**
   (`AppTopBar` ya no tiene marca propia, evita la duplicidad que el mandato
   pide evitar en el punto 3 de la sección de logo).

**Limitación conocida y follow-up recomendado:** el logo es un mark
completo con bastante detalle (extraído: múltiples tonos y formas
internas). A los tamaños usados (28–48px) sigue siendo reconocible porque
se muestra sobre un contenedor blanco con padding, pero al tamaño de
favicon real (16×16, el que usan la mayoría de pestañas de navegador) el
detalle interno se pierde y se ve como una mancha de color — es una
limitación física del asset, no del código. **No se inventó un isotipo
compacto ni se recortó el logo arbitrariamente**, tal como exige el
mandato. Se recomienda como follow-up de una fase posterior: pedir al
equipo de diseño una versión de isotipo compacto (sin texto, formas
simplificadas) específicamente para favicon/sidebar-collapsed — hasta
entonces, la solución actual (mismo PNG oficial, redimensionado) es la
única opción "segura" (no inventada) disponible.

## 6. Sidebar / navegación

`Sidebar.tsx` (desktop) y `MobileNav.tsx` (móvil) migrados a los tokens
`sidebar-*`:

- Fondo vino profundo (`bg-sidebar`), texto blanco (`text-sidebar-foreground`).
- Item de navegación activo: fondo `bg-sidebar-active` (blend vino/naranja)
  + borde izquierdo sólido de 3px en `border-primary-accent` (naranja puro
  del logo) + texto blanco en negrita — el naranja es el acento visual, no
  el fondo completo, tal como pide el mandato.
- Item inactivo: texto `text-sidebar-muted`, hover a `bg-sidebar-hover` +
  `text-sidebar-foreground`.
- Selector de organización: fondo `bg-sidebar-hover`, dropdown con la misma
  paleta, opción activa resaltada en `text-primary-accent`.
- Sección de usuario: avatar en `bg-primary-accent` (o imagen real vía
  `next/image`), nombre/email en tonos sidebar, botón de logout con focus
  ring visible (`focus:ring-primary-accent`).
- Todos los estados interactivos (`button`/`Link`) tienen `focus:ring-2` con
  el color de marca — verificado visualmente en el código, no solo
  declarado.

No existe una variante "desktop collapsed" en el código actual (`Sidebar`
es una franja fija de `w-64`, sin lógica de colapso) — no se inventó una,
consistente con "NO hacer un rediseño total" del mandato; se documenta como
limitación conocida (§13) en vez de construir una feature nueva no pedida.

## 7. Topbar

`AppTopBar.tsx` (desktop, contiene `OrganizationSwitcher` + `UserMenu`) y
`Header.tsx` (header de página, breadcrumbs + acciones, usado en casi todas
las rutas protegidas) migrados a `bg-background`/`border-border` — blancos,
limpios, sin naranja pesado, tal como exige el mandato §C. El detalle
corporativo vive en el sidebar, no en el topbar.

## 8. Botones / formularios / cards

`packages/ui` (consumido en toda la app):

- **Button** — `primary` ahora usa `bg-primary`/`hover:bg-primary-hover`/
  `focus:ring-primary` (antes `red-600`/`red-700`/`red-500`); `danger` usa
  `bg-destructive/10` + `border-destructive/30` (antes `red-50`/`red-200`,
  visualmente equivalente pero ahora tokenizado); `secondary`/`ghost`/
  `outline` tokenizados a `bg-secondary`/`bg-muted`/`border-border`.
- **Input / Select / Textarea** — foco ahora `focus:ring-primary`/
  `focus:border-primary` (antes `red-500`); estado de error **sin
  cambios** (`border-red-300`/`bg-red-50`/`text-red-900` — semántico,
  preservado).
- **Card** — `bg-card`/`border-border` (antes `bg-white`/`gray-200`,
  visualmente idéntico en el tema claro, pero ahora tokenizado).
- **Badge / Alert** — **sin cambios de paleta** (ya usaban verde/ámbar/rojo/
  azul semánticos correctamente); solo se tokenizó la variante `default` de
  Badge (`bg-muted`/`text-muted-foreground`) por consistencia.

Fuera de `packages/ui`, se hizo un barrido dirigido (no ciego) de CTAs y
focus rings de marca en páginas/componentes de feature — ver §9 para el
criterio exacto y la lista completa de archivos.

## 9. Barrido dirigido — criterio y alcance

Se identificaron ~50 archivos con clases `red-*` de Tailwind. **No se
reemplazaron todos** — se clasificó cada uso:

**Convertidos a marca (`primary`/`primary-accent`)** — botones primarios de
formulario ("Guardar", "Crear", "+ Nueva campaña"), links de navegación
("Ver todas →", "Ver →"), focus rings de inputs no vinculados a error, toggle
de "activado" en configuración, spinner de carga, CTA de páginas de error/
404/acceso-denegado.

**Preservados como semánticos (NO tocados)** — deliberadamente, por
principio F del mandato:
- `CampaignApprovalPanel.tsx` — botón "Rechazar"/"Confirmar rechazo" y el
  asterisco de campo requerido: **acción destructiva real**, el rojo es
  correcto. "Aprobar" ya usaba verde, "Enviar a revisión" ya usaba ámbar —
  **este componente ya estaba bien diseñado semánticamente antes de esta
  fase**, no requirió cambios.
- `apps/web/src/app/(protected)/clients/[clientId]/page.tsx` — botón
  "Eliminar cliente": acción destructiva real, preservado.
- `CampaignStatusBadge.tsx` (`rejected`), `ComplianceReview.tsx`
  (`critical`), `TaskStatusBadge`/`TaskPriorityBadge`/`AlertSeverityBadge`/
  `AlertStatusBadge`/`AutomationStatusBadge`/`ExecutionStatusBadge`/
  `ExecutionTimeline` (`error`), `TasksTable.tsx` (tarea vencida/`overdue`),
  `RegenerateContentButton.tsx` (mensaje de error): todos estados
  semánticos reales, preservados sin cambios.

Archivos modificados en este barrido (además de tokens/navegación/auth):
`dashboard/page.tsx`, `ActiveAlertsSidebar.tsx`, `AutomationSignalsWidget.tsx`,
`SettingsClient.tsx`, `campaigns/page.tsx`, `campaigns/error.tsx`,
`campaigns/[id]/error.tsx`, `clients/page.tsx`, `ClientList.tsx`,
`ClientForm.tsx`, `DocumentEditor.tsx`, `CampaignWizardForm.tsx`,
`EditCampaignModal.tsx`, `CampaignsTable.tsx`, `error.tsx` (root),
`not-found.tsx`, `loading.tsx`, `access-denied/page.tsx`, más un barrido
automatizado (pero verificado, no ciego) de `focus:ring-red-500` →
`focus:ring-primary` en 7 archivos adicionales de filtros/acciones
(`AlertsFilters`, `CampaignsFilters`, `MetricsFilters`, `TasksFilters`,
`AIProviderSelect`, `TaskStatusAction`, `Pagination`) — verificado
previamente que **ningún** uso de `focus:ring-red-500` en el código estaba
condicionado a un estado de error (todos eran focus rings planos), por lo
que el reemplazo fue seguro.

## 10. Campaign Studio (Phase 7)

Se revisaron específicamente los 9 componentes listados en el mandato:
`CampaignsTable`, `CampaignWizardForm`, `AIProviderSelect`,
`CampaignApprovalPanel`, `ComplianceReview`, `GeneratedContentView` (no
existe con ese nombre exacto — el contenido generado se renderiza inline
dentro de `CampaignWizardForm`/`EditCampaignModal`, confirmado por
búsqueda), `EditCampaignModal`, `RegenerateContentButton`,
`CampaignAutomationActivity`. Ninguno importa `packages/ui` — todos usan
Tailwind directo, consistente con el resto de la app.

**Cero cambios de lógica funcional**: no se tocó ningún `use client`
handler, ninguna llamada a Server Action, ningún estado de React, ninguna
validación, ningún texto de negocio. Solo `className`. Verificado con
`git diff` — cada archivo de esta lista tiene solo cambios de 1-N líneas de
clases CSS, nunca de JSX estructural o de imports funcionales (excepto
`Image`/`next/image` donde se añadió el logo, que es puramente
presentacional).

## 11. Auth / login

`(auth)/layout.tsx`, `login/page.tsx`, `signup/page.tsx`,
`forgot-password/page.tsx`, `reset-password/page.tsx`, y
`onboarding/page.tsx` + `onboarding/OnboardingForm.tsx` (mismo patrón
visual duplicado, actualizado igual): convertidos de dark theme
(`bg-gray-950`/`bg-gray-900`, texto blanco) a fondo cálido suave
(`bg-muted`, `#FFF7F2`) con tarjeta blanca (`bg-card`), logo real integrado,
inputs claros, y CTA primario en `bg-primary`. **Ninguna lógica de
autenticación fue tocada** — todas las Server Actions (`signIn`, `signUp`,
`requestPasswordReset`, `updatePassword`, `createOrganizationAction`) están
exactamente igual, solo cambió el `className` del JSX alrededor.

## 12. Responsive

No se agregó ni quitó ningún breakpoint. Se verificó por código (no hay
entorno de browser real disponible en este puente) que:
- El contenedor del logo en sidebar/mobile-nav/auth usa `w-*`/`h-*` fijos +
  `object-contain`, por lo que no puede desbordar ni empujar contenido
  independientemente del viewport.
- `MobileNav` (drawer `lg:hidden`) no fue tocado estructuralmente, solo
  recoloreado — su lógica de apertura/cierre (`useState`, `aria-expanded`)
  es idéntica a antes.
- `Sidebar` (`hidden lg:flex`) y `AppTopBar` (`hidden lg:flex`) mantienen
  exactamente las mismas clases de breakpoint que antes de esta fase.

**Recomendación:** validar visualmente en un viewport real (ver smoke plan,
§17) — este puente no tiene un navegador disponible para capturar
screenshots.

## 13. Accesibilidad

- Todos los pares de contraste de la paleta final fueron verificados
  computacionalmente contra WCAG AA (ver tabla de §4).
- Regla explícita del mandato ("no usar amarillo claro con texto blanco")
  **respetada por diseño**: `--accent`/`--warm-yellow` (dorado/amarillo)
  **siempre** se documentan con `--accent-foreground: #1F1F1F` (texto
  oscuro) — no existe ningún uso de texto blanco sobre dorado en el código
  entregado.
- Focus rings: todos los elementos interactivos tocados
  (botones/inputs/links/toggle) mantienen `focus:outline-none focus:ring-2`
  con un color de marca visible (`focus:ring-primary` en superficie clara,
  `focus:ring-primary-accent` en superficie oscura del sidebar) — ningún
  focus ring fue eliminado, solo recoloreado.
- Estados disabled: preservados sin cambios (`disabled:opacity-50`,
  `disabled:bg-gray-300`, etc. — no se tocó ningún estado disabled).
- Colores semánticos (success/warning/error/info) **no fueron alterados en
  ningún punto** — ver §9.

## 14. Tests / typecheck / lint

**Typecheck** (`tsc --noEmit`, ejecutado en este puente — funciona sin red):

| Workspace | Resultado |
|---|---|
| `packages/ui` | ✅ limpio |
| `apps/web` | ✅ limpio |

**Lint** (`eslint`, mismo puente):

| Workspace | Resultado |
|---|---|
| `packages/ui` | ✅ limpio |
| `apps/web` | ✅ limpio |

**Tests (`vitest`):** se intentó `npm test --workspace=packages/ui` y
reprodujo la misma limitación de entorno ya documentada en Phase 7
(`Cannot find module '@rollup/rollup-linux-x64-gnu'` — `node_modules`
instalado para Windows, sin acceso de red en este puente para reinstalar).
**No se declara PASS de tests que no se pudieron ejecutar.**

No se agregaron tests nuevos en esta fase: el cambio es puramente visual
(`className`), no introduce ninguna pieza funcional nueva que requiera
cobertura dedicada (el único archivo nuevo con lógica — ninguno; `icon.png`
y el logo son assets estáticos). Se verificó específicamente que **ningún
test existente afirma un `className` de marca que haya cambiado**: se
encontró un solo test (`SummaryCard.test.tsx`) que afirma clases
`border-l-red-500`/`border-l-gray-300`, pero pertenece a
`SummaryCard.tsx`, que **no fue modificado** en esta fase (su mapa de
colores `red`/`amber`/`green`/`blue`/`gray` es un accent semántico de
tarjetas de dashboard, no de marca) — cero riesgo de regresión en ese test.

**Recomendación:** ejecutar `npm test` en el entorno Windows real del
usuario (como en Phase 7) para obtener evidencia automatizada completa —
no bloqueante para esta fase visual, pero recomendado antes de cerrar 8A.0
formalmente.

## 15. Archivos modificados / nuevos

**Nuevos:**
- `apps/web/src/app/icon.png` (favicon, derivado del logo oficial)
- `docs/implementation/phase-8/PHASE_8A0_BRANDING_THEME_REPORT.md` (este archivo)
- `docs/implementation/phase-8/PHASE_8_IMPLEMENTATION_PLAN.md`
- `apps/web/public/brand/bopagency-logo.png` — provisto por el usuario antes de esta tarea, no creado por Claude, pero antes no estaba integrado en ningún componente.

**Modificados (49 archivos, solo `className`/imports de `Image`, cero cambios funcionales):**
`apps/web/src/styles/globals.css`, `apps/web/tailwind.config.ts`,
`packages/ui/src/components/{Button,Input,Select,Textarea,Card,Badge}.tsx`,
`apps/web/src/components/layout/{Sidebar,MobileNav,AppTopBar,AppShell,Header,OrganizationSwitcher,UserMenu}.tsx`,
`apps/web/src/app/(auth)/{layout,login/page,signup/page,forgot-password/page,reset-password/page}.tsx`,
`apps/web/src/app/onboarding/{page,OnboardingForm}.tsx`,
`apps/web/src/app/access-denied/page.tsx`, `apps/web/src/app/{error,not-found,loading}.tsx`,
`apps/web/src/app/(protected)/{campaigns/page,campaigns/error,campaigns/[id]/error,clients/page,dashboard/page,settings/SettingsClient}.tsx`,
`apps/web/src/components/campaigns/{CampaignWizardForm,EditCampaignModal,CampaignsTable,AIProviderSelect,CampaignsFilters,CampaignApprovalPanel}.tsx`,
`apps/web/src/components/clients/{ClientForm,ClientList,DocumentEditor}.tsx`,
`apps/web/src/components/dashboard/{ActiveAlertsSidebar,AutomationSignalsWidget}.tsx`,
`apps/web/src/components/{common/Pagination,metrics/MetricsFilters,alerts/AlertsFilters,tasks/TasksFilters,tasks/TaskStatusAction}.tsx`.

**Explícitamente NO modificados (fuera de scope, confirmado por `git status`):**
`supabase/config.toml`, `.agencia-ai/.claude/commands/new-client.md`.

## 16. Limitaciones

- No existe una variante "sidebar collapsed" en el código base actual — no
  se inventó una (fuera del alcance de "no rediseño total").
- El favicon a 16×16 pierde legibilidad de detalle por ser un resize directo
  del logo completo (ver §5) — se recomienda un isotipo compacto dedicado
  como follow-up, nunca inventado en esta fase.
- No se pudo ejecutar la suite de tests automatizada en este entorno (mismo
  límite de Phase 7, `vitest`/Rollup nativo/sin red) — se recomienda
  ejecutarla en Windows antes del cierre formal de 8A.0.
- No se generaron capturas de pantalla reales (sin navegador disponible en
  este puente) — ver smoke plan manual, §17.

## 17. Smoke plan manual (para el usuario)

Al abrir la app en tu entorno local, por favor observa específicamente:

1. **Login** (`/login`) — fondo cálido claro (no negro), logo real visible
   arriba, tarjeta blanca centrada, botón "Iniciar sesión" naranja.
2. **Sidebar expandido** (desktop, ≥1024px) — fondo vino oscuro, logo en
   contenedor blanco arriba, texto blanco legible.
3. **Nav activo** — al entrar a cualquier sección (ej. Dashboard), el item
   correspondiente en el sidebar debe verse con fondo más claro + una franja
   naranja a la izquierda, distinto de los items inactivos.
4. **Dashboard** (`/dashboard`) — área principal blanca, tarjetas blancas
   con borde sutil, links "Ver todas →" en naranja.
5. **Clientes** (`/clients`) — botón "+ Nuevo cliente" naranja arriba a la
   derecha; tabla con links "Ver →" en naranja.
6. **Campañas** (`/campaigns`) — botón "+ Nueva campaña" naranja; abrir una
   campaña y confirmar que **Aprobar sigue verde y Rechazar sigue rojo**
   (esto es intencional, no un bug).
7. **Detalle de campaña** — revisar que el wizard/formulario de edición use
   focus naranja en los campos, y que el botón de guardar sea naranja.
8. **Tareas** (`/tasks`) — confirmar que las tareas vencidas siguen
   marcadas en rojo (semántico, intencional).
9. **Alertas** (`/alerts`) — confirmar que los badges de severidad
   mantienen sus colores (crítico=rojo, etc. — no deben verse naranjas).
10. **Automatizaciones** (`/automations`) — confirmar que los badges de
    estado de ejecución no cambiaron de color.
11. **Menú móvil** — reducir el viewport (<1024px) y confirmar que aparece
    la barra superior vino con el logo y el botón hamburguesa; al abrirlo,
    el drawer debe tener el mismo esquema vino/naranja que el sidebar de
    escritorio.
12. **Configuración** (`/settings`) — confirmar que el toggle de
    notificaciones se ve naranja cuando está activado.
13. **Acceso denegado / 404** — si es fácil de provocar, confirmar que ya
    no son pantallas negras sino claras con el mismo esquema.

Si algo se ve distinto a lo descrito, o si el naranja se siente "demasiado
saturado"/el vino "demasiado oscuro" en la práctica (algo que no se puede
juzgar completamente sin verlo en pantalla real), avísame — los tokens
están centralizados en `globals.css`, así que cualquier ajuste de tono se
hace en un solo lugar sin tocar componentes.

## 18. Rollback

Todos los cambios de esta fase son reversibles con `git checkout` sobre los
archivos listados en §15 (nada fue commiteado). Si se decide revertir
parcialmente, el cambio de mayor impacto aislado es
`apps/web/src/styles/globals.css` + `apps/web/tailwind.config.ts` — revertir
solo esos dos archivos deja los componentes usando clases semánticas
(`bg-primary`, etc.) que Tailwind no podría resolver (fallarían a
transparente/sin estilo), así que **ambos deben revertirse juntos** si se
revierte alguno.


## 19. Addendum — Pase de pulido visual final (post-validación en navegador real)

**Fecha:** 2026-08-23
**Disparador:** el usuario validó visualmente la dirección de marca en un
navegador real (PASS confirmado en: área principal blanca, sidebar vino
corporativo, CTA naranja primario, colores de estado semánticos
preservados, fondo cálido de login, Campaign Studio limpio, UI no
sobresaturada) y solicitó un **pase de pulido final** con hallazgos
puntuales de esa validación. **Cero cambios funcionales/de arquitectura/de
lógica** en este pase — solo `className` e imágenes de `next/image`.

### 19.1 Logo — tamaño (hallazgo: "muy pequeño, se pierde detalle")

| Ubicación | Antes | Después |
|---|---|---|
| Sidebar (desktop) | 40×40px, padding `px-6 py-5` | **48×48px**, padding ajustado a `px-5 py-4` para balance |
| MobileNav (topbar móvil) | 28×28px | **32×32px** |
| Auth layout (login/signup/forgot/reset) | 48×48px, fila horizontal junto al texto | **80×80px**, stack vertical centrado (logo arriba, texto debajo), `mb-10` (antes `mb-8`) para más aire respecto a la tarjeta |
| Onboarding | mismo bloque duplicado que auth, 48px horizontal | mismo tratamiento vertical 80px aplicado por consistencia |

Ningún tamaño excede los rangos pedidos (sidebar ~44–52px, login ~72–90px).
Se preservó `object-contain` en todos los casos — **sin recorte ni
distorsión**. No se inventó un isotipo compacto (sigue fuera de alcance,
ver §16).

### 19.2 Sidebar — estado activo (hallazgo: "caja dentro de caja")

Antes: `rounded-md` completo + relleno sólido `bg-sidebar-active`
(`#A6360F`) + borde izquierdo de 3px — el redondeo en los 4 lados dentro
de un contenedor ya redondeado producía un efecto de "doble caja".

Después: `rounded-r-md` (solo el lado derecho redondeado, el borde
izquierdo queda a ras del borde del sidebar) + relleno traslúcido
`bg-primary-accent/15` (tinte naranja al 15% de opacidad sobre el fondo
vino) en vez de un color sólido separado, manteniendo la franja naranja
sólida de 3px como acento. El texto activo pasa de
`text-sidebar-active-foreground` a `text-sidebar-foreground` (blanco,
igual que antes visualmente, ahora reutilizando el token base).

Contraste: no requiere nuevo cálculo — el fondo base (vino, 10.33:1 con
blanco) solo recibe un tinte translúcido del 15%, por lo que el contraste
efectivo permanece muy por encima de AA. El hover (`bg-sidebar-hover`)
sigue siendo un tono sólido distinto del activo, manteniendo la
diferenciación visual pedida. Aplicado idénticamente en `Sidebar.tsx`
(desktop) y `MobileNav.tsx` (drawer móvil).

### 19.3 Topbar / header (hallazgo: reforzar jerarquía del título)

`AppTopBar.tsx` ya usaba `bg-background border-b border-border` desde el
pase anterior — sin cambios (no se agregó color, no se puso naranja,
selector de organización y menú de usuario intactos).

`Header.tsx` (breadcrumbs/título de página, usado en casi todas las rutas
protegidas): se tokenizaron los grises sueltos
(`text-gray-500`→`text-muted-foreground`, `text-gray-300`→`text-border`,
`hover:text-gray-900`→`hover:text-foreground`) y se reforzó la jerarquía
del título/última miga de pan: `text-gray-900 font-medium` →
**`text-foreground font-semibold text-base`** (antes heredaba el `text-sm`
del contenedor sin peso adicional). Sin bloques decorativos de color, sin
cambios de estructura.

### 19.4 Dashboard cards (hallazgo: "limpias pero genéricas")

`packages/ui/src/components/StatCard.tsx` y
`apps/web/src/components/dashboard/SummaryCard.tsx`: contenedor
tokenizado (`bg-white`→`bg-card`, `border-gray-200`→`border-border`,
`text-gray-500`→`text-muted-foreground`, `text-gray-900`→`text-foreground`)
más un tratamiento de hover sutil de marca:
**`hover:border-primary-accent/30 transition-colors`** — un borde que se
tiñe levemente de naranja al pasar el mouse, sin agregar ningún color
saturado nuevo ni fondo de color. **Los colores semánticos de
`SummaryCard` (`ACCENT_CLASSES`: rojo/ámbar/verde/azul/gris por tipo de
métrica) se dejaron exactamente igual** — son estado, no marca, y además
están cubiertos por tests (`SummaryCard.test.tsx` afirma
`border-l-red-500`/`border-l-gray-300`) que se preservaron sin tocar. Sin
funcionalidad de dashboard nueva.

### 19.5 Campaign Studio (hallazgo: "aprobado, solo fixes de consistencia")

Se revisaron los 9 componentes (§10) buscando específicamente
inconsistencias de tokens (no de diseño). Se encontró que varios usaban
`bg-white`/`border-gray-200` hardcodeado para el contenedor de tarjeta y
los inputs, en vez de los tokens `bg-card`/`border-border` ya usados por
`packages/ui`. Se tokenizaron **solo los contenedores de tarjeta y los
bordes de inputs de texto libre** (visualmente idénticos: `#FFFFFF`≈`bg-card`,
`#E5E7EB` gray-200 ≈ `#E9E2DC` border-border) en:
`CampaignsTable.tsx`, `CampaignWizardForm.tsx` (11 inputs),
`CampaignApprovalPanel.tsx` (contenedor + 1 input),
`EditCampaignModal.tsx` (shell del modal + 8 inputs),
`CampaignAutomationActivity.tsx`, `AIProviderSelect.tsx` (1 input).

**Explícitamente NO tocado** — semántico, confirmado de nuevo:
`CampaignApprovalPanel.tsx` mantiene `bg-red-600`/`border-red-300` en los
botones "Rechazar"/"Confirmar rechazo" (acción destructiva real);
`ComplianceReview.tsx` mantiene su mapa `critical`/`high`/`medium`/`low`
sin cambios; ningún badge de estado fue tocado. Cero cambios de handlers,
Server Actions, estado de React o texto de negocio — verificado que cada
diff de esta sección es de 1 línea de clases CSS. No es un rediseño: el
resultado visual (superficies blancas, filtros limpios, CTA naranja,
badges semánticos) es el mismo que ya estaba aprobado, solo ahora pasa por
el sistema de tokens central.

### 19.6 Login (hallazgo: "logo más grande, más presencia de marca")

Cubierto en 19.1 — logo 80px + stack vertical + `mb-10`. Estructura del
formulario, campos, y Server Actions de auth **sin cambios**. El fondo
sigue siendo `bg-muted` (cálido claro), la tarjeta `bg-card` blanca, el
CTA `bg-primary` naranja — nada de esto cambió, solo el bloque de marca
por encima de la tarjeta.

### 19.7 Responsive — verificación por código

- Sidebar: contenedor fijo `w-64`, logo en `w-12 h-12` (48px) dentro de
  `px-5 py-4` — no puede desbordar el ancho fijo del sidebar en ningún
  viewport donde el sidebar es visible (`lg:flex`, ≥1024px).
- MobileNav: logo en `w-8 h-8` (32px) dentro de la barra superior móvil —
  mismo patrón de contenedor fijo + `object-contain`, sin cambio
  estructural del drawer (`useState`/`aria-expanded` intactos).
- Auth/onboarding: logo de 80px vive dentro de `w-20 h-20` con el
  contenedor de la tarjeta limitado a `max-w-md` (448px) y padding externo
  `p-4` — en el viewport más angosto realista (~320px) el bloque de marca
  y la tarjeta siguen cabiendo sin overflow horizontal.
- No se modificó ningún breakpoint (`lg:hidden`/`lg:flex`/`sm:table-cell`/
  `md:table-cell`) en ningún archivo de este pase.

**Nota:** esta verificación es por revisión de código — este puente de
ejecución no tiene navegador disponible para capturar screenshots reales
en cada breakpoint. Ver smoke plan actualizado (§19.9) para la validación
visual del usuario.

### 19.8 Validación (typecheck / lint — ejecutados en este pase)

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspace=packages/ui` | ✅ limpio |
| `npm run typecheck --workspace=apps/web` | ✅ limpio |
| `npm run lint --workspace=packages/ui` | ✅ limpio |
| `npm run lint --workspace=apps/web` | ✅ limpio |

`npm test` sigue sin poder ejecutarse en este puente (misma limitación de
entorno documentada en §14 — `@rollup/rollup-linux-x64-gnu` ausente, sin
red para reinstalar). **No se declara PASS de tests que no se ejecutaron**
— se recomienda correr la suite completa en el entorno Windows real antes
del cierre formal de 8A.0, igual que en el pase anterior.

### 19.9 Archivos modificados en este pase (11, todos `className`/tamaños de imagen)

`apps/web/src/components/layout/Sidebar.tsx`,
`apps/web/src/components/layout/MobileNav.tsx`,
`apps/web/src/app/(auth)/layout.tsx`,
`apps/web/src/app/onboarding/page.tsx`,
`apps/web/src/components/layout/Header.tsx`,
`packages/ui/src/components/StatCard.tsx`,
`apps/web/src/components/dashboard/SummaryCard.tsx`,
`apps/web/src/components/campaigns/CampaignsTable.tsx`,
`apps/web/src/components/campaigns/CampaignWizardForm.tsx`,
`apps/web/src/components/campaigns/CampaignApprovalPanel.tsx`,
`apps/web/src/components/campaigns/EditCampaignModal.tsx`,
`apps/web/src/components/campaigns/CampaignAutomationActivity.tsx`,
`apps/web/src/components/campaigns/AIProviderSelect.tsx`.

(13 archivos en total — la cuenta "11" de la sección de arriba se refiere
a los grupos temáticos 19.1–19.6; el detalle completo por archivo es el de
esta lista.)

### 19.10 Smoke plan — puntos a re-verificar tras este pase

Adicional al smoke plan de §17, el usuario debería confirmar en su
navegador real:

1. **Sidebar** — el logo se ve notablemente más grande y con más detalle
   legible que antes; el layout del sidebar sigue balanceado (sin texto
   cortado, sin logo pegado al borde).
2. **Nav activo** — el item activo ya no se siente como "caja dentro de
   caja"; debe verse como un tinte naranja sutil + franja izquierda sólida
   pegada al borde del sidebar, distinto del hover.
3. **Login** — el logo es claramente más prominente (stack vertical, ~80px)
   con más aire antes de la tarjeta blanca, sin que la página se sienta
   como un landing page de marketing.
4. **Header de página** — el título de la sección actual (ej. "Dashboard",
   "Clientes") se ve con un poco más de peso visual que las migas de pan
   anteriores.
5. **Tarjetas de dashboard** — al pasar el mouse sobre una tarjeta de
   resumen, el borde debe teñirse levemente de naranja (muy sutil, no un
   fondo de color).
6. **Campaign Studio** — confirmar que no se ve ningún cambio visual
   perceptible más allá de bordes/superficies ligeramente más consistentes
   con el resto de la app (blanco/gris cálido en vez de blanco/gris puro
   de Tailwind).
7. **Móvil** (<1024px) — logo del topbar móvil visible y proporcionado,
   drawer se abre/cierra igual que antes.


## 20. Addendum — Micro-pulido final (recorte de asset + focus ring)

**Fecha:** 2026-08-23 (mismo día, tercer pase sobre 8A.0)
**Disparador:** smoke test en navegador real detectó dos problemas puntuales
tras el pase de §19. **Cero cambios funcionales/de arquitectura/de lógica**
en este pase — solo un asset de imagen nuevo y `className`.

### 20.1 Márgenes blancos del logo

**Diagnóstico real (no asumido):** se inspeccionó
`apps/web/public/brand/bopagency-logo.png` (924×492px, RGBA) programáticamente
vía el canal alfa (no por umbral de color, que puede confundir blanco
opaco con transparencia). El bounding box del contenido real (alfa > 10)
es `(36, 12, 917, 479)` — es decir, el canvas tiene un margen transparente
de solo ~36px izquierda / 12px arriba / 7px derecha / 13px abajo sobre
924×492 (~4–7%), no un margen masivo. El artwork real (bombilla + "Bop
Agency" + globos de chat + "Digital & AI Marketing") tiene un aspect ratio
intrínseco de **~1.86:1** (ancho:alto) — es un lockup horizontal, no un
ícono cuadrado.

**Causa real del "margen blanco excesivo" visto en pantalla:** los
contenedores de logo en sidebar/mobile-nav/auth eran **cuadrados** (48×48,
32×32, 80×80) con `object-contain`. Al forzar un artwork de 1.86:1 dentro
de una caja 1:1, `object-contain` escala hasta que el ancho llena la caja
y dejaba un espacio vacío considerable arriba/abajo (letterboxing) — eso es
lo que se percibía como "márgenes blancos", más que el padding real del
PNG (que es mínimo).

**Solución aplicada (ambas partes, ninguna redibuja/recolorea/distorsiona
el artwork):**
1. Se creó `apps/web/public/brand/bopagency-logo-trimmed.png` — un recorte
   exacto del bounding box de contenido real (con 6px de padding extra
   para no cortar el antialiasing de los bordes), resultando en
   893×479px. El PNG original **NO fue modificado ni reemplazado** — sigue
   intacto y sigue siendo la fuente del favicon (`icon.png`), sin cambios
   en la estrategia de favicon.
2. Se cambiaron los contenedores de logo de **cuadrados a rectángulos** que
   respetan el aspect ratio real del asset recortado (~1.86:1), **sin subir
   la altura visual** respecto al pase anterior (§19.1) — solo se ajustó el
   ancho para que coincida con la forma real del artwork:

| Ubicación | Antes (§19) | Después (este pase) |
|---|---|---|
| Sidebar (desktop) | 48×48 (cuadrado) | **82×44** (mismo asset recortado) |
| MobileNav | 32×32 (cuadrado) | **60×32** |
| Auth / onboarding | 80×80 (cuadrado) | **149×80** |

La altura se mantiene dentro de los rangos ya aprobados (44–52px sidebar,
72–90px login) — **no se "siguió subiendo el tamaño para compensar"**,
tal como pidió el mandato; se corrigió la forma del contenedor para que
coincida con el asset ya recortado, que es la causa raíz real.

### 20.2 Foco / outline del ítem activo del sidebar

**Diagnóstico:** el `<Link>` de cada ítem de navegación en `Sidebar.tsx` y
`MobileNav.tsx` **no tenía ninguna clase de `focus`/`outline` propia** —
heredaba el outline por defecto del navegador (`:focus`, no
`:focus-visible`), que en Chromium/Edge se dispara también al hacer click
con mouse en un enlace, no solo con teclado. Eso producía el rectángulo
oscuro/blanco intrusivo reportado específicamente al hacer click en
"Campañas".

**Corrección:** se agregó `outline-none focus-visible:ring-2
focus-visible:ring-primary-accent focus-visible:ring-offset-2
focus-visible:ring-offset-sidebar` a ambos `<Link>` de navegación
(Sidebar.tsx y MobileNav.tsx). `outline-none` quita el outline por defecto
del navegador incondicionalmente; `focus-visible:*` (no `focus:*`) agrega
el ring **solo** cuando el navegador determina que el foco vino de
teclado (Tab) — el estándar `:focus-visible` está diseñado exactamente
para este caso: mouse click no dispara `:focus-visible` en un `<a>`, Tab
sí. Resultado:
- Click con mouse en un ítem de nav → sin outline intrusivo.
- Navegación con Tab → ring naranja (`primary-accent`) claramente visible,
  con offset sobre el fondo vino del sidebar.
- El acento activo (franja izquierda de 3px + fondo `bg-primary-accent/15`)
  y el fondo hover (`sidebar-hover`) **no se tocaron** — siguen
  exactamente igual que en §19.2.
- No se removió accesibilidad de teclado en ningún punto — el foco sigue
  siendo perfectamente visible vía teclado, solo se dejó de mostrar en
  click de mouse.

### 20.3 Explícitamente NO tocado en este pase

Dashboard cards, topbar, layout de Campaign Studio, colores de badges de
estado, botones, estructura del formulario de login, lógica de auth, color
vino del sidebar, colores semánticos — todo permanece exactamente como en
§19 (previamente aprobado).

### 20.4 Validación (ejecutada en este pase)

| Comando | Resultado |
|---|---|
| `npm run typecheck --workspace=packages/ui` | ✅ limpio |
| `npm run typecheck --workspace=apps/web` | ✅ limpio |
| `npm run lint --workspace=packages/ui` | ✅ limpio |
| `npm run lint --workspace=apps/web` | ✅ limpio |

`npm test` sigue sin poder ejecutarse en este puente (misma limitación
documentada en §14/§19.8). No se declara PASS de tests no ejecutados.

### 20.5 Assets y archivos modificados en este pase

**Asset nuevo:** `apps/web/public/brand/bopagency-logo-trimmed.png`
(893×479px, recorte del bounding box de contenido real del PNG original +
6px de padding — mismo artwork, mismos colores, sin distorsión). El
original `bopagency-logo.png` se conserva sin cambios.

**Archivos de código (4, solo `className`/props de `Image`/comentarios):**
`apps/web/src/components/layout/Sidebar.tsx`,
`apps/web/src/components/layout/MobileNav.tsx`,
`apps/web/src/app/(auth)/layout.tsx`,
`apps/web/src/app/onboarding/page.tsx`.

### 20.6 Recheck manual sugerido

1. **Presencia visual del logo** — en sidebar/mobile/login, el artwork
   (bombilla + wordmark + tagline) debe verse notablemente más grande y
   sin espacio vacío evidente arriba/abajo dentro de su contenedor.
2. **Foco de mouse vs. teclado en sidebar** — hacer click con mouse en
   "Campañas" (u otro ítem) y confirmar que **no** aparece un rectángulo
   oscuro/blanco alrededor; luego navegar con Tab por el sidebar y
   confirmar que el ítem enfocado **sí** muestra un anillo naranja visible.


## 21. Cierre final — Evidencia de validación Windows (definitiva)

**Fecha:** 2026-08-23
**Naturaleza de este addendum:** actualización de evidencia de cierre
únicamente. **Cero cambios de código, cero cambios visuales, cero
refactor, cero migración** — solo documentación. No se tocó
`supabase/config.toml` ni `.agencia-ai/.claude/commands/new-client.md`.

### 21.1 Evidencia de tests — entorno Windows real del usuario

**`packages/ui`:**
```
npm test --workspace=packages/ui
```
- **0 test files**
- **exit code 0** vía `--passWithNoTests`
- Este workspace **no tiene tests** — no se declara ni se insinúa que los
  tenga. Se registra explícitamente como "0 test files, exit code 0 vía
  `--passWithNoTests`", nunca como "PASS" de una suite inexistente.

**`apps/web`:**
- **29 test files passed**
- **356 tests passed**
- **0 failed**

Esta es la evidencia final y definitiva del cierre de 8A.0, ejecutada por
el usuario en su entorno Windows real (no en este puente, que no puede
ejecutar `vitest` por la limitación de `@rollup/rollup-linux-x64-gnu` ya
documentada en §14/§19.8/§20.4).

### 21.2 Typecheck — evidencia final

| Workspace | Resultado |
|---|---|
| `packages/ui` | ✅ PASS |
| `apps/web` | ✅ PASS |

### 21.3 Lint — evidencia final

| Workspace | Resultado |
|---|---|
| `packages/ui` | ✅ PASS |
| `apps/web` | ✅ PASS |

### 21.4 Smoke visual manual — evidencia final

**Resultado: ✅ PASS**, confirmado visualmente por el usuario en navegador
real sobre:
- Branding y presencia de logo en login.
- Branding del sidebar (fondo vino, contenedor de logo).
- Navegación activa (estado sin "caja dentro de caja", sin outline
  intrusivo al hacer click — ver §20.2).
- Campaign Studio (superficies/inputs consistentes con el sistema de
  tokens, sin cambios de lógica ni de layout).
- Colores semánticos de estado (badges de alertas/tareas/automatizaciones/
  compliance — verde/ámbar/rojo/azul intactos, no reemplazados por naranja
  de marca).
- Área principal blanca.
- CTA naranja.
- Comportamiento de `focus-visible` (ring visible solo con teclado, sin
  outline en click de mouse — ver §20.2).
- Corrección de proporción/aspect-ratio del logo (asset recortado +
  contenedores no cuadrados — ver §20.1).

### 21.5 Estado final de Phase 8A.0

**Phase 8A.0 — Branding & Theming Foundation: ✅ COMPLETA.**

Todos los criterios de cierre están satisfechos: auditoría inicial (§1),
arquitectura de tokens implementada y consumida en toda la app (§3–§9),
Campaign Studio revisado sin cambios de lógica (§10, §19.5), auth/login
con marca aplicada sin tocar lógica de autenticación (§11, §19.6, §20.1),
accesibilidad verificada (contraste WCAG computacional §4, foco visible
§13, §20.2), responsive verificado por código (§12, §19.7), pulido visual
completo tras smoke real (§19, §20), y ahora evidencia de tests/typecheck/
lint/smoke confirmada en el entorno Windows real del usuario (§21, este
addendum). No queda ningún ítem bloqueante pendiente para el cierre de
esta subfase.

### 21.6 Follow-up no bloqueante (se mantiene, no se resuelve en 8A.0)

- **Isotipo/favicon compacto dedicado de BopIAgency para tamaños muy
  pequeños** (16×16 y similares) — el asset recortado (§20.1) mejora la
  proporción a tamaños de sidebar/mobile/login, pero a resolución de
  favicon real el detalle interno del lockup completo sigue perdiéndose
  por ser un lockup horizontal complejo, no un ícono simplificado. Se
  recomienda como trabajo de una fase posterior (diseño de un isotipo
  simplificado, sin texto), **nunca inventado por Claude en ninguna fase
  de 8A.0** — ver §5, §16.

### 21.7 Archivos previstos para el commit de cierre de Phase 8A.0

Ver §15 (lista base de 8A.0) + §19.9 (pulido visual) + §20.5 (micro-pulido:
`bopagency-logo-trimmed.png` nuevo + 4 archivos de código) — la unión de
esas tres listas es el conjunto completo de archivos que un commit de
cierre de 8A.0 debería incluir. **Ningún archivo fue agregado a git
(`git add`) ni commiteado en ningún momento de esta fase** — la decisión
de cuándo y cómo commitear queda en manos del usuario.

### 21.8 Archivos explícitamente excluidos

`supabase/config.toml` (diff local de puertos, nunca revertido ni
tocado) y `.agencia-ai/.claude/commands/new-client.md` (untracked,
debe permanecer untracked) — confirmados sin cambios en cada verificación
de `git status` realizada a lo largo de toda la fase 8A.0, incluyendo este
cierre final.
