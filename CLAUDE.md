# Sift — Claude Code Context

## What is Sift?
Sift is a human curation layer for AI. Users capture URLs from across the web (X/Twitter, Reddit, GitHub, articles, blogs), organize them into projects, add contextual notes ("Context for Claude"), and export structured packages for LLM project files. The core insight: LLMs produce better output when humans curate and contextualize their input.

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router) with TypeScript
- **Styling:** Tailwind CSS 4 + CSS custom properties (see `.claude/skills/design-system.md`)
- **Database:** Supabase (PostgreSQL + Row Level Security + Auth)
- **Auth:** Google OAuth + Magic Link via Supabase Auth (`@supabase/ssr`)
- **Hosting:** Vercel (auto-deploys from `main` branch)
- **PDF Export:** jsPDF
- **Chrome Extension:** Vanilla JS, talks to Supabase REST API directly

## Project Structure
```
src/
  app/
    page.tsx              # Home — project grid, unsorted card, quick capture, search
    all/page.tsx          # "View all captures" — cross-project capture list
    login/page.tsx        # Google OAuth + magic link login
    project/[id]/page.tsx # Project detail — capture grid, capture input, filters
    p/[id]/page.tsx       # Public shared project view (no auth required)
    p/[id]/c/[captureId]/ # Public individual capture view
    api/
      fetch-url/route.ts  # URL extraction engine (Reddit, X, GitHub, articles)
      extension-config/    # Returns Supabase URL/key for Chrome extension
      extension-token/     # Returns auth tokens for Chrome extension
      image-proxy/         # Proxies images to avoid CORS issues
    auth/callback/route.ts # OAuth callback handler
    extension/auth-success/ # Extension auth completion page
  components/
    UserMenu.tsx           # User avatar + sign out dropdown
  lib/
    db.ts                  # Data layer — all Supabase queries, types, utilities
    pdf-export.ts          # PDF generation for "Package for Claude"
    supabase/
      client.ts            # Browser Supabase client (createBrowserClient)
      server.ts            # Server Supabase client (for API routes)
      middleware.ts         # Session refresh + auth redirect middleware
  middleware.ts            # Route matcher for auth middleware
extension/                 # Chrome extension (separate from Next.js)
  popup.js                # Main extension logic
  popup.html/css          # Extension UI
  manifest.json           # Extension manifest (v3)
supabase/
  migrations/             # SQL migration files — run in Supabase SQL Editor
```

## Key Architecture Decisions
- **All data access goes through `src/lib/db.ts`** — never query Supabase directly from components
- **Row Level Security (RLS)** on all tables — users only see their own data, except shared projects which have public SELECT policies
- **The Chrome extension does NOT use cookies** — it exchanges tokens via `/api/extension-token` and stores them in `chrome.storage.local`
- **URL extraction happens server-side** in `/api/fetch-url` — the client sends a URL, the API returns structured content
- **Public routes (`/p/`, `/login`, `/auth`, `/api`) are excluded from auth middleware**

## Database Schema (Supabase)
```
profiles: id (UUID, FK auth.users), email, name, avatar_url, created_at
projects: id (UUID), user_id (FK profiles), name, brief, is_inbox (bool), share (bool), created_at, updated_at
captures: id (UUID), project_id (FK projects), user_id (FK profiles), url, title, body, author, platform, content_tag, note, images (JSONB), metadata (JSONB), sort_order, created_at
```

## Environment Variables (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — Reddit OAuth (optional, for authenticated extraction)
- `APIFY_TOKEN` — Apify API token (optional, fallback for X extraction)

## Deployment Flow
1. Code pushed to `main` branch on GitHub
2. Vercel auto-deploys (build: `next build`)
3. Database migrations run manually in Supabase SQL Editor
4. Chrome extension updated locally via `git pull` + reload in `chrome://extensions`

## Coding Principles
- **Simplicity first.** Minimum code that solves the problem. If 200 lines can be 50, rewrite.
- **Surgical changes.** Touch only what you must. Don't refactor adjacent code unless asked.
- **Build must pass.** Always verify with `next build` before committing.
- **Dark theme always.** Use CSS variables from globals.css, never hardcode colors.
- **Mobile-aware.** All UI should work on mobile viewports. Use responsive grid patterns.

## Skill Files
Read these for domain-specific patterns:
- `.claude/skills/design-system.md` — Colors, typography, card components, animations
- `.claude/skills/supabase-patterns.md` — Database layer, RLS, auth, migrations
- `.claude/skills/extraction-patterns.md` — URL extraction pipeline, platform strategies
- `.claude/skills/extension-patterns.md` — Chrome extension auth, capture flow, popup UI
