'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getProjects, addCapture, type Project } from '@/lib/db';

function SharePageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sharedUrl = searchParams.get('url') || searchParams.get('text') || '';
  const sharedTitle = searchParams.get('title') || '';

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [url, setUrl] = useState(sharedUrl);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const p = await getProjects();
        setProjects(p);
        // Default to inbox / unsorted project, or first project
        const inbox = p.find((proj) => proj.is_inbox);
        setSelectedProject(inbox?.id || p[0]?.id || '');
      } catch {
        setAuthError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // If shared text contains a URL, extract it
  useEffect(() => {
    if (!url && sharedTitle) {
      // Sometimes the URL comes in the text param
      const urlMatch = sharedTitle.match(/https?:\/\/[^\s]+/);
      if (urlMatch) setUrl(urlMatch[0]);
    }
  }, [url, sharedTitle]);

  async function handleSift() {
    if (!url.trim() || !selectedProject) return;
    setSaving(true);
    setError('');

    const resolvedUrl = url.trim();

    try {
      // Fetch URL metadata
      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: resolvedUrl }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch URL');
      }

      const data = await response.json();
      await addCapture(
        selectedProject,
        resolvedUrl,
        data.title,
        data.body,
        data.author,
        data.images || [],
        data.metadata || {},
        note.trim(),
      );

      setSuccess(true);
      setTimeout(() => {
        router.push(`/project/${selectedProject}`);
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  if (authError) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Sign in to Sift</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24 }}>You need to be signed in to capture content.</p>
          <a href="/login" style={{ display: 'inline-block', padding: '12px 32px', borderRadius: 12, background: 'var(--accent)', color: 'var(--bg)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>Sign in</a>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '24px 16px', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--accent)', marginBottom: 4 }}>Sift</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Quick capture</p>
      </div>

      {/* Form */}
      <div style={{ maxWidth: 480, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
        {/* URL input */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 15,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        </div>

        {/* Project selector */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</label>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 15,
              outline: 'none',
              boxSizing: 'border-box',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' stroke-width='1.5' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 16px center',
              paddingRight: 40,
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.is_inbox ? 'Unsorted' : p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Context for Claude */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Context for Claude <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this interesting? What should Claude know?"
            rows={3}
            style={{
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--accent)',
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              fontSize: 14,
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', fontSize: 13, fontWeight: 600, textAlign: 'center' }}>
            Sifted! Redirecting...
          </div>
        )}

        {/* Submit button */}
        <button
          onClick={handleSift}
          disabled={!url.trim() || !selectedProject || saving || success}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: 12,
            border: 'none',
            background: 'var(--accent)',
            color: 'var(--bg)',
            fontSize: 16,
            fontWeight: 700,
            cursor: !url.trim() || saving ? 'default' : 'pointer',
            opacity: !url.trim() || saving || success ? 0.4 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'Sifting...' : 'Sift it'}
        </button>

        {/* Footer link */}
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <Link href="/" style={{ fontSize: 13, color: 'var(--text-secondary)', textDecoration: 'none' }}>
            Open Sift
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    }>
      <SharePageContent />
    </Suspense>
  );
}
