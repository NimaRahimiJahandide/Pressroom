'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { BlogEditor } from '@/components/BlogEditor';

type PostPageProps = {
  params: { postId: string };
};

export default function PostPage({ params }: PostPageProps) {
  const [qc] = useState(() => new QueryClient());
  const postId = params.postId;

  return (
    <QueryClientProvider client={qc}>
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-4xl items-baseline justify-between gap-4 px-5 py-4 sm:px-8">
            <Link
              href="/"
              className="font-display text-lg font-semibold tracking-tight decoration-pine/40 underline-offset-4 hover:underline"
            >
              Pressroom
            </Link>
            <Link href="/posts" className="label-mono text-muted underline-offset-4 hover:text-ink hover:underline">
              ← All drafts
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
          <div className="mb-7">
            <p className="label-mono text-muted">Editor</p>
            <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
              Write and edit
            </h1>
          </div>
          <BlogEditor postId={postId} />
        </main>
      </div>
    </QueryClientProvider>
  );
}
