# Estructura del Monorepo — Fase 1

## Árbol de directorios

```
BopIAgency/
├── apps/
│   └── web/                          # Next.js 15 App Router
│       ├── src/
│       │   ├── app/                  # Rutas (App Router)
│       │   │   ├── layout.tsx        # Root layout con AppShell
│       │   │   ├── page.tsx          # → redirect /dashboard
│       │   │   ├── dashboard/page.tsx
│       │   │   ├── clients/
│       │   │   │   ├── page.tsx
│       │   │   │   └── [clientId]/page.tsx
│       │   │   ├── campaigns/
│       │   │   │   ├── page.tsx
│       │   │   │   └── new/page.tsx
│       │   │   ├── automations/page.tsx
│       │   │   ├── reports/page.tsx
│       │   │   ├── alerts/page.tsx
│       │   │   ├── tasks/page.tsx
│       │   │   └── settings/page.tsx
│       │   ├── components/
│       │   │   ├── layout/           # AppShell, Sidebar, MobileNav, Header
│       │   │   └── common/           # DemoBanner, UnderConstruction
│       │   ├── lib/
│       │   │   └── placeholder-data.ts
│       │   ├── providers/index.tsx
│       │   └── types/index.ts
│       ├── next.config.ts
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── vitest.config.ts
│
├── packages/
│   ├── shared/                       # Kernel compartido
│   │   └── src/
│   │       ├── types/                # Result<T,E>, AppError, PaginatedResult
│   │       ├── constants/            # AD_PLATFORMS, statuses, roles
│   │       ├── utils/                # date, env
│   │       └── schemas/              # Zod: Id, Pagination, DateRange, Slug
│   │
│   ├── ui/                           # Componentes React reutilizables
│   │   └── src/
│   │       └── components/           # Button, Card, Badge, Table, Modal…
│   │
│   ├── domain/                       # Capa de dominio (sin dependencias externas)
│   │   └── src/
│   │       ├── entities/             # 11 entidades tipadas
│   │       ├── repositories/         # 10 interfaces de repositorio
│   │       ├── value-objects/        # Email, Money, DateRange, Percentage
│   │       └── errors/               # Errores de dominio tipados
│   │
│   ├── application/                  # Casos de uso y puertos primarios
│   │   └── src/
│   │       ├── use-cases/            # 8 casos de uso
│   │       └── ports/                # LoggerPort, EventBusPort
│   │
│   ├── infrastructure/               # Adaptadores (sin dependencias de framework)
│   │   └── src/
│   │       ├── logging/              # ConsoleLogger
│   │       └── in-memory/            # InMemoryClientRepository (dev/test)
│   │
│   ├── ai-engine/                    # Contratos para capa de IA
│   │   └── src/contracts/
│   │
│   ├── automation-engine/            # Contratos para automatizaciones
│   │   └── src/contracts/
│   │
│   └── integrations/                 # Puertos de integración externa
│       └── src/contracts/
│
├── docs/
│   ├── audit/                        # (no modificado)
│   ├── security/                     # Fase 0 (no modificado)
│   └── implementation/
│       └── phase-1/                  # ← este directorio
│
├── tsconfig.base.json                # Config TypeScript compartida
├── eslint.config.mjs                 # ESLint 9 flat config
├── prettier.config.mjs               # Prettier 3
├── .prettierignore
└── package.json                      # Workspace raíz
```

## Grafo de dependencias

```
apps/web
  └── @bop-agency/ui
  └── @bop-agency/shared
  └── @bop-agency/domain
  └── @bop-agency/application

@bop-agency/application
  └── @bop-agency/shared
  └── @bop-agency/domain

@bop-agency/domain
  └── @bop-agency/shared

@bop-agency/infrastructure
  └── @bop-agency/shared
  └── @bop-agency/domain
  └── @bop-agency/application

@bop-agency/ai-engine
  └── @bop-agency/shared
  └── @bop-agency/domain

@bop-agency/automation-engine
  └── @bop-agency/shared
  └── @bop-agency/domain

@bop-agency/integrations
  └── @bop-agency/shared

@bop-agency/shared     (sin dependencias internas)
@bop-agency/ui         (sin dependencias internas)
```

## Reglas de dependencia (ADR-005)

- Las capas solo dependen hacia adentro: `shared → domain → application → infrastructure → apps`
- `ui` depende únicamente de React (sin lógica de dominio)
- `domain` no importa nada de `application` ni de `infrastructure`
- `integrations` solo depende de `shared` (tipos primitivos)
- Ningún paquete importa directamente de `apps/web`

## Convenciones de nombrado

- Paquetes: `@bop-agency/<name>` en kebab-case
- Branded types: `type ClientId = string & { readonly _brand: 'ClientId' }`
- Entidades: interfaz `readonly` plana sin métodos
- Repositorios: prefijo `I` omitido — solo `ClientRepository` (interfaz implícita por convención TypeScript)
- Casos de uso: función pura `async function listClients(input, deps): Promise<Result<T>>`
- Errores: `notFound()`, `validationError()`, `createError()` de `@bop-agency/shared`
