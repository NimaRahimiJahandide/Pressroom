/**
 * GET /api/posts/[postId]
 * ========================
 * Returns a single post's saved data plus the id of its current
 * ContentVersion. Used by the `usePost` hook on the editor page to
 * seed the generation store when a post is opened normally (not via
 * a fresh generation or a version restore).
 *
 * Ownership is folded into the lookup — another user's post reads as 404,
 * not 403, so existence isn't leaked.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export async function GET(
  _request: Request,
  { params }: { params: { postId: string } },
) {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const post = await prisma.blogPost.findFirst({
    where: { id: params.postId, userId: session.userId },
    select: {
      id: true,
      title: true,
      topic: true,
      status: true,
      finalContent: true,
      finalFormat: true,
      wordCount: true,
    },
  });

  if (!post) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  // Fetch the current ContentVersion id (if one exists) so the client
  // can seed `versionId` in the generation store — Save PATCHes that row.
  const currentVersion = await prisma.contentVersion.findFirst({
    where: { postId: params.postId, isCurrent: true },
    select: { id: true },
  });

  return NextResponse.json({
    id: post.id,
    title: post.title,
    topic: post.topic,
    status: post.status,
    finalContent: post.finalContent,
    finalFormat: post.finalFormat,
    wordCount: post.wordCount,
    currentVersionId: currentVersion?.id ?? null,
  });
}
