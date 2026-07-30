import { z } from 'zod';

const EmailSchema = z.string().email().toLowerCase();

export type Email = z.infer<typeof EmailSchema>;

export function parseEmail(value: string): Email {
  return EmailSchema.parse(value);
}

export function isValidEmail(value: string): boolean {
  return EmailSchema.safeParse(value).success;
}
