#!/bin/bash
# Fix: Twitter extraction
# Run from ~/bild-curation-app

echo "🔧 Fixing Twitter extraction..."

# Replace just the Twitter functions in the API route
python3 << 'PYEOF'
content = open('src/app/api/fetch-url/route.ts', 'r').read()

# Find and replace the entire Twitter section
old_twitter = '''// ── Twitter via Apify ──

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
}'''

new_twitter = """// ── Twitter via Apify ──

async function fetchTwitter(url: string) {
  const token = process.env.APIFY_TOKEN;

  // Try Apify first if token exists
  if (token) {
    try {
      const result = await fetchTwitterApify(url, token);
      if (result && result.body && result.body.length > 0) return result;
    } catch (e) {
      console.error('Apify Twitter failed, falling back to oEmbed:', e);
    }
  }

  // Fallback to oEmbed
  return fetchTwitterOEmbed(url);
}

async function fetchTwitterApify(url: string, token: string) {
  // Use Twitter Scraper Unlimited for single tweets
  const actorId = 'apidojo/twitter-scraper-lite';
  const tweetUrl = url.replace('x.com', 'twitter.com');

  const apiUrl = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${token}&timeout=30`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [tweetUrl],
      maxItems: 1,
      includeUserInfo: true,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('Apify response:', response.status, errText);
    throw new Error('Apify request failed');
  }

  const data = await response.json();
  if (!data || data.length === 0) throw new Error('No data returned');

  const tweet = data[0];
  const images: string[] = [];

  // Extract media from various possible fields
  const mediaFields = [
    tweet.media, tweet.photos, tweet.images,
    tweet.extendedEntities?.media, tweet.entities?.media
  ];

  for (const field of mediaFields) {
    if (!Array.isArray(field)) continue;
    for (const m of field) {
      const imgUrl = m.media_url_https || m.url || m.media_url;
      if (imgUrl && !images.includes(imgUrl)) images.push(imgUrl);
    }
  }

  // Also check for direct image URL in tweet
  if (tweet.photo_url && !images.includes(tweet.photo_url)) {
    images.push(tweet.photo_url);
  }

  const text = tweet.full_text || tweet.text || tweet.tweet_text || '';
  const author = tweet.author?.userName || tweet.user?.screen_name
    || tweet.screen_name || tweet.username || 'unknown';

  return {
    platform: 'twitter' as const,
    title: text.slice(0, 100) || 'Tweet',
    body: text,
    author: `@${author}`,
    images,
    metadata: {
      likes: tweet.likeCount || tweet.favorite_count || tweet.likes || 0,
      retweets: tweet.retweetCount || tweet.retweet_count || tweet.retweets || 0,
      replies: tweet.replyCount || tweet.reply_count || tweet.replies || 0,
      date: tweet.createdAt || tweet.created_at || tweet.date || null,
    },
  };
}"""

content = content.replace(old_twitter, new_twitter)

# Also fix oEmbed to be more robust
old_oembed = '''async function fetchTwitterOEmbed(url: string) {
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
}'''

new_oembed = """async function fetchTwitterOEmbed(url: string) {
  // Normalize URL for oEmbed
  const normalizedUrl = url.replace('x.com', 'twitter.com');
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;

  const response = await fetch(oembedUrl);
  if (!response.ok) throw new Error('Could not fetch tweet. Check the URL and try again.');

  const data = await response.json();

  // Extract clean text from HTML
  let cleanText = data.html || '';

  // Remove blockquote wrapper and paragraph tags but keep the text
  cleanText = cleanText
    .replace(/<blockquote[^>]*>/gi, '')
    .replace(/<\\/blockquote>/gi, '')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\\/p>/gi, '\\n')
    .replace(/<a[^>]*>(.*?)<\\/a>/gi, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, \"'\")
    .replace(/&mdash;/g, '—')
    .replace(/\\n{3,}/g, '\\n\\n')
    .trim();

  if (!cleanText) throw new Error('Tweet content could not be extracted.');

  return {
    platform: 'twitter' as const,
    title: cleanText.split('\\n')[0].slice(0, 100) || 'Tweet',
    body: cleanText,
    author: `@${data.author_name || 'unknown'}`,
    images: [],
    metadata: {
      authorUrl: data.author_url || null,
      likes: 0,
      retweets: 0,
      replies: 0,
      source: 'oembed',
    },
  };
}"""

content = content.replace(old_oembed, new_oembed)

open('src/app/api/fetch-url/route.ts', 'w').write(content)
print('Done!')
PYEOF

echo "✅ Twitter extraction fixed"
echo ""
echo "Now test with: npm run dev"
echo "Then paste a tweet URL like: https://x.com/elonmusk/status/..."
