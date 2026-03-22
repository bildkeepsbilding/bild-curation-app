# Sift — Rendering System

## Core Principle: Render Like the Source, Not Like Markdown

The extraction layer understands what content is — a tweet, a GitHub README, a long-form article, a Reddit discussion. The rendering layer must honor that understanding. A tweet should feel like a tweet. A code repository should feel like documentation. A long article should feel like an article. The reader should know what they're looking at before they read a word.

The current state is a generic markdown renderer (`renderMarkdownBody`) that treats everything identically. This document governs the replacement: a platform-aware rendering system that uses the structured data already returned by the extraction layer.

---

## Architecture

### Single Component, Platform Switch

```
CaptureRenderer
  ├─ checks capture.platform
  ├─ renders CaptureMetadataHeader (platform-aware)
  └─ delegates body to:
      ├─ TweetBody
      ├─ ArticleBody (also handles X Articles)
      ├─ GitHubBody
      ├─ RedditBody
      └─ GenericBody (fallback)
```

**One component file.** `CaptureRenderer.tsx` lives in `src/components/` and exports a single component that takes a `Capture` object. The project detail page's `{viewing && ...}` block calls `<CaptureRenderer capture={viewing} />` instead of inline rendering. The public view (`/p/[id]/c/[captureId]`) uses the same component.

**Adding a new platform** means adding one renderer function inside this file and one case to the switch. No new files, no new routes, no new page templates.

### Data Available from Extraction

