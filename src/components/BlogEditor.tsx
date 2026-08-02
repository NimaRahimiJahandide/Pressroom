'use client';

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { useGenerationStore } from '@/stores/generationStore';
import { useGenerate } from '@/hooks/useGenerate';

type ToolbarBtn = { label: string; active: boolean; disabled: boolean; onClick: () => void };

function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;
  const btn = (label: string, active: boolean, onClick: () => void): ToolbarBtn => ({
    label, active, disabled, onClick,
  });
  const buttons: ToolbarBtn[] = [
    btn('B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run()),
    btn('I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run()),
    btn('H1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run()),
    btn('H2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run()),
    btn('•', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run()),
    btn('1.', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run()),
    btn('❝', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run()),
  ];

  return (
    <div className="flex gap-1 pb-2 border-b mb-2">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          disabled={b.disabled}
          className={`px-3 py-1 text-sm rounded border ${
            b.active ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-600 border-gray-300'
          } ${b.disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-100'}`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}

type BlogEditorProps = {
  postId: string;
  initialContent?: string;
};

export function BlogEditor({ postId, initialContent }: BlogEditorProps) {
  const { phase, tokens, generate, cancel, reset } = useGenerate();
  const versionId = useGenerationStore((s) => s.versionId);

  const editor = useEditor({
    extensions: [
      StarterKit,
      // Lets setContent() parse the AI's markdown output as rich text,
      // instead of treating it as (and mangling it like) raw HTML.
      Markdown.configure({ html: false, breaks: true }),
    ],
    content: initialContent ?? '',
    editable: phase === 'completed',
    // TipTap v3 defaults this to off for performance, but we need the
    // toolbar's isActive() checks to re-evaluate on every transaction
    // (selection change, formatting toggle) or the active-state highlight
    // never updates.
    shouldRerenderOnTransaction: true,
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
    reset();
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
        <EditorToolbar editor={editor} disabled={!isDone} />
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}