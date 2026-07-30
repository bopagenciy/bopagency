# ADR-005: Estructura del Monorepo — npm Workspaces
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

El repositorio actual es un **polirepo informal**: el directorio raíz contiene múltiples proyectos semi-independientes (`agency-dashboard/`, `n8n-local/`, `.agencia-ai/`, `shared-data/`) sin una estructura de monorepo real ni coordinación de dependencias.

En el nuevo stack se necesita al menos:
- Una aplicación Next.js (`apps/web/`)
- Tipos y utilidades compartidas entre la app y las funciones Inngest
- Posibilidad de añadir más apps en el futuro (ej: portal de clientes)

**Problema a resolver:** Los tipos TypeScript y los schemas Zod que existen en `agency-dashboard/src/types/index.ts` y `agency-dashboard/server/schemas.ts` deben ser accesibles tanto desde la app Next.js como desde las funciones Inngest. Sin un monorepo, esto requeriría duplicar código o publicar paquetes npm privados.

**Opciones consideradas:**
1. npm Workspaces (built-in, sin tooling adicional)
2. Turborepo (build cache + pipeline orchestration)
3. Nx (monorepo enterprise, heavily opiniated)
4. pnpm Workspaces
5. No monorepo — imports relativos o duplicación

---

## Decisión

**Se adopta npm Workspaces como sistema de monorepo, sin Turborepo ni Nx en la fase inicial.**

La estructura propuesta:

```
bop-agency/
├── apps/
│   └── web/                    ← Next.js app (app principal)
├── packages/
│   ├── shared/                 ← Tipos, schemas Zod, utilidades compartidas
│   └── config/                 ← Configs compartidas (ESLint, TypeScript, Tailwind)
├── docs/                       ← Documentación (existente)
├── legacy/                     ← agency-dashboard (archivado en Fase 12)
└── package.json                ← workspace root
```

---

## Justificación

| Criterio | npm Workspaces | Turborepo | Nx | pnpm Workspaces |
|----------|---------------|-----------|-----|-----------------|
| Curva de aprendizaje | Muy baja | Media | Alta | Baja |
| Complejidad de setup | Mínima (nativo) | Media | Alta | Baja |
| Build cache distribuida | ❌ | ✅ | ✅ | ❌ |
| Requisitos adicionales | Ninguno | turborepo CLI | Nx CLI | pnpm |
| Adecuado para 1-3 apps | ✅ | ✅ | ⚠️ Overkill | ✅ |
| Compatibilidad con Vercel | ✅ | ✅ | ✅ | ✅ |
| Herramienta ya instalada | ✅ npm nativo | ❌ | ❌ | ❌ |

**Razón principal:** Para una agencia con 1 app web principal y 1 paquete compartido, Turborepo y Nx añaden complejidad sin beneficio proporcional. npm Workspaces provee exactamente lo que se necesita: instalación de dependencias compartidas y imports entre paquetes con `@bop-agency/shared`.

**Turborepo puede adoptarse en el futuro** si el número de apps crece (ej: app de clientes, app mobile) y el tiempo de build se convierte en un problema.

---

## Estructura de packages/shared

El paquete `@bop-agency/shared` contiene:

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── client.ts         ← De agency-dashboard/src/types/index.ts
│   │   ├── campaign.ts
│   │   ├── task.ts
│   │   ├── alert.ts
│   │   ├── metrics.ts
│   │   └── automation.ts
│   ├── schemas/
│   │   ├── client.schema.ts  ← De server/schemas.ts
│   │   ├── metrics.schema.ts ← De server/schemas/metricsSchemas.ts
│   │   ├── alert.schema.ts
│   │   └── automation.schema.ts ← De server/schemas/automationSchemas.ts
│   ├── utils/
│   │   ├── date.ts
│   │   ├── formatters.ts
│   │   └── errors.ts
│   └── constants/
│       ├── platforms.ts      ← 14 plataformas de metricsSchemas.ts
│       └── status.ts         ← Estados de tasks, campaigns, alerts
└── package.json
```

---

## Consecuencias

**Positivas:**
- Tipos compartidos evitan duplicación entre `apps/web/` y funciones Inngest
- Los schemas Zod reutilizables de `agency-dashboard/server/schemas/` se migran una sola vez
- Setup mínimo — funciona con `npm install` en la raíz
- Vercel detecta automáticamente el workspace y despliega `apps/web/`

**Negativas:**
- Sin build cache — en proyectos más grandes esto puede ser lento
- Npm workspaces tiene menos features que pnpm workspaces (ej: no catalogs)
- Los paths de imports entre packages requieren configuración en `tsconfig.json`

**Regla de dependencias entre packages:**
- `apps/web/` puede importar de `packages/shared/` y `packages/config/`
- `packages/shared/` NO puede importar de `apps/web/`
- Las funciones Inngest (`apps/web/inngest/`) pueden importar de `packages/shared/`

**No crear todavía:** La estructura de monorepo se crea en la Fase 1 del roadmap. Este documento es solo la decisión de diseño.

---

## Alternativas descartadas

**Turborepo:** Añade `turbo.json`, pipeline definitions, y una CLI externa. Para 1-2 apps es overhead sin beneficio real. Se puede adoptar en el futuro.

**Nx:** Extremadamente opinionado. Genera código, tiene su propio sistema de plugins, y requiere aprender la CLI de Nx. Overkill para una agencia con 1 equipo pequeño.

**No monorepo (imports relativos):** Los imports entre proyectos (`../agency-dashboard/server/schemas`) son frágiles y no funcionan cuando los proyectos están en rutas distintas. La duplicación de código es peor opción.

---

## Referencias

- `agency-dashboard/src/types/index.ts` — tipos a migrar a `packages/shared/`
- `agency-dashboard/server/schemas.ts` — schemas Zod a migrar
- `agency-dashboard/server/schemas/metricsSchemas.ts` — 14 plataformas enumeradas
- `docs/architecture/ARCHITECTURE.md` — sección 8, estructura de monorepo propuesta
- npm Workspaces docs: https://docs.npmjs.com/cli/v9/using-npm/workspaces
