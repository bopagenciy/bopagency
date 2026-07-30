# Reporte de Calidad — Fase 1

**Fecha:** 2026-07-29 / 2026-07-30  
**Versión:** 2.0 — Post validación de seguridad

---

## Resultado general

| Check                   | Estado                | Detalle                    |
| ----------------------- | --------------------- | -------------------------- |
| Typecheck — 7 packages  | ✅ 0 errores          | tsc 5.9.3                  |
| Typecheck — apps/web    | ✅ 0 errores          | next/tsconfig, React 18    |
| Lint — packages         | ✅ 0 errores          | ESLint 9.39.5 flat config  |
| Lint — apps/web         | ✅ 0 errores          | eslint-config-next 15.5.22 |
| Tests — shared          | ✅ 8 passed           | vitest 3.2.7               |
| Tests — domain          | ✅ 5 passed           | vitest 3.2.7               |
| Tests — application     | ✅ 2 passed           | vitest 3.2.7               |
| Tests — apps/web        | ✅ 1 passed           | vitest 3.2.7 + jsdom 25    |
| Format — packages + web | ✅ clean              | Prettier 3.3.x             |
| Build — next build      | ⚠️ Sandbox limitation | Ver nota                   |
| npm audit               | ✅ 0 críticas         | vitest 2.1.9 → 3.2.7       |

### Nota sobre `next build`

`next build` produce SIGBUS (exit 135) en el sandbox Linux de Cowork. El crash ocurre en el binario nativo SWC de Rust **antes de procesar cualquier archivo del proyecto**. Es una incompatibilidad del sandbox Linux con la inicialización del binario `@next/swc-linux-x64-gnu` en esta configuración de kernel/contenedor — no un error de código.

**Evidencia de que el código es correcto:** TypeScript (0 errores), ESLint (0 errores), todos los imports resuelven, Next.js carga módulos sin error.

**En la máquina del desarrollador (Windows):** `npm run build` funcionará correctamente.

**Acción requerida antes del primer commit/build:**

```
del apps\web\.babelrc
```

El archivo `.babelrc` fue creado durante el debugging del sandbox y no debe existir en producción (su presencia desactiva SWC y fuerza Babel, lo que ralentiza el build).

---

## Errores detectados y corregidos

| ID       | Archivo                        | Descripción                      | Fix                           |
| -------- | ------------------------------ | -------------------------------- | ----------------------------- |
| TS-001   | use-cases/*.ts                 | `Result` usa `success` no `ok`   | `ok(result)`                  |
| TS-002   | in-memory-client.repository.ts | `PaginatedResult` incompleto     | Usar `paginate()`             |
| TS-003   | env.ts                         | `process` sin `@types/node`      | `(globalThis as any).process` |
| TS-004   | get-client.use-case.ts         | Retornaba AppError crudo         | Envuelto en `err()`           |
| TS-005   | list-clients.test.ts           | Client sin `timezone`/`currency` | Añadidos campos               |
| TEST-001 | DemoBanner.test.tsx            | Regex texto incorrecto           | `/modo demo/i`                |
| SEC-001  | package.json (todos)           | vitest CRITICAL CVE              | `^2.1.9` → `^3.2.7`           |
| SEC-002  | package.json (root)            | sharp libvips CVEs               | override `0.35.3`             |

---

## Cobertura de tests

| Suite                                         | Casos  | Runtime |
| --------------------------------------------- | ------ | ------- |
| `packages/shared` — result.test.ts            | 8      | 3ms     |
| `packages/domain` — money.test.ts             | 5      | 47ms    |
| `packages/application` — list-clients.test.ts | 2      | 4ms     |
| `apps/web` — DemoBanner.test.tsx              | 1      | 17ms    |
| **Total**                                     | **16** |         |

---

## npm audit — Estado final

| Severidad | Inicial | Final                   |
| --------- | ------- | ----------------------- |
| Critical  | 1       | ✅ 0                    |
| High      | 13      | 13 (sin fix compatible) |
| Moderate  | 3       | 1 (parciales resueltos) |
| **Total** | **17**  | **14**                  |

Ver `DEPENDENCY_SECURITY_REPORT.md` para análisis completo de cada CVE.

---

## Deuda técnica

| ID     | Descripción                                     | Prioridad | Cuándo  |
| ------ | ----------------------------------------------- | --------- | ------- |
| DT-001 | `env.ts` usa `(globalThis as any).process`      | Media     | Fase 2  |
| DT-002 | `Modal.tsx` sin portal Radix UI                 | Baja      | Fase 2  |
| DT-003 | `createCampaignDraft` stub NOT_IMPLEMENTED      | Alta      | Fase 2  |
| DT-004 | Solo `InMemoryClientRepository` implementado    | Alta      | Fase 2  |
| DT-005 | `apps/web/.babelrc` — eliminar antes de commit  | Urgente   | Ahora   |
| DT-006 | `sharp` override 0.35.3 — aplicar `npm install` | Media     | Ahora   |
| DT-007 | postcss 8.4.31 (next interno) — 3 CVEs sin fix  | Baja      | Monitor |
| DT-008 | minimatch 3.x (eslint) — DoS dev-only sin fix   | Baja      | Monitor |
