import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  const token = process.env.APIFY_TOKEN;
  const log: string[] = [];
  const result: Record<string, unknown> = {
    input: url,
    hasApifyToken: !!token,
    tokenPrefix: token ? token.slice(0, 6) + '...' : null,
  };

  if (!token) {
    return NextResponse.json({ ...result, error: 'APIFY_TOKEN not configured' }, { status: 500 });
  }

  // Step 1: Try a simple server-side redirect follow first (for comparison)
  log.push('Step 1: Testing direct fetch with redirect:follow');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const directResp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);
    result.directFetch = {
      status: directResp.status,
      finalUrl: directResp.url,
      redirected: directResp.redirected,
      hasComments: /\/comments\/[a-z0-9]+/i.test(directResp.url),
    };
    log.push(`Direct fetch: status=${directResp.status}, finalUrl=${directResp.url}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    result.directFetch = { error: msg };
    log.push(`Direct fetch failed: ${msg}`);
  }

  // Step 2: Try redirect:manual to see raw redirects
  log.push('Step 2: Testing fetch with redirect:manual');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const manualResp = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);
    const location = manualResp.headers.get('location');
    result.manualFetch = {
      status: manualResp.status,
      location,
      hasComments: location ? /\/comments\/[a-z0-9]+/i.test(location) : false,
    };
    log.push(`Manual fetch: status=${manualResp.status}, location=${location}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    result.manualFetch = { error: msg };
    log.push(`Manual fetch failed: ${msg}`);
  }

  // Step 3: Call Apify web-scraper (lightweight — just gets final URL after JS redirect)
  log.push('Step 3: Calling Apify web-scraper for URL resolution');
  const actorId = 'apify~web-scraper';
  const apiUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=15`;

  const apifyPayload = {
    startUrls: [{ url }],
    pageFunction: `async function pageFunction({ request }) { return { resolvedUrl: request.loadedUrl || request.url }; }`,
    maxRequestsPerCrawl: 1,
    proxyConfiguration: { useApifyProxy: true },
    maxConcurrency: 1,
  };
  result.apifyRequest = { actorId, apiUrl: apiUrl.replace(token, 'REDACTED'), payload: apifyPayload };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const startTime = Date.now();

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(apifyPayload),
    });
    clearTimeout(timeout);

    const elapsed = Date.now() - startTime;
    log.push(`Apify responded in ${elapsed}ms with status ${response.status}`);

    result.apifyResponse = {
      status: response.status,
      statusText: response.statusText,
      elapsedMs: elapsed,
      contentType: response.headers.get('content-type'),
    };

    if (!response.ok) {
      const errorBody = await response.text();
      result.apifyResponse = { ...result.apifyResponse as Record<string, unknown>, errorBody: errorBody.slice(0, 2000) };
      log.push(`Apify error body: ${errorBody.slice(0, 500)}`);
    } else {
      const data = await response.json();
      result.apifyData = data;
      log.push(`Apify returned ${Array.isArray(data) ? data.length : 0} items`);

      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const resolvedUrl = item.resolvedUrl || item.url || item.loadedUrl || '';
        result.resolution = {
          resolvedUrl,
          itemUrl: item.url,
          loadedUrl: item.loadedUrl,
          pageResolvedUrl: item.resolvedUrl,
          hasComments: /\/comments\/[a-z0-9]+/i.test(resolvedUrl),
          wouldResolve: /\/comments\/[a-z0-9]+/i.test(resolvedUrl),
        };
        log.push(`Resolution: resolvedUrl=${resolvedUrl}`);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    result.apifyResponse = { error: msg };
    log.push(`Apify call failed: ${msg}`);
  }

  result.log = log;
  return NextResponse.json(result, { status: 200 });
}
