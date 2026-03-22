# Sift — Technical Debt Register

This document names known architectural debt, the recommended resolution pattern for each, and the trigger point at which it becomes urgent. It exists so future build sessions don't rediscover these constraints.

Debt is not the same as bugs. These are deliberate trade-offs made for shipping velocity that will need revisiting as the product grows.

---

## 1. Extraction Layer Fragility

**What it is:** The `src/app/api/fetch-url/route.ts` file contains inline fallback chains for each platform — six strategies for Reddit, four for Twitter, multiple content selectors for articles. Each strategy returns slightly different data shapes. The fallback logic is deeply nested try/catch blocks with inline data merging.

**Why it exists:** Each platform's public APIs and surfaces are unreliable in different ways. Reddit blocks cloud IPs, Twitter deprecated their free API, article HTML structures vary wildly. The fallbacks are survival code that keeps extraction working.

**Why it's debt:** Adding a new fallback strategy or removing a broken one requires editing a deeply nested chain. Data shape merging logic is scattered across each fallback's error handling rather than centralized. When a platform changes their API, debugging means reading through hundreds of lines of interleaved strategies.

**Resolution pattern:** Accumulator-based progressive enrichment pipeline.

```
interface CaptureResult {
  title?: string;
  body?: string;
  author?: string;
  images?: string[];
  metadata?: Record<string, unknown>;
}

interface ExtractionStrategy {
  name: string;
  canProvide: (keyof CaptureResult)[];
  enrich(url: string, partial: CaptureResult): Promise<CaptureResult>;
}
```

Each strategy declares what fields it can provide. An orchestrator iterates through an ordered list of strategies, invoking each one only if the accumulator still has gaps the strategy can fill. Data merging lives in the accumulator's merge function, not in each strategy's error handling. Adding or removing a strategy means editing a list, not refactoring a try/catch tree.

**Trigger point:** When the extraction layer next breaks — a platform changes their API, a strategy stops working, or a new platform needs adding. Don't refactor proactively. Do it when you're already in the file fixing something.

---

## 2. Serverless Timeout Constraint

**What it is:** All extraction runs as Vercel serverless functions via Next.js API routes. Currently `maxDuration = 60` on the fetch-url route. As extraction becomes heavier (YouTube transcripts, Reddit OAuth with full comment trees, future multi-step pipelines), these functions will hit timeout and cold-start limits.

**Why it exists:** Single Next.js app deployed on Vercel is the fastest path to shipping. No separate backend, no infrastructure to manage, Claude Code can navigate the entire codebase in one repo.

**Why it's debt:** Serverless functions are time-limited and cold-start-prone. Heavy extraction work (multiple HTTP calls, HTML parsing, timeout handling per fallback) wants a persistent process or a queue, not a function that might be killed mid-execution.

**Resolution pattern:** Supabase-native job table.

```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',  -- pending, processing, completed, failed
  type text not null,                       -- 'extraction', 'youtube_transcript', etc.
  payload jsonb not null,                   -- { url, projectId, userId }
  result jsonb,                             -- extraction result when completed
  error text,                               -- error message if failed
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

A Supabase Edge Function (longer timeout than Vercel) polls or gets triggered by Postgres NOTIFY, picks up pending jobs, runs extraction, writes results back. Frontend inserts a row and either polls the status on a short interval or subscribes via Supabase Realtime.

**When to upgrade beyond job table:** When you need concurrency control (multiple heavy jobs competing), retry with exponential backoff, or job chaining (extract → summarize → notify). That's the point where Inngest or Trigger.dev becomes worth the infrastructure overhead. The likely trigger is Phase B Collection Intelligence, which requires multi-step pipelines with LLM calls.

**Trigger point:** Before YouTube transcript extraction ships. That's the first extraction type that will reliably exceed comfortable serverless execution times.

---

## 3. Chrome Extension Auth — Custom Security Surface

**What it is:** The Chrome extension authenticates via a custom token-exchange flow using a short-lived bridge page (`/extension-bridge`). The extension opens the bridge page, which exchanges a Supabase session token between the web app and the extension context.

**Why it exists:** Chrome extensions can't participate in standard OAuth redirect flows the way web apps can. The bridge page pattern is a pragmatic solution that works within Chrome's extension security model.

**Why it's debt:** It's a bespoke auth mechanism with no community review or battle-tested library backing it. The attack surface is the bridge page's lifetime and the token's scope. With two beta testers, the risk is proportional to the exposure — near zero. With public users and a Chrome Web Store listing, it becomes a real security surface.

**Resolution pattern:** Before the Chrome Web Store listing (v2.0), this flow needs:
- Documentation of the exact token lifecycle (creation, exchange, expiry, revocation)
- A security review focused on: Can a malicious page trigger the bridge? Is the token scoped correctly? What happens if the bridge page is left open?
- Evaluation of whether a standard library (like Chrome's `identity` API with Supabase's OAuth) can replace the custom flow

**Trigger point:** Hard prerequisite before Chrome Web Store listing. Not a current blocker for v1.5 development.

---

## 4. Supabase as Single Provider Coupling

**What it is:** Supabase handles auth (Google OAuth), database (PostgreSQL), row-level security, real-time subscriptions, and will handle Edge Functions for the job table. The entire backend is one provider's abstractions.

**Why it exists:** Correct trade-off for a solo builder shipping fast. Minimizes infrastructure decisions, keeps the stack learnable, and Claude Code can reason about one backend system instead of five.

**Why it's debt:** Debugging RLS edge cases, auth flow limitations, or real-time subscription limits means debugging Supabase internals rather than your own logic. Adding a second auth provider (Reddit OAuth) means managing multiple OAuth flows through Supabase's auth layer.

**Resolution pattern:** No action needed now. The coupling is a feature at this stage, not a bug. Awareness is the resolution — when you hit a wall where Supabase's abstraction doesn't fit (a custom auth flow, a query pattern RLS can't express, a real-time need that exceeds subscription limits), that's the signal to evaluate extracting that specific concern into its own service.

**Trigger point:** When a specific Supabase limitation blocks a feature you're trying to ship. Not before.

---

## Review Cadence

This document should be checked during the biweekly instruction review (next due ~March 27, 2026). The review questions are:

- Has any debt item become urgent since the last review?
- Has any trigger point been hit?
- Has new debt been introduced that should be named here?
- Has any debt been resolved and should be removed?

---

*Source: Technical stack review with external technical advisor, March 13, 2026. Patterns and trigger points validated collaboratively.*
