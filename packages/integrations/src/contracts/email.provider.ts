import type { Result } from '@bop-agency/shared';

export type EmailAddress = { readonly name?: string; readonly email: string };

export type EmailMessage = {
  readonly to: readonly EmailAddress[];
  readonly from: EmailAddress;
  readonly subject: string;
  readonly htmlBody: string;
  readonly textBody?: string;
  readonly replyTo?: EmailAddress;
};

export type EmailSendResult = {
  readonly messageId: string;
  readonly provider: string;
};

/** Email sending port — Resend adapter in Fase 2+. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<Result<EmailSendResult>>;
}
