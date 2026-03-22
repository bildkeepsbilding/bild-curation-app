/**
 * Pure content transform utilities shared between CaptureRenderer (UI) and
 * buildExportData (export). No React imports, no side effects.
 */

// ── Image marker conversion ──

/** Convert [image:URL] markers (from X Article extraction) to markdown image syntax */
export function convertImageMarkers(body: string): string {
  return body.replace(/\[image:([^\]]+)\]/g, '![image]($1)');
}

// ── GitHub transforms ──

export interface GitHubSections {
  fileTree: string;
  readmeContent: string;
}

/** Split a GitHub capture body into its structured sections.
 *  Returns fileTree and readmeContent (both may be empty strings). */
export function extractGitHubSections(body: string): GitHubSections {
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
  }

  return { fileTree, readmeContent };
}

/** Strip metadata lines that are already shown in the GitHub metadata header
 *  (description, stars/forks, languages, topics). */
export function stripGitHubMetadataLines(body: string, metadata: Record<string, unknown> | null): string {
  const lines = body.split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (metadata?.description && trimmed === String(metadata.description)) return false;
    if (/^(Stars?|⭐)\s*[:：]?\s*[\d,]+\s*[·•]\s*(Forks?|🍴)/i.test(trimmed)) return false;
    if (/^\d[\d,]*\s*stars?\s*[·•]/i.test(trimmed)) return false;
    if (/^Languages?[:：]\s/i.test(trimmed)) return false;
    if (/^Topics?[:：]\s/i.test(trimmed)) return false;
    return true;
  });
  return filtered.join('\n').replace(/^\n+/, '');
}

/** Extract owner/repo from a GitHub URL */
export function parseGitHubOwnerRepo(url: string): { owner: string; repo: string } {
  const parts = url.replace(/^https?:\/\/(www\.)?github\.com\//, '').split('/');
  return { owner: parts[0] || '', repo: parts[1] || '' };
}

/** Convert relative <img> tags to absolute GitHub raw URLs, or strip if unresolvable */
export function resolveGitHubImages(content: string, owner: string, repo: string): string {
  return content.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*\/?>/gi, (_match, src: string) => {
    if (/^https?:\/\//.test(src)) {
      return `![](${src})`;
    }
    if (owner && repo) {
      const cleanPath = src.replace(/^\.?\//, '');
      return `![](https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${cleanPath})`;
    }
    return '';
  });
}

// ── Top-level orchestrator ──

interface ProcessContentOptions {
  /** GitHub capture URL — needed for resolving relative image paths */
  url?: string;
  /** Capture metadata — needed for GitHub metadata stripping */
  metadata?: Record<string, unknown> | null;
}

/** Apply platform-aware content transforms to a raw capture body.
 *  Returns a cleaned string ready for rendering or export. */
export function processContent(rawBody: string, platform: string, opts: ProcessContentOptions = {}): string {
  let body = rawBody;

  // Convert [image:URL] markers to markdown (all platforms)
  body = convertImageMarkers(body);

  if (platform === 'github') {
    const { url, metadata } = opts;
    const { owner, repo } = url ? parseGitHubOwnerRepo(url) : { owner: '', repo: '' };
    const { fileTree, readmeContent } = extractGitHubSections(body);

    if (!fileTree && !readmeContent) {
      // Unstructured GitHub body — strip metadata lines
      body = stripGitHubMetadataLines(body, metadata ?? null);
    } else {
      // Structured body — resolve images in README, reassemble
      const parts: string[] = [];
      if (fileTree) parts.push(fileTree);
      if (readmeContent) {
        let readme = readmeContent;
        if (owner && repo) {
          readme = resolveGitHubImages(readme, owner, repo);
        }
        parts.push(readme);
      }
      body = parts.join('\n\n---\n\n');
    }

    // Resolve any remaining HTML <img> tags
    if (url) {
      const { owner: o, repo: r } = parseGitHubOwnerRepo(url);
      if (o && r) {
        body = resolveGitHubImages(body, o, r);
      }
    }
  }

  return body.trim();
}
