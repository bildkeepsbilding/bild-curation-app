'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  getAllCaptures,
  getProjects,
  getProjectMap,
  getProject,
  deleteCapture,
  updateCapture,
  moveCapture,
  copyCapture,
  getUniqueContentTag,
  decodeEntities,
  type Project,
  type Capture,
  type Platform,
} from '@/lib/db';
import { exportCapturePdf } from '@/lib/pdf-export';
import UserMenu from '@/components/UserMenu';
import { CaptureMetadataHeader, GITHUB_LANG_COLORS } from '@/components/CaptureRenderer';

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

const PLATFORM_GRADIENTS: Record<string, string> = {
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

export default function AllCapturesPage() {
  const router = useRouter();

  const [captures, setCaptures] = useState<Capture[]>([]);
  const [projectMap, setProjectMap] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<Platform | 'all'>('all');
  const [viewing, setViewing] = useState<Capture | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Capture | null>(null);
  const [moveTarget, setMoveTarget] = useState<Capture | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [copyTarget, setCopyTarget] = useState<Capture | null>(null);
  const [copyProjects, setCopyProjects] = useState<Project[]>([]);
  const [editingCapture, setEditingCapture] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [c, pm] = await Promise.all([getAllCaptures(), getProjectMap()]);
      setCaptures(c);
      setProjectMap(pm);
    } catch (e) {
      console.error('Failed to load captures:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => { if (editingNote && noteInputRef.current) noteInputRef.current.focus(); }, [editingNote]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (confirmDelete) { setConfirmDelete(null); return; }
        if (moveTarget) { setMoveTarget(null); return; }
        if (copyTarget) { setCopyTarget(null); return; }
        if (viewing) { setViewing(null); setEditingNote(false); return; }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDelete, moveTarget, copyTarget, viewing]);

  const filteredCaptures = useMemo(() =>
    activeFilter === 'all'
      ? captures
      : captures.filter(c => c.platform === activeFilter),
    [captures, activeFilter]
  );

  const platformCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of captures) {
      counts[c.platform] = (counts[c.platform] || 0) + 1;
    }
    return counts;
  }, [captures]);

  async function handleCardExportPdf(capture: Capture) {
    setMenuOpen(null);
    try {
      const project = await getProject(capture.projectId);
      if (!project) return;
      const blob = await exportCapturePdf(project, capture);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${capture.title.slice(0, 40).replace(/[^a-zA-Z0-9 ]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF export failed:', e);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return;
    const captureId = confirmDelete.id;
    const captureProjectId = confirmDelete.projectId;
    setConfirmDelete(null);
    setViewing(null);
    setDeletingId(captureId);
    await new Promise(r => setTimeout(r, 300));
    try {
      await deleteCapture(captureId, captureProjectId);
      setDeletingId(null);
      await loadData();
    } catch (e) {
      setDeletingId(null);
      console.error('Delete failed:', e);
    }
  }

  async function handleOpenMoveModal(capture: Capture) {
    setMenuOpen(null);
    setMoveTarget(capture);
    try {
      const projects = await getProjects();
      setAllProjects(projects.filter(p => p.id !== capture.projectId));
    } catch (e) {
      console.error('Load projects failed:', e);
    }
  }

  async function handleMoveCapture(toProjectId: string) {
    if (!moveTarget) return;
    try {
      await moveCapture(moveTarget.id, moveTarget.projectId, toProjectId);
      setMoveTarget(null);
      setViewing(null);
      await loadData();
    } catch (e) {
      console.error('Move failed:', e);
    }
  }

  async function handleOpenCopyModal(capture: Capture) {
    setMenuOpen(null);
    setCopyTarget(capture);
    try {
      const projects = await getProjects();
      setCopyProjects(projects.filter(p => p.id !== capture.projectId));
    } catch (e) {
      console.error('Load projects failed:', e);
    }
  }

  async function handleCopyCapture(toProjectId: string) {
    if (!copyTarget) return;
    try {
      await copyCapture(copyTarget.id, toProjectId);
      setCopyTarget(null);
      await loadData();
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  function handleStartEdit(capture: Capture) {
    setMenuOpen(null);
    setEditingCapture(capture.id);
    setEditTitle(capture.title);
    setEditNote(capture.note || '');
  }

  async function handleSaveEdit(captureId: string) {
    try {
      await updateCapture(captureId, { title: editTitle, note: editNote });
      setEditingCapture(null);
      await loadData();
    } catch (e) {
      console.error('Save edit failed:', e);
    }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function truncate(text: string, len: number) {
    return text.length > len ? text.slice(0, len) + '...' : text;
  }

  function cleanBody(text: string) {
    return text
      .replace(/\[image:[^\]]+\]\n?\n?/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Basic markdown rendering for detail view
  function renderMarkdownLine(line: string, key: string): React.ReactNode {
    function renderInline(text: string): React.ReactNode[] {
      const parts: React.ReactNode[] = [];
      const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
      let lastIndex = 0;
      let match;
      let partKey = 0;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
        if (match[1]) parts.push(<strong key={partKey++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[2]}</strong>);
        else if (match[3]) parts.push(<code key={partKey++} className="font-mono text-[0.9em] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>{match[4]}</code>);
        else if (match[5]) parts.push(<a key={partKey++} href={match[7]} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--accent)' }}>{match[6]}</a>);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) parts.push(text.slice(lastIndex));
      return parts;
    }

    const headerMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm', 'text-sm', 'text-sm'];
      return <div key={key} className={`${sizes[level - 1]} font-semibold mt-4 mb-2`} style={{ color: 'var(--text-primary)' }}>{renderInline(headerMatch[2])}</div>;
    }
    if (line.match(/^\s*[-*+]\s+/)) {
      return <div key={key} className="flex gap-2 ml-2 mb-1"><span style={{ color: 'var(--text-tertiary)' }}>&#x2022;</span><span>{renderInline(line.replace(/^\s*[-*+]\s+/, ''))}</span></div>;
    }
    if (line.match(/^\s*\d+\.\s+/)) {
      const num = line.match(/^\s*(\d+)\.\s+/)?.[1] || '';
      return <div key={key} className="flex gap-2 ml-2 mb-1"><span style={{ color: 'var(--text-tertiary)' }}>{num}.</span><span>{renderInline(line.replace(/^\s*\d+\.\s+/, ''))}</span></div>;
    }
    if (line.match(/^\s*>\s?/)) {
      return <div key={key} className="pl-3 my-1" style={{ borderLeft: '2px solid var(--accent)', color: 'var(--text-secondary)' }}>{renderInline(line.replace(/^\s*>\s?/, ''))}</div>;
    }
    if (line.trim() === '') return <div key={key} className="h-3" />;
    return <p key={key} className="mb-2">{renderInline(line)}</p>;
  }

  function renderMarkdownBody(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    return lines.map((line, i) => renderMarkdownLine(line, `line-${i}`));
  }

  if (loading) {
    return (
      <main className="min-h-dvh safe-top safe-bottom">
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      {/* Header */}
      <header className="px-5 pt-8 pb-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <UserMenu />
        </div>
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          All Captures
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
          {captures.length} capture{captures.length !== 1 ? 's' : ''} across {Object.keys(projectMap).length} project{Object.keys(projectMap).length !== 1 ? 's' : ''}
        </p>
      </header>

      {/* Platform filter tabs */}
      <div className="px-5 pb-4 max-w-5xl mx-auto">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {PLATFORMS.map(({ key, label, color }) => {
            const count = key === 'all' ? captures.length : (platformCounts[key] || 0);
            if (key !== 'all' && count === 0) return null;
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  background: isActive ? color + '20' : 'var(--bg-elevated)',
                  color: isActive ? color : 'var(--text-tertiary)',
                  border: `1px solid ${isActive ? color + '40' : 'var(--border-subtle)'}`,
                }}
              >
                {label}
                <span className="text-[10px] opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Captures Grid */}
      <div className="px-5 pb-8 max-w-5xl mx-auto">
        {filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No captures yet</p>
          </div>
        ) : (
          <div className="capture-grid stagger-children">
            {filteredCaptures.map((capture) => {
              const hasOgImage = capture.platform === 'article' ? !!(capture.metadata as Record<string, unknown>)?.hasOgImage : true;
              const hasImage = capture.images && capture.images.length > 0 && capture.platform !== 'github' && hasOgImage;
              let bodyPreview = cleanBody(capture.body.split('\n---')[0]);
              // Deduplicate: if body starts with the title text, trim it
              const titleNorm = capture.title.trim().toLowerCase();
              const bodyNorm = bodyPreview.trim().toLowerCase();
              if (titleNorm && bodyNorm.startsWith(titleNorm)) {
                bodyPreview = bodyPreview.trim().slice(capture.title.trim().length).trim();
              }
              const isEditing = editingCapture === capture.id;
              const projectName = projectMap[capture.projectId]?.name || 'Unknown';
              const contentTag = getUniqueContentTag(capture);
              return (
                <div key={capture.id} className={`capture-card group relative w-full text-left rounded-2xl overflow-hidden transition-all ${deletingId === capture.id ? 'animate-delete-out' : ''}`} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  {/* Three-dot menu */}
                  <div className="absolute top-2 right-2 z-10" ref={menuOpen === capture.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === capture.id ? null : capture.id); }}
                      className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                      style={{ background: 'var(--bg-elevated)cc', backdropFilter: 'blur(8px)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /><circle cx="8" cy="8" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /><circle cx="8" cy="13" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /></svg>
                    </button>
                    {menuOpen === capture.id && (
                      <div className="absolute right-0 top-8 w-44 py-1 rounded-xl shadow-lg z-20" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                        <button onClick={(e) => { e.stopPropagation(); handleCardExportPdf(capture); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Save as PDF
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleStartEdit(capture); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M15.232 5.232l3.536 3.536M9 13l-2 2v3h3l9-9a2.5 2.5 0 00-3.536-3.536L9 13z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Edit
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleOpenMoveModal(capture); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 7h4l3-3h4l3 3h4M5 7v10a2 2 0 002 2h10a2 2 0 002-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Move to project
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleOpenCopyModal(capture); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ color: 'var(--text-secondary)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.5" /></svg>
                          Copy to project
                        </button>
                        <div className="my-1" style={{ borderTop: '1px solid var(--border-subtle)' }} />
                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setConfirmDelete(capture); }} className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/5 transition-colors" style={{ color: 'var(--danger)' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <button
                    onClick={() => { if (!isEditing) setViewing(capture); }}
                    className="w-full text-left"
                    disabled={isEditing}
                  >
                    {hasImage ? (
                      <div className="relative w-full" style={{ height: '120px' }}>
                        <img src={capture.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const parent = (e.target as HTMLImageElement).closest('.relative') as HTMLElement | null; if (parent) parent.style.display = 'none'; }} />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.15) 100%)' }} />
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + 'dd', color: '#fff', backdropFilter: 'blur(4px)' }}>
                            {PLATFORM_LABELS[capture.platform]?.label}
                          </span>
                          {contentTag && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.5)', color: 'var(--text-tertiary)', backdropFilter: 'blur(4px)' }}>
                            {contentTag}
                          </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full overflow-hidden" style={{ height: '120px', background: PLATFORM_GRADIENTS[capture.platform] || PLATFORM_GRADIENTS.other }}>
                        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.08 }}>
                          {capture.platform === 'twitter' && <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
                          {capture.platform === 'reddit' && <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.67 0-6.64-2.07-6.64-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.19 9.55 9.97 9 12 9c0 0 1.69-4.47 1.84-4.83.04-.1.13-.17.24-.18l3.32-.44c.18-.48.63-.83 1.17-.83.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25c-.52 0-.96-.32-1.15-.77l-2.97.39-1.52 4.02c1.97.04 3.69.58 5.09 1.56.36-.34.85-.55 1.38-.55 1.1 0 2 .9 2 2a2 2 0 01-1.2 1.83z"/></svg>}
                          {capture.platform === 'github' && <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>}
                          {(capture.platform === 'article' || capture.platform === 'other') && <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center gap-4 px-4">
                          {capture.platform === 'twitter' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).likes > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).likes)}</div><div className="text-[10px] opacity-80">likes</div></div>
                              )}
                              {(capture.metadata as Record<string, number>).retweets > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).retweets)}</div><div className="text-[10px] opacity-80">reposts</div></div>
                              )}
                              {(capture.metadata as Record<string, number>).views > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).views)}</div><div className="text-[10px] opacity-80">views</div></div>
                              )}
                            </div>
                          )}
                          {capture.platform === 'reddit' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).score > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).score)}</div><div className="text-[10px] opacity-80">points</div></div>
                              )}
                              {(capture.metadata as Record<string, number>).numComments > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).numComments)}</div><div className="text-[10px] opacity-80">comments</div></div>
                              )}
                            </div>
                          )}
                          {capture.platform === 'github' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).stars > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).stars)}</div><div className="text-[10px] opacity-80">stars</div></div>
                              )}
                              {(capture.metadata as Record<string, number>).forks > 0 && (
                                <div className="text-center"><div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).forks)}</div><div className="text-[10px] opacity-80">forks</div></div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, transparent 100%)' }} />
                        <div className="absolute top-3 left-3 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                            {PLATFORM_LABELS[capture.platform]?.label}
                          </span>
                          {contentTag && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
                            {contentTag}
                          </span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-4" style={{ marginTop: hasImage ? '-24px' : '-12px', position: 'relative' }}>
                      <div className="flex items-center gap-2 mb-2">
                        {/* Project label */}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                          {projectName}
                        </span>
                      </div>

                      {isEditing ? (
                        <input
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-full text-sm font-semibold mb-1.5 px-2 py-1 rounded-lg outline-none"
                          style={{ color: 'var(--text-primary)', lineHeight: 1.4, background: 'var(--bg)', border: '1px solid var(--border)' }}
                          autoFocus
                        />
                      ) : (
                        <h3 className="text-[15px] font-bold mb-1.5 line-clamp-2" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {decodeEntities(capture.title)}
                        </h3>
                      )}

                      <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                        {decodeEntities(truncate(bodyPreview, 120))}
                      </p>

                      <div className="flex items-center justify-between">
                        <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)', maxWidth: '60%' }}>{capture.author}</span>
                        <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{formatTime(capture.createdAt)}</span>
                      </div>

                      {isEditing ? (
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Context for Claude..."
                          rows={2}
                          className="w-full mt-2 px-2 py-1.5 rounded-lg text-[11px] outline-none resize-none"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.5 }}
                        />
                      ) : capture.note ? (
                        <div className="flex items-center gap-1.5 mt-2">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="flex-shrink-0" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
                            <path d="M15.232 5.232l3.536 3.536M9 13l-2 2v3h3l9-9a2.5 2.5 0 00-3.536-3.536L9 13z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>{truncate(capture.note, 60)}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>

                  {isEditing && (
                    <div className="flex gap-2 px-4 pb-3 justify-end">
                      <button onClick={() => setEditingCapture(null)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
                      <button onClick={() => handleSaveEdit(capture.id)} className="px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Detail View Modal ── */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="w-full max-w-2xl mx-4 my-8 rounded-2xl overflow-hidden animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
                  {projectMap[viewing.projectId]?.name || 'Unknown'}
                </span>
              </div>
              <button onClick={() => setViewing(null)} className="p-1 rounded-lg flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>

            {/* Hero image — constrained, rounded; GitHub gets language accent bar */}
            {viewing.platform === 'github' ? (
              <div className="w-full" style={{ height: '6px', background: GITHUB_LANG_COLORS[(viewing.metadata as Record<string, string>)?.language] || '#8B5CF6' }} />
            ) : viewing.images && viewing.images.length > 0 ? (
              <div className="px-5 pt-4">
                <img src={viewing.images[0]} alt="" className="w-full rounded-lg object-cover mx-auto" style={{ maxHeight: '300px' }} loading="lazy" referrerPolicy="no-referrer" />
              </div>
            ) : null}

            {/* Content */}
            <div className="px-5 py-4">
              <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{decodeEntities(viewing.title)}</h2>
              <CaptureMetadataHeader capture={viewing} />
              <div className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {renderMarkdownBody(viewing.body)}
              </div>

              {/* Additional images */}
              {viewing.images && viewing.images.length > 1 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {viewing.images.slice(1).map((img, i) => (
                    <img key={i} src={img} alt="" className="w-full rounded-lg object-cover" style={{ maxHeight: '200px' }} loading="lazy" referrerPolicy="no-referrer" />
                  ))}
                </div>
              )}
            </div>

            {/* Context for Claude */}
            <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--accent)' }}>Context for Claude</span>
                <button onClick={() => { setEditingNote(!editingNote); setNoteText(viewing.note || ''); }} className="text-[10px] px-2 py-0.5 rounded" style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-subtle)' }}>
                  {editingNote ? 'Cancel' : (viewing.note ? 'Edit' : 'Add')}
                </button>
              </div>
              {editingNote ? (
                <div>
                  <textarea
                    ref={noteInputRef}
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Why did you save this? What should Claude focus on?"
                    rows={3}
                    className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                    style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={async () => {
                        await updateCapture(viewing.id, { note: noteText });
                        setViewing({ ...viewing, note: noteText });
                        setEditingNote(false);
                        await loadData();
                      }}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : viewing.note ? (
                <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{viewing.note}</p>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>No context added yet</p>
              )}
            </div>

            {/* Footer with source link */}
            <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)' }}>{formatTime(viewing.createdAt)}</span>
              <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: 'var(--accent)' }}>View source</a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-sm sm:mx-4 p-5 rounded-t-2xl sm:rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete this capture?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>This can&apos;t be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleConfirmDelete} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--danger)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Project Modal */}
      {moveTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Move to project</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Select a destination for &ldquo;{truncate(moveTarget.title, 40)}&rdquo;</p>
            </div>
            <div className="max-h-64 overflow-auto">
              {allProjects.length === 0 ? (
                <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>No other projects</p>
              ) : (
                allProjects.map(p => (
                  <button key={p.id} onClick={() => handleMoveCapture(p.id)} className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.captureCount} capture{p.captureCount !== 1 ? 's' : ''}</span>
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setMoveTarget(null)} className="w-full py-2 rounded-xl text-sm" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Copy to Project Modal */}
      {copyTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Copy to project</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Copy &ldquo;{truncate(copyTarget.title, 40)}&rdquo; — original stays in current project</p>
            </div>
            <div className="max-h-64 overflow-auto">
              {copyProjects.length === 0 ? (
                <p className="px-5 py-6 text-sm text-center" style={{ color: 'var(--text-tertiary)' }}>No other projects</p>
              ) : (
                copyProjects.map(p => (
                  <button key={p.id} onClick={() => handleCopyCapture(p.id)} className="w-full text-left px-5 py-3 flex items-center justify-between hover:bg-white/5 transition-colors" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{p.captureCount} capture{p.captureCount !== 1 ? 's' : ''}</span>
                  </button>
                ))
              )}
            </div>
            <div className="px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button onClick={() => setCopyTarget(null)} className="w-full py-2 rounded-xl text-sm" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
