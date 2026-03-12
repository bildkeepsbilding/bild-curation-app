import jsPDF from 'jspdf';
import { type Project, type Capture, type Platform, formatEngagement, PLATFORM_DISPLAY, getUniqueContentTag } from './db';

// ── Layout constants ──

const PAGE_W = 210; // A4 width mm
const PAGE_H = 297; // A4 height mm
const MARGIN = 20;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM_MARGIN = 25;
const MAX_Y = PAGE_H - BOTTOM_MARGIN;

// Platform badge colors
const PLATFORM_COLORS: Record<string, [number, number, number]> = {
  reddit: [255, 69, 0],
  twitter: [29, 161, 242],
  github: [110, 84, 148],
  article: [16, 185, 129],
  other: [107, 114, 128],
};

// ── Image fetching ──

interface ImageData {
  data: string; // base64
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
}

async function fetchImageAsBase64(url: string): Promise<ImageData | null> {
  try {
    // Try direct fetch first
    let response: Response;
    try {
      response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`${response.status}`);
    } catch {
      // Fall back to proxy
      response = await fetch('/api/image-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (!response.ok) return null;
    }

    const contentType = response.headers.get('content-type') || '';
    const format: 'JPEG' | 'PNG' = contentType.includes('png') ? 'PNG' : 'JPEG';

    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    // Get dimensions
    const dims = await getImageDimensions(base64);
    return { data: base64, format, ...dims };
  } catch {
    return null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 300 }); // fallback
    img.src = dataUrl;
  });
}

async function prefetchImages(
  captures: Capture[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, ImageData>> {
  const allUrls = new Set<string>();
  for (const c of captures) {
    for (const img of c.images) allUrls.add(img);
    // Also extract [image:URL] from body
    const inlineRegex = /\[image:(https?:\/\/[^\]]+)\]/g;
    let m;
    while ((m = inlineRegex.exec(c.body)) !== null) {
      allUrls.add(m[1]);
    }
  }

  const urls = Array.from(allUrls);
  const map = new Map<string, ImageData>();
  let done = 0;

  // Fetch with concurrency limit of 4
  const limit = 4;
  for (let i = 0; i < urls.length; i += limit) {
    const batch = urls.slice(i, i + limit);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const data = await fetchImageAsBase64(url);
        if (data) map.set(url, data);
        done++;
        onProgress?.(done, urls.length);
      })
    );
    // Continue regardless of failures
    void results;
  }

  return map;
}

// ── PDF construction helpers ──

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > MAX_Y) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawSeparator(doc: jsPDF, y: number): number {
  y = ensureSpace(doc, y, 8);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 8;
}

function drawText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  opts: { fontSize?: number; fontStyle?: string; color?: [number, number, number]; maxWidth?: number; lineHeight?: number } = {}
): number {
  const { fontSize = 10, fontStyle = 'normal', color = [51, 51, 51], maxWidth = CONTENT_W, lineHeight = 1.4 } = opts;

  doc.setFont('helvetica', fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);

  const lines = doc.splitTextToSize(text, maxWidth);
  const lineHeightMm = (fontSize * lineHeight * 0.3528); // pt to mm with line height

  for (const line of lines) {
    y = ensureSpace(doc, y, lineHeightMm);
    doc.text(line, x, y);
    y += lineHeightMm;
  }

  return y;
}

