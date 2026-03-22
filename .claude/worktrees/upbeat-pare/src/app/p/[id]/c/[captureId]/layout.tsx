import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';

type Props = {
  params: Promise<{ id: string; captureId: string }>;
  children: React.ReactNode;
};

function decodeEntities(text: string): string {
  if (!text) return text;
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&apos;/g, "'");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id, captureId } = await params;

  try {
    const supabase = await createClient();

    // Verify project is shared
    const { data: project } = await supabase
      .from('projects')
      .select('name')
      .eq('id', id)
      .eq('share', true)
      .single();

    if (!project) {
      return { title: 'Not Found — Sift' };
    }

    const { data: capture } = await supabase
      .from('captures')
      .select('title, body, images, platform, metadata')
      .eq('id', captureId)
      .eq('project_id', id)
      .single();

    if (!capture) {
      return { title: 'Not Found — Sift' };
    }

    const title = decodeEntities(capture.title);
    const bodyClean = decodeEntities(
      (capture.body || '')
        .replace(/\[image:[^\]]+\]/g, '')
        .replace(/[#*_~`>\[\]()]/g, '')
        .replace(/\n+/g, ' ')
        .trim()
    );
    const description = bodyClean.length > 150 ? bodyClean.slice(0, 147) + '...' : bodyClean;

    // Determine OG image
    let ogImage: string | undefined;
    if (capture.images && capture.images.length > 0) {
      if (capture.platform === 'article') {
        const hasOg = (capture.metadata as Record<string, unknown>)?.hasOgImage;
        if (hasOg) ogImage = capture.images[0];
      } else if (capture.platform !== 'github') {
        ogImage = capture.images[0];
      }
    }

    const metadata: Metadata = {
      title: `${title} — ${project.name} — Sift`,
      description,
      openGraph: {
        title,
        description,
        type: 'article',
        siteName: 'Sift',
      },
      twitter: {
        card: ogImage ? 'summary_large_image' : 'summary',
        title,
        description,
      },
    };

    if (ogImage) {
      metadata.openGraph!.images = [{ url: ogImage }];
      metadata.twitter!.images = [ogImage];
    }

    return metadata;
  } catch {
    return { title: 'Sift' };
  }
}

export default function SharedCaptureLayout({ children }: Props) {
  return <>{children}</>;
}
