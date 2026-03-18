'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getSharedCapture,
  getSharedProject,
  getSharedProjectCaptures,
  exportCaptureAsMarkdown,
  slugify,
  decodeEntities,
  type Project,
  type Capture,
} from '@/lib/db';
import { CaptureMetadataHeader, GITHUB_LANG_COLORS } from '@/components/CaptureRenderer';

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  reddit: { label: 'Reddit', color: '#FF4500' },
  twitter: { label: 'X', color: '#1DA1F2' },
  github: { label: 'GitHub', color: '#8B5CF6' },
  article: { label: 'Article', color: '#10B981' },
  other: { label: 'Other', color: '#6B7280' },
};


export default function SharedCapturePage() {
  const params = useParams();
  const projectId = params.id as string;
  const captureId = params.captureId as string;

  const [capture, setCapture] = useState<Capture | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        getSharedCapture(captureId, projectId),
        getSharedProject(projectId),
      ]);
      if (!c || !p) {
        setNotFound(true);
        return;
      }
      setCapture(c);
      setProject(p);

      // Get total capture count
      const captures = await getSharedProjectCaptures(projectId);
      setCaptureCount(captures.length);
    } catch (e) {
      console.error('Failed to load shared capture:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [captureId, projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!capture || !project) return;
    document.title = `${decodeEntities(capture.title)} — ${project.name} — Sift`;
  }, [capture, project]);

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function renderMarkdownLine(line: string, key: string): React.ReactNode {
    function renderInline(text: string): React.ReactNode[] {
      const parts: React.ReactNode[] = [];
      const regex = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
      let lastIndex = 0;
      let match;
      let partKey = 0;
      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) parts.push(decodeEntities(text.slice(lastIndex, match.index)));
        if (match[1]) parts.push(<strong key={partKey++} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{decodeEntities(match[2])}</strong>);
        else if (match[3]) parts.push(<code key={partKey++} className="font-mono text-[0.9em] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg)', color: 'var(--accent)' }}>{decodeEntities(match[4])}</code>);
        else if (match[5]) parts.push(<a key={partKey++} href={match[7]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{decodeEntities(match[6])}</a>);
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < text.length) parts.push(decodeEntities(text.slice(lastIndex)));
      return parts;
    }

    const h1Match = line.match(/^# (.+)$/);
    if (h1Match) return <h2 key={key} className="font-bold mt-8 mb-3" style={{ fontSize: '22px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h1Match[1])}</h2>;
    const h2Match = line.match(/^## (.+)$/);
    if (h2Match) return <h3 key={key} className="font-bold mt-7 mb-2" style={{ fontSize: '19px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h2Match[1])}</h3>;
    const h3Match = line.match(/^### (.+)$/);
    if (h3Match) return <h4 key={key} className="font-semibold mt-5 mb-2" style={{ fontSize: '17px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{renderInline(h3Match[1])}</h4>;

    if (/^---+$/.test(line.trim())) return <hr key={key} className="my-6" style={{ border: 'none', borderTop: '1px solid var(--border-subtle)' }} />;

    const ulMatch = line.match(/^[-*] (.+)$/);
    if (ulMatch) return <div key={key} className="flex gap-2 ml-1 mb-1"><span style={{ color: 'var(--text-tertiary)' }}>&#x2022;</span><span>{renderInline(ulMatch[1])}</span></div>;

    if (line.startsWith('> ')) return <blockquote key={key} className="pl-4 my-1" style={{ borderLeft: '3px solid var(--border)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>;

    if (line.trim() === '') return <div key={key} className="h-3" />;

    return <p key={key} className="mb-1">{renderInline(line)}</p>;
  }

  function renderMarkdownBody(body: string): React.ReactNode[] {
    const lines = body.split('\n');
    const elements: React.ReactNode[] = [];
    let i = 0;
    while (i < lines.length) {
      if (lines[i].startsWith('```')) {
        const lang = lines[i].slice(3).trim();
        const codeLines: string[] = [];
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        i++;
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
      <main className="min-h-dvh safe-top safe-bottom">
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      </main>
    );
  }

  if (notFound || !capture || !project) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
            <path d="M12 9v4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Not found</h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text-tertiary)', maxWidth: '320px' }}>
          This capture doesn&apos;t exist or the project isn&apos;t shared publicly.
        </p>
        <a href="/login" className="px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          Sign in to Sift
        </a>
      </main>
    );
  }

  const hasOgImage = capture.platform === 'article' ? !!(capture.metadata as Record<string, unknown>)?.hasOgImage : true;
  const hasImage = capture.images && capture.images.length > 0 && capture.platform !== 'github' && hasOgImage;

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      {/* Hero section — constrained, rounded, centered; GitHub gets language accent bar */}
      {capture.platform === 'github' ? (
        <div className="w-full" style={{ height: '6px', background: GITHUB_LANG_COLORS[(capture.metadata as Record<string, string>)?.language] || PLATFORM_LABELS.github.color }} />
      ) : hasImage ? (
        <div className="mx-auto px-5 pt-6" style={{ maxWidth: '720px' }}>
          <img src={capture.images[0]} alt="" className="w-full rounded-lg object-cover mx-auto" style={{ maxHeight: '300px' }} loading="lazy" referrerPolicy="no-referrer" />
        </div>
      ) : null}

      {/* Content */}
      <article className="mx-auto px-5 py-8" style={{ maxWidth: '720px' }}>
        {/* Platform-aware metadata */}
        <CaptureMetadataHeader capture={capture} />

        {/* Title */}
        <h1 className="font-bold mb-8" style={{ color: 'var(--text-primary)', fontSize: '32px', lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          {decodeEntities(capture.title)}
        </h1>

        {/* Full body */}
        {capture.body?.includes('[image:') ? (
          <div style={{ fontSize: '17px', lineHeight: 1.8, color: 'var(--text-secondary)', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {capture.body.split(/(\[image:[^\]]+\])/).map((part, i) => {
              const imgMatch = part.match(/^\[image:(.+)\]$/);
              if (imgMatch) {
                return (
                  <div key={i} className="w-full my-8">
                    <img 
                      src={imgMatch[1]} 
                      alt="Article image" 
                      className="w-full h-auto rounded-xl" 
                      style={{ border: '1px solid var(--border-subtle)', maxWidth: '100%', objectFit: 'contain' }} 
                      loading="lazy" 
                      referrerPolicy="no-referrer" 
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                  </div>
                );
              }
              return part ? <div key={i}>{renderMarkdownBody(part)}</div> : null;
            })}
          </div>
        ) : (
          <>
            {capture.images && capture.images.length > 1 && (
              <div className="mb-8 space-y-4">
                {capture.images.slice(1).map((img, i) => (
                  <img key={i} src={img} alt={`Image ${i + 2}`} className="w-full rounded-xl" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ))}
              </div>
            )}
            <div style={{ fontSize: '17px', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
              {renderMarkdownBody(capture.body)}
            </div>
          </>
        )}

        {/* Actions: View original + Package for Claude */}
        <div className="flex items-center gap-4 mt-6 mb-2">
          <a href={capture.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-mono" style={{ color: 'var(--accent)' }}>
            View original
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4h6v6M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <button
            onClick={() => {
              const md = exportCaptureAsMarkdown(project.name, capture);
              const blob = new Blob([md], { type: 'text/markdown' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${slugify(capture.title)}.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="inline-flex items-center gap-1.5 text-sm font-mono"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Package for Claude
          </button>
        </div>

        {/* Curator's annotation */}
        {capture.note && (
          <div className="mt-10 mb-6">
            <div className="pl-5 py-1" style={{ borderLeft: '3px solid rgba(232, 255, 71, 0.4)' }}>
              <p className="text-[11px] font-semibold tracking-widest uppercase mb-2" style={{ color: 'var(--accent)' }}>Curator&apos;s note</p>
              <p className="text-[15px]" style={{ color: 'var(--text-primary)', lineHeight: 1.7, fontStyle: 'italic' }}>{decodeEntities(capture.note)}</p>
            </div>
          </div>
        )}
      </article>

      {/* From this collection */}
      <div className="mx-auto px-5 pb-8" style={{ maxWidth: '720px' }}>
        <div className="rounded-2xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="currentColor"/></svg>
            </div>
            <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: 'var(--text-tertiary)' }}>
              From this collection
            </span>
          </div>
          <a
            href={`/p/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-colors hover:opacity-80"
            style={{ color: 'var(--accent)' }}
          >
            View all {captureCount} capture{captureCount !== 1 ? 's' : ''} in {project.name}
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </div>

      {/* Made with Sift — curator's signature */}
      <footer className="py-14 mt-8" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="max-w-5xl mx-auto px-5 flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[13px] font-medium tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Curated with
            </span>
            <span className="text-[13px] font-bold" style={{ color: 'var(--accent)' }}>Sift</span>
          </div>
          <p className="text-xs mb-6" style={{ color: 'var(--text-tertiary)', maxWidth: '320px', lineHeight: 1.6 }}>
            Capture, organize, and package knowledge for Claude.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            Start curating
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </footer>
    </main>
  );
}
