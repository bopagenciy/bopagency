# Estado Inicial — Fase 2

**Fecha:** 2026-07-30  
**Fase:** 2 — Autenticación, organizaciones y multi-tenancy

---

## 1. Entorno

| Variable              | Valor                                             |
| --------------------- | ------------------------------------------------- |
| Node.js               | v22.22.3                                          |
| npm                   | 10.9.8                                            |
| Git branch            | (no git inicializado en la sesión)                |
| Sistema operativo dev | Windows (sandbox Linux para creación de archivos) |

---

## 2. Estado del monorepo

Monorepo npm workspaces con 8 paquetes + 1 app. Estructura validada en Fase 1.

### ⚠️ BUG CRÍTICO DETECTADO: Next.js 9.3.3

Durante la validación de seguridad de Fase 1, el proceso de `npm audit` introdujo accidentalmente `"next": "9.3.3"` en `apps/web/package.json` y en el `package.json` raíz. La versión correcta es **15.5.22**. Esto fue corregido como primera acción de Fase 2.

| Archivo                 | Antes (incorrecto)                    | Después (correcto)                |
| ----------------------- | ------------------------------------- | --------------------------------- |
| `apps/web/package.json` | `"next": "^9.3.3"`                    | `"next": "15.5.22"`               |
| `apps/web/package.json` | `"eslint-config-next": "^12.0.4"`     | `"eslint-config-next": "15.5.22"` |
| `package.json` (root)   | `"dependencies": { "next": "9.3.3" }` | sin `dependencies` de next        |

**Acción requerida:** Ejecutar `npm install` en Windows tras las correcciones de Phase 2.

---

## 3. npm audit (sandbox Linux)

> Nota: el sandbox Linux muestra cifras distintas a Windows porque el árbol de dependencias resuelto difiere entre sistemas. Las cifras canónicas son las del reporte de Fase 1 (0 críticas en Windows post-corrección).

| Severidad | Sandbox Linux                                              |
| --------- | ---------------------------------------------------------- |
| Critical  | 1 (vitest — ya corregida en lock, aplica tras npm install) |
| High      | 42                                                         |
| Moderate  | 54                                                         |
| Low       | 10                                                         |
| **Total** | **107**                                                    |

---

## 4. Carpeta Supabase

**Estado:** No existía. Creada en esta fase.

| Archivo                                                          | Estado                                    |
| ---------------------------------------------------------------- | ----------------------------------------- |
| `supabase/config.toml`                                           | Creado — configuración del proyecto local |
| `supabase/.gitignore`                                            | Creado                                    |
| `supabase/migrations/20260730000000_phase2_auth_and_tenancy.sql` | Creado                                    |

**Proyecto Supabase remoto:** Pendiente de verificación manual por el desarrollador. Ver `DEVELOPER_GUIDE.md` para instrucciones de conexión.

---

## 5. Variables de entorno

**Estado anterior:** Sin archivo `.env.example` ni `.env.local` en `apps/web/`.

**Creado en Fase 2:** `apps/web/.env.example` con todas las variables requeridas.

**Variables requeridas para Fase 2:**

- `NEXT_PUBLIC_SUPABASE_URL` — URL pública del proyecto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon/public key de Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (NUNCA con prefijo NEXT_PUBLIC_)

---

## 6. Dependencias nuevas en Fase 2

| Paquete                 | Versión                    | Dónde                   |
| ----------------------- | -------------------------- | ----------------------- |
| `@supabase/supabase-js` | `^2.49.4`                  | `apps/web` dependencies |
| `@supabase/ssr`         | `^0.6.1`                   | `apps/web` dependencies |
| `zod`                   | ya en `@bop-agency/shared` | —                       |

---

## 7. Documentos de arquitectura leídos

| Documento                                                   | Estado   |
| ----------------------------------------------------------- | -------- |
| `docs/architecture/ARCHITECTURE.md`                         | ✅ Leído |
| `docs/architecture/DATABASE_DESIGN.md`                      | ✅ Leído |
| `docs/architecture/IMPLEMENTATION_ROADMAP.md`               | ✅ Leído |
| `docs/architecture/decisions/ADR-002-database-and-auth.md`  | ✅ Leído |
| `docs/architecture/decisions/ADR-006-multi-tenancy.md`      | ✅ Leído |
| `docs/architecture/decisions/ADR-007-storage-strategy.md`   | ✅ Leído |
| `docs/implementation/phase-1/PHASE_1_CLOSURE.md`            | ✅ Leído |
| `docs/implementation/phase-1/DEPENDENCY_SECURITY_REPORT.md` | ✅ Leído |

---

## 8. Decisiones de diseño para Fase 2

| Decisión                | Valor                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| Proveedor de auth       | Supabase Auth (`@supabase/supabase-js` + `@supabase/ssr`)              |
| Auth helpers PROHIBIDOS | `@supabase/auth-helpers-nextjs`, Clerk, Auth0, Firebase Auth, NextAuth |
| Roles en organización   | `owner` \| `admin` \| `strategist` \| `operator` \| `viewer`           |
| Estrategia multi-tenant | RLS con `org_id` en todas las tablas operacionales                     |
| Service role key        | Solo en código de servidor, NUNCA con prefijo `NEXT_PUBLIC_`           |
| Datos demo              | Marcados con `_isDemo: true` — NO conectan a Supabase                  |

---

_Documento generado automáticamente al inicio de Fase 2 — 2026-07-30_
