import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestPasswordReset, updatePassword } from '../actions';
import { getAppUrl, buildRedirectUrl } from '../url';

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();
const mockSignOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
      signOut: mockSignOut,
    },
  })),
}));

// Mock Next.js navigation redirect
const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT:${url}`);
  // @ts-expect-error adding digest property like Next.js does
  err.digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw err;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

describe('Auth Actions — Password Recovery (Phase AUTH-2)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  describe('getAppUrl & buildRedirectUrl', () => {
    it('prioritizes NEXT_PUBLIC_APP_URL and normalizes trailing slashes', () => {
      process.env['NEXT_PUBLIC_APP_URL'] = '  https://bop-agency.vercel.app///  ';
      delete process.env['VERCEL_PROJECT_PRODUCTION_URL'];
      delete process.env['VERCEL_URL'];

      expect(getAppUrl()).toBe('https://bop-agency.vercel.app');
      expect(buildRedirectUrl('/auth/callback?next=/reset-password')).toBe(
        'https://bop-agency.vercel.app/auth/callback?next=/reset-password',
      );
    });

    it('falls back to VERCEL_PROJECT_PRODUCTION_URL with https:// prefix if NEXT_PUBLIC_APP_URL is absent', () => {
      delete process.env['NEXT_PUBLIC_APP_URL'];
      process.env['VERCEL_PROJECT_PRODUCTION_URL'] = 'bop-agency.vercel.app';
      delete process.env['VERCEL_URL'];

      expect(getAppUrl()).toBe('https://bop-agency.vercel.app');
    });

    it('falls back to VERCEL_URL with https:// prefix if preceding are absent', () => {
      delete process.env['NEXT_PUBLIC_APP_URL'];
      delete process.env['VERCEL_PROJECT_PRODUCTION_URL'];
      process.env['VERCEL_URL'] = 'bop-agency-c5n9nwyjl-bop-agency.vercel.app';

      expect(getAppUrl()).toBe('https://bop-agency-c5n9nwyjl-bop-agency.vercel.app');
    });

    it('defaults to http://localhost:3200 when no environment variables are defined', () => {
      delete process.env['NEXT_PUBLIC_APP_URL'];
      delete process.env['VERCEL_PROJECT_PRODUCTION_URL'];
      delete process.env['VERCEL_URL'];

      expect(getAppUrl()).toBe('http://localhost:3200');
    });

    it('does not duplicate https:// if Vercel env variable already includes it', () => {
      delete process.env['NEXT_PUBLIC_APP_URL'];
      process.env['VERCEL_PROJECT_PRODUCTION_URL'] = 'https://custom.bopagency.com';

      expect(getAppUrl()).toBe('https://custom.bopagency.com');
    });
  });

  describe('requestPasswordReset', () => {
    it('sends redirectTo targeting /auth/callback with next=/reset-password', async () => {
      process.env['NEXT_PUBLIC_APP_URL'] = 'https://bop-agency.vercel.app';
      mockResetPasswordForEmail.mockResolvedValue({ error: null });

      const formData = new FormData();
      formData.set('email', 'admin@bopagency.co');

      try {
        await requestPasswordReset(formData);
      } catch (err: unknown) {
        expect((err as Error).message).toContain('NEXT_REDIRECT:/forgot-password');
      }

      expect(mockResetPasswordForEmail).toHaveBeenCalledTimes(1);
      const [emailArg, optionsArg] = mockResetPasswordForEmail.mock.calls[0] as [string, { redirectTo: string }];
      expect(emailArg).toBe('admin@bopagency.co');

      // Crucial assertion: Must target /auth/callback with next=/reset-password
      const redirectUrl = new URL(optionsArg.redirectTo);
      expect(redirectUrl.origin).toBe('https://bop-agency.vercel.app');
      expect(redirectUrl.pathname).toBe('/auth/callback');
      expect(redirectUrl.searchParams.get('next')).toBe('/reset-password');
    });

    it('rejects invalid email without calling Supabase', async () => {
      const formData = new FormData();
      formData.set('email', 'not-an-email');

      try {
        await requestPasswordReset(formData);
      } catch (err: unknown) {
        expect((err as Error).message).toContain('NEXT_REDIRECT:/forgot-password?error=');
      }

      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('rejects when there is no active user session', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Auth session missing') });

      const formData = new FormData();
      formData.set('password', 'NewSecurePass123!');
      formData.set('confirmPassword', 'NewSecurePass123!');

      try {
        await updatePassword(formData);
      } catch (err: unknown) {
        expect((err as Error).message).toContain('NEXT_REDIRECT:/reset-password?error=');
      }

      expect(mockUpdateUser).not.toHaveBeenCalled();
    });

    it('updates password when user session is active, then signs out and redirects to login', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'usr-123' } }, error: null });
      mockUpdateUser.mockResolvedValue({ data: { user: { id: 'usr-123' } }, error: null });
      mockSignOut.mockResolvedValue({ error: null });

      const formData = new FormData();
      formData.set('password', 'NewSecurePass123!');
      formData.set('confirmPassword', 'NewSecurePass123!');

      try {
        await updatePassword(formData);
      } catch (err: unknown) {
        expect((err as Error).message).toContain('NEXT_REDIRECT:/login?message=');
      }

      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewSecurePass123!' });
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });

    it('handles Supabase update error safely', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'usr-123' } }, error: null });
      mockUpdateUser.mockResolvedValue({ data: { user: null }, error: new Error('Token expired') });

      const formData = new FormData();
      formData.set('password', 'NewSecurePass123!');
      formData.set('confirmPassword', 'NewSecurePass123!');

      try {
        await updatePassword(formData);
      } catch (err: unknown) {
        expect((err as Error).message).toContain('NEXT_REDIRECT:/reset-password?error=');
      }

      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });
});
