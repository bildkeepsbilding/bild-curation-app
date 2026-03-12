// ── Config ──
const DEFAULT_APP_URL = 'https://bild-curation-app.vercel.app';
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_REFRESH_BUFFER_S = 60; // Refresh if within 60s of expiry

// ── DOM refs ──
const stateLoading = document.getElementById('state-loading');
const stateSignin = document.getElementById('state-signin');
const stateReady = document.getElementById('state-ready');
const stateSifting = document.getElementById('state-sifting');
const stateSuccess = document.getElementById('state-success');
const stateError = document.getElementById('state-error');
const pageTitle = document.getElementById('page-title');
const pageUrl = document.getElementById('page-url');
const duplicateWarning = document.getElementById('duplicate-warning');
const projectSelect = document.getElementById('project-select');
const noteInput = document.getElementById('note-input');
const siftBtn = document.getElementById('sift-btn');
const successText = document.getElementById('success-text');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const settingsLink = document.getElementById('settings-link');
const signinBtn = document.getElementById('signin-btn');
const signoutLink = document.getElementById('signout-link');

// ── State ──
let appUrl = DEFAULT_APP_URL;
let currentTabUrl = '';
let currentTabTitle = '';
let supabaseUrl = '';
let supabaseAnonKey = '';
let accessToken = '';
let userId = '';

// ── Helpers ──

function setState(name) {
  [stateLoading, stateSignin, stateReady, stateSifting, stateSuccess, stateError].forEach(el => {
    el.classList.remove('active');
  });
  const el = document.getElementById(`state-${name}`);
  if (el) el.classList.add('active');

  // Show/hide sign-out link based on auth state
  if (signoutLink) {
    signoutLink.style.display = (name === 'ready' || name === 'sifting' || name === 'success') ? 'inline' : 'none';
  }
}

function detectPlatform(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes('reddit.com') || host.includes('redd.it')) return 'reddit';
    if (host.includes('twitter.com') || host.includes('x.com') || host.includes('nitter')) return 'twitter';
    if (host.includes('github.com')) return 'github';
    return 'article';
  } catch {
    return 'other';
  }
}

// ── Supabase REST helpers ──

function supabaseHeaders() {
  return {
    'apikey': supabaseAnonKey,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  };
}

async function supabaseGet(table, query = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}${query}`, {
    headers: supabaseHeaders(),
  });
  if (!res.ok) throw new Error(`Supabase GET ${table} failed: ${res.status}`);
  return res.json();
}

async function supabasePost(table, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: supabaseHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase POST ${table} failed: ${res.status}`);
  }
  return res.json();
}

// ── Token storage (chrome.storage.local) ──

async function getSessionFromStorage() {
  try {
    const stored = await chrome.storage.local.get(['access_token', 'refresh_token', 'expires_at']);

    if (!stored.access_token || !stored.refresh_token) return null;

    // Check if token is expired or about to expire
    const now = Math.floor(Date.now() / 1000);
    if (stored.expires_at && stored.expires_at < now + TOKEN_REFRESH_BUFFER_S) {
      // Token expired or about to expire — try to refresh
      const refreshed = await refreshAccessToken(stored.refresh_token);
      if (!refreshed) return null;
      return refreshed;
    }

    return {
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
      expires_at: stored.expires_at,
    };
  } catch (e) {
    console.warn('Failed to read session from storage:', e);
    return null;
  }
}

async function storeSession(session) {
  await chrome.storage.local.set({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  });
}

async function clearSession() {
  await chrome.storage.local.remove(['access_token', 'refresh_token', 'expires_at']);
}

// ── Token refresh ──

async function refreshAccessToken(refreshToken) {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      // Refresh failed — session is invalid
      await clearSession();
      return null;
    }

    const data = await res.json();

    if (!data.access_token) {
      await clearSession();
      return null;
    }

    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    };

    await storeSession(session);
    return session;
  } catch (e) {
    console.warn('Token refresh failed:', e);
    await clearSession();
    return null;
  }
}

// ── Sign-in flow via tab ──

