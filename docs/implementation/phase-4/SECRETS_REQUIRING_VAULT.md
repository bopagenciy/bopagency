# Phase 4 — Secretos que requieren carga en Vault

Generado por: auditoría manual de archivos fuente Phase 4
Fecha: 2026-07-30
Estado: PENDIENTES DE CARGA MANUAL

## Resumen

Durante la auditoría de Phase 4 se identificaron **4 secretos** que deben cargarse manualmente en Supabase Vault antes de ejecutar integraciones en vivo. Los scripts de migración de Phase 4 **NO cargan estos secretos automáticamente**.

## Secretos identificados

### 1. Meta Ads — Legalink Colombia

| Campo           | Valor                        |
| --------------- | ---------------------------- |
| Nombre en Vault | `meta_legalink_access_token` |
| Cliente         | legalink-col                 |
| Plataforma      | Meta Ads (Facebook)          |
| Tipo            | User Access Token            |
| Origen          | `n8n-local/.env`             |
| Estado          | Pendiente de carga manual    |

### 2. Meta Ads — Legalink Colombia (System User)

| Campo           | Valor                             |
| --------------- | --------------------------------- |
| Nombre en Vault | `meta_legalink_system_user_token` |
| Cliente         | legalink-col                      |
| Plataforma      | Meta Ads (Facebook)               |
| Tipo            | System User Token                 |
| Origen          | `n8n-local/.env`                  |
| Estado          | Pendiente de carga manual         |

### 3. Meta Ads — Magic Bungalow

| Campo           | Valor                              |
| --------------- | ---------------------------------- |
| Nombre en Vault | `meta_magic_bungalow_access_token` |
| Cliente         | magic-bungalow                     |
| Plataforma      | Meta Ads (Facebook)                |
| Tipo            | User Access Token                  |
| Origen          | `n8n-local/.env`                   |
| Estado          | Pendiente de carga manual          |

### 4. Meta Ads — Magic Bungalow (System User)

| Campo           | Valor                                   |
| --------------- | --------------------------------------- |
| Nombre en Vault | `meta_magic_bungalow_system_user_token` |
| Cliente         | magic-bungalow                          |
| Plataforma      | Meta Ads (Facebook)                     |
| Tipo            | System User Token                       |
| Origen          | `n8n-local/.env`                        |
| Estado          | Pendiente de carga manual               |

## Archivos fuente auditados (sin secretos detectados)

Los siguientes archivos JSON fueron escaneados por el secret-detector:

| Archivo                                                | Resultado              |
| ------------------------------------------------------ | ---------------------- |
| `.agencia-ai/clients/clients-index.json`               | ✓ Sin secretos         |
| `.agencia-ai/clients/legalink-col/integrations.json`   | ✓ Sin secretos (vacío) |
| `.agencia-ai/clients/magic-bungalow/integrations.json` | ✓ Sin secretos (vacío) |
| `shared-data/automations/automations-registry.json`    | ✓ Sin secretos         |
| `shared-data/alerts/alert-state.json`                  | ✓ Sin secretos         |

## Acciones requeridas antes de Phase 5

1. [ ] Habilitar Vault en Supabase (Settings → Vault)
2. [ ] Cargar `meta_legalink_access_token` via SQL Editor
3. [ ] Cargar `meta_legalink_system_user_token` via SQL Editor
4. [ ] Cargar `meta_magic_bungalow_access_token` via SQL Editor
5. [ ] Cargar `meta_magic_bungalow_system_user_token` via SQL Editor
6. [ ] Verificar existencia (sin revelar valor) con la query de verificación en VAULT_SETUP.md

## Referencia

Ver procedimiento detallado en: `docs/implementation/phase-4/VAULT_SETUP.md`
Ver guía de operadores en: `scripts/migrations/phase-4/vault/README.md`
