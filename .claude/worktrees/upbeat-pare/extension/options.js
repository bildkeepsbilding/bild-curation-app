const DEFAULT_APP_URL = 'https://bild-curation-app.vercel.app';

const appUrlInput = document.getElementById('app-url');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const savedMessage = document.getElementById('saved-message');

// Load current settings
async function loadSettings() {
  try {
    const { appUrl } = await chrome.storage.sync.get('appUrl');
    appUrlInput.value = appUrl || DEFAULT_APP_URL;
  } catch (e) {
    appUrlInput.value = DEFAULT_APP_URL;
  }
}

// Save settings
saveBtn.addEventListener('click', async () => {
  const url = appUrlInput.value.trim().replace(/\/$/, ''); // Remove trailing slash
  if (!url) {
    appUrlInput.value = DEFAULT_APP_URL;
    return;
  }

  try {
    await chrome.storage.sync.set({ appUrl: url });
    showSaved();
  } catch (e) {
    console.error('Failed to save:', e);
  }
});

// Reset to default
resetBtn.addEventListener('click', async () => {
  appUrlInput.value = DEFAULT_APP_URL;
  try {
    await chrome.storage.sync.set({ appUrl: DEFAULT_APP_URL });
    showSaved();
  } catch (e) {
    console.error('Failed to reset:', e);
  }
});

// Show saved indicator
function showSaved() {
  savedMessage.classList.add('visible');
  setTimeout(() => {
    savedMessage.classList.remove('visible');
  }, 2000);
}

// Enter key saves
appUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

loadSettings();
