import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';

type Props = {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    // Use anonymous client — no cookies needed for public shared data
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
    const { data: project } = await supabase
      .from('projects')
      .select('name, brief')
      .eq('id', id)
      .eq('share', true)
      .single();

    if (!project) {
      return { title: 'Not Found — Sift' };
    }

    // Get capture count and first image
    const { data: captures } = await supabase
      .from('captures')
      .select('images, platform, metadata')
      .eq('project_id', id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });

    const captureCount = captures?.length || 0;
    const description = project.brief || `A curated collection of ${captureCount} capture${captureCount !== 1 ? 's' : ''} from across the web.`;

    // Find the first capture with a usable image (og:image for articles)
    let ogImage: string | undefined;
    if (captures) {
      for (const c of captures) {
        if (c.images && c.images.length > 0) {
          if (c.platform === 'article') {
            const hasOg = (c.metadata as Record<string, unknown>)?.hasOgImage;
            if (hasOg) { ogImage = c.images[0]; break; }
          } else if (c.platform !== 'github') {
            ogImage = c.images[0];
            break;
          }
        }
      }
    }

    const metadata: Metadata = {
      title: `${project.name} — Sift`,
      description,
      openGraph: {
        title: project.name,
        description,
        type: 'website',
        siteName: 'Sift',
      },
      twitter: {
        card: ogImage ? 'summary_large_image' : 'summary',
        title: project.name,
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

export default function SharedProjectLayout({ children }: Props) {
  return <>{children}</>;
}
