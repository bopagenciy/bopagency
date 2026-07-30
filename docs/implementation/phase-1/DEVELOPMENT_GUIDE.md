# Guía de Desarrollo — Fase 1

## Requisitos previos

- Node.js 22+ (LTS)
- npm 10+
- Git

## Instalación

```bash
# Desde la raíz del repositorio
cd BopIAgency
npm install
```

Esto instala todas las dependencias de todos los workspaces en una sola operación.

## Scripts disponibles

### Desde la raíz (todos los workspaces)

```bash
npm run dev          # Inicia apps/web en http://localhost:3200
npm run typecheck    # tsc --noEmit en todos los paquetes
npm run lint         # ESLint en todos los paquetes
npm run test         # Vitest en todos los paquetes
npm run build        # Build secuencial: shared → ui → domain → … → apps/web
npm run format       # Prettier (escribe cambios)
npm run format:check # Prettier (solo verifica, sin cambios)
```

### Por workspace

```bash
npm run dev --workspace=apps/web
npm run test --workspace=packages/shared
npm run typecheck --workspace=packages/domain
```

## Convenciones de código

### Errores — Result\<T, E\>

Nunca lanzar excepciones en la capa de aplicación o dominio. Usar el patrón Result:

```typescript
import { ok, err, isOk } from '@bop-agency/shared';

async function getClient(id: ClientId): Promise<Result<Client>> {
  const found = await repo.findById(id);
  if (!isOk(found)) return err(clientNotFound(id));
  return ok(found.value);
}
```

### Casos de uso — inyección de dependencias

Los casos de uso reciben dependencias como parámetro, nunca las importan directamente:

```typescript
export type GetClientDeps = {
  clientRepository: ClientRepository;
  logger: LoggerPort;
};

export async function getClient(input: GetClientInput, deps: GetClientDeps) { … }
```

### Branded types

Usar branded types para IDs para evitar confusión entre entidades:

```typescript
type ClientId = string & { readonly _brand: 'ClientId' };
// Nunca pasar un CampaignId donde se espera un ClientId
```

### Datos de demostración

Todo dato de demostración lleva `_demo: true` y nombres ficticios:

```typescript
const demoClient: DemoClient = {
  _demo: true,
  id: 'demo-client-1',
  name: 'Cliente Demo Uno',
  // ...
};
```

## Estructura de un caso de uso

```
packages/application/src/use-cases/<módulo>/<acción>.use-case.ts
```

Patrón:

```typescript
// 1. Tipos de entrada y dependencias
export type ListXxxInput = { … };
export type ListXxxDeps = { xxxRepository: XxxRepository; logger: LoggerPort };

// 2. Función pura async
export async function listXxx(input: ListXxxInput, deps: ListXxxDeps): Promise<Result<…>> {
  deps.logger.debug('listXxx', { … });
  const result = await deps.xxxRepository.findAll(input.filter, input.pagination);
  return ok(result);
}
```

## Añadir un nuevo paquete

1. Crear `packages/<name>/package.json` con `"name": "@bop-agency/<name>"`
2. Crear `packages/<name>/tsconfig.json` extendiendo `../../tsconfig.base.json`
3. Crear `packages/<name>/src/index.ts`
4. Agregar `@bop-agency/<name>: "*"` como dependencia en los paquetes que lo usen
5. Agregar al script `build` del `package.json` raíz en el orden correcto

## Añadir una nueva ruta en apps/web

1. Crear `apps/web/src/app/<ruta>/page.tsx`
2. Si está en construcción, usar el componente `UnderConstruction` con `availableIn`
3. Agregar al array `navItems` en `Sidebar.tsx` y `MobileNav.tsx`

## Variables de entorno

En Fase 1 no hay variables de entorno requeridas. En Fase 2+ se necesitará:

```env
# .env.local (no commitear)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
CLAUDE_API_KEY=
```

## Archivos y carpetas protegidas

No modificar bajo ninguna circunstancia desde la capa de monorepo:

- `agency-dashboard/` — dashboard legacy independiente
- `shared-data/` — datos reales de clientes
- `.agencia-ai/` — configuraciones de IA existentes
- `backups/` — backups de n8n
- `n8n-local/` — instancia n8n
- `docs/audit/` — auditorías de seguridad
- `docs/security/` — documentos de cierre de Fase 0
