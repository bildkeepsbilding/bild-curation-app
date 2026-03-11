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

// ── Twitter / X — Multi-strategy extraction ──

function parseTwitterUrl(url: string): { username: string; statusId: string } {
  const match = url.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/);
  if (!match) throw new Error('Invalid Twitter/X URL');
  return { username: match[1], statusId: match[2] };
}

// Strategy 1: FxTwitter API (free, no auth, handles regular + note tweets)
async function fetchViaFxTwitter(username: string, statusId: string): Promise<{
  text: string;
  author: string;
  images: string[];
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  date: string | null;
  isNoteTweet: boolean;
  isArticle: boolean;
} | null> {
  try {
    const response = await fetch(`https://api.fxtwitter.com/${username}/status/${statusId}`, {
      headers: { 'User-Agent': 'BildCurationApp/1.0' },
    });
    if (!response.ok) return null;
    const data = await response.json();
    const tweet = data?.tweet;
    if (!tweet) return null;

    const images: string[] = [];
    if (tweet.media?.photos) {
      for (const p of tweet.media.photos) {
        if (p.url) images.push(p.url);
      }
    }
    if (tweet.media?.videos) {
      for (const v of tweet.media.videos) {
        if (v.thumbnail_url) images.push(v.thumbnail_url);
      }
    }

    const text = tweet.text || '';
    // Detect if this is an article: FxTwitter returns very short/empty text for articles
    // and the original URL typically contains /article/ or the tweet card type hints at it
    const isArticle = (!text || text.length < 50) && (tweet.twitter_card === 'article' || tweet.twitter_card === 'summary_large_image');

    return {
      text,
      author: tweet.author?.screen_name || username,
      images,
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      replies: tweet.replies || 0,
      views: tweet.views || 0,
      date: tweet.created_at || null,
      isNoteTweet: tweet.is_note_tweet || false,
      isArticle,
    };
  } catch (e) {
    console.error('FxTwitter failed:', e);
    return null;
  }
}

// Strategy 2: Twitter Syndication API (free, no auth, may include article/note content)
async function fetchViaSyndication(statusId: string): Promise<{
  text: string;
  author: string;
  authorHandle: string;
  images: string[];
  likes: number;
  date: string | null;
} | null> {
  try {
    const response = await fetch(
      `https://cdn.syndication.twimg.com/tweet-result?id=${statusId}&lang=en&token=0`,
      {
        headers: {
          'User-Agent': 'BildCurationApp/1.0',
          'Accept': 'application/json',
        },
      }
    );
    if (!response.ok) return null;
    const data = await response.json();
    if (!data) return null;

    const images: string[] = [];
    // Syndication API nests media differently
    if (data.mediaDetails) {
      for (const m of data.mediaDetails) {
        if (m.media_url_https) images.push(m.media_url_https);
      }
    }
    if (data.photos) {
      for (const p of data.photos) {
        if (p.url) images.push(p.url);
      }
    }

    // For note tweets, full text may be in data.note_tweet.text or data.text
    let text = '';
    if (data.note_tweet?.text) {
      text = data.note_tweet.text;
    } else if (data.text) {
      text = data.text;
    }

    // For X Articles, check for article_content or richtext
    if (data.article) {
      const articleTitle = data.article.title || '';
      const articleBody = data.article.text || data.article.content || '';
      if (articleBody) {
        text = articleTitle ? `${articleTitle}\n\n${articleBody}` : articleBody;
      }
    }

    // Also check card data which might contain article info
    if ((!text || text.length < 100) && data.card?.legacy?.binding_values) {
      const cardValues = data.card.legacy.binding_values;
      const cardTitle = cardValues.find((v: { key: string }) => v.key === 'title')?.value?.string_value;
      const cardDesc = cardValues.find((v: { key: string }) => v.key === 'description')?.value?.string_value;
      if (cardTitle || cardDesc) {
        const cardText = [cardTitle, cardDesc].filter(Boolean).join('\n\n');
        if (cardText.length > text.length) text = cardText;
      }
    }

    return {
      text,
      author: data.user?.name || '',
      authorHandle: data.user?.screen_name || '',
      images,
      likes: data.favorite_count || 0,
      date: data.created_at || null,
    };
  } catch (e) {
    console.error('Syndication API failed:', e);
    return null;
  }
}

