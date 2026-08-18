'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BlogEditor } from '@/components/BlogEditor';
import { useGenerationStore } from '@/stores/generationStore';
import {
  usePost,
  useRestoreVersion,
  useVersions,
  type VersionSummary,
} from '@/hooks/useVersions';

type PostPageProps = {
  params: { postId: string };
};

export default function PostPage({ params }: PostPageProps) {
  const [qc] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={qc}>
      <PostView postId={params.postId} />
    </QueryClientProvider>
  );
}

/* The page frame — header/nav is identical across the loading, error and
   loaded states, so it lives here rather than being written three times. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
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
        {children}
      </main>
    </div>
  );
}

function PostView({ postId }: { postId: string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  // Content of the version last restored, so the editor opens on that text.
  const [restoredContent, setRestoredContent] = useState<string>();
  const [restoreCount, setRestoreCount] = useState(0);

  // ── Fetch the post's saved data ──
  // This uses the ['post', postId] query key that useGenerate and
  // useRestoreVersion already invalidate, so it stays fresh after
  // generation / restore / cancel.
  const { data: post, isLoading: isPostLoading, error: postError } = usePost(postId);

  // ── Store leak fix: reset the global generation store on postId change ──
  // The Zustand store is a singleton — without this, navigating from post A
  // (completed) to post B would leave A's phase/tokens in the store, and
  // BlogEditor's phase effect would paint A's content into B's editor.
  // Runs synchronously on mount and on every postId change, before the
  // BlogEditor's own effects read the store.
  useEffect(() => {
    useGenerationStore.getState().reset();
  }, [postId]);

  // ── Seed existing content from the fetched post ──
  // Once the post data resolves, if the post has saved content (COMPLETED or
  // CANCELLED with finalContent), seed the store so BlogEditor displays it.
  // The `phase === 'idle'` guard prevents clobbering a generation the user
  // may have already started before this fetch resolved.
  useEffect(() => {
    if (!post) return;
    // Defensive: if the resolved data is for a different post (e.g. a stale
    // query response arrived after navigation), skip.
    if (post.id !== postId) return;

    const { finalContent } = post;
    const shouldSeed =
      (post.status === 'COMPLETED' || post.status === 'CANCELLED') &&
      typeof finalContent === 'string' &&
      finalContent.trim().length > 0;

    if (!shouldSeed) return;

    // Only seed if the store is still idle — the user may have already
    // started a new generation for this post before the fetch resolved.
    if (useGenerationStore.getState().phase !== 'idle') return;

    useGenerationStore.setState({
      phase: post.status === 'COMPLETED' ? 'completed' : 'cancelled',
      tokens: finalContent,
      versionId: post.currentVersionId,
      isGenerating: false,
      error: null,
    });
  }, [post, postId]);

  // ── Loading ──
  // BlogEditor is deliberately NOT mounted here: it reads the generation
  // store on mount, so mounting it before `post` resolves would flash an
  // idle placeholder and then swap in the seeded content.
  if (isPostLoading && !post) {
    return (
      <PageShell>
        <div className="mb-7">
          <p className="label-mono text-muted">Editor</p>
          <p className="label-mono animate-breathe mt-2 text-muted">Loading draft…</p>
        </div>

        {/* Skeleton in BlogEditor's outer shape, so the layout doesn't jump
            when the real editor takes its place. */}
        <div
          aria-hidden="true"
          className="min-h-[22rem] border border-rule-strong bg-sheet px-6 py-7 sm:px-8"
        >
          <div className="h-4 w-2/5 animate-breathe bg-panel" />
          <div className="mt-6 h-3 w-full animate-breathe bg-panel" />
          <div className="mt-3 h-3 w-11/12 animate-breathe bg-panel" />
          <div className="mt-3 h-3 w-4/5 animate-breathe bg-panel" />
          <div className="mt-6 h-3 w-full animate-breathe bg-panel" />
          <div className="mt-3 h-3 w-3/4 animate-breathe bg-panel" />
        </div>
      </PageShell>
    );
  }

  // ── Error ──
  if (postError) {
    return (
      <PageShell>
        <div className="border-l-2 border-rust bg-rust-wash/60 px-4 py-3">
          <p className="label-mono text-rust">Could not load draft</p>
          <p className="mt-1.5 text-sm text-ink/75">
            This draft did not come back. Reload the page to try again.
          </p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-mono text-muted">Editor</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            {post?.title ?? 'Write and edit'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
          className={`label-mono border px-3 py-1.5 transition-colors ${
            historyOpen
              ? 'border-pine bg-pine-wash text-pine-deep'
              : 'border-field bg-sheet text-ink/75 hover:bg-panel'
          }`}
        >
          History
        </button>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* restoreCount in the key remounts the editor on each restore —
              the cheapest way to reseed content without touching how
              BlogEditor handles streaming. */}
          <BlogEditor
            key={restoreCount}
            postId={postId}
            initialContent={restoredContent}
          />
        </div>
        {historyOpen && (
          <VersionHistory
            postId={postId}
            onRestored={(content) => {
              setRestoredContent(content);
              setRestoreCount((n) => n + 1);
            }}
            onClose={() => setHistoryOpen(false)}
          />
        )}
      </div>
    </PageShell>
  );
}

