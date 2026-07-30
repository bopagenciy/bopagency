# TECHNICAL BASELINE
## BopIAgency — Línea Base Técnica
**Fecha:** 2026-07-29  
**Fase:** 0 — Saneamiento y Seguridad  
**Alcance:** `agency-dashboard/` — único subproyecto con código activo y herramientas configuradas

---

## RESUMEN

| Herramienta | Estado | Resultado |
|------------|--------|-----------|
| TypeScript (`tsc --noEmit`) | ✅ Ejecutado | **0 errores, 0 advertencias** |
| ESLint | ⚠️ No instalado | No disponible |
| Vite build | ⏭️ No ejecutado | Omitido — inicia proceso de construcción (no destructivo pero fuera de Fase 0) |
| Tests (unit/e2e) | ⚠️ No configurados | No existen archivos de test |
| Node.js | ✅ Disponible | v22.22.3 |
| npm | ✅ Disponible | 10.9.8 |
| Vite CLI | ✅ Disponible | Instalado en `node_modules/.bin/vite` |
| TypeScript CLI | ✅ Disponible | Instalado en `node_modules/.bin/tsc` |

---

## 1. ENTORNO DE RUNTIME

### 1.1 Node.js y npm

| Herramienta | Versión | Ruta |
|------------|---------|------|
| Node.js | `v22.22.3` (LTS) | Sistema |
| npm | `10.9.8` | Sistema |

**Evaluación:** Node 22 LTS es compatible con Next.js 15+, Supabase JS v2, e Inngest. No es necesario actualizar.

### 1.2 Herramientas de build disponibles

| Herramienta | Disponible | Versión (inferida de package.json) |
|------------|-----------|----------------------------------|
| `tsc` (TypeScript) | ✅ | `~5.4` |
| `vite` | ✅ | `^6.3.5` |
| ESLint | ❌ No instalado | — |
| Prettier | ❌ No configurado | — |
| Vitest / Jest | ❌ No configurado | — |
| Playwright / Cypress | ❌ No configurado | — |

---

## 2. TYPECHECK — `tsc --noEmit`

### 2.1 Comando ejecutado

```bash
cd agency-dashboard && ./node_modules/.bin/tsc --noEmit
```

### 2.2 Resultado

| Campo | Valor |
|-------|-------|
| **Comando** | `tsc --noEmit` |
| **Directorio** | `agency-dashboard/` |
| **Duración** | ~10,815 ms |
| **Errores** | **0** |
| **Advertencias** | **0** |
| **Salida** | (ninguna — comportamiento correcto de tsc cuando no hay errores) |
| **Exit code** | `0` |

### 2.3 Interpretación

El código TypeScript existente compila sin errores bajo la configuración actual de `tsconfig.json`. Esto confirma que:

1. Todas las importaciones son resolúbles
2. Los tipos están correctamente anotados
3. El código no modificado está en un estado válido como punto de partida
4. Los 5 archivos no versionados (untracked: `automationSchemas.ts`, `automationService.ts`, `reportDeliveryService.ts`, `reportRecipientsService.ts`, `AutomationsPage.tsx`) también compilan sin errores

### 2.4 Impacto en la migración

Este resultado es positivo: significa que el código fuente del dashboard puede tomarse como referencia sin errores de tipo preexistentes que enmascarar o resolver antes de comenzar Fase 1.

---

## 3. ESLINT — No instalado

### 3.1 Verificación

```bash
cd agency-dashboard && ls node_modules/.bin/eslint
# Resultado: No such file or directory
```

ESLint no figura en las dependencias de `agency-dashboard/package.json` y no está presente en `node_modules`.

### 3.2 Impacto

No se puede ejecutar linting en Fase 0. Esto no bloquea la Fase 0 pero representa deuda técnica: no existe estilo de código impuesto por herramienta.

### 3.3 Recomendación

Instalar ESLint con reglas para Next.js (`eslint-config-next`) en Fase 1, antes de comenzar a escribir código nuevo. Configurar con:
- `@typescript-eslint/recommended`
- `eslint-config-next`
- Reglas de importaciones y hooks

---

## 4. BUILD (Vite) — No ejecutado

### 4.1 Razón de omisión

La Fase 0 no permite instalar paquetes, modificar configuración ni ejecutar procesos de larga duración. El comando `vite build` no modifica código fuente pero está fuera del alcance de la Fase 0.

### 4.2 Disponibilidad

```bash
cd agency-dashboard && ./node_modules/.bin/vite --version
# Vite disponible y ejecutable
```

### 4.3 Configuración conocida

`vite.config.ts` está presente y correctamente configurado (proxy a Express en puerto 3101, build hacia `dist/`). El directorio `dist/` está excluido del git (`agency-dashboard/.gitignore`).

### 4.4 Recomendación

Ejecutar `npm run build` como primera verificación antes de iniciar Fase 1, para confirmar que el frontend compila correctamente.

