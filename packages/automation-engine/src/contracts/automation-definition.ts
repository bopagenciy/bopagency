import type { AutomationId } from '@bop-agency/domain';
import type { AdPlatform } from '@bop-agency/shared';

export type AutomationTrigger =
  | { readonly type: 'schedule'; readonly cron: string }
  | { readonly type: 'webhook'; readonly path: string }
  | { readonly type: 'event'; readonly eventType: string };

export type AutomationDefinition = {
  readonly id: AutomationId;
  readonly name: string;
  readonly description: string;
  readonly trigger: AutomationTrigger;
  readonly platforms: readonly AdPlatform[];
};
