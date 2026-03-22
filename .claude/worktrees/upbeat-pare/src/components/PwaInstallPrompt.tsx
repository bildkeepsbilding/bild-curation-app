'use client';

import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'sift-pwa-install-dismissed';

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISS_KEY)) return;

    // Don't show if already in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    function handlePrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', handlePrompt);
    return () => window.removeEventListener('beforeinstallprompt', handlePrompt);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, '1');
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        right: 16,
        zIndex: 1000,
        maxWidth: 420,
        margin: '0 auto',
        padding: '14px 16px',
        borderRadius: 16,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <style>{`@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
          Install Sift
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Add to home screen for quick capture via Share
        </div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          padding: '8px 16px',
          borderRadius: 10,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--bg)',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        style={{
          padding: '6px',
          borderRadius: 8,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </div>
  );
}
