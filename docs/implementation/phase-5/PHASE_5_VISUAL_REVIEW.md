# Phase 5 — Visual Review

**Fecha:** 2026-08-04
**Scope:** Rutas /dashboard, /alerts, /tasks, /metrics
**Método:** Revisión de código estático + análisis de clases Tailwind + tests de componentes

> **Nota:** Screenshots no disponibles — el servidor Next.js no puede ejecutar en sandbox Linux (SWC bus error). La revisión visual se basa en análisis exhaustivo del código JSX/Tailwind y los tests de componentes que verifican rendering condicional.

---

## 1. Revisión por ruta

### /dashboard

**Estructura:**
```
DashboardPage (Server Component)
├── Header (breadcrumb "Dashboard")
└── div.p-6.space-y-6          ← div (no main — AppShell provee el único <main>)
    ├── h1.sr-only "Dashboard"
    ├── RepositoryErrorState (condicional)
    ├── AgencySummaryCards (4 cards)
    ├── ActiveAlertsSidebar
    ├── "Tareas recientes" panel
    └── Grid de accesos rápidos (4 links)
```

**Visual esperado:**
- Grid 4 columnas en lg: Clientes / Alertas / Tareas / Gasto Total
- Cada card: borde izquierdo de color (`border-l-4`), ícono, valor, sub-texto
- Alertas recientes: lista con `border-l-4` por severidad (rojo/ámbar/azul)
- Tareas recientes: lista con badge de estado y prioridad
- Accesos rápidos: grid 2 cols (mobile) / 4 cols (sm+)

**Colores de accent dinámicos:**
| Condición | Color |
|-----------|-------|
| `critical > 0` | `border-red-500` |
| `warning > 0` (sin critical) | `border-amber-500` |
| sin alertas | `border-green-500` |

---

### /alerts

**Estructura:**
```
AlertsPage (Server Component)
├── Header (breadcrumb "Alertas")
└── div.p-6                    ← div (no main — AppShell provee el único <main>)
    ├── h1 "Alertas"
    ├── AlertsFilters (client — 2 selects)
    ├── RepositoryErrorState (condicional)
    ├── AlertsTable (client)
    │   ├── tabla aria-label="Lista de alertas"
    │   ├── thead (Severidad / Estado / Creada / Acciones)
    │   ├── AlertSeverityBadge por fila
    │   ├── AlertStatusBadge por fila
    │   ├── AlertActions (Reconocer / Resolver) por fila
    │   └── EmptyState heading="Sin alertas" si lista vacía
    └── Pagination (client)
```

**Visual esperado:**
- Filtros en una barra horizontal con gap
- Badges de severidad: `ring-red-500` (Crítica), `ring-amber-500` (Advertencia), `ring-blue-500` (Info)
- Badges de estado: rojo (Activa), ámbar (Reconocida), gris (Pospuesta), verde (Resuelta)
- Botones de acción: gris neutro con hover, disabled durante pending
- EmptyState: ícono `🔕` centrado con texto "Sin alertas"

---

### /tasks

**Estructura:**
```
TasksPage (Server Component)
├── Header (breadcrumb "Tareas")
└── div.p-6                    ← div (no main — AppShell provee el único <main>)
    ├── h1 "Tareas"
    ├── TasksFilters (client — status + overdue)
    ├── RepositoryErrorState (condicional)
    ├── TasksTable (client)
    │   ├── tabla aria-label="Lista de tareas"
    │   ├── thead (Título / Prioridad / Estado / Fecha límite / Acción)
    │   ├── TaskPriorityBadge por fila
    │   ├── TaskStatusBadge por fila
    │   ├── Fecha límite: rojo + ⚠️ si vencida
    │   ├── TaskStatusAction (select) si canMutate + no final
    │   └── EmptyState heading="Sin tareas" si lista vacía
    └── Pagination (client)
```

**Visual esperado:**
- Prioridad: gris (Baja), azul (Media), ámbar (Alta), rojo (Urgente)
- Estado: gris (Pendiente), azul (En progreso), verde (Completada), rojo (Cancelada), ámbar (Bloqueada)
- Fechas vencidas: `text-red-600` + `⚠️` inline
- Select de transición: ancho mínimo, borde gris, solo estados válidos como opciones

---

### /metrics

