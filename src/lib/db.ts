const DB_NAME = 'curation-app';
const DB_VERSION = 3;

export const INBOX_PROJECT_ID = '__inbox__';

export type Platform = 'reddit' | 'twitter' | 'github' | 'article' | 'other';

export interface Project {
  id: string;
  name: string;
  brief: string;
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
  sortOrder?: number;
  contentTag?: string;
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

export async function createProject(name: string, brief: string = ''): Promise<Project> {
  const db = await openDB();
  const project: Project = {
    id: generateId(),
    name,
    brief,
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
  // Prevent renaming the Inbox
  if (id === INBOX_PROJECT_ID) {
    delete updates.name;
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put({ ...project, ...updates, updatedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProject(id: string): Promise<void> {
  if (id === INBOX_PROJECT_ID) return; // Inbox cannot be deleted
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

export async function ensureInbox(): Promise<Project> {
  const existing = await getProject(INBOX_PROJECT_ID);
  if (existing) return existing;

  const db = await openDB();
  const inbox: Project = {
    id: INBOX_PROJECT_ID,
    name: 'Inbox',
    brief: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    captureCount: 0,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.objectStore('projects').put(inbox);
    tx.oncomplete = () => resolve(inbox);
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
  const platform = detectPlatform(url);
  const capture: Capture = {
    id: generateId(),
    projectId,
    url,
    platform,
    title,
    body,
    author,
    images,
    metadata,
    note,
    tags,
    createdAt: Date.now(),
    contentTag: detectContentTag({ platform, title, body }),
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
      captures.sort((a, b) => {
        const aOrder = a.sortOrder ?? 0;
        const bOrder = b.sortOrder ?? 0;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return b.createdAt - a.createdAt;
      });
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

export async function moveCapture(captureId: string, fromProjectId: string, toProjectId: string): Promise<void> {
  await updateCapture(captureId, { projectId: toProjectId });
  // Update capture counts on both projects
  const [fromCaptures, toCaptures] = await Promise.all([getCaptures(fromProjectId), getCaptures(toProjectId)]);
  await Promise.all([
    updateProject(fromProjectId, { captureCount: fromCaptures.length }),
    updateProject(toProjectId, { captureCount: toCaptures.length }),
  ]);
}

export async function getAllCaptures(): Promise<Capture[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('captures', 'readonly');
    const request = tx.objectStore('captures').getAll();
    request.onsuccess = () => {
      const captures = request.result as Capture[];
      captures.sort((a, b) => b.createdAt - a.createdAt);
      resolve(captures);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function getProjectMap(): Promise<Record<string, Project>> {
  const projects = await getProjects();
  const map: Record<string, Project> = {};
  for (const p of projects) {
    map[p.id] = p;
  }
  return map;
}

export async function copyCapture(captureId: string, toProjectId: string): Promise<Capture> {
  const original = await getCapture(captureId);
  if (!original) throw new Error('Capture not found');
  return addCapture(
    toProjectId,
    original.url,
    original.title,
    original.body,
    original.author,
    original.images,
    original.metadata,
    original.note,
    original.tags,
  );
}

export async function reorderCapture(projectId: string, captureId: string, direction: 'up' | 'down'): Promise<void> {
  const captures = await getCaptures(projectId);
  if (captures.length < 2) return;

  // Assign sequential sortOrder values if not already set
  const needsInit = captures.some(c => c.sortOrder == null);
  if (needsInit) {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('captures', 'readwrite');
      const store = tx.objectStore('captures');
      captures.forEach((c, i) => {
        store.put({ ...c, sortOrder: (i + 1) * 10 });
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Re-fetch with updated sortOrder values
    const updated = await getCaptures(projectId);
    captures.splice(0, captures.length, ...updated);
  }

  const idx = captures.findIndex(c => c.id === captureId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= captures.length) return;

  // Swap sortOrder values
  const tempOrder = captures[idx].sortOrder!;
  await Promise.all([
    updateCapture(captures[idx].id, { sortOrder: captures[swapIdx].sortOrder! }),
    updateCapture(captures[swapIdx].id, { sortOrder: tempOrder }),
  ]);
}

// Build engagement string for a capture based on platform metadata
export function formatEngagement(c: Capture): string {
  const m = c.metadata;
  if (!m) return '';

  if (c.platform === 'twitter') {
    const parts = [
      m.likes != null ? `likes: ${m.likes}` : null,
      m.retweets != null ? `retweets: ${m.retweets}` : null,
      m.views != null ? `views: ${m.views}` : null,
    ].filter(Boolean);
    return parts.join(', ');
  }

  if (c.platform === 'reddit') {
    const parts = [
      m.score != null ? `upvotes: ${m.score}` : null,
      m.numComments != null ? `comments: ${m.numComments}` : null,
      m.subreddit ? `subreddit: r/${m.subreddit}` : null,
    ].filter(Boolean);
    return parts.join(', ');
  }

  if (c.platform === 'github') {
    const parts = [
      m.stars != null ? `stars: ${m.stars}` : null,
      m.forks != null ? `forks: ${m.forks}` : null,
      m.language ? `language: ${m.language}` : null,
    ].filter(Boolean);
    return parts.join(', ');
  }

  return '';
}

// Auto-detect content type from capture metadata and content
export function detectContentType(c: Capture): string {
  if (c.platform === 'github') {
    if (c.metadata?.isFile) return 'source_file';
    return 'repository';
  }
  if (c.platform === 'twitter') {
    if (c.metadata?.isArticle) return 'long_form_article';
    if (c.images && c.images.length > 0) return 'media_post';
    return 'post';
  }
  if (c.platform === 'reddit') {
    if (c.body && c.body.length > 500) return 'discussion';
    if (c.images && c.images.length > 0) return 'media_post';
    return 'post';
  }
  if (c.platform === 'article') return 'article';
  return 'other';
}

// Auto-detect content tag for display
export function detectContentTag(c: { platform: Platform; title: string; body: string }): string {
  if (c.platform === 'reddit') return 'Discussion';
  if (c.platform === 'twitter') return 'Thread';
  if (c.platform === 'github') return 'Repository';

  // Article platform — check for Tutorial heuristics
  const titleLower = (c.title || '').toLowerCase();
  const bodyLower = (c.body || '').toLowerCase();

  const tutorialKeywords = /\b(how to|step[- ]by[- ]step|guide|tutorial|walkthrough|getting started)\b/i;
  if (tutorialKeywords.test(titleLower) || tutorialKeywords.test(bodyLower.slice(0, 500))) {
    return 'Tutorial';
  }

  // Count numbered list items as tutorial signal
  const numberedSteps = (c.body || '').match(/^\s*\d+\.\s+/gm);
  if (numberedSteps && numberedSteps.length >= 3) {
    return 'Tutorial';
  }

  // Opinion heuristic — first-person perspective markers
  const opinionMarkers = /\b(I think|I believe|in my opinion|in my experience|my take|I feel|I argue|my view)\b/i;
  if (opinionMarkers.test(bodyLower.slice(0, 1000))) {
    return 'Opinion';
  }

  return 'Article';
}

// Normalize URL for duplicate comparison
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Normalize to https
    u.protocol = 'https:';
    // Remove www.
    u.hostname = u.hostname.replace(/^www\./, '');
    // Remove tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      u.searchParams.delete(p);
    }
    // Remove trailing slash
    let path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname}${path}${u.search}${u.hash}`.replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

// Find existing capture by URL (for duplicate detection)
export async function findCaptureByUrl(url: string): Promise<{ capture: Capture; project: Project } | null> {
  const normalized = normalizeUrl(url);
  const captures = await getAllCaptures();
  for (const c of captures) {
    if (normalizeUrl(c.url) === normalized) {
      const project = await getProject(c.projectId);
      if (project) return { capture: c, project };
    }
  }
  return null;
}

// Platform display labels for export
export const PLATFORM_DISPLAY: Record<string, string> = {
  twitter: 'X (Twitter)',
  reddit: 'Reddit',
  github: 'GitHub',
  article: 'Article',
  other: 'Other',
};

// Export captures as structured markdown for Claude
export async function exportProjectAsMarkdown(projectId: string, filterPlatform?: Platform | 'all'): Promise<string> {
  const project = await getProject(projectId);
  let captures = await getCaptures(projectId);
  if (!project) return '';

  if (filterPlatform && filterPlatform !== 'all') {
    captures = captures.filter(c => c.platform === filterPlatform);
  }

  const filterLabel = filterPlatform && filterPlatform !== 'all' ? ` [filtered: ${PLATFORM_DISPLAY[filterPlatform] || filterPlatform}]` : '';
  let md = `# ${project.name}${filterLabel}\n\n`;

  if (project.brief) {
    md += `## Project Brief\n\n${project.brief}\n\n`;
  }

  md += `---\n\n`;

  for (const c of captures) {
    // Structured YAML-style metadata block
    md += `---\n`;
    md += `source: ${PLATFORM_DISPLAY[c.platform] || c.platform}\n`;
    md += `author: ${c.author}\n`;
    md += `date: ${new Date(c.createdAt).toISOString().split('T')[0]}\n`;
    const engagement = formatEngagement(c);
    if (engagement) md += `engagement: ${engagement}\n`;
    md += `content_type: ${c.contentTag || detectContentTag(c)}\n`;
    md += `url: ${c.url}\n`;
    if (c.note) md += `context_for_claude: ${c.note}\n`;
    md += `---\n\n`;

    // Title + body
    md += `## ${c.title}\n\n`;

    // Strip [image:URL] markers from body for clean text export
    const cleanBody = c.body.replace(/\[image:[^\]]+\]\n?\n?/g, '');
    md += `${cleanBody}\n\n`;

    if (c.images && c.images.length > 0) {
      md += `Images:\n`;
      for (const img of c.images) {
        md += `- ${img}\n`;
      }
      md += `\n`;
    }
  }

  // Collection summary
  if (captures.length > 0) {
    const platforms = [...new Set(captures.map(c => PLATFORM_DISPLAY[c.platform] || c.platform))];
    const dates = captures.map(c => c.createdAt).sort();
    const oldest = new Date(dates[0]).toISOString().split('T')[0];
    const newest = new Date(dates[dates.length - 1]).toISOString().split('T')[0];
    const dateRange = oldest === newest ? oldest : `${oldest} to ${newest}`;
    const withContext = captures.filter(c => c.note).length;

    md += `---\n\n`;
    md += `## Collection Summary\n\n`;
    md += `- Total captures: ${captures.length}\n`;
    md += `- Platforms: ${platforms.join(', ')}\n`;
    md += `- Date range: ${dateRange}\n`;
    md += `- Captures with context: ${withContext}/${captures.length}\n`;
    md += `- Exported: ${new Date().toISOString().split('T')[0]}\n`;
  }

  return md;
}

export { detectPlatform };
