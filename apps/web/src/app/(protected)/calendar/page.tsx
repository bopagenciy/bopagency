import React from 'react';
import { requireOrganization } from '@/lib/auth/server';
import { ContentCalendarPage } from '@/components/calendar/ContentCalendarPage';

interface PageProps {
  searchParams: Promise<{ campaignId?: string }>;
}

export default async function GlobalCalendarPage({ searchParams }: PageProps) {
  const { membership } = await requireOrganization();
  const params = await searchParams;

  return (
    <ContentCalendarPage
      userRole={membership.role}
      {...(params.campaignId ? { initialCampaignId: params.campaignId } : {})}
    />
  );
}
