# Reporte de Seguridad de Dependencias — Fase 1

**Fecha:** 2026-07-29  
**Auditoría inicial:** `npm audit` tras primer `npm install`  
**Versión del reporte:** 1.0  
**Auditor:** BopIAgency Security Review

---

## Resumen ejecutivo

| Métrica                                | Valor                                     |
| -------------------------------------- | ----------------------------------------- |
| Total de dependencias                  | ~450                                      |
| Vulnerabilidades iniciales             | 17                                        |
| Críticas                               | 1                                         |
| Altas                                  | 13                                        |
| Moderadas                              | 3                                         |
| Bajas                                  | 0                                         |
| Actualizaciones aplicadas              | 2                                         |
| Vulnerabilidades resueltas             | 1 crítica + hasta 4 altas/moderadas       |
| Vulnerabilidades aceptadas             | 12 (dev-only o sin corrección compatible) |
| Vulnerabilidades bloqueantes de Fase 1 | 0                                         |

---

## Versiones verificadas de dependencias clave

| Paquete                      | Versión instalada | Fuente                     |
| ---------------------------- | ----------------- | -------------------------- |
| `next`                       | 15.5.22           | apps/web directo           |
| `react`                      | 18.3.1            | apps/web directo           |
| `react-dom`                  | 18.3.1            | apps/web directo           |
| `postcss` (top-level)        | 8.5.25            | tailwindcss / autoprefixer |
| `postcss` (interno next)     | 8.4.31            | next/node_modules/postcss  |
| `sharp`                      | 0.34.5            | next optionalDependency    |
| `vite`                       | 5.4.21            | vitest transitive          |
| `vitest`                     | 2.1.9             | todos los packages/* (dev) |
| `esbuild`                    | 0.21.5            | vite transitive            |
| `eslint`                     | 9.39.5            | root directo               |
| `minimatch` (top-level)      | 10.2.6            | @typescript-eslint         |
| `minimatch` (eslint interno) | 3.1.5             | @eslint/config-array etc.  |

---

## Análisis detallado de vulnerabilidades

### 🔴 V-01 — CRÍTICA — vitest < 3.2.6

| Campo                       | Valor                                                                                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paquete vulnerable**      | `vitest`                                                                                                                                                                                                                                                                                        |
| **Severidad**               | CRITICAL                                                                                                                                                                                                                                                                                        |
| **CVE / GHSA**              | GHSA-5xrq-8626-4rwp                                                                                                                                                                                                                                                                             |
| **Título**                  | When Vitest UI server is listening, arbitrary file can be read and executed                                                                                                                                                                                                                     |
| **Versión instalada**       | 2.1.9                                                                                                                                                                                                                                                                                           |
| **Rango vulnerable**        | `< 3.2.6`                                                                                                                                                                                                                                                                                       |
| **Versión corregida**       | 3.2.6 (disponible: 3.2.7)                                                                                                                                                                                                                                                                       |
| **Dependencia**             | Directa (todos los packages/*, apps/web dev)                                                                                                                                                                                                                                                    |
| **Workspace(s)**            | shared, ui, domain, application, infrastructure, ai-engine, automation-engine, integrations, apps/web                                                                                                                                                                                           |
| **Producción / Desarrollo** | **Desarrollo únicamente**                                                                                                                                                                                                                                                                       |
| **Corrección compatible**   | ✅ SÍ — vitest 3.x acepta vite `^5.0.0 \|\| ^6.0.0`                                                                                                                                                                                                                                             |
| **Requiere cambio mayor**   | Sí (2.x → 3.x) pero API compatible para uso básico                                                                                                                                                                                                                                              |
| **Cadena**                  | `vitest@2.1.9` → vuln directa                                                                                                                                                                                                                                                                   |
| **Exposición real**         | La vulnerabilidad requiere que el servidor de Vitest UI (`vitest --ui`) esté activo y accesible. BopIAgency no usa `--ui` en ningún script. Sin embargo, si un desarrollador ejecuta `npx vitest --ui`, cualquier página web maliciosa podría leer y ejecutar archivos arbitrarios del sistema. |
| **Prioridad**               | 🔴 Alta — Actualizar                                                                                                                                                                                                                                                                            |
| **Acción**                  | Actualizar `vitest` de `^2.1.9` a `^3.2.7` en todos los packages                                                                                                                                                                                                                                |

---

### 🟠 V-02 — ALTA — postcss < 8.5.10 (bundled en next)

| Campo                       | Valor                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Paquete vulnerable**      | `postcss` (interno de `next`)                                                                                                                                                                                                                                      |
| **Severidad**               | HIGH                                                                                                                                                                                                                                                               |
| **CVE / GHSA**              | GHSA-qx2v-qp2m-jg93                                                                                                                                                                                                                                                |
| **Título**                  | PostCSS has XSS via Unescaped `</style>` in CSS Stringify Output                                                                                                                                                                                                   |
| **Versión instalada**       | 8.4.31 (en `next/node_modules/postcss`)                                                                                                                                                                                                                            |
| **Rango vulnerable**        | `< 8.5.10`                                                                                                                                                                                                                                                         |
| **Versión corregida**       | 8.5.10+ (top-level: 8.5.25 ✅)                                                                                                                                                                                                                                     |
| **Dependencia**             | Transitiva (next → postcss)                                                                                                                                                                                                                                        |
| **Workspace(s)**            | apps/web                                                                                                                                                                                                                                                           |
| **Producción / Desarrollo** | **Producción** (build de Next.js)                                                                                                                                                                                                                                  |
| **Corrección compatible**   | ❌ NO — npm propone `next@9.3.3` (downgrade catastrófico inaceptable)                                                                                                                                                                                              |
| **Requiere cambio mayor**   | Sí (downgrade a Next.js 9 inaceptable)                                                                                                                                                                                                                             |
| **Cadena**                  | `next@15.5.22` → `postcss@8.4.31`                                                                                                                                                                                                                                  |
| **Exposición real**         | XSS via CSS stringify solo ocurre si un **atacante controla el CSS que Next.js procesa en tiempo de build**. En Fase 1, todo el CSS es generado por Tailwind con clases predefinidas. No hay CSS ingresado por usuarios en tiempo de build. Riesgo real: MUY BAJO. |
| **Prioridad**               | 🟡 Media — Aceptar temporalmente                                                                                                                                                                                                                                   |
| **Acción**                  | Documentar y monitorear. Corregir cuando Next.js lance un parche (15.5.x+) que actualice su postcss interno.                                                                                                                                                       |

---

### 🟠 V-03 — ALTA — postcss ≤ 8.5.11 (bundled en next) — sourceMappingURL file read

| Campo                       | Valor                                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paquete vulnerable**      | `postcss` (interno de `next`)                                                                                                                        |
| **Severidad**               | HIGH                                                                                                                                                 |
| **CVE / GHSA**              | GHSA-6g55-p6wh-862q                                                                                                                                  |
| **Título**                  | PostCSS: Arbitrary file read via attacker-controlled sourceMappingURL in CSS comments                                                                |
| **Versión instalada**       | 8.4.31                                                                                                                                               |
| **Rango vulnerable**        | `<= 8.5.11`                                                                                                                                          |
| **Versión corregida**       | 8.5.12+                                                                                                                                              |
| **Dependencia**             | Transitiva (next → postcss)                                                                                                                          |
| **Workspace(s)**            | apps/web                                                                                                                                             |
| **Producción / Desarrollo** | **Producción** (build)                                                                                                                               |
| **Corrección compatible**   | ❌ NO — misma restricción que V-02                                                                                                                   |
| **Exposición real**         | Requiere CSS con `sourceMappingURL` controlado por atacante. En Fase 1 no se procesa CSS externo con source maps de terceros. Riesgo real: MUY BAJO. |
| **Prioridad**               | 🟡 Media — Aceptar temporalmente                                                                                                                     |
| **Acción**                  | Igual que V-02.                                                                                                                                      |

---

### 🟠 V-04 — ALTA — postcss ≤ 8.5.17 (bundled en next) — path traversal .map

| Campo                       | Valor                                                                                                                      |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Paquete vulnerable**      | `postcss` (interno de `next`)                                                                                              |
| **Severidad**               | HIGH                                                                                                                       |
| **CVE / GHSA**              | GHSA-r28c-9q8g-f849                                                                                                        |
| **Título**                  | PostCSS: Path Traversal in Previous Source Map Auto-Loading                                                                |
| **Versión instalada**       | 8.4.31                                                                                                                     |
| **Rango vulnerable**        | `<= 8.5.17`                                                                                                                |
| **Versión corregida**       | 8.5.18+                                                                                                                    |
| **Dependencia**             | Transitiva (next → postcss)                                                                                                |
| **Workspace(s)**            | apps/web                                                                                                                   |
| **Producción / Desarrollo** | **Producción** (build)                                                                                                     |
| **Corrección compatible**   | ❌ NO                                                                                                                      |
| **Exposición real**         | Path traversal en auto-carga de source maps. Requiere CSS con source map que apunte a ruta maliciosa. No aplica en Fase 1. |
| **Prioridad**               | 🟡 Media — Aceptar temporalmente                                                                                           |
| **Acción**                  | Igual que V-02. Monitorear Next.js 15.5.x releases.                                                                        |

---

### 🟠 V-05 — ALTA — sharp < 0.35.0

| Campo                       | Valor                                                                                                                                                                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paquete vulnerable**      | `sharp`                                                                                                                                                                                                                                                                                 |
| **Severidad**               | HIGH                                                                                                                                                                                                                                                                                    |
| **CVE / GHSA**              | GHSA-f88m-g3jw-g9cj                                                                                                                                                                                                                                                                     |
| **Título**                  | sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591                                                                                                                                                                              |
| **Versión instalada**       | 0.34.5                                                                                                                                                                                                                                                                                  |
| **Rango vulnerable**        | `< 0.35.0`                                                                                                                                                                                                                                                                              |
| **Versión corregida**       | 0.35.1 (latest stable: 0.35.3)                                                                                                                                                                                                                                                          |
| **Dependencia**             | Transitiva (next optionalDependency)                                                                                                                                                                                                                                                    |
| **Workspace(s)**            | apps/web                                                                                                                                                                                                                                                                                |
| **Producción / Desarrollo** | **Producción** (Image Optimization de Next.js)                                                                                                                                                                                                                                          |
| **Corrección compatible**   | ⚠️ CON OVERRIDE — next@15.5.22 especifica `^0.34.3` (excluye 0.35.x). Compatible API-wise (Node 22 ✅, misma interfaz).                                                                                                                                                                 |
| **Requiere cambio mayor**   | No (0.34 → 0.35 es minor en sharp, pero fuera del rango de next)                                                                                                                                                                                                                        |
| **Exposición real**         | CVEs en libvips (procesamiento de imágenes). Potencial RCE si un atacante envía una imagen maliciosa que Next.js procesa con Image Optimization. En Fase 1 no hay carga de imágenes de usuarios. Riesgo: BAJO en Fase 1, ALTO en Fase 2+ si se habilita Image Optimization con uploads. |
| **Prioridad**               | 🟡 Media — Actualizar con override                                                                                                                                                                                                                                                      |
| **Acción**                  | Añadir `overrides: { "sharp": "^0.35.3" }` en root package.json                                                                                                                                                                                                                         |

---

### 🟠 V-06 a V-08 — ALTA — minimatch 3.1.5 (eslint plugins)

| Campo                       | Valor                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Paquetes vulnerables**    | `minimatch@3.1.5` (en @eslint/config-array, @eslint/eslintrc, eslint, eslint-plugin-import, eslint-plugin-jsx-a11y, eslint-plugin-react)                                                                                 |
| **Severidad**               | HIGH                                                                                                                                                                                                                     |
| **CVE / GHSA**              | GHSA-mh99-v99m-4gvg (via brace-expansion ≤ 5.0.7)                                                                                                                                                                        |
| **Título**                  | brace-expansion: DoS via unbounded expansion causing OOM crash                                                                                                                                                           |
| **Versión instalada**       | 3.1.5 (usa brace-expansion 1.x)                                                                                                                                                                                          |
| **Rango vulnerable**        | `<= 5.0.7` (brace-expansion)                                                                                                                                                                                             |
| **Versión corregida**       | brace-expansion 5.0.8 / 6.0.0 — pero minimatch 3.x no se actualizará a eso                                                                                                                                               |
| **Dependencia**             | Transitiva (eslint → eslint-plugins → minimatch)                                                                                                                                                                         |
| **Workspace(s)**            | apps/web (eslint-config-next), root                                                                                                                                                                                      |
| **Producción / Desarrollo** | **Desarrollo / CI únicamente**                                                                                                                                                                                           |
| **Corrección compatible**   | ❌ NO — La fix de npm propone `eslint@10.8.0` o `eslint-config-next@12.0.4` (ambas majors inaceptables)                                                                                                                  |
| **Exposición real**         | DoS solo si un atacante controla el patrón glob pasado a minimatch. ESLint procesa patrones de código fuente, no input de usuarios. **El servidor de producción nunca ejecuta ESLint.** Riesgo real: NULO en producción. |
| **Prioridad**               | 🟢 Baja — Aceptar (dev-only, sin fix compatible)                                                                                                                                                                         |
| **Acción**                  | Documentar. Revisar cuando Next.js 15.x o ESLint 9.x parcheen sus plugins.                                                                                                                                               |

---

### 🟡 V-09 a V-11 — ALTA/MODERADA — vite 5.4.21 (3 CVEs)

| Campo                       | Valor                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paquete vulnerable**      | `vite`                                                                                                                                                                                                                                                                                                                                                  |
| **Severidad**               | HIGH (x1) + MODERATE (parcial)                                                                                                                                                                                                                                                                                                                          |
| **CVEs**                    | GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff                                                                                                                                                                                                                                                                                           |
| **Versión instalada**       | 5.4.21 (via vitest 2.1.9)                                                                                                                                                                                                                                                                                                                               |
| **Rango vulnerable**        | `<= 6.4.x` (rango en advisory — aplica a 5.x también)                                                                                                                                                                                                                                                                                                   |
| **Dependencia**             | Transitiva (vitest → vite)                                                                                                                                                                                                                                                                                                                              |
| **Workspace(s)**            | todos (via vitest, dev)                                                                                                                                                                                                                                                                                                                                 |
| **Producción / Desarrollo** | **Desarrollo únicamente** (servidor de Vite para Vitest)                                                                                                                                                                                                                                                                                                |
| **Corrección compatible**   | ✅ Parcial — Al actualizar vitest@3.2.7 se resolverá con vite compatible; pero aún sin fix definitivo para 5.x                                                                                                                                                                                                                                          |
| **Exposición real**         | Las 3 CVEs: (1) path traversal en .map files durante dev; (2) NTLMv2 hash en Windows via UNC paths; (3) server.fs.deny bypass en Windows. Todas requieren servidor Vite dev activo y un atacante que induzca al desarrollador a visitar una página maliciosa. Riesgo: BAJO (requiere acción del desarrollador). GHSA-v6wh y GHSA-fx2h son Windows-only. |
| **Prioridad**               | 🟡 Media — Mitigado parcialmente con update de vitest                                                                                                                                                                                                                                                                                                   |
| **Acción**                  | Actualizar vitest → 3.2.7 (resolverá vite a versión compatible). No activar `server.fs.allow` sin restricciones.                                                                                                                                                                                                                                        |

---

### 🟡 V-12 a V-13 — MODERADA — esbuild ≤ 0.24.2 + vite-node

| Campo                       | Valor                                                                                                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Paquetes vulnerables**    | `esbuild`, `vite-node`                                                                                                                                                                                                      |
| **Severidad**               | MODERATE                                                                                                                                                                                                                    |
| **CVE / GHSA**              | GHSA-67mh-4wv8-2f99                                                                                                                                                                                                         |
| **Título**                  | esbuild enables any website to send any requests to the development server                                                                                                                                                  |
| **Versión instalada**       | esbuild 0.21.5 (via vite), vite-node 2.1.9                                                                                                                                                                                  |
| **Rango vulnerable**        | esbuild `<= 0.24.2`                                                                                                                                                                                                         |
| **Dependencia**             | Transitiva (vitest → vite → esbuild)                                                                                                                                                                                        |
| **Producción / Desarrollo** | **Desarrollo únicamente**                                                                                                                                                                                                   |
| **Corrección compatible**   | ✅ Parcial — vitest@3.2.7 instala vite que usa esbuild >0.24.2                                                                                                                                                              |
| **Exposición real**         | El servidor de esbuild acepta peticiones de cualquier origen durante el desarrollo. Solo afecta si el servidor de dev de esbuild está expuesto. Requiere que el desarrollador visite una página maliciosa mientras trabaja. |
| **Prioridad**               | 🟡 Media — Mitigado con update de vitest                                                                                                                                                                                    |
| **Acción**                  | Mitigado al actualizar vitest → 3.2.7. No exponer el servidor de dev a redes públicas.                                                                                                                                      |

---

## Tabla de decisiones de actualización

| Dependencia                | Versión actual | Versión candidata     | Razón                                       | Riesgo | Breaking change                                      |
| -------------------------- | -------------- | --------------------- | ------------------------------------------- | ------ | ---------------------------------------------------- |
| `vitest`                   | 2.1.9          | 3.2.7                 | Fix CRITICAL GHSA-5xrq-8626-4rwp            | Bajo   | No para uso básico (describe/it/expect/vi API igual) |
| `sharp`                    | 0.34.5         | 0.35.3 (via override) | Fix HIGH GHSA-f88m-g3jw-g9cj (libvips CVEs) | Bajo   | No — API compatible, Node 22 OK                      |
| `postcss` (next interno)   | 8.4.31         | Sin fix compatible    | V-02/03/04                                  | N/A    | No actualizable sin downgrade catastrófico           |
| `minimatch` 3.1.5 (eslint) | 3.1.5          | Sin fix compatible    | V-06/07/08 (dev only)                       | N/A    | No actualizable sin major eslint                     |
| `vite`                     | 5.4.21         | Via vitest@3.2.7      | V-09/10/11 (dev only)                       | Bajo   | Gestionado por vitest                                |
| `esbuild`                  | 0.21.5         | Via vitest@3.2.7      | V-12/13 (dev only)                          | Bajo   | Gestionado por vite                                  |

---

## Mitigaciones temporales para vulnerabilidades no corregidas

### PostCSS (V-02, V-03, V-04) — bundled en Next.js 15.5.22

**Mitigación:** No procesar CSS de fuentes externas no confiables en tiempo de build. Mantener CSS generado únicamente por Tailwind. Actualizar Next.js en cuanto esté disponible un parche 15.5.x que incluya postcss 8.5.18+. Monitorear releases de Next.js en https://github.com/vercel/next.js/releases.

### Minimatch / brace-expansion (V-06 a V-08) — eslint plugins

**Mitigación:** ESLint nunca se ejecuta en producción. Evitar pasar patrones glob controlados por usuarios a ESLint. Actualizar eslint-config-next cuando Next.js lo parchee internamente.

### Vite CVEs (V-09 a V-11) — dev server

**Mitigación:** No exponer el servidor de Vitest/Vite a redes públicas. Usar `--host 127.0.0.1` si se ejecuta en entornos compartidos. En Windows, tener precaución con UNC paths abiertos al exterior. Mitigado parcialmente al actualizar vitest a 3.x.

---

## Clasificación final de vulnerabilidades

| Clasificación                                  | Vulnerabilidades                   | CVEs                                                                               |
| ---------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Producción — sin fix compatible**            | V-02, V-03, V-04 (postcss en next) | GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-r28c-9q8g-f849                      |
| **Producción — actualizada**                   | V-05 (sharp)                       | GHSA-f88m-g3jw-g9cj                                                                |
| **Desarrollo — actualizada (CRITICAL)**        | V-01 (vitest)                      | GHSA-5xrq-8626-4rwp                                                                |
| **Desarrollo — sin fix compatible, aceptadas** | V-06 a V-08 (minimatch/eslint)     | GHSA-mh99-v99m-4gvg                                                                |
| **Desarrollo — mitigadas por update vitest**   | V-09 a V-13 (vite, esbuild)        | GHSA-4w7w-66w2-5vf9, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff, GHSA-67mh-4wv8-2f99 |

---

## Veredicto de seguridad de dependencias

**No existe ninguna vulnerabilidad crítica explotable en el entorno de producción de Fase 1.**

- La única vulnerabilidad CRÍTICA (vitest GHSA-5xrq-8626-4rwp) afecta exclusivamente al entorno de desarrollo y solo cuando el servidor Vitest UI está activo — feature no habilitado en BopIAgency.
- Las vulnerabilidades de producción (postcss en next) tienen riesgo real muy bajo en Fase 1 ya que no hay CSS controlado por usuarios en el build.
- Las vulnerabilidades de eslint/minimatch son exclusivamente de entorno de desarrollo/CI.

**Las actualizaciones aplicadas (vitest 3.2.7 + sharp 0.35.3) resuelven la vulnerabilidad más grave y la de mayor impacto potencial en Fase 2+.**
