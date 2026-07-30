# INITIAL STATE — Fase 1

## BopIAgency — Estado inicial antes de implementar el monorepo

**Fecha:** 2026-07-29  
**Fase:** 1 — Base del Monorepo

---

## Estado del repositorio Git

**Repositorio activo:** `agency-dashboard/` (único directorio con `.git`)  
**Rama:** `master`  
**Último commit:** `a463fc6` — "Add automated client reports module"

### git status --short (antes de Fase 1)

```
 M .env.example
 M .gitignore
 M server/config.ts
 M server/index.ts
 M src/App.tsx
 M src/components/Sidebar.tsx
 M src/pages/ReportsPage.tsx
 M src/services/api.ts
 M src/types/index.ts
?? server/schemas/automationSchemas.ts
?? server/services/automationService.ts
?? server/services/reportDeliveryService.ts
?? server/services/reportRecipientsService.ts
?? src/pages/AutomationsPage.tsx
```

**9 archivos modificados (no commiteados). 5 archivos untracked.**  
Estos cambios preexistentes son de Fase 0 y no serán tocados.

---

## Entorno de ejecución

| Herramienta  | Versión           |
| ------------ | ----------------- |
| Node.js      | v22.22.3          |
| npm          | 10.9.8            |
| SO (sandbox) | Ubuntu 22 (Linux) |

---

## Estructura del directorio antes de Fase 1

```
BopIAgency/
├── agency-dashboard/   ← Dashboard React + Express existente (NO MODIFICAR)
├── backups/            ← Backups de workflows n8n
├── clientbop/          ← [directorio existente]
├── docs/               ← Documentación de arquitectura y seguridad
├── n8n-local/          ← Docker Compose de n8n (NO MODIFICAR)
└── shared-data/        ← Datos operacionales JSON (NO MODIFICAR)
```

**Directorios que NO existían antes de Fase 1:**

- `apps/` — creado en Fase 1
- `packages/` — creado en Fase 1
- `docs/implementation/` — creado en Fase 1
- `package.json` raíz — creado en Fase 1

---

## Versiones seleccionadas para Fase 1

| Dependencia          | Versión | Razón                                           |
| -------------------- | ------- | ----------------------------------------------- |
| next                 | 15.5.22 | Última estable Next.js 15 — App Router maduro   |
| react / react-dom    | 18.3.1  | Stable, soportado por Next.js 15                |
| typescript           | 5.9.3   | Última TypeScript 5.x — API estable y conocida  |
| tailwindcss          | 3.4.19  | Tailwind 3 — configuración estándar establecida |
| vitest               | 2.1.9   | Testing moderno compatible con Vite/ESM         |
| zod                  | 3.25.76 | Validación y schemas, compatible con el stack   |
| @vitejs/plugin-react | —       | Para Vitest con React                           |
| eslint               | 9.x     | Flat config (eslint.config.mjs)                 |
| prettier             | 3.x     | Formateo de código                              |

---

_Documento creado al inicio de la Fase 1 — 2026-07-29._
