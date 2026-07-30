# ADR-007: Estrategia de Almacenamiento — Supabase Storage + PostgreSQL (contenido en texto)
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

El sistema actual usa el **sistema de archivos local** como único mecanismo de almacenamiento. Los datos se distribuyen entre:
- `.agencia-ai/clients/*/` — documentos de clientes (Markdown, JSON)
- `.agencia-ai/templates/` — plantillas (Markdown)
- `shared-data/metrics/` — métricas (JSON)
- `shared-data/reports/` — reportes (JSON)
- `shared-data/alerts/` — estado de alertas (JSON)
- `n8n-local/` — datos de n8n (volumen Docker)

**Problemas con el filesystem local:**
- No accesible desde la nube — la app solo funciona en la máquina local
- Sin backup automático
- Sin control de acceso por archivo
- Los archivos grandes (assets de campañas) no tienen gestión estructurada

**Decisión necesaria:** Qué mecanismo usar para cada tipo de dato en el nuevo stack:
1. Contenido de documentos (brand profiles, buyer personas, etc.)
2. Assets binarios (logos de clientes, imágenes de campañas)
3. Reportes generados (PDF, JSON)
4. Datos estructurados (métricas, tareas, alertas)

**Opciones evaluadas:**
1. Supabase Storage (S3-compatible) para todo
2. PostgreSQL (texto) para documentos + Supabase Storage para binarios
3. AWS S3 directamente
4. Vercel Blob Storage
5. Cloudinary (para imágenes)

---

## Decisión

**Estrategia híbrida: PostgreSQL para contenido de texto, Supabase Storage para archivos binarios.**

| Tipo de contenido | Almacenamiento | Tabla / Path |
|-------------------|---------------|-------------|
| Documentos de clientes (Markdown) | PostgreSQL | `client_documents.content (text)` |
| Datos estructurados (métricas, tasks, alertas) | PostgreSQL | Tablas respectivas |
| Assets de cliente (logos, imágenes) | Supabase Storage | `/clients/{orgId}/{clientId}/assets/` |
| Creativos de campañas (imágenes, videos) | Supabase Storage | `/campaigns/{campaignId}/creatives/` |
| Reportes PDF generados | Supabase Storage | `/reports/{clientId}/{period}/report.pdf` |
| Importaciones temporales (CSV) | Supabase Storage | `/imports/{orgId}/` (TTL: 24h) |
| Conversaciones largas de AI | Supabase Storage | `/ai-runs/{runId}/conversation.json` |

---

## Justificación por tipo de contenido

### Documentos de clientes → PostgreSQL (`text`)

Los documentos de clientes (brand profile, buyer personas, compliance, guiones de reels) son texto Markdown de tamaño moderado (1KB - 100KB). Almacenarlos en PostgreSQL permite:
- Búsqueda de texto completo (Full Text Search) — relevante para encontrar documentos por contenido
- Versionado via columna `version integer`
- RLS automático — hereda el control de acceso de la tabla
- Joins para obtener documentos con metadatos del cliente en una sola query

El límite de `text` en PostgreSQL es 1GB por campo — suficiente para cualquier documento de cliente.

**Migración desde:** `.agencia-ai/clients/*/brand-profile.md`, `buyer-persona-1.md`, etc. → `client_documents.content`

### Assets binarios → Supabase Storage

Los archivos binarios (logos, imágenes de campañas, creativos) son inadecuados para columnas PostgreSQL (`bytea`). Supabase Storage (S3-compatible) provee:
- URLs firmadas con expiración (acceso temporal sin exponer credenciales)
- Transformaciones de imágenes vía URL (resize, crop) — feature nativo de Supabase Storage
- CDN automático para assets estáticos
- RLS a nivel de bucket (integrada con Supabase Auth)

### Reportes PDF → Supabase Storage

Los reportes PDF se generan con librerías como `@react-pdf/renderer` o `puppeteer`. El archivo resultante se sube a Supabase Storage y la URL se guarda en `reports.file_url`. Esto permite:
- Compartir el PDF via URL firmada sin pasar por la app
- Descargar el PDF directamente desde la UI
- Reenviar el mismo PDF sin regenerarlo

---

## Consecuencias

**Positivas:**
- PostgreSQL para documentos → RLS heredada automáticamente, sin gestión de permisos separada
- Full Text Search sobre `client_documents.content` sin infraestructura adicional
- Supabase Storage incluido en el proyecto de Supabase — sin servicios adicionales
- URLs firmadas de Supabase Storage son temporales — assets privados sin exposición pública
- La estrategia de Storage está centralizada en un solo proveedor (Supabase)

**Negativas:**
- Las columnas `text` grandes en PostgreSQL aumentan el tamaño de la base de datos
- Los assets de imágenes requieren pipeline de upload (presigned URL → upload desde el cliente → confirmar en DB)
- Las transformaciones de imágenes de Supabase Storage tienen limitaciones en el Free tier
- Para videos de campañas, Supabase Storage puede ser costoso — se puede diferir a Cloudinary en el futuro

**Límites del Free tier de Supabase Storage:** 1GB incluido. Para una agencia pequeña, suficiente inicialmente. Con el crecimiento de assets, migrar a Pro ($25/mes, 100GB) es el siguiente paso.

**Paths de Storage (convención):**
```
/clients/{orgId}/{clientId}/assets/logo.png
/clients/{orgId}/{clientId}/assets/brand-kit.zip
/campaigns/{campaignId}/creatives/ad-1.jpg
/campaigns/{campaignId}/creatives/video-1.mp4
/reports/{clientId}/{type}/{period}/report.pdf
/imports/{orgId}/{timestamp}/metrics.csv
/ai-runs/{runId}/conversation.json
```

**Control de acceso en Storage:**
- Buckets privados — acceso solo via URLs firmadas
- Las URLs firmadas se generan server-side (Server Action) con expiración de 1h para descarga
- Las policies de Storage usan `auth.uid()` consistent con RLS de PostgreSQL

---

## Alternativas descartadas

**Supabase Storage para todo (incluyendo documentos):** Los documentos Markdown como objetos Storage requieren un read + parse en cada acceso. PostgreSQL permite queries, joins y búsqueda de texto. El overhead de Storage para documentos pequeños no vale la pena.

**AWS S3 directamente:** Añade un proveedor adicional (AWS) cuando Supabase Storage ya está incluido. Requiere configurar IAM, buckets, CORS, etc. Más costo operativo.

**Vercel Blob Storage:** No tiene RLS integrada con Supabase Auth. Requiere lógica de autorización adicional para cada archivo.

**Cloudinary:** Excelente para imágenes con transformaciones avanzadas, pero costoso y es un tercer proveedor. Se puede adoptar en el futuro si las transformaciones de imagen se vuelven críticas.

---

## Referencias

- `.agencia-ai/clients/` — documentos actuales en Markdown/JSON en filesystem
- `shared-data/` — datos estructurados actuales en JSON
- `docs/architecture/DATABASE_DESIGN.md` — tabla `client_documents.content (text)`
- `docs/audit/REUSE_MIGRATE_ARCHIVE.md` — clasificación de archivos para migración
- Supabase Storage docs: https://supabase.com/docs/guides/storage
- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
