import type { ClientId } from './client';

export type ReportId = string & { readonly _brand: 'ReportId' };

export type ReportType = 'weekly' | 'monthly' | 'custom';
export type ReportStatus = 'draft' | 'generated' | 'sent' | 'failed';

export type Report = {
  readonly id: ReportId;
  readonly clientId: ClientId;
  readonly type: ReportType;
  readonly status: ReportStatus;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly generatedAt?: Date;
  readonly sentAt?: Date;
  readonly recipientEmails: string[];
  readonly createdAt: Date;
};
