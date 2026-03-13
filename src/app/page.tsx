'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, getCaptures, getAllCaptures, getProjectMap, createProject, deleteProject, ensureInbox, getUniqueContentTag, decodeEntities, type Project, type Capture } from '@/lib/db';
import UserMenu from '@/components/UserMenu';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

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
  const [totalCaptures, setTotalCaptures] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Capture[]>([]);
  const [searchProjectMap, setSearchProjectMap] = useState<Record<string, Project>>({});
  const [searchCache, setSearchCache] = useState<{ captures: Capture[]; projectMap: Record<string, Project> } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [unsortedCollapsed, setUnsortedCollapsed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
      if (e.key === 'Escape') {
        if (deleteConfirm) { setDeleteConfirm(null); return; }
        if (showCreate) { setShowCreate(false); setNewName(''); setNewBrief(''); return; }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirm, showCreate]);

  async function loadProjects() {
    try {
      await ensureInbox();

      const [p, allCaptures] = await Promise.all([
        getProjects(),
        getAllCaptures(),
      ]);

      setTotalCaptures(allCaptures.length);

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

  const platformLabels: Record<string, string> = {
    twitter: 'X',
    reddit: 'Reddit',
    github: 'GitHub',
    article: 'Article',
    other: 'Other',
  };

  function formatCompact(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toString();
  }

  // Generate a unique gradient from a project name — used as left border accent
  function nameToGradient(name: string): string {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 40 + Math.abs((hash >> 8) % 30)) % 360;
    return `linear-gradient(180deg, hsl(${h1}, 50%, 40%) 0%, hsl(${h2}, 40%, 28%) 100%)`;
  }

  const regularProjectCount = projects.length;

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      {/* Header */}
      <header className="px-5 pt-10 pb-6 flex items-end justify-between max-w-3xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Sift
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {regularProjectCount} project{regularProjectCount !== 1 ? 's' : ''} · {totalCaptures} capture{totalCaptures !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all active:scale-95"
            style={{
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

      <div className="px-5 pb-8 max-w-3xl mx-auto">
        {loading ? (
          <div>
            {/* Skeleton: Unsorted tray */}
            <div className="skeleton h-14 w-full rounded-xl mb-6" />
            {/* Skeleton: Search */}
            <div className="skeleton h-9 w-full rounded-lg mb-8" />
            {/* Skeleton: Project list */}
            <div className="flex flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="skeleton h-20 w-full rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Unsorted Tray — pinned above projects */}
            {inboxProject && (
              <div
                className="unsorted-tray rounded-xl mb-6"
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  onClick={() => setUnsortedCollapsed(!unsortedCollapsed)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Collapse toggle */}
                    <svg
                      width="12" height="12" viewBox="0 0 16 16" fill="none"
                      className="flex-shrink-0 transition-transform"
                      style={{
                        color: 'var(--text-tertiary)',
                        transform: unsortedCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      }}
                    >
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Unsorted
                    </span>
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                      style={{
                        background: inboxProject.captureCount > 0 ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                        color: inboxProject.captureCount > 0 ? 'var(--accent)' : 'var(--text-tertiary)',
                      }}
                    >
                      {inboxProject.captureCount || 0}
                    </span>
                    {/* Latest capture preview — only when expanded and has captures */}
                    {!unsortedCollapsed && inboxProject.captureCount > 0 && inboxProject.latestTitle && (
                      <span className="text-xs truncate hidden sm:inline" style={{ color: 'var(--text-tertiary)' }}>
                        {decodeEntities(inboxProject.latestTitle)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/project/${inboxProject.id}`); }}
                    className="flex items-center gap-1 text-xs font-medium flex-shrink-0 px-2 py-1 rounded-md transition-colors"
                    style={{ color: 'var(--text-secondary)', background: 'transparent' }}
                  >
                    Review
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
                {/* Expanded state — empty message */}
                {!unsortedCollapsed && inboxProject.captureCount === 0 && (
                  <div className="px-4 pb-3">
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
                      Captures waiting to be sorted will appear here
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Onboarding Hero — shown when no captures yet */}
            {totalCaptures === 0 && !loading && (
              <div className="py-12 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
                  Welcome to Sift
                </h2>
                <p className="text-base font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Curate the internet for Claude.
                </p>
                <p className="text-sm max-w-md mx-auto mb-6" style={{ color: 'var(--text-tertiary)', lineHeight: 1.7 }}>
                  Use the Chrome extension to capture URLs — Reddit posts, X threads, GitHub repos, articles — then organize into projects and package for Claude.
                </p>
              </div>
            )}

            {/* Search Bar — quiet filter utility */}
            {totalCaptures > 0 && (
              <div className="mb-8">
                <div className="relative">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search captures..."
                    className="w-full pl-9 pr-4 py-2 rounded-lg text-[13px] outline-none"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
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
                  <div className="flex flex-col gap-2 stagger-children">
                    {searchResults.map((capture) => {
                      const projectName = searchProjectMap[capture.projectId]?.name || 'Unknown';
                      return (
                        <div
                          key={capture.id}
                          className="search-result-card rounded-xl px-4 py-3 cursor-pointer transition-colors"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onClick={() => router.push(`/project/${capture.projectId}`)}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                              style={{ background: platformColors[capture.platform] || platformColors.other }}
                            />
                            <div className="flex-1 min-w-0">
                              <h4 className="text-[14px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                                {decodeEntities(capture.title)}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{projectName}</span>
                                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>·</span>
                                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{capture.author}</span>
                                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>·</span>
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{formatDate(capture.createdAt)}</span>
                              </div>
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
                    className="mb-10 flex items-center justify-between px-1 cursor-pointer group"
                    onClick={() => router.push('/all')}
                  >
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                        <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      <span className="text-[13px] font-medium group-hover:underline" style={{ color: 'var(--text-secondary)' }}>
                        View all captures
                      </span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                        {totalCaptures}
                      </span>
                    </div>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}

                {/* Project Cards — text-forward research folders */}
                {projects.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-16 h-16 rounded-xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
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
                  <div className="flex flex-col gap-2 stagger-children">
                    {projects.map((project) => {
                      const summaryLine = project.brief
                        ? project.brief.split('\n')[0]
                        : project.latestTitle
                          ? decodeEntities(project.latestTitle)
                          : null;

                      return (
                        <div
                          key={project.id}
                          className="project-folder group rounded-xl cursor-pointer relative overflow-hidden"
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                          }}
                          onClick={() => router.push(`/project/${project.id}`)}
                        >
                          {/* Name-hashed gradient left border */}
                          <div
                            className="absolute left-0 top-0 bottom-0 w-[3px]"
                            style={{ background: nameToGradient(project.name) }}
                          />

                          <div className="pl-5 pr-4 py-4 flex items-center gap-4">
                            <div className="flex-1 min-w-0">
                              {/* Project name */}
                              <h3 className="text-[15px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                {project.name}
                              </h3>
                              {/* Summary line */}
                              <p className="text-[13px] mt-0.5 truncate" style={{
                                color: summaryLine ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                                opacity: summaryLine ? 1 : 0.5,
                              }}>
                                {summaryLine || 'No captures yet'}
                              </p>
                              {/* Metadata line */}
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                                  {project.captureCount || 0} capture{(project.captureCount || 0) !== 1 ? 's' : ''}
                                </span>
                                {project.platforms.length > 0 && (
                                  <>
                                    <span style={{ color: 'var(--text-tertiary)', opacity: 0.3 }}>·</span>
                                    <div className="flex items-center gap-1.5">
                                      {project.platforms.map(p => (
                                        <div
                                          key={p}
                                          className="w-[6px] h-[6px] rounded-full"
                                          style={{ background: platformColors[p] || platformColors.other }}
                                          title={platformLabels[p] || p}
                                        />
                                      ))}
                                    </div>
                                  </>
                                )}
                                <span style={{ color: 'var(--text-tertiary)', opacity: 0.3 }}>·</span>
                                <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
                                  {formatDate(project.updatedAt)}
                                </span>
                              </div>
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              style={{ color: 'var(--text-tertiary)' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                            </button>

                            {/* Chevron */}
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0" style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>
                              <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        </div>
                      );
                    })}
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

      <PwaInstallPrompt />
    </main>
  );
}
