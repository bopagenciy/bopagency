export type IdempotencyKey = string & { readonly _brand: 'IdempotencyKey' };

export function idempotencyKey(automationId: string, runId: string, date: string): IdempotencyKey {
  return `${automationId}:${runId}:${date}` as IdempotencyKey;
}
