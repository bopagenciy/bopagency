# @bop-agency/infrastructure

Adapters that implement the ports defined in `@bop-agency/application`.

## Current adapters

| Adapter                    | Port               | Status                    |
| -------------------------- | ------------------ | ------------------------- |
| `consoleLogger`            | `LoggerPort`       | ✅ Fase 1                 |
| `InMemoryClientRepository` | `ClientRepository` | ✅ Fase 1 (dev/test only) |

## Fase 2+

- Supabase/PostgreSQL adapters for all repositories
- Redis cache adapter
- S3 storage adapter
- Meta Ads API integration (moved from n8n)
