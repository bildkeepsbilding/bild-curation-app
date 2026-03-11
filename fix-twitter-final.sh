#!/bin/bash
# Fix Twitter with FxTwitter free API
# Run from ~/bild-curation-app

echo "🔧 Replacing Twitter extraction with FxTwitter API..."

python3 << 'PYEOF'
content = open('src/app/api/fetch-url/route.ts', 'r').read()

# Replace the entire Twitter section (everything between Reddit and GitHub sections)
# Find from "// ── Twitter via Apify ──" to just before "// ── GitHub ──"

import re

# Remove everything from Twitter section start to GitHub section start
twitter_start = content.find('// ── Twitter via Apify ──')
if twitter_start == -1:
    twitter_start = content.find('// ── Twitter')

github_start = content.find('// ── GitHub ──')

if twitter_start != -1 and github_start != -1:
    new_twitter = """// ── Twitter via FxTwitter API (free, no auth) ──

async function fetchTwitter(url: string) {
  // Extract screen_name and tweet ID from URL
  const tweetMatch = url.match(/(?:twitter\\.com|x\\.com)\\/([^/]+)\\/status\\/(\\d+)/);
  if (!tweetMatch) throw new Error('Invalid tweet URL. Use format: https://x.com/user/status/123...');

  const screenName = tweetMatch[1];
  const tweetId = tweetMatch[2];

  // Use FxTwitter API - completely free, no auth needed
  const apiUrl = `https://api.fxtwitter.com/${screenName}/status/${tweetId}`;

  const response = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'BildCurationApp/1.0',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch tweet (status ' + response.status + ')');
  }

  const data = await response.json();

  if (!data.tweet) {
    throw new Error('Tweet not found or is private.');
  }

  const tweet = data.tweet;
  const images: string[] = [];

  // Extract media
  if (tweet.media?.photos) {
    for (const photo of tweet.media.photos) {
      if (photo.url) images.push(photo.url);
    }
  }
  if (tweet.media?.all) {
    for (const item of tweet.media.all) {
      if (item.url && !images.includes(item.url)) images.push(item.url);
      if (item.thumbnail_url && !images.includes(item.thumbnail_url)) images.push(item.thumbnail_url);
    }
  }

  // Build body with full text
  let body = tweet.text || '';

  // If tweet has a quote tweet, include it
  if (tweet.quote) {
    body += '\\n\\n--- Quoted tweet from @' + (tweet.quote.author?.screen_name || 'unknown') + ':\\n';
    body += tweet.quote.text || '';
  }

  return {
    platform: 'twitter' as const,
    title: (tweet.text || '').slice(0, 100) || 'Tweet',
    body,
    author: '@' + (tweet.author?.screen_name || screenName),
    images,
    metadata: {
      likes: tweet.likes || 0,
      retweets: tweet.retweets || 0,
      replies: tweet.replies || 0,
      views: tweet.views || 0,
      date: tweet.created_at || null,
      authorName: tweet.author?.name || null,
      authorAvatar: tweet.author?.avatar_url || null,
      source: 'fxtwitter',
    },
  };
}

"""
    content = content[:twitter_start] + new_twitter + content[github_start:]
else:
    print('WARNING: Could not find Twitter section markers')

open('src/app/api/fetch-url/route.ts', 'w').write(content)
print('Done!')
PYEOF

# Also update the viewer to show views count for Twitter
python3 << 'PYEOF2'
content = open('src/app/project/[id]/page.tsx', 'r').read()

# Update Twitter metadata display to include views
old_twitter_meta = """{viewing.metadata.likes != null ? <span>Likes: {String(viewing.metadata.likes)}</span> : null}
                {viewing.metadata.retweets != null ? <span>RTs: {String(viewing.metadata.retweets)}</span> : null}
                {viewing.metadata.replies != null ? <span>Replies: {String(viewing.metadata.replies)}</span> : null}"""

new_twitter_meta = """{viewing.metadata.likes != null ? <span>Likes: {String(viewing.metadata.likes)}</span> : null}
                {viewing.metadata.retweets != null ? <span>RTs: {String(viewing.metadata.retweets)}</span> : null}
                {viewing.metadata.replies != null ? <span>Replies: {String(viewing.metadata.replies)}</span> : null}
                {viewing.metadata.views != null ? <span>Views: {String(viewing.metadata.views)}</span> : null}"""

content = content.replace(old_twitter_meta, new_twitter_meta)

open('src/app/project/[id]/page.tsx', 'w').write(content)
print('UI updated!')
PYEOF2

echo "✅ Twitter now uses FxTwitter API"
echo ""
echo "Features:"
echo "  ✅ Full tweet text (no truncation)"
echo "  ✅ All images"
echo "  ✅ Likes, RTs, replies, views"
echo "  ✅ Quoted tweets"
echo "  ✅ Completely FREE - no API key needed"
echo "  ✅ No Apify credits used"
echo ""
echo "Restart server: npm run dev"
echo "Test with: https://x.com/oliverhenry/status/2027502249333953014"