Every capture has these base fields:
- `platform`: 'twitter' | 'reddit' | 'github' | 'article'
- `title`: string
- `body`: string (the main extracted text)
- `author`: string
- `url`: string (original source URL)
- `images`: string[] (extracted image URLs)
- `note`: string | null (user's context note)
- `metadata`: object (platform-specific, see below)
- `content_tag`: string | null (content type tag)
- `createdAt`: string (capture timestamp)

Platform-specific metadata fields:

**Twitter (`platform: 'twitter'`):**
- `metadata.likes`: number
- `metadata.retweets`: number
- `metadata.replies`: number
- `metadata.views`: number | null
- `metadata.date`: string | null (tweet date)
- `metadata.isArticle`: boolean (X Article vs regular tweet)
- `metadata.isThreadRoot`: boolean
- `metadata.source`: string (extraction method used)
- `metadata.threadLength`: number (if thread)
- Body may contain `[image:URL]` markers for inline article images
- Body may contain `---` separators between thread tweets

**Reddit (`platform: 'reddit'`):**
- `metadata.subreddit`: string
- `metadata.score`: number
- `metadata.numComments`: number
- `metadata.flair`: string | null
- `metadata.permalink`: string
- `metadata.createdUtc`: number
- `metadata.extractionMethod`: string
- Body contains post text, then `---` separator, then "Top Comments:" section
- Comments are formatted as `u/author:\ncomment text`

**GitHub (`platform: 'github'`):**
- `metadata.stars`: number
- `metadata.forks`: number
- `metadata.issues`: number
- `metadata.language`: string | null
- `metadata.languages`: object (language breakdown)
- `metadata.topics`: string[]
- `metadata.createdAt`: string
- `metadata.updatedAt`: string
- `metadata.homepage`: string | null
- `metadata.filePath`: string (if capturing a specific file)
- Body contains: description, stats line, languages, topics, `---`, "Project Structure:" tree, `---`, "README:" content

**Article (`platform: 'article'`):**
- `metadata.description`: string | null
- `metadata.siteName`: string
- `metadata.publishedTime`: string | null
- `metadata.hasOgImage`: boolean

---

## Typography Scale

Not all content deserves the same text size. The scale is based on content length and type.

### Body Text Sizing

| Content type | Condition | Font size | Line height |
|---|---|---|---|
| Short tweet | body length < 200 chars, platform = twitter, not isArticle | 22px | 1.4 |
| Medium tweet | body length 200-500 chars, platform = twitter, not isArticle | 18px | 1.5 |
| Long tweet / note tweet | body length > 500 chars, platform = twitter, not isArticle | 16px | 1.65 |
| X Article | platform = twitter, isArticle = true | 17px | 1.75 |
| Reddit post body | platform = reddit | 16px | 1.7 |
| Reddit comments | Comment section below separator | 14px | 1.6 |
| GitHub README | platform = github, README section | 15px | 1.65 |
| GitHub code blocks | Fenced code in any platform | 13px | 1.5 |
| GitHub file tree | Project Structure section | 13px | 1.4 |
| Article body | platform = article | 17px | 1.75 |
| Generic/fallback | Any unrecognized platform | 16px | 1.7 |

### Title Sizing

Titles use the existing 28px/1.2 treatment. No change needed — it already works.

### Metadata Text

All metadata (author, date, engagement stats, platform badges) uses the existing system: `text-xs` (12px), `var(--text-tertiary)`, mono font for handles and technical details.

---

## Platform Metadata Headers

Each platform gets a purpose-built metadata header. The header sits between the title and the body, separated by a bottom border.

### Twitter Metadata Header
```
@handle · Mar 13 at 2:23 PM
♥ 5,471  ⟲ 359  👁 707K
```
- Author handle in mono font, linked to profile
- Date formatted as relative or absolute depending on age
- Engagement stats on second line, formatted with `formatCompact()`
- If `isArticle`: show "Article" badge in purple before handle
- If thread: show "Thread · N tweets" badge
- No platform badge needed — the rendering style makes it obvious

### GitHub Metadata Header
```
owner/repo · TypeScript
⭐ 2,340  🍴 186  📋 23 issues
Topics: ai, agent, framework
```
- Repo path in mono font, linked to repo
- Primary language with color dot
- Stats on second line with icons
- Topics as small pills if they exist
- If `filePath`: show file path breadcrumb instead of repo-level stats

### Article Metadata Header
```
The Verge · John Gruber · Mar 12, 2025
~8 min read
```
- Site name (from `metadata.siteName`) in semibold
- Author name
- Publish date (from `metadata.publishedTime`)
- Estimated read time: `Math.ceil(body.split(/\s+/).length / 238)` minutes
- No engagement stats (articles don't have them)

### Reddit Metadata Header
```
r/LocalLLaMA · Discussion · u/username
↑ 847 · 234 comments
```
- Subreddit linked, with flair badge if present
- Author in mono
- Score and comment count on second line
- If score is 0 (RSS extraction fallback), hide the score line

---

## Platform Body Renderers

### TweetBody

**X Article routing:** If `metadata.isArticle` is true, delegate to `ArticleBody` instead. X Articles have long-form body content with `[image:URL]` markers — structurally they are articles, not tweets, even though `platform` is 'twitter'. The `CaptureRenderer` switch should check `isArticle` before routing to `TweetBody`.

**Short tweets (< 200 chars):** Large quote-style text. No paragraph breaks. The tweet IS the content — give it presence.
- Font: 22px, weight 400, `var(--text-primary)`
- Feel: A pull quote. Confident. Centered energy without centering the text.

**Medium tweets (200-500 chars):** Slightly smaller but still larger than default.
- Font: 18px, weight 400, `var(--text-primary)`

**Long tweets / note tweets (> 500 chars):** Standard reading size with proper paragraph breaks.
- Font: 16px, weight 400, `var(--text-secondary)`
- Paragraph spacing: 1em between paragraphs

**Threads:** When body contains `---` separators (thread tweets):
- Each tweet segment gets its own visual block
- Subtle left border (platform color at 20% opacity) per tweet
- Tweet number shown as small counter: `1/N`, `2/N`, etc.
- Separator between tweets: thin horizontal rule + spacing

**Inline images** (`[image:URL]` markers): Render as full-width images between text blocks with rounded corners and subtle border. Same as current behavior but with proper spacing (24px vertical margin).

### GitHubBody

The body from GitHub extraction has a known structure with `---` separators:
1. Description + stats (already in metadata header — can be skipped or shown reduced)
2. `Project Structure:` section — the file tree
3. `README:` section — the actual README content

**File tree rendering:**
- Monospace font, 13px
- Contained in a collapsible section (collapsed by default if > 20 lines)
- Dark background block (`var(--bg)`) with subtle border
- Folder icons (📁) and file indentation preserved

**README rendering:**
- Full markdown support (headings, code blocks, lists, links, bold, images)
- Code blocks get language labels and monospace styling (already handled by `renderMarkdownBody`)
- Headings get proper hierarchy: h1→22px, h2→19px, h3→17px
- Images rendered inline with proper sizing

**File captures** (when `metadata.filePath` exists):
- Show file path as breadcrumb in metadata header
- Render entire file content as a code block with language detection from file extension
- Wrap in scrollable container

### ArticleBody

Articles get the cleanest reading experience — closest to a proper reader view.
- Body font: 17px, line-height 1.75
- Wider paragraph spacing (1.25em between paragraphs)
- Headings extracted from HTML are already converted to `#` markers by the extractor
- First paragraph can optionally be styled as a lede (slightly larger, `var(--text-primary)`)
- Inline images from OG/meta extraction shown as hero; article body images shown inline
- Links styled with accent color underline
- Blockquotes styled with left border + italic

### RedditBody

Reddit content has two distinct sections separated by `---\n\nTop Comments:`:

**Post body:**
- Standard rendering, 16px, `var(--text-secondary)`
- If the post is a "Link post" (body is just "(Link post)"), show the link prominently instead
- Markdown rendering for selftext (Reddit uses markdown natively)

**Comments section:**
- Visually separated: different background (`var(--bg)` or `var(--bg-elevated)`) with top border
- Section header: "Top Comments" in small caps, `var(--text-tertiary)`
- Each comment: author in mono (`u/name`), body text below at 14px
- Comments separated by subtle dividers
- Indent nested replies (if the extraction preserved reply depth)
- Score shown next to author if available
- **Parsing fallback:** The comment format (`u/author:\ncomment text`) varies between extraction methods (RSS vs OAuth vs search API). If comment parsing fails — no `u/` prefix found, or format is inconsistent — fall back to rendering the raw text below the `---` separator as a single styled block at 14px. Never crash or show empty space because of unparseable comments.

**Image handling:**
- Reddit gallery images get a horizontal scroll carousel or 2-column grid
- Single images render full-width like other platforms

### GenericBody (Fallback)

For any unrecognized platform or edge cases:
- Use the existing `renderMarkdownBody` function as-is
- 16px, line-height 1.7, `var(--text-secondary)`
- This ensures nothing breaks if a new platform is partially added

---

## Shared Elements

### Hero Image
All platforms share the same hero image treatment:
- Full-bleed above the reading column (already implemented)
- Max height 320px, `object-fit: cover`
- Skip if body contains `[image:URL]` markers (article with inline images)
- **GitHub: skip hero image entirely.** The extraction layer returns the repo owner's avatar in `images[]` — this is not useful as a hero. Implement this as a platform-level check in `CaptureRenderer` (don't render the hero image block when `platform === 'github'`), not as a CSS visibility hack. The image data can still exist in the capture — the renderer just doesn't display it.

### Context for Claude Block
The "Context for Claude" section at the bottom of every capture detail remains unchanged. It's platform-agnostic — the user's note is the user's note regardless of source.

### View Original Link
The "View original" link at the bottom remains unchanged. Works for all platforms.

### Inline Markdown Rendering
The existing `renderMarkdownLine` function (bold, code, links, headers, lists, blockquotes, horizontal rules) is reused by all platform renderers for their text content. Platform renderers don't reimplement markdown — they wrap `renderMarkdownBody` with platform-specific structure and typography.

---

## Implementation Staging

### Session 1: Metadata Header Component
- Extract the metadata rendering from the inline `{viewing && ...}` block
- Build `CaptureMetadataHeader` component with platform switch
- Each platform gets its own header layout using existing metadata fields
- Replace the current generic flex-wrap metadata row everywhere (project detail + public view)
- No body rendering changes — body stays as-is

### Session 2: Typography Scale + Tweet Renderer
- Introduce body font sizing based on platform and content length
- Build `TweetBody` component with short/medium/long/thread handling
- Thread tweet segmentation (split on `---`, render as numbered blocks)
- Wire into `CaptureRenderer` switch for `platform: 'twitter'`

### Session 3: Article + GitHub Renderers
- Build `ArticleBody` with reader-view typography and lede paragraph
- Build `GitHubBody` with file tree collapsible and README section
- Wire both into the platform switch

### Session 4: Reddit Renderer
- Build `RedditBody` with post/comments split
- Comment section styling (background change, author formatting, dividers)
- Image gallery treatment for multi-image Reddit posts
- Wire into platform switch

---

## Constraints

- All rendering uses CSS custom properties from the design system. No hardcoded colors.
- All rendering respects the accent discipline: no accent yellow in content rendering. Accent is only for AI-trail elements.
- Platform colors are used only in metadata badges, not in body text or backgrounds.
- The `CaptureRenderer` component must work in both authenticated (project detail) and public (shared view) contexts.
- Mobile-first: all layouts must work at 360px viewport width. No horizontal overflow.
- Images use `referrerPolicy="no-referrer"` and `onError` hide-on-fail patterns (already established).
- Body text uses `var(--text-secondary)` as default. Only short tweets and first-paragraph ledes use `var(--text-primary)`.
- **Data layer decoupling:** The `CaptureRenderer` must not import or depend on any Supabase client, auth context, or data fetching logic. It receives a fully-hydrated `Capture` object as props. All data fetching stays in the page component. This prevents coupling between the rendering layer and the data layer — the renderer is a pure display component.
