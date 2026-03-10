#!/bin/bash
# Fix: TypeScript build errors
# Run from ~/bild-curation-app

echo "🔧 Fixing TypeScript build errors..."

# Restore the project page from patch-v4 but with fixed types
cd ~/bild-curation-app

# Just fix the problematic lines in place
python3 -c "
content = open('src/app/project/[id]/page.tsx', 'r').read()

# Fix GitHub metadata emojis and type errors
content = content.replace(
    '{viewing.metadata.stars != null && <span>⭐ {String(viewing.metadata.stars)}</span>}',
    '{viewing.metadata.stars != null ? <span>Stars: {String(viewing.metadata.stars)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.stars != null && <span>★ {String(viewing.metadata.stars)}</span>}',
    '{viewing.metadata.stars != null ? <span>Stars: {String(viewing.metadata.stars)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.forks != null && <span>🍴 {String(viewing.metadata.forks)}</span>}',
    '{viewing.metadata.forks != null ? <span>Forks: {String(viewing.metadata.forks)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.forks != null && <span>Forks: {String(viewing.metadata.forks)}</span>}',
    '{viewing.metadata.forks != null ? <span>Forks: {String(viewing.metadata.forks)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.forks != null && <span> 🍴 {String(viewing.metadata.forks)}</span>}',
    '{viewing.metadata.forks != null ? <span>Forks: {String(viewing.metadata.forks)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.language && <span>{String(viewing.metadata.language)}</span>}',
    '{viewing.metadata.language ? <span>{String(viewing.metadata.language)}</span> : null}'
)

# Fix Twitter metadata emojis and type errors
content = content.replace(
    '{viewing.metadata.likes != null && <span>♥ {String(viewing.metadata.likes)}</span>}',
    '{viewing.metadata.likes != null ? <span>Likes: {String(viewing.metadata.likes)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.retweets != null && <span>↻ {String(viewing.metadata.retweets)}</span>}',
    '{viewing.metadata.retweets != null ? <span>RTs: {String(viewing.metadata.retweets)}</span> : null}'
)
content = content.replace(
    '{viewing.metadata.replies != null && <span>💬 {String(viewing.metadata.replies)}</span>}',
    '{viewing.metadata.replies != null ? <span>Replies: {String(viewing.metadata.replies)}</span> : null}'
)

open('src/app/project/[id]/page.tsx', 'w').write(content)
print('Done!')
"

echo "✅ Fixed! Now run: npm run build"
