# Sift

Capture the internet for your AI. Sift extracts content from URLs across Reddit, X (Twitter), GitHub, and articles — structures it with platform-aware metadata — and exports it as context packages for Claude and other AI agents.

**Live at** [bild-curation-app.vercel.app](https://bild-curation-app.vercel.app)

## What it does

Paste a URL. Sift extracts the content, detects the platform, pulls metadata (engagement stats, author, subreddit, repo stars, publish date), and organizes it into projects. When you're ready, export a structured markdown package — one capture or an entire project — optimized for AI consumption.

### Supported platforms

- **X (Twitter)** — tweets, threads, and X Articles. Extracts engagement stats (likes, retweets, views), detects article vs. thread vs. single tweet.
- **Reddit** — posts and comments. Handles `/s/` share links, extracts subreddit, author, score, flair. Cloudflare Worker proxy for reliable extraction.
- **GitHub** — repositories and files. Extracts stars, forks, issues, language breakdown, topics, project structure, and README content.
- **Articles** — any URL. Extracts title, author, site name, publish date, and full article text via Open Graph + readability parsing.

### Key features

- **Platform-aware rendering** — each capture type gets its own metadata header and body renderer. GitHub repos show language color bars and topic pills. X Articles show engagement stats. Reddit posts show subreddit and flair badges. Tweets scale typography based on content length.
- **Duplicate detection** — instant inline feedback when you paste a URL that's already in a project. Same-project duplicates are blocked. Cross-project duplicates give you the choice.
- **Structured export** — "Package for Claude" generates clean markdown with platform metadata, context notes, and body content. Works for single captures or full projects. Built on a typed data layer (`ExportProject` / `ExportCapture`) ready for API consumption.
- **Context notes** — add your thinking to any capture. Why you saved it, what Claude should focus on. Exported as part of the package.
- **Shareable project links** — public URLs for any project or individual capture.
- **Chrome extension** — capture URLs from any tab without leaving the page.
- **PWA** — installable on iOS and Android.

## Stack

- **Frontend:** Next.js 16 + Tailwind CSS
- **Backend:** Supabase (Postgres + Auth + RLS)
- **Hosting:** Vercel
- **Extraction:** Server-side with Cloudflare Worker proxy for Reddit
- **Auth:** Google OAuth via Supabase

## Architecture

```
Chrome Extension / PWA / Web
        ↓
    /api/fetch-url (extraction + platform detection)
        ↓
    Supabase (captures + projects + RLS)
        ↓
    Platform-aware rendering (CaptureRenderer.tsx)
        ↓
    Structured export (buildExportData → renderExportAsMarkdown)
```

The codebase is organized around a few key patterns:

- **Platform switch** — `CaptureRenderer` uses `switch (capture.platform)` to route to platform-specific metadata headers and body renderers.
- **Accumulator-based extraction** — each extraction strategy enriches a shared `CaptureResult` rather than replacing prior output.
- **Skill files** — `.claude/skills/` contains specs that Claude Code reads before implementing. Design system, rendering system, extraction patterns, Supabase patterns.

## Development

```bash
git clone https://github.com/bildkeepsbilding/bild-curation-app.git
cd bild-curation-app
npm install
cp .env.example .env.local  # add your Supabase keys
npm run dev
```

## Built by

[Bild Brand Labs](https://bildbrandlab.com) — a builder-operator venture platform. Sift is one of several products built by Bild to solve real bottlenecks across its portfolio companies.

## License

MIT
