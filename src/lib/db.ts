import { createClient } from '@/lib/supabase/client';
import { createClient as createAnonClient } from '@supabase/supabase-js';

/** Anonymous Supabase client for public data fetching (no cookie/session management). */
function createPublicClient() {
  return createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export type Platform = 'reddit' | 'twitter' | 'github' | 'article' | 'other';

export interface Project {
  id: string;
  name: string;
  brief: string;
  is_inbox: boolean;
  share: boolean;
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

// --- Row-to-model conversion helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProject(row: any, captureCount: number = 0): Project {
  return {
    id: row.id,
    name: row.name,
    brief: row.brief || '',
    is_inbox: row.is_inbox || false,
    share: row.share || false,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    captureCount,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCapture(row: any): Capture {
  return {
    id: row.id,
    projectId: row.project_id,
    url: row.url || '',
    platform: (row.platform || 'other') as Platform,
    title: row.title || '',
    body: row.body || '',
    author: row.author || '',
    images: row.images || [],
    metadata: row.metadata || {},
    note: row.note || '',
    tags: [],
    createdAt: new Date(row.created_at).getTime(),
    sortOrder: row.sort_order,
    contentTag: row.content_tag || undefined,
  };
}

// --- Auth helper ---

async function getUserId(): Promise<string> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return user.id;
}

// --- Project functions ---

export async function createProject(name: string, brief: string = ''): Promise<Project> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name, brief })
    .select()
    .single();

  if (error) throw error;
  return rowToProject(data, 0);
}

export async function getProjects(): Promise<Project[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('*, captures(count)')
    .order('updated_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => {
    const count = row.captures?.[0]?.count ?? 0;
    return rowToProject(row, count);
  });
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('projects')
    .select('*, captures(count)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw error;
  }

  const count = data.captures?.[0]?.count ?? 0;
  return rowToProject(data, count);
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<void> {
  const supabase = createClient();

  // Check if it's the Unsorted project — prevent renaming
  const project = await getProject(id);
  if (!project) return;

  // Build the DB update object
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUpdates: Record<string, any> = {};
  if (updates.name !== undefined && !project.is_inbox) dbUpdates.name = updates.name;
  if (updates.brief !== undefined) dbUpdates.brief = updates.brief;
  if (updates.share !== undefined) dbUpdates.share = updates.share;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase
    .from('projects')
    .update(dbUpdates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteProject(id: string): Promise<void> {
  const supabase = createClient();

  // Don't delete Unsorted
  const project = await getProject(id);
  if (!project || project.is_inbox) return;

  // Captures auto-deleted via ON DELETE CASCADE
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

export async function ensureInbox(): Promise<Project> {
  const supabase = createClient();
  const userId = await getUserId();

  // Check for existing Unsorted project
  const { data: existing } = await supabase
    .from('projects')
    .select('*, captures(count)')
    .eq('is_inbox', true)
    .single();

  if (existing) {
    const count = existing.captures?.[0]?.count ?? 0;
    return rowToProject(existing, count);
  }

  // Create Unsorted project
  const { data, error } = await supabase
    .from('projects')
    .insert({ user_id: userId, name: 'Unsorted', is_inbox: true })
    .select('*, captures(count)')
    .single();

  if (error) throw error;
  return rowToProject(data, 0);
}

export async function getProjectMap(): Promise<Record<string, Project>> {
  const projects = await getProjects();
  const map: Record<string, Project> = {};
  for (const p of projects) {
    map[p.id] = p;
  }
  return map;
}

// --- Capture functions ---

export async function addCapture(
  projectId: string,
  url: string,
  title: string,
  body: string,
  author: string,
  images: string[] = [],
  metadata: Record<string, unknown> = {},
  note: string = '',
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tags: string[] = [],
): Promise<Capture> {
  const supabase = createClient();
  const userId = await getUserId();
  const platform = detectPlatform(url);
  const contentTag = detectContentTag({ platform, title, body });

  const { data, error } = await supabase
    .from('captures')
    .insert({
      project_id: projectId,
      user_id: userId,
      url,
      title,
      body,
      author,
      platform,
      content_tag: contentTag,
      note,
      images,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;

  // Touch the project's updated_at
  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);

  return rowToCapture(data);
}

export async function getCaptures(projectId: string): Promise<Capture[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToCapture);
}

export async function getCapture(id: string): Promise<Capture | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToCapture(data);
}

export async function updateCapture(id: string, updates: Partial<Capture>): Promise<void> {
  const supabase = createClient();

  // Map interface fields to DB column names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUpdates: Record<string, any> = {};
  if (updates.projectId !== undefined) dbUpdates.project_id = updates.projectId;
  if (updates.url !== undefined) dbUpdates.url = updates.url;
  if (updates.title !== undefined) dbUpdates.title = updates.title;
  if (updates.body !== undefined) dbUpdates.body = updates.body;
  if (updates.author !== undefined) dbUpdates.author = updates.author;
  if (updates.platform !== undefined) dbUpdates.platform = updates.platform;
  if (updates.contentTag !== undefined) dbUpdates.content_tag = updates.contentTag;
  if (updates.note !== undefined) dbUpdates.note = updates.note;
  if (updates.images !== undefined) dbUpdates.images = updates.images;
  if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;
  if (updates.sortOrder !== undefined) dbUpdates.sort_order = updates.sortOrder;

  if (Object.keys(dbUpdates).length === 0) return;

  const { error } = await supabase
    .from('captures')
    .update(dbUpdates)
    .eq('id', id);

  if (error) throw error;
}

export async function deleteCapture(id: string, projectId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('captures')
    .delete()
    .eq('id', id);

  if (error) throw error;

  // Touch the project's updated_at
  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', projectId);
}

export async function moveCapture(captureId: string, fromProjectId: string, toProjectId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('captures')
    .update({ project_id: toProjectId })
    .eq('id', captureId);

  if (error) throw error;

  // Touch both projects' updated_at
  await Promise.all([
    supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', fromProjectId),
    supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', toProjectId),
  ]);
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
  );
}

export async function getAllCaptures(): Promise<Capture[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToCapture);
}