function drawBadge(
  doc: jsPDF,
  label: string,
  x: number,
  y: number,
  color: [number, number, number]
): { endX: number; endY: number } {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const textWidth = doc.getTextWidth(label);
  const padX = 3;
  const padY = 1.5;
  const badgeW = textWidth + padX * 2;
  const badgeH = 5;

  doc.setFillColor(...color);
  doc.roundedRect(x, y - badgeH + padY, badgeW, badgeH, 1.5, 1.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.text(label, x + padX, y - 0.5);

  return { endX: x + badgeW + 3, endY: y };
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function addImage(
  doc: jsPDF,
  img: ImageData,
  y: number,
): number {
  // Scale to fit content width, maintain aspect ratio, cap height
  const maxImgW = CONTENT_W;
  const maxImgH = 120;

  let imgW = maxImgW;
  let imgH = (img.height / img.width) * imgW;

  if (imgH > maxImgH) {
    imgH = maxImgH;
    imgW = (img.width / img.height) * imgH;
  }

  y = ensureSpace(doc, y, imgH + 4);

  // Center image
  const imgX = MARGIN + (CONTENT_W - imgW) / 2;
  try {
    doc.addImage(img.data, img.format, imgX, y, imgW, imgH);
  } catch {
    // If image fails to embed, show placeholder
    return drawText(doc, '[Image could not be embedded]', MARGIN, y + 4, { fontSize: 9, color: [150, 150, 150], fontStyle: 'italic' });
  }

  return y + imgH + 4;
}

// ── Shared capture renderer ──

function renderCaptureSection(
  doc: jsPDF,
  c: Capture,
  y: number,
  imageMap: Map<string, ImageData>,
): number {
  // Add page break if not much space left for a new capture header
  y = ensureSpace(doc, y, 40);

  // Platform badge + content tag
  const platformLabel = PLATFORM_DISPLAY[c.platform] || c.platform;
  const badgeColor = PLATFORM_COLORS[c.platform] || PLATFORM_COLORS.other;
  const badge = drawBadge(doc, platformLabel, MARGIN, y, badgeColor);
  const contentTag = getUniqueContentTag(c);
  let lastBadge = badge;
  if (contentTag) {
    lastBadge = drawBadge(doc, contentTag, badge.endX, y, [100, 100, 110]);
  }
  y = lastBadge.endY + 4;

  // Title
  y = drawText(doc, c.title, MARGIN, y, { fontSize: 16, fontStyle: 'bold', color: [17, 17, 17] });
  y += 1;

  // Author · Date · Engagement
  const metaParts = [c.author, formatDate(c.createdAt)];
  const engagement = formatEngagement(c);
  if (engagement) metaParts.push(engagement);
  y = drawText(doc, metaParts.join('  ·  '), MARGIN, y, { fontSize: 9, color: [120, 120, 120] });
  y += 3;

  // Context for Claude
  if (c.note) {
    y = ensureSpace(doc, y, 12);
    doc.setFillColor(29, 161, 242);
    doc.rect(MARGIN, y - 1, 1.5, 0);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    const noteLines = doc.splitTextToSize(c.note, CONTENT_W - 8);
    const noteHeight = noteLines.length * (9 * 1.4 * 0.3528) + 2;

    y = ensureSpace(doc, y, noteHeight + 4);
    doc.setFillColor(240, 247, 255);
    doc.rect(MARGIN, y - 2, CONTENT_W, noteHeight + 4, 'F');
    doc.setFillColor(29, 161, 242);
    doc.rect(MARGIN, y - 2, 1.5, noteHeight + 4, 'F');

    y = drawText(doc, 'Context for Claude:', MARGIN + 5, y + 1, { fontSize: 8, fontStyle: 'bold', color: [29, 161, 242] });
    y = drawText(doc, c.note, MARGIN + 5, y, { fontSize: 9, fontStyle: 'italic', color: [60, 60, 60], maxWidth: CONTENT_W - 10 });
    y += 3;
  }

  // Body text with inline images
  const bodyParts = c.body.split(/\[image:(https?:\/\/[^\]]+)\]/);
  const usedImageUrls = new Set<string>();

  for (let i = 0; i < bodyParts.length; i++) {
    if (i % 2 === 0) {
      const text = bodyParts[i].trim();
      if (text) {
        y = drawText(doc, text, MARGIN, y, { fontSize: 10, color: [51, 51, 51], lineHeight: 1.5 });
        y += 2;
      }
    } else {
      const imgUrl = bodyParts[i];
      usedImageUrls.add(imgUrl);
      const imgData = imageMap.get(imgUrl);
      if (imgData) {
        y = addImage(doc, imgData, y);
      }
    }
  }

  // Remaining images (not already inline)
  const remainingImages = c.images.filter(img => !usedImageUrls.has(img));
  for (const imgUrl of remainingImages) {
    const imgData = imageMap.get(imgUrl);
    if (imgData) {
      y = addImage(doc, imgData, y);
    }
  }

  // Source URL
  y += 2;
  y = ensureSpace(doc, y, 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(29, 161, 242);
  const urlText = c.url.length > 80 ? c.url.slice(0, 77) + '...' : c.url;
  doc.textWithLink(urlText, MARGIN, y, { url: c.url });
  y += 4;

  return y;
}

// ── Main export function ──

export async function exportProjectAsPdf(
  project: Project,
  captures: Capture[],
  filterPlatform?: Platform | 'all',
  onProgress?: (stage: string, detail?: string) => void,
): Promise<Blob> {
  // Filter captures
  let filtered = captures;
  if (filterPlatform && filterPlatform !== 'all') {
    filtered = captures.filter(c => c.platform === filterPlatform);
  }

  // Pre-fetch all images
  onProgress?.('Fetching images...');
  const imageMap = await prefetchImages(filtered, (done, total) => {
    onProgress?.('Fetching images...', `${done}/${total}`);
  });

  onProgress?.('Generating PDF...');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // ── Header ──

  // Project name
  const filterLabel = filterPlatform && filterPlatform !== 'all'
    ? ` [${PLATFORM_DISPLAY[filterPlatform] || filterPlatform}]`
    : '';
  y = drawText(doc, project.name + filterLabel, MARGIN, y, { fontSize: 24, fontStyle: 'bold', color: [17, 17, 17] });
  y += 2;

  // Project brief
  if (project.brief) {
    y = drawText(doc, project.brief, MARGIN, y, { fontSize: 11, color: [100, 100, 100] });
    y += 2;
  }

  // Capture count
  y = drawText(doc, `${filtered.length} capture${filtered.length !== 1 ? 's' : ''}`, MARGIN, y, { fontSize: 9, color: [150, 150, 150] });
  y = drawSeparator(doc, y);

  // ── Per-capture sections ──

  for (let idx = 0; idx < filtered.length; idx++) {
    const c = filtered[idx];
    onProgress?.('Generating PDF...', `Capture ${idx + 1}/${filtered.length}`);
    y = renderCaptureSection(doc, c, y, imageMap);

    // Separator between captures
    if (idx < filtered.length - 1) {
      y = drawSeparator(doc, y + 2);
    }
  }

  // ── Collection Summary ──

  if (filtered.length > 0) {
    y = drawSeparator(doc, y + 4);
    y = ensureSpace(doc, y, 30);

    y = drawText(doc, 'Collection Summary', MARGIN, y, { fontSize: 14, fontStyle: 'bold', color: [17, 17, 17] });
    y += 2;

    const platforms = [...new Set(filtered.map(c => PLATFORM_DISPLAY[c.platform] || c.platform))];
    const dates = filtered.map(c => c.createdAt).sort();
    const oldest = formatDate(dates[0]);
    const newest = formatDate(dates[dates.length - 1]);
    const dateRange = oldest === newest ? oldest : `${oldest} – ${newest}`;
    const withContext = filtered.filter(c => c.note).length;

    const summaryLines = [
      `Total captures: ${filtered.length}`,
      `Platforms: ${platforms.join(', ')}`,
      `Date range: ${dateRange}`,
      `Captures with context: ${withContext}/${filtered.length}`,
      `Exported: ${formatDate(Date.now())}`,
    ];

    for (const line of summaryLines) {
      y = drawText(doc, `•  ${line}`, MARGIN + 2, y, { fontSize: 10, color: [80, 80, 80] });
    }
  }

  return doc.output('blob');
}

// ── Single-capture PDF export ──

export async function exportCapturePdf(
  project: Project,
  capture: Capture,
  onProgress?: (stage: string) => void,
): Promise<Blob> {
  onProgress?.('Fetching images...');
  const imageMap = await prefetchImages([capture]);

  onProgress?.('Generating PDF...');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = MARGIN;

  // Header — project name
  y = drawText(doc, project.name, MARGIN, y, { fontSize: 20, fontStyle: 'bold', color: [17, 17, 17] });
  y += 1;
  if (project.brief) {
    y = drawText(doc, project.brief, MARGIN, y, { fontSize: 10, color: [120, 120, 120] });
  }
  y = drawSeparator(doc, y + 2);

  // Render the single capture
  y = renderCaptureSection(doc, capture, y, imageMap);

  return doc.output('blob');
}