function VersionHistory({
  postId,
  onRestored,
  onClose,
}: {
  postId: string;
  onRestored: (content: string) => void;
  onClose: () => void;
}) {
  const { data: versions, isLoading, error } = useVersions(postId);
  const restore = useRestoreVersion(postId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The post is GENERATING exactly while this client is streaming it; no
  // separate status fetch needed.
  const isGenerating = useGenerationStore((s) => s.phase === 'generating');

  const handleRestore = async (versionId: string) => {
    // Swallow the rejection: restore.error already renders the failure, and an
    // unhandled promise here would surface as a console error instead.
    const restored = await restore.mutateAsync(versionId).catch(() => null);
    if (!restored) return;
    // The editor mirrors the generation store: `tokens` is what it renders and
    // `versionId` is what Save PATCHes. Point both at the restored version, or
    // the last generation's text would paint back over it and Save would write
    // to the wrong row.
    useGenerationStore.setState({
      phase: 'completed',
      tokens: restored.content,
      versionId: restored.id,
      isGenerating: false,
      error: null,
    });
    onRestored(restored.content);
    setSelectedId(null);
  };

  return (
    <aside
      aria-label="Version history"
      className="w-full shrink-0 border border-rule bg-sheet lg:w-80"
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-rule bg-panel px-4 py-3">
        <h2 className="font-display text-base font-semibold tracking-tight">Version history</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close version history"
          className="label-mono text-muted hover:text-ink"
        >
          ✕
        </button>
      </div>

      {isLoading && <p className="label-mono animate-breathe px-4 py-5 text-muted">Loading versions</p>}

      {error && (
        <p className="border-l-2 border-rust bg-rust-wash/60 px-4 py-3 text-sm text-ink/80">
          Could not load version history.
        </p>
      )}

      {versions && versions.length === 0 && (
        <p className="px-4 py-5 text-sm leading-relaxed text-muted">
          No versions yet. The first draft you write will be saved here.
        </p>
      )}

      {versions && versions.length > 0 && (
        <ul className="divide-y divide-rule">
          {versions.map((version) => (
            <VersionRow
              key={version.id}
              version={version}
              selected={selectedId === version.id}
              onSelect={() => setSelectedId(version.isCurrent ? null : version.id)}
              onRestore={() => handleRestore(version.id)}
              canRestore={!isGenerating}
              isRestoring={restore.isPending && restore.variables === version.id}
            />
          ))}
        </ul>
      )}

      {restore.error && (
        <p className="border-t border-rule border-l-2 border-l-rust bg-rust-wash/60 px-4 py-3 text-sm text-ink/80">
          {restore.error.message === 'GENERATION_IN_PROGRESS'
            ? 'This post is still being written. Wait for it to finish, then restore.'
            : 'Could not restore that version.'}
        </p>
      )}
    </aside>
  );
}

function VersionRow({
  version,
  selected,
  onSelect,
  onRestore,
  canRestore,
  isRestoring,
}: {
  version: VersionSummary;
  selected: boolean;
  onSelect: () => void;
  onRestore: () => void;
  canRestore: boolean;
  isRestoring: boolean;
}) {
  return (
    <li className={selected ? 'bg-panel/60' : ''}>
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="block w-full px-4 py-3 text-left transition-colors hover:bg-panel/60"
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-display text-[0.9375rem] font-semibold tracking-tight">
            Version {version.versionNumber}
          </span>
          {version.isCurrent && (
            <span className="label-mono shrink-0 border border-pine/80 bg-pine-wash px-2 py-1 text-pine-deep">
              Current
            </span>
          )}
        </div>
        <p className="label-mono mt-1.5 text-muted">
          {timeAgo(version.createdAt)} · {version.wordCount} words
        </p>
        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink/70">{version.preview}</p>
      </button>

      {selected && !version.isCurrent && canRestore && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={onRestore}
            disabled={isRestoring}
            className="keycap bg-pine px-3 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-pine-deep disabled:opacity-55"
          >
            {isRestoring ? 'Restoring…' : 'Restore this version'}
          </button>
        </div>
      )}
    </li>
  );
}

// Same relative-time shorthand the draft list uses.
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
