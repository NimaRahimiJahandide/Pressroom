import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from '@/lib/auth';

const DEFAULT_MODEL: Record<string, string> = {
  ANTHROPIC: 'claude-sonnet-5',
  OPENAI: 'nvidia/nemotron-3-super-120b-a12b:free',
};

export async function POST(request: NextRequest) {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.title || !body?.topic || typeof body.title !== 'string' || typeof body.topic !== 'string') {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const post = await prisma.blogPost.create({
    data: {
      userId: session.userId,
      title: body.title.trim(),
      topic: body.topic.trim(),
      tone: body.tone ?? 'PROFESSIONAL',
      length: body.length ?? 'MEDIUM',
      provider: body.provider ?? 'ANTHROPIC',
      model: DEFAULT_MODEL[body.provider ?? 'ANTHROPIC'],
      status: 'DRAFT',
    },
    select: { id: true, title: true, topic: true, status: true, updatedAt: true, userId: true },
  });

  return NextResponse.json(post, { status: 201 });
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const posts = await prisma.blogPost.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, topic: true, status: true, updatedAt: true },
  });

  return NextResponse.json(posts);
}