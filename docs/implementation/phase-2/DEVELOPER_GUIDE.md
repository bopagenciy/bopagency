# Developer Guide — Phase 2

## Initial setup (one-time)

### 1. Install dependencies

```bash
# In project root:
npm install
```

This installs `@supabase/supabase-js ^2.49.4` and `@supabase/ssr ^0.6.1` and applies the Next.js 15.5.22 fix.

### 2. Environment variables

```bash
# Copy the template:
cp apps/web/.env.example apps/web/.env.local
```

Edit `apps/web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Find your keys in Supabase Dashboard → Settings → API.

⚠️ **Never commit `.env.local`** — it is in `.gitignore`.

### 3. Apply the database migration

Option A — Supabase Dashboard (recommended for now):

1. Open https://supabase.com/dashboard → Your Project → SQL Editor
2. Paste contents of `supabase/migrations/20260730000000_phase2_auth_and_tenancy.sql`
3. Click Run

Option B — Supabase CLI (if installed and linked):

```bash
supabase link --project-ref YOUR_PROJECT_ID
supabase db push
```

### 4. Clean up Phase 1 artifact

```bash
del apps\web\.babelrc
```

### 5. Start development

```bash
npm run dev --workspace=apps/web
# App runs at http://localhost:3200
```

---

## Auth configuration in Supabase Dashboard

Go to **Authentication → URL Configuration**:

- Site URL: `http://localhost:3200`
- Redirect URLs: `http://localhost:3200/**`

For production, add:

- Site URL: `https://yourdomain.com`
- Redirect URLs: `https://yourdomain.com/**`

---

## Working with Supabase clients

### In Client Components (`'use client'`):

```typescript
import { createBrowserSupabaseClient } from '@/lib/supabase';
const supabase = createBrowserSupabaseClient();
```

### In Server Components / Server Actions / Route Handlers:

```typescript
import { createServerSupabaseClient } from '@/lib/supabase';
const supabase = await createServerSupabaseClient();
```

### Admin operations (bypass RLS — server-only):

```typescript
import { createAdminClient } from '@/lib/supabase';
const supabase = createAdminClient(); // throws if SUPABASE_SERVICE_ROLE_KEY is missing
```

### Never:

- Import `createAdminClient` in Client Components
- Use `SUPABASE_SERVICE_ROLE_KEY` directly (always go through `createAdminClient`)
- Call `auth.getSession()` (use `auth.getUser()` instead)

---

## Protecting pages

### Middleware (automatic):

All routes except `PUBLIC_ROUTES` require authentication. The middleware in `apps/web/src/middleware.ts` handles this.

### Server Component (explicit):

```typescript
import { requireUser, requireOrganizationRole } from '@/lib/auth/server';

// Require auth:
const user = await requireUser(); // redirects to /login if no session

// Require org membership:
const { organization, membership } = await requireOrganization();

// Require minimum role:
await requireOrganizationRole('admin'); // redirects to /access-denied if insufficient
```

---

## Role hierarchy

```
viewer < operator < strategist < admin < owner
```

- `viewer` — read-only access to org data
- `operator` — can execute campaigns, automations
- `strategist` — can create/edit campaigns and reports
- `admin` — can manage members, invite, update settings
- `owner` — full control including billing and deletion

---

## User flow: new user

1. `/signup` → email confirmation sent
2. Click link → `/auth/confirm` → `/onboarding`
3. Create organization → `/dashboard`

## User flow: returning user

1. `/login` → `/dashboard` (or original URL via `?redirectTo`)

## User flow: invite

1. Admin creates invitation (via use case or future UI)
2. Invitee receives email with token
3. Invitee clicks link → `/auth/callback?code=...` → `/onboarding` (if no org) or `/dashboard`

---

## Running tests

```bash
# All packages:
npm run test --workspaces --if-present

# Specific:
npm test --workspace=apps/web
npm test --workspace=packages/domain
npm test --workspace=packages/infrastructure
```

## Type checking

```bash
npm run typecheck --workspaces --if-present
```

## Linting

```bash
npm run lint --workspaces --if-present
```
