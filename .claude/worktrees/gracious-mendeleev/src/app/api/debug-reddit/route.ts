import { NextRequest, NextResponse } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';

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

  // Step 1: Direct fetch from Vercel (for comparison — expected to fail on cloud IPs)
  log.push('Step 1: Direct fetch with redirect:follow (Vercel IP)');
  try {
    const directResp = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    result.directFetch = {
      status: directResp.status,
      finalUrl: directResp.url,
      redirected: directResp.redirected,
      hasComments: /\/comments\/[a-z0-9]+/i.test(directResp.url),
    };
    log.push(`Direct: status=${directResp.status}, url=${directResp.url}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    result.directFetch = { error: msg };
    log.push(`Direct failed: ${msg}`);
  }

  // Step 2: Direct fetch with redirect:manual (see raw redirect)
  log.push('Step 2: Direct fetch with redirect:manual (Vercel IP)');
  try {
    const manualResp = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    const location = manualResp.headers.get('location');
    result.manualFetch = {
      status: manualResp.status,
      location,
      hasComments: location ? /\/comments\/[a-z0-9]+/i.test(location) : false,
    };
    log.push(`Manual: status=${manualResp.status}, location=${location}`);
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    result.manualFetch = { error: msg };
    log.push(`Manual failed: ${msg}`);
  }

  // Step 3: Proxied fetch via Apify residential proxy (the actual fix)
  log.push('Step 3: Apify proxy with redirect:manual (residential IP, hop-by-hop)');
  const proxyUrl = `http://auto:${token}@proxy.apify.com:8000`;
  const dispatcher = new ProxyAgent(proxyUrl);
  const hops: Array<{ hop: number; url: string; status: number; location: string | null; hasComments: boolean }> = [];

  let currentUrl = url;
  let resolved = false;

  try {
    for (let hop = 0; hop < 5; hop++) {
      const startMs = Date.now();
      const response = await undiciFetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        dispatcher,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      const elapsedMs = Date.now() - startMs;

      const location = response.headers.get('location');
      const hopData = {
        hop: hop + 1,
        url: currentUrl,
        status: response.status,
        location,
        hasComments: false,
        elapsedMs,
      };

      if (response.status >= 300 && response.status < 400 && location) {
        currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
        hopData.hasComments = /\/comments\/[a-z0-9]+/i.test(currentUrl);
        hops.push(hopData);
        log.push(`Hop ${hop + 1}: ${response.status} → ${currentUrl} (${elapsedMs}ms)`);
        if (hopData.hasComments) {
          resolved = true;
          break;
        }
        continue;
      }

      hops.push(hopData);
      log.push(`Hop ${hop + 1}: ${response.status} (no redirect) (${elapsedMs}ms)`);

      // Check if current URL is canonical
      if (/\/comments\/[a-z0-9]+/i.test(currentUrl)) {
        resolved = true;
        break;
      }

      // Try HTML extraction
      try {
        const html = await response.text();
        const canonical = html.match(/href="(https?:\/\/(?:www\.)?reddit\.com\/r\/[^"]*\/comments\/[a-z0-9]+[^"]*)"/i);
        if (canonical) {
          currentUrl = canonical[1];
          resolved = true;
          log.push(`Extracted canonical from HTML: ${canonical[1]}`);
          break;
        }
        const ogUrl = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["'](https?:\/\/[^"']+)["']/i);
        if (ogUrl && /\/comments\/[a-z0-9]+/i.test(ogUrl[1])) {
          currentUrl = ogUrl[1];
          resolved = true;
          log.push(`Extracted og:url from HTML: ${ogUrl[1]}`);
          break;
        }
        log.push(`No canonical URL found in HTML (${html.length} chars)`);
      } catch {
        log.push(`Failed to read response body`);
      }
      break;
    }
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    log.push(`Proxy fetch failed: ${msg}`);
    result.proxyError = msg;
  }

  result.proxyHops = hops;
  result.proxyResolution = {
    resolved,
    finalUrl: currentUrl,
    hasComments: /\/comments\/[a-z0-9]+/i.test(currentUrl),
  };

  result.log = log;
  return NextResponse.json(result, { status: 200 });
}
