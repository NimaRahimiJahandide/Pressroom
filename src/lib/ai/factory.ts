/**
 * factory.ts
 * ==========
 * Factory function to select the correct AI provider adapter
 * based on the `provider` field from BlogPost.
 * Returns an object with a single `stream` method that accepts
 * prompt, model, and an AbortSignal, and yields token strings.
 */

import { RateLimitError, ProviderError, TimeoutError } from './generationErrors';

export type ProviderStreamOptions = {
  prompt: string;
  model: string;
  signal: AbortSignal;
};

export type ProviderAdapter = {
  stream: (options: ProviderStreamOptions) => AsyncGenerator<string, void, void>;
};

export async function createProviderAdapter(
  provider: 'ANTHROPIC' | 'OPENAI',
): Promise<ProviderAdapter> {
  if (provider === 'ANTHROPIC') {
    const m = await import('./providers/anthropic');
    return m.anthropicAdapter;
  }
  const m = await import('./providers/openai');
  return m.openaiAdapter;
}

/**
 * Re-export error classes for the service layer to catch
 */
export { RateLimitError, ProviderError, TimeoutError };