// Strategy 3: Apify tweet scraper (costs credits, use as fallback)
async function fetchViaApify(url: string): Promise<{
  text: string;
  author: string;
  images: string[];
  likes: number;
  retweets: number;
  replies: number;
  date: string | null;
} | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token) return null;

  try {
    const actorId = 'apidojo~tweet-scraper';
    const apiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
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

    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.length === 0) return null;

    const tweet = data[0];
    const images: string[] = [];

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
      text: tweet.full_text || tweet.text || '',
      author: tweet.author?.userName || tweet.user?.screen_name || 'unknown',
      images,
      likes: tweet.likeCount || tweet.favorite_count || 0,
      retweets: tweet.retweetCount || tweet.retweet_count || 0,
      replies: tweet.replyCount || 0,
      date: tweet.createdAt || tweet.created_at || null,
    };
  } catch (e) {
    console.error('Apify failed:', e);
    return null;
  }
}

// Strategy 4: oEmbed (last resort — always returns something)
async function fetchViaOEmbed(url: string): Promise<{
  text: string;
  author: string;
} | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await fetch(oembedUrl);
    if (!response.ok) return null;
    const data = await response.json();

    const cleanText = data.html
      ?.replace(/<[^>]*>/g, '')
      ?.replace(/&amp;/g, '&')
      ?.replace(/&lt;/g, '<')
      ?.replace(/&gt;/g, '>')
      ?.replace(/&quot;/g, '"')
      ?.trim() || '';

    return {
      text: cleanText,
      author: data.author_name || 'unknown',
    };
  } catch {
    return null;
  }
}

