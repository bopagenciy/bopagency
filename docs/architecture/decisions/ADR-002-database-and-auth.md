# ADR-002: Base de Datos y Autenticación — Supabase (PostgreSQL + Auth)
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

El sistema actual no tiene base de datos centralizada. Toda la persistencia ocurre en archivos JSON y Markdown en el sistema de archivos local (`shared-data/`, `.agencia-ai/clients/`). Tampoco existe autenticación — el dashboard Express escucha en `127.0.0.1:3101` sin ningún control de acceso.

Para la modernización se necesita:
- Base de datos relacional con soporte multi-tenant (aislamiento por organización)
- Autenticación de usuarios (email/contraseña, magic link)
- Row Level Security para garantizar que los datos de un tenant no sean visibles para otro
- Almacenamiento de archivos (assets de clientes, reportes PDF)
- Almacenamiento de secretos cifrados (tokens de plataformas externas)
- SDKs para Next.js App Router (server y browser clients)

**Opciones consideradas:**
1. Supabase (PostgreSQL + Auth + Storage + Vault)
2. PlanetScale (MySQL serverless) + NextAuth.js
3. Neon (PostgreSQL serverless) + Clerk
4. Firebase (NoSQL) + Firebase Auth
5. Turso (SQLite distribuido) + NextAuth.js

---

## Decisión

**Se adopta Supabase como plataforma de base de datos, autenticación, almacenamiento y gestión de secretos.**

---

## Justificación

| Criterio | Supabase | PlanetScale + NextAuth | Neon + Clerk | Firebase |
|----------|----------|----------------------|--------------|----------|
| PostgreSQL | ✅ | ❌ (MySQL) | ✅ | ❌ (NoSQL) |
| Row Level Security | ✅ Nativo en PG | ❌ Requiere implementación custom | ✅ Nativo en PG | ❌ Reglas Firestore (menos potentes) |
| Auth integrado | ✅ | ⚠️ NextAuth separado | ✅ Clerk (mejor DX) | ✅ |
| Storage integrado | ✅ (S3-compatible) | ❌ Necesita S3 aparte | ❌ Necesita S3 aparte | ✅ Firebase Storage |
| Vault (secrets cifrados) | ✅ Supabase Vault nativo | ❌ | ❌ | ❌ |
| SDK Next.js App Router | ✅ `@supabase/ssr` oficial | ⚠️ | ✅ | ⚠️ |
| Costo (proyectado Bop Agency) | $0 Free tier (hasta 500MB DB) | ~$39/mes mínimo | $0 + $25/mes Clerk | $0 Spark plan |
| Self-hosting posible | ✅ Docker | ❌ | ❌ | ❌ |
| Local dev | ✅ Supabase CLI + Docker | ⚠️ | ✅ | ✅ Emulador |

Supabase es la única opción que integra todos los requisitos en una sola plataforma (PostgreSQL + Auth + Storage + Vault). El Row Level Security nativo de PostgreSQL es la implementación más robusta de multi-tenancy disponible. El SDK `@supabase/ssr` tiene soporte oficial para Next.js App Router.

La combinación de Supabase Auth + RLS significa que el aislamiento de datos entre organizaciones está garantizado a nivel de base de datos, no solo a nivel de aplicación.

---

## Consecuencias

**Positivas:**
- RLS garantiza aislamiento de tenants incluso si el código de aplicación falla
- Supabase Vault resuelve el problema de tokens OAuth en texto plano (R-02, C-01)
- Un solo servicio para DB + Auth + Storage reduce la complejidad operativa
- Supabase CLI permite desarrollo 100% local sin dependencias externas

**Negativas:**
- Supabase Free tier tiene límites (500MB DB, 1GB Storage, 50MB archivos)
- Las migraciones de schema requieren cuidado para no romper RLS
- El cliente JS de Supabase tiene un API diferente al SQL directo — requiere aprendizaje
- Dependencia de un proveedor (vendor lock-in) — aunque PostgreSQL es portable

**Riesgos:**
- Si Supabase cambia su pricing, migrar a PostgreSQL self-hosted es posible pero costoso
- La CLI de Supabase para local dev requiere Docker

**Secretos:** Los tokens de Meta Ads y Google OAuth2 se almacenan en Supabase Vault, accedidos solo desde Inngest functions con `service_role_key`. El frontend nunca accede al Vault.

---

## Alternativas descartadas

**PlanetScale + NextAuth:** MySQL no tiene RLS nativo. La implementación de multi-tenancy requiere lógica custom en cada query. Más costoso.

**Neon + Clerk:** Clerk tiene mejor DX que Supabase Auth, pero requiere un servicio adicional. Neon no tiene Storage ni Vault. Más complejidad.

**Firebase:** NoSQL no se adapta bien al modelo relacional (clients → metrics → reports → deliveries). Las reglas de seguridad de Firestore son menos expresivas que RLS en PostgreSQL.

---

## Referencias

- `docs/architecture/DATABASE_DESIGN.md` — diseño completo del schema
- `docs/audit/MIGRATION_RISKS.md` — R-02 (N8N_ENCRYPTION_KEY), C-01 (tokens en JSONB)
- `.agencia-ai/clients/*/integrations.json` — evidencia del problema de tokens en plaintext
- Supabase RLS docs: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Vault: https://supabase.com/docs/guides/database/vault
