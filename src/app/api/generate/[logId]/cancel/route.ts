/**
 * POST /api/generate/[logId]/cancel
 * ====================================
 * Cancels an in-flight generation by its log ID.
 * Looks up the AbortController in the in-memory map and aborts it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cancelGeneration, GenerationError } from '@/services/generationService';

export async function POST(
  _request: NextRequest,
  { params }: { params: { logId: string } },
) {
  const { logId } = params;

  if (!logId) {
    return NextResponse.json({ error: 'MISSING_LOG_ID' }, { status: 400 });
  }

  try {
    const result = await cancelGeneration(logId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof GenerationError) {
      return NextResponse.json({ error: error.code }, { status: error.statusCode });
    }

    console.error('[POST /api/generate/[logId]/cancel] Unexpected error:', error);
    return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
  }
}