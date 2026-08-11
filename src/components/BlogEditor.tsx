'use client';

import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { useGenerationStore } from '@/stores/generationStore';
import { useGenerate } from '@/hooks/useGenerate';

type ToolbarBtn = { label: string; title: string; active: boolean; disabled: boolean; onClick: () => void };

function EditorToolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  if (!editor) return null;
  const btn = (label: string, title: string, active: boolean, onClick: () => void): ToolbarBtn => ({
    label, title, active, disabled, onClick,
  });
  const buttons: ToolbarBtn[] = [
    btn('B', 'Bold', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run()),
    btn('I', 'Italic', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run()),
    btn('H1', 'Heading 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run()),
    btn('H2', 'Heading 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run()),
    btn('•', 'Bulleted list', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run()),
    btn('1.', 'Numbered list', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run()),
    btn('❝', 'Quote', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run()),
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-rule bg-sheet px-4 py-2.5 sm:px-5">
      {buttons.map((b) => (
        <button
          key={b.label}
          type="button"
          onClick={b.onClick}
          disabled={b.disabled}
          title={b.title}
          aria-label={b.title}
          aria-pressed={b.active}
          className={`min-w-9 border px-2.5 py-1.5 font-mono text-[0.8125rem] leading-none transition-colors ${
            b.active
              ? 'border-pine bg-pine text-paper'
              : 'border-field bg-sheet text-ink/70'
          } ${b.disabled ? 'cursor-not-allowed opacity-40' : 'hover:border-pine hover:bg-pine-wash'}`}
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

  // Presentational counters, derived from the tokens already in the store.
  const wordCount = tokens.trim() ? tokens.trim().split(/\s+/).length : 0;
  const charCount = tokens.length;

  return (
    <div className="border border-rule-strong bg-sheet shadow-[0_1px_0_0_var(--color-rule),0_18px_44px_-34px_rgba(31,36,33,0.5)]">
      {/* ── Console strip: state on the left, the physical control on the right ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-b border-rule bg-panel px-4 py-3 sm:px-5">
        <PhaseChip phase={phase} />

        <span className="label-mono text-muted">{wordCount} words</span>
        <span aria-hidden="true" className="label-mono text-muted">/</span>
        <span className="label-mono text-muted">{charCount} chars</span>

        <div
          className="ml-auto flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Draft controls"
        >
          {isIdle && (
            <button
              onClick={handleGenerate}
              className="keycap bg-pine px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-pine-deep"
            >
              Write draft
            </button>
          )}

          {isStreaming && (
            /* Weighted like a hardware stop: ink body, hard bottom edge,
               travels down on press. Not a generic red button. */
            <button
              onClick={handleCancel}
              className="keycap inline-flex items-center gap-2 bg-ink px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-black [--keycap-edge:#0f1211]"
            >
              <span aria-hidden="true" className="block h-2.5 w-2.5 bg-paper" />
              Stop
            </button>
          )}

          {isDone && (
            <>
              <button
                onClick={handleSave}
                className="keycap bg-pine px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-pine-deep"
              >
                Save
              </button>
              <button
                onClick={handleReset}
                className="border border-field bg-sheet px-4 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-panel"
              >
                Discard
              </button>
            </>
          )}

          {isTerminal && (
            <button
              onClick={handleReset}
              className="keycap bg-pine px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-pine-deep"
            >
              Write again
            </button>
          )}
        </div>
      </div>

      {/* ── Status line: only speaks when there is something to report ── */}
      {phase === 'error' && (
        <p className="border-b border-rule border-l-2 border-l-rust bg-rust-wash/60 px-4 py-2.5 text-sm text-ink/80 sm:px-5">
          Generation failed. The words that arrived before it stopped are below.
        </p>
      )}
      {phase === 'cancelled' && (
        <p className="border-b border-rule border-l-2 border-l-muted bg-panel/70 px-4 py-2.5 text-sm text-ink/80 sm:px-5">
          You stopped the draft at {wordCount} words. Everything written so far is kept.
        </p>
      )}

      {/* ── Formatting strip: only live once the draft is yours to edit ── */}
      <EditorToolbar editor={editor} disabled={!isDone} />

      {/* ── The sheet ── */}
      <div
        className={`manuscript ruled-margin min-h-[22rem] px-6 py-7 pl-10 [background-position:1.75rem_0] sm:px-8 sm:pl-14 ${
          isStreaming ? 'is-streaming' : ''
        }`}
      >
        <EditorContent editor={editor} />

        {isIdle && !tokens && !initialContent && (
          <p className="font-display text-[1.0625rem] leading-relaxed text-muted">
            The draft will appear here, a word at a time. Press Write draft to begin.
          </p>
        )}
      </div>
    </div>
  );
}

/* Same status vocabulary as the post list, keyed to generation phase. */
function PhaseChip({ phase }: { phase: ReturnType<typeof useGenerate>['phase'] }) {
  const map = {
    idle: { label: 'Draft', className: 'border-field bg-sheet text-muted', dot: '' },
    generating: { label: 'Generating', className: 'border-gold-ink/80 bg-gold-wash text-gold-ink', dot: 'border border-gold-ink bg-gold' },
    completed: { label: 'Completed', className: 'border-pine/80 bg-pine-wash text-pine-deep', dot: '' },
    cancelled: { label: 'Stopped', className: 'border-field bg-panel text-muted', dot: 'bg-muted' },
    error: { label: 'Failed', className: 'border-rust/80 bg-rust-wash text-rust', dot: '' },
  } as const;
  const { label, className, dot } = map[phase];

  return (
    <span
      aria-live="polite"
      className={`label-mono inline-flex items-center gap-1.5 border px-2 py-1 ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`block h-1.5 w-1.5 ${dot} ${phase === 'generating' ? 'animate-breathe' : ''}`}
        />
      )}
      {phase === 'error' && (
        <span aria-hidden="true" className="font-mono leading-none">!</span>
      )}
      {label}
    </span>
  );
}
