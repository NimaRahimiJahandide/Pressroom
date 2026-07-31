'use client';

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useGenerationStore } from '@/stores/generationStore';
import { useGenerate } from '@/hooks/useGenerate';

type BlogEditorProps = {
  postId: string;
  initialContent?: string;
};

export function BlogEditor({ postId, initialContent }: BlogEditorProps) {
  const { phase, tokens, generate, cancel } = useGenerate();
  const versionId = useGenerationStore((s) => s.versionId);

  const editor = useEditor({
    extensions: [StarterKit],
    content: initialContent ?? '',
    editable: phase === 'completed',
  });

  // When streaming: inject tokens as markdown into editor (read-only mode)
  useEffect(() => {
    if (!editor) return;
    if (phase === 'generating') {
      editor.commands.setContent(tokens);
      editor.setEditable(false);
    } else if (phase === 'completed') {
      editor.commands.setContent(tokens);
      editor.setEditable(true);
    } else if (phase === 'cancelled' || phase === 'error') {
      // Keep whatever tokens arrived so far
      if (tokens) editor.commands.setContent(tokens);
      editor.setEditable(false);
    } else {
      editor.setEditable(false);
    }
  }, [editor, phase, tokens]);

  const handleSave = useCallback(async () => {
    if (!editor || !versionId) return;
    const html = editor.getHTML();
    await fetch(`/api/content-version/${versionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: html }),
    });
  }, [editor, versionId]);

  const handleGenerate = () => generate(postId);
  const handleCancel = () => cancel();
  const handleReset = () => {
    useGenerate().reset();
    if (initialContent) editor?.commands.setContent(initialContent);
  };

  const isIdle = phase === 'idle';
  const isStreaming = phase === 'generating';
  const isDone = phase === 'completed';
  const isTerminal = phase === 'cancelled' || phase === 'error';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-2">
        {isIdle && (
          <button onClick={handleGenerate} className="px-4 py-2 bg-blue-600 text-white rounded">
            Generate
          </button>
        )}
        {isStreaming && (
          <button onClick={handleCancel} className="px-4 py-2 bg-red-600 text-white rounded">
            Stop
          </button>
        )}
        {isDone && (
          <>
            <button onClick={handleSave} className="px-4 py-2 bg-green-600 text-white rounded">
              Save
            </button>
            <button onClick={handleReset} className="px-4 py-2 bg-gray-400 text-white rounded">
              Reset
            </button>
          </>
        )}
        {isTerminal && (
          <button onClick={handleReset} className="px-4 py-2 bg-gray-400 text-white rounded">
            Try Again
          </button>
        )}
      </div>

      {/* Status banner */}
      {isStreaming && (
        <div className="text-sm text-blue-600 animate-pulse">Generating...</div>
      )}
      {phase === 'error' && (
        <div className="text-sm text-red-600">Generation failed. Partial content shown.</div>
      )}
      {phase === 'cancelled' && (
        <div className="text-sm text-amber-600">Generation cancelled. Partial content shown.</div>
      )}

      {/* Editor */}
      <div className="border rounded p-4 min-h-[300px] prose max-w-none">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
