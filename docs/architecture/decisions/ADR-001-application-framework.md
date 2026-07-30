# ADR-001: Framework de Aplicación — Next.js App Router
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

BopIAgency tiene actualmente un frontend SPA en React + Vite con routing manual (`window.history.pushState`) y un backend Express.js separado ejecutándose en `127.0.0.1:3101`. Esta arquitectura requiere mantener dos proyectos separados, tiene CORS hardcodeado a `http://localhost:5173`, y no soporta SSR, SEO ni autenticación.

Se necesita una plataforma web que soporte:
- Server-Side Rendering para mejor rendimiento inicial
- Server Actions para mutaciones sin endpoints REST explícitos
- Streaming de respuestas de IA al cliente
- Autenticación con Supabase integrada en el servidor
- Despliegue serverless sin mantenimiento de servidor

**Opciones consideradas:**
1. Next.js 14 con App Router (React Server Components + Server Actions)
2. Remix (Vite-based, loader/action pattern)
3. Nuxt.js (Vue — cambio de framework)
4. SvelteKit (Svelte — cambio de framework)
5. Mantener React SPA + Express (evolucionar el stack actual)

---

## Decisión

**Se adopta Next.js 14 con App Router.**

---

## Justificación

| Criterio | Next.js App Router | Remix | SPA + Express |
|----------|-------------------|-------|---------------|
| React Server Components | ✅ | ❌ | ❌ |
| Streaming de AI responses | ✅ Via Route Handlers + SSE | ✅ | ✅ Pero requiere WS o SSE manual |
| Supabase Auth SSR | ✅ Soporte oficial | ✅ | ⚠️ Manual |
| Despliegue serverless | ✅ Vercel nativamente | ✅ | ⚠️ Requiere servidor |
| Inngest integration | ✅ `@inngest/next` oficial | ⚠️ Adaptador manual | ⚠️ Expres + inngest |
| Curva de aprendizaje | Media (App Router es nuevo) | Media | Baja (ya conocido) |
| Ecosistema shadcn/ui | ✅ Optimizado para Next.js | ✅ | ✅ |
| Reuso del código React actual | ✅ Alto | ✅ Alto | ✅ Completo |

Next.js es la opción con mejor soporte de herramientas en el stack propuesto (Supabase, Inngest, shadcn/ui, Vercel). El App Router permite colocar la lógica de servidor junto al componente de UI, eliminando la capa de API REST para la mayoría de las operaciones.

---

## Consecuencias

**Positivas:**
- Un solo proyecto en lugar de dos (frontend + backend Express)
- Server Components reducen el bundle de JavaScript enviado al cliente
- Server Actions simplifican las mutaciones (sin necesidad de Route Handlers explícitos)
- Streaming nativo para las respuestas de Claude API
- Integración oficial con Inngest y Supabase

**Negativas:**
- El App Router tiene una curva de aprendizaje vs. Pages Router
- La frontera server/client requiere disciplina ("use client" directives)
- El Express actual tiene ~50 endpoints que deben migrarse

**Riesgos:**
- Next.js 14 App Router aún tiene APIs experimentales (`unstable_cache`)
- Los Server Actions no soportan respuestas largas de streaming directamente — se necesitan Route Handlers para SSE

**No decidido aquí:**
- La versión exacta de Next.js (14 vs. 15) — se evaluará en Fase 1
- El ORM o cliente de DB — cubierto en ADR-002

---

## Alternativas descartadas

**Mantener React SPA + Express:** Requeriría seguir manteniendo dos proyectos, CORS, y no permitiría SSR. El beneficio de migrar a Next.js supera el costo.

**Remix:** Opción técnicamente sólida, pero el ecosistema de Inngest y las guías de Supabase Auth SSR están más maduras para Next.js. No hay ventaja decisiva.

**Vue/Svelte:** Cambio de framework demasiado costoso. El equipo conoce React.

---

## Referencias

- `agency-dashboard/src/App.tsx` — routing manual actual (evidencia del problema)
- `agency-dashboard/server/index.ts` — 50+ endpoints Express a migrar
- `agency-dashboard/server/config.ts` — CORS hardcodeado evidencia
- Supabase Next.js Auth Helpers: https://supabase.com/docs/guides/auth/server-side/nextjs
- Inngest Next.js SDK: https://www.inngest.com/docs/sdk/serve#framework-next-js
