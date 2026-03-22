'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  getSharedProject,
  getSharedProjectCaptures,
  getUniqueContentTag,
  decodeEntities,
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

export default function SharedProjectPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeFilter, setActiveFilter] = useState<Platform | 'all'>('all');

  const loadData = useCallback(async () => {
    try {
      const p = await getSharedProject(projectId);
      if (!p) {
        setNotFound(true);
        return;
      }
      const c = await getSharedProjectCaptures(projectId);
      setProject(p);
      setCaptures(c);
    } catch (e) {
      console.error('Failed to load shared project:', e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Set OG meta tags dynamically
  useEffect(() => {
    if (!project) return;
    document.title = `${project.name} — Sift`;
  }, [project]);

  const filteredCaptures = activeFilter === 'all'
    ? captures
    : captures.filter(c => c.platform === activeFilter);

  const platformCounts: Record<string, number> = {};
  for (const c of captures) {
    platformCounts[c.platform] = (platformCounts[c.platform] || 0) + 1;
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

  if (loading) {
    return (
      <main className="min-h-dvh safe-top safe-bottom">
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      </main>
    );
  }

  if (notFound || !project) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-5">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
            <path d="M12 9v4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Not found</h1>
        <p className="text-sm text-center mb-6" style={{ color: 'var(--text-tertiary)', maxWidth: '320px' }}>
          This project doesn&apos;t exist or isn&apos;t shared publicly.
        </p>
        <a href="/login" className="px-5 py-2.5 rounded-full text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
          Sign in to Sift
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      {/* Header — curated exhibition feel */}
      <header className="px-5 pt-14 pb-8 max-w-5xl mx-auto">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            <span className="text-xs font-bold">S</span>
          </div>
          <span className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-tertiary)' }}>
            Curated Collection
          </span>
        </div>
        <h1 className="font-bold tracking-tight mb-4" style={{ color: 'var(--text-primary)', fontSize: '36px', lineHeight: 1.15 }}>
          {project.name}
        </h1>
        {project.brief && (
          <p className="text-base leading-relaxed mb-5" style={{ color: 'var(--text-secondary)', maxWidth: '640px', lineHeight: 1.7 }}>
            {project.brief}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-mono" style={{ color: 'var(--text-tertiary)' }}>
            {captures.length} capture{captures.length !== 1 ? 's' : ''}
          </span>
          {[...new Set(captures.map(c => c.platform))].map(p => {
            const pl = PLATFORM_LABELS[p];
            if (!pl) return null;
            return (
              <span key={p} className="text-[11px] px-2.5 py-0.5 rounded-full font-medium" style={{ background: pl.color + '15', color: pl.color }}>
                {pl.label}
              </span>
            );
          })}
        </div>
      </header>

      {/* Platform filter tabs */}
      {captures.length > 0 && (
        <div className="px-5 pb-5 max-w-5xl mx-auto">
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
                    background: isActive ? color + '20' : 'transparent',
                    border: isActive ? `1px solid ${color}40` : '1px solid var(--border-subtle)',
                    color: isActive ? color : 'var(--text-tertiary)',
                  }}
                >
                  {label}
                  <span className="font-mono text-[10px]" style={{ opacity: 0.7 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Captures Grid — gallery spacing */}
      <div className="px-5 pb-12 max-w-5xl mx-auto">
        {filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No captures to show</p>
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
              const contentTag = getUniqueContentTag(capture);
              return (
                <a
                  key={capture.id}
                  href={`/p/${projectId}/c/${capture.id}`}
                  className="capture-card group relative w-full text-left rounded-2xl overflow-hidden transition-all cursor-pointer block"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', textDecoration: 'none', color: 'inherit' }}
                >
                  {/* Hero image or platform gradient fallback */}
                  {hasImage ? (
                    <div className="relative w-full" style={{ height: '120px' }}>
                      <img src={capture.images[0]} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { const parent = (e.target as HTMLImageElement).closest('.relative') as HTMLElement | null; if (parent) parent.style.display = 'none'; }} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--bg-elevated) 0%, rgba(0,0,0,0.4) 60%, rgba(0,0,0,0.15) 100%)' }} />
                      <div className="absolute top-3 left-3 flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + 'dd', color: '#fff', backdropFilter: 'blur(4px)' }}>
                          {PLATFORM_LABELS[capture.platform]?.label}
                        </span>
                        {contentTag && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.5)', color: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(4px)' }}>
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
                    <h3 className="text-[15px] font-bold mb-1.5 line-clamp-2" style={{ color: 'var(--text-primary)', lineHeight: 1.4 }}>
                      {decodeEntities(capture.title)}
                    </h3>
                    <p className="text-xs mb-3 line-clamp-2" style={{ color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      {decodeEntities(truncate(bodyPreview, 120))}
                    </p>
                    {capture.note && (
                      <div className="mt-2 pl-3 py-1.5" style={{ borderLeft: '2px solid rgba(232, 255, 71, 0.3)' }}>
                        <span className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>{decodeEntities(truncate(capture.note, 80))}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)', maxWidth: '60%' }}>{capture.author}</span>
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>{formatTime(capture.createdAt)}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Made with Sift — curator's signature */}
      <footer className="py-14 mt-12" style={{ borderTop: '1px solid var(--border-subtle)' }}>
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
