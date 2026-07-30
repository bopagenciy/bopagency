# Auth Design — Phase 2

## Library choice

| Requirement     | Decision                                                                       |
| --------------- | ------------------------------------------------------------------------------ |
| Auth provider   | Supabase Auth                                                                  |
| Client packages | `@supabase/supabase-js` + `@supabase/ssr`                                      |
| Prohibited      | `@supabase/auth-helpers-nextjs`, Clerk, Auth0, Firebase Auth, NextAuth/Auth.js |

`@supabase/ssr` provides `createBrowserClient()`, `createServerClient()`, and cookie helpers compatible with Next.js 15 App Router. It is the current Supabase-recommended package for Next.js (auth-helpers-nextjs is deprecated).

---

## Client types

### Browser client — `apps/web/src/lib/supabase/browser.ts`

```
createBrowserClient<Database>(url, anonKey)
```

- Use ONLY in `'use client'` components.
- Uses the public anon key — protected by RLS.
- Export alias: `createBrowserSupabaseClient`.

### Server client — `apps/web/src/lib/supabase/server.ts`

```
createServerClient<Database>(url, anonKey, { cookies })
```

- Use in Server Components, Server Actions, Route Handlers.
- Reads/writes cookies via `next/headers` (async API).
- Export alias: `createServerSupabaseClient`.

### Admin client — `apps/web/src/lib/supabase/server.ts`

```
createClient(url, serviceRoleKey)
```

- Uses `SUPABASE_SERVICE_ROLE_KEY` — **never** `NEXT_PUBLIC_` prefixed.
- Bypasses RLS — use only in explicitly authorized server-only paths.
- Throws if env var is missing (fail-fast).
- Export alias: `createAdminClient`.

### Middleware client — `apps/web/src/lib/supabase/middleware.ts`

```
createMiddlewareClient(request, response)
```

- Used only in `apps/web/src/middleware.ts`.
- Returns `{ supabase, supabaseResponse }` — must pass `supabaseResponse` back.

---

## Session refresh strategy

`middleware.ts` calls `supabase.auth.getUser()` (not `getSession()`). This validates the JWT with the Supabase server on every request, which is slower but avoids stale/forged sessions. The middleware cookie writer (via `@supabase/ssr`) silently refreshes expiring tokens.

---

## Route protection

```
PUBLIC_ROUTES  = ['/login', '/signup', '/forgot-password', '/reset-password',
                  '/auth/callback', '/auth/confirm']
AUTH_ROUTES    = ['/login', '/signup', '/forgot-password', '/reset-password']
PROTECTED      = everything else
```

- Authenticated user on an AUTH_ROUTE → redirect to `/dashboard`
- Unauthenticated user on a PROTECTED route → redirect to `/login?redirectTo=<original>`

---

## Auth flow — email/password

1. User submits `/signup` → `signUp` server action
2. Supabase sends confirmation email with link to `/auth/confirm?token_hash=…&type=signup`
3. `/auth/confirm` calls `verifyOtp()` → on success redirects to `/onboarding`
4. Onboarding creates org → sets `active_organization_id` → redirects to `/dashboard`
5. Future logins: `/login` → `signIn` → redirect to `redirectTo` or `/dashboard`

## Auth flow — password reset

1. `/forgot-password` → `requestPasswordReset` → Supabase sends email
2. Link: `/auth/callback?code=…&next=/reset-password`
3. `/auth/callback` calls `exchangeCodeForSession()` → redirects to `/reset-password`
4. `/reset-password` → `updatePassword` → redirects to `/login?message=…`

---

## Security invariants

- Service role key: only in `createAdminClient()`, never in any client-side path.
- `auth.getUser()` used everywhere (not `auth.getSession()`).
- Password reset confirmation always shows an ambiguous message (prevents email enumeration).
- All redirect paths validated server-side; no open redirects possible via `redirectTo` because the middleware only redirects within the app.
