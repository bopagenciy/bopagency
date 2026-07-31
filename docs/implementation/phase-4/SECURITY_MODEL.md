# Phase 4 — Modelo de Seguridad

## Principios

1. **Ningún secreto en código**: tokens, service_role_key y credenciales solo en variables de entorno.
2. **Sin NEXT_PUBLIC_**: la service_role key nunca se expone al navegador.
3. **Sin logs de secretos**: el logger sanitiza automáticamente cualquier campo sospechoso.
4. **Path traversal imposible**: todas las rutas de archivo se resuelven y verifican contra el directorio base permitido.
5. **Datos de cuarentena bloqueados por pathname**: cualquier archivo en `/quarantine/` es rechazado antes de leer.
6. **PII enmascarada en logs**: emails, teléfonos e IDs externos se muestran truncados.
7. **Service role solo en scripts Node**: nunca importado desde `apps/web` ni Client Components.

## Variables de entorno permitidas

```bash
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Solo para scripts de migración
MIGRATION_ORGANIZATION_ID=uuid-de-la-organizacion
MIGRATION_DRY_RUN=true             # Default: true
```

**El script falla inmediatamente si:**

- `SUPABASE_URL` está ausente o vacío
- `SUPABASE_SERVICE_ROLE_KEY` está ausente o vacío
- `MIGRATION_ORGANIZATION_ID` está ausente, vacío o no es un UUID válido
- La organización no existe en la BD
- La organización está deshabilitada/eliminada
- La conexión no es con service_role (verificado por `auth.role()`)

## Sanitización de logs

El logger reemplaza valores en cualquier campo cuyo nombre contenga:
`token | secret | key | password | access | refresh | cookie | authorization`

Reemplazado por `[REDACTED]`. La sanitización se aplica recursivamente sobre objetos JSON.

Adicionalmente:

- Emails completos se enmascaran: `fr***@***.***`
- IDs de cuenta publicitaria (act_XXXXXXXX) se muestran completos (son identificadores no-sensibles)
- UUIDs internos se muestran completos en logs de DEBUG, truncados en INFO

## Validación de rutas

```typescript
function safeResolvePath(base: string, relative: string): string {
  const resolved = path.resolve(base, relative);
  if (!resolved.startsWith(path.resolve(base))) {
    throw new Error(`Path traversal detectado: ${relative}`);
  }
  if (resolved.includes('/quarantine/') || resolved.includes('\\quarantine\\')) {
    throw new Error(`Ruta de cuarentena bloqueada: ${resolved}`);
  }
  if (resolved.includes('/backups/') || resolved.includes('\\backups\\')) {
    throw new Error(`Ruta de backups bloqueada: ${resolved}`);
  }
  return resolved;
}
```

## Contenido de archivos Markdown

Los archivos `.md` se tratan como **datos no confiables**:

- Se almacenan como texto plano en `client_documents.content`
- No se ejecutan, evalúan ni interpretan en el script de migración
- No se buscan ni extraen secrets con regex (el contenido puede contener ejemplos)
- El detector de secretos opera solo sobre archivos JSON de configuración/integración

## Detección de secretos en JSON

Antes de procesar cualquier archivo JSON, el importer escanea todos los valores de tipo `string` con longitud > 20 que coincidan con patrones de secreto:

- `Bearer [A-Za-z0-9+/=]{20,}`
- `EAA[a-zA-Z0-9]{50,}` (token Meta/Facebook)
- `sk-[a-zA-Z0-9]{20,}` (OpenAI)
- `xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+` (Slack)
- Cualquier valor de campo llamado `token|secret|password|key|credential`

Si se detecta un posible secreto:

- El archivo se excluye de la migración
- Se registra en `SECRETS_REQUIRING_VAULT.md` (sin el valor)
- Se añade `action=excluded-secret` al dry-run report

## RLS y service_role

Los scripts de migración usan `SUPABASE_SERVICE_ROLE_KEY` que bypassa RLS. Esto es necesario para:

- Insertar datos de organizaciones sin sesión de usuario activa
- Insertar `migration_runs` y `migration_records` (tablas de control)

Sin embargo, el script **no usa service_role para**:

- Leer datos de usuarios
- Modificar auth.users
- Leer o escribir secrets del Vault (se documenta pero no se automatiza en esta iteración)

## Acceso a tablas de control (migration_runs, migration_records)

Solo accesibles para:

- `service_role` (desde scripts de migración)
- Roles `admin` y `owner` de la organización (via RLS)
- Los roles `operator`, `strategist`, `viewer` NO pueden ver rutas de archivos ni mensajes de error internos

## Archivos excluidos de Git

`.gitignore` incluye:

```
migration-output/
shared-data/
.agencia-ai/
n8n-local/
*.env
*.env.local
```

Los archivos de salida de migración (`migration-output/`) nunca se commitean.
