#!/bin/bash
# Add Article Extraction
# Run from ~/bild-curation-app

echo "🔧 Adding article extraction..."

python3 << 'PYEOF'
content = open('src/app/api/fetch-url/route.ts', 'r').read()

# Find the route handler and add article fetcher before it, plus update the router
old_handler = '''// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let result;
    if (url.includes('reddit.com') || url.includes('redd.it')) {
      result = await fetchReddit(url);
    } else if (url.includes('twitter.com') || url.includes('x.com')) {
      result = await fetchTwitter(url);
    } else if (url.includes('github.com')) {
      result = await fetchGitHub(url);
    } else {
      return NextResponse.json({ error: 'Platform not supported yet. Supports: Reddit, Twitter/X, GitHub' }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}'''

new_handler = """// ── Article Extractor ──

async function resolveUrl(url: string): Promise<string> {
  // Follow redirects (especially t.co links)
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'BildCurationApp/1.0' },
    });
    return response.url || url;
  } catch {
    return url;
  }
}

function extractMetaContent(html: string, property: string): string {
  // Try property attribute
  const propMatch = html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (propMatch) return propMatch[1];

  // Try name attribute
  const nameMatch = html.match(new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'));
  if (nameMatch) return nameMatch[1];

  // Try reversed order (content before property)
  const revMatch = html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, 'i'));
  if (revMatch) return revMatch[1];

  return '';
}

function extractArticleImages(html: string, baseUrl: string): string[] {
  const images: string[] = [];

  // Get og:image first
  const ogImage = extractMetaContent(html, 'og:image');
  if (ogImage) images.push(ogImage);

  // Get images from article/main content area
  const articleMatch = html.match(/<article[^>]*>([\\\s\\\S]*?)<\\/article>/i)
    || html.match(/<main[^>]*>([\\\s\\\S]*?)<\\/main>/i)
    || html.match(/<div[^>]*class=["'][^"']*(?:post|article|content|entry|story)[^"']*["'][^>]*>([\\\s\\\S]*?)<\\/div>/i);

  if (articleMatch) {
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    let match;
    while ((match = imgRegex.exec(articleMatch[1])) !== null) {
      let src = match[1];
      // Skip tiny images, icons, avatars, tracking pixels
      if (src.includes('avatar') || src.includes('icon') || src.includes('logo')
          || src.includes('pixel') || src.includes('1x1') || src.includes('badge')) continue;

      // Make absolute URL
      if (src.startsWith('//')) src = 'https:' + src;
      else if (src.startsWith('/')) {
        try {
          const u = new URL(baseUrl);
          src = u.origin + src;
        } catch { continue; }
      }

      if (!images.includes(src)) images.push(src);
    }
  }

  return images.slice(0, 5); // Max 5 images
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<nav[^>]*>[\\s\\S]*?<\\/nav>/gi, '')
    .replace(/<header[^>]*>[\\s\\S]*?<\\/header>/gi, '')
    .replace(/<footer[^>]*>[\\s\\S]*?<\\/footer>/gi, '')
    .replace(/<aside[^>]*>[\\s\\S]*?<\\/aside>/gi, '')
    .replace(/<[^>]+>/g, '\\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();
}

function extractArticleBody(html: string): string {
  // Try to find the main content area
  const selectors = [
    /<article[^>]*>([\\s\\S]*?)<\\/article>/i,
    /<div[^>]*class=["'][^"']*(?:post-content|article-content|entry-content|story-body|post-body)[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i,
    /<div[^>]*class=["'][^"']*(?:content|main-content|article)[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i,
    /<main[^>]*>([\\s\\S]*?)<\\/main>/i,
  ];

  for (const selector of selectors) {
    const match = html.match(selector);
    if (match) {
      const text = stripHtml(match[1]);
      if (text.length > 200) return text;
    }
  }

  // Fallback: get all <p> tags
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(html)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 30) paragraphs.push(text);
  }

  if (paragraphs.length > 0) return paragraphs.join('\\n\\n');

  // Last resort: strip all HTML
  const fullText = stripHtml(html);
  return fullText.slice(0, 10000);
}

async function fetchArticle(url: string) {
  // Resolve redirects (t.co, bit.ly, etc.)
  const resolvedUrl = await resolveUrl(url);

  // Check if the resolved URL is actually a tweet
  if (resolvedUrl.includes('twitter.com') || resolvedUrl.includes('x.com')) {
    return fetchTwitter(resolvedUrl);
  }
  // Check if resolved URL is Reddit
  if (resolvedUrl.includes('reddit.com')) {
    return fetchReddit(resolvedUrl);
  }
  // Check if resolved URL is GitHub
  if (resolvedUrl.includes('github.com')) {
    return fetchGitHub(resolvedUrl);
  }

  const response = await fetch(resolvedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  });

  if (!response.ok) throw new Error('Failed to fetch article (status ' + response.status + ')');

  const html = await response.text();

  // Extract metadata
  const title = extractMetaContent(html, 'og:title')
    || extractMetaContent(html, 'twitter:title')
    || (html.match(/<title[^>]*>([^<]*)<\\/title>/i)?.[1] || '').trim()
    || 'Untitled';

  const author = extractMetaContent(html, 'author')
    || extractMetaContent(html, 'article:author')
    || extractMetaContent(html, 'twitter:creator')
    || extractMetaContent(html, 'og:site_name')
    || new URL(resolvedUrl).hostname;

  const description = extractMetaContent(html, 'og:description')
    || extractMetaContent(html, 'description')
    || '';

  const body = extractArticleBody(html);
  const images = extractArticleImages(html, resolvedUrl);

  // Detect platform from URL
  let siteName = extractMetaContent(html, 'og:site_name') || '';
  const hostname = new URL(resolvedUrl).hostname;

  return {
    platform: 'article' as const,
    title: title.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    body: body || description || 'Could not extract article content.',
    author,
    images,
    metadata: {
      siteName,
      hostname,
      description,
      resolvedUrl: resolvedUrl !== url ? resolvedUrl : null,
      publishedTime: extractMetaContent(html, 'article:published_time') || null,
    },
  };
}

// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    let result;

    // Check for t.co or short URLs first - resolve them
    if (url.includes('t.co/') || url.includes('bit.ly/') || url.includes('buff.ly/')) {
      result = await fetchArticle(url);
    } else if (url.includes('reddit.com') || url.includes('redd.it')) {
      result = await fetchReddit(url);
    } else if ((url.includes('twitter.com') || url.includes('x.com')) && url.includes('/status/')) {
      result = await fetchTwitter(url);
    } else if (url.includes('github.com')) {
      result = await fetchGitHub(url);
    } else {
      // Default: treat as article
      result = await fetchArticle(url);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}"""

content = content.replace(old_handler, new_handler)

open('src/app/api/fetch-url/route.ts', 'w').write(content)
print('API route updated!')
PYEOF

# Update the placeholder text and supported platforms message
python3 << 'PYEOF2'
content = open('src/app/project/[id]/page.tsx', 'r').read()
content = content.replace(
    "Paste a Reddit, X, or GitHub URL...",
    "Paste any URL — articles, Reddit, X, GitHub..."
)
content = content.replace(
    "Supports: Reddit · More platforms coming soon",
    ""
)
content = content.replace(
    "Paste a Reddit, X, or GitHub URL above",
    "Paste any URL above — articles, Reddit, X, GitHub"
)
open('src/app/project/[id]/page.tsx', 'w').write(content)
print('UI updated!')
PYEOF2

echo "✅ Article extraction added!"
echo ""
echo "Now supports:"
echo "  📰 Any article URL (Medium, Substack, blogs, news)"
echo "  🔗 t.co links from Twitter (auto-resolves to the article)"
echo "  🔴 Reddit"
echo "  🐦 X/Twitter tweets (oEmbed)"
echo "  🐙 GitHub repos"
echo ""
echo "Restart server: npm run dev"
