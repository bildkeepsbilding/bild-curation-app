'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getProjects, getCaptures, createProject, deleteProject, type Project } from '@/lib/db';

interface ProjectWithCover extends Project {
  coverImage?: string;
  platforms: string[];
}

export default function Home() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBrief, setNewBrief] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (showCreate && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showCreate]);

  async function loadProjects() {
    try {
      const p = await getProjects();
      // Fetch cover images and platform info for each project
      const enriched: ProjectWithCover[] = await Promise.all(
        p.map(async (project) => {
          try {
            const captures = await getCaptures(project.id);
            const coverImage = captures.find(c => c.images && c.images.length > 0)?.images[0];
            const platforms = [...new Set(captures.map(c => c.platform))];
            return { ...project, coverImage, platforms };
          } catch {
            return { ...project, platforms: [] };
          }
        })
      );
      setProjects(enriched);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    try {
      await createProject(name, newBrief.trim());
      setNewName('');
      setNewBrief('');
      setShowCreate(false);
      await loadProjects();
    } catch (e) {
      console.error('Failed to create project:', e);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setDeleteConfirm(null);
      await loadProjects();
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  }

  function formatDate(ts: number) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  const platformColors: Record<string, string> = {
    twitter: '#1DA1F2',
    reddit: '#FF4500',
    github: '#8B5CF6',
    article: '#10B981',
    other: '#6B7280',
  };

  return (
    <main className="min-h-dvh safe-top safe-bottom">
      <header className="px-5 pt-8 pb-6 flex items-end justify-between max-w-5xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Bild
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-semibold transition-all active:scale-95"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New Project
        </button>
      </header>

      {/* Create Modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowCreate(false); setNewName(''); } }}
        >
          <div className="w-full sm:max-w-md p-6 rounded-t-2xl sm:rounded-2xl animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>New Project</h2>
            <input
              ref={inputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && handleCreate()}
              placeholder="Project name..."
              className="w-full px-4 py-3 rounded-xl text-base outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
              maxLength={50}
            />
            <div className="mt-3">
              <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: 'var(--accent)' }}>Project Brief</label>
              <textarea
                value={newBrief}
                onChange={(e) => setNewBrief(e.target.value)}
                placeholder="What is this project about? What are you trying to learn or build?"
                rows={3}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-primary)', lineHeight: 1.6 }}
              />
              <p className="text-[10px] mt-1 px-1" style={{ color: 'var(--text-tertiary)' }}>This becomes the header of every Claude export — giving immediate context about your collection.</p>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setShowCreate(false); setNewName(''); setNewBrief(''); }} className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-95" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={handleCreate} disabled={!newName.trim()} className="flex-1 py-3 rounded-xl text-sm font-semibold active:scale-95 disabled:opacity-30" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}
        >
          <div className="w-full sm:max-w-sm p-6 rounded-t-2xl sm:rounded-2xl animate-fade-up" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-semibold mb-2">Delete Project</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>This will permanently delete the project and all its captures. This can&apos;t be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-xl text-sm font-medium active:scale-95" style={{ background: 'var(--bg)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 py-3 rounded-xl text-sm font-semibold active:scale-95" style={{ background: 'var(--danger)', color: '#fff' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="px-5 pb-8 max-w-5xl mx-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--text-tertiary)' }}>
                <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="6.5" cy="6" r="0.75" fill="currentColor" />
                <circle cx="9.5" cy="6" r="0.75" fill="currentColor" />
              </svg>
            </div>
            <p className="text-base font-medium" style={{ color: 'var(--text-secondary)' }}>No projects yet</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>Create one to start curating</p>
          </div>
        ) : (
          <div className="project-grid stagger-children">
            {projects.map((project) => (
              <div
                key={project.id}
                className="capture-card group rounded-2xl overflow-hidden cursor-pointer"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
                onClick={() => router.push(`/project/${project.id}`)}
              >
                {/* Cover image or gradient placeholder */}
                <div className="relative h-36 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  {project.coverImage ? (
                    <img
                      src={project.coverImage}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{
                      background: `linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-elevated) 100%)`
                    }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--border)' }}>
                        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M3 16l5-5 4 4 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    </div>
                  )}
                  {/* Gradient fade at bottom */}
                  <div className="absolute inset-x-0 bottom-0 h-16" style={{
                    background: 'linear-gradient(to top, var(--bg-elevated), transparent)'
                  }} />
                  {/* Capture count badge */}
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-semibold" style={{
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--text-primary)'
                  }}>
                    {project.captureCount || 0} capture{(project.captureCount || 0) !== 1 ? 's' : ''}
                  </div>
                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(project.id); }}
                    className="absolute top-3 left-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', color: 'var(--text-secondary)' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                </div>

                {/* Card body */}
                <div className="p-4">
                  <h3 className="text-lg font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                    {project.name}
                  </h3>
                  {project.brief && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
                      {project.brief}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {/* Platform dots */}
                    {project.platforms.length > 0 && (
                      <div className="flex items-center gap-1">
                        {project.platforms.map(p => (
                          <div
                            key={p}
                            className="w-2 h-2 rounded-full"
                            style={{ background: platformColors[p] || platformColors.other }}
                            title={p}
                          />
                        ))}
                      </div>
                    )}
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {formatDate(project.updatedAt)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