// Main Twitter fetch — cascades through strategies
async function fetchTwitter(url: string) {
  const { username, statusId } = parseTwitterUrl(url);

  // Track best result across strategies
  let bestBody = '';
  let author = username;
  let images: string[] = [];
  let likes = 0;
  let retweets = 0;
  let replies = 0;
  let views = 0;
  let date: string | null = null;
  let source = 'unknown';
  let isArticle = false;

  // ── Strategy 1: FxTwitter (free, fast) ──
  const fxResult = await fetchViaFxTwitter(username, statusId);
  if (fxResult) {
    author = fxResult.author;
    images = fxResult.images;
    likes = fxResult.likes;
    retweets = fxResult.retweets;
    replies = fxResult.replies;
    views = fxResult.views;
    date = fxResult.date;
    isArticle = fxResult.isArticle;

    if (fxResult.text && fxResult.text.length > 50) {
      // Good enough — regular tweet or full note tweet
      bestBody = fxResult.text;
      source = 'fxtwitter';
    }
  }

  // ── Strategy 2: Syndication API (free, may have article/note content) ──
  // Try if: no body yet, or article detected, or note tweet (might be truncated)
  if (!bestBody || isArticle || fxResult?.isNoteTweet) {
    const synResult = await fetchViaSyndication(statusId);
    if (synResult) {
      if (!author || author === username) author = synResult.authorHandle || synResult.author || author;
      if (synResult.images.length > images.length) images = synResult.images;
      if (!likes && synResult.likes) likes = synResult.likes;
      if (!date && synResult.date) date = synResult.date;

      if (synResult.text && synResult.text.length > bestBody.length) {
        bestBody = synResult.text;
        source = 'syndication';
      }
    }
  }

  // ── Strategy 3: Apify tweet scraper (costs credits — only if we still have no body) ──
  if (!bestBody || (isArticle && bestBody.length < 100)) {
    const apifyResult = await fetchViaApify(url);
    if (apifyResult) {
      if (!author || author === username) author = apifyResult.author;
      if (apifyResult.images.length > images.length) images = apifyResult.images;
      if (!likes && apifyResult.likes) likes = apifyResult.likes;
      if (!retweets && apifyResult.retweets) retweets = apifyResult.retweets;
      if (!replies && apifyResult.replies) replies = apifyResult.replies;
      if (!date && apifyResult.date) date = apifyResult.date;

      if (apifyResult.text && apifyResult.text.length > bestBody.length) {
        bestBody = apifyResult.text;
        source = 'apify';
      }
    }
  }

  // ── Strategy 4: Apify Twitter Scraper Unlimited (uses Twitter's internal APIs — can get article content) ──
  if (!bestBody || bestBody.length < 100) {
    const token = process.env.APIFY_TOKEN;
    if (token) {
      try {
        const tweetUrl = `https://twitter.com/${username}/status/${statusId}`;
        const scraperUrl = `https://api.apify.com/v2/acts/apidojo~twitter-scraper-lite/run-sync-get-dataset-items?token=${token}`;
        const scraperResponse = await fetch(scraperUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: tweetUrl }],
            maxItems: 1,
          }),
        });

        if (scraperResponse.ok) {
          const scraperData = await scraperResponse.json();
          console.log('Twitter Scraper Unlimited response:', JSON.stringify(scraperData?.[0] ? Object.keys(scraperData[0]) : 'empty', null, 2));
          if (scraperData && scraperData.length > 0) {
            const result = scraperData[0];
            
            // Check multiple fields where article content might live
            let articleText = '';
            
            // Log all text-like fields for debugging
            console.log('Scraper text fields:', {
              text_len: result.text?.length || 0,
              full_text_len: result.full_text?.length || 0,
              note_tweet: !!result.note_tweet,
              article: !!result.article,
              richtext: !!result.richtext,
              card: !!result.card,
              has_data: !!result.data,
            });
            
            // note_tweet contains long-form content
            if (result.note_tweet?.text) {
              articleText = result.note_tweet.text;
            }
            // Some scrapers return it in full_text
            if (!articleText && result.full_text && result.full_text.length > 100) {
              articleText = result.full_text;
            }
            // Or just text
            if (!articleText && result.text && result.text.length > 100) {
              articleText = result.text;
            }
            // Check for article-specific fields
            if (!articleText && result.article?.text) {
              articleText = result.article.text;
            }
            // richtext or content field
            if (!articleText && result.richtext) {
              articleText = typeof result.richtext === 'string' ? result.richtext : JSON.stringify(result.richtext);
            }
            // card content
            if (!articleText && result.card?.legacy?.binding_values) {
              const vals = result.card.legacy.binding_values;
              const cardBody = vals.find?.((v: { key: string }) => v.key === 'body')?.value?.string_value;
              if (cardBody) articleText = cardBody;
            }

            if (articleText && articleText.length > bestBody.length) {
              bestBody = articleText;
              source = 'scraper-unlimited';
              isArticle = true;
            }

            // Also grab images and metadata if better
            if (result.media?.length) {
              const newImages = result.media
                .filter((m: { media_url_https?: string }) => m.media_url_https)
                .map((m: { media_url_https: string }) => m.media_url_https);
              if (newImages.length > images.length) images = newImages;
            }
          }
        }
      } catch (e) {
        console.error('Twitter Scraper Unlimited failed:', e);
      }
    }
  }

  // ── Strategy 5: oEmbed (last resort) ──
  if (!bestBody) {
    const oembedResult = await fetchViaOEmbed(url);
    if (oembedResult) {
      bestBody = oembedResult.text;
      if (!author || author === username) author = oembedResult.author;
      source = 'oembed';
    }
  }

  if (!bestBody) {
    throw new Error('Could not extract content from this tweet/article. The post may be private or deleted.');
  }

  // Clean up the body text
  bestBody = bestBody
    .replace(/https:\/\/t\.co\/\w+/g, '') // Remove t.co links
    .trim();

  const title = isArticle
    ? bestBody.split('\n')[0]?.slice(0, 120) || 'X Article'
    : bestBody.slice(0, 100) + (bestBody.length > 100 ? '...' : '');

  return {
    platform: 'twitter',
    title,
    body: bestBody,
    author: author.startsWith('@') ? author : `@${author}`,
    images,
    metadata: {
      likes,
      retweets,
      replies,
      views: views || null,
      date,
      isArticle,
      source,
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
