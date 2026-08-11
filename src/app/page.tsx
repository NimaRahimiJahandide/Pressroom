'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The hero demonstrates the product instead of describing it: a draft
 * arrives one word at a time onto a manuscript sheet, and the Stop control
 * is live. Whatever has landed stays on the page — which is the whole point.
 */
const DEMO_TITLE = 'Why streaming beats waiting';
const DEMO_TEXT =
  'Most drafting tools hand you a finished page and hope you like it. ' +
  'Watching the words arrive changes the job: you read as it writes, you ' +
  'notice the paragraph going sideways on line four, and you stop it there. ' +
  'What has already landed is yours to keep — no discarded run, no starting over.';

const WORDS = DEMO_TEXT.split(' ');

type DemoPhase = 'writing' | 'stopped' | 'done';

function useStreamingDemo() {
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>('writing');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    // Someone who has asked for less motion gets the finished draft, not a show.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      setCount(WORDS.length);
      setPhase('done');
      return;
    }

    if (phase !== 'writing') return;

    if (count >= WORDS.length) {
      setPhase('done');
      return;
    }

    // Vary the cadence slightly so it reads as a model, not a marquee.
    const word = WORDS[count] ?? '';
    const delay = 46 + (word.length > 6 ? 34 : 0) + (word.endsWith('.') ? 190 : 0);
    timer.current = setTimeout(() => setCount((n) => n + 1), delay);
    return clear;
  }, [count, phase, clear]);

  const stop = useCallback(() => {
    clear();
    setPhase('stopped');
  }, [clear]);

  const restart = useCallback(() => {
    clear();
    setCount(0);
    setPhase('writing');
  }, [clear]);

  return { text: WORDS.slice(0, count).join(' '), words: count, phase, stop, restart };
}

export default function LandingPage() {
  const { text, words, phase, stop, restart } = useStreamingDemo();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex max-w-6xl items-baseline justify-between gap-4 px-5 py-4 sm:px-8">
          <span className="font-display text-lg font-semibold tracking-tight">Pressroom</span>
          <span className="label-mono text-muted">Draft · Watch · Keep</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 sm:px-8 sm:py-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-16">
          {/* --- Thesis --- */}
          <div className="max-w-xl">
            <p className="label-mono text-pine">AI drafting, under your hand</p>

            <h1 className="mt-5 font-display text-[2.5rem] leading-[1.08] font-semibold tracking-[-0.02em] text-balance sm:text-[3.25rem]">
              Watch your blog post get written, and stop it the moment you have enough.
            </h1>

            <p className="mt-6 max-w-md text-[1.0625rem] leading-relaxed text-ink/75">
              Pick a topic, tone, and length. The draft streams into the editor a word at a
              time — stop mid-sentence and every word already written stays, saved as its own
              version.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/posts"
                className="keycap inline-flex items-center gap-2.5 bg-pine px-6 py-3 font-medium text-paper transition-colors hover:bg-pine-deep"
              >
                Start a draft
                <span aria-hidden="true" className="font-mono text-sm">
                  →
                </span>
              </Link>
              <span className="label-mono text-muted">Claude · GPT</span>
            </div>
          </div>

          {/* --- Signature: the writing head, live --- */}
          <ManuscriptDemo
            text={text}
            words={words}
            phase={phase}
            onStop={stop}
            onRestart={restart}
          />
        </div>
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
          <p className="label-mono text-muted">Pressroom — a drafting desk for people who edit</p>
        </div>
      </footer>
    </div>
  );
}

function ManuscriptDemo({
  text,
  words,
  phase,
  onStop,
  onRestart,
}: {
  text: string;
  words: number;
  phase: DemoPhase;
  onStop: () => void;
  onRestart: () => void;
}) {
  const writing = phase === 'writing';

  return (
    <div className="border border-rule-strong bg-sheet shadow-[0_1px_0_0_var(--color-rule),0_18px_40px_-32px_rgba(31,36,33,0.5)]">
      {/* Console strip — everything the machine knows, in mono */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule bg-panel px-4 py-2.5">
        <StatusChip phase={phase} />
        <span className="label-mono text-muted">{words} words</span>
        <span aria-hidden="true" className="label-mono text-muted">
          /
        </span>
        <span className="label-mono text-muted">claude-sonnet</span>

        <div className="ml-auto">
          {writing ? (
            <button
              type="button"
              onClick={onStop}
              className="keycap inline-flex items-center gap-2 bg-ink px-3.5 py-2 text-sm font-medium text-paper [--keycap-edge:#0f1211]"
            >
              <span aria-hidden="true" className="block h-2.5 w-2.5 bg-paper" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={onRestart}
              className="label-mono border border-field bg-sheet px-3 py-2 text-ink transition-colors hover:bg-panel"
            >
              Run again
            </button>
          )}
        </div>
      </div>

      {/* The sheet */}
      <div className="ruled-margin px-6 py-7 pl-10 [background-position:1.75rem_0] sm:px-8 sm:pl-12">
        <p className="label-mono text-muted">Draft 1</p>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight">{DEMO_TITLE}</h2>

        <p
          aria-live="off"
          className="mt-4 min-h-[11.5rem] font-display text-[1.0625rem] leading-[1.75] text-ink sm:min-h-[10rem]"
        >
          {text}
          <span
            aria-hidden="true"
            className={`ml-0.5 inline-block h-[1.05em] w-[0.52em] translate-y-[0.14em] bg-pine ${
              writing ? 'animate-blink' : 'opacity-0'
            }`}
          />
        </p>

        {phase === 'stopped' && (
          <p className="mt-5 border-l-2 border-pine bg-pine-wash/60 px-3 py-2 text-sm text-ink/80">
            Stopped at {words} words. The partial draft is kept as a version — pick it up in the
            editor whenever you like.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ phase }: { phase: DemoPhase }) {
  const map = {
    writing: { label: 'Generating', className: 'bg-gold-wash text-gold-ink border-gold-ink/80' },
    stopped: { label: 'Stopped', className: 'bg-panel text-muted border-field' },
    done: { label: 'Completed', className: 'bg-pine-wash text-pine-deep border-pine/80' },
  } as const;
  const { label, className } = map[phase];

  return (
    <span
      className={`label-mono inline-flex items-center gap-1.5 border px-2 py-1 ${className}`}
    >
      {phase === 'writing' && (
        <span aria-hidden="true" className="block h-2 w-2 animate-breathe border border-gold-ink bg-gold" />
      )}
      {label}
    </span>
  );
}
