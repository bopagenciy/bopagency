export type PromptReference = {
  readonly id: string;
  readonly version: string;
  readonly template: string;
  readonly variables: readonly string[];
};

export function renderPrompt(ref: PromptReference, vars: Record<string, string>): string {
  return ref.variables.reduce((tpl, key) => {
    const value = vars[key] ?? '';
    return tpl.replaceAll(`{{${key}}}`, value);
  }, ref.template);
}
