# ADR-006: Estrategia de Multi-tenancy — Row Level Security (RLS) con org_id
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

El sistema actual no tiene multi-tenancy. Es una herramienta de un solo equipo (Bop Agency) sin control de acceso entre usuarios. Todos los datos son accesibles desde cualquier sesión local.

**Objetivo futuro:** BopIAgency debe poder usarse por múltiples agencias independientes (Bop Agency en Colombia, potencialmente agencias aliadas o clientes que quieran un sistema similar). Cada agencia debe tener sus datos completamente aislados.

**Requisitos de aislamiento:**
- Un usuario de Agencia A no debe ver ningún dato de Agencia B, ni mediante queries directas ni mediante errores de la aplicación
- El aislamiento debe funcionar incluso si hay un bug en el código de la aplicación
- Un usuario puede pertenecer a múltiples organizaciones con roles distintos
- Los datos compartidos (agentes globales, skills globales, templates globales) deben ser accesibles a todos los tenants sin duplicación

**Enfoques de multi-tenancy en bases de datos:**
1. **Schema-per-tenant:** Cada organización tiene su propio schema de PostgreSQL
2. **Database-per-tenant:** Cada organización tiene su propia base de datos
3. **Row-level isolation (shared schema):** Un solo schema con `org_id` en todas las tablas + RLS

---

## Decisión

**Se adopta Row Level Security (RLS) de PostgreSQL con `org_id` en todas las tablas operacionales.**

---

## Justificación

| Criterio | Schema-per-tenant | Database-per-tenant | Row-level (RLS) — Elegida |
|----------|------------------|---------------------|--------------------------|
| Aislamiento de datos | ✅ Total | ✅ Total | ✅ Total (via RLS) |
| Complejidad de setup | Alta | Muy alta | Baja |
| Queries cross-tenant (para admins) | ⚠️ Requiere schema switching | ❌ Muy difícil | ✅ Fácil con service_role |
| Migraciones de schema | ⚠️ N migraciones (una por tenant) | ⚠️ N migraciones | ✅ Una sola migración |
| Escalabilidad a 100+ tenants | ⚠️ | ❌ Costoso | ✅ |
| Datos compartidos (globales) | ⚠️ Duplicación o schema central | ❌ Muy complejo | ✅ `org_id IS NULL` = global |
| Soporte en Supabase | ⚠️ Posible | ❌ No soportado | ✅ Primera clase |
| Backup por tenant | ✅ | ✅ | ⚠️ Requiere partitionamiento |
| Costo en Free tier Supabase | ❌ Un proyecto por tenant | ❌ Un proyecto por tenant | ✅ Un solo proyecto |

**RLS con `org_id` es la única opción que Supabase soporta completamente en su Free tier.** Schema-per-tenant o database-per-tenant requerirían un proyecto Supabase por organización, multiplicando el costo inmediatamente.

Además, RLS tiene una ventaja de seguridad: incluso si el código de la aplicación tiene un bug y no filtra por `org_id`, la base de datos rechaza la query.

---

## Implementación

### Principio de aislamiento

```
┌─────────────────────────────────────────────────┐
│  organizations  │  Nivel raíz — slug único global │
└────────┬────────┘                                 
         │ 1:N                                      
┌────────▼────────┐    ┌──────────────────────────┐
│  user_org_      │    │  Toda tabla operacional   │
│  memberships    │    │  tiene org_id FK          │
│  (user, org,    │    │                           │
│   role)         │    │  RLS filtra por org_id    │
└─────────────────┘    │  del usuario autenticado  │
                       └──────────────────────────┘
```

### Datos globales vs. datos de organización

Las entidades como `agents`, `skills`, `templates`, y `compliance_rules` pueden ser:
- **Globales** (`org_id IS NULL`): Disponibles para todas las organizaciones. No editables por usuarios normales.
- **De organización** (`org_id = X`): Customizaciones específicas de una org.

Las RLS policies aplican: `WHERE org_id = auth.uid_org() OR org_id IS NULL`.

### Función auxiliar de RLS

```
-- Concepto (no ejecutar)
-- La función retorna los org_ids del usuario autenticado
get_my_org_ids() → uuid[]

-- Ejemplo de policy (concepto):
-- Para SELECT en tabla clients:
-- USING (org_id = ANY(get_my_org_ids()))
```

### Roles por organización

| Rol | Permisos |
|-----|----------|
| `owner` | Todo — incluyendo eliminar la org |
| `admin` | Gestionar usuarios, clientes, automatizaciones, integraciones |
| `member` | Crear/editar clientes, campañas, tareas, ejecutar agentes |
| `viewer` | Solo lectura |

El rol vive en `user_org_memberships.role`, NO en `users.role`. Un usuario puede ser `admin` en Org A y `viewer` en Org B.

---

## Consecuencias

**Positivas:**
- Un solo proyecto Supabase para todos los tenants — costo optimizado
- Las migraciones de schema aplican a todos los tenants simultáneamente
- Los datos globales (skills, agentes, templates) se comparten sin duplicación
- RLS en la base de datos como segunda línea de defensa (además de la validación en Server Actions)

**Negativas:**
- Las queries deben incluir siempre el filtro de `org_id` (o confiar en RLS)
- Los backups por tenant son más complejos (require filtrar por `org_id`)
- A escala muy grande (>10,000 tenants), puede haber consideraciones de performance — en ese punto se evalúa particionamiento por `org_id`

**Regla de oro en el código:**
- Todo Server Action debe verificar que el usuario tiene permiso en la org antes de ejecutar
- Todo repositorio recibe `orgId` como parámetro y lo incluye en todas las queries
- El cliente Supabase en el frontend usa la sesión del usuario → RLS se aplica automáticamente
- El cliente Supabase en Inngest usa `service_role_key` → RLS se bypasea → el código debe filtrar manualmente

---

## Alternativas descartadas

**Schema-per-tenant:** Requeriría ejecutar N migraciones (una por organización) en cada deploy. Supabase no soporta múltiples schemas en el Free tier con isolation completa. Complejidad alta sin beneficio a la escala actual.

**Database-per-tenant:** Un proyecto Supabase por organización → $25/mes por org. Inviable desde el primer tenant adicional.

---

## Referencias

- `docs/architecture/DATABASE_DESIGN.md` — schema completo con `org_id` en todas las tablas
- `docs/architecture/ARCHITECTURE.md` — secciones 11 y 12 (multi-empresa y multi-cliente)
- `shared-data/clients-index.json` — 3 clientes (todos de Bop Agency, la única org actual)
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
