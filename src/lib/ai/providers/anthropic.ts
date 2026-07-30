/**
 * anthropic.ts
 * =============
 * Adapter for the Anthropic (Claude) API.
 * Wraps the official @anthropic-ai/sdk.
 * Maps provider errors to the custom error classes.
 * Yields one token string per `yield`.
 *
 * Uses streaming via the SDK's messages.stream() helper.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RateLimitError, ProviderError } from '../generationErrors';
import type { ProviderStreamOptions } from '../factory';

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

function buildPrompt(raw: string): string {
  // raw comes pre-built from the service layer.
  // We just pass it through to the messages API.
  return raw;
}

export const anthropicAdapter = {
  async *stream({
    prompt,
    model,
    signal,
  }: ProviderStreamOptions): AsyncGenerator<string, void, void> {
    try {
      const response = await getClient().messages.stream({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: buildPrompt(prompt) }],
      });

      // Abort listener: if the combined signal fires, abort the SDK stream.
      const onAbort = () => {
        response.abort();
      };
      if (signal.aborted) {
        throw new Error('Generation aborted');
      }
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            yield event.delta.text;
          }
        }
      } finally {
        signal.removeEventListener('abort', onAbort);
      }
    } catch (error: unknown) {
      // Map Anthropic-specific errors to our error classes
      if (error instanceof Anthropic.RateLimitError) {
        const retryAfter = (error as any).headers?.['retry-after'];
        throw new RateLimitError(
          'Rate limited by Anthropic',
          retryAfter ? parseInt(retryAfter, 10) : 30,
        );
      }
      if (error instanceof Anthropic.APIError) {
        throw new ProviderError(
          `Anthropic API error: ${error.message}`,
          'PROVIDER_ERROR',
        );
      }
      throw error;
    }
  },
};