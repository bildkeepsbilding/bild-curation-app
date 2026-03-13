# Sift Design System

## Color Palette (CSS Custom Properties)
All colors are defined in `src/app/globals.css` as CSS variables. NEVER hardcode hex values — always use `var(--name)`.

```css
--bg: #0a0a0b;              /* Page background */
--bg-elevated: #141416;      /* Cards, modals, elevated surfaces */
--bg-hover: #1c1c1f;         /* Hover states on elevated surfaces */
--border: #2a2a2d;           /* Default borders */
--border-subtle: #1e1e21;    /* Subtle dividers */
--text-primary: #f0f0f0;     /* Headings, primary text */
--text-secondary: #8a8a8e;   /* Body text, descriptions */
--text-tertiary: #5a5a5e;    /* Labels, timestamps, placeholders */
--accent: #e8ff47;           /* Primary accent — buttons, highlights, Sift yellow */
--accent-dim: #e8ff4720;     /* Accent at 12% opacity — subtle backgrounds */
--danger: #ff4747;           /* Delete, errors */
--danger-dim: #ff474720;     /* Danger at 12% opacity */
```

## Typography
- **Primary font:** 'DM Sans', sans-serif (body, headings, UI)
- **Mono font:** 'JetBrains Mono', monospace (code, metadata, timestamps)
- Both loaded via Google Fonts in globals.css

## Platform Gradient Backgrounds
Used on capture cards when no hero image is available. Defined inline in components:

```
Reddit:  linear-gradient(135deg, #ff4500 0%, #ff6b35 50%, #ff8c42 100%)
Twitter: linear-gradient(135deg, #1d9bf0 0%, #1a8cd8 50%, #0d7ec5 100%)
GitHub:  linear-gradient(135deg, #6e40c9 0%, #8957e5 50%, #a371f7 100%)
Article: linear-gradient(135deg, #10b981 0%, #34d399 50%, #6ee7b7 100%)
Other:   linear-gradient(135deg, #6b7280 0%, #9ca3af 50%, #d1d5db 100%)
```

Each gradient card also shows:
- A semi-transparent platform icon watermark at 8% opacity (centered, large)
- Engagement stats in large bold white text (e.g., "306.9K stars · 58.1K forks")
- Platform badge with frosted glass effect (top-left)

## Card Components

### Capture Card (`.capture-card`)
- Background: `var(--bg-elevated)` with `border: 1px solid var(--border-subtle)`
- Rounded corners: `border-radius: 12px` (rounded-xl)
- Overflow hidden for hero images
- Hover: `scale(1.02)` + deeper box-shadow (desktop only, via `@media (min-width: 768px)`)
- Hero image area: 120px height with dark gradient overlay: `linear-gradient(to bottom, var(--bg-elevated), rgba(0,0,0,0.4), rgba(0,0,0,0.15))`
- Title: `line-clamp-2`, font-semibold, var(--text-primary)
- Body preview: `line-clamp-2`, text-sm, var(--text-secondary)
- Author + date: text-xs, var(--text-tertiary), font-mono
- Context note: pencil icon + muted text at 70% opacity, var(--text-tertiary)

### OG Image Priority
Article cards only show hero images when `metadata.hasOgImage` is true (og:image, twitter:image, or JSON-LD image was found). If only inline scraped images exist (like a resume screenshot), fall back to the platform gradient instead.

### Project Card (`.project-card-hero`)
- 200px min-height
- Shows first capture's image as background, or dark grey with placeholder icon
- Project name, capture count, latest capture preview
- Platform dots (colored circles indicating which platforms are in the project)

### Unsorted Card (`.unsorted-card`)
- Special treatment: accent-dim border + subtle gradient background
- Always appears above project grid on home page

## Grid Layouts
```css
.capture-grid: 1 column mobile → 2 columns at 768px, gap 16px/20px
.project-grid: 1 column mobile → 2 at 640px → 3 at 1024px, gap 16px/20px
```

## Animations
- **Shimmer skeleton:** `background-size: 800px`, sweeping gradient animation for loading states
- **Fade up:** `fadeUp` — opacity 0→1, translateY 8→0, 0.3s ease-out
- **Stagger children:** Sequential fade-up with 50ms delay between items
- **Optimistic pulse:** Gentle opacity pulse (0.6→1) for loading capture cards
- **Toast:** Slide up from bottom-center
- **Delete:** Scale down + fade out, pointer-events none

## Skeleton Loaders
Used on home page and project detail while data loads from Supabase. Skeletons match the exact layout of real content: capture input bar, filter tabs, card grid with correct dimensions.

## Responsive Breakpoints
- Mobile: default (full-width, single column)
- Tablet: 640px (sm) — 2-column project grid
- Desktop: 768px (md) — 2-column capture grid, hover effects enabled
- Large: 1024px (lg) — 3-column project grid

## Dark Theme
Sift is dark-theme only. There is no light mode. All UI must use the CSS variables above. Never use white backgrounds, light greys, or colors that assume a light theme.
