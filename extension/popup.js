// ── Config ──
const DEFAULT_APP_URL = 'https://bild-curation-app.vercel.app';
const BRIDGE_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 15000;
const INBOX_PROJECT_ID = '__inbox__';

// ── DOM refs ──
const bridgeIframe = document.getElementById('bridge');
const stateLoading = document.getElementById('state-loading');
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

// ── State ──
let appUrl = DEFAULT_APP_URL;
let currentTabUrl = '';
let currentTabTitle = '';
let bridgeReady = false;
const pendingRequests = new Map();

// ── Helpers ──

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function setState(name) {
  [stateLoading, stateReady, stateSifting, stateSuccess, stateError].forEach(el => {
    el.classList.remove('active');
  });
  const el = document.getElementById(`state-${name}`);
  if (el) el.classList.add('active');
}

function sendToBridge(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!bridgeReady && type !== 'BRIDGE_PING') {
      reject(new Error('Bridge not ready'));
      return;
    }

    const requestId = generateId();
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Request timed out'));
    }, REQUEST_TIMEOUT_MS);

    pendingRequests.set(requestId, { resolve, reject, timeout });

    bridgeIframe.contentWindow.postMessage(
      { type, requestId, payload },
      appUrl
    );
  });
}

// ── Bridge message handler ──

window.addEventListener('message', (event) => {
  // Only accept messages from the app's origin
  if (event.origin !== new URL(appUrl).origin) return;

  const { type, requestId, payload } = event.data || {};

  // Unsolicited BRIDGE_READY
  if (type === 'BRIDGE_READY') {
    bridgeReady = true;
    onBridgeReady();
    return;
  }

  // Match response to pending request
  if (requestId && pendingRequests.has(requestId)) {
    const { resolve, timeout } = pendingRequests.get(requestId);
    clearTimeout(timeout);
    pendingRequests.delete(requestId);
    resolve(payload);
  }
});

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

  // Settings link
  settingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Load bridge
  setState('loading');
  bridgeIframe.src = `${appUrl}/extension-bridge`;

  // Bridge timeout
  setTimeout(() => {
    if (!bridgeReady) {
      showError('Cannot connect to Bild app.\n\nMake sure the app is running and the URL is correct in Settings.');
    }
  }, BRIDGE_TIMEOUT_MS);
}

// ── Bridge ready ──

async function onBridgeReady() {
  try {
    // Fetch projects
    const result = await sendToBridge('GET_PROJECTS');
    const projects = result.projects || [];

    // Populate dropdown
    projectSelect.innerHTML = '';

    // Inbox first
    const inbox = projects.find(p => p.id === INBOX_PROJECT_ID);
    if (inbox) {
      const opt = document.createElement('option');
      opt.value = inbox.id;
      opt.textContent = `📥 Inbox (${inbox.captureCount || 0})`;
      projectSelect.appendChild(opt);
    }

    // Other projects
    projects
      .filter(p => p.id !== INBOX_PROJECT_ID)
      .forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.captureCount || 0})`;
        projectSelect.appendChild(opt);
      });

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
        const dupResult = await sendToBridge('CHECK_DUPLICATE', { url: currentTabUrl });
        if (dupResult.found) {
          duplicateWarning.textContent = `Already captured in "${dupResult.projectName}". You can still capture again.`;
          duplicateWarning.classList.add('visible');
        }
      } catch (e) { /* ignore duplicate check failures */ }
    }

    setState('ready');
  } catch (e) {
    showError('Failed to load projects: ' + e.message);
  }

  // Wire up buttons
  siftBtn.addEventListener('click', handleSift);
  retryBtn.addEventListener('click', () => {
    setState('ready');
  });
}

// ── Capture flow ──

async function handleSift() {
  if (!currentTabUrl) {
    showError('No URL detected for this page.');
    return;
  }

  const selectedProjectId = projectSelect.value;
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

    // Step 2: Save via bridge
    const captureResult = await sendToBridge('ADD_CAPTURE', {
      projectId: selectedProjectId,
      url: currentTabUrl,
      title: data.title || currentTabTitle || currentTabUrl,
      body: data.body || '',
      author: data.author || '',
      images: data.images || [],
      metadata: data.metadata || {},
      note: note,
    });

    if (!captureResult.success) {
      throw new Error(captureResult.error || 'Failed to save capture');
    }

    // Save preferred project
    try {
      await chrome.storage.sync.set({ defaultProjectId: selectedProjectId });
    } catch (e) { /* ignore */ }

    // Show success
    successText.textContent = `Sifted to ${selectedProjectName}`;
    setState('success');

    // Auto-close after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);

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
