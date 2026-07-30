/**
 * generationStore.ts
 * ===================
 * Zustand store for ephemeral client-side generation state.
 *
 * Responsibilities:
 *   - Track whether a generation is in progress (isGenerating)
 *   - Accumulate streamed tokens (tokens string)
 *   - Hold a reference to the current AbortController
 *   - Store error state from SSE events
 *   - Expose actions: start, appendToken, setError, reset, abort
 */

import { create } from 'zustand';

type GenerationPhase = 'idle' | 'generating' | 'completed' | 'error' | 'cancelled';

type GenerationState = {
  phase: GenerationPhase;
  tokens: string;
  logId: string | null;
  abortController: AbortController | null;
  error: { code: string; message: string; retryAfter?: number } | null;
  versionId: string | null;
  isGenerating: boolean;

  // Actions
  start: (logId: string) => void;
  appendToken: (token: string) => void;
  complete: (data: { versionId: string; versionNumber: number }) => void;
  setError: (error: { code: string; message: string; retryAfter?: number }) => void;
  abort: () => void;
  reset: () => void;
};

export const useGenerationStore = create<GenerationState>((set, get) => ({
  phase: 'idle',
  tokens: '',
  logId: null,
  abortController: null,
  error: null,
  versionId: null,
  isGenerating: false,

  start: (logId: string) => {
    const abortController = new AbortController();
    set({
      phase: 'generating',
      tokens: '',
      logId,
      abortController,
      error: null,
      versionId: null,
      isGenerating: true,
    });
  },

  appendToken: (token: string) => {
    set((state) => ({ tokens: state.tokens + token }));
  },

  complete: ({ versionId }: { versionId: string; versionNumber: number }) => {
    set({
      phase: 'completed',
      versionId,
      abortController: null,
      isGenerating: false,
    });
  },

  setError: (error) => {
    set({
      phase: error.code === 'ABORTED' ? 'cancelled' : 'error',
      error,
      abortController: null,
      isGenerating: false,
    });
  },

  abort: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({
      phase: 'cancelled',
      abortController: null,
      isGenerating: false,
      error: { code: 'USER_CANCELLED', message: 'Generation stopped by user' },
    });
  },

  reset: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({
      phase: 'idle',
      tokens: '',
      logId: null,
      abortController: null,
      isGenerating: false,
      error: null,
      versionId: null,
    });
  },
}));
