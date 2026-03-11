import { NextRequest, NextResponse } from 'next/server';

// Allow up to 60 seconds for this route (Apify actors need time)
export const maxDuration = 60;

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

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Common browser-like headers to avoid Reddit blocking cloud IPs
const REDDIT_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

type RedditJsonResult = { postData: RedditPost; commentsData: Array<{ kind: string; data: RedditComment & { replies?: { data?: { children?: Array<{ kind: string; data: RedditComment }> } } } }> };

function parseRedditJsonResponse(data: unknown): RedditJsonResult {
  if (!Array.isArray(data) || data.length < 1) throw new Error('Unexpected Reddit JSON response');
  const postData: RedditPost = data[0].data.children[0].data;
  const commentsData = data.length > 1 ? data[1].data.children : [];
  return { postData, commentsData };
}

// Strategy 1: www.reddit.com .json endpoint
async function fetchRedditJsonWww(url: string, attempt = 0): Promise<RedditJsonResult> {
  let cleanUrl = url.split('?')[0];
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  if (!cleanUrl.endsWith('.json')) cleanUrl += '.json';

  const response = await fetch(cleanUrl, {
    headers: { ...REDDIT_HEADERS, 'Accept': 'application/json, text/html' },
  });

  // Retry once on rate limit (429) with 1.5s delay
  if (response.status === 429 && attempt < 1) {
    await new Promise(r => setTimeout(r, 1500));
    return fetchRedditJsonWww(url, attempt + 1);
  }

  if (!response.ok) throw new Error(`www.reddit.com JSON returned ${response.status}`);

  const text = await response.text();
  // Reddit sometimes returns HTML even for .json — detect that
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    throw new Error('Reddit returned HTML instead of JSON (likely blocked)');
  }

  const data = JSON.parse(text);
  return parseRedditJsonResponse(data);
}

// Strategy 2: old.reddit.com HTML scraping (more scraper-friendly)
async function fetchRedditOldHtml(url: string): Promise<{ title: string; selftext: string; author: string; subreddit: string }> {
  const oldUrl = url.replace(/(?:www\.)?reddit\.com/, 'old.reddit.com').split('?')[0];

  const response = await fetch(oldUrl, {
    headers: REDDIT_HEADERS,
    redirect: 'follow',
  });

  if (!response.ok) throw new Error(`old.reddit.com returned ${response.status}`);
  const html = await response.text();

  // Detect block pages
  if (html.length < 500 && (html.includes('blocked') || html.includes('rate limit'))) {
    throw new Error('old.reddit.com blocked request');
  }

  // Extract title
  const titleMatch = html.match(/<a[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/i)
    || html.match(/<title>([^<]+)<\/title>/i);
  const title = (titleMatch?.[1] || 'Untitled').replace(/\s*:\s*\w+$/, '').trim();

  // Extract selftext from .usertext-body
  const selftextMatch = html.match(/<div[^>]*class="[^"]*usertext-body[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
    || html.match(/<div[^>]*class="[^"]*md[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  let selftext = '';
  if (selftextMatch) {
    selftext = selftextMatch[1]
      .replace(/<\/(?:p|div|h[1-6]|li|blockquote|br|tr)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const authorMatch = html.match(/class="[^"]*author[^"]*"[^>]*>([^<]+)<\/a>/i);
  const author = authorMatch?.[1] || 'unknown';
  const subMatch = html.match(/\/r\/(\w+)/);
  const subreddit = subMatch?.[1] || 'unknown';

  return { title, selftext, author, subreddit };
}

// Strategy 3: old.reddit.com .json endpoint (different rate limiting than www)
async function fetchRedditJsonOld(url: string): Promise<RedditJsonResult> {
  let cleanUrl = url.replace(/(?:www\.)?reddit\.com/, 'old.reddit.com').split('?')[0];
  if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
  if (!cleanUrl.endsWith('.json')) cleanUrl += '.json';

  const response = await fetch(cleanUrl, {
    headers: { ...REDDIT_HEADERS, 'Accept': 'application/json, text/html' },
  });

  if (!response.ok) throw new Error(`old.reddit.com JSON returned ${response.status}`);

  const text = await response.text();
  if (text.trimStart().startsWith('<!') || text.trimStart().startsWith('<html')) {
    throw new Error('old.reddit.com returned HTML instead of JSON');
  }

  const data = JSON.parse(text);
  return parseRedditJsonResponse(data);
}

async function fetchReddit(url: string) {
  let postData: RedditPost;
  let commentsData: Array<{ kind: string; data: RedditComment & { replies?: { data?: { children?: Array<{ kind: string; data: RedditComment }> } } } }> = [];
  let extractionMethod = '';
  const errors: string[] = [];

  // Strategy 1: www.reddit.com .json
  try {
    const result = await fetchRedditJsonWww(url);
    postData = result.postData;
    commentsData = result.commentsData;
    extractionMethod = 'www.reddit.com/json';
    console.log(`[Reddit] Strategy 1 succeeded: ${extractionMethod}`);
  } catch (err1) {
    const msg1 = err1 instanceof Error ? err1.message : 'unknown';
    errors.push(`Strategy 1 (www JSON): ${msg1}`);
    console.warn(`[Reddit] Strategy 1 failed: ${msg1}`);

    // Strategy 2: old.reddit.com HTML scraping
    try {
      const htmlResult = await fetchRedditOldHtml(url);
      extractionMethod = 'old.reddit.com/html';
      console.log(`[Reddit] Strategy 2 succeeded: ${extractionMethod}`);
      postData = {
        title: htmlResult.title,
        selftext: htmlResult.selftext,
        author: htmlResult.author,
        subreddit: htmlResult.subreddit,
        score: 0,
        num_comments: 0,
        url: url,
        created_utc: 0,
        permalink: new URL(url).pathname,
      };
    } catch (err2) {
      const msg2 = err2 instanceof Error ? err2.message : 'unknown';
      errors.push(`Strategy 2 (old HTML): ${msg2}`);
      console.warn(`[Reddit] Strategy 2 failed: ${msg2}`);

      // Strategy 3: old.reddit.com .json endpoint (different rate limiting)
      try {
        const result = await fetchRedditJsonOld(url);
        postData = result.postData;
        commentsData = result.commentsData;
        extractionMethod = 'old.reddit.com/json';
        console.log(`[Reddit] Strategy 3 succeeded: ${extractionMethod}`);
      } catch (err3) {
        const msg3 = err3 instanceof Error ? err3.message : 'unknown';
        errors.push(`Strategy 3 (old JSON): ${msg3}`);
        console.error(`[Reddit] All 3 strategies failed:`, errors);
        throw new Error(`Reddit extraction failed: ${errors.join(' | ')}`);
      }
    }
  }

  // Handle crosspost: if selftext is empty, check crosspost_parent_list
  let selftext = postData.selftext || '';
  const crosspostList = (postData as unknown as Record<string, unknown>).crosspost_parent_list as Array<{ selftext?: string; title?: string; author?: string; subreddit?: string }> | undefined;
  if (!selftext && crosspostList && crosspostList.length > 0) {
    const parent = crosspostList[0];
    if (parent.selftext) {
      selftext = parent.selftext;
      // Note the crosspost source
      selftext = `[Crosspost from r/${parent.subreddit || 'unknown'} by u/${parent.author || 'unknown'}]\n\n${selftext}`;
    }
  }

  const comments = extractRedditComments(commentsData);
  const commentText = comments.length > 0 ? '\n\n---\n\nTop Comments:\n\n' + comments.slice(0, 20).join('\n\n') : '';
  const images = extractRedditImages(postData);

  return {
    platform: 'reddit',
    title: postData.title,
    body: (selftext || '(Link post)') + commentText,
    author: `u/${postData.author}`,
    images,
    metadata: {
      subreddit: postData.subreddit,
      score: postData.score,
      numComments: postData.num_comments,
      flair: postData.link_flair_text || null,
      permalink: `https://reddit.com${postData.permalink}`,
      createdUtc: postData.created_utc,
      extractionMethod,
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

    let text = tweet.text || '';
    let isArticle = false;

    // Extract full article content from FxTwitter's article.content.blocks
    // Interleaves text and inline images using [image:URL] markers
    // Uses entityMap to correctly map atomic blocks → mediaId → media_entity URL
    if (tweet.article?.content?.blocks) {
      const blocks = tweet.article.content.blocks as Array<{ text?: string; type?: string; entityRanges?: Array<{ key: number; length: number; offset: number }> }>;
      const mediaEntities = (tweet.article.media_entities || []) as Array<{ media_id?: string; media_info?: { original_img_url?: string } }>;
      const entityMap = tweet.article.content.entityMap as Array<{ key: string; value: { type: string; data: { mediaItems?: Array<{ mediaId: string }> } } }> | undefined;

      // Build lookup: mediaId → image URL from media_entities
      const mediaIdToUrl: Record<string, string> = {};
      for (const me of mediaEntities) {
        if (me.media_id && me.media_info?.original_img_url) {
          mediaIdToUrl[me.media_id] = me.media_info.original_img_url;
        }
      }

      // Build lookup: entity key → image URL via entityMap → mediaId → media_entity
      const entityKeyToUrl: Record<string, string> = {};
      if (entityMap && Array.isArray(entityMap)) {
        for (const entry of entityMap) {
          const key = entry.key;
          const val = entry.value;
          if (val?.type === 'MEDIA' && val.data?.mediaItems) {
            for (const item of val.data.mediaItems) {
              if (item.mediaId && mediaIdToUrl[item.mediaId]) {
                entityKeyToUrl[key] = mediaIdToUrl[item.mediaId];
              }
            }
          }
        }
      }

      let fallbackMediaIndex = 0;
      const parts: string[] = [];

      for (const block of blocks) {
        if (block.type === 'atomic') {
          // Resolve image URL via entity key chain: block → entityRanges → entityMap → mediaId → URL
          let imgUrl: string | undefined;
          const entityKey = block.entityRanges?.[0]?.key;
          if (entityKey !== undefined && entityKeyToUrl[String(entityKey)]) {
            imgUrl = entityKeyToUrl[String(entityKey)];
          } else if (fallbackMediaIndex < mediaEntities.length) {
            // Fallback to sequential if entity key mapping unavailable
            imgUrl = mediaEntities[fallbackMediaIndex]?.media_info?.original_img_url;
          }
          if (imgUrl) parts.push(`[image:${imgUrl}]`);
          fallbackMediaIndex++;
        } else if (block.text && block.text.length > 0) {
          parts.push(block.text);
        }
      }

      const articleText = parts.join('\n\n');
      if (articleText.length > text.length) {
        const title = tweet.article.title || '';
        text = title ? `${title}\n\n${articleText}` : articleText;
        isArticle = true;
      }
    }

    // Detect article even if content.blocks is missing
    if (!isArticle && (!text || text.length < 50)) {
      isArticle = tweet.twitter_card === 'article' || tweet.twitter_card === 'summary_large_image' || !!tweet.article;
    }

    // Extract article images: cover + inline media_entities
    if (tweet.article?.cover_media?.media_info?.original_img_url) {
      const coverUrl = tweet.article.cover_media.media_info.original_img_url;
      if (!images.includes(coverUrl)) images.unshift(coverUrl);
    }
    if (tweet.article?.media_entities) {
      for (const entity of tweet.article.media_entities) {
        const url = entity?.media_info?.original_img_url;
        if (url && !images.includes(url)) images.push(url);
      }
    }

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

  // ── Strategy 4: oEmbed (last resort) ──
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

const GH_HEADERS = {
  'User-Agent': BROWSER_UA,
  'Accept': 'application/vnd.github.v3+json',
};

// Parse GitHub URL — handles repo root, blob (file), and tree (directory) URLs
function parseGitHubUrl(url: string): { owner: string; repo: string; filePath?: string; ref?: string } {
  // Match: github.com/owner/repo/blob/ref/path/to/file
  const fileMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+)/);
  if (fileMatch) {
    return {
      owner: fileMatch[1],
      repo: fileMatch[2].replace(/\.git$/, ''),
      ref: fileMatch[3],
      filePath: fileMatch[4].split('#')[0].split('?')[0],
    };
  }

  // Match: github.com/owner/repo (with optional trailing segments)
  const repoMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
  if (!repoMatch) throw new Error('Invalid GitHub URL');

  return {
    owner: repoMatch[1],
    repo: repoMatch[2].replace(/\.git$/, '').split('/')[0].split('#')[0].split('?')[0],
  };
}

// Fetch a specific file's content from a GitHub repo
async function fetchGitHubFile(owner: string, repo: string, filePath: string, ref?: string) {
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${ref}` : ''}`;
  const response = await fetch(apiUrl, { headers: GH_HEADERS });
  if (!response.ok) throw new Error(`GitHub file returned ${response.status}`);
  const data = await response.json();

  let content = '';
  if (data.content && data.encoding === 'base64') {
    content = Buffer.from(data.content, 'base64').toString('utf-8');
    // If truncated (size > actual decoded length), fetch raw
    if (data.size && content.length < data.size * 0.9) {
      const rawResponse = await fetch(data.download_url, { headers: { 'User-Agent': BROWSER_UA } });
      if (rawResponse.ok) content = await rawResponse.text();
    }
  } else if (data.download_url) {
    const rawResponse = await fetch(data.download_url, { headers: { 'User-Agent': BROWSER_UA } });
    if (rawResponse.ok) content = await rawResponse.text();
  }

  return { content, name: data.name, path: data.path, size: data.size, htmlUrl: data.html_url };
}

async function fetchGitHub(url: string) {
  const parsed = parseGitHubUrl(url);
  const { owner, repo } = parsed;

  // If URL points to a specific file, extract that file instead of README
  if (parsed.filePath) {
    const file = await fetchGitHubFile(owner, repo, parsed.filePath, parsed.ref);

    // Also fetch repo info for context
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH_HEADERS });
    const repoData = repoResponse.ok ? await repoResponse.json() : null;

    const body = [
      repoData?.description ? `Repository: ${repoData.description}` : '',
      '',
      `File: ${file.path} (${file.size ? (file.size / 1024).toFixed(1) + ' KB' : 'unknown size'})`,
      '',
      '---',
      '',
      file.content,
    ].filter(s => s !== undefined).join('\n');

    return {
      platform: 'github',
      title: `${owner}/${repo} — ${file.name}`,
      body,
      author: owner,
      images: repoData?.owner?.avatar_url ? [repoData.owner.avatar_url] : [],
      metadata: {
        stars: repoData?.stargazers_count || 0,
        forks: repoData?.forks_count || 0,
        issues: repoData?.open_issues_count || 0,
        language: repoData?.language || null,
        topics: repoData?.topics || [],
        createdAt: repoData?.created_at || null,
        updatedAt: repoData?.updated_at || null,
        homepage: repoData?.homepage || null,
        filePath: file.path,
      },
    };
  }

  // Fetch repo info, README, file tree, and languages in parallel
  const [repoResponse, readmeResult, treeResult, langResult] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: GH_HEADERS }),
    // README
    (async () => {
      try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers: GH_HEADERS });
        if (!resp.ok) return '';
        const data = await resp.json();
        if (data.content && data.encoding === 'base64') {
          let content = Buffer.from(data.content, 'base64').toString('utf-8');
          // If content appears truncated, fetch via raw URL
          if (data.download_url && data.size && content.length < data.size * 0.9) {
            const rawResp = await fetch(data.download_url, { headers: { 'User-Agent': BROWSER_UA } });
            if (rawResp.ok) content = await rawResp.text();
          }
          return content;
        }
        if (data.download_url) {
          const rawResp = await fetch(data.download_url, { headers: { 'User-Agent': BROWSER_UA } });
          if (rawResp.ok) return await rawResp.text();
        }
        return '';
      } catch { return ''; }
    })(),
    // File tree
    (async () => {
      try {
        const defaultBranch = 'HEAD';
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`, { headers: GH_HEADERS });
        if (!resp.ok) return '';
        const data = await resp.json();
        if (!data.tree || !Array.isArray(data.tree)) return '';
        // Build compact tree listing, limit to 200 entries to keep it manageable
        const entries = data.tree
          .filter((e: { type: string }) => e.type === 'blob' || e.type === 'tree')
          .slice(0, 200)
          .map((e: { path: string; type: string }) => `${e.type === 'tree' ? '📁' : '  '} ${e.path}`);
        if (data.truncated) entries.push(`  ... (tree truncated, ${data.tree.length}+ files)`);
        return entries.join('\n');
      } catch { return ''; }
    })(),
    // Languages
    (async () => {
      try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`, { headers: GH_HEADERS });
        if (!resp.ok) return {};
        return await resp.json();
      } catch { return {}; }
    })(),
  ]);

  if (!repoResponse.ok) throw new Error(`GitHub returned ${repoResponse.status}`);
  const repoData = await repoResponse.json();

  // Format language breakdown as percentages
  const langEntries = Object.entries(langResult as Record<string, number>);
  let langBreakdown = '';
  if (langEntries.length > 0) {
    const totalBytes = langEntries.reduce((sum, [, bytes]) => sum + bytes, 0);
    langBreakdown = langEntries
      .sort(([, a], [, b]) => b - a)
      .map(([lang, bytes]) => `${lang}: ${((bytes / totalBytes) * 100).toFixed(1)}%`)
      .join(', ');
  }

  const body = [
    repoData.description || '',
    '',
    `Stars: ${repoData.stargazers_count} · Forks: ${repoData.forks_count} · Issues: ${repoData.open_issues_count}`,
    `Language: ${repoData.language || 'Unknown'}`,
    langBreakdown ? `Languages: ${langBreakdown}` : '',
    repoData.topics?.length ? `Topics: ${repoData.topics.join(', ')}` : '',
    '',
    treeResult ? '---\n\nProject Structure:\n\n' + treeResult : '',
    '',
    readmeResult ? '---\n\nREADME:\n\n' + readmeResult : '',
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
      languages: langResult || {},
      topics: repoData.topics || [],
      createdAt: repoData.created_at,
      updatedAt: repoData.updated_at,
      homepage: repoData.homepage || null,
    },
  };
}

