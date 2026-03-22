# Sift URL Extraction Patterns

## Overview
All URL extraction happens in `src/app/api/fetch-url/route.ts`. The POST handler receives `{ url: string }`, detects the platform, and returns structured content. The GET handler is a debug endpoint for Reddit extraction testing.

## Platform Detection
```typescript
if (url.includes('reddit.com') || url.includes('redd.it')) → fetchReddit(url)
if (url.includes('twitter.com') || url.includes('x.com')) → fetchTwitter(url)
if (url.includes('github.com')) → fetchGitHub(url)
else → fetchArticle(url)  // Generic article extractor
```

## Return Format
All extractors return the same shape:
```typescript
{
  platform: Platform,
  title: string,
  body: string,       // Full extracted text content
  author: string,
  images: string[],   // Array of image URLs
  metadata: {         // Platform-specific metadata
    // Reddit: subreddit, score, numComments, flair, extractionMethod
    // Twitter: likes, retweets, replies, views, isArticle, source
    // GitHub: stars, forks, issues, language, topics, languages
    // Article: description, siteName, publishedTime, hasOgImage
  }
}
```

## Reddit Extraction
Multi-strategy cascade (tries each in order until one succeeds):

1. **Search API** (`reddit.com/api/info.json`) — Most reliable on Vercel, not IP-blocked
2. **RSS Feed** (`.rss` endpoint) — No auth needed, includes images and comments
3. **Reddit OAuth** (`oauth.reddit.com`) — Requires REDDIT_CLIENT_ID + SECRET env vars
4. **www.reddit.com .json** — Works locally, often blocked on Vercel cloud IPs
5. **old.reddit.com HTML** — Scrapes the old Reddit interface
6. **old.reddit.com .json** — Alternative JSON endpoint

**Image extraction** is complex — Reddit strips image data in cloud IP responses. The `extractRedditImages()` function checks: gallery metadata, preview images, direct URLs, video thumbnails, crosspost parents, and inline selftext images. If API returns zero images, it falls back to RSS for images.

**Comments** are extracted via RSS or JSON, nested up to 3 levels deep, excluding AutoModerator.

## X/Twitter Extraction
Multi-strategy cascade:

1. **FxTwitter API** (`api.fxtwitter.com`) — Free, handles regular tweets, note tweets, and X Articles
2. **Syndication API** (`cdn.syndication.twimg.com`) — Free, may have article/note content
3. **Apify tweet scraper** — Costs credits, fallback only when no body extracted
4. **oEmbed** (`publish.twitter.com`) — Last resort, always returns something

**Thread expansion:** Before single-tweet extraction, attempts backward-walk via `replying_to_status` to find full self-threads (same author replying to themselves). Returns chronological order with `---` separators.

**X Articles:** Detected via `twitter_card === 'article'` or `tweet.article` field. Full content extracted from `article.content.blocks` with interleaved text and `[image:URL]` markers. Entity map resolves atomic blocks to media URLs.

## GitHub Extraction
Two modes based on URL:

**Repository** (`github.com/owner/repo`):
- Fetches in parallel: repo info, README, file tree, language breakdown
- README is fetched via API then decoded from base64 (with raw URL fallback for large files)
- File tree is compact listing with 📁/file icons, limited to 200 entries
- Language breakdown shows percentage distribution

**Specific file** (`github.com/owner/repo/blob/ref/path`):
- Fetches file content + repo metadata
- Handles base64 decoding with raw fallback for large files

## Article Extraction
Generic extractor for Medium, Substack, Ghost, WordPress, and general blogs:

1. Fetches HTML with browser-like User-Agent
2. Extracts OG/meta tags: og:title, og:description, og:image, twitter:image, author
3. Parses JSON-LD structured data for author, date, image
4. Extracts article content via platform-specific CSS selectors:
   - Substack: `.body.markup`, `.available-content`, `.post-content`
   - Medium: `<article>`, `section[data-testid="post-sections"]`
   - Ghost: `.gh-content`, `.post-content`
   - WordPress: `.entry-content`, `.post-body`
   - Fallbacks: `<article>`, `<main>`
5. Preserves headings as markdown (h1→#, h2→##, h3→###)
6. Strips navigation remnants (blocks < 20 chars)

**Image priority:** `og:image` → `twitter:image` → JSON-LD image → inline images (filtered for size > 100px, excluding avatars/icons/tracking pixels). The `hasOgImage` flag in metadata tells the frontend whether to show the image or fall back to platform gradient.

**Relative URL resolution:** All image URLs are resolved to absolute using the page URL as base.

## CORS Headers
The fetch-url endpoint includes CORS headers (`Access-Control-Allow-Origin: *`) for Chrome extension requests. OPTIONS preflight handler is also implemented.

## Error Handling
- Reddit: Falls through all strategies, throws with combined error messages if all fail
- Twitter: Falls through strategies, throws if no body text extracted from any source
- GitHub: Throws on HTTP errors with status code
- Article: Throws if extracted body < 50 chars ("page may require JavaScript or authentication")

## Adding a New Platform
1. Add detection in the POST handler's platform routing
2. Create a `fetchNewPlatform(url)` function following the same return format
3. Add the platform to the `Platform` type in `db.ts`
4. Add platform gradient colors in the design system
5. Add content tag detection in `detectContentTag()`
6. Add engagement formatting in `formatEngagement()`
