/**
 * POST /api/generate
 * ==================
 * The main generation endpoint.
 * Receives { postId }, validates ownership and status,
 * then returns an SSE ReadableStream of tokens.
 *
 * The actual orchestration lives in generationService.ts —
 * this file ONLY does auth, validation, and HTTP framing.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startGeneration, GenerationError } from '@/services/generationService';

export async function POST(request: NextRequest) {
  // ─── Auth ───
  // Assumes src/lib/auth.ts exports a getServerSession helper
  const { getServerSession } = await import('@/lib/auth');
  const session = await getServerSession();

  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // ─── Body validation ───
  const body = await request.json().catch(() => null);

  if (!body?.postId || typeof body.postId !== 'string') {
    return NextResponse.json({ error: 'MISSING_POST_ID' }, { status: 400 });
  }

  try {
    const { stream, logId } = await startGeneration(
      body.postId,
      session.userId,
      request.signal,
    );

    // Return SSE stream (logId in a header — client needs it before
    // reading the first token so Cancel works from the start)
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Generation-Log-Id': logId,
      },
    });
  } catch (error: unknown) {
    if (error instanceof GenerationError) {
      return NextResponse.json(
        {
          error: error.code,
          ...(error.details && { details: error.details }),
        },
        { status: error.statusCode },
      );
    }

    // Unexpected error — log it and return generic 500
    console.error('[POST /api/generate] Unexpected error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}