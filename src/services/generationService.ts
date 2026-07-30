/**
 * generationService.ts
 * =====================
 * The orchestration layer between Route Handlers and AI Adapters.
 * This file owns all database interactions (Prisma) and the
 * streaming lifecycle — it is the ONLY place that calls Prisma
 * for generation-related writes.
 *
 * Responsibilities:
 *   - startGeneration(postId, userId): create GenerationLog, build prompt,
 *     stream tokens, and on success: atomic transaction (new ContentVersion +
 *     log + post update). Returns the ReadableStream.
 *   - cancelGeneration(logId): abort an in-flight generation.
 *   - isGenerating(postId): check if a generation is active for a post.
 */

import { prisma } from '@/lib/prisma';
import { createProviderAdapter } from '@/lib/ai/factory';
import { RateLimitError, TimeoutError, ProviderError } from '@/lib/ai/generationErrors';
import type { Prisma, PostStatus, GenerationStatus } from '@prisma/client';

// ==========================================
// In-memory map of active AbortControllers
// ==========================================
// ponytail: in-memory for single-instance. Upgrade to Redis if scaling.
const activeGenerations = new Map<string, AbortController>();

// ==========================================
// combineSignals: merge multiple AbortSignals
// ==========================================
// We avoid AbortSignal.any() for Node 18+ compatibility.
// The first signal to abort cancels all others.
function combineSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  // Clean up listeners after this signal fires
  controller.signal.addEventListener(
    'abort',
    () => {
      for (const s of signals) {
        s.removeEventListener('abort', onAbort);
      }
    },
    { once: true },
  );

  return controller.signal;
}

// ==========================================
// Tone / Length prompt segments
// ==========================================
function toneSegment(tone: string): string {
  const map: Record<string, string> = {
    PROFESSIONAL:
      'Write in a professional, authoritative tone suitable for a technical blog.',
    CASUAL:
      'Write in a casual, friendly tone as if talking to a peer.',
    TECHNICAL:
      'Write in a technical, precise tone with code examples where relevant.',
    STORYTELLING:
      'Write in a storytelling narrative style with anecdotes and examples.',
    EDUCATIONAL:
      'Write in an educational, instructional tone that explains concepts clearly.',
  };
  return map[tone] ?? map.PROFESSIONAL!;
}

function lengthSegment(length: string): string {
  const map: Record<string, string> = {
    SHORT: 'Aim for roughly 500-800 words.',
    MEDIUM: 'Aim for roughly 1000-1500 words.',
    LONG: 'Aim for roughly 2000-3000 words.',
  };
  return map[length] ?? map.MEDIUM!;
}

function buildPrompt(topic: string, tone: string, length: string): string {
  return [
    `Write a complete blog post about: "${topic}"`,
    toneSegment(tone),
    lengthSegment(length),
    '',
    'Output ONLY the blog post content in Markdown. No preamble, no closing remarks.',
  ].join('\n');
}

// ==========================================
// wordCount helper
// ==========================================
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// ==========================================
// startGeneration
// ==========================================
export type GenerationResult = {
  stream: ReadableStream<Uint8Array>;
  logId: string;
};

