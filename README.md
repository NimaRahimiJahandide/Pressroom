# Pressroom

An AI blog-post drafting tool. Pick a topic, tone, and length — watch the draft
get written live, token by token, with a real editor underneath it. Stop
generation at any point and keep the partial draft. Every generation is saved
as a version you can browse and restore later.

Built as a focused exploration of what it actually takes to make AI streaming
feel trustworthy in a product: clean cancellation, no orphaned server state,
no silent data loss, no UI limbo when things fail mid-stream.

**[Live demo →](#)** &nbsp;·&nbsp; Screenshots/GIF below

---

## What it does

- **Live streaming drafts** — tokens stream from Claude or GPT straight into a
  TipTap rich-text editor as they arrive, rendered as Markdown.
- **Real cancellation** — hit Stop mid-generation and the partial draft is
  kept, not discarded. The abort is propagated all the way from the browser's
  `AbortController` through the SSE stream to the provider SDK's own request,
  so nothing keeps running server-side after you've stopped watching it.
- **Version history** — every generation (and every restore) is a row in
  `ContentVersion`. Browse past drafts, preview them, and roll back without
  losing the version you rolled back from.
- **Two providers, one interface** — Anthropic and OpenAI sit behind the same
  adapter contract, so the generation service doesn't know or care which one
  it's talking to.

## Why this exists

Most "AI wrapper" demos show the happy path: type a prompt, get a response.
The interesting engineering problems show up at the edges — what happens when
the user clicks Stop 300ms into a generation? What if the network drops mid-
stream? What if two cancel requests race each other? This project is built
around answering those questions concretely, with a `GenerationLog` table
that records exactly how every generation ended (`COMPLETED`, `CANCELLED`,
`FAILED`, `RATE_LIMITED`) and why (`USER_CANCELLED`, `NETWORK_ERROR`,
`TIMEOUT`).

---

## Architecture

```
Browser                          Server                         Provider
────────                         ──────                         ────────
useGenerate() ──POST /api/generate──▶ generationService
  │  AbortController                    │  creates GenerationLog (PENDING)
  │  reads SSE stream                   │  creates combined AbortSignal
  │                                     │  (user cancel + disconnect + 60s
  │◀──── SSE: token/token/.../done ─────┤   timeout, first to fire wins)
  │                                     │
  │                                     ▼
  │                              provider adapter ──stream()──▶ Anthropic /
  │                              (anthropic.ts /                 OpenAI SDK
  │                               openai.ts)
  │
Stop button ──POST /api/generate/[logId]/cancel──▶ aborts the in-memory
                                                     AbortController for
                                                     that log
```

**Key design decisions:**

- **Adapter pattern for providers.** `factory.ts` returns a `{ stream }`
  object for either provider; `generationService.ts` never imports an SDK
  directly. Adding a third provider means writing one adapter file.
- **Combined abort signals, not scattered checks.** User-initiated cancel,
  client disconnect, and a 60s timeout are merged into a single
  `AbortSignal` before it ever reaches the provider adapter. The adapter
  doesn't need to know *why* it's aborting, just that it should stop.
- **`for await` doesn't throw on abort by itself.** Both provider adapters
  explicitly re-check `signal.aborted` after their streaming loop exits —
  some SDK/proxy combinations end the async iterator normally instead of
  throwing, which would otherwise look identical to a successful completion.
- **DB writes on the error path are awaited, not fire-and-forget.** The
  `GenerationLog`/`BlogPost` status update on cancel/error/timeout happens
  inside the same request before the stream closes, so `cancelGeneration()`
  reading the log status right after a cancel sees a consistent value
  instead of a race.
- **In-memory `AbortController` map.** Simple and correct for a single
  instance; noted in code as the first thing to swap for Redis if this ever
  needs to run on more than one server.

## Tech stack

| Layer       | Choice |
|-------------|--------|
| Framework   | Next.js 14 (App Router) |
| Language    | TypeScript |
| Database    | PostgreSQL (Prisma ORM) — SQLite for local dev |
| AI          | Anthropic SDK, OpenAI SDK, hand-rolled SSE (no Vercel AI SDK — streaming lifecycle is the point, wanted direct control) |
| Editor      | TipTap v3 + `tiptap-markdown` |
| State       | Zustand (generation state), TanStack Query (server state) |
| Styling     | Tailwind CSS v4 |

## Project structure

```
src/
  app/
    api/
      generate/route.ts                    start a generation (SSE)
      generate/[logId]/cancel/route.ts      cancel an in-flight generation
      posts/route.ts                        list / create posts
      posts/[postId]/versions/route.ts      version history for a post
      posts/[postId]/versions/[id]/restore/ roll back to a version
      content-version/[versionId]/route.ts  save editor content
    posts/                                  post list + post detail pages
    page.tsx                                landing page
  components/BlogEditor.tsx                 TipTap editor + generation UI
  hooks/                                    useGenerate, usePosts, useVersions
  lib/ai/
    factory.ts                              provider adapter selection
    providers/anthropic.ts, openai.ts        provider-specific streaming
    generationErrors.ts                     RateLimitError, TimeoutError, ProviderError
  services/generationService.ts             orchestration + all Prisma writes for generation
  stores/generationStore.ts                 client-side streaming state
prisma/schema.prisma                        BlogPost, ContentVersion, GenerationLog
scripts/                                    manual test scripts (see below)
```

## Getting started

```bash
git clone https://github.com/NimaRahimiJahandide/ai-blog-post-generator.git
cd ai-blog-post-generator
npm install
cp .env.example .env       # add DATABASE_URL + at least one provider API key
npm run db:migrate
npm run db:seed            # creates a demo user + post
npm run dev
```

Open `http://localhost:3000`. There's no real auth — a dev-only middleware
(`src/middleware.ts`) auto-assigns the seeded demo user to any request
without a session cookie, so the app is usable straight from the browser.
Swap in real auth (NextAuth/Clerk/etc.) by replacing `src/lib/auth.ts`;
everything else calls `getServerSession()` and doesn't know the difference.

### Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres in production, SQLite locally |
| `ANTHROPIC_API_KEY` | one of these two | |
| `OPENAI_API_KEY` | one of these two | |
| `OPENAI_BASE_URL` | no | point at an OpenAI-compatible proxy instead of `api.openai.com` |

### Manual test scripts

`scripts/` has a few Node scripts used while building the cancel/abort and
version-restore flows — they hit a running dev server directly and assert on
DB state after. Not a substitute for real automated tests, but they were how
the abort-race-condition behavior above was actually verified during
development.

```bash
npm run dev                        # in one terminal, on port 3456 — see script for the exact port
node scripts/test-cancel-stream.mjs
node scripts/test-version-routes.cjs
```

## What's next

- Deploy (Vercel + Neon/Supabase)
- Diffing between versions
- Persian/RTL localization — deliberately scoped out of v1

---

*Built by [Nima Rahimi Jahandide](https://github.com/NimaRahimiJahandide).*
