import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ALLOWED_DOMAINS = [
  'i.redd.it',
  'preview.redd.it',
  'external-preview.redd.it',
  'b.thumbs.redditmedia.com',
  'pbs.twimg.com',
  'abs.twimg.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'repository-images.githubusercontent.com',
  'opengraph.githubassets.com',
  'avatars.githubusercontent.com',
];

function isAllowedDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!isAllowedDomain(url)) {
      // Allow any HTTPS image URL as fallback (articles, etc.)
      if (!url.startsWith('https://')) {
        return NextResponse.json({ error: 'Only HTTPS URLs allowed' }, { status: 400 });
      }
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Upstream returned ${response.status}` }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch image' },
      { status: 500 }
    );
  }
}
