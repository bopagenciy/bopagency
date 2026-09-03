import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPasswordPage from '../page';

const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

const mockRedirect = vi.fn((url: string) => {
  const err = new Error(`NEXT_REDIRECT:${url}`);
  // @ts-expect-error mock Next.js redirect
  err.digest = `NEXT_REDIRECT;replace;${url};307;;`;
  throw err;
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: unknown; href: string }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

describe('ResetPasswordPage (Phase AUTH-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('self-heals links with ?code=... by redirecting server-side to /auth/callback', async () => {
    try {
      await ResetPasswordPage({
        searchParams: Promise.resolve({ code: 'legacy-recovery-code-xyz' }),
      });
      expect.unreachable('Should have thrown redirect error');
    } catch (err: unknown) {
      expect((err as Error).message).toContain(
        'NEXT_REDIRECT:/auth/callback?code=legacy-recovery-code-xyz&next=/reset-password',
      );
    }
  });

  it('renders invalid recovery link state when user session is not present', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Auth session missing') });

    const jsx = await ResetPasswordPage({
      searchParams: Promise.resolve({}),
    });

    expect(jsx).toBeDefined();
    // Verify it does NOT render the form and instead renders the invalid link warning
    const stringified = JSON.stringify(jsx);
    expect(stringified).toContain('Enlace no válido o expirado');
    expect(stringified).toContain('/forgot-password');
  });

  it('renders the password reset form when valid user session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-valid-123' } }, error: null });

    const jsx = await ResetPasswordPage({
      searchParams: Promise.resolve({}),
    });

    expect(jsx).toBeDefined();
    const stringified = JSON.stringify(jsx);
    expect(stringified).toContain('Nueva contraseña');
    expect(stringified).toContain('confirmPassword');
  });
});
