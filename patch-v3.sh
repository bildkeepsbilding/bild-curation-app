#!/bin/bash

# Patch: Add Reddit image extraction + Export feature
# Run from ~/bild-curation-app

echo "🔧 Patching: Reddit images + Export..."

# ── Updated API route with image extraction ──
cat > src/app/api/fetch-url/route.ts << 'ENDOFFILE'
import { NextRequest, NextResponse } from 'next/server';

interface RedditPost {
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  url: string;
  url_overridden_by_dest?: string;
  created_utc: number;
  permalink: string;
  link_flair_text?: string;
  preview?: {
    images?: Array<{
      source: { url: string; width: number; height: number };
    }>;
  };
  is_gallery?: boolean;
  media_metadata?: Record<string, { s?: { u?: string } }>;
  post_hint?: string;
}

interface RedditComment {
  author: string;
  body: string;
  score: number;
  created_utc: number;
}

function extractImages(postData: RedditPost): string[] {
  const images: string[] = [];

  // Gallery posts
  if (postData.is_gallery && postData.media_metadata) {
    for (const item of Object.values(postData.media_metadata)) {
      if (item.s?.u) {
        images.push(item.s.u.replace(/&amp;/g, '&'));
      }
    }
  }

  // Preview images
  if (postData.preview?.images) {
    for (const img of postData.preview.images) {
      if (img.source?.url) {
        images.push(img.source.url.replace(/&amp;/g, '&'));
      }
    }
  }

  // Direct image link
  if (postData.url_overridden_by_dest) {
    const u = postData.url_overridden_by_dest;
    if (u.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
      if (!images.includes(u)) images.push(u);
    }
  }

  return images;
}

function extractRedditComments(
  children: Array<{ kind: string; data: RedditComment & { replies?: { data?: { children?: Array<{ kind: string; data: RedditComment }> } } } }>,
  depth: number = 0,
  maxDepth: number = 3
): string[] {
  const comments: string[] = [];

  for (const child of children) {
    if (child.kind !== 't1') continue;
    const c = child.data;
    if (!c.body || c.author === 'AutoModerator') continue;

    const indent = '  '.repeat(depth);
    comments.push(`${indent}u/${c.author} (${c.score} pts):\n${indent}${c.body}`);

    if (depth < maxDepth && c.replies?.data?.children) {
      comments.push(...extractRedditComments(c.replies.data.children, depth + 1, maxDepth));
    }
  }

  return comments;
}

