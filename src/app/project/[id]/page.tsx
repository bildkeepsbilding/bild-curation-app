'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getProject,
  getProjects,
  getCaptures,
  addCapture,
  deleteCapture,
  deleteProject,
  updateCapture,
  updateProject,
  moveCapture,
  copyCapture,
  reorderCapture,
  findCaptureByUrl,
  getUniqueContentTag,
  decodeEntities,
  type Project,
  type Capture,
  type Platform,
} from '@/lib/db';
import { exportProjectAsPdf, exportCapturePdf } from '@/lib/pdf-export';
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
  const [activeFilter, setActiveFilter] = useState<Platform | 'all'>('all');
  const [editingBrief, setEditingBrief] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Capture | null>(null);
  const [moveTarget, setMoveTarget] = useState<Capture | null>(null);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [editingCapture, setEditingCapture] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameText, setProjectNameText] = useState('');
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false);
  const [copyTarget, setCopyTarget] = useState<Capture | null>(null);
  const [copyProjects, setCopyProjects] = useState<Project[]>([]);
  const [duplicateInfo, setDuplicateInfo] = useState<{ capture: Capture; project: Project } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showExportConfirm, setShowExportConfirm] = useState(false);
  const [optimisticUrl, setOptimisticUrl] = useState<string | null>(null);
  const [optimisticError, setOptimisticError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const briefInputRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
  // Close card menu on click outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);
  useEffect(() => { if (editingBrief && briefInputRef.current) briefInputRef.current.focus(); }, [editingBrief]);
  useEffect(() => { if (editingProjectName && projectNameInputRef.current) projectNameInputRef.current.focus(); }, [editingProjectName]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Escape: close topmost modal (highest z-index first)
      if (e.key === 'Escape') {
        if (confirmDelete) { setConfirmDelete(null); return; }
        if (moveTarget) { setMoveTarget(null); return; }
        if (copyTarget) { setCopyTarget(null); return; }
        if (confirmDeleteProject) { setConfirmDeleteProject(false); return; }
        if (showExportConfirm) { setShowExportConfirm(false); return; }
        if (duplicateInfo) { setDuplicateInfo(null); return; }
        if (viewing) { setViewing(null); setEditingNote(false); return; }
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
  }, [confirmDelete, moveTarget, copyTarget, confirmDeleteProject, showExportConfirm, duplicateInfo, viewing]);

  const isInbox = project?.is_inbox ?? false;

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

  async function handleCheckDuplicate() {
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
    await doFetchUrl(url);
  }

  async function handleCaptureAnyway() {
    setDuplicateInfo(null);
    await doFetchUrl(urlInput.trim());
  }

  async function doFetchUrl(url: string) {
    if (!url) return;
    setFetching(true);
    setFetchError('');
    setOptimisticUrl(url);
    setOptimisticError(null);
    setUrlInput('');

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
      await addCapture(projectId, url, data.title, data.body, data.author, data.images || [], data.metadata || {}, quickNote.trim());
      setOptimisticUrl(null);
      setQuickNote('');
      await loadData();
      showToast(project ? `Captured to ${project.name}` : 'Captured');
    } catch (e) {
      setOptimisticError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setFetching(false);
    }
  }

  async function handleExport() {
    if (!project) return;
    setExporting(true);
    setExportStatus('Preparing...');
    try {
      const blob = await exportProjectAsPdf(project, captures, activeFilter, (stage, detail) => {
        setExportStatus(detail ? `${stage} ${detail}` : stage);
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${project.name || 'project'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('PDF export failed:', e);
    } finally {
      setExporting(false);
      setExportStatus('');
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

  async function handleSaveBrief() {
    if (!project) return;
    try {
      await updateProject(projectId, { brief: briefText });
      setProject({ ...project, brief: briefText });
      setEditingBrief(false);
    } catch (e) {
      console.error('Save brief failed:', e);
    }
  }

  async function handleSaveProjectName() {
    if (!project || isInbox) return;
    const name = projectNameText.trim();
    if (!name) return;
    try {
      await updateProject(projectId, { name });
      setProject({ ...project, name });
      setEditingProjectName(false);
    } catch (e) {
      console.error('Rename failed:', e);
    }
  }

  async function handleToggleShare() {
    if (!project) return;
    const newValue = !project.share;
    setProject({ ...project, share: newValue });
    try {
      await updateProject(projectId, { share: newValue });
      if (newValue) {
        const url = `${window.location.origin}/p/${projectId}`;
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        showToast('Link copied to clipboard');
        setTimeout(() => setShareCopied(false), 2000);
      } else {
        showToast('Sharing disabled');
      }
    } catch (e) {
      console.error('Toggle share failed:', e);
      setProject({ ...project, share: !newValue });
    }
  }

  function handleCopyShareLink() {
    const url = `${window.location.origin}/p/${projectId}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    showToast('Link copied');
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function handleDeleteProject() {
    if (isInbox) return;
    try {
      await deleteProject(projectId);
      router.push('/');
    } catch (e) {
      console.error('Delete project failed:', e);
    }
  }

  async function handleCardExportPdf(capture: Capture) {
    if (!project) return;
    setMenuOpen(null);
    try {
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
    setConfirmDelete(null);
    setViewing(null);
    setDeletingId(captureId);
    // Wait for animation to complete
    await new Promise(r => setTimeout(r, 300));
    try {
      await deleteCapture(captureId, projectId);
      setDeletingId(null);
      await loadData();
    } catch (e) {
      setDeletingId(null);
      console.error('Delete failed:', e);
    }
  }

  async function handleMoveCapture(toProjectId: string) {
    if (!moveTarget) return;
    try {
      await moveCapture(moveTarget.id, projectId, toProjectId);
      setMoveTarget(null);
      setViewing(null);
      await loadData();
    } catch (e) {
      console.error('Move failed:', e);
    }
  }

  async function handleOpenMoveModal(capture: Capture) {
    setMenuOpen(null);
    setMoveTarget(capture);
    try {
      const projects = await getProjects();
      setAllProjects(projects.filter(p => p.id !== projectId));
    } catch (e) {
      console.error('Load projects failed:', e);
    }
  }

  async function handleOpenCopyModal(capture: Capture) {
    setMenuOpen(null);
    setCopyTarget(capture);
    try {
      const projects = await getProjects();
      setCopyProjects(projects.filter(p => p.id !== projectId));
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

  async function handleReorder(captureId: string, direction: 'up' | 'down') {
    try {
      await reorderCapture(projectId, captureId, direction);
      await loadData();
    } catch (e) {
      console.error('Reorder failed:', e);
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

  // Strip markdown formatting and [image:...] markers for clean preview text
  function cleanBody(text: string) {
    return text
      .replace(/\[image:[^\]]+\]\n?\n?/g, '')           // [image:...] markers
      .replace(/^#{1,6}\s+/gm, '')                       // # headers
      .replace(/\*\*(.+?)\*\*/g, '$1')                   // **bold**
      .replace(/\*(.+?)\*/g, '$1')                        // *italic*
      .replace(/__(.+?)__/g, '$1')                        // __bold__
      .replace(/_(.+?)_/g, '$1')                          // _italic_
      .replace(/~~(.+?)~~/g, '$1')                        // ~~strikethrough~~
      .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')             // `code` and ```code```
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')            // [link](url) → link
      .replace(/^\s*[-*+]\s+/gm, '')                      // - list items
      .replace(/^\s*\d+\.\s+/gm, '')                      // 1. ordered list items
      .replace(/^\s*>\s?/gm, '')                           // > blockquotes
      .replace(/\n{3,}/g, '\n\n')                          // collapse excess newlines
      .trim();
  }

  // Basic markdown rendering for GitHub READMEs and other content
  function renderMarkdownLine(line: string, key: string): React.ReactNode {
    // Render inline markdown: **bold**, `code`, [links](url)
    function renderInline(text: string): React.ReactNode[] {
      const parts: React.ReactNode[] = [];
      // Combined regex: **bold**, `code`, [link](url)
      const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
      let lastIndex = 0;
      let match;
      let partKey = 0;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          parts.push(text.slice(lastIndex, match.index));
        }
        if (match[1]) {
          // **bold**
          parts.push(<strong key={partKey++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{match[2]}</strong>);
        } else if (match[3]) {
          // `code`
          parts.push(<code key={partKey++} className="font-mono text-[0.9em] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>{match[4]}</code>);
        } else if (match[5]) {
          // [link](url)
          parts.push(<a key={partKey++} href={match[7]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{match[6]}</a>);
        }
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) {
        parts.push(text.slice(lastIndex));
      }
      return parts;
    }

    // Headers: # through ####
    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) return <h2 key={key} className="font-bold mt-8 mb-3" style={{ fontSize: '22px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h1Match[1])}</h2>;
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) return <h3 key={key} className="font-bold mt-7 mb-2" style={{ fontSize: '19px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h2Match[1])}</h3>;
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) return <h4 key={key} className="font-semibold mt-5 mb-2" style={{ fontSize: '17px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{renderInline(h3Match[1])}</h4>;
    const h4Match = line.match(/^#### (.+)$/);
    if (h4Match) return <h5 key={key} className="font-semibold mt-4 mb-1" style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{renderInline(h4Match[1])}</h5>;

    // Horizontal rule
    if (/^---+$/.test(line.trim())) return <hr key={key} className="my-6" style={{ border: 'none', borderTop: '1px solid var(--border-subtle)' }} />;

    // Unordered list item
    const ulMatch = line.match(/^[-*] (.+)$/);
    if (ulMatch) return <div key={key} className="flex gap-2 ml-1 mb-1"><span style={{ color: 'var(--text-tertiary)' }}>•</span><span>{renderInline(ulMatch[1])}</span></div>;

    // Blockquote
    if (line.startsWith('> ')) return <blockquote key={key} className="pl-4 my-2" style={{ borderLeft: '2px solid var(--border)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>;

    // Empty line = paragraph break
    if (line.trim() === '') return <div key={key} className="h-3" />;

    // Regular text with inline formatting
    return <p key={key} className="mb-1">{renderInline(line)}</p>;
  }

  // Render full body with markdown support, handling code blocks
  function renderMarkdownBody(body: string): React.ReactNode[] {
    const lines = body.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < lines.length) {
      // Fenced code block: ```
      if (lines[i].startsWith('```')) {
        const lang = lines[i].slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++; // skip closing ```
        elements.push(
          <pre key={`code-${i}`} className="rounded-lg px-4 py-3 my-4 overflow-x-auto text-[13px]" style={{ background: 'var(--bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace" }}>
            {lang && <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>{lang}</div>}
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        continue;
      }

      elements.push(renderMarkdownLine(lines[i], `line-${i}`));
      i++;
    }

    return elements;
  }

  if (loading) {
    return (
      <main className="min-h-dvh safe-top safe-bottom">
        {/* Skeleton header */}
        <header className="px-5 pt-6 pb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="skeleton w-8 h-8 rounded-lg" />
            <div>
              <div className="skeleton h-5 w-40 mb-2" />
              <div className="skeleton h-3 w-24" />
            </div>
          </div>
          <div className="skeleton h-9 w-36 rounded-full" />
        </header>
        {/* Skeleton URL input */}
        <div className="px-5 mb-4">
          <div className="flex gap-2">
            <div className="skeleton flex-1 h-12 rounded-xl" />
            <div className="skeleton h-12 w-24 rounded-xl" />
          </div>
        </div>
        {/* Skeleton capture cards */}
        <div className="px-5 pb-8">
          <div className="capture-grid">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
                <div className="skeleton h-40 w-full" style={{ borderRadius: 0 }} />
                <div className="p-4">
                  <div className="skeleton h-3 w-16 mb-3 rounded" />
                  <div className="skeleton h-4 w-full mb-2" />
                  <div className="skeleton h-4 w-3/4 mb-3" />
                  <div className="skeleton h-3 w-full mb-1" />
                  <div className="skeleton h-3 w-2/3 mb-3" />
                  <div className="flex justify-between">
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-3 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center px-5">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Project not found</p>
        <button onClick={() => router.push('/')} className="mt-3 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Go back</button>
      </div>
    );
  }

  return (
    <main className="min-h-dvh safe-top safe-bottom">

      {/* ── Capture Detail View ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-6 py-3 safe-top" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => { setViewing(null); setEditingNote(false); }} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <button onClick={() => setConfirmDelete(viewing)} className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Delete</button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {/* Hero image — constrained, rounded, centered; skip for GitHub repos (show language accent bar instead) */}
            {viewing.platform === 'github' ? (
              <div className="w-full" style={{ height: '6px', background: GITHUB_LANG_COLORS[(viewing.metadata as Record<string, string>)?.language] || PLATFORM_LABELS.github.color }} />
            ) : viewing.images && viewing.images.length > 0 && !viewing.body?.includes('[image:') ? (
              <div className="px-5 pt-5">
                <img src={viewing.images[0]} alt="" className="w-full rounded-lg object-cover mx-auto" style={{ maxHeight: '300px' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            ) : null}

            {/* Reading column */}
            <div className="mx-auto px-8 py-6" style={{ maxWidth: '720px' }}>
              {/* Title */}
              <h1 className="font-bold mb-4" style={{ color: 'var(--text-primary)', fontSize: '28px', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {decodeEntities(viewing.title)}
              </h1>

              {/* Metadata bar */}
              <CaptureMetadataHeader capture={viewing} />

              {/* Body with article typography and markdown rendering */}
              {viewing.body?.includes('[image:') ? (
                <div style={{ fontSize: '16px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                  {viewing.body.split(/(\[image:[^\]]+\])/).map((part, i) => {
                    const imgMatch = part.match(/^\[image:(.+)\]$/);
                    if (imgMatch) {
                      return <img key={i} src={imgMatch[1]} alt="Article image" className="w-full rounded-xl my-6" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />;
                    }
                    return part ? <div key={i}>{renderMarkdownBody(part)}</div> : null;
                  })}
                </div>
              ) : (
                <>
                  {viewing.images && viewing.images.length > 1 && (
                    <div className="mb-8 grid grid-cols-2 gap-2">
                      {viewing.images.slice(1).map((img, i) => (
                        <img key={i} src={img} alt={`Image ${i + 2}`} className="w-full h-auto rounded-lg object-cover" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '16px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                    {renderMarkdownBody(viewing.body)}
                  </div>
                </>
              )}

              {/* View original link */}
              <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-6 mb-2 text-xs font-mono" style={{ color: 'var(--accent)' }}>
                View original
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4h6v6M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </a>

              {/* Context for Claude — prominent briefing section */}
              <div className="mt-8 mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid var(--accent)40', background: 'var(--accent-dim)' }}>
                <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor" />
                  </svg>
                  <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--accent)' }}>Context for Claude</p>
                </div>
                {editingNote ? (
                  <div className="px-4 pb-3">
                    <textarea
                      ref={noteInputRef}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="Why are you saving this? What should Claude focus on?"
                      rows={4}
                      className="w-full px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
                      <button onClick={handleSaveNote} className="px-4 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                    </div>
                  </div>
                ) : viewing.note ? (
                  <button onClick={() => { setNoteText(viewing.note || ''); setEditingNote(true); }} className="w-full text-left px-4 pb-3">
                    <p className="text-sm" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>{viewing.note}</p>
                    <p className="text-[10px] mt-2" style={{ color: 'var(--text-tertiary)' }}>Tap to edit</p>
                  </button>
                ) : (
                  <button onClick={() => { setNoteText(''); setEditingNote(true); }} className="w-full text-left px-4 pb-4">
                    <p className="text-sm" style={{ color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      Why are you saving this? What should Claude focus on?
                    </p>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => router.push('/')} className="flex items-center gap-1 text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Projects
          </button>
          <UserMenu />
        </div>
        <div className="flex items-end justify-between">
          <div className="flex-1 min-w-0">
            {editingProjectName && !isInbox ? (
              <div className="flex items-center gap-2">
                <input
                  ref={projectNameInputRef}
                  value={projectNameText}
                  onChange={(e) => setProjectNameText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveProjectName(); if (e.key === 'Escape') setEditingProjectName(false); }}
                  className="text-xl font-bold tracking-tight px-2 py-1 rounded-lg outline-none flex-1 min-w-0"
                  style={{ color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
                  maxLength={50}
                />
                <button onClick={handleSaveProjectName} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                <button onClick={() => setEditingProjectName(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1
                  className={`text-xl font-bold tracking-tight truncate ${!isInbox ? 'cursor-pointer hover:opacity-80' : ''}`}
                  style={{ color: 'var(--text-primary)' }}
                  onClick={() => { if (!isInbox) { setProjectNameText(project.name); setEditingProjectName(true); } }}
                  title={!isInbox ? 'Click to rename' : undefined}
                >
                  {project.name}
                </h1>
                {!isInbox && (
                  <button
                    onClick={() => setConfirmDeleteProject(true)}
                    className="p-1.5 rounded-lg transition-colors flex-shrink-0 hover:bg-white/10"
                    style={{ color: 'var(--text-tertiary)' }}
                    title="Delete project"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m2 0v12a2 2 0 01-2 2H9a2 2 0 01-2-2V7h10z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                )}
              </div>
            )}
            <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--text-tertiary)' }}>
              {captures.length} capture{captures.length !== 1 ? 's' : ''}
            </p>
          </div>
          {!isInbox && captures.length > 0 && (
            <div className="flex-shrink-0 ml-3 hidden sm:flex items-center gap-2">
              {/* Share toggle */}
              <div className="flex items-center gap-2">
                {project.share && (
                  <button
                    onClick={handleCopyShareLink}
                    className="flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium transition-all"
                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                    title="Copy share link"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.5" /></svg>
                    {shareCopied ? 'Copied!' : 'Copy link'}
                  </button>
                )}
                <button
                  onClick={handleToggleShare}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-all"
                  style={{
                    background: project.share ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                    color: project.share ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    border: `1px solid ${project.share ? 'var(--border)' : 'var(--border)'}`,
                  }}
                  title={project.share ? 'Sharing on — click to disable' : 'Share this project publicly'}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  {project.share ? 'Shared' : 'Share'}
                </button>
              </div>
              <button onClick={() => setShowExportConfirm(true)} disabled={exporting} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all" style={{ background: exporting ? 'var(--bg-elevated)' : 'var(--accent)', color: exporting ? 'var(--text-secondary)' : 'var(--bg)', border: exporting ? '1px solid var(--border)' : '1px solid var(--accent)', opacity: exporting ? 0.8 : 1 }}>
                {exporting ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/><path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                )}
                {exporting ? exportStatus || 'Packaging...' : 'Package for Claude'}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Project Brief (hidden for Unsorted) ── */}
      {!isInbox && (
        <div className="px-5 mb-4">
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>Project Brief</p>
            </div>
            {editingBrief ? (
              <div className="px-4 pb-3">
                <textarea
                  ref={briefInputRef}
                  value={briefText}
                  onChange={(e) => setBriefText(e.target.value)}
                  placeholder="What is this project about? What are you trying to learn or build?"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
                />
                <div className="flex gap-2 mt-2 justify-end">
                  <button onClick={() => setEditingBrief(false)} className="px-3 py-1 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
                  <button onClick={handleSaveBrief} className="px-4 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setBriefText(project?.brief || ''); setEditingBrief(true); }} className="w-full text-left px-4 pb-3 pt-1">
                <p className="text-sm" style={{ color: project?.brief ? 'var(--text-secondary)' : 'var(--text-tertiary)', lineHeight: 1.5 }}>
                  {project?.brief || 'What is this project about? What are you trying to learn or build?'}
                </p>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Context for Claude — the thinking space ── */}
      <div className="px-5 mb-5">
        <div className="rounded-2xl overflow-hidden context-note-input" style={{ background: 'rgba(232, 255, 71, 0.04)', border: '1px solid rgba(232, 255, 71, 0.15)', transition: 'border-color 0.2s, box-shadow 0.2s' }}>
          <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M15.232 5.232l3.536 3.536M9 13l-2 2v3h3l9-9a2.5 2.5 0 00-3.536-3.536L9 13z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[11px] font-semibold tracking-wide uppercase" style={{ color: 'var(--accent)' }}>Context for Claude</p>
          </div>
          <div className="px-4 pb-4 pt-1">
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="Why are you saving this? What should Claude focus on?"
              rows={2}
              className="w-full text-sm outline-none resize-none"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', lineHeight: 1.7, padding: 0 }}
            />
          </div>
        </div>
      </div>

      {/* ── URL Input ── */}
      <div className="px-5 mb-4">
        <div className="flex gap-2">
          <input ref={urlInputRef} type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setFetchError(''); setDuplicateInfo(null); }} onKeyDown={(e) => e.key === 'Enter' && handleCheckDuplicate()} placeholder="Paste any URL (Reddit, X, GitHub, articles...)" className="flex-1 px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} disabled={fetching} />
          <button onClick={handleCheckDuplicate} disabled={!urlInput.trim() || fetching} className="px-5 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30 flex items-center gap-2" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            {fetching ? (
              <>
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--bg)', borderTopColor: 'transparent' }} />
                Capturing...
              </>
            ) : 'Capture'}
          </button>
        </div>
        {fetchError && <p className="text-xs mt-2 px-1" style={{ color: fetching ? 'var(--text-tertiary)' : 'var(--danger)' }}>{fetchError}</p>}
        {duplicateInfo && (
          <div className="mt-2 px-3 py-2.5 rounded-xl text-xs flex items-center justify-between gap-3" style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)40' }}>
            <span style={{ color: 'var(--accent)' }}>
              Already captured in <strong>{duplicateInfo.project.name}</strong>
            </span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={() => router.push(`/project/${duplicateInfo.project.id}`)} className="px-2.5 py-1 rounded-lg font-medium" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Go to existing</button>
              <button onClick={handleCaptureAnyway} className="px-2.5 py-1 rounded-lg font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Capture anyway</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Platform Filter Tabs ── */}
      {captures.length > 0 && (
        <div className="px-5 mb-5">
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

      {/* ── Captures Grid ── */}
      <div className="px-5 pb-24 sm:pb-8">
        {captures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--accent-dim)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)' }}>
                <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 10-5.656-5.656l-1.102 1.101" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No captures yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Paste any URL above to start curating</p>
          </div>
        ) : filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No {PLATFORM_LABELS[activeFilter]?.label} captures yet</p>
          </div>
        ) : (
          <div className="capture-grid stagger-children">
            {/* Optimistic capture card — shows while extracting */}
            {optimisticUrl && (
              <div className="capture-card rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                {optimisticError ? (
                  <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: 'var(--danger-dim)', color: 'var(--danger)' }}>Error</span>
                    </div>
                    <p className="text-sm font-semibold mb-1.5 line-clamp-2" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>{optimisticError}</p>
                    <p className="text-[11px] mb-3 truncate" style={{ color: 'var(--text-tertiary)' }}>{optimisticUrl}</p>
                    <div className="flex gap-2">
                      <button onClick={() => { setOptimisticUrl(null); setOptimisticError(null); }} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>Dismiss</button>
                      <button onClick={() => { setOptimisticError(null); doFetchUrl(optimisticUrl); }} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Retry</button>
                    </div>
                  </div>
                ) : (
                  <div className="optimistic-card">
                    <div className="skeleton h-40 w-full" style={{ borderRadius: 0 }} />
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 rounded-full border-2 animate-spin flex-shrink-0" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                        <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>Extracting content...</span>
                      </div>
                      <div className="skeleton h-4 w-full mb-2" />
                      <div className="skeleton h-4 w-3/4 mb-3" />
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{optimisticUrl}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
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
              return (
                <div key={capture.id} className={`capture-card group relative w-full text-left rounded-2xl overflow-hidden transition-all ${deletingId === capture.id ? 'animate-delete-out' : ''}`} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                  {/* Reorder arrows + Three-dot menu */}
                  <div className="absolute top-2 right-2 z-10 flex items-center gap-0.5" ref={menuOpen === capture.id ? menuRef : undefined}>
                    {/* Reorder arrows — visible on hover */}
                    {filteredCaptures.indexOf(capture) > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(capture.id, 'up'); }}
                        className="w-6 h-6 flex items-center justify-center rounded-full transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100 touch-visible"
                        style={{ background: 'var(--bg-elevated)cc', backdropFilter: 'blur(8px)' }}
                        title="Move up"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 12V4M4 8l4-4 4 4" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                    {filteredCaptures.indexOf(capture) < filteredCaptures.length - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReorder(capture.id, 'down'); }}
                        className="w-6 h-6 flex items-center justify-center rounded-full transition-all opacity-0 group-hover:opacity-60 hover:!opacity-100 touch-visible"
                        style={{ background: 'var(--bg-elevated)cc', backdropFilter: 'blur(8px)' }}
                        title="Move down"
                      >
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 4v8M4 8l4 4 4-4" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === capture.id ? null : capture.id); }}
                      className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                      style={{ background: 'var(--bg-elevated)cc', backdropFilter: 'blur(8px)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="3" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /><circle cx="8" cy="8" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /><circle cx="8" cy="13" r="1.25" fill="currentColor" style={{ color: 'var(--text-tertiary)' }} /></svg>
                    </button>
                    {/* Dropdown menu */}
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

                  {/* Card content — clickable to open detail view */}
                  <button
                    onClick={() => { if (!isEditing) setViewing(capture); }}
                    className="w-full text-left"
                    disabled={isEditing}
                  >
                    {/* Hero image or platform gradient fallback */}
                    {hasImage ? (
                      <div className="relative w-full" style={{ height: '120px' }}>
                        <img src={capture.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const parent = (e.target as HTMLImageElement).closest('.relative') as HTMLElement | null; if (parent) parent.style.display = 'none'; }} />
                        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.15) 100%)' }} />
                        <div className="absolute top-3 left-3 flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + 'dd', color: '#fff', backdropFilter: 'blur(4px)' }}>
                            {PLATFORM_LABELS[capture.platform]?.label}
                          </span>
                          {(() => { const tag = getUniqueContentTag(capture); return tag ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}>
                            {tag}
                          </span>
                          ) : null; })()}
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full overflow-hidden" style={{ height: '120px', background: PLATFORM_GRADIENTS[capture.platform] || PLATFORM_GRADIENTS.other }}>
                        {/* Platform watermark icon */}
                        <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.08 }}>
                          {capture.platform === 'twitter' && (
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                          )}
                          {capture.platform === 'reddit' && (
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.67 0-6.64-2.07-6.64-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.19 9.55 9.97 9 12 9c0 0 1.69-4.47 1.84-4.83.04-.1.13-.17.24-.18l3.32-.44c.18-.48.63-.83 1.17-.83.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25c-.52 0-.96-.32-1.15-.77l-2.97.39-1.52 4.02c1.97.04 3.69.58 5.09 1.56.36-.34.85-.55 1.38-.55 1.1 0 2 .9 2 2a2 2 0 01-1.2 1.83zM8.5 12.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm7 0a1.5 1.5 0 100 3 1.5 1.5 0 000-3zm-6.97 4.67c-.08-.08-.08-.22 0-.3.08-.08.22-.08.3 0C9.58 17.62 10.73 18 12 18s2.42-.38 3.17-1.13c.08-.08.22-.08.3 0 .08.08.08.22 0 .3-.87.87-2.13 1.33-3.47 1.33s-2.6-.46-3.47-1.33z"/></svg>
                          )}
                          {capture.platform === 'github' && (
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
                          )}
                          {(capture.platform === 'article' || capture.platform === 'other') && (
                            <svg width="80" height="80" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                          )}
                        </div>
                        {/* Engagement stats overlay */}
                        <div className="absolute inset-0 flex items-center justify-center gap-4 px-4">
                          {capture.platform === 'twitter' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).likes > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).likes)}</div>
                                  <div className="text-[10px] opacity-80">likes</div>
                                </div>
                              )}
                              {(capture.metadata as Record<string, number>).retweets > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).retweets)}</div>
                                  <div className="text-[10px] opacity-80">reposts</div>
                                </div>
                              )}
                              {(capture.metadata as Record<string, number>).views > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).views)}</div>
                                  <div className="text-[10px] opacity-80">views</div>
                                </div>
                              )}
                            </div>
                          )}
                          {capture.platform === 'reddit' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).score > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).score)}</div>
                                  <div className="text-[10px] opacity-80">points</div>
                                </div>
                              )}
                              {(capture.metadata as Record<string, number>).numComments > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).numComments)}</div>
                                  <div className="text-[10px] opacity-80">comments</div>
                                </div>
                              )}
                            </div>
                          )}
                          {capture.platform === 'github' && capture.metadata && (
                            <div className="flex items-center gap-4 text-white">
                              {(capture.metadata as Record<string, number>).stars > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).stars)}</div>
                                  <div className="text-[10px] opacity-80">stars</div>
                                </div>
                              )}
                              {(capture.metadata as Record<string, number>).forks > 0 && (
                                <div className="text-center">
                                  <div className="text-xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact((capture.metadata as Record<string, number>).forks)}</div>
                                  <div className="text-[10px] opacity-80">forks</div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Bottom gradient for text fade */}
                        <div className="absolute inset-x-0 bottom-0 h-10" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, transparent 100%)' }} />
                        {/* Platform badge */}
                        <div className="absolute top-3 left-3 flex items-center gap-1">
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(4px)' }}>
                            {PLATFORM_LABELS[capture.platform]?.label}
                          </span>
                          {(() => { const tag = getUniqueContentTag(capture); return tag ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
                            {tag}
                          </span>
                          ) : null; })()}
                        </div>
                      </div>
                    )}

                    <div className="p-4" style={{ marginTop: hasImage ? '-24px' : '-12px', position: 'relative' }}>

                      {/* Title — editable or static */}
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

                      {/* Context for Claude — editable or indicator */}
                      {isEditing ? (
                        <textarea
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Why are you saving this? What should Claude focus on?"
                          rows={2}
                          className="w-full mt-2.5 px-3 py-2 rounded-lg text-[12px] outline-none resize-none"
                          style={{ background: 'rgba(232, 255, 71, 0.04)', border: '1px solid rgba(232, 255, 71, 0.2)', color: 'var(--text-primary)', lineHeight: 1.5 }}
                        />
                      ) : capture.note ? (
                        <div className="mt-2.5 pl-3 py-1.5" style={{ borderLeft: '2px solid rgba(232, 255, 71, 0.3)' }}>
                          <span className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{decodeEntities(truncate(capture.note, 80))}</span>
                        </div>
                      ) : null}
                    </div>
                  </button>

                  {/* Edit save/cancel buttons */}
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

      {/* ── Delete Confirmation Modal ── */}
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

      {/* ── Move to Project Modal ── */}
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

      {/* ── Copy to Project Modal ── */}
      {copyTarget && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-sm sm:mx-4 rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Copy to project</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Copy &ldquo;{truncate(copyTarget.title, 40)}&rdquo; — original stays in this project</p>
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

      {/* ── Delete Project Confirmation Modal ── */}
      {confirmDeleteProject && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full sm:max-w-sm sm:mx-4 p-5 rounded-t-2xl sm:rounded-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete project?</h3>
            <p className="text-sm mb-5" style={{ color: 'var(--text-tertiary)' }}>Delete &ldquo;{project.name}&rdquo; and all its captures? This can&apos;t be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDeleteProject(false)} className="px-4 py-2 rounded-xl text-sm" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleDeleteProject} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--danger)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Export Confirmation Modal ── */}
      {showExportConfirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={(e) => { if (e.target === e.currentTarget) setShowExportConfirm(false); }}>
          <div className="w-full sm:max-w-sm sm:mx-4 p-5 rounded-t-2xl sm:rounded-2xl animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Package for Claude</h3>
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Captures</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{filteredCaptures.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Images</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{filteredCaptures.reduce((sum, c) => sum + (c.images?.length || 0), 0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span style={{ color: 'var(--text-secondary)' }}>Context notes</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>{filteredCaptures.filter(c => c.note).length}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowExportConfirm(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={() => { setShowExportConfirm(false); handleExport(); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile Sticky Export Bar ── */}
      {!isInbox && captures.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden safe-bottom" style={{ background: 'var(--bg-elevated)ee', backdropFilter: 'blur(12px)', borderTop: '1px solid var(--border)' }}>
          <div className="px-5 py-3">
            <button onClick={() => setShowExportConfirm(true)} disabled={exporting} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all" style={{ background: exporting ? 'var(--bg-hover)' : 'var(--accent)', color: exporting ? 'var(--text-secondary)' : 'var(--bg)', border: exporting ? '1px solid var(--border)' : '1px solid var(--accent)' }}>
              {exporting ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="animate-spin"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" opacity="0.25"/><path d="M12 2a10 10 0 019.75 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              )}
              {exporting ? exportStatus || 'Packaging...' : 'Package for Claude'}
            </button>
          </div>
        </div>
      )}

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