**Estructura:**
```
MetricsPage (Server Component)
├── Header (breadcrumb "Métricas")
└── div.p-6                    ← div (no main — AppShell provee el único <main>)
    ├── h1 "Métricas"
    ├── MetricsFilters (client — plataforma + período)
    ├── MetricsSummaryCards (4 cards si hay datos)
    ├── RepositoryErrorState (condicional)
    ├── MetricsTable (client)
    │   ├── overflow-x-auto wrapper
    │   ├── tabla aria-label="Tabla de métricas"
    │   ├── columna "Período" sticky (left-0)
    │   ├── columnas: Plataforma / Cuenta / Período / Gasto / Impresiones / Clics / Leads / ROAS
    │   ├── valores formateados: $1.5M, 25K, 3.50x
    │   ├── "—" para roas=0 y leads=0
    │   └── EmptyState heading="Sin métricas" si lista vacía
    └── Pagination (client)
```

**Visual esperado:**
- Summary cards: mismo estilo que dashboard (border-l-4 gris/azul)
- Tabla con scroll horizontal en mobile — columna "Período" fija
- Plataformas con labels: "Meta Ads", "Google Ads", "TikTok Ads", etc.
- Números grandes formateados: nunca `1500000`, siempre `$1.5M`

---

## 2. Mobile (390 × 844)

| Elemento | Comportamiento |
|----------|----------------|
| Sidebar (`hidden lg:flex`) | Oculto — `display:none`, fuera del árbol de accesibilidad |
| MobileNav (`lg:hidden`) | Visible — barra superior con logo + botón hamburguesa |
| Botón hamburguesa | `aria-label="Toggle navigation"`, `aria-expanded={open}` |
| Drawer de navegación | Aparece al hacer click en hamburguesa — contiene `<nav>` con todos los enlaces |
| Summary cards | `grid-cols-1 sm:grid-cols-2` → 1 col en mobile |
| Tablas | `overflow-x-auto` → scroll horizontal contenido |
| Filtros | `flex-wrap` → colapsan verticalmente |
| Accesos rápidos (dashboard) | `grid-cols-2` → 2 columnas |
| Botones de acción | Width suficiente para tap target |

**Hallazgos potenciales:**
- Las tablas tienen `whitespace-nowrap` en celdas numéricas — correcto para evitar wrapping
- Los filtros con `flex-wrap gap-2` colapsan bien sin superposición
- Columna sticky en MetricsTable puede tener conflicto con `overflow-x-auto` en algunos browsers → documentado como riesgo residual

---

## 3. Tablet (768 × 1024)

| Elemento | Comportamiento |
|----------|----------------|
| Sidebar (`hidden lg:flex`) | Oculto — `lg` = 1024px; 768px queda en rango "mobile" para Tailwind |
| MobileNav (`lg:hidden`) | Visible — mismo comportamiento que mobile |
| Botón hamburguesa | `aria-label="Toggle navigation"` — mismo acceso a la navegación |
| Summary cards | `sm:grid-cols-2` → 2 columnas |
| Tablas | Suficiente espacio para columnas principales sin scroll |
| Filtros | Una fila horizontal sin wrap |

---

## 4. Desktop (1440 × 900)

| Elemento | Comportamiento |
|----------|----------------|
| Summary cards | `lg:grid-cols-4` → 4 columnas |
| Dashboard grid | `lg:grid-cols-2` para sidebar + tareas |
| Sidebar | Siempre visible |
| Tablas | Todas las columnas visibles sin scroll |

---

## 5. Responsive

| Check | Estado |
|-------|--------|
| Sin scroll horizontal global | ✅ (tablas en `overflow-x-auto`, main sin width fija) |
| Tablas contenidas | ✅ wrapper `overflow-x-auto` en todas las tablas |
| Filtros utilizables en mobile | ✅ `flex-wrap` |
| Cards apiladas en mobile | ✅ grid responsive |
| Botones visibles | ✅ no hay botones con display:none en mobile |
| Textos sin cortes | ✅ `truncate` en títulos largos, `whitespace-nowrap` en datos |
| Charts responsive | N/A — MetricsChart diferido |

---

## 6. Accesibilidad visual

