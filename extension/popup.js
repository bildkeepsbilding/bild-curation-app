// ── Config ──
const DEFAULT_APP_URL = 'https://bild-curation-app.vercel.app';
const REQUEST_TIMEOUT_MS = 15000;

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
const openAppBtn = document.getElementById('open-app-btn');
const retrySigninBtn = document.getElementById('retry-signin-btn');

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

// ── Cookie-based auth ──

async function getSessionFromCookies() {
  try {
    const domain = new URL(appUrl).hostname;
    const cookies = await chrome.cookies.getAll({ domain });

    // Find Supabase auth token cookies (may be chunked: sb-{ref}-auth-token.0, .1, ...)
    const authCookies = cookies
      .filter(c => c.name.startsWith('sb-') && c.name.includes('-auth-token'))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (authCookies.length === 0) return null;

    // Check for single vs chunked cookies
    const baseCookie = authCookies.find(c => !c.name.match(/\.\d+$/));
    let tokenStr;

    if (baseCookie && authCookies.length === 1) {
      // Single cookie
      tokenStr = baseCookie.value;
    } else {
      // Chunked: take only the numbered chunks (.0, .1, etc.) in order
      const chunks = authCookies
        .filter(c => c.name.match(/\.\d+$/))
        .sort((a, b) => {
          const numA = parseInt(a.name.match(/\.(\d+)$/)[1]);
          const numB = parseInt(b.name.match(/\.(\d+)$/)[1]);
          return numA - numB;
        });
      tokenStr = chunks.length > 0
        ? chunks.map(c => c.value).join('')
        : (baseCookie ? baseCookie.value : authCookies[0].value);
    }

    // Decode — cookie value may be URL-encoded JSON
    const decoded = decodeURIComponent(tokenStr);
    const session = JSON.parse(decoded);

    // Validate: must have access_token
    if (!session || !session.access_token) return null;

    // Check expiry
    if (session.expires_at && session.expires_at < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return session;
  } catch (e) {
    console.warn('Failed to read session cookies:', e);
    return null;
  }
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
  openAppBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: appUrl });
  });
  retrySigninBtn.addEventListener('click', () => {
    setState('loading');
    init();
  });

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

  // Step 2: Read auth session from cookies
  const session = await getSessionFromCookies();

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
    // Auth might have expired between cookie read and API call
    if (e.message.includes('401') || e.message.includes('403')) {
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
