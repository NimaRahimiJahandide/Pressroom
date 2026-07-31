'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BlogEditor } from '@/components/BlogEditor';

export default function PostPage() {
  const [qc] = useState(() => new QueryClient());
  // Hardcoded for demo — in real app, get postId from params
  const postId = 'test-post-001';

  return (
    <QueryClientProvider client={qc}>
      <main className="max-w-4xl mx-auto p-8">
        <h1 className="text-2xl font-bold mb-6">AI Blog Post Editor</h1>
        <BlogEditor postId={postId} />
      </main>
    </QueryClientProvider>
  );
}
