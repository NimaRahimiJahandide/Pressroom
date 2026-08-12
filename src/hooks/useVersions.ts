'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type VersionSummary = {
  id: string;
  versionNumber: number;
  isCurrent: boolean;
  createdAt: string;
  wordCount: number;
  preview: string;
};

export function useVersions(postId: string) {
  return useQuery({
    queryKey: ['versions', postId],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${postId}/versions`);
      if (!res.ok) throw new Error('Failed to fetch versions');
      return res.json() as Promise<VersionSummary[]>;
    },
  });
}

export function useRestoreVersion(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const res = await fetch(`/api/posts/${postId}/versions/${versionId}/restore`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'UNKNOWN' }));
        throw new Error(err.error);
      }
      return res.json() as Promise<{ id: string; versionNumber: number; content: string }>;
    },
    // Same keys useGenerate invalidates on completion.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['versions', postId] });
      queryClient.invalidateQueries({ queryKey: ['post', postId] });
    },
  });
}