export async function startGeneration(
  postId: string,
  userId: string,
  requestSignal: AbortSignal,
): Promise<GenerationResult> {
  // 1. Fetch the post (validates ownership + status)
  const post = await prisma.blogPost.findFirst({
    where: { id: postId, userId },
  });

  if (!post) {
    throw new GenerationError('POST_NOT_FOUND', 404);
  }

  // 2. Block if already generating
  if (post.status === 'GENERATING') {
    const activeLog = await prisma.generationLog.findFirst({
      where: { postId, status: { in: ['PENDING', 'STREAMING'] } },
      select: { id: true },
    });
    throw new GenerationError(
      'ALREADY_GENERATING',
      409,
      activeLog ? { activeLogId: activeLog.id } : undefined,
    );
  }

  // 3. Create GenerationLog (PENDING)
  const log = await prisma.generationLog.create({
    data: {
      postId,
      status: 'PENDING',
      provider: post.provider,
      model: post.model,
    },
  });

  // 4. Update post status
  await prisma.blogPost.update({
    where: { id: postId },
    data: { status: 'GENERATING' },
  });

  // 5. Build signals: user cancel + client disconnect + timeout (60s)
  const cancelController = new AbortController();
  activeGenerations.set(log.id, cancelController);

  const timeoutSignal = AbortSignal.timeout(60_000);
  const combinedSignal = combineSignals(
    cancelController.signal,
    requestSignal,
    timeoutSignal,
  );

  // 6. Build prompt and get provider adapter
  const prompt = buildPrompt(post.topic, post.tone, post.length);
  const adapter = await createProviderAdapter(post.provider);

  // 7. Create the SSE ReadableStream
  const startTime = Date.now();
  let fullContent = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        // Mark as STREAMING
        await prisma.generationLog.update({
          where: { id: log.id },
          data: { status: 'STREAMING' },
        });

        // Stream tokens from the AI provider
        for await (const token of adapter.stream({
          prompt,
          model: post.model,
          signal: combinedSignal,
        })) {
          fullContent += token;
          sendEvent('token', { token });
        }

        // ─── Generation completed successfully ───
        const durationMs = Date.now() - startTime;
        const wordCount = countWords(fullContent);

        // Atomic transaction: version + log + post
        const newVersion = await prisma.$transaction(async (tx) => {
          // Deactivate all current versions
          await tx.contentVersion.updateMany({
            where: { postId, isCurrent: true },
            data: { isCurrent: false },
          });

          // Find next version number
          const last = await tx.contentVersion.findFirst({
            where: { postId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });

          // Create new ContentVersion
          const version = await tx.contentVersion.create({
            data: {
              postId,
              versionNumber: (last?.versionNumber ?? 0) + 1,
              content: fullContent,
              format: post.finalFormat,
              isCurrent: true,
            },
          });

          // Update GenerationLog
          await tx.generationLog.update({
            where: { id: log.id },
            data: {
              status: 'COMPLETED',
              durationMs,
              completedAt: new Date(),
            },
          });

          // Update BlogPost
          await tx.blogPost.update({
            where: { id: postId },
            data: {
              status: 'COMPLETED',
              finalContent: fullContent,
              wordCount,
            },
          });

          return version;
        });

        // Send done event to client
        sendEvent('done', {
          versionId: newVersion.id,
          versionNumber: newVersion.versionNumber,
          wordCount,
        });

        controller.close();
      } catch (error: unknown) {
        // ─── Error handling ───
        const durationMs = Date.now() - startTime;
        let logStatus: GenerationStatus = 'FAILED';
        let postStatus: PostStatus = 'FAILED';
        let errorCode: string | null = null;
        let errorMessage: string | null = null;
        let abortReason: string | null = null;

        if (error instanceof RateLimitError) {
          logStatus = 'RATE_LIMITED';
          errorCode = error.code;
          errorMessage = error.message;
          sendEvent('error', {
            code: error.code,
            message: error.message,
            retryAfter: error.retryAfter,
          });
        } else if (error instanceof TimeoutError) {
          errorCode = 'TIMEOUT';
          abortReason = 'TIMEOUT';
          sendEvent('error', {
            code: 'TIMEOUT',
            message: 'Generation timed out after 60 seconds',
          });
        } else if (error instanceof Error && error.name === 'AbortError') {
          // Distinguish between reasons
          const reason =
            cancelController.signal.aborted
              ? 'USER_CANCELLED'
              : requestSignal.aborted
                ? 'NETWORK_ERROR'
                : 'TIMEOUT';
          abortReason = reason;
          postStatus = reason === 'USER_CANCELLED' ? 'CANCELLED' : 'FAILED';
          logStatus = 'CANCELLED';
          sendEvent('error', {
            code: 'ABORTED',
            message: `Generation aborted: ${reason}`,
          });
        } else {
          errorCode = 'PROVIDER_ERROR';
          errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sendEvent('error', {
            code: 'PROVIDER_ERROR',
            message: errorMessage,
          });
        }

        // Update DB (fire-and-forget: don't block stream close)
        prisma.$transaction([
          prisma.generationLog.update({
            where: { id: log.id },
            data: {
              status: logStatus,
              errorCode,
              errorMessage,
              abortReason,
              durationMs,
              completedAt: new Date(),
            },
          }),
          prisma.blogPost.update({
            where: { id: postId },
            data: { status: postStatus },
          }),
        ]).catch(() => {
          /* ponytail: log to monitoring if added later */
        });

        controller.close();
      } finally {
        activeGenerations.delete(log.id);
      }
    },

    cancel() {
      // Stream cancelled (e.g. client disconnected)
      activeGenerations.delete(log.id);
    },
  });

  return { stream, logId: log.id };
}

// ==========================================
// cancelGeneration
// ==========================================
export async function cancelGeneration(
  logId: string,
): Promise<{ success: boolean }> {
  const log = await prisma.generationLog.findUnique({
    where: { id: logId },
    select: { id: true, status: true },
  });

  if (!log) {
    throw new GenerationError('LOG_NOT_FOUND', 404);
  }

  if (log.status !== 'PENDING' && log.status !== 'STREAMING') {
    throw new GenerationError('NOT_STREAMING', 409);
  }

  const controller = activeGenerations.get(logId);
  if (controller) {
    controller.abort('USER_CANCELLED');
    activeGenerations.delete(logId);
  }

  return { success: true };
}

// ==========================================
// GenerationError: a transport error from the service layer
// (not from the AI provider — those are caught inside the stream)
// ==========================================
export class GenerationError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'GenerationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}