async function fetchReddit(url: string) {
  let cleanUrl = url.split('?')[0];
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  if (!cleanUrl.endsWith('.json')) cleanUrl += '.json';

  const response = await fetch(cleanUrl, {
    headers: { 'User-Agent': 'BildCurationApp/1.0' },
  });

  if (!response.ok) throw new Error(`Reddit returned ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data) || data.length < 1) throw new Error('Unexpected Reddit response format');

  const postData: RedditPost = data[0].data.children[0].data;
  const commentsData = data.length > 1 ? data[1].data.children : [];

  const comments = extractRedditComments(commentsData);
  const commentText = comments.length > 0
    ? '\n\n---\n\nTop Comments:\n\n' + comments.slice(0, 20).join('\n\n')
    : '';

  const images = extractImages(postData);

  return {
    platform: 'reddit' as const,
    title: postData.title,
    body: (postData.selftext || '(Link post)') + commentText,
    author: `u/${postData.author}`,
    images,
    metadata: {
      subreddit: postData.subreddit,
      score: postData.score,
      numComments: postData.num_comments,
      flair: postData.link_flair_text || null,
      permalink: `https://reddit.com${postData.permalink}`,
      createdUtc: postData.created_utc,
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let result;
    if (url.includes('reddit.com') || url.includes('redd.it')) {
      result = await fetchReddit(url);
    } else {
      return NextResponse.json({ error: 'Platform not supported yet. Currently supports: Reddit' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}
ENDOFFILE

echo "✅ API route updated (now extracts images)"

# ── Updated db.ts to include images field ──
cat > src/lib/db.ts << 'ENDOFFILE'
const DB_NAME = 'curation-app';
const DB_VERSION = 3;

export type Platform = 'reddit' | 'twitter' | 'github' | 'article' | 'other';

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  captureCount: number;
}

export interface Capture {
  id: string;
  projectId: string;
  url: string;
  platform: Platform;
  title: string;
  body: string;
  author: string;
  images: string[];
  metadata: Record<string, unknown>;
  note: string;
  tags: string[];
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function detectPlatform(url: string): Platform {
  if (url.includes('reddit.com') || url.includes('redd.it')) return 'reddit';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('github.com')) return 'github';
  return 'article';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects', { keyPath: 'id' });
      }

      if (db.objectStoreNames.contains('screenshots')) {
        db.deleteObjectStore('screenshots');
      }
      if (db.objectStoreNames.contains('captures')) {
        db.deleteObjectStore('captures');
      }

      const store = db.createObjectStore('captures', { keyPath: 'id' });
      store.createIndex('projectId', 'projectId', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('platform', 'platform', { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function createProject(name: string): Promise<Project> {
  const db = await openDB();
  const project: Project = {
    id: generateId(),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    captureCount: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').add(project);
    tx.oncomplete = () => resolve(project);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getProjects(): Promise<Project[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').getAll();
    request.onsuccess = () => {
      const projects = request.result as Project[];
      projects.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(projects);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const db = await openDB();
  const project = await getProject(id);
  if (!project) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put({ ...project, ...updates, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  const captures = await getCaptures(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'captures'], 'readwrite');
    tx.objectStore('projects').delete(id);
    for (const c of captures) {
      tx.objectStore('captures').delete(c.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function addCapture(
  projectId: string,
  url: string,
  title: string,
  body: string,
  author: string,
  images: string[] = [],
  metadata: Record<string, unknown> = {},
  note: string = '',
  tags: string[] = []
): Promise<Capture> {
  const db = await openDB();
  const capture: Capture = {
    id: generateId(),
    projectId,
    url,
    platform: detectPlatform(url),
    title,
    body,
    author,
    images,
    metadata,
    note,
    tags,
    createdAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    tx.objectStore('captures').add(capture);
    tx.oncomplete = async () => {
      const all = await getCaptures(projectId);
      await updateProject(projectId, { captureCount: all.length });
      resolve(capture);
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCaptures(projectId: string): Promise<Capture[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readonly');
    const index = tx.objectStore('captures').index('projectId');
    const request = index.getAll(projectId);
    request.onsuccess = () => {
      const captures = request.result as Capture[];
      captures.sort((a, b) => b.createdAt - a.createdAt);
      resolve(captures);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getCapture(id: string): Promise<Capture | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readonly');
    const request = tx.objectStore('captures').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCapture(id: string, projectId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    tx.objectStore('captures').delete(id);
    tx.oncomplete = async () => {
      const all = await getCaptures(projectId);
      await updateProject(projectId, { captureCount: all.length });
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

export async function updateCapture(id: string, updates: Partial<Capture>): Promise<void> {
  const db = await openDB();
  const capture = await getCapture(id);
  if (!capture) return;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readwrite');
    tx.objectStore('captures').put({ ...capture, ...updates });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Export all captures in a project as markdown
export async function exportProjectAsMarkdown(projectId: string): Promise<string> {
  const project = await getProject(projectId);
  const captures = await getCaptures(projectId);
  if (!project) return '';

  let md = `# ${project.name}\n\nExported: ${new Date().toLocaleDateString()}\nCaptures: ${captures.length}\n\n---\n\n`;

  for (const c of captures) {
    md += `## ${c.title}\n\n`;
    md += `**Source:** ${c.platform} · ${c.author}\n`;
    md += `**URL:** ${c.url}\n`;
    md += `**Captured:** ${new Date(c.createdAt).toLocaleDateString()}\n\n`;

    if (c.images && c.images.length > 0) {
      md += `**Images:**\n`;
      for (const img of c.images) {
        md += `![](${img})\n`;
      }
      md += `\n`;
    }

    if (c.metadata && c.platform === 'reddit') {
      md += `r/${c.metadata.subreddit} · ↑${c.metadata.score} · ${c.metadata.numComments} comments\n\n`;
    }

    md += `${c.body}\n\n`;

    if (c.note) {
      md += `> **My notes:** ${c.note}\n\n`;
    }

    md += `---\n\n`;
  }

  return md;
}

export { detectPlatform };
ENDOFFILE

echo "✅ Database updated (images field + export function)"

# ── Updated project page with images + export button ──
cat > "src/app/project/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  getProject,
  getCaptures,
  addCapture,
  deleteCapture,
  updateCapture,
  exportProjectAsMarkdown,
  type Project,
  type Capture,
} from '@/lib/db';

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  reddit: { label: 'Reddit', color: '#FF4500' },
  twitter: { label: 'Twitter/X', color: '#1DA1F2' },
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
  const urlInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

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
    const md = await exportProjectAsMarkdown(projectId);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}.md`;
    a.click();
    URL.revokeObjectURL(url);
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

  function formatTime(ts: number) {
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function truncate(text: string, len: number) {
    return text.length > len ? text.slice(0, len) + '...' : text;
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

      {/* ── Capture Viewer ── */}
      {viewing && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg)' }}>
          <div className="flex items-center justify-between px-4 py-3 safe-top" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => { setViewing(null); setEditingNote(false); }} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 4l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Back
            </button>
            <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{formatTime(viewing.createdAt)}</span>
            <button onClick={() => handleDelete(viewing)} className="text-sm font-medium" style={{ color: 'var(--danger)' }}>Delete</button>
          </div>

          <div className="flex-1 overflow-auto px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold" style={{ background: PLATFORM_LABELS[viewing.platform]?.color + '20', color: PLATFORM_LABELS[viewing.platform]?.color }}>
                {PLATFORM_LABELS[viewing.platform]?.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{viewing.author}</span>
            </div>

            <h2 className="text-lg font-bold mb-3" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{viewing.title}</h2>

            {viewing.metadata && viewing.platform === 'reddit' && (
              <div className="flex items-center gap-3 mb-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                <span>r/{String(viewing.metadata.subreddit)}</span>
                <span>↑ {String(viewing.metadata.score)}</span>
                <span>{String(viewing.metadata.numComments)} comments</span>
              </div>
            )}

            {/* Images */}
            {viewing.images && viewing.images.length > 0 && (
              <div className="mb-4 space-y-3">
                {viewing.images.map((img, i) => (
                  <img
                    key={i}
                    src={img}
                    alt={`Image ${i + 1}`}
                    className="w-full rounded-xl"
                    style={{ border: '1px solid var(--border-subtle)' }}
                    loading="lazy"
                  />
                ))}
              </div>
            )}

            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>
              {viewing.body}
            </div>

            <a href={viewing.url} target="_blank" rel="noopener noreferrer" className="inline-block mt-4 text-xs font-mono underline" style={{ color: 'var(--accent)' }}>
              View original →
            </a>
          </div>

          <div className="px-4 py-3 safe-bottom" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            {editingNote ? (
              <div className="flex gap-2">
                <textarea ref={noteInputRef} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Add your thoughts..." rows={2} className="flex-1 px-3 py-2 rounded-xl text-sm outline-none resize-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <div className="flex flex-col gap-1">
                  <button onClick={handleSaveNote} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Save</button>
                  <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-tertiary)' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setNoteText(viewing.note || ''); setEditingNote(true); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: viewing.note ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                {viewing.note || 'Tap to add your thoughts...'}
              </button>
            )}
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
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 18h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Export .md
            </button>
          )}
        </div>
      </header>

      {/* ── URL Input ── */}
      <div className="px-5 mb-6">
        <div className="flex gap-2">
          <input ref={urlInputRef} type="url" value={urlInput} onChange={(e) => { setUrlInput(e.target.value); setFetchError(''); }} onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()} placeholder="Paste a Reddit URL..." className="flex-1 px-4 py-3 rounded-xl text-sm outline-none" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} disabled={fetching} />
          <button onClick={handleFetchUrl} disabled={!urlInput.trim() || fetching} className="px-5 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>
            {fetching ? <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--bg)', borderTopColor: 'transparent' }} /> : 'Capture'}
          </button>
        </div>
        {fetchError && <p className="text-xs mt-2 px-1" style={{ color: 'var(--danger)' }}>{fetchError}</p>}
        <p className="text-xs mt-2 px-1" style={{ color: 'var(--text-tertiary)' }}>Supports: Reddit · More platforms coming soon</p>
      </div>

      {/* ── Captures List ── */}
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
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Paste a URL above to get started</p>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {captures.map((capture) => (
              <button key={capture.id} onClick={() => setViewing(capture)} className="w-full text-left rounded-2xl p-4 active:scale-[0.98] transition-transform" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: PLATFORM_LABELS[capture.platform]?.color + '20', color: PLATFORM_LABELS[capture.platform]?.color }}>{PLATFORM_LABELS[capture.platform]?.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{capture.author}</span>
                  <span className="ml-auto text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{formatTime(capture.createdAt)}</span>
                </div>

                {/* Thumbnail */}
                {capture.images && capture.images.length > 0 && (
                  <div className="mb-2 rounded-lg overflow-hidden" style={{ maxHeight: '120px' }}>
                    <img src={capture.images[0]} alt="" className="w-full object-cover object-top" style={{ maxHeight: '120px' }} loading="lazy" />
                  </div>
                )}

                <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)', lineHeight: 1.3 }}>{truncate(capture.title, 80)}</h3>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)', lineHeight: 1.4 }}>{truncate(capture.body.split('\n---')[0], 120)}</p>
                {capture.note && (
                  <p className="text-xs mt-2 px-2 py-1 rounded-lg" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>💡 {truncate(capture.note, 60)}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
ENDOFFILE

echo "✅ Project page updated (images + export button)"
echo ""
echo "🎉 Patch complete! The server will auto-reload."
echo ""
echo "New features:"
echo "  📸 Reddit images now extracted and displayed"
echo "  📥 'Export .md' button to download project as markdown"
echo "     → Upload that file to Claude project files for full context"
