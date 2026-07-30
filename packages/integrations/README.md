# @bop-agency/integrations

Integration contracts (ports) for external services. No live connections in Fase 1.

## Contracts defined

| Contract                      | Purpose                                   | Adapter (Fase 2+)           |
| ----------------------------- | ----------------------------------------- | --------------------------- |
| `AdvertisingPlatformProvider` | Meta Ads / Google Ads metrics & campaigns | Meta Graph API              |
| `MetricsProvider`             | Aggregated cross-platform metrics         | Composes platform providers |
| `EmailProvider`               | Transactional email                       | Resend                      |
| `StorageProvider`             | Object storage for reports/assets         | S3 / Cloudflare R2          |

## Notes

All implementations will live in `@bop-agency/infrastructure` to keep this package dependency-free.
