"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePosts } from "@/hooks/usePosts";
import type { BlogPost } from "@prisma/client";

export default function PostsPage() {
  const [qc] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <PostsList />
    </QueryClientProvider>
  );
}

function PostsList() {
  const router = useRouter();
  const {
    data: posts,
    isLoading,
    error,
    mutateAsync: createPost,
    isCreating,
  } = usePosts();
  const [showModal, setShowModal] = useState(false);

  const handleCreate = async (data: {
    title: string;
    topic: string;
    tone: BlogPost["tone"];
    length: BlogPost["length"];
    provider: BlogPost["provider"];
  }) => {
    try {
      const post = await createPost(data);
      router.push(`/posts/${post.id}`);
    } catch (e) {
      console.error("Failed to create post:", e);
    }
  };

  if (isLoading) {
    return (
      <Shell>
        <p className="label-mono animate-breathe text-muted">Loading drafts</p>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="border-l-2 border-rust bg-rust-wash/60 px-4 py-3">
          <p className="label-mono text-rust">Could not load drafts</p>
          <p className="mt-1.5 text-sm text-ink/75">
            The post list did not come back. Reload the page to try again.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
        <div>
          <p className="label-mono text-muted">
            {posts.length} {posts.length === 1 ? "draft" : "drafts"}
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
            Your drafts
          </h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="keycap bg-pine px-5 py-2.5 font-medium text-paper transition-colors hover:bg-pine-deep"
        >
          New draft
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="mt-10 border border-dashed border-field bg-sheet px-6 py-14 text-center">
          <p className="font-display text-xl tracking-tight">
            Nothing on the desk yet.
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Give the first draft a topic, a tone, and a length. You will watch
            it get written and can stop it whenever you have enough.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="keycap mt-7 bg-pine px-5 py-2.5 font-medium text-paper transition-colors hover:bg-pine-deep"
          >
            Start your first draft
          </button>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/posts/${post.id}`}
                className="group block border border-rule bg-sheet transition-colors hover:border-field"
              >
                <div className="flex items-stretch">
                  {/* Status reads as a painted edge before you read a word of it */}
                  <span
                    aria-hidden="true"
                    className={`w-1 shrink-0 ${statusEdge[post.status]}`}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-lg font-semibold tracking-tight decoration-pine/40 underline-offset-4 group-hover:underline">
                        {post.title}
                      </h2>
                      <p className="mt-1 line-clamp-1 text-sm text-ink/70">
                        {post.topic}
                      </p>
                      <p className="label-mono mt-2.5 text-muted">
                        {post.tone} · {post.length} · {timeAgo(post.updatedAt)}
                      </p>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
          isCreating={isCreating}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
          <span className="label-mono text-muted">Drafts</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10 sm:px-8 sm:py-14">
        {children}
      </main>
    </div>
  );
}

/* Status vocabulary, shared by the edge stripe and the badge:
   DRAFT muted gray · GENERATING gold · COMPLETED pine · FAILED rust ·
   CANCELLED gray, but marked as a stop rather than a not-yet-started.
   Stripes use the darker gold-ink so the mark clears 3:1 against the sheet —
   #C9A227 itself only reaches 2.4:1 and would read as a smudge. */
const statusEdge = {
  DRAFT: "bg-field",
  GENERATING: "bg-gold-ink",
  COMPLETED: "bg-pine",
  FAILED: "bg-rust",
  CANCELLED: "bg-muted",
} as const;
function StatusBadge({ status }: { status: BlogPost["status"] }) {
  const styles = {
    DRAFT: "border-field bg-panel text-muted",
    GENERATING: "border-gold-ink/80 bg-gold-wash text-gold-ink",
    COMPLETED: "border-pine/80 bg-pine-wash text-pine-deep",
    FAILED: "border-rust/80 bg-rust-wash text-rust",
    CANCELLED: "border-field bg-panel text-muted",
  } as const;

  const labels = {
    DRAFT: "Draft",
    GENERATING: "Generating",
    COMPLETED: "Completed",
    FAILED: "Failed",
    CANCELLED: "Stopped",
  } as const;

  return (
    <span
      className={`label-mono inline-flex shrink-0 items-center gap-1.5 self-start border px-2 py-1 ${styles[status]}`}
    >
      {status === "GENERATING" && (
        <span
          aria-hidden="true"
          className="block h-2 w-2 animate-breathe border border-gold-ink bg-gold"
        />
      )}
      {status === "CANCELLED" && (
        /* A filled square: the stop mark, distinct from DRAFT's blank slate */
        <span aria-hidden="true" className="block h-1.5 w-1.5 bg-muted" />
      )}
      {status === "FAILED" && (
        <span aria-hidden="true" className="font-mono leading-none">
          !
        </span>
      )}
      {labels[status]}
    </span>
  );
}

function CreateModal({
  onClose,
  onSubmit,
  isCreating,
}: {
  onClose: () => void;
  onSubmit: any;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<BlogPost["tone"]>("PROFESSIONAL");
  const [length, setLength] = useState<BlogPost["length"]>("MEDIUM");
  const [provider, setProvider] = useState<BlogPost["provider"]>("ANTHROPIC");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) {
      setError("Title and topic are required");
      return;
    }
    onSubmit({ title, topic, tone, length, provider });
  };

  const field =
    "w-full border border-field bg-sheet px-3 py-2 text-[0.9375rem] placeholder:text-muted focus:border-pine";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-draft-title"
        className="max-h-full w-full max-w-md overflow-y-auto border border-field bg-sheet shadow-[0_24px_60px_-30px_rgba(31,36,33,0.65)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-4 border-b border-rule bg-panel px-5 py-3">
          <h2
            id="new-draft-title"
            className="font-display text-lg font-semibold tracking-tight"
          >
            New draft
          </h2>
          <span className="label-mono text-muted">Setup</span>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-5">
          {error && (
            <p
              role="alert"
              className="mb-4 border-l-2 border-rust bg-rust-wash/60 px-3 py-2 text-sm text-ink/80"
            >
              {error}
            </p>
          )}

          <label className="block">
            <span className="label-mono mb-1.5 block text-muted">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={field}
              placeholder="Why streaming beats waiting"
            />
          </label>

          <label className="mt-4 block">
            <span className="label-mono mb-1.5 block text-muted">Topic</span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={`${field} resize-y`}
              rows={3}
              placeholder="What the post should cover"
            />
          </label>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label-mono mb-1.5 block text-muted">Tone</span>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as BlogPost["tone"])}
                className={field}
              >
                <option value="PROFESSIONAL">Professional</option>
                <option value="CASUAL">Casual</option>
                <option value="TECHNICAL">Technical</option>
                <option value="STORYTELLING">Storytelling</option>
                <option value="EDUCATIONAL">Educational</option>
              </select>
            </label>
            <label className="block">
              <span className="label-mono mb-1.5 block text-muted">Length</span>
              <select
                value={length}
                onChange={(e) =>
                  setLength(e.target.value as BlogPost["length"])
                }
                className={field}
              >
                <option value="SHORT">Short — 500–800 words</option>
                <option value="MEDIUM">Medium — 1,000–1,500 words</option>
                <option value="LONG">Long — 2,000–3,000 words</option>
              </select>
            </label>
            <label className="mt-4 block">
              <span className="label-mono mb-1.5 block text-muted">
                Provider
              </span>
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as BlogPost["provider"])
                }
                className={field}
              >
                <option value="ANTHROPIC">Anthropic (Claude)</option>
                <option value="OPENAI">OpenAI (GPT)</option>
              </select>
            </label>
          </div>

          <div className="mt-7 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-field bg-sheet px-4 py-2.5 font-medium transition-colors hover:bg-panel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="keycap flex-1 bg-pine px-4 py-2.5 font-medium text-paper transition-colors hover:bg-pine-deep disabled:opacity-55"
            >
              {isCreating ? "Creating…" : "Create draft"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ~10-line relative time helper
function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
