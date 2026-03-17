'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getSharedCapture,
  getSharedProject,
  getSharedProjectCaptures,
  decodeEntities,
  type Project,
  type Capture,
} from '@/lib/db';
import { CaptureMetadataHeader } from '@/components/CaptureRenderer';

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
  const platLabel = PLATFORM_LABELS[capture.platform] || PLATFORM_LABELS.other;
  const m = capture.metadata as Record<string, number | string> | undefined;

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      {/* Hero section */}
      {hasImage ? (
        <div className="relative w-full" style={{ maxHeight: '400px', overflow: 'hidden' }}>
          <img src={capture.images[0]} alt="" className="w-full object-cover" style={{ maxHeight: '400px' }} loading="lazy" referrerPolicy="no-referrer" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.1) 100%)' }} />
        </div>
      ) : (
        <div className="relative w-full" style={{ height: '200px', background: PLATFORM_GRADIENTS[capture.platform] || PLATFORM_GRADIENTS.other }}>
          <div className="absolute inset-0 flex items-center justify-center" style={{ opacity: 0.08 }}>
            {capture.platform === 'twitter' && <svg width="120" height="120" viewBox="0 0 24 24" fill="white"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>}
            {capture.platform === 'reddit' && <svg width="120" height="120" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.8 11.33c.02.16.03.33.03.5 0 2.55-2.97 4.63-6.63 4.63-3.67 0-6.64-2.07-6.64-4.63 0-.17.01-.33.03-.5A1.98 1.98 0 013.4 12c0-1.1.9-2 2-2 .53 0 1.01.21 1.37.55C8.19 9.55 9.97 9 12 9c0 0 1.69-4.47 1.84-4.83.04-.1.13-.17.24-.18l3.32-.44c.18-.48.63-.83 1.17-.83.69 0 1.25.56 1.25 1.25s-.56 1.25-1.25 1.25c-.52 0-.96-.32-1.15-.77l-2.97.39-1.52 4.02c1.97.04 3.69.58 5.09 1.56.36-.34.85-.55 1.38-.55 1.1 0 2 .9 2 2a2 2 0 01-1.2 1.83z"/></svg>}
            {capture.platform === 'github' && <svg width="120" height="120" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>}
            {(capture.platform === 'article' || capture.platform === 'other') && <svg width="120" height="120" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>}
          </div>
          {/* Engagement stats overlay */}
          <div className="absolute inset-0 flex items-center justify-center gap-6 px-4">
            {capture.platform === 'twitter' && m && (
              <div className="flex items-center gap-6 text-white">
                {Number(m.likes) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.likes))}</div><div className="text-xs opacity-80">likes</div></div>}
                {Number(m.retweets) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.retweets))}</div><div className="text-xs opacity-80">reposts</div></div>}
                {Number(m.views) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.views))}</div><div className="text-xs opacity-80">views</div></div>}
              </div>
            )}
            {capture.platform === 'reddit' && m && (
              <div className="flex items-center gap-6 text-white">
                {Number(m.score) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.score))}</div><div className="text-xs opacity-80">points</div></div>}
                {Number(m.numComments) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.numComments))}</div><div className="text-xs opacity-80">comments</div></div>}
              </div>
            )}
            {capture.platform === 'github' && m && (
              <div className="flex items-center gap-6 text-white">
                {Number(m.stars) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.stars))}</div><div className="text-xs opacity-80">stars</div></div>}
                {Number(m.forks) > 0 && <div className="text-center"><div className="text-2xl font-bold" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>{formatCompact(Number(m.forks))}</div><div className="text-xs opacity-80">forks</div></div>}
              </div>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: 'linear-gradient(to top, var(--bg) 0%, transparent 100%)' }} />
        </div>
      )}

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

        {/* View original */}
        <a href={capture.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-6 mb-2 text-sm font-mono" style={{ color: 'var(--accent)' }}>
          View original
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4h6v6M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>

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
