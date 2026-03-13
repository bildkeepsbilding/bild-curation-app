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
AI capabilities should feel ambient, not performative. Don't shout about AI features. The intelligence is felt in outcomes (better Claude responses, surfaced connections) not in UI chrome (sparkle icons, "AI-powered" badges, animated processing indicators). When the AI does something, show the result quietly. When it suggests something, present it as a gentle offer, not an assertion.

### Trust Through Transparency
When the AI makes a connection or suggestion, show the reasoning. The pattern is: claim → source → depth.
- "These captures are related" → show which specific content overlaps → let the user explore
- "This project covers X themes" → show which captures led to that assessment → let the user correct

Never present AI conclusions without a path back to the evidence.

---

## Visual Language

### Spatial Model
Sift's information architecture should feel spatial, not hierarchical. Projects are spaces, not folders. Captures are placed in spaces, not filed into categories. The dashboard is a library — you orient yourself and choose which room to enter.

### The Dashboard as Library
The home page is for orientation — "where is my knowledge?" — not for data entry. No capture inputs on the dashboard. The user arrives, sees their projects as a scannable list, and chooses where to go. The Unsorted tray sits above as a system element — the only collection the user didn't intentionally create, communicating "these need your attention."

### Typography
- **Primary:** DM Sans — warm, readable, humanist sans-serif
- **Mono:** JetBrains Mono — for metadata, timestamps, technical details. Creates contrast between human content and system content.
- **Type scale should breathe.** Generous line-height (1.5-1.6 for body). Titles should have presence without shouting.

### Color Philosophy
- **Background:** Near-black (#0a0a0b) — not pure black. The slight warmth prevents the "void" feeling.
- **Surfaces:** Elevated backgrounds (#141416) float above the page. Subtle, not dramatic.
- **Accent yellow (#e8ff47):** The accent traces the path toward AI output. If an element doesn't lead to Claude, it doesn't get the accent. This is a strict functional rule:
  - YES: "Package for Claude," "Sift it," "Capture," "Context for Claude" fields and labels, context note indicators
  - NO: "New Project" (neutral border button), "Create" in modals (neutral), "PROJECT BRIEF" label (neutral — user orients themselves, not addressing Claude), navigation, settings, search, non-AI-facing controls
  - The accent should create a visible trail from human input to AI output. A user should be able to follow the yellow through the interface and arrive at Claude.
- **Text hierarchy:** Three tiers only. Primary (#f0f0f0) for content. Secondary (#8a8a8e) for support. Tertiary (#5a5a5e) for metadata.
- **Platform colors:** Information, not decoration. Reddit red-orange, X blue, GitHub purple, Article green. Users scan a grid and know the platform mix at a glance.

### Card Design Principles
Cards are the primary unit of display inside projects.

- **Visual weight proportional to richness.** A capture with an image, engagement stats, and a context note should feel more substantial than a bare URL.
- **Hero images are context, not decoration.** If an image doesn't add understanding, use the platform gradient. Quality over presence.
- **Engagement stats are credibility signals.** Display prominently when they exist, don't fabricate weight when they don't.
- **The context note is the human's voice.** Visually distinct from extracted content — accent left border, italic, never invisible.

### Project Cards on the Dashboard
Text-forward research folders. Library spines, not media cards.
- Project name as primary text
- Summary line from brief or latest capture
- Metadata: capture count, platform dots, relative date
- Name-hashed gradient as a subtle left border accent stripe
- No hero images on the dashboard. Content density, not image size, communicates substance.

### Motion and Interaction
- **Hover states invite, don't surprise.** Gentle scale (1.02) and shadow increase.
- **Transitions:** 200-300ms with ease-out curves. Responsive but not twitchy.
- **Loading states match layout.** Skeleton loaders mirror real content dimensions.
- **Captures appear optimistically.** Card appears immediately with shimmer, fills in when extraction completes.

### Information Density
- **Dashboard:** Low density. Single-column project list with breathing room. A library shelf with space between books.
- **Project detail:** Medium density. 2-column capture grid. Enough to scan, not so tight cards lose identity.
- **Capture detail:** Full focus. Single capture, generous reading typography.
- **Public shared view:** Showcase density. Slightly more generous than private. A curated exhibition.

### Empty States
Empty states are invitations, not errors.
- "No captures yet" should feel like a blank canvas, not a missing-data warning.
- First-capture prompts should be specific and actionable.
- Unsorted empty state: "Captures waiting to be sorted will appear here" — warm, not clinical.

---

## Interaction Patterns

### The Capture Moment
Sift's most important interaction. It should feel like placing a thought into a space.

1. User pastes URL → immediate visual acknowledgment
2. Click "Capture" or "Sift it" → optimistic card appears with shimmer
3. Content loads → card fills in smoothly
4. If context note was added → it appears as part of the card, affirming the user's contribution

### The Context Note
"Context for Claude" is Sift's signature interaction — the thing no other tool has.

- Visually elevated: subtle accent border, placeholder that inspires thought
- Optional but rewarding: captures work without notes, captures with notes feel richer
- In the extension: dominant input, above project selector, where the thumb naturally rests
- On project pages: positioned above the capture URL input — thinking before capturing

### Navigation
- Back navigation always predictable. Projects → Home. Captures → Project.
- Project selector shows recent/frequent first, not alphabetical
- Search feels instant — filter as you type

### Sharing
- Sharing a project feels like opening a gallery
- Public view is aspirational — visitors should want to create their own
- Individual capture shares feel like sharing a specific insight, with a path back to the collection
- Language shift: "Context for Claude" (private) → "Curator's note" (public)

---

## The AI Side (Phase B — Collection Intelligence)

### Claude's Read
When a project has 3+ captures, Sift generates a synthesis using Claude's API. This is the moment the AI side becomes tangible.

- **Positioning:** After the project brief and context fields, as a distinct section
- **Label:** "Claude's read" or "Synthesis" — clear AI authorship without being loud
- **Content:** Not just summary. Surfaces tensions, gaps, connections the human might not see. "Your captures cover X and Y, but there's a tension between them around Z" is 10x more useful than "This project contains articles about AI agents."
- **Interaction:** The user doesn't need to do anything new. Their existing curation (captures, notes, project brief) is the input. The synthesis updates automatically when captures change.
- **Design:** Feels like it emerges from the captures, not bolted on top. Ambient intelligence — felt, not performed.

---

## Anti-Patterns (What Sift Should Never Do)

- **Never use "AI-powered" or sparkle emojis in the UI.** The AI is felt, not labeled.
- **Never auto-organize without the user's consent.** Suggestions are offers, not actions.
- **Never hide the user's context note behind metadata.** Human intent is primary.
- **Never use pure white or light backgrounds.** Dark theme only.
- **Never use generic stock imagery or illustrations.** Every visual element is functional or absent.
- **Never show an empty state without an actionable prompt.**
- **Never make the export feel like an afterthought.** "Package for Claude" is the product's payoff moment.
- **Never apply accent yellow to non-AI-facing elements.** The accent is a functional signal, not decoration.

---

## Design References
- **Are.na** — Curation as thinking, spatial not hierarchical, blocks as meaning-connections
- **Readwise/Reader** — Human reading behavior → structured knowledge output pipeline
- **Apple Notes + Apple Intelligence** — Ambient AI, not intrusive. Intent gap to exploit.
- **Mem** — Self-organizing notes. Study where AI organization lost user agency.
- **Perplexity** — Claim → source → depth. Trust through transparency in AI reasoning.

The through-line question for every design decision: **Where does the human's intent get preserved versus lost in the system?**