// ── Generic Article ──

function extractMetaContent(html: string, property: string): string {
  // Match both property="..." and name="..." attributes
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  );
  const match = html.match(regex);
  return (match?.[1] || match?.[2] || '').trim();
}

function extractArticleContent(html: string): string {
  // Remove scripts, styles, nav, footer, header, sidebar elements
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Try to extract content from <article> tag first
  const articleMatch = clean.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    clean = articleMatch[1];
  } else {
    // Try <main> tag
    const mainMatch = clean.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      clean = mainMatch[1];
    } else {
      // Try common content class patterns
      const contentMatch = clean.match(/<div[^>]*class="[^"]*(?:post-content|article-content|entry-content|post-body|story-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (contentMatch) {
        clean = contentMatch[1];
      }
    }
  }

  // Convert block elements to newlines, strip remaining HTML
  clean = clean
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|br|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Filter out very short blocks (likely navigation remnants)
  const blocks = clean.split(/\n\n+/);
  const meaningful = blocks.filter(b => b.trim().length > 20);
  return meaningful.join('\n\n');
}

async function fetchArticle(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) throw new Error(`Page returned ${response.status}`);

  const html = await response.text();

  // Extract Open Graph and meta tags
  const ogTitle = extractMetaContent(html, 'og:title');
  const ogDescription = extractMetaContent(html, 'og:description');
  const ogImage = extractMetaContent(html, 'og:image');
  const ogSiteName = extractMetaContent(html, 'og:site_name');
  const metaAuthor = extractMetaContent(html, 'author');
  const metaDescription = extractMetaContent(html, 'description');
  const publishedTime = extractMetaContent(html, 'article:published_time');

  // Extract <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const htmlTitle = titleMatch?.[1]?.trim() || '';

  const title = ogTitle || htmlTitle || 'Untitled Article';
  const body = extractArticleContent(html);

  if (!body || body.length < 50) {
    throw new Error('Could not extract meaningful content from this page. The page may require JavaScript or authentication.');
  }

  // Determine author from meta, OG, or domain
  const domain = new URL(url).hostname.replace('www.', '');
  const author = metaAuthor || ogSiteName || domain;

  const images: string[] = [];
  if (ogImage) images.push(ogImage);

  return {
    platform: 'article',
    title,
    body,
    author,
    images,
    metadata: {
      description: ogDescription || metaDescription || null,
      siteName: ogSiteName || domain,
      publishedTime: publishedTime || null,
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
      result = await fetchArticle(url);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch URL' }, { status: 500 });
  }
}
