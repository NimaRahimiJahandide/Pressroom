/**
 * POST /api/posts/[postId]/versions/[versionId]/restore
 * =====================================================
 * Makes an older ContentVersion current again and syncs the post's
 * finalContent/wordCount to match it. Blocked mid-generation.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export async function POST(
  _request: Request,
  { params }: { params: { postId: string; versionId: string } },
) {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { postId, versionId } = params;

  const post = await prisma.blogPost.findFirst({
    where: { id: postId, userId: session.userId },
    select: { id: true, status: true },
  });
  if (!post) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  if (post.status === 'GENERATING') {
    return NextResponse.json({ error: 'GENERATION_IN_PROGRESS' }, { status: 409 });
  }

  // postId in the where clause covers "version exists but belongs elsewhere".
  const version = await prisma.contentVersion.findFirst({
    where: { id: versionId, postId },
    select: { id: true, versionNumber: true, content: true, format: true },
  });
  if (!version) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.contentVersion.updateMany({
      where: { postId, isCurrent: true },
      data: { isCurrent: false },
    }),
    prisma.contentVersion.update({
      where: { id: versionId },
      data: { isCurrent: true },
    }),
    prisma.blogPost.update({
      where: { id: postId },
      data: {
        status: 'COMPLETED',
        finalContent: version.content,
        finalFormat: version.format,
        wordCount: version.content.split(/\s+/).filter(Boolean).length,
      },
    }),
  ]);

  // content comes back so the editor can swap without a second round-trip
  // (the list endpoint intentionally omits it).
  return NextResponse.json({
    id: version.id,
    versionNumber: version.versionNumber,
    content: version.content,
  });
}
