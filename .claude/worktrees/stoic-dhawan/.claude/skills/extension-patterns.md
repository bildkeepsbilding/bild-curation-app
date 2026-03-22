# Sift Chrome Extension Patterns

## Overview
The Chrome extension (`/extension` directory) allows users to capture the current browser page into Sift without leaving the tab. It's a Manifest V3 extension with a popup UI.

## Architecture
```
extension/
  manifest.json    # Manifest V3 config
  popup.html       # Popup UI structure
  popup.css        # Popup styles (dark theme matching the app)
  popup.js         # All logic — auth, capture, Supabase REST calls
  options.html/js  # Settings page (app URL configuration)
  icons/           # Extension icons (16, 48, 128px)
```

## Permissions
```json
{
  "permissions": ["activeTab", "storage"],
  "host_permissions": [
    "https://*.vercel.app/*",
    "http://localhost:*/*",
    "http://127.0.0.1:*/*"
  ]
}
```
Minimal permissions — no `cookies`, no `tabs`, no `scripting`. The extension uses token-exchange auth, not cookie reading.

## Auth Flow (Token Exchange)
The extension does NOT read browser cookies. Instead:

1. On popup open, `init()` checks `chrome.storage.local` for saved tokens
2. If no tokens → fetches `GET /api/extension-token` with `credentials: 'include'`
3. If server returns tokens (user has active session in browser) → stores in `chrome.storage.local`
4. If 401 → shows "Sign in" state
5. "Sign in" button opens `{appUrl}/login?extension=true` in a new tab
6. After login, app redirects to `/extension/auth-success` which shows "Connected! Click the extension icon"
7. Next popup open → step 2 succeeds because user now has a browser session
8. Token refresh: if `expires_at` is past, calls `/api/extension-token` again

### Token Storage
```javascript
// Stored in chrome.storage.local:
{
  sift_access_token: string,
  sift_refresh_token: string,
  sift_expires_at: number  // Unix timestamp
}
```

## Supabase REST API (Direct)
The extension talks directly to Supabase's REST API (PostgREST) for data operations, bypassing the Next.js app. This is faster and doesn't require server-side processing.

```javascript
// Headers for all Supabase requests
function supabaseHeaders() {
  return {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

// GET example
const res = await fetch(`${supabaseUrl}/rest/v1/projects?select=*,captures(count)&order=updated_at.desc`, {
  headers: supabaseHeaders(),
});

// POST example (insert capture)
const res = await fetch(`${supabaseUrl}/rest/v1/captures`, {
  method: 'POST',
  headers: supabaseHeaders(),
  body: JSON.stringify({ project_id, user_id, url, title, body, ... }),
});
```

## Configuration Discovery
On init, the extension fetches `/api/extension-config` to get `supabaseUrl` and `supabaseAnonKey`. This avoids hardcoding Supabase credentials in the extension.

## Capture Flow
1. User clicks extension icon → popup opens
2. `init()` gets current tab URL and title via `chrome.tabs.query()`
3. Shows project selector dropdown (fetched from Supabase) + "Context for Claude" textarea
4. User clicks "Sift it" →
   a. Extracts content via `POST /api/fetch-url` (app server handles extraction)
   b. Inserts capture directly to Supabase via REST API
   c. Shows success state "Sifted to [project name]"
   d. Auto-closes popup after 2 seconds

## Popup States
The popup has these states, managed by `setState(name)`:
- `loading` — Initial state, checking auth
- `signin` — No auth, shows "Sign in" button
- `ready` — Authenticated, shows capture UI
- `sifting` — Capture in progress
- `success` — Capture saved
- `error` — Something failed, shows retry

## Platform Detection (Client-Side)
```javascript
function detectPlatform(url) {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('reddit.com') || host.includes('redd.it')) return 'reddit';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'twitter';
  if (host.includes('github.com')) return 'github';
  return 'article';
}
```

## UI Design
- Dark theme matching the main app (background: #0a0a0b)
- Accent yellow (#e8ff47) for primary buttons and highlights
- "Context for Claude" textarea has a subtle accent border to draw attention
- URL display truncated to 50 chars with ellipsis
- Project dropdown shows "📂 Unsorted" first, then user projects with capture counts
- Footer: "Sign out" link + "Settings" link

## Duplicate Detection
Before capture, the extension queries Supabase for existing captures with the same URL (normalized). If found, shows a warning but still allows capture.

## Settings (options.html)
Users can configure:
- App URL (defaults to `https://bild-curation-app.vercel.app`)
- Default project for captures

Settings stored in `chrome.storage.sync` (synced across Chrome instances).

## Development
- Load unpacked from `~/bild-curation-app/extension` in `chrome://extensions`
- After code changes: `git pull origin main` then reload extension in Chrome
- Permission changes require removing and re-adding the extension
- Debug: right-click extension icon → "Inspect Popup" → Console
