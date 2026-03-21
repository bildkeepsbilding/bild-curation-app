'use client';

import React from 'react';
import { type Capture, type Platform } from '@/lib/db';

// ── Platform colors ──

const PLATFORM_COLORS: Record<string, string> = {
  reddit: '#FF4500',
  twitter: '#1DA1F2',
  github: '#8B5CF6',
  article: '#10B981',
  other: '#6B7280',
};

const GITHUB_LANG_COLORS: Record<string, string> = {
  TypeScript: '#3178C6',
  JavaScript: '#F7DF1E',
  Python: '#3572A5',
  Rust: '#DEA584',
  Go: '#00ADD8',
  Java: '#B07219',
  Ruby: '#701516',
  C: '#555555',
  'C++': '#F34B7D',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  PHP: '#4F5D95',
  Shell: '#89E051',
  Lua: '#000080',
  Zig: '#EC915C',
  Elixir: '#6E4A7E',
  Haskell: '#5E5086',
  Scala: '#DC322F',
  Vue: '#41B883',
  Svelte: '#FF3E00',
  HTML: '#E34C26',
  CSS: '#563D7C',
  SCSS: '#C6538C',
};

// ── Formatting helpers ──

function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function formatDate(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  const d = new Date(ts);
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();

  if (year === currentYear) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${year}`;
}

function formatFullDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Dot separator ──

function Dot() {
  return <span className="text-xs" style={{ color: 'var(--border)', margin: '0 2px' }}>·</span>;
}

// ── Twitter Metadata Header ──

function TwitterMetadataHeader({ capture }: { capture: Capture }) {
  const m = capture.metadata;
  const isArticle = Boolean(m?.isArticle);
  const isThread = Boolean(m?.isThreadRoot) || (capture.body?.includes('\n---\n') && (m?.threadLength as number) > 1);
  const threadLength = Number(m?.threadLength) || 0;

  // Parse handle from author (e.g. "@handle" or "Name (@handle)")
  const handle = capture.author.startsWith('@')
    ? capture.author
    : capture.author.includes('(@')
      ? capture.author.match(/\(@([^)]+)\)/)?.[1] ? `@${capture.author.match(/\(@([^)]+)\)/)?.[1]}` : capture.author
      : capture.author;

  const profileUrl = handle.startsWith('@')
    ? `https://x.com/${handle.slice(1)}`
    : capture.url.split('/').slice(0, 4).join('/');

  return (
    <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: badges + handle + date */}
      <div className="flex flex-wrap items-center gap-1.5">
        {isArticle && (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: '#8B5CF620', color: '#8B5CF6' }}>
            Article
          </span>
        )}
        {isThread && threadLength > 1 && (
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: PLATFORM_COLORS.twitter + '20', color: PLATFORM_COLORS.twitter }}>
            Thread · {threadLength} tweets
          </span>
        )}
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {handle}
        </a>
        <Dot />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {formatDate(capture.createdAt)}
        </span>
      </div>

      {/* Line 2: engagement stats (hide when zero or missing) */}
      {m && (Number(m.likes) > 0 || Number(m.retweets) > 0 || Number(m.views) > 0) && (
        <div className="flex items-center gap-3 mt-1">
          {m.likes != null && Number(m.likes) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ♥ {formatCompact(Number(m.likes))}
            </span>
          )}
          {m.retweets != null && Number(m.retweets) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ⟲ {formatCompact(Number(m.retweets))}
            </span>
          )}
          {m.views != null && Number(m.views) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              👁 {formatCompact(Number(m.views))}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── GitHub Metadata Header ──

function GitHubMetadataHeader({ capture }: { capture: Capture }) {
  const m = capture.metadata;

  // Extract owner/repo from URL
  const urlParts = capture.url.replace(/^https?:\/\/(www\.)?github\.com\//, '').split('/');
  const repoPath = urlParts.slice(0, 2).join('/');
  const filePath = m?.filePath ? String(m.filePath) : null;

  const language = m?.language ? String(m.language) : null;
  const langColor = language ? GITHUB_LANG_COLORS[language] || '#6B7280' : null;

  const topics = Array.isArray(m?.topics) ? (m.topics as string[]) : [];

  return (
    <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: repo path + language */}
      <div className="flex flex-wrap items-center gap-1.5">
        <a
          href={`https://github.com/${repoPath}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {filePath ? `${repoPath}/${filePath}` : repoPath}
        </a>
        {language && (
          <>
            <Dot />
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: langColor || undefined }} />
              {language}
            </span>
          </>
        )}
      </div>

      {/* Line 2: stats (only for repo-level, not file captures) */}
      {!filePath && m && (m.stars != null || m.forks != null || m.issues != null) && (
        <div className="flex items-center gap-3 mt-1">
          {m.stars != null && Number(m.stars) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ⭐ {formatCompact(Number(m.stars))}
            </span>
          )}
          {m.forks != null && Number(m.forks) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              🍴 {formatCompact(Number(m.forks))}
            </span>
          )}
          {m.issues != null && Number(m.issues) > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              📋 {formatCompact(Number(m.issues))} issues
            </span>
          )}
        </div>
      )}

      {/* Line 3: topics */}
      {topics.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {topics.map((topic) => (
            <span
              key={topic}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}
            >
              {topic}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Article Metadata Header ──

function ArticleMetadataHeader({ capture }: { capture: Capture }) {
  const m = capture.metadata;
  const siteName = m?.siteName ? String(m.siteName) : null;
  const publishedTime = m?.publishedTime ? String(m.publishedTime) : null;

  // Estimated read time
  const wordCount = capture.body.split(/\s+/).length;
  const readTime = Math.ceil(wordCount / 238);

  // Format published date
  let dateStr: string | null = null;
  if (publishedTime) {
    try {
      const d = new Date(publishedTime);
      if (!isNaN(d.getTime())) {
        dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
    } catch { /* ignore */ }
  }
  if (!dateStr) {
    dateStr = formatDate(capture.createdAt);
  }

  return (
    <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: site · author · date · read time */}
      <div className="flex flex-wrap items-center gap-1.5">
        {siteName && (
          <>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
              {siteName}
            </span>
            <Dot />
          </>
        )}
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {capture.author}
        </span>
        <Dot />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {dateStr}
        </span>
        <Dot />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          ~{readTime} min read
        </span>
      </div>
    </div>
  );
}

// ── Reddit Metadata Header ──

function RedditMetadataHeader({ capture }: { capture: Capture }) {
  const m = capture.metadata;
  const subreddit = m?.subreddit ? String(m.subreddit) : null;
  const flair = m?.flair ? String(m.flair) : null;
  const score = m?.score != null ? Number(m.score) : null;
  const numComments = m?.numComments != null ? Number(m.numComments) : null;

  return (
    <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: subreddit · flair · author */}
      <div className="flex flex-wrap items-center gap-1.5">
        {subreddit && (
          <a
            href={`https://reddit.com/r/${subreddit}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold hover:underline"
            style={{ color: 'var(--text-secondary)' }}
          >
            r/{subreddit}
          </a>
        )}
        {flair && (
          <>
            <Dot />
            <span className="px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
              {flair}
            </span>
          </>
        )}
        <Dot />
        <a
          href={`https://reddit.com/user/${capture.author.replace(/^u\//, '')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono hover:underline"
          style={{ color: 'var(--text-tertiary)' }}
        >
          u/{capture.author.replace(/^u\//, '')}
        </a>
      </div>

      {/* Line 2: score + comments (hide if score is 0 — RSS fallback) */}
      {((score != null && score > 0) || (numComments != null && numComments > 0)) && (
        <div className="flex items-center gap-3 mt-1">
          {score != null && score > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ↑ {formatCompact(score)}
            </span>
          )}
          {numComments != null && numComments > 0 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {formatCompact(numComments)} comments
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Generic/Fallback Metadata Header ──

function GenericMetadataHeader({ capture }: { capture: Capture }) {
  const platformColor = PLATFORM_COLORS[capture.platform] || PLATFORM_COLORS.other;
  const platformLabel = capture.platform === 'twitter' ? 'X' : capture.platform.charAt(0).toUpperCase() + capture.platform.slice(1);

  return (
    <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: platformColor + '20', color: platformColor }}>
          {platformLabel}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{capture.author}</span>
        <Dot />
        <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{formatDate(capture.createdAt)}</span>
      </div>
    </div>
  );
}

// ── Shared Inline Markdown Renderer ──

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
    else if (match[5]) parts.push(<a key={partKey++} href={match[7]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{match[6]}</a>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function renderMarkdownLine(line: string, key: string): React.ReactNode {
  const h1Match = line.match(/^# (.+)$/);
  if (h1Match) return <h2 key={key} className="font-bold mt-8 mb-3" style={{ fontSize: '22px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h1Match[1])}</h2>;
  const h2Match = line.match(/^## (.+)$/);
  if (h2Match) return <h3 key={key} className="font-bold mt-7 mb-2" style={{ fontSize: '19px', color: 'var(--text-primary)', lineHeight: 1.3 }}>{renderInline(h2Match[1])}</h3>;
  const h3Match = line.match(/^### (.+)$/);
  if (h3Match) return <h4 key={key} className="font-semibold mt-5 mb-2" style={{ fontSize: '17px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{renderInline(h3Match[1])}</h4>;
  const h4Match = line.match(/^#### (.+)$/);
  if (h4Match) return <h5 key={key} className="font-semibold mt-4 mb-1" style={{ fontSize: '15px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{renderInline(h4Match[1])}</h5>;

  if (/^---+$/.test(line.trim())) return <hr key={key} className="my-6" style={{ border: 'none', borderTop: '1px solid var(--border-subtle)' }} />;

  const ulMatch = line.match(/^[-*] (.+)$/);
  if (ulMatch) return <div key={key} className="flex gap-2 ml-1 mb-1"><span style={{ color: 'var(--text-tertiary)' }}>•</span><span>{renderInline(ulMatch[1])}</span></div>;

  if (line.startsWith('> ')) return <blockquote key={key} className="pl-4 my-2" style={{ borderLeft: '2px solid var(--border)', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>{renderInline(line.slice(2))}</blockquote>;

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
        <pre key={`code-${i}`} className="rounded-lg px-4 py-3 my-4 overflow-x-auto text-[13px]" style={{ background: 'var(--bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace" }}>
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

// ── TweetBody ──

function TweetBody({ capture }: { capture: Capture }) {
  const body = capture.body || '';
  const m = capture.metadata;
  const isThread = body.includes('\n---\n') && (Number(m?.threadLength) > 1 || (body.match(/\n---\n/g) || []).length >= 1);

  // Thread rendering: split on --- and render as numbered blocks
  if (isThread) {
    const segments = body.split(/\n---\n/).filter(s => s.trim());
    const total = segments.length;

    return (
      <div className="space-y-0">
        {segments.map((segment, idx) => {
          const trimmed = segment.trim();
          // Check for inline images in this segment
          const parts = trimmed.split(/(\[image:[^\]]+\])/);
          const hasInlineImages = parts.length > 1;

          return (
            <div key={idx} className="relative pl-5 py-4" style={{ borderLeft: `2px solid ${PLATFORM_COLORS.twitter}33` }}>
              {/* Tweet counter */}
              <span className="absolute left-[-1px] top-4 text-[10px] font-mono px-1 rounded" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', transform: 'translateX(-50%)' }}>
                {idx + 1}/{total}
              </span>

              {hasInlineImages ? (
                <div style={{ fontSize: '16px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                  {parts.map((part, pi) => {
                    const imgMatch = part.match(/^\[image:(.+)\]$/);
                    if (imgMatch) {
                      return (
                        <div key={pi} className="my-4">
                          <img src={imgMatch[1]} alt="" className="w-full rounded-lg" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      );
                    }
                    return part.trim() ? <div key={pi}>{renderMarkdownBody(part.trim())}</div> : null;
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '16px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
                  {renderMarkdownBody(trimmed)}
                </div>
              )}

              {/* Separator between tweets (not after last) */}
              {idx < total - 1 && (
                <hr className="mt-4" style={{ border: 'none', borderTop: '1px solid var(--border-subtle)' }} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Single tweet: size based on length
  const len = body.length;

  // Check for inline images
  const hasInlineImages = body.includes('[image:');
  if (hasInlineImages) {
    const parts = body.split(/(\[image:[^\]]+\])/);
    return (
      <div style={{ fontSize: len < 200 ? '22px' : len < 500 ? '18px' : '16px', lineHeight: len < 200 ? 1.4 : len < 500 ? 1.5 : 1.65, color: len > 500 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
        {parts.map((part, i) => {
          const imgMatch = part.match(/^\[image:(.+)\]$/);
          if (imgMatch) {
            return (
              <div key={i} className="my-6">
                <img src={imgMatch[1]} alt="" className="w-full rounded-lg" style={{ border: '1px solid var(--border-subtle)' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            );
          }
          return part.trim() ? <div key={i}>{renderMarkdownBody(part.trim())}</div> : null;
        })}
      </div>
    );
  }

  // Short tweet: large pull-quote style
  if (len < 200) {
    return (
      <div style={{ fontSize: '22px', lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 400 }}>
        {renderMarkdownBody(body)}
      </div>
    );
  }

  // Medium tweet
  if (len < 500) {
    return (
      <div style={{ fontSize: '18px', lineHeight: 1.5, color: 'var(--text-primary)', fontWeight: 400 }}>
        {renderMarkdownBody(body)}
      </div>
    );
  }

  // Long tweet / note tweet
  return (
    <div style={{ fontSize: '16px', lineHeight: 1.65, color: 'var(--text-secondary)', fontWeight: 400 }}>
      {renderMarkdownBody(body)}
    </div>
  );
}

// ── FileTreeCollapsible ──

function FileTreeCollapsible({ content }: { content: string }) {
  const lines = content.split('\n').filter(l => l.trim());
  const lineCount = lines.length;
  const [open, setOpen] = React.useState(lineCount <= 20);

  return (
    <div className="my-4 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2 text-left"
        style={{ color: 'var(--text-tertiary)', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider">Project Structure</span>
        <span className="text-xs">{open ? '▾' : '▸'} {lineCount} items</span>
      </button>
      {open && (
        <pre className="px-4 pb-3 overflow-x-auto" style={{ fontSize: '13px', lineHeight: 1.4, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace" }}>
          <code>{content}</code>
        </pre>
      )}
    </div>
  );
}

// ── GitHubBody ──

function GitHubBody({ capture }: { capture: Capture }) {
  const body = capture.body || '';

  // Extract owner/repo from URL for resolving relative image paths
  const urlParts = capture.url.replace(/^https?:\/\/(www\.)?github\.com\//, '').split('/');
  const owner = urlParts[0] || '';
  const repo = urlParts[1] || '';

  // Split body into sections by --- separators
  // Structure: metadata lines, ---, Project Structure: ..., ---, README: ...
  const sections = body.split(/\n---\n/);

  let fileTree = '';
  let readmeContent = '';

  for (const section of sections) {
    const trimmed = section.trim();
    if (trimmed.startsWith('Project Structure:')) {
      fileTree = trimmed.replace(/^Project Structure:\s*/, '').trim();
    } else if (trimmed.startsWith('README:')) {
      readmeContent = trimmed.replace(/^README:\s*/, '').trim();
    }
    // Skip the first section (description/stats/languages/topics) — already in metadata header
  }

  // If no structured sections found, fall back to stripping metadata and rendering as markdown
  if (!fileTree && !readmeContent) {
    const cleaned = stripGitHubMetadataLines(body, capture.metadata);
    return (
      <div style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
        {renderMarkdownBody(cleaned)}
      </div>
    );
  }

  // Process README: convert relative <img> tags to absolute GitHub raw URLs, or strip them
  if (readmeContent && owner && repo) {
    readmeContent = resolveGitHubImages(readmeContent, owner, repo);
  }

  return (
    <div>
      {fileTree && <FileTreeCollapsible content={fileTree} />}
      {readmeContent && (
        <div style={{ fontSize: '15px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
          {renderMarkdownBody(readmeContent)}
        </div>
      )}
    </div>
  );
}

/** Strip metadata lines that are already shown in GitHubMetadataHeader */
function stripGitHubMetadataLines(body: string, metadata: Record<string, unknown> | null): string {
  const lines = body.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    // Skip description line (first non-empty line that matches metadata description)
    if (metadata?.description && trimmed === String(metadata.description)) return false;
    // Skip stats line: "Stars: X · Forks: Y · Issues: Z" or "⭐ X 🍴 Y" patterns
    if (/^(Stars?|⭐)\s*[:：]?\s*[\d,]+\s*[·•]\s*(Forks?|🍴)/i.test(trimmed)) return false;
    if (/^\d[\d,]*\s*stars?\s*[·•]/i.test(trimmed)) return false;
    // Skip language lines
    if (/^Languages?[:：]\s/i.test(trimmed)) return false;
    // Skip topics line
    if (/^Topics?[:：]\s/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join('\n').replace(/^\n+/, '');
}

/** Convert relative <img> tags to absolute GitHub raw URLs, or strip if no owner/repo */
function resolveGitHubImages(content: string, owner: string, repo: string): string {
  // Match HTML img tags
  return content.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (match, src: string) => {
    // Already absolute URL — keep as markdown image
    if (/^https?:\/\//.test(src)) {
      return `![](${src})`;
    }
    // Relative path — resolve to raw.githubusercontent.com
    if (owner && repo) {
      const cleanPath = src.replace(/^\.?\//, '');
      return `![](https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${cleanPath})`;
    }
    // Can't resolve — strip
    return '';
  });
}

// ── ArticleBody (also used for X Articles) ──

function ArticleBody({ capture }: { capture: Capture }) {
  const body = capture.body || '';

  // Handle inline images ([image:URL] markers)
  if (body.includes('[image:')) {
    const parts = body.split(/(\[image:[^\]]+\])/);
    return (
      <div style={{ fontSize: '17px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
        {parts.map((part, i) => {
          const imgMatch = part.match(/^\[image:(.+)\]$/);
          if (imgMatch) {
            return (
              <div key={i} className="my-6">
                <img src={imgMatch[1]} alt="" className="w-full rounded-lg" style={{ border: '1px solid var(--border-subtle)', maxWidth: '100%', objectFit: 'contain' }} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
            );
          }
          return part.trim() ? <div key={i}>{renderMarkdownBody(part.trim())}</div> : null;
        })}
      </div>
    );
  }

  return (
    <div style={{ fontSize: '17px', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
      {renderMarkdownBody(body)}
    </div>
  );
}

// ── RedditBody ──

interface RedditComment {
  author: string;
  text: string;
  depth: number;
}

function parseRedditComments(raw: string): RedditComment[] {
  const comments: RedditComment[] = [];
  const lines = raw.split('\n');
  let currentAuthor = '';
  let currentLines: string[] = [];
  let currentDepth = 0;

  const flushComment = () => {
    if (currentAuthor && currentLines.length > 0) {
      comments.push({
        author: currentAuthor,
        text: currentLines.join('\n').trim(),
        depth: currentDepth,
      });
    }
    currentLines = [];
  };

  for (const line of lines) {
    // Match comment author lines: "u/username:" or "> u/username:" (nested)
    const authorMatch = line.match(/^(>*\s*)u\/([^:]+):\s*$/);
    if (authorMatch) {
      flushComment();
      const prefix = authorMatch[1];
      currentDepth = (prefix.match(/>/g) || []).length;
      currentAuthor = authorMatch[2];
      continue;
    }

    // Count > prefixes for depth on content lines
    if (currentAuthor) {
      // Strip leading > markers that match current depth
      let stripped = line;
      for (let d = 0; d < currentDepth; d++) {
        stripped = stripped.replace(/^>\s?/, '');
      }
      currentLines.push(stripped);
    }
  }
  flushComment();

  return comments;
}

function RedditBody({ capture }: { capture: Capture }) {
  const body = capture.body || '';
  const images = capture.images || [];

  // Split body into post selftext and comments section
  // Comments start after "---" followed by "Top Comments:" or just after "---"
  const commentSplitMatch = body.match(/\n---\n+(?:Top Comments:?\s*\n?)?/);
  let postText = body;
  let commentsRaw = '';

  if (commentSplitMatch && commentSplitMatch.index != null) {
    postText = body.slice(0, commentSplitMatch.index).trim();
    commentsRaw = body.slice(commentSplitMatch.index + commentSplitMatch[0].length).trim();
  }

  // Parse structured comments
  const comments = commentsRaw ? parseRedditComments(commentsRaw) : [];
  const hasStructuredComments = comments.length > 0;

  // Check if post is a link post
  const isLinkPost = postText.trim() === '(Link post)';

  // Image gallery: show all images below post body (hero is rendered separately by the page)
  // Skip images[0] since it's the hero; show remaining in grid
  const galleryImages = images.slice(1);

  return (
    <div>
      {/* Post selftext */}
      {isLinkPost ? (
        <a
          href={capture.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-mono mb-4"
          style={{ color: 'var(--accent)' }}
        >
          Link post →
        </a>
      ) : postText ? (
        <div style={{ fontSize: '16px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          {renderMarkdownBody(postText)}
        </div>
      ) : null}

      {/* Image gallery */}
      {galleryImages.length > 0 && (
        <div
          className={`mt-6 mb-4 gap-2 ${galleryImages.length === 1 ? '' : 'grid grid-cols-2'}`}
        >
          {galleryImages.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={`Image ${i + 2}`}
              className="w-full h-auto rounded-lg"
              style={{ border: '1px solid var(--border-subtle)' }}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ))}
        </div>
      )}

      {/* Comments section */}
      {commentsRaw && (
        <div
          className="mt-8 pt-6 rounded-lg"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Section header */}
          <div
            className="text-[11px] font-semibold uppercase tracking-wider mb-4"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Top Comments
          </div>

          {hasStructuredComments ? (
            <div className="space-y-1">
              {comments.map((comment, i) => {
                const isAutoMod = comment.author === 'AutoModerator';
                const depth = Math.min(comment.depth, 4);

                return (
                  <div
                    key={i}
                    className="pb-3 mb-3"
                    style={{
                      marginLeft: `${depth * 16}px`,
                      borderLeft: depth > 0 ? '1px solid var(--border-subtle)' : 'none',
                      paddingLeft: depth > 0 ? '12px' : '0',
                      opacity: isAutoMod ? 0.5 : 1,
                      borderBottom: '1px solid var(--border-subtle)',
                    }}
                  >
                    {/* Author label */}
                    <a
                      href={`https://reddit.com/user/${comment.author}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono font-bold hover:underline mb-1 inline-block"
                      style={{ color: isAutoMod ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}
                    >
                      u/{comment.author}
                      {isAutoMod && <span className="font-normal ml-1" style={{ color: 'var(--text-tertiary)' }}>· bot</span>}
                    </a>
                    {/* Comment text */}
                    <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                      {renderMarkdownBody(comment.text)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback: render raw comments text as a single styled block */
            <div style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
              {renderMarkdownBody(commentsRaw)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── CaptureBody: platform-aware body dispatcher ──

export function CaptureBody({ capture }: { capture: Capture }) {
  const isXArticle = capture.platform === 'twitter' && Boolean(capture.metadata?.isArticle);

  // X Articles delegate to ArticleBody
  if (isXArticle) {
    return <ArticleBody capture={capture} />;
  }

  switch (capture.platform) {
    case 'twitter':
      return <TweetBody capture={capture} />;
    case 'article':
      return <ArticleBody capture={capture} />;
    case 'github':
      return <GitHubBody capture={capture} />;
    case 'reddit':
      return <RedditBody capture={capture} />;
    default:
      return (
        <div style={{ fontSize: '16px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
          {renderMarkdownBody(capture.body)}
        </div>
      );
  }
}

// ── Main Export ──

export function CaptureMetadataHeader({ capture }: { capture: Capture }) {
  switch (capture.platform) {
    case 'twitter':
      return <TwitterMetadataHeader capture={capture} />;
    case 'github':
      return <GitHubMetadataHeader capture={capture} />;
    case 'article':
      return <ArticleMetadataHeader capture={capture} />;
    case 'reddit':
      return <RedditMetadataHeader capture={capture} />;
    default:
      return <GenericMetadataHeader capture={capture} />;
  }
}

// Re-export helpers that pages may need
export { formatCompact, formatDate, formatFullDate, PLATFORM_COLORS, GITHUB_LANG_COLORS, renderMarkdownBody };