function startSignInFlow() {
  const loginUrl = `${appUrl}/login?extension=true`;
  let signInTabId = null;
  let timeoutId = null;

  function cleanup() {
    chrome.tabs.onUpdated.removeListener(onTabUpdated);
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    if (timeoutId) clearTimeout(timeoutId);
  }

  function onTabRemoved(tabId) {
    if (tabId === signInTabId) {
      // User closed the tab before completing sign-in
      cleanup();
      signInTabId = null;
    }
  }

  async function onTabUpdated(tabId, changeInfo) {
    if (tabId !== signInTabId || !changeInfo.url) return;

    // Check if the tab navigated to the auth success page
    if (!changeInfo.url.includes('/extension/auth-success')) return;

    // Wait a moment for the page to render the session data
    setTimeout(async () => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: signInTabId },
          func: () => {
            const el = document.getElementById('extension-session-data');
            if (!el) return null;
            return {
              session: el.dataset.session,
              status: el.dataset.status,
            };
          },
        });

        const result = results?.[0]?.result;

        if (!result || result.status !== 'success' || !result.session) {
          // Page hasn't loaded yet or errored — try again in a bit
          if (result && result.status === 'loading') {
            // Still loading, will be called again on next update
            return;
          }
          cleanup();
          try { chrome.tabs.remove(signInTabId); } catch {}
          showError('Failed to read session from the sign-in page. Please try again.');
          return;
        }

        const session = JSON.parse(result.session);

        if (!session.access_token) {
          cleanup();
          try { chrome.tabs.remove(signInTabId); } catch {}
          showError('No access token received. Please try again.');
          return;
        }

        // Store the session
        await storeSession(session);

        cleanup();
        try { chrome.tabs.remove(signInTabId); } catch {}

        // Re-initialize with the new session
        init();
      } catch (e) {
        console.warn('Failed to read session from tab:', e);
        cleanup();
        try { chrome.tabs.remove(signInTabId); } catch {}
        showError('Failed to connect. Make sure you completed sign-in and try again.');
      }
    }, 1500); // Wait 1.5s for React to render
  }

  // Open login tab
  chrome.tabs.create({ url: loginUrl }, (tab) => {
    signInTabId = tab.id;

    // Listen for tab URL changes and tab closure
    chrome.tabs.onUpdated.addListener(onTabUpdated);
    chrome.tabs.onRemoved.addListener(onTabRemoved);

    // Timeout after 5 minutes
    timeoutId = setTimeout(() => {
      cleanup();
      // Don't close the tab — user might still be working on it
      signInTabId = null;
    }, SIGN_IN_TIMEOUT_MS);
  });
}

// ── Sign out ──

async function handleSignOut() {
  await clearSession();
  accessToken = '';
  userId = '';
  setState('signin');
}

// ── Initialization ──

async function init() {
  // Load settings
  try {
    const stored = await chrome.storage.sync.get(['appUrl', 'defaultProjectId']);
    if (stored.appUrl) appUrl = stored.appUrl;
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }

  // Get current tab info
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabUrl = tab.url || '';
      currentTabTitle = tab.title || '';
      pageTitle.textContent = currentTabTitle || 'Untitled page';
      pageUrl.textContent = currentTabUrl;
    }
  } catch (e) {
    console.warn('Failed to get tab:', e);
  }

  // Wire up static buttons
  settingsLink.addEventListener('click', () => chrome.runtime.openOptionsPage());
  signinBtn.addEventListener('click', startSignInFlow);
  if (signoutLink) {
    signoutLink.addEventListener('click', (e) => {
      e.preventDefault();
      handleSignOut();
    });
  }

  setState('loading');

  // Step 1: Fetch Supabase config from the app
  try {
    const configRes = await fetch(`${appUrl}/api/extension-config`);
    if (!configRes.ok) throw new Error(`Config fetch failed: ${configRes.status}`);
    const config = await configRes.json();
    supabaseUrl = config.supabaseUrl;
    supabaseAnonKey = config.supabaseAnonKey;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase configuration');
    }
  } catch (e) {
    showError('Cannot connect to Bild app.\n\nMake sure the app is running and the URL is correct in Settings.');
    return;
  }

  // Step 2: Read auth session from chrome.storage.local
  const session = await getSessionFromStorage();

  if (!session) {
    setState('signin');
    return;
  }

  accessToken = session.access_token;

  // Decode user ID from JWT payload
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]));
    userId = payload.sub;
  } catch (e) {
    console.warn('Failed to decode JWT:', e);
    await clearSession();
    setState('signin');
    return;
  }

  // Step 3: Load projects and show ready state
  await onAuthenticated();
}

