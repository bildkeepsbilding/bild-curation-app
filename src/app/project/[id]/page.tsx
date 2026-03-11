'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getProject,
  getCaptures,
  addCapture,
  deleteCapture,
  updateCapture,
  updateProject,
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
  const [editingBrief, setEditingBrief] = useState(false);
  const [briefText, setBriefText] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const briefInputRef = useRef<HTMLTextAreaElement>(null);

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
  useEffect(() => { if (editingBrief && briefInputRef.current) briefInputRef.current.focus(); }, [editingBrief]);

  const filteredCaptures = activeFilter === 'all'
    ? captures
    : captures.filter(c => c.platform === activeFilter);

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
    const md = await exportProjectAsMarkdown(projectId, activeFilter);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCopyForClaude() {
    const md = await exportProjectAsMarkdown(projectId, activeFilter);
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

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function truncate(text: string, len: number) {
    return text.length > len ? text.slice(0, len) + '...' : text;
  }

  // Strip [image:...] markers for preview text
  function cleanBody(text: string) {
    return text.replace(/\[image:[^\]]+\]\n?\n?/g, '');
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
          parts.push(<code key={partKey++} className="font-mono text-[0.9em] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>{match[4]}</code>);
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
    if (line.startsWith('> ')) return <blockquote key={key} className="pl-4 my-1" style={{ borderLeft: '3px solid var(--border)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>;

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
          <pre key={`code-${i}`} className="rounded-xl px-4 py-3 my-4 overflow-x-auto text-sm font-mono" style={{ background: 'var(--bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
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

      {/* ── Capture Detail View ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
          {/* Top bar */}
          <div className="flex items-center justify-between px-5 py-3 safe-top" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => { setViewing(null); setEditingNote(false); }} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <button onClick={() => handleDelete(viewing)} className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Delete</button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-auto">
            {/* Hero image full-bleed */}
            {viewing.images && viewing.images.length > 0 && !viewing.body?.includes('[image:') && (
              <div className="w-full" style={{ maxHeight: '320px', overflow: 'hidden' }}>
                <img src={viewing.images[0]} alt="" className="w-full object-cover" style={{ maxHeight: '320px' }} referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            )}

            {/* Reading column */}
            <div className="mx-auto px-5 py-6" style={{ maxWidth: '720px' }}>
              {/* Title */}
              <h1 className="font-bold mb-4" style={{ color: 'var(--text-primary)', fontSize: '24px', lineHeight: 1.3 }}>
                {viewing.title}
              </h1>

              {/* Metadata bar */}
              <div className="flex flex-wrap items-center gap-2 mb-6 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: PLATFORM_LABELS[viewing.platform]?.color + '20', color: PLATFORM_LABELS[viewing.platform]?.color }}>
                  {PLATFORM_LABELS[viewing.platform]?.label}
                </span>
                {Boolean(viewing.metadata?.isArticle) && viewing.platform === 'twitter' && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: '#8B5CF620', color: '#8B5CF6' }}>
                    Article
                  </span>
                )}
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{viewing.author}</span>
                <span style={{ color: 'var(--border)' }}>·</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatTime(viewing.createdAt)}</span>

                {/* Engagement stats inline */}
                {viewing.metadata && viewing.platform === 'twitter' && (
                  <>
                    {viewing.metadata.likes != null && <><span style={{ color: 'var(--border)' }}>·</span><span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>♥ {String(viewing.metadata.likes)}</span></>}
                    {viewing.metadata.retweets != null && <><span style={{ color: 'var(--border)' }}>·</span><span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>⟲ {String(viewing.metadata.retweets)}</span></>}
                    {viewing.metadata.views != null && <><span style={{ color: 'var(--border)' }}>·</span><span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>👁 {String(viewing.metadata.views)}</span></>}
                  </>
                )}
                {viewing.metadata && viewing.platform === 'reddit' && (
                  <>
                    <span style={{ color: 'var(--border)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>r/{String(viewing.metadata.subreddit)}</span>
                    <span style={{ color: 'var(--border)' }}>·</span>
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>↑{String(viewing.metadata.score)}</span>
                  </>
                )}
                {viewing.metadata && viewing.platform === 'github' && (
                  <>
                    {viewing.metadata.stars != null && <><span style={{ color: 'var(--border)' }}>·</span><span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>⭐ {String(viewing.metadata.stars)}</span></>}
                    {viewing.metadata.language && <><span style={{ color: 'var(--border)' }}>·</span><span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{String(viewing.metadata.language)}</span></>}
                  </>
                )}
              </div>

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
                    <div className="mb-6 space-y-3">
                      {viewing.images.slice(1).map((img, i) => (
                        <img key={i} src={img} alt={`Image ${i + 2}`} className="w-full rounded-xl" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
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
                      placeholder="Why did you save this? How should Claude use it? What&apos;s the key takeaway?"
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
                      Why did you save this? How should Claude use it?
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

      {/* ── Project Brief ── */}
      <div className="px-5 mb-4">
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--accent)', flexShrink: 0 }}>
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: 'var(--accent)' }}>Project Brief</p>
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

      {/* ── URL Input ── */}
      <div className="px-5 mb-4">
        <div className="flex gap-2">
          <input ref={urlInputRef} type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setFetchError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()} placeholder="Paste any URL (Reddit, X, GitHub, articles...)" className="flex-1 px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} disabled={fetching} />
          <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetching} className="px-5 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            {fetching ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--bg)', borderTopColor: 'transparent' }} /> : 'Capture'}
          </button>
        </div>
        {fetchError && <p className="text-xs mt-2 px-1" style={{ color: 'var(--danger)' }}>{fetchError}</p>}
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
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Paste any URL above to start curating</p>
          </div>
        ) : filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No {PLATFORM_LABELS[activeFilter]?.label} captures yet</p>
          </div>
        ) : (
          <div className="capture-grid stagger-children">
            {filteredCaptures.map((capture) => {
              const hasImage = capture.images && capture.images.length > 0 && capture.platform !== 'github';
              const bodyPreview = cleanBody(capture.body.split('\n---')[0]);
              return (
                <button
                  key={capture.id}
                  onClick={() => setViewing(capture)}
                  className="capture-card w-full text-left rounded-2xl overflow-hidden transition-all"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                >
                  {/* Hero image with gradient fade */}
                  {hasImage && (
                    <div className="relative w-full" style={{ height: '160px' }}>
                      <img src={capture.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const parent = (e.target as HTMLImageElement).closest('.relative') as HTMLElement | null; if (parent) parent.style.display = 'none'; }} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, transparent 60%)' }} />
                      {/* Platform badge overlaid */}
                      <span className="absolute top-3 left-3 px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + 'dd', color: '#fff', backdropFilter: 'blur(4px)' }}>
                        {PLATFORM_LABELS[capture.platform]?.label}
                      </span>
                    </div>
                  )}

                  <div className="p-4" style={{ marginTop: hasImage ? '-24px' : '0', position: 'relative' }}>
                    {/* Platform badge when no image */}
                    {!hasImage && (
                      <div className="mb-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + '20', color: PLATFORM_LABELS[capture.platform]?.color }}>
                          {PLATFORM_LABELS[capture.platform]?.label}
                        </span>
                      </div>
                    )}

                    {/* Title — 2 lines max */}
                    <h3 className="text-sm font-semibold mb-1.5 line-clamp-2" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {capture.title}
                    </h3>

                    {/* Body preview — 2-3 lines */}
                    <p className="text-xs mb-3 line-clamp-3" style={{ color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      {truncate(bodyPreview, 160)}
                    </p>

                    {/* Author + timestamp footer */}
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)', maxWidth: '60%' }}>{capture.author}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{formatTime(capture.createdAt)}</span>
                    </div>

                    {/* Context for Claude indicator */}
                    {capture.note && (
                      <p className="text-[10px] mt-2 px-2 py-1 rounded-lg truncate" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>🧠 {truncate(capture.note, 50)}</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
