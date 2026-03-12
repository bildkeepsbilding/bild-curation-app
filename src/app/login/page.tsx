'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Check if this login was initiated by the Chrome extension
  const isExtension = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('extension') === 'true';

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    const callbackUrl = isExtension
      ? `${window.location.origin}/auth/callback?next=/extension/auth-success`
      : `${window.location.origin}/auth/callback`;

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  }

  async function handleGoogleSignIn() {
    const callbackUrl = isExtension
      ? `${window.location.origin}/auth/callback?next=/extension/auth-success`
      : `${window.location.origin}/auth/callback`;

    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl,
      },
    });
  }

  return (
    <div className="min-h-dvh flex items-center justify-center px-4"
      style={{ background: '#0a0a0b' }}>
      <div className="w-full max-w-[380px]">
        {/* Logo / Branding */}
        <div className="text-center mb-10">
          <h1 className="text-[32px] font-bold tracking-tight"
            style={{ color: '#f0f0f0' }}>
            Bild
          </h1>
          <p className="text-[14px] mt-1"
            style={{ color: '#5a5a5e' }}>
            Capture and organize knowledge from anywhere
          </p>
        </div>

        {sent ? (
          /* Success state */
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ background: '#e8ff4720' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e8ff47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-[18px] font-semibold mb-2" style={{ color: '#f0f0f0' }}>
              Check your email
            </h2>
            <p className="text-[14px] mb-6" style={{ color: '#8a8a8e' }}>
              We sent a magic link to <strong style={{ color: '#f0f0f0' }}>{email}</strong>
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-[13px] cursor-pointer"
              style={{ color: '#5a5a5e' }}>
              Use a different email
            </button>
          </div>
        ) : (
          /* Login form */
          <div>
            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-[14px] font-medium cursor-pointer transition-opacity hover:opacity-90"
              style={{
                background: '#141416',
                border: '1px solid #2a2a2d',
                color: '#f0f0f0',
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Sign in with Google
            </button>

            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px" style={{ background: '#2a2a2d' }} />
              <span className="text-[12px]" style={{ color: '#5a5a5e' }}>or</span>
              <div className="flex-1 h-px" style={{ background: '#2a2a2d' }} />
            </div>

            {/* Email Magic Link */}
            <form onSubmit={handleMagicLink}>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2"
                style={{ color: '#5a5a5e' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full py-3 px-3.5 rounded-xl text-[14px] outline-none transition-colors"
                style={{
                  background: '#141416',
                  border: '1px solid #2a2a2d',
                  color: '#f0f0f0',
                  fontFamily: 'inherit',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = '#e8ff47'}
                onBlur={(e) => e.currentTarget.style.borderColor = '#2a2a2d'}
              />

              {error && (
                <p className="text-[13px] mt-2" style={{ color: '#ff6b6b' }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3 rounded-xl text-[14px] font-semibold cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{
                  background: '#e8ff47',
                  color: '#0a0a0b',
                  border: 'none',
                }}>
                {loading ? 'Sending...' : 'Send magic link'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
