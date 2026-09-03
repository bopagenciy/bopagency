import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '../route';

const mockExchangeCodeForSession = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
    },
  })),
}));

describe('Auth Callback Route — Password Recovery & General (Phase AUTH-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exchanges code for session and redirects to /reset-password when next=/reset-password', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });

    const req = new NextRequest(
      new Request('https://bop-agency.vercel.app/auth/callback?code=valid-recovery-code-123&next=/reset-password'),
    );
    const res = await GET(req);

    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-recovery-code-123');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://bop-agency.vercel.app/reset-password');
  });

  it('redirects to /login when code is missing', async () => {
    const req = new NextRequest(new Request('https://bop-agency.vercel.app/auth/callback?next=/reset-password'));
    const res = await GET(req);

    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(res.status).toBe(307);
    // When code is missing, cleanNext is /reset-password so it notifies via reset-password error
    expect(res.headers.get('location')).toContain('/reset-password?error=');
  });

  it('redirects to /reset-password with clear error when code exchange fails for password recovery', async () => {
    mockExchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Token expired or invalid'),
    });

    const req = new NextRequest(
      new Request('https://bop-agency.vercel.app/auth/callback?code=expired-code&next=/reset-password'),
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/reset-password?error=');
  });

  it('sanitizes external open-redirect URLs and falls back to /dashboard', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });

    // Test protocol-relative, absolute external, and backslash URLs
    const maliciousUrls = [
      'https://evil.com',
      '//evil.com/phish',
      '/\\evil.com',
    ];

    for (const malicious of maliciousUrls) {
      const req = new NextRequest(
        new Request(`https://bop-agency.vercel.app/auth/callback?code=valid-code&next=${encodeURIComponent(malicious)}`),
      );
      const res = await GET(req);

      expect(res.status).toBe(307);
      expect(res.headers.get('location')).toBe('https://bop-agency.vercel.app/dashboard');
    }
  });
});