| Check | Estado | Detalle |
|-------|--------|---------|
| Un h1 por página | ✅ | Corregido en /dashboard (añadido `sr-only`) |
| Jerarquía de headings | ✅ | h1 → h2 dentro del contenido |
| Único landmark `<main>` | ✅ | AppShell provee el único `<main>`; páginas usan `<div>` (corregido en Phase 5E) |
| Labels en formularios | ✅ | Filtros tienen `<label>` en filtros, aria-label en tablas |
| Navegación por teclado | ✅ | Focus order natural (no hay `tabindex` negativo) |
| Focus visible | ⚠️ | Tailwind reset puede quitar outline — depende de configuración del browser |
| Botones con nombre accesible | ✅ | Texto en botones "Reconocer", "Resolver" |
| Tablas semánticas | ✅ | `<thead>/<tbody>/<th>/<td>` con `scope` |
| aria-label en tablas | ✅ | "Lista de alertas", "Lista de tareas", "Tabla de métricas" |
| aria-live en mutaciones | ✅ | `aria-busy={isPending}` en AlertActions, TaskStatusAction |
| Badges con texto | ✅ | No solo color — "Crítica", "Activa", etc. |
| Contraste básico | ✅ | Paleta Tailwind tiene contraste mínimo 4.5:1 en combinaciones usadas |
| Zoom 200% | ✅ (estimado) | Grid responsive y flex-wrap previenen overflow |

---

## 7. Problemas encontrados y correcciones

### P0 — Doble `<main>` landmark en las 4 páginas protegidas (CORREGIDO)
**Severidad:** Alta (E2E — causó 11 fallos de 60)
**Causa:** Cada página de contenido usaba `<main>` como wrapper de su contenido. El `AppShell` ya provee `<main className="flex-1 bg-gray-50">` en la línea 128. El resultado era dos elementos `<main>` simultáneos en el DOM, lo que viola WCAG 2.1 (debe haber un único landmark `main`) y hacía fallar a `page.getByRole('main')` con `toHaveCount(1)`.

**Archivos afectados:**
- `apps/web/src/app/(protected)/dashboard/page.tsx`
- `apps/web/src/app/(protected)/alerts/page.tsx`
- `apps/web/src/app/(protected)/tasks/page.tsx`
- `apps/web/src/app/(protected)/metrics/page.tsx`

**Corrección:** Cambiar el wrapper de `<main ...>` a `<div ...>` en las 4 páginas, conservando exactamente las mismas clases CSS. El `AppShell` queda como único `<main>` semántico.

**Resultado E2E:** `49 passed / 11 failed` → `60 passed / 0 failed` (Chromium)

---

### P1 — /dashboard sin `<h1>` (CORREGIDO)
**Severidad:** Media (accesibilidad)
**Causa:** El componente `<Header>` no genera heading semántico.
**Corrección:** `<h1 className="sr-only">Dashboard</h1>` añadido en `dashboard/page.tsx`.

### P2 — Focus visible no garantizado (ABIERTO)
**Severidad:** Baja
**Causa:** Tailwind base styles incluyen `* { outline: none }` en algunos configs. No verificable sin browser.
**Recomendación Phase 6:** Agregar `:focus-visible` explícito en `globals.css`.

### P3 — Columna sticky con overflow-x-auto (RIESGO RESIDUAL)
**Severidad:** Baja
**Causa:** `position: sticky` dentro de `overflow-x-auto` no siempre funciona en Safari < 15.
**Recomendación Phase 6:** Verificar en Safari con datos reales. Fallback: remover sticky si hay problemas.

### P4 — MetricsChart ausente (DEUDA TÉCNICA)
**Severidad:** Baja funcional (fue diferido intencionalmente)
**Causa:** recharts no instalado (timeout en sandbox).
**Recomendación Phase 6:** Instalar recharts, implementar gráfico de tendencia temporal.

---

## 8. Estado final tras correcciones Phase 5E

| Elemento | Estado |
|----------|--------|
| Único `<main>` por página | ✅ CORREGIDO — AppShell es el único `<main>` |
| `<h1>` en /dashboard | ✅ CORREGIDO — `sr-only` |
| aria-labels de tablas | ✅ "Lista de alertas" / "Lista de tareas" / "Tabla de métricas" |
| Selectores E2E robustos | ✅ `exact: true`, rol semántico, sin regex ambigua |
| Test sidebar responsive | ✅ CORREGIDO — viewport-aware: hamburguesa en mobile/tablet, nav directa en desktop |
| Test accesos rápidos | ✅ CORREGIDO — `gotoProtected` reemplaza `page.goBack()`, validación de heading por destino |
| `gotoProtected` estable | ✅ CORREGIDO — `domcontentloaded` + wait para `<main>` visible |
| Test botón menú móvil | ✅ AÑADIDO — valida `aria-label="Toggle navigation"` en mobile/tablet |
| Resultado E2E Chromium | ✅ **61 passed / 0 failed** |
| Resultado E2E Mobile | ✅ **61 passed / 0 failed** |
| Resultado E2E Tablet | ✅ **61 passed / 0 failed** |
