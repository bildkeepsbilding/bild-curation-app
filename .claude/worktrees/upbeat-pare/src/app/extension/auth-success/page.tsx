'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ExtensionAuthSuccess() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');

  useEffect(() => {
    async function checkSession() {
      try {
        const supabase = createClient();
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error || !session) {
          setStatus('error');
          return;
        }

        setStatus('success');
      } catch {
        setStatus('error');
      }
    }

    checkSession();
  }, []);

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: '#0a0a0b' }}
    >
      <div className="w-full max-w-[380px] text-center">
        {status === 'loading' && (
          <>
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-full border-2 animate-spin"
              style={{ borderColor: '#2a2a2d', borderTopColor: '#e8ff47' }}
            />
            <p className="text-[14px]" style={{ color: '#8a8a8e' }}>
              Connecting...
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: '#e8ff47' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="#0a0a0b"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1
              className="text-[20px] font-bold mb-2"
              style={{ color: '#f0f0f0' }}
            >
              Connected!
            </h1>
            <p className="text-[14px]" style={{ color: '#8a8a8e' }}>
              Click the Bild extension icon to start capturing.
            </p>
            <p className="text-[12px] mt-2" style={{ color: '#5a5a5e' }}>
              You can close this tab.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: '#ff474720' }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="#ff4747"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h1
              className="text-[20px] font-bold mb-2"
              style={{ color: '#f0f0f0' }}
            >
              Sign-in Failed
            </h1>
            <p className="text-[14px]" style={{ color: '#8a8a8e' }}>
              No active session found. Please try signing in again from the extension.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
