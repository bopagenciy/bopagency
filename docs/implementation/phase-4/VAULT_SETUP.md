# Phase 4 — Configuración de Supabase Vault

## Propósito

Supabase Vault almacena secretos cifrados que las integraciones de clientes necesitan para sincronizar datos (tokens de Meta Ads, Google Ads, etc.). Los scripts de migración de esta fase **no cargan secretos automáticamente**. Esta guía describe cómo hacerlo manualmente.

## Secretos identificados (sin valores)

| Nombre lógico en Vault                  | Cliente        | Plataforma | Campo en integrations.json | Estado                    |
| --------------------------------------- | -------------- | ---------- | -------------------------- | ------------------------- |
| `meta_legalink_access_token`            | legalink-col   | Meta Ads   | —                          | Pendiente de carga manual |
| `meta_legalink_system_user_token`       | legalink-col   | Meta Ads   | —                          | Pendiente de carga manual |
| `meta_magic_bungalow_access_token`      | magic-bungalow | Meta Ads   | —                          | Pendiente de carga manual |
| `meta_magic_bungalow_system_user_token` | magic-bungalow | Meta Ads   | —                          | Pendiente de carga manual |

> Los `integrations.json` de los clientes aprobados están vacíos en esta iteración. Los secretos reales están en `n8n-local/.env` y deben cargarse manualmente siguiendo este procedimiento.

## Procedimiento de carga manual

### 1. Habilitar Vault en Supabase

Desde el Dashboard de Supabase:

```
Settings → Vault → Enable Vault
```

O via SQL:

```sql
CREATE EXTENSION IF NOT EXISTS supabase_vault;
```

### 2. Cargar un secreto

```sql
-- Cargar access token de Meta Ads para Legalink
SELECT vault.create_secret(
  'TU_ACCESS_TOKEN_AQUI',  -- reemplaza con el valor real
  'meta_legalink_access_token',
  'Meta Ads access token para Legalink Colombia'
);

-- Cargar access token de Meta Ads para Magic Bungalow
SELECT vault.create_secret(
  'TU_ACCESS_TOKEN_AQUI',
  'meta_magic_bungalow_access_token',
  'Meta Ads access token para Magic Bungalow'
);
```

> **IMPORTANTE**: Ejecutar este SQL únicamente desde el SQL Editor del Dashboard de Supabase o desde un entorno seguro. Nunca copiar el valor en código fuente.

### 3. Verificar existencia (sin revelar valor)

```sql
SELECT
  id,
  name,
  description,
  created_at,
  updated_at
FROM vault.secrets
WHERE name IN (
  'meta_legalink_access_token',
  'meta_legalink_system_user_token',
  'meta_magic_bungalow_access_token',
  'meta_magic_bungalow_system_user_token'
);
-- NO ejecutar: SELECT decrypted_secret FROM vault.decrypted_secrets WHERE ...
```

### 4. Acceder a un secreto desde una función SECURITY DEFINER

```sql
CREATE OR REPLACE FUNCTION get_integration_token(p_secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Solo accesible por service_role o funciones autorizadas
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION get_integration_token FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_integration_token TO service_role;
```

## Convención de nombres

Los secretos siguen el patrón: `{plataforma}_{cliente_slug}_{tipo_token}`

Ejemplos:

- `meta_legalink_col_access_token`
- `meta_magic_bungalow_system_user_token`
- `google_ads_legalink_col_refresh_token`
- `ga4_magic_bungalow_service_account_key`

## Lo que NO se automatiza en Phase 4

- Lectura de `n8n-local/.env`
- Carga automática de tokens al Vault
- Rotación de tokens
- Verificación de expiración

Todo lo anterior es responsabilidad del operador de infraestructura y se documentará en una fase futura (Phase 6 — Integraciones Avanzadas).

## Archivo de referencia

Ver también: `scripts/migrations/phase-4/vault/README.md`
