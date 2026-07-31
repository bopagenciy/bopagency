# Vault — Guía para operadores

Este directorio documenta la integración con Supabase Vault para secretos de clientes.

## ¿Qué es Supabase Vault?

Vault es una extensión de PostgreSQL incluida en Supabase que cifra secretos en reposo usando `pgsodium`. Los valores nunca se almacenan en texto plano y sólo son accesibles desde funciones `SECURITY DEFINER` autorizadas.

## Secretos requeridos para Phase 4

| Nombre en Vault                         | Cliente        | Plataforma | Tipo              |
| --------------------------------------- | -------------- | ---------- | ----------------- |
| `meta_legalink_access_token`            | legalink-col   | Meta Ads   | Access Token      |
| `meta_legalink_system_user_token`       | legalink-col   | Meta Ads   | System User Token |
| `meta_magic_bungalow_access_token`      | magic-bungalow | Meta Ads   | Access Token      |
| `meta_magic_bungalow_system_user_token` | magic-bungalow | Meta Ads   | System User Token |

**Origen de los valores**: `n8n-local/.env` (archivo local, nunca en Git).

## Procedimiento de carga

Ver: `docs/implementation/phase-4/VAULT_SETUP.md`

## Instrucciones de seguridad

1. NUNCA pasar el valor real como argumento de CLI.
2. NUNCA imprimir el secreto en logs o en scripts.
3. NUNCA guardar el secreto en un archivo de texto fuera de Vault.
4. Acceder a Vault ÚNICAMENTE desde:
   - SQL Editor del Dashboard de Supabase (con autenticación MFA activa)
   - Scripts de servidor con `service_role` en entorno aislado

## Lo que NO está en este directorio

- Valores de secretos
- Archivos `.env`
- Tokens cifrados exportados
- Claves de cifrado

Todo eso es responsabilidad del operador de infraestructura.
