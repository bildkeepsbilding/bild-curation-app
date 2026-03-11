#!/bin/bash
# Fix Twitter - correct Apify input format
# Run from ~/bild-curation-app

echo "🔧 Fixing Twitter with correct Apify format..."

python3 << 'PYEOF'
content = open('src/app/api/fetch-url/route.ts', 'r').read()

# Replace the entire fetchTwitterApify function
old = '''async function fetchTwitterApify(url: string, token: string) {
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
  });'''

new = '''async function fetchTwitterApify(url: string, token: string) {
  const tweetUrl = url.replace('x.com', 'twitter.com');

  // Try the web.harvester Twitter scraper (supports direct tweet URLs)
  const actors = [
    {
      id: 'web.harvester~twitter-scraper',
      input: { tweetUrls: [tweetUrl], maxTweets: 1 },
    },
    {
      id: 'apidojo~twitter-scraper-lite',
      input: { urls: [tweetUrl], maxItems: 1 },
    },
  ];

  let response: Response | null = null;
  let lastError = '';

  for (const actor of actors) {
    try {
      const apiUrl = `https://api.apify.com/v2/acts/${actor.id}/run-sync-get-dataset-items?token=${token}&timeout=60`;
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(actor.input),
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          console.log('Apify success with actor:', actor.id);
          // Process the first result
          const tweet = data[0];
          const images: string[] = [];

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
          if (tweet.photo_url && !images.includes(tweet.photo_url)) images.push(tweet.photo_url);

          const text = tweet.full_text || tweet.text || tweet.tweet_text || tweet.tweetText || '';
          const author = tweet.author?.userName || tweet.user?.screen_name
            || tweet.screen_name || tweet.username || tweet.userName || 'unknown';

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
        }
      }
      lastError = `Actor ${actor.id}: status ${response?.status}`;
    } catch (e) {
      lastError = `Actor ${actor.id}: ${e instanceof Error ? e.message : 'unknown error'}`;
      console.error(lastError);
    }
  }

  throw new Error('All Apify actors failed: ' + lastError);
}

// Keep the old signature for compatibility
async function _unusedOldFetch(url: string, token: string) {
  const tweetUrl = url.replace('x.com', 'twitter.com');
  const actorId = 'apidojo~twitter-scraper-lite';
  const apiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=60`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [tweetUrl], maxItems: 1 }),
  });'''

content = content.replace(old, new)

open('src/app/api/fetch-url/route.ts', 'w').write(content)
print('Done!')
PYEOF

echo "✅ Twitter fixed with correct Apify input format"
echo ""
echo "Test with: npm run dev"
echo "Then paste: https://x.com/oliverhenry/status/2027502249333953014"
