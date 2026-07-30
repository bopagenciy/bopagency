export type DomainEvent = {
  readonly type: string;
  readonly occurredAt: Date;
  readonly payload: Record<string, unknown>;
};

export interface EventBusPort {
  publish(event: DomainEvent): Promise<void>;
}
