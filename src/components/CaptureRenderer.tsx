'use client';

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
    <div className="mb-8 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: badges + handle + date */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex items-center gap-3 mt-1.5">
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
    <div className="mb-8 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: repo path + language */}
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex items-center gap-3 mt-1.5">
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
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
    <div className="mb-8 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: site · author · date */}
      <div className="flex flex-wrap items-center gap-2">
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
      </div>

      {/* Line 2: read time */}
      <div className="mt-1.5">
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
    <div className="mb-8 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Line 1: subreddit · flair · author */}
      <div className="flex flex-wrap items-center gap-2">
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
        <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
          u/{capture.author.replace(/^u\//, '')}
        </span>
      </div>

      {/* Line 2: score + comments (hide if score is 0 — RSS fallback) */}
      {((score != null && score > 0) || (numComments != null && numComments > 0)) && (
        <div className="flex items-center gap-3 mt-1.5">
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
    <div className="mb-8 pb-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="flex flex-wrap items-center gap-2">
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
export { formatCompact, formatDate, formatFullDate, PLATFORM_COLORS };
