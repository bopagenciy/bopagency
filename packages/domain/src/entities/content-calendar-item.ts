import type { OrganizationId } from './organization';
import type { CampaignId } from './campaign';
import type { CampaignActivationId } from './campaign-activation';
import type { CampaignActivationTargetId } from './campaign-activation-target';
import type { ActivationChannel, ActivationProvider } from '@bop-agency/shared';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type ContentCalendarItemId = string & { readonly _brand: 'ContentCalendarItemId' };

export function contentCalendarItemId(id: string): ContentCalendarItemId {
  if (!id || id.trim().length === 0) {
    throw new Error('ContentCalendarItemId cannot be empty');
  }
  return id as ContentCalendarItemId;
}

// ─── Persisted Status Union ───────────────────────────────────────────────────

export type CalendarItemStatus = 'planned' | 'scheduled' | 'cancelled';

// ─── Domain Entity ────────────────────────────────────────────────────────────

export type ContentCalendarItem = {
  readonly id: ContentCalendarItemId;
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly activationId: CampaignActivationId | null;
  readonly targetId: CampaignActivationTargetId | null;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly title: string;
  readonly contentSummary: string | null;
  readonly scheduledFor: Date;
  readonly timezone: string;
  readonly status: CalendarItemStatus;
  readonly rescheduleReason: string | null;
  readonly notes: string | null;
  readonly createdBy: string;
  readonly updatedBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Projection (Read Model for Calendar Views) ───────────────────────────────

export type ContentCalendarItemProjection = {
  readonly id: ContentCalendarItemId;
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly campaignName: string;
  readonly clientId: string;
  readonly clientName: string;
  readonly activationId: CampaignActivationId | null;
  readonly targetId: CampaignActivationTargetId | null;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly title: string;
  readonly contentSummary: string | null;
  readonly scheduledFor: Date;
  readonly timezone: string;
  readonly calendarStatus: CalendarItemStatus;
  readonly rescheduleReason: string | null;
  readonly notes: string | null;
  readonly campaignStatus: string;
  readonly targetStatus: string | null;
  readonly publicationJobStatus: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

// ─── Derived UI Status & Helper Computations ──────────────────────────────────

export type CalendarBlockedReason =
  | 'CAMPAIGN_NOT_APPROVED'
  | 'ACTIVATION_MISSING'
  | 'TARGET_MISSING'
  | 'TARGET_FAILED'
  | 'JOB_FAILED'
  | 'UNKNOWN_OUTCOME';

export type CalendarDerivedStatusLabel =
  | 'Cancelado'
  | 'Publicado'
  | 'En publicación'
  | 'Resultado indeterminado'
  | 'Fallido'
  | 'Encolado'
  | 'Preparando publicación'
  | 'Vencido'
  | 'Bloqueado'
  | 'Programado'
  | 'Planificado';

export function computeCalendarDerivedState(projection: ContentCalendarItemProjection, now: Date = new Date()): {
  readonly isOverdue: boolean;
  readonly isBlocked: boolean;
  readonly blockedReason: CalendarBlockedReason | null;
  readonly derivedLabel: CalendarDerivedStatusLabel;
} {
  if (projection.calendarStatus === 'cancelled') {
    return {
      isOverdue: false,
      isBlocked: false,
      blockedReason: null,
      derivedLabel: 'Cancelado',
    };
  }

  // Determine blocked reasons in exact priority order
  let isBlocked = false;
  let blockedReason: CalendarBlockedReason | null = null;

  if (projection.campaignStatus !== 'approved') {
    isBlocked = true;
    blockedReason = 'CAMPAIGN_NOT_APPROVED';
  } else if (projection.targetStatus === 'failed') {
    isBlocked = true;
    blockedReason = 'TARGET_FAILED';
  } else if (projection.publicationJobStatus === 'failed') {
    isBlocked = true;
    blockedReason = 'JOB_FAILED';
  } else if (projection.publicationJobStatus === 'unknown_outcome') {
    isBlocked = true;
    blockedReason = 'UNKNOWN_OUTCOME';
  } else if (projection.scheduledFor < now) {
    if (!projection.activationId) {
      isBlocked = true;
      blockedReason = 'ACTIVATION_MISSING';
    } else if (!projection.targetId) {
      isBlocked = true;
      blockedReason = 'TARGET_MISSING';
    }
  }

  // Determine overdue
  const isOverdue =
    projection.scheduledFor < now &&
    projection.targetStatus !== 'published' &&
    projection.publicationJobStatus !== 'succeeded';

  // Determine derived UI label based on precedence
  let derivedLabel: CalendarDerivedStatusLabel;

  if (projection.publicationJobStatus === 'succeeded' || projection.targetStatus === 'published') {
    derivedLabel = 'Publicado';
  } else if (projection.publicationJobStatus === 'in_progress') {
    derivedLabel = 'En publicación';
  } else if (projection.publicationJobStatus === 'unknown_outcome') {
    derivedLabel = 'Resultado indeterminado';
  } else if (projection.publicationJobStatus === 'failed' || projection.targetStatus === 'failed') {
    derivedLabel = 'Fallido';
  } else if (projection.publicationJobStatus === 'queued') {
    derivedLabel = 'Encolado';
  } else if (projection.publicationJobStatus === 'claimed') {
    derivedLabel = 'Preparando publicación';
  } else if (isOverdue) {
    derivedLabel = 'Vencido';
  } else if (isBlocked) {
    derivedLabel = 'Bloqueado';
  } else if (projection.calendarStatus === 'scheduled') {
    derivedLabel = 'Programado';
  } else {
    derivedLabel = 'Planificado';
  }

  return { isOverdue, isBlocked, blockedReason, derivedLabel };
}

// ─── IANA Timezone Validation ─────────────────────────────────────────────────

export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || tz.trim().length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Input Types ──────────────────────────────────────────────────────────────

export type CreateContentCalendarItemInput = {
  readonly organizationId: OrganizationId;
  readonly campaignId: CampaignId;
  readonly channel: ActivationChannel;
  readonly provider: ActivationProvider;
  readonly title: string;
  readonly contentSummary?: string | null | undefined;
  readonly scheduledFor: Date;
  readonly timezone?: string | undefined;
  readonly notes?: string | null | undefined;
};

export type UpdateContentCalendarItemScheduleInput = {
  readonly calendarItemId: ContentCalendarItemId;
  readonly organizationId: OrganizationId;
  readonly scheduledFor: Date;
  readonly timezone?: string | undefined;
  readonly rescheduleReason: string;
};

export type CancelContentCalendarItemInput = {
  readonly calendarItemId: ContentCalendarItemId;
  readonly organizationId: OrganizationId;
  readonly reason: string;
};

export type LinkContentCalendarItemTargetInput = {
  readonly calendarItemId: ContentCalendarItemId;
  readonly organizationId: OrganizationId;
  readonly targetId: CampaignActivationTargetId;
};

export type ListContentCalendarItemsByRangeFilter = {
  readonly organizationId: OrganizationId;
  readonly startAt: Date;
  readonly endAt: Date;
  readonly campaignId?: CampaignId | undefined;
  readonly channel?: ActivationChannel | undefined;
};
