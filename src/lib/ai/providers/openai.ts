/**
 * openai.ts
 * =========
 * Adapter for the OpenAI API (GPT-4, etc).
 * Wraps the official openai SDK.
 * Maps provider errors to the custom error classes.
 * Yields one token string per `yield`.
 */

import OpenAI from 'openai';
import { RateLimitError, ProviderError } from '../generationErrors';
import type { ProviderStreamOptions } from '../factory';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || undefined,
    });
  }
  return client;
}

export const openaiAdapter = {
  async *stream({
    prompt,
    model,
    signal,
  }: ProviderStreamOptions): AsyncGenerator<string, void, void> {
    try {
      const response = await getClient().chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        max_tokens: 2048,
      });

      // Abort listener
      const onAbort = () => {
        response.controller.abort();
      };
      if (signal.aborted) {
        onAbort(); // already fired — addEventListener below won't catch it
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        for await (const chunk of response) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        }

        // Some SDK/proxy implementations end the async iterator normally
        // (instead of throwing) when the underlying request is aborted.
        // Without this check, an aborted generation looks identical to a
        // successful one and falls through to the success path.
        if (signal.aborted) {
          const abortError = new Error('Generation aborted');
          abortError.name = 'AbortError';
          throw abortError;
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    } catch (error: unknown) {
      // The SDK throws its own error shape on abort (not a DOMException),
      // so check the signal itself first — this is what generationService
      // uses to tell USER_CANCELLED / NETWORK_ERROR / TIMEOUT apart.
      if (signal.aborted) {
        const abortError = new Error('Generation aborted');
        abortError.name = 'AbortError';
        throw abortError;
      }

      if (error instanceof OpenAI.APIError) {
        if (error.status === 429) {
          const retryAfter = (error as any).headers?.['retry-after'];
          throw new RateLimitError(
            'Rate limited by OpenAI',
            retryAfter ? parseInt(retryAfter, 10) : 30,
          );
        }
        throw new ProviderError(
          `OpenAI API error: ${error.message}`,
          'PROVIDER_ERROR',
        );
      }
      throw error;
    }
  },
};