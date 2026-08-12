import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { versionId: string } },
) {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const { versionId } = params;
  const body = await request.json().catch(() => null);

  if (!body?.content || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'MISSING_CONTENT' }, { status: 400 });
  }

  // Ownership is part of the lookup: someone else's version is simply "not found".
  const version = await prisma.contentVersion.findFirst({
    where: { id: versionId, post: { userId: session.userId } },
    select: { id: true },
  });
  if (!version) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.contentVersion.update({
    where: { id: versionId },
    data: { content: body.content },
  });

  return NextResponse.json({ success: true });
}
