# Sift — Claude Code Context

## What is Sift?
Sift is the human curation layer for AI. Users capture URLs from across the web (X/Twitter, Reddit, GitHub, articles, blogs), organize them into projects, add contextual notes ("Context for Claude"), and export structured packages for LLM project files. The core insight: LLMs produce better output when humans curate and contextualize their input. Curation is a thinking act, not a filing act.

## Tech Stack
- **Framework:** Next.js 16.1.6 (App Router) with TypeScript
- **Styling:** Tailwind CSS 4 + CSS custom properties (see `.claude/skills/design-system.md`)
- **Database:** Supabase (PostgreSQL + Row Level Security + Auth)
- **Auth:** Google OAuth + Magic Link via Supabase Auth (`@supabase/ssr`)
- **Hosting:** Vercel (auto-deploys from `main` branch)
- **PDF Export:** jsPDF
- **Chrome Extension:** Vanilla JS, token-exchange auth, talks to Supabase REST API directly
- **PWA:** Web app manifest + service worker + share target API

## Project Structure
```
src/
  app/
    page.tsx                    # Dashboard — library view, Unsorted tray, project list
    all/page.tsx                # "View all captures" — cross-project capture list
    login/page.tsx              # "Sift — Curate the internet for your AI" login
    project/[id]/page.tsx       # Project detail — context note, captures, filters
    p/[id]/page.tsx             # Public shared project view (no auth)
    p/[id]/layout.tsx           # Public view layout with OG meta tags
    p/[id]/c/[captureId]/page.tsx  # Public individual capture view
    p/[id]/c/[captureId]/layout.tsx # Individual capture OG meta tags
    share/page.tsx              # PWA share target — mobile capture UI
    api/
      fetch-url/route.ts        # URL extraction engine (Reddit, X, GitHub, articles)
      extension-config/route.ts # Returns Supabase config for Chrome extension
      extension-token/route.ts  # Returns auth tokens for Chrome extension
      image-proxy/route.ts      # Proxies images to avoid CORS
    auth/callback/route.ts      # OAuth callback handler
    extension/auth-success/page.tsx # Extension auth completion page
    extension-bridge/page.tsx   # Legacy bridge page
  components/
    UserMenu.tsx                # User avatar + sign out dropdown
    PwaInstallPrompt.tsx        # Mobile PWA install banner
  lib/
    db.ts                       # Data layer — all Supabase queries, types, utilities
    pdf-export.ts               # PDF generation for "Package for Claude"
    supabase/
      client.ts                 # Browser Supabase client (createBrowserClient from @supabase/ssr)
      server.ts                 # Server Supabase client (for API routes)
      middleware.ts             # Session refresh + auth redirect middleware
  middleware.ts                 # Route matcher for auth middleware
extension/                      # Chrome extension (separate from Next.js)
  popup.js/html/css             # Extension UI and logic
  manifest.json                 # Manifest V3
  options.html/js               # Extension settings
public/
  manifest.json                 # PWA web app manifest
  sw.js                         # Service worker
  icons/                        # PWA icons (192, 512 SVG)
supabase/
  migrations/                   # SQL migration files
```

## Key Architecture Decisions
- **All data access goes through `src/lib/db.ts`** — never query Supabase directly from components
- **Row Level Security (RLS)** on all tables — users see own data, shared projects have public SELECT policies
- **Public routes use `createPublicClient()`** — a cookie-free Supabase client from `@supabase/supabase-js` for anonymous access to shared projects
- **Chrome extension uses token-exchange auth** — no cookies, tokens stored in `chrome.storage.local`, exchanged via `/api/extension-token`
- **URL extraction is server-side** in `/api/fetch-url`
- **Public routes excluded from auth middleware:** `/p/`, `/login`, `/auth`, `/api`, `/extension`, `/share`, `/sw.js`, `/manifest.json`, `/icons/`
- **Accent color discipline:** Yellow (#e8ff47) only on AI-facing elements — see design-bible.md

## Database Schema (Supabase)
```
profiles: id (UUID, FK auth.users), email, name, avatar_url, created_at
projects: id (UUID), user_id (FK profiles), name, brief, is_inbox (bool), share (bool), created_at, updated_at
captures: id (UUID), project_id (FK projects), user_id (FK profiles), url, title, body, author, platform, content_tag, note, images (JSONB), metadata (JSONB), sort_order, created_at
```

## Environment Variables (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key
- `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` — Reddit OAuth (optional)
- `APIFY_TOKEN` — Apify API token (optional fallback for X extraction)

## Deployment Flow
1. Push to `main` → Vercel auto-deploys
2. Database migrations run manually in Supabase SQL Editor
3. Chrome extension: `git pull` + reload in `chrome://extensions`

## Coding Principles
- **Simplicity first.** Minimum code that solves the problem.
- **Surgical changes.** Touch only what you must.
- **Dark theme always.** Use CSS variables, never hardcode colors.
- **Mobile-aware.** All UI works on mobile viewports.
- **Accent discipline.** Yellow only on AI-facing elements.
- **Verify builds.** Run `next build` before committing.

## Skill Files
Read these for domain-specific patterns:
- `.claude/skills/design-bible.md` — Design philosophy, intent hierarchy, anti-patterns, AI reflection design
- `.claude/skills/design-system.md` — Colors, typography, component patterns, layout specifications
- `.claude/skills/supabase-patterns.md` — Database layer, RLS, auth, migrations
- `.claude/skills/extraction-patterns.md` — URL extraction pipeline, platform strategies
- `.claude/skills/extension-patterns.md` — Chrome extension auth, capture flow, popup UI