// ── Authenticated: load projects ──

async function onAuthenticated() {
  try {
    // Fetch projects with capture counts
    const projects = await supabaseGet(
      'projects',
      '?select=id,name,is_inbox,created_at,captures(count)&order=is_inbox.desc,created_at.asc'
    );

    // Populate dropdown
    projectSelect.innerHTML = '';

    for (const p of projects) {
      const count = p.captures?.[0]?.count ?? 0;
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.is_inbox
        ? `📥 Inbox (${count})`
        : `${p.name} (${count})`;
      projectSelect.appendChild(opt);
    }

    if (projects.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No projects found';
      opt.disabled = true;
      projectSelect.appendChild(opt);
    }

    // Restore last-used project
    try {
      const { defaultProjectId } = await chrome.storage.sync.get('defaultProjectId');
      if (defaultProjectId && projectSelect.querySelector(`option[value="${defaultProjectId}"]`)) {
        projectSelect.value = defaultProjectId;
      }
    } catch (e) { /* ignore */ }

    // Check for duplicate
    if (currentTabUrl) {
      try {
        const dupes = await supabaseGet(
          'captures',
          `?url=eq.${encodeURIComponent(currentTabUrl)}&select=id,project_id,projects(name)&limit=1`
        );
        if (dupes.length > 0) {
          const projectName = dupes[0].projects?.name || 'a project';
          duplicateWarning.textContent = `Already captured in "${projectName}". You can still capture again.`;
          duplicateWarning.classList.add('visible');
        }
      } catch (e) { /* ignore duplicate check failures */ }
    }

    setState('ready');
  } catch (e) {
    // Auth might have expired between storage read and API call
    if (e.message.includes('401') || e.message.includes('403')) {
      await clearSession();
      setState('signin');
    } else {
      showError('Failed to load projects: ' + e.message);
    }
  }

  // Wire up buttons
  siftBtn.addEventListener('click', handleSift);
  retryBtn.addEventListener('click', () => setState('ready'));
}

// ── Capture flow ──

async function handleSift() {
  if (!currentTabUrl) {
    showError('No URL detected for this page.');
    return;
  }

  const selectedProjectId = projectSelect.value;
  if (!selectedProjectId) {
    showError('No project selected.');
    return;
  }

  const note = noteInput.value.trim();
  const selectedProjectName = projectSelect.options[projectSelect.selectedIndex]?.textContent?.replace(/\s*\(\d+\)$/, '') || 'project';

  setState('sifting');

  try {
    // Step 1: Extract content via API
    const response = await fetch(`${appUrl}/api/fetch-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: currentTabUrl }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Extraction failed (${response.status})`);
    }

    const data = await response.json();

    // Step 2: Insert capture directly to Supabase
    const platform = data.platform || detectPlatform(currentTabUrl);

    const captureData = {
      project_id: selectedProjectId,
      user_id: userId,
      url: currentTabUrl,
      title: data.title || currentTabTitle || currentTabUrl,
      body: data.body || '',
      author: data.author || '',
      platform: platform,
      content_tag: '',
      note: note,
      images: data.images || [],
      metadata: data.metadata || {},
    };

    await supabasePost('captures', captureData);

    // Save preferred project
    try {
      await chrome.storage.sync.set({ defaultProjectId: selectedProjectId });
    } catch (e) { /* ignore */ }

    // Show success
    successText.textContent = `Sifted to ${selectedProjectName}`;
    setState('success');

    // Auto-close after 2 seconds
    setTimeout(() => window.close(), 2000);

  } catch (e) {
    showError(e.message || 'Something went wrong. Please try again.');
  }
}

// ── Error handling ──

function showError(message) {
  errorMessage.textContent = message;
  setState('error');
}

// ── Start ──
init();
