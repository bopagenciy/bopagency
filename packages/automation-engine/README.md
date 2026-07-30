# @bop-agency/automation-engine

Contracts and type definitions for workflow automation. No live dispatching in Fase 1.

## Contracts defined

- `WorkflowDispatcher` — primary port for dispatching n8n workflows (Fase 2+)
- `AutomationDefinition` — typed definition of a schedulable workflow
- `AutomationRun` — runtime record of a single execution
- `RetryPolicy` — configurable exponential backoff
- `IdempotencyKey` — deduplicated dispatch key

## Fase 2+

- `N8nWebhookDispatcher` adapter in `@bop-agency/infrastructure`
- Inngest integration for durable execution
- Run history storage via `AutomationRunRepository`
