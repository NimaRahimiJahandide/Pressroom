'use client';

import { useQuery, useMutation, useQueryClient, type UseMutateFunction } from '@tanstack/react-query';
import type { BlogPost } from '@prisma/client';

type CreatePostInput = {
  title: string;
  topic: string;
  tone?: 'PROFESSIONAL' | 'CASUAL' | 'TECHNICAL' | 'STORYTELLING' | 'EDUCATIONAL';
  length?: 'SHORT' | 'MEDIUM' | 'LONG';
  provider?: 'ANTHROPIC' | 'OPENAI';
};

export function usePosts() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['posts'],
    queryFn: async () => {
      const res = await fetch('/api/posts');
      if (!res.ok) throw new Error('Failed to fetch posts');
      return res.json() as Promise<BlogPost[]>;
    },
  });

  const mutateAsync = useMutation({
    mutationFn: async (data: CreatePostInput) => {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'UNKNOWN' }));
        throw new Error(err.error);
      }
      return res.json() as Promise<BlogPost>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create: mutateAsync.mutate,
    mutateAsync: mutateAsync.mutateAsync,
    isCreating: mutateAsync.isPending,
  };
}
