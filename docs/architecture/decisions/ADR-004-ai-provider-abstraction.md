# ADR-004: Abstracción del Proveedor de IA — Claude API (Anthropic) con interfaz intercambiable
**Estado:** Aceptado  
**Fecha:** 2026-07-29  
**Autores:** Francisco (Bop Agency)  
**Revisores:** Pendiente

---

## Contexto

El sistema actual ejecuta los agentes y skills de IA a través de **Claude Code CLI** — la herramienta de línea de comandos de Anthropic. Esto significa que los agentes solo pueden ejecutarse desde una terminal en la máquina local, no desde la interfaz web.

Las 16 agentes y 32 skills están definidas como archivos Markdown con system prompts. Su contenido es completamente independiente de la tecnología de ejecución — son texto estructurado que puede enviarse a cualquier LLM.

**Problema:** Claude Code CLI es una herramienta de desarrollo, no una API programable para integrar en una aplicación web. Para que los usuarios puedan ejecutar agentes desde el browser, se necesita integrar directamente con la Claude API (Anthropic Messages API).

**Requisitos:**
- Ejecutar agentes con system prompts personalizados por cliente
- Streaming de respuestas al browser en tiempo real
- Tracking de tokens usados y costo estimado por ejecución
- La lógica de negocio NO debe depender del proveedor — el proveedor debe ser intercambiable
- Si Anthropic sube precios o Claude se vuelve inadecuado, migrar a GPT-4 o Gemini no debe requerir cambios en la capa de aplicación

**Opciones consideradas:**
1. Claude API (Anthropic) directamente + interfaz `AIProvider`
2. OpenAI API (GPT-4o)
3. Google Gemini API
4. Vercel AI SDK (abstracción multi-proveedor)
5. LangChain.js (framework de agentes)
6. Mantener Claude Code CLI (sin acceso web)

---

## Decisión

**Se adopta Claude API (Anthropic) como proveedor de IA por defecto, invocado a través de la interfaz `AIProvider` definida en el dominio.**

La interfaz `AIProvider` permite cambiar el proveedor sin modificar la lógica de aplicación.

---

## Interfaz del puerto (dominio)

```typescript
// lib/domain/ports/ai-provider.ts (Propuesto — no implementar todavía)
interface AIProvider {
  complete(params: AICompletionParams): Promise<AICompletionResult>;
  stream(params: AICompletionParams): AsyncIterable<string>;
  countTokens(text: string, model: string): Promise<number>;
  getAvailableModels(): Promise<AIModel[]>;
}

interface AICompletionParams {
  systemPrompt: string;
  messages: AIMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
}
```

---

## Justificación

| Criterio | Claude API | OpenAI API | Gemini | Vercel AI SDK | LangChain |
|----------|-----------|-----------|--------|---------------|-----------|
| Calidad de output para marketing en español | ✅ Excelente | ✅ Excelente | ✅ Bueno | N/A (es wrapper) | N/A |
| Context window | ✅ 200K tokens | ✅ 128K | ✅ 1M | N/A | N/A |
| Streaming nativo | ✅ | ✅ | ✅ | ✅ | ✅ |
| SDK TypeScript oficial | ✅ `@anthropic-ai/sdk` | ✅ `openai` | ✅ | ✅ | ✅ |
| Soporte de español (Colombia) | ✅ | ✅ | ✅ | N/A | N/A |
| Costo (Sonnet) por 1M input tokens | ~$3 | ~$2.50 (GPT-4o mini) | ~$0.075 (Flash) | N/A | N/A |
| Coherencia con prompts actuales | ✅ Escritos para Claude | ⚠️ Requieren re-evaluación | ⚠️ Requieren re-evaluación | ✅ | N/A |
| Complejidad del adaptador | Baja | Baja | Baja | Baja | Alta |

**Razón principal para Claude API:** Los 16 agentes y 32 skills ya están escritos con prompts optimizados para Claude. Cambiar de proveedor requeriría re-evaluar todos los prompts. La calidad probada en el sistema actual justifica continuar con Claude.

**Razón para NO usar Vercel AI SDK:** Añade una capa de abstracción sobre la abstracción ya definida en `AIProvider`. Introduce dependencia innecesaria — el `AIProvider` ya es la abstracción correcta.

**Razón para NO usar LangChain:** Frameworks de agentes como LangChain tienen abstracciones opinionadas que conflictúan con Arquitectura Limpia. Añaden complejidad (chains, tools, memory) que no se necesita cuando los prompts son explícitos y el contexto se construye por código.

---

## Consecuencias

**Positivas:**
- Los prompts actuales de agentes y skills funcionan sin modificación
- La interfaz `AIProvider` permite cambiar a OpenAI, Gemini, o modelos locales (Ollama) sin tocar la capa de aplicación
- El streaming de Claude API es nativo y compatible con Server-Sent Events en Next.js
- El context window de 200K tokens permite incluir documentos completos del cliente

**Negativas:**
- Dependencia de Anthropic como proveedor (mitigada por la interfaz `AIProvider`)
- Costo variable según uso — necesita tracking por cliente para control de gastos
- La API de Claude puede cambiar (breaking changes) — el adaptador debe absorberlos

**Modelos recomendados por caso de uso:**

| Caso de uso | Modelo | Justificación |
|-------------|--------|---------------|
| Agentes complejos (Campaign Studio) | claude-sonnet-5 | Alta calidad, razonamiento complejo |
| Skills de instrucción (análisis rápido) | claude-haiku-4-5 | Bajo costo, respuesta rápida |
| Compliance Review | claude-sonnet-5 | Precisión crítica |
| Generación de copies | claude-sonnet-5 | Calidad de escritura |
| Tests y desarrollo | claude-haiku-4-5 | Costo mínimo en dev |

**Tracking de costos:** La tabla `ai_runs` registra `tokens_input`, `tokens_output`, y `model`. Un servicio de análisis puede calcular el costo estimado por cliente multiplicando tokens × precio por modelo.

---

## Alternativas descartadas

**Mantener Claude Code CLI:** No ofrece una API programable. No puede integrarse en una aplicación web. Los usuarios seguirían limitados al terminal.

**LangChain.js:** Añade abstracciones complejas (agents, tools, chains) innecesarias cuando los prompts son explícitos. En Arquitectura Limpia, el dominio no debe depender de frameworks externos.

**Vercel AI SDK como abstracción:** Añade una dependencia adicional cuando el `AIProvider` ya provee la abstracción correcta. Si el equipo quiere soporte multi-proveedor, se implementa un `MultiAIProvider` que internamente usa los SDKs directos.

---

## Referencias

- `.agencia-ai/.claude/agents/` — 16 agentes con system prompts para Claude
- `.agencia-ai/.claude/skills/` — 32 skills escritas para Claude
- `docs/architecture/ARCHITECTURE.md` — sección 9, interfaz `AIProvider`
- Anthropic SDK: https://github.com/anthropic-ai/anthropic-node
- `docs/audit/AI_SYSTEM_INVENTORY.md` — inventario completo del sistema AI
