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
