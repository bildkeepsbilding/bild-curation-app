# Sift — Design Bible

## Design Philosophy

### Core Principle: Curation is Thinking
Every interaction in Sift should feel like the user is making a meaning-connection, not filing paperwork. When someone saves a URL and adds context, they are performing an act of thought — articulating why this matters, how it connects, what it means for their work. The design must honor this by making the capture moment feel intentional, focused, and valuable.

### The Intent Hierarchy
Sift's unique advantage is that humans provide intent alongside content. The design system must preserve and elevate intent at every layer:

1. **User's context note** — The most important piece of information in any capture. It represents why this was saved and what the AI should focus on. It should never be visually subordinate to extracted metadata.
2. **Project framing** — The project name and brief establish the lens through which captures should be understood. A link about "AI agents" means different things in a "Security Research" project versus a "Product Ideas" project.
3. **Extracted content** — The title, body, images, engagement stats. Important but secondary to human intent.
4. **System metadata** — Platform, date, content type. Useful but quiet.

### Partnership, Not Automation
Sift sits between two failure modes:
- **Pure manual filing** (Notion's trap) — too much organizational burden, users abandon it
- **Pure AI organization** (Mem's trap) — users feel they've lost agency over their own knowledge

Sift's design must communicate partnership: the human decides structure (projects, context notes, what to save), the AI enriches (extraction, formatting, connections, export quality). Neither side dominates. The interface should make it clear what the human chose versus what the system inferred.

### Ambient Intelligence
Inspired by Apple Notes + Apple Intelligence: AI capabilities should feel ambient, not performative. Don't shout about AI features. The intelligence is felt in outcomes (better Claude responses, surfaced connections) not in UI chrome (sparkle icons, "AI-powered" badges, animated processing indicators). When the AI does something, show the result quietly. When it suggests something, present it as a gentle offer, not an assertion.

### Trust Through Transparency
Inspired by Perplexity: when the AI makes a connection or suggestion, show the reasoning. The pattern is: claim → source → depth.
- "These captures are related" → show which specific content overlaps → let the user explore
- "This project covers X themes" → show which captures led to that assessment → let the user correct

Never present AI conclusions without a path back to the evidence.

---

## Visual Language

### Spatial Model
Inspired by Are.na's channels-within-channels: Sift's information architecture should feel spatial, not hierarchical. Projects are spaces, not folders. Captures are placed in spaces, not filed into categories. The visual language should reinforce this — think gallery walls, not spreadsheet rows.

### Typography
- **Primary:** DM Sans — warm, readable, slightly humanist sans-serif. Not cold or technical.
- **Mono:** JetBrains Mono — for metadata, timestamps, technical details. Creates contrast between human content (DM Sans) and system content (mono).
- **Type scale should breathe.** Generous line-height (1.5-1.6 for body). Titles should have presence without shouting. Body text should be comfortable to read, not compressed.

### Color Philosophy
- **Background:** Near-black (#0a0a0b) — not pure black, which feels harsh. The slight warmth prevents the "void" feeling.
- **Surfaces:** Elevated backgrounds (#141416) should feel like they float above the page, not sit on it. Subtle, not dramatic.
- **Accent yellow (#e8ff47):** Used sparingly. It marks human action points — buttons the user clicks, inputs the user fills, states the user controls. It should never appear on system-generated elements.
- **Text hierarchy:** Three tiers only. Primary (#f0f0f0) for content the user should read. Secondary (#8a8a8e) for supporting context. Tertiary (#5a5a5e) for metadata that's there if you need it.
- **Platform colors (gradients):** These are information, not decoration. Reddit is red-orange. X is blue. GitHub is purple. Article is green. Users should be able to scan a grid and know the platform mix at a glance without reading labels.

### Card Design Principles
Cards are the primary unit of display. Each card represents a captured thought.

- **Cards should have visual weight proportional to their richness.** A capture with a hero image, engagement stats, and a context note should feel more substantial than a bare URL with no extracted content.
- **The hero image is context, not decoration.** If an image doesn't add understanding (like a random inline screenshot), use the platform gradient instead. Quality over presence.
- **Engagement stats are credibility signals.** 306K stars or 80K views tells the user "this source is significant." Display them prominently when they exist, but don't fabricate visual weight when they don't.
- **The context note is the human's voice.** It should be visually distinct from extracted content — it's the one thing in the card that came from the user's mind, not the internet. Subtle but never invisible.

### Motion and Interaction
- **Hover states should invite, not surprise.** Gentle scale (1.02) and shadow increase. The user should feel the card lifting toward them, not jumping.
- **Transitions should be quick but not instant.** 200-300ms with ease-out curves. The interface should feel responsive but not twitchy.
- **Loading states should match the layout.** Skeleton loaders that mirror the exact dimensions of real content. The user's mental model of the page should be established before data arrives.
- **Captures should appear optimistically.** When the user clicks "Sift it," the card appears immediately with a shimmer state. The message is: your action was received, we're enriching it now.

### Information Density
- **Home page:** Low density. Project cards with generous spacing. This is a dashboard, not a data table. The user should feel calm looking at it, not overwhelmed.
- **Project detail page:** Medium density. Capture cards in a 2-column grid. Enough to scan quickly, not so tight that cards lose individual identity.
- **Capture detail view:** Full focus. Single capture, full content, generous reading typography. This is where the user engages deeply with a single piece of captured knowledge.
- **Public shared view:** Showcase density. Slightly more generous than the private view. This is a curated exhibition, not a working environment.

### Empty States
Empty states are not errors — they're invitations. Every empty project should communicate possibility, not absence.
- "No captures yet" should feel like a blank canvas, not a missing-data warning.
- Placeholder icons should be warm and intentional, not generic grey boxes.
- The first-capture prompt should be specific and actionable: "Paste any URL — Reddit, X, GitHub, articles..."

---

## Interaction Patterns

### The Capture Moment
This is Sift's most important interaction. It should feel like placing a thought into a space.

1. User pastes URL → immediate visual acknowledgment (the input responds)
2. Click "Capture" or "Sift it" → optimistic card appears with shimmer
3. Content loads → card fills in smoothly, image fades in
4. If the user added a context note → it appears as part of the card, affirming their contribution

The entire flow should take < 3 seconds of perceived time.

### The Context Note
The "Context for Claude" input is Sift's signature interaction — the thing no other tool has.

- It should be visually elevated: subtle accent border, placeholder text that inspires ("Why are you saving this? What should Claude focus on?")
- It should feel optional but rewarding: captures work without notes, but captures with notes should feel richer, more complete
- In the extension popup, the context note should be the dominant input — larger than the project selector, positioned where the thumb naturally rests on mobile

### Navigation
- Back navigation should always work predictably. Projects → Home. Captures → Project. Never trap the user.
- The project selector (in extension and capture flow) should show recent/frequent projects first, not alphabetical
- Search should feel instant — filter as you type, no submit button needed

### Sharing
- Sharing a project should feel like opening a gallery, not publishing a document
- The public view should be aspirational — when someone visits a shared project, they should want to create their own
- Individual capture shares should feel like sharing a specific insight, with a path back to the full collection

---

## Anti-Patterns (What Sift Should Never Do)

- **Never use "AI-powered" or sparkle emojis in the UI.** The AI is felt, not labeled.
- **Never auto-organize without the user's consent.** Suggestions are offers, not actions.
- **Never hide the user's context note behind metadata.** Human intent is primary.
- **Never use pure white or light backgrounds.** Sift is dark-theme only. The dark background recedes and lets the content breathe.
- **Never use generic stock imagery or illustrations.** Every visual element should be functional or absent.
- **Never show an empty state without an actionable prompt.** If there's nothing to show, tell the user exactly what to do next.
- **Never make the export feel like an afterthought.** "Package for Claude" is the product's payoff moment. It should feel like completing a meaningful task, not clicking a download button.

---

## Design References
- **Are.na** — Curation as thinking, spatial not hierarchical, blocks as meaning-connections
- **Readwise/Reader** — Human reading behavior → structured knowledge output pipeline
- **Apple Notes + Apple Intelligence** — Ambient AI, not intrusive. Intent gap to exploit.
- **Mem** — Self-organizing notes. Study where AI organization lost user agency.
- **Perplexity** — Claim → source → depth. Trust through transparency in AI reasoning.

The through-line question for every design decision: **Where does the human's intent get preserved versus lost in the system?**
