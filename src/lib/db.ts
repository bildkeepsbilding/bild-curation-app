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
