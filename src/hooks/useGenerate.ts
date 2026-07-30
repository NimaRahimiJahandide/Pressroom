/**
 * useGenerate.ts
 * ===============
 * Custom React hook that orchestrates the client-side generation flow.
 *
 * Responsibilities:
 *   - Start a generation: POST /api/generate, then consume SSE stream
 *   - Parse SSE events (token, done, error)
 *   - Update Zustand store on each event
 *   - Cancel: call POST /api/generate/[logId]/cancel + abort local signal
 *   - Regenerate: cancel current (with user confirmation) before restarting
 *
 * Depends on React Query for invalidation after completion.
 */

'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useGenerationStore } from '@/stores/generationStore';

type UseGenerateReturn = {
  phase: ReturnType<typeof useGenerationStore.getState>['phase'];
  tokens: ReturnType<typeof useGenerationStore.getState>['tokens'];
  error: ReturnType<typeof useGenerationStore.getState>['error'];
  isGenerating: boolean;
  generate: (postId: string) => Promise<void>;
  cancel: () => Promise<void>;
  regenerate: (postId: string) => Promise<void>;
  reset: () => void;
};

export function useGenerate(): UseGenerateReturn {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (postId: string) => {
    // Reset state for new generation
    useGenerationStore.getState().reset();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // POST to start generation — this will return an SSE stream
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId }),
        signal: abortController.signal,
      });

      // HTTP-level errors (4xx/5xx that are NOT stream responses)
      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        const errorCode = errBody?.error ?? 'UNKNOWN';

        // 409 = already generating — the service also returns activeLogId
        if (response.status === 409) {
          // Offer to cancel the existing generation first (regenerate flow)
          useGenerationStore.getState().setError({
            code: 'ALREADY_GENERATING',
            message: 'A generation is already in progress. Cancel and start over?',
          });
          return;
        }

        useGenerationStore.getState().setError({
          code: errorCode,
          message: errBody?.message ?? 'Failed to start generation',
        });
        return;
      }

      // Start reading the SSE stream
      const contentType = response.headers.get('Content-Type');
      if (contentType !== 'text/event-stream') {
        useGenerationStore.getState().setError({
          code: 'UNEXPECTED_RESPONSE',
          message: 'Expected SSE stream but got different content type',
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        useGenerationStore.getState().setError({
          code: 'NO_STREAM',
          message: 'Response body is not readable',
        });
        return;
      }

      // Parse the SSE stream manually (no dependency needed)
      const decoder = new TextDecoder();
      let buffer = '';
      let streamingStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim();

            // Next line should be data:
            const dataLine = lines[lines.indexOf(line) + 1];
            if (!dataLine || !dataLine.startsWith('data: ')) continue;

            const rawData = dataLine.slice(6);
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(rawData);
            } catch {
              continue;
            }

            if (eventType === 'token' && typeof data.token === 'string') {
              if (!streamingStarted) {
                // First token — set logId from the response
                streamingStarted = true;
                // Note: logId isn't in the SSE in this design;
                // we could add it as a first event, or the cancel
                // endpoint works with the known logId from the store.
                // For simplicity, cancel uses just the store's logId.
              }
              useGenerationStore.getState().appendToken(data.token);
            } else if (eventType === 'done') {
              useGenerationStore.getState().complete({
                versionId: data.versionId as string,
                versionNumber: data.versionNumber as number,
              });
              // Invalidate React Query caches
              await queryClient.invalidateQueries({
                queryKey: ['post', postId],
              });
              await queryClient.invalidateQueries({
                queryKey: ['versions', postId],
              });
            } else if (eventType === 'error') {
              useGenerationStore.getState().setError({
                code: (data.code as string) ?? 'UNKNOWN',
                message: (data.message as string) ?? 'An error occurred',
                retryAfter: data.retryAfter as number | undefined,
              });
            }
          }
        }
      }
    } catch (error: unknown) {
      // AbortError from the local AbortController = user cancelled
      if (error instanceof DOMException && error.name === 'AbortError') {
        useGenerationStore.getState().setError({
          code: 'ABORTED',
          message: 'Generation aborted',
        });
      } else {
        useGenerationStore.getState().setError({
          code: 'NETWORK_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Network error during generation',
        });
      }
    } finally {
      abortControllerRef.current = null;
    }
  }, [queryClient]);

  const cancel = useCallback(async () => {
    const { logId } = useGenerationStore.getState();
    if (!logId) {
      // No active generation — just reset local state
      useGenerationStore.getState().reset();
      return;
    }

    // Abort local fetch signal
    abortControllerRef.current?.abort();

    // Tell the server (fire-and-forget)
    fetch(`/api/generate/${logId}/cancel`, { method: 'POST' }).catch(() => {
      /* best-effort */
    });

    useGenerationStore.getState().abort();
  }, []);

  const regenerate = useCallback(async (postId: string) => {
    const { phase } = useGenerationStore.getState();

    if (phase === 'generating') {
      // Ask user to confirm (simplified — in real UI use a modal/dialog)
      const confirmed = window.confirm(
        'A generation is in progress. Cancel it and start over?',
      );
      if (!confirmed) return;

      await cancel();
      // Small delay to let the server finalise
      await new Promise((r) => setTimeout(r, 300));
    }

    await generate(postId);
  }, [generate, cancel]);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    useGenerationStore.getState().reset();
  }, []);

  const { phase, tokens, error, isGenerating } = useGenerationStore();

  return {
    phase,
    tokens,
    error,
    isGenerating: isGenerating,
    generate,
    cancel,
    regenerate,
    reset,
  };
}