export async function reorderCapture(projectId: string, captureId: string, direction: 'up' | 'down'): Promise<void> {
  const captures = await getCaptures(projectId);
  if (captures.length < 2) return;

  // Initialize sort_order if needed
  const needsInit = captures.some(c => c.sortOrder == null || c.sortOrder === 0);
  if (needsInit) {
    const supabase = createClient();
    for (let i = 0; i < captures.length; i++) {
      await supabase
        .from('captures')
        .update({ sort_order: (i + 1) * 10 })
        .eq('id', captures[i].id);
      captures[i].sortOrder = (i + 1) * 10;
    }
  }

  const idx = captures.findIndex(c => c.id === captureId);
  if (idx === -1) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= captures.length) return;

  // Swap sort_order values
  const tempOrder = captures[idx].sortOrder!;
  await Promise.all([
    updateCapture(captures[idx].id, { sortOrder: captures[swapIdx].sortOrder! }),
    updateCapture(captures[swapIdx].id, { sortOrder: tempOrder }),
  ]);
}

// --- Utility functions (pure logic, no DB) ---

function detectPlatform(url: string): Platform {
  if (url.includes('reddit.com') || url.includes('redd.it')) return 'reddit';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'twitter';
  if (url.includes('github.com')) return 'github';
  return 'article';
}

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

export function detectContentTag(c: { platform: Platform; title: string; body: string }): string {
  if (c.platform === 'reddit') return 'Post';
  if (c.platform === 'github') return 'Repo';
  if (c.platform === 'twitter') {
    const body = c.body || '';
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 500) return 'Article';
    const hasNumbering = /^[1１]\/ /m.test(body) && /^[2-9２-９]\/ /m.test(body);
    const hasSeparators = (body.match(/\n---\n/g) || []).length >= 2;
    const hasTweetBlocks = (body.match(/^@\w+\s*·/gm) || []).length >= 2;
    if (hasNumbering || hasSeparators || hasTweetBlocks) return 'Thread';
    return 'Post';
  }
  return 'Article';
}

const PLATFORM_TAG_LABELS: Record<Platform, string> = {
  reddit: 'Reddit',
  twitter: 'X',
  github: 'GitHub',
  article: 'Article',
  other: 'Other',
};

export function getUniqueContentTag(c: { platform: Platform; title: string; body: string; contentTag?: string }): string | null {
  const tag = c.contentTag || detectContentTag(c);
  const platformLabel = PLATFORM_TAG_LABELS[c.platform] || c.platform;
  if (tag.toLowerCase() === platformLabel.toLowerCase()) return null;
  return tag;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '');
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid'];
    for (const p of trackingParams) {
      u.searchParams.delete(p);
    }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname}${path}${u.search}${u.hash}`.replace(/\/$/, '');
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
}

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

export const PLATFORM_DISPLAY: Record<string, string> = {
  twitter: 'X (Twitter)',
  reddit: 'Reddit',
  github: 'GitHub',
  article: 'Article',
  other: 'Other',
};

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

    md += `## ${c.title}\n\n`;

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

// --- Public (no-auth) data fetching for shared projects ---

export async function getSharedProject(id: string): Promise<Project | null> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('projects')
    .select('*, captures(count)')
    .eq('id', id)
    .eq('share', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const count = data.captures?.[0]?.count ?? 0;
  return rowToProject(data, count);
}

export async function getSharedProjectCaptures(projectId: string): Promise<Capture[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(rowToCapture);
}

export async function getSharedCapture(captureId: string, projectId: string): Promise<Capture | null> {
  const supabase = createPublicClient();

  // Verify the project is shared
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('share', true)
    .single();

  if (!project) return null;

  const { data, error } = await supabase
    .from('captures')
    .select('*')
    .eq('id', captureId)
    .eq('project_id', projectId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return rowToCapture(data);
}

// --- HTML entity decoding ---

export function decodeEntities(text: string): string {
  if (!text) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'");
}

export { detectPlatform };
