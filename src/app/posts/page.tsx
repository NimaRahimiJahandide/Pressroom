'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { usePosts } from '@/hooks/usePosts';
import type { BlogPost } from '@prisma/client';

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
  const { data: posts, isLoading, error, mutateAsync: createPost, isCreating } = usePosts();
  const [showModal, setShowModal] = useState(false);

  const handleCreate = async (data: { title: string; topic: string; tone: BlogPost['tone']; length: BlogPost['length'] }) => {
    try {
      const post = await createPost({
        ...data,
        provider: 'OPENAI', // default
      });
      router.push(`/posts/${post.id}`);
    } catch (e) {
      console.error('Failed to create post:', e);
    }
  };

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-600">Error loading posts</div>;

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Posts</h1>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          New Post
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-12 border rounded">
          <p className="text-gray-500 mb-4">No posts yet. Create your first AI-powered blog post.</p>
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded">
            Create your first post
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => router.push(`/posts/${post.id}`)}
              className="w-full text-left border rounded p-4 hover:border-blue-400 transition"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-lg">{post.title}</h3>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-1">{post.topic}</p>
                </div>
                <StatusBadge status={post.status} />
              </div>
              <div className="text-xs text-gray-400 mt-2">Updated {timeAgo(post.updatedAt)}</div>
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <CreateModal
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BlogPost['status'] }) {
  const colors = {
    DRAFT: 'bg-gray-200 text-gray-700',
    GENERATING: 'bg-blue-100 text-blue-700 animate-pulse',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
    CANCELLED: 'bg-amber-100 text-amber-700',
  } as const;
  return <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status]}`}>{status}</span>;
}

function CreateModal({ onClose, onSubmit, isCreating }: { onClose: () => void; onSubmit: any; isCreating: boolean }) {
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState<BlogPost['tone']>('PROFESSIONAL');
  const [length, setLength] = useState<BlogPost['length']>('MEDIUM');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !topic.trim()) {
      setError('Title and topic are required');
      return;
    }
    onSubmit({ title, topic, tone, length });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">New Post</h2>
        <form onSubmit={handleSubmit}>
          {error && <div className="text-red-600 text-sm mb-3">{error}</div>}
          <label className="block mb-3">
            <span className="block text-sm font-medium mb-1">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="My AI Adventure"
            />
          </label>
          <label className="block mb-3">
            <span className="block text-sm font-medium mb-1">Topic / Keyword</span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-full border rounded px-3 py-2"
              rows={3}
              placeholder="Building web applications with Next.js"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <label>
              <span className="block text-sm font-medium mb-1">Tone</span>
              <select value={tone} onChange={(e) => setTone(e.target.value as BlogPost['tone'])} className="w-full border rounded px-3 py-2">
                <option value="PROFESSIONAL">Professional</option>
                <option value="CASUAL">Casual</option>
                <option value="TECHNICAL">Technical</option>
                <option value="STORYTELLING">Storytelling</option>
                <option value="EDUCATIONAL">Educational</option>
              </select>
            </label>
            <label>
              <span className="block text-sm font-medium mb-1">Length</span>
              <select value={length} onChange={(e) => setLength(e.target.value as BlogPost['length'])} className="w-full border rounded px-3 py-2">
                <option value="SHORT">Short (~500-800 words)</option>
                <option value="MEDIUM">Medium (~1000-1500 words)</option>
                <option value="LONG">Long (~2000-3000 words)</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-gray-200 rounded">Cancel</button>
            <button type="submit" disabled={isCreating} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50">
              {isCreating ? 'Creating...' : 'Create'}
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
