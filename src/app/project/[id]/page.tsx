'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getProject,
  getCaptures,
  addCapture,
  deleteCapture,
  updateCapture,
  exportProjectAsMarkdown,
  type Project,
  type Capture,
  type Platform,
} from '@/lib/db';

const PLATFORMS: { key: Platform | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: '#f0f0f0' },
  { key: 'reddit', label: 'Reddit', color: '#FF4500' },
  { key: 'twitter', label: 'X', color: '#1DA1F2' },
  { key: 'github', label: 'GitHub', color: '#8B5CF6' },
  { key: 'article', label: 'Article', color: '#10B981' },
];

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  reddit: { label: 'Reddit', color: '#FF4500' },
  twitter: { label: 'X', color: '#1DA1F2' },
  github: { label: 'GitHub', color: '#8B5CF6' },
  article: { label: 'Article', color: '#10B981' },
  other: { label: 'Other', color: '#6B7280' },
};

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [viewing, setViewing] = useState<Capture | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Platform | 'all'>('all');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([getProject(projectId), getCaptures(projectId)]);
      setProject(p);
      setCaptures(c);
    } catch (e) {
      console.error('Failed to load project:', e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (editingNote && noteInputRef.current) noteInputRef.current.focus(); }, [editingNote]);

  const filteredCaptures = activeFilter === 'all'
    ? captures
    : captures.filter(c => c.platform === activeFilter);

  // Count by platform
  const platformCounts: Record<string, number> = {};
  for (const c of captures) {
    platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
  }

  async function handleFetchUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setFetching(true);
    setFetchError('');

    try {
      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch');
      }
      const data = await response.json();
      await addCapture(projectId, url, data.title, data.body, data.author, data.images || [], data.metadata || {});
      setUrlInput('');
      await loadData();
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFetching(false);
    }
  }

  async function handleExport() {
    const md = await exportProjectAsMarkdown(projectId);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopyForClaude() {
    const md = await exportProjectAsMarkdown(projectId);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDelete(capture: Capture) {
    try {
      await deleteCapture(capture.id, projectId);
      setViewing(null);
      await loadData();
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }

  async function handleSaveNote() {
    if (!viewing) return;
    try {
      await updateCapture(viewing.id, { note: noteText });
      setViewing({ ...viewing, note: noteText });
      setEditingNote(false);
      await loadData();
    } catch (e) {
      console.error('Save note failed:', e);
    }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function truncate(text: string, len: number) {
    return text.length > len ? text.slice(0, len) + '...' : text;
  }

  function getPlaceholder(): string {
    return 'Paste a Reddit, X, or GitHub URL...';
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Project not found</p>
        <button onClick={() => router.push('/')} className="mt-3 text-sm font-medium" style={{ color: 'var(--accent)' }}>Go back</button>
      </div>
    );
  }

  return (
    <main className="min-h-dvh safe-top safe-bottom">

      {/* ── Capture Viewer ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
          <div className="flex items-center justify-between px-4 py-3 safe-top" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => { setViewing(null); setEditingNote(false); }} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{formatTime(viewing.createdAt)}</span>
            <button onClick={() => handleDelete(viewing)} className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Delete</button>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: PLATFORM_LABELS[viewing.platform]?.color + '20', color: PLATFORM_LABELS[viewing.platform]?.color }}>
                {PLATFORM_LABELS[viewing.platform]?.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{viewing.author}</span>
            </div>

            <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{viewing.title}</h2>

            {/* Reddit metadata */}
            {viewing.metadata && viewing.platform === 'reddit' && (
              <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>r/{String(viewing.metadata.subreddit)}</span>
                <span>↑ {String(viewing.metadata.score)}</span>
                <span>{String(viewing.metadata.numComments)} comments</span>
              </div>
            )}

            {/* Twitter metadata */}
            {viewing.metadata && viewing.platform === 'twitter' && (
              <div className="space-y-2 mb-4">
                {Boolean(viewing.metadata.isArticle) && (
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold" style={{ background: '#8B5CF620', color: '#8B5CF6' }}>
                    X Article
                  </span>
                )}
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {viewing.metadata.likes != null ? <span>❤️ {String(viewing.metadata.likes)}</span> : null}
                  {viewing.metadata.retweets != null ? <span>🔁 {String(viewing.metadata.retweets)}</span> : null}
                  {viewing.metadata.replies != null ? <span>💬 {String(viewing.metadata.replies)}</span> : null}
                  {viewing.metadata.views != null ? <span>👁 {String(viewing.metadata.views)}</span> : null}
                </div>
                {Boolean(viewing.metadata.source) && (
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
                    via {String(viewing.metadata.source)}
                  </span>
                )}
              </div>
            )}

            {/* GitHub metadata */}
            {viewing.metadata && viewing.platform === 'github' && (
              <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {viewing.metadata.stars != null ? <span>Stars: {String(viewing.metadata.stars)}</span> : null}
                {viewing.metadata.forks != null ? <span>Forks: {String(viewing.metadata.forks)}</span> : null}
                {viewing.metadata.language ? <span>{String(viewing.metadata.language)}</span> : null}
              </div>
            )}

            {/* Images */}
            {viewing.images && viewing.images.length > 0 && (
              <div className="mb-4 space-y-3">
                {viewing.images.map((img, i) => (
                  <img key={i} src={img} alt={`Image ${i + 1}`} className="w-full rounded-xl" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" />
                ))}
              </div>
            )}

            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {viewing.body}
            </div>

            <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-xs font-mono underline" style={{ color: 'var(--accent)' }}>
              View original →
            </a>
          </div>

          <div className="px-4 py-3 safe-bottom" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {editingNote ? (
              <div className="flex gap-2">
                <textarea ref={noteInputRef} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add your thoughts..." rows={2} className="flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <div className="flex flex-col gap-1">
                  <button onClick={handleSaveNote} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                  <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setNoteText(viewing.note || ''); setEditingNote(true); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: viewing.note ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {viewing.note || 'Tap to add your thoughts...'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="px-5 pt-5 pb-4">
        <button onClick={() => router.push('/')} className="flex items-center gap-1 text-sm font-medium mb-3" style={{ color: 'var(--text-tertiary)' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Projects
        </button>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>{project.name}</h1>
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>
              {captures.length} capture{captures.length !== 1 ? 's' : ''}
            </p>
          </div>
          {captures.length > 0 && (
            <div className="flex gap-2">
              <button onClick={handleCopyForClaude} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all" style={{ border: copied ? '1px solid var(--accent)' : '1px solid var(--border)', color: copied ? 'var(--accent)' : 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5"/></svg>
                {copied ? 'Copied!' : 'Copy for Claude'}
              </button>
              <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Export .md
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── URL Input ── */}
      <div className="px-5 mb-4">
        <div className="flex gap-2">
          <input ref={urlInputRef} type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setFetchError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()} placeholder={getPlaceholder()} className="flex-1 px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} disabled={fetching} />
          <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetching} className="px-5 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            {fetching ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--bg)', borderTopColor: 'transparent' }} /> : 'Capture'}
          </button>
        </div>
        {fetchError && <p className="text-xs mt-2 px-1" style={{ color: 'var(--danger)' }}>{fetchError}</p>}
      </div>

      {/* ── Platform Filter Tabs ── */}
      {captures.length > 0 && (
        <div className="px-5 mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {PLATFORMS.map((p) => {
              const count = p.key === 'all' ? captures.length : (platformCounts[p.key] || 0);
              if (p.key !== 'all' && count === 0) return null;
              const isActive = activeFilter === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setActiveFilter(p.key)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                  style={{
                    background: isActive ? p.color + '20' : 'transparent',
                    border: isActive ? `1px solid ${p.color}40` : '1px solid var(--border-subtle)',
                    color: isActive ? p.color : 'var(--text-tertiary)',
                  }}
                >
                  {p.label}
                  <span className="font-mono text-[10px]" style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Captures List ── */}
      <div className="px-5 pb-8">
        {captures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--accent-dim)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No captures yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Paste a Reddit, X, or GitHub URL above</p>
          </div>
        ) : filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No {PLATFORM_LABELS[activeFilter]?.label} captures yet</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {filteredCaptures.map((capture) => (
              <button key={capture.id} onClick={() => setViewing(capture)} className="w-full text-left rounded-2xl p-4 active:scale-[0.98] transition-transform" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + '20', color: PLATFORM_LABELS[capture.platform]?.color }}>{PLATFORM_LABELS[capture.platform]?.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{capture.author}</span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatTime(capture.createdAt)}</span>
                </div>

                {capture.images && capture.images.length > 0 && capture.platform !== 'github' && (
                  <div className="mb-2 rounded-lg overflow-hidden" style={{ maxHeight: '120px' }}>
                    <img src={capture.images[0]} alt="" className="w-full object-cover object-top" style={{ maxHeight: '120px' }} loading="lazy" />
                  </div>
                )}

                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{truncate(capture.title, 80)}</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{truncate(capture.body.split('\n---')[0], 120)}</p>
                {capture.note && (
                  <p className="text-xs mt-2 px-2 py-1 rounded-lg" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>💡 {truncate(capture.note, 60)}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
