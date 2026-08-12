/**
 * GET /api/posts/[postId]/versions
 * =================================
 * Version history for a post, newest first. Deliberately does not return
 * `content` — the list only needs a word count and a short preview.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

/** Enough markdown/HTML stripping for a one-line preview, no parser needed. */
function toPreview(content: string): string {
  const plain = content
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#>*_`~\[\]()!-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > 140 ? `${plain.slice(0, 140)}…` : plain;
}

export async function GET(
  _request: Request,
  { params }: { params: { postId: string } },
) {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // Ownership folded into the lookup: another user's post reads as 404.
  const post = await prisma.blogPost.findFirst({
    where: { id: params.postId, userId: session.userId },
    select: { id: true },
  });
  if (!post) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const versions = await prisma.contentVersion.findMany({
    where: { postId: params.postId },
    orderBy: { versionNumber: 'desc' },
    select: { id: true, versionNumber: true, isCurrent: true, createdAt: true, content: true },
  });

  return NextResponse.json(
    versions.map(({ content, ...v }) => ({
      ...v,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      preview: toPreview(content),
    })),
  );
}
