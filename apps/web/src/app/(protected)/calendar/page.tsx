import React from 'react';
import { requireOrganization } from '@/lib/auth/server';
import { ContentCalendarPage } from '@/components/calendar/ContentCalendarPage';
import type { OrganizationRole } from '@/lib/supabase/types';

interface PageProps {
  searchParams: Promise<{ campaignId?: string }>;
}

export default async function GlobalCalendarPage({ searchParams }: PageProps) {
  const { membership } = await requireOrganization();
  const params = await searchParams;

  return (
    <ContentCalendarPage
      userRole={membership.role as OrganizationRole}
      {...(params.campaignId ? { initialCampaignId: params.campaignId } : {})}
    />
  );
}
