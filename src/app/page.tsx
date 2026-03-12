'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, getCaptures, getAllCaptures, getProjectMap, createProject, deleteProject, ensureInbox, addCapture, findCaptureByUrl, getUniqueContentTag, type Project, type Capture } from '@/lib/db';
import UserMenu from '@/components/UserMenu';

interface ProjectWithCover extends Project {
  coverImage?: string;
  latestTitle?: string;
  platforms: string[];
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithCover[]>([]);
  const [inboxProject, setInboxProject] = useState<ProjectWithCover | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBrief, setNewBrief] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Capture[]>([]);
  const [searchProjectMap, setSearchProjectMap] = useState<Record<string, Project>>({});
  const [searchCache, setSearchCache] = useState<{ captures: Capture[]; projectMap: Record<string, Project> } | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ capture: Capture; project: Project } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showCreate && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCreate]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape: close topmost modal
      if (e.key === 'Escape') {
        if (deleteConfirm) { setDeleteConfirm(null); return; }
        if (duplicateInfo) { setDuplicateInfo(null); return; }
        if (showCreate) { setShowCreate(false); setNewName(''); setNewBrief(''); return; }
      }
      // Cmd/Ctrl+V: focus URL input when no input is focused
      if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
        const active = document.activeElement;
        const isInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
        if (!isInput && urlInputRef.current) {
          e.preventDefault();
          urlInputRef.current.focus();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirm, duplicateInfo, showCreate]);

  async function loadProjects() {
    try {
      // Ensure Inbox exists, then fetch projects and all captures in parallel
      await ensureInbox();

      const [p, allCaptures] = await Promise.all([
        getProjects(),
        getAllCaptures(),
      ]);

      setTotalCaptures(allCaptures.length);

      // Build a map of projectId → captures for enrichment (no extra DB calls)
      const capturesByProject = new Map<string, Capture[]>();
      for (const c of allCaptures) {
        const list = capturesByProject.get(c.projectId) || [];
        list.push(c);
        capturesByProject.set(c.projectId, list);
      }

      const enriched: ProjectWithCover[] = p.map((project) => {
        const captures = capturesByProject.get(project.id) || [];
        const coverImage = captures.find(c => c.images && c.images.length > 0)?.images[0];
        const latestTitle = captures.length > 0 ? captures[0].title : undefined;
        const platforms = [...new Set(captures.map(c => c.platform))];
        return { ...project, coverImage, latestTitle, platforms };
      });

      // Separate Inbox from regular projects
      const inbox = enriched.find(p => p.is_inbox) || null;
      const regular = enriched.filter(p => !p.is_inbox);

      setInboxProject(inbox);
      setProjects(regular);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(query: string) {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      let data = searchCache;
      if (!data) {
        const [captures, projectMap] = await Promise.all([getAllCaptures(), getProjectMap()]);
        data = { captures, projectMap };
        setSearchCache(data);
        setSearchProjectMap(projectMap);
      }
      const q = query.toLowerCase();
      const results = data.captures.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        (c.note || '').toLowerCase().includes(q)
      );
      setSearchResults(results);
      setSearchProjectMap(data.projectMap);
    } catch (e) {
      console.error('Search failed:', e);
    }
  }

  async function handleCheckQuickCapture() {
    const url = urlInput.trim();
    if (!url) return;
    setDuplicateInfo(null);
    try {
      const dup = await findCaptureByUrl(url);
      if (dup) {
        setDuplicateInfo(dup);
        return;
      }
    } catch { /* ignore */ }
    await doQuickCapture(url);
  }

  async function handleCaptureAnyway() {
    setDuplicateInfo(null);
    await doQuickCapture(urlInput.trim());
  }

  async function doQuickCapture(url: string) {
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
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to fetch (${response.status})`);
      }

      const data = await response.json();
      const inbox = await ensureInbox();
      await addCapture(
        inbox.id,
        url,
        data.title || url,
        data.body || '',
        data.author || '',
        data.images || [],
        data.metadata || {},
      );

      setUrlInput('');
      setSearchCache(null);
      await loadProjects();
      showToast('Saved to Inbox');
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to capture');
    } finally {
      setFetching(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    try {
      await createProject(name, newBrief.trim());
      setNewName('');
      setNewBrief('');
      setShowCreate(false);
      await loadProjects();
    } catch (e) {
      console.error('Failed to create project:', e);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setDeleteConfirm(null);
      await loadProjects();
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const platformColors: Record<string, string> = {
    twitter: '#1DA1F2',
    reddit: '#FF4500',
    github: '#8B5CF6',
    article: '#10B981',
    other: '#6B7280',
  };

  const platformGradients: Record<string, string> = {
    reddit: 'linear-gradient(135deg, #FF4500 0%, #FF6B35 50%, #CC3700 100%)',
    twitter: 'linear-gradient(135deg, #1DA1F2 0%, #4FBBF7 50%, #0D8BD9 100%)',
    github: 'linear-gradient(135deg, #8B5CF6 0%, #A78BFA 50%, #6D28D9 100%)',
    article: 'linear-gradient(135deg, #10B981 0%, #34D399 50%, #059669 100%)',
    other: 'linear-gradient(135deg, #6B7280 0%, #9CA3AF 50%, #4B5563 100%)',
  };

  function formatCompact(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
  }

  const regularProjectCount = projects.length;

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      <header className="px-5 pt-8 pb-6 flex items-end justify-between max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Bild
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {regularProjectCount} project{regularProjectCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            New Project
          </button>
          <UserMenu />
        </div>
      </header>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setNewName(''); } }}
        >
          <div className="w-full sm:max-w-md p-6 rounded-t-2xl sm:rounded-2xl animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Project</h2>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && handleCreate()}
              placeholder="Project name..."
              className="w-full px-4 py-3 rounded-xl text-base outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              maxLength={50}
            />
            <div className="mt-3">
              <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: 'var(--accent)' }}>Project Brief</label>
              <textarea
                value={newBrief}
                onChange={(e) => setNewBrief(e.target.value)}
                placeholder="What is this project about? What are you trying to learn or build?"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
              />
              <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-tertiary)' }}>This becomes the header of every Claude export — giving immediate context about your collection.</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewBrief(''); }} className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-95" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="w-full sm:max-w-sm p-6 rounded-t-2xl sm:rounded-2xl animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-semibold mb-2">Delete Project</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>This will permanently delete the project and all its captures. This can&apos;t be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-95" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-3 rounded-xl text-sm font-semibold active:scale-95" style={{ background: 'var(--danger)', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pb-8 max-w-5xl mx-auto">
        {loading ? (
          <div>
            {/* Skeleton: Quick capture bar */}
            <div className="mb-6">
              <div className="skeleton h-3 w-32 mb-2" />
              <div className="flex gap-2">
                <div className="skeleton flex-1 h-12 rounded-xl" />
                <div className="skeleton h-12 w-28 rounded-xl" />
              </div>
            </div>
            {/* Skeleton: Inbox card */}
            <div className="rounded-2xl p-4 mb-6" style={{ border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3">
                <div className="skeleton w-10 h-10 rounded-xl" />
                <div className="flex-1">
                  <div className="skeleton h-4 w-24 mb-2" />
                  <div className="skeleton h-3 w-48" />
                </div>
              </div>
            </div>
            {/* Skeleton: Project cards grid */}
            <div className="project-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                  <div className="skeleton h-52 w-full" style={{ borderRadius: 0 }} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Quick Capture to Inbox */}
            <div className="mb-6">
              <label className="text-xs font-semibold tracking-wide uppercase mb-2 block" style={{ color: 'var(--text-tertiary)' }}>
                Quick capture to Inbox
              </label>
              <div className="flex gap-2">
                <input
                  ref={urlInputRef}
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setFetchError(''); setDuplicateInfo(null); }}
                  onKeyDown={(e) => e.key === 'Enter' && urlInput.trim() && !fetching && handleCheckQuickCapture()}
                  placeholder="Paste a URL..."
                  disabled={fetching}
                  className="flex-1 px-4 py-3 rounded-xl text-sm outline-none disabled:opacity-50"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={handleCheckQuickCapture}
                  disabled={!urlInput.trim() || fetching}
                  className="px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2"
                  style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                >
                  {fetching ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--bg)', borderTopColor: 'transparent' }} />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      Capture
                    </>
                  )}
                </button>
              </div>
              {fetchError && (
                <p className="text-xs mt-1.5 px-1" style={{ color: 'var(--danger)' }}>{fetchError}</p>
              )}
              {duplicateInfo && (
                <div className="mt-2 px-3 py-2.5 rounded-xl text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)40' }}>
                  <span style={{ color: 'var(--accent)' }}>
                    Already captured in <strong>{duplicateInfo.project.name}</strong>
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => router.push(`/project/${duplicateInfo.project.id}`)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors"
                      style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    >
                      Go to existing
                    </button>
                    <button
                      onClick={handleCaptureAnyway}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors"
                      style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                    >
                      Capture anyway
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Inbox Card */}
            {inboxProject && (
              <div
                className="inbox-card rounded-2xl p-4 cursor-pointer mb-6"
                onClick={() => inboxProject && router.push(`/project/${inboxProject.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-dim)' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                      <path d="M3 8l3.89 5.42a2 2 0 001.64.86h6.94a2 2 0 001.64-.86L21 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Inbox</h3>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                        {inboxProject.captureCount || 0}
                      </span>
                    </div>
                    {inboxProject.captureCount > 0 && inboxProject.latestTitle ? (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-tertiary)' }}>
                        Latest: {inboxProject.latestTitle}
                      </p>
                    ) : (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        Paste a URL above to start capturing
                      </p>
                    )}
                  </div>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            )}

            {/* Onboarding Hero — shown when no captures yet */}
            {totalCaptures === 0 && !loading && (
              <div className="py-8 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                  Welcome to Bild
                </h2>
                <p className="text-base font-medium mb-3" style={{ color: 'var(--accent)' }}>
                  Curate the internet for Claude.
                </p>
                <p className="text-sm max-w-md mx-auto mb-8" style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  Paste any URL — Reddit posts, X threads, GitHub repos, articles — and Bild extracts the content, images, and metadata. Organize into projects, add your context, and package everything as a PDF ready for Claude&apos;s project files.
                </p>

                <div className="text-left max-w-md mx-auto">
                  <p className="text-xs font-semibold tracking-wide uppercase mb-3" style={{ color: 'var(--text-tertiary)' }}>
                    Try one of these
                  </p>
                  <div className="flex flex-col gap-2">
                    {[
                      { platform: 'reddit', color: '#FF4500', label: 'Reddit', title: 'A popular discussion thread', url: 'https://www.reddit.com/r/technology/comments/1j0ixq9/' },
                      { platform: 'twitter', color: '#1DA1F2', label: 'X', title: 'An interesting thread', url: 'https://x.com/kaborojevic/status/1895848794612543905' },
                      { platform: 'github', color: '#8B5CF6', label: 'GitHub', title: 'Claude Code repository', url: 'https://github.com/anthropics/claude-code' },
                      { platform: 'article', color: '#10B981', label: 'Article', title: 'Anthropic Economic Index analysis', url: 'https://simonwillison.net/2025/Feb/7/anthropic-economic-index/' },
                    ].map((example) => (
                      <button
                        key={example.url}
                        onClick={() => { setUrlInput(example.url); urlInputRef.current?.focus(); }}
                        className="w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]"
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: example.color }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block" style={{ color: 'var(--text-primary)' }}>{example.title}</span>
                          <span className="text-[11px] block truncate" style={{ color: 'var(--text-tertiary)' }}>{example.url}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0" style={{ background: example.color + '20', color: example.color }}>
                          {example.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar */}
            {totalCaptures > 0 && (
              <div className="mb-4">
                <div className="relative">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }}>
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search all captures..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Search Results */}
            {searchQuery.trim() ? (
              <div>
                <p className="text-xs mb-3 px-1" style={{ color: 'var(--text-tertiary)' }}>
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
                </p>
                {searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No captures match your search</p>
                  </div>
                ) : (
                  <div className="capture-grid stagger-children">
                    {searchResults.map((capture) => {
                      const hasImage = capture.images && capture.images.length > 0 && capture.platform !== 'github';
                      const tag = getUniqueContentTag(capture);
                      const projectName = searchProjectMap[capture.projectId]?.name || 'Unknown';
                      return (
                        <div
                          key={capture.id}
                          className="capture-card rounded-2xl overflow-hidden cursor-pointer"
                          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                          onClick={() => router.push(`/project/${capture.projectId}`)}
                        >
                          {hasImage ? (
                            <div className="relative w-full" style={{ height: '140px' }}>
                              <img src={capture.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const parent = (e.target as HTMLImageElement).closest('.relative') as HTMLElement | null; if (parent) parent.style.display = 'none'; }} />
                              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, transparent 60%)' }} />
                              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: (platformColors[capture.platform] || platformColors.other) + 'dd', color: '#fff', backdropFilter: 'blur(4px)' }}>
                                  {capture.platform === 'twitter' ? 'X' : capture.platform === 'reddit' ? 'Reddit' : capture.platform === 'github' ? 'GitHub' : 'Article'}
                                </span>
                                {tag && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-tertiary)', backdropFilter: 'blur(4px)' }}>
                                  {tag}
                                </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="relative w-full overflow-hidden" style={{ height: '100px', background: platformGradients[capture.platform] || platformGradients.other }}>
                              <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.08 }}>
                                {capture.platform === 'twitter' && <svg width="60" height="60" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                                {capture.platform === 'reddit' && <svg width="60" height="60" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.67 0-6.64-2.07-6.64-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.19 9.55 9.97 9 12 9c0 0 1.69-4.47 1.84-4.83.04-.1.13-.17.24-.18l3.32-.44c.18-.48.63-.83 1.17-.83.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25c-.52 0-.96-.32-1.15-.77l-2.97.39-1.52 4.02c1.97.04 3.69.58 5.09 1.56.36-.34.85-.55 1.38-.55 1.1 0 2 .9 2 2a2 2 0 01-1.2 1.83z"/></svg>}
                                {capture.platform === 'github' && <svg width="60" height="60" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>}
                                {(capture.platform === 'article' || capture.platform === 'other') && <svg width="60" height="60" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>}
                              </div>
                              <div className="absolute inset-0 flex items-center justify-center gap-3 px-3">
                                {capture.platform === 'twitter' && capture.metadata && (
                                  <div className="flex items-center gap-3 text-white">
                                    {(capture.metadata as Record<string, number>).likes > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).likes)}</div><div className="text-[9px] opacity-80">likes</div></div>
                                    )}
                                    {(capture.metadata as Record<string, number>).retweets > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).retweets)}</div><div className="text-[9px] opacity-80">reposts</div></div>
                                    )}
                                    {(capture.metadata as Record<string, number>).views > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).views)}</div><div className="text-[9px] opacity-80">views</div></div>
                                    )}
                                  </div>
                                )}
                                {capture.platform === 'reddit' && capture.metadata && (
                                  <div className="flex items-center gap-3 text-white">
                                    {(capture.metadata as Record<string, number>).score > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).score)}</div><div className="text-[9px] opacity-80">points</div></div>
                                    )}
                                    {(capture.metadata as Record<string, number>).numComments > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).numComments)}</div><div className="text-[9px] opacity-80">comments</div></div>
                                    )}
                                  </div>
                                )}
                                {capture.platform === 'github' && capture.metadata && (
                                  <div className="flex items-center gap-3 text-white">
                                    {(capture.metadata as Record<string, number>).stars > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).stars)}</div><div className="text-[9px] opacity-80">stars</div></div>
                                    )}
                                    {(capture.metadata as Record<string, number>).forks > 0 && (
                                      <div className="text-center"><div className="text-lg font-bold">{formatCompact((capture.metadata as Record<string, number>).forks)}</div><div className="text-[9px] opacity-80">forks</div></div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="absolute inset-x-0 bottom-0 h-8" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, transparent 100%)' }} />
                              <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                                  {capture.platform === 'twitter' ? 'X' : capture.platform === 'reddit' ? 'Reddit' : capture.platform === 'github' ? 'GitHub' : 'Article'}
                                </span>
                                {tag && (
                                <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
                                  {tag}
                                </span>
                                )}
                              </div>
                            </div>
                          )}
                          <div className="p-4" style={{ marginTop: hasImage ? '-20px' : '-10px', position: 'relative' }}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                                {projectName}
                              </span>
                            </div>
                            <h3 className="text-[15px] font-bold mb-1.5 line-clamp-2" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              {capture.title}
                            </h3>
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)', maxWidth: '60%' }}>{capture.author}</span>
                              <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{formatDate(capture.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                {/* View All Captures link */}
                {totalCaptures > 0 && (
                  <div
                    className="mb-6 flex items-center justify-between px-1 cursor-pointer group"
                    onClick={() => router.push('/all')}
                  >
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="text-sm font-medium group-hover:underline" style={{ color: 'var(--text-secondary)' }}>
                        View all captures
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                        {totalCaptures}
                      </span>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                {/* Project Cards */}
                {projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="6.5" cy="6" r="0.75" fill="currentColor" />
                        <circle cx="9.5" cy="6" r="0.75" fill="currentColor" />
                      </svg>
                    </div>
                    <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>No projects yet</p>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Create one to start curating</p>
                  </div>
                ) : (
                  <div className="project-grid stagger-children">
                    {projects.map((project) => (
                      <div
                        key={project.id}
                        className="project-card-hero group rounded-2xl overflow-hidden cursor-pointer relative"
                        style={{ border: '1px solid var(--border-subtle)' }}
                        onClick={() => router.push(`/project/${project.id}`)}
                      >
                        {/* Hero image background */}
                        <div className="relative h-52 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                          {project.coverImage ? (
                            <img
                              src={project.coverImage}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{
                              background: 'linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-elevated) 100%)'
                            }}>
                              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--border)' }}>
                                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                                <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                              </svg>
                            </div>
                          )}

                          {/* Dark gradient overlay for text readability */}
                          <div className="absolute inset-0" style={{
                            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)'
                          }} />

                          {/* Delete button */}
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                            className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: 'var(--text-secondary)' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                          </button>

                          {/* Overlaid text content at bottom */}
                          <div className="absolute inset-x-0 bottom-0 p-4 z-10">
                            <h3 className="text-lg font-semibold truncate text-white">
                              {project.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              {/* Platform dots */}
                              {project.platforms.length > 0 && (
                                <div className="flex items-center gap-1">
                                  {project.platforms.map(p => (
                                    <div
                                      key={p}
                                      className="w-2 h-2 rounded-full"
                                      style={{ background: platformColors[p] || platformColors.other }}
                                      title={p}
                                    />
                                  ))}
                                </div>
                              )}
                              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                                {project.captureCount || 0} capture{(project.captureCount || 0) !== 1 ? 's' : ''}
                              </span>
                              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>·</span>
                              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                {formatDate(project.updatedAt)}
                              </span>
                            </div>
                            {project.latestTitle && (
                              <p className="text-xs mt-1.5 truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {project.latestTitle}
                              </p>
                            )}
                            {!project.latestTitle && project.captureCount === 0 && (
                              <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                No captures yet
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[70] animate-toast-in" style={{ transform: 'translateX(-50%)' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-lg" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {toast}
          </div>
        </div>
      )}
    </main>
  );
}
