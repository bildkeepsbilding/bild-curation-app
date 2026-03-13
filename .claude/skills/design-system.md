# Sift Design System

## Color Palette (CSS Custom Properties)
All colors are defined in `src/app/globals.css` as CSS variables. NEVER hardcode hex values — always use `var(--name)`.

```css
--bg: #0a0a0b;              /* Page background */
--bg-elevated: #141416;      /* Cards, modals, elevated surfaces */
--bg-hover: #1c1c1f;         /* Hover states, Unsorted tray background */
--border: #2a2a2d;           /* Default borders */
--border-subtle: #1e1e21;    /* Subtle dividers */
--text-primary: #f0f0f0;     /* Headings, primary text */
--text-secondary: #8a8a8e;   /* Body text, descriptions, summary lines */
--text-tertiary: #5a5a5e;    /* Labels, timestamps, placeholders, metadata */
--accent: #e8ff47;           /* AI-facing actions ONLY — see Accent Discipline below */
--accent-dim: #e8ff4720;     /* Accent at 12% opacity — Context for Claude backgrounds */
--danger: #ff4747;           /* Delete, errors */
--danger-dim: #ff474720;     /* Danger at 12% opacity */
```

## Accent Color Discipline
The accent yellow (#e8ff47) traces the path toward AI output. If an element doesn't lead to Claude, it doesn't get the accent.

**YES — accent yellow:**
- "Package for Claude" button
- "Sift it" button (extension and share page)
- "Context for Claude" field borders and labels
- Context note left-border on capture cards
- Unsorted count badge (when non-zero)
- "Capture" button on project detail page

**NO — neutral styling:**
- "New Project" button → border style (var(--border) border, var(--text-primary) text, transparent background)
- "Create" button in New Project modal → neutral border style, not accent filled
- "PROJECT BRIEF" label → neutral (var(--text-secondary)), not accent. The user writes a brief to orient themselves, not to address Claude. It becomes a Claude export header as a system behavior, not user intent.
- Navigation elements, back buttons, chevrons
- "Copy link", "Shared" toggle, "Share" button
- Section headers, search bar, filter tabs
- Settings, sign out, general UI controls

## Typography
- **Primary font:** 'DM Sans', sans-serif — body, headings, UI
- **Mono font:** 'JetBrains Mono', monospace — metadata, timestamps, technical details, author handles
- Both loaded via Google Fonts in globals.css
- **Body line-height:** 1.5-1.6 for comfortable reading
- **Title truncation:** `line-clamp-2` on capture card titles
- **Body truncation:** `line-clamp-2` on capture card body previews

## Dashboard Layout (Home Page)
The dashboard is a library, not a control panel. It's for orientation — "where is my knowledge?" — not data entry.

### Structure (top to bottom)
1. **Header:** "Sift" logo + "X projects · Y captures" subtitle | "New Project" (neutral border button) + user avatar
2. **Unsorted Tray:** System element, not a project card (see below)
3. **Search Bar:** Quiet utility — small text (13px), transparent background, subtle border
4. **"View all captures":** Link with total count
5. **Project List:** Single-column, text-forward cards

### No Quick Capture on Dashboard
Capture happens via the Chrome extension or inside a project page. The dashboard has no URL input bar.

## Unsorted Tray
Unsorted is the only collection the user didn't intentionally create. It's a system element, visually distinct from the project grid.

- **Background:** `var(--bg-hover)` — different from both page background and card backgrounds
- **Layout:** Horizontal bar, full-width within max-width container
- **Left side:** Collapse chevron toggle + "Unsorted" label + count badge (accent when non-zero, muted when empty) + latest capture title preview
- **Right side:** "Review >" link
- **Collapsible:** Clicking chevron collapses to just label + count
- **Empty state:** "Captures waiting to be sorted will appear here" in dimmed text
- **Communicates:** "These are captures waiting for you to decide where they belong"

## Project Cards (Dashboard)
Text-forward research folders. Library spines, not media cards.

- **Layout:** Single-column list with 8px gap
- **Left border:** 3px accent stripe using name-hashed gradient (`nameToGradient(name)` → HSL values)
- **Content:**
  - Project name: bold, var(--text-primary)
  - Summary line: first line of project brief, OR latest capture title, OR "No captures yet" (muted)
  - Metadata: capture count + colored platform dots (inline, small) + relative date
- **Right side:** Chevron indicator, delete button on hover
- **Max-width:** 3xl for focused reading
- **No hero images** on dashboard project cards

## Capture Cards (Project Detail and Public Views)
Cards are the primary unit of display inside projects. Each card represents a captured thought.

### With Hero Image
- Background: `var(--bg-elevated)` with `border: 1px solid var(--border-subtle)`
- Rounded corners: `border-radius: 12px`, overflow hidden
- Hero image area: 120px height with dark gradient overlay
- OG Image Priority: Article cards only show hero images when `metadata.hasOgImage` is true. If only inline scraped images exist, fall back to platform gradient.

### Without Hero Image (Platform Gradient)
```
Reddit:  linear-gradient(135deg, #ff4500 0%, #ff6b35 50%, #ff8c42 100%)
Twitter: linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 50%, #0d7ec5 100%)
GitHub:  linear-gradient(135deg, #6e40c9 0%, #8957e5 50%, #a371f7 100%)
Article: linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)
Other:   linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%)
```
- Semi-transparent platform icon watermark at 8% opacity
- Engagement stats in large bold white text when available
- Platform badge with frosted glass effect

### Context Note Display on Cards
- 2px accent-colored left border + italic text in var(--text-secondary) at 70% opacity
- On public views: labeled "Curator's note"
- Represents the human's voice — must never be confused with extracted content

### Card Interactions
- Hover: `scale(1.02)` + deeper box-shadow (desktop only)
- Transitions: 0.25s cubic-bezier(0.4, 0, 0.2, 1)
- Grid: 2-column on desktop (768px+), single column mobile

## Context for Claude Input
Sift's signature interaction. The most important input in the product.

### On Project Detail Page
- Positioned ABOVE the URL capture bar
- Warm accent background (rgba(232, 255, 71, 0.04))
- Accent border that glows on focus
- Label: "CONTEXT FOR CLAUDE" in accent color with pencil icon
- Placeholder: "Why are you saving this? What should Claude focus on?"

### In Chrome Extension
- Dominant element — above project selector, 4 rows
- Accent border, accent label
- Placeholder: "Why are you saving this? What should Claude focus on?"

## Public Shared Views

### Project View (/p/[id])
- "S" icon + "CURATED COLLECTION" header
- Large project title (36px), brief below, platform pills
- Generous card spacing, context notes visible
- Footer: "Curated with **Sift**" + "Start curating →" CTA

### Individual Capture View (/p/[id]/c/[captureId])
- Full-width focused layout with generous reading typography
- "Curator's note" section with accent left border
- "FROM THIS COLLECTION" card linking back
- "Curated with **Sift**" footer

## PWA
- Manifest at /public/manifest.json with share_target
- Service worker at /public/sw.js
- Icons: Yellow "S" on dark background (192px, 512px)
- /share route for mobile capture
- Install prompt on mobile after 2nd visit

## Animations
- Shimmer skeleton for loading states
- Fade up (0.3s ease-out) with stagger for lists
- Optimistic pulse for loading capture cards
- Toast slide-up from bottom-center
- Card hover: scale(1.02) with box-shadow, cubic-bezier easing

## Responsive Breakpoints
- Mobile: default (full-width, single column)
- Tablet: 640px (sm)
- Desktop: 768px (md) — 2-column capture grid, hover effects
- Large: 1024px (lg)

## Dark Theme
Sift is dark-theme only. No light mode. All UI uses CSS variables. Never use white backgrounds or light-theme colors.