---

## 5. TESTS — No configurados

### 5.1 Estado

No existen archivos `*.test.ts`, `*.spec.ts`, `*.test.tsx`, `*.spec.tsx` en `agency-dashboard/`.

No existe configuración de Vitest ni Jest en `package.json` ni en archivos de configuración separados.

### 5.2 Impacto

El dashboard funciona sin cobertura de tests automatizados. Esto es riesgo de regresión durante la migración.

### 5.3 Recomendación

Introducir tests en Fase 1 con Vitest + React Testing Library para componentes críticos, y en Fase 2 con tests de integración para Server Actions de Next.js.

---

## 6. ARCHIVOS FUERA DE CONTROL DE VERSIONES (agency-dashboard)

El `git diff --stat` desde `agency-dashboard/` revela cambios no versionados:

### 6.1 Archivos modificados (tracked, no commiteados)

| Archivo | Cambios | Descripción |
|---------|---------|-------------|
| `agency-dashboard/.env.example` | Actualizado en Fase 0 | +7 variables faltantes, comentarios de sección |
| `agency-dashboard/.gitignore` | *(verificar estado)* | Existente — protege `.env` |
| `server/config.ts` | +N líneas | Configuración del servidor (fuera de Fase 0) |
| `server/index.ts` | +N líneas | Servidor Express (fuera de Fase 0) |
| `src/App.tsx` | +N líneas | Componente raíz React |
| `src/components/Sidebar.tsx` | +N líneas | Sidebar con navegación |
| `src/pages/ReportsPage.tsx` | +N líneas | Página de reportes |
| `src/services/api.ts` | +N líneas | Servicio de API del frontend |
| `src/types/index.ts` | +N líneas | Tipos TypeScript |

**Total:** ~1,371 líneas de cambios no versionados (vs commit `a463fc6`).

### 6.2 Archivos no rastreados (untracked)

| Archivo | Descripción |
|---------|-------------|
| `server/schemas/automationSchemas.ts` | Schemas Zod para automatizaciones |
| `server/services/automationService.ts` | Servicio de automatizaciones |
| `server/services/reportDeliveryService.ts` | Servicio de entrega de reportes |
| `server/services/reportRecipientsService.ts` | Servicio de destinatarios |
| `src/pages/AutomationsPage.tsx` | Página de automatizaciones |

Todos estos archivos compilan sin errores (verificado por tsc).

---

## 7. DEPENDENCIAS INSTALADAS

### 7.1 Estado de `node_modules`

```bash
ls agency-dashboard/node_modules/
# Existe — dependencias instaladas
```

Las dependencias están instaladas y disponibles. No se instalaron dependencias adicionales en Fase 0.

### 7.2 Paquetes clave (según `package.json` existente)

| Paquete | Versión | Propósito |
|---------|---------|-----------|
| `react` | `^18.3.1` | UI framework |
| `react-dom` | `^18.3.1` | DOM renderer |
| `vite` | `^6.3.5` | Build tool |
| `typescript` | `~5.4.5` | Type checking |
| `express` | `^4.21.2` | Servidor HTTP |
| `axios` | `^1.8.4` | HTTP client |
| `zod` | `^3.24.2` | Validación de schemas |
| `recharts` | `^2.15.3` | Gráficos |
| `lucide-react` | `^0.469.0` | Iconos |
| `tailwindcss` | `^3.4.17` | CSS utility |

Estos paquetes **no se modificaron** en Fase 0.

---

## 8. CONFIGURACIÓN DE TYPESCRIPT

### 8.1 Resumen de `tsconfig.json`

| Opción | Valor | Nota |
|--------|-------|------|
| `target` | `ES2020` | Compatible con navegadores modernos |
| `strict` | `true` | Modo estricto activado |
| `moduleResolution` | `bundler` | Correcto para Vite |
| `jsx` | `react-jsx` | Sin importar React explícitamente |
| `outDir` | `dist/` | Directorio de salida |
| `paths` | *(no configurados)* | Sin aliases de rutas |

La configuración es compatible con la migración a Next.js (Next.js tiene su propio `tsconfig.json` que se puede basar en este).

---

## 9. RECOMENDACIONES PRIORITARIAS PARA FASE 1

1. **Instalar ESLint** con `eslint-config-next` antes de escribir código nuevo
2. **Ejecutar `npm run build`** para verificar que Vite compila el frontend limpiamente
3. **Commitear los cambios pendientes** en `agency-dashboard/` (1,371 líneas + 5 archivos untracked) antes de comenzar Fase 1, para tener un punto de partida limpio en git
4. **Configurar Vitest** para tests unitarios — empezar con los schemas Zod existentes
5. **Revisar `.gitignore` de `agency-dashboard/`** para asegurar que `data/audit/` está correctamente ignorado

---

*Baseline generada el 2026-07-29. No se instalaron dependencias ni se modificó código fuente.*
