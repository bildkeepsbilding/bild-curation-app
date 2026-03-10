import { NextRequest, NextResponse } from 'next/server';

// ── Reddit ──

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
}

interface RedditComment {
  author: string;
  body: string;
  score: number;
  created_utc: number;
}

function extractRedditImages(postData: RedditPost): string[] {
  const images: string[] = [];
  if (postData.is_gallery && postData.media_metadata) {
    for (const item of Object.values(postData.media_metadata)) {
      if (item.s?.u) images.push(item.s.u.replace(/&amp;/g, '&'));
    }
  }
  if (postData.preview?.images) {
    for (const img of postData.preview.images) {
      if (img.source?.url) images.push(img.source.url.replace(/&amp;/g, '&'));
    }
  }
  if (postData.url_overridden_by_dest) {
    const u = postData.url_overridden_by_dest;
    if (u.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) && !images.includes(u)) images.push(u);
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
  if (!Array.isArray(data) || data.length < 1) throw new Error('Unexpected Reddit response');

  const postData: RedditPost = data[0].data.children[0].data;
  const commentsData = data.length > 1 ? data[1].data.children : [];
  const comments = extractRedditComments(commentsData);
  const commentText = comments.length > 0 ? '\n\n---\n\nTop Comments:\n\n' + comments.slice(0, 20).join('\n\n') : '';
  const images = extractRedditImages(postData);

  return {
    platform: 'reddit',
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

// ── Twitter via Apify ──

async function fetchTwitter(url: string) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('Apify token not configured. Add APIFY_TOKEN to .env.local');

  // Use the free-friendly tweet scraper
  const actorId = 'apidojo~tweet-scraper';
  const apiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;

  // Extract tweet URLs - handle both twitter.com and x.com
  const tweetUrl = url.replace('x.com', 'twitter.com');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url: tweetUrl }],
      maxItems: 1,
      addUserInfo: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Apify error:', errText);
    // Fallback to oEmbed
    return fetchTwitterOEmbed(url);
  }

  const data = await response.json();

  if (!data || data.length === 0) {
    // Fallback to oEmbed
    return fetchTwitterOEmbed(url);
  }

  const tweet = data[0];
  const images: string[] = [];

  // Extract media
  if (tweet.media) {
    for (const m of tweet.media) {
      if (m.media_url_https) images.push(m.media_url_https);
    }
  }
  if (tweet.photos) {
    for (const p of tweet.photos) {
      if (p.url) images.push(p.url);
    }
  }
  if (tweet.extendedEntities?.media) {
    for (const m of tweet.extendedEntities.media) {
      if (m.media_url_https && !images.includes(m.media_url_https)) {
        images.push(m.media_url_https);
      }
    }
  }

  return {
    platform: 'twitter',
    title: tweet.full_text?.slice(0, 100) || tweet.text?.slice(0, 100) || 'Tweet',
    body: tweet.full_text || tweet.text || '',
    author: `@${tweet.author?.userName || tweet.user?.screen_name || 'unknown'}`,
    images,
    metadata: {
      likes: tweet.likeCount || tweet.favorite_count || 0,
      retweets: tweet.retweetCount || tweet.retweet_count || 0,
      replies: tweet.replyCount || 0,
      date: tweet.createdAt || tweet.created_at || null,
    },
  };
}

async function fetchTwitterOEmbed(url: string) {
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
  const response = await fetch(oembedUrl);

  if (!response.ok) throw new Error('Could not fetch tweet. Check the URL.');

  const data = await response.json();

  // Strip HTML tags from the oembed html to get clean text
  const cleanText = data.html
    ?.replace(/<[^>]*>/g, '')
    ?.replace(/&amp;/g, '&')
    ?.replace(/&lt;/g, '<')
    ?.replace(/&gt;/g, '>')
    ?.replace(/&quot;/g, '"')
    ?.trim() || '';

  return {
    platform: 'twitter',
    title: cleanText.slice(0, 100) || 'Tweet',
    body: cleanText,
    author: `@${data.author_name || 'unknown'}`,
    images: [],
    metadata: {
      authorUrl: data.author_url || null,
      source: 'oembed',
    },
  };
}

// ── GitHub ──

async function fetchGitHub(url: string) {
  // Parse GitHub URL to extract owner/repo
  const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!match) throw new Error('Invalid GitHub URL');

  const owner = match[1];
  const repo = match[2].replace(/\.git$/, '').split('/')[0].split('#')[0].split('?')[0];

  // Fetch repo info
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: {
      'User-Agent': 'BildCurationApp/1.0',
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!repoResponse.ok) throw new Error(`GitHub returned ${repoResponse.status}`);
  const repoData = await repoResponse.json();

  // Fetch README
  let readmeContent = '';
  try {
    const readmeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: {
        'User-Agent': 'BildCurationApp/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    });
    if (readmeResponse.ok) {
      const readmeData = await readmeResponse.json();
      if (readmeData.content) {
        readmeContent = Buffer.from(readmeData.content, 'base64').toString('utf-8');
      }
    }
  } catch {
    // README not found, that's fine
  }

  const body = [
    repoData.description || '',
    '',
    `Stars: ${repoData.stargazers_count} · Forks: ${repoData.forks_count} · Issues: ${repoData.open_issues_count}`,
    `Language: ${repoData.language || 'Unknown'}`,
    repoData.topics?.length ? `Topics: ${repoData.topics.join(', ')}` : '',
    '',
    readmeContent ? '---\n\nREADME:\n\n' + readmeContent : '',
  ].filter(Boolean).join('\n');

  return {
    platform: 'github',
    title: `${owner}/${repo}`,
    body,
    author: owner,
    images: repoData.owner?.avatar_url ? [repoData.owner.avatar_url] : [],
    metadata: {
      stars: repoData.stargazers_count,
      forks: repoData.forks_count,
      issues: repoData.open_issues_count,
      language: repoData.language,
      topics: repoData.topics || [],
      createdAt: repoData.created_at,
      updatedAt: repoData.updated_at,
      homepage: repoData.homepage || null,
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
}
