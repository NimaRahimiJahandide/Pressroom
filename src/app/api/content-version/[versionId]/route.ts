import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { versionId: string } },
) {
  const { versionId } = params;
  const body = await request.json().catch(() => null);

  if (!body?.content || typeof body.content !== 'string') {
    return NextResponse.json({ error: 'MISSING_CONTENT' }, { status: 400 });
  }

  const version = await prisma.contentVersion.findUnique({ where: { id: versionId } });
  if (!version) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  await prisma.contentVersion.update({
    where: { id: versionId },
    data: { content: body.content },
  });

  return NextResponse.json({ success: true });
}
