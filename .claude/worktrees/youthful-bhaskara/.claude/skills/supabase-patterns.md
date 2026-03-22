# Sift Supabase Patterns

## Client Setup
Three Supabase clients exist for different contexts:

### Browser Client (`src/lib/supabase/client.ts`)
```typescript
import { createBrowserClient } from '@supabase/ssr';
// Used in client components ('use client') and the Chrome extension config
// Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

### Server Client (`src/lib/supabase/server.ts`)
```typescript
import { createServerClient } from '@supabase/ssr';
// Used in API routes and server components
// Has cookie-based session access
```

### Middleware Client (`src/lib/supabase/middleware.ts`)
```typescript
// Refreshes auth session on every request
// Redirects unauthenticated users to /login
// Excludes: /login, /auth, /api, /p/ (public), /extension, /share
```

## Data Layer (`src/lib/db.ts`)
ALL database operations go through this file. Components never import Supabase directly.

### Types
```typescript
type Platform = 'reddit' | 'twitter' | 'github' | 'article' | 'other';

interface Project {
  id: string; name: string; brief: string;
  is_inbox: boolean; share: boolean;
  createdAt: number; updatedAt: number; captureCount: number;
}

interface Capture {
  id: string; projectId: string; url: string;
  platform: Platform; title: string; body: string;
  author: string; images: string[]; metadata: Record<string, unknown>;
  note: string; tags: string[]; createdAt: number;
  sortOrder?: number; contentTag?: string;
}
```

### Row-to-Model Conversion
Database rows use snake_case (`project_id`, `created_at`). TypeScript models use camelCase (`projectId`, `createdAt`). Conversion happens in `rowToProject()` and `rowToCapture()` helpers. Always use these — never pass raw Supabase rows to components.

### Key Functions
- `getProjects()` — fetches all user's projects with capture counts via `select('*, captures(count)')`
- `getCaptures(projectId)` — fetches captures ordered by sort_order then created_at DESC
- `addCapture(...)` — inserts capture + touches project's updated_at
- `ensureInbox()` — creates the "Unsorted" project (is_inbox=true) if it doesn't exist
- `getAllCaptures()` — fetches all captures across projects (for search and "view all")
- `getSharedProject(id)` / `getSharedProjectCaptures(id)` — public queries that filter by `share = true`

### Auth Pattern
```typescript
async function getUserId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}
```
Every write operation calls `getUserId()` first. The user_id is included in INSERT operations for RLS compliance.

## Row Level Security (RLS)
All tables have RLS enabled. Policies:

### Authenticated User Policies
```sql
-- Users can only CRUD their own data
CREATE POLICY "own_projects_select" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_projects_insert" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Same pattern for update, delete, and captures table
```

### Public Sharing Policies
```sql
-- Anyone can view shared projects (no auth required)
CREATE POLICY "Public can view shared projects" ON projects FOR SELECT USING (share = true);
-- Anyone can view captures of shared projects
CREATE POLICY "Public can view captures of shared projects" ON captures FOR SELECT
  USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = captures.project_id AND projects.share = true));
```

## Migrations
- Stored in `supabase/migrations/` as SQL files
- Named: `YYYYMMDD_description.sql`
- Run manually in Supabase SQL Editor (not auto-applied)
- Always use `IF NOT EXISTS` / `IF EXISTS` for idempotency
- Initial schema is in `supabase-migration.sql` at repo root

## Auth Flow
1. User clicks "Sign in with Google" → Supabase OAuth → Google consent → callback to `/auth/callback`
2. Callback exchanges code for session → redirects to `/`
3. Middleware refreshes session cookie on every request
4. New users auto-get a profile via database trigger (`handle_new_user()`)
5. New users auto-get an "Unsorted" project via `ensureInbox()` on first home page load

## Patterns to Follow
- Always include `user_id` in INSERT operations
- Always use `.eq('id', id)` for single-record queries, not `.match()`
- Use `.single()` when expecting exactly one row
- Handle `PGRST116` error code (not found) by returning null, not throwing
- Touch `updated_at` on the parent project after capture CRUD operations
- Use `Promise.all()` for parallel queries where possible (home page loads projects + captures simultaneously)
