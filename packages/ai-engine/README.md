# @bop-agency/ai-engine

Contracts and type definitions for the AI layer. No live API calls in Fase 1.

## Contracts defined

- `AIProvider` — primary port for LLM completions (Claude API in Fase 2+)
- `AgentDefinition` — maps an `AgentType` to a system prompt + allowed skills
- `SkillDefinition` — wraps a skill as a typed request/response transform
- `TemplateDefinition` — reusable prompt templates per report type
- `PromptReference` — versioned prompt templates with variable interpolation

## Fase 2+

- `ClaudeAPIProvider` adapter in `@bop-agency/infrastructure`
- Agent orchestration loop
- Skill registry and router
- Prompt versioning store
