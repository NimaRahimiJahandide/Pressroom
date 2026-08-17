/**
 * POST /api/export/docx
 * =======================
 * Server-side DOCX export. The client sends the editor's raw HTML and the
 * post title; this route wraps it in a full HTML document, converts it via
 * `html-to-docx`, and returns the .docx as a downloadable file.
 *
 * `html-to-docx` is a Node.js-oriented package (depends on `fs` and
 * optionally `encoding`) — it cannot run in the browser. Keeping it
 * server-side via `runtime = 'nodejs'` avoids webpack bundling errors.
 */

import { NextRequest, NextResponse } from 'next/server';
import htmlToDocx from 'html-to-docx';

export const runtime = 'nodejs';

// ==========================================
// Filename sanitizer
// ==========================================
// Same logic as the client-side version in BlogEditor.tsx — duplicated
// here because it's a ~5-line pure function and the two sides should
// never disagree on the filename.
function sanitizeFilename(title: string): string {
  const cleaned = title
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return cleaned || 'pressroom-draft';
}

// Minimal HTML escaper for the title injected into the DOCX wrapper.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(request: NextRequest) {
  // ─── Auth ───
  const { getServerSession } = await import('@/lib/auth');
  const session = await getServerSession();

  if (!session?.userId) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  // ─── Body validation ───
  const body = await request.json().catch(() => null);

  if (
    !body ||
    typeof body.html !== 'string' ||
    body.html.trim().length === 0 ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0
  ) {
    return NextResponse.json({ error: 'MISSING_FIELDS' }, { status: 400 });
  }

  const { html, title } = body as { html: string; title: string };

  // ─── Convert ───
  // Wrap the editor HTML in a minimal document with the post title as an
  // h1, so the exported file reads as a titled document.
  const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><h1>${escapeHtml(title)}</h1>${html}</body></html>`;

  try {
    const blob = await htmlToDocx(fullHtml, undefined, {
      table: { row: { cantSplit: true } },
    });

    const filename = sanitizeFilename(title);

    return new Response(blob, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}.docx"`,
      },
    });
  } catch (error: unknown) {
    console.error('[POST /api/export/docx] Conversion failed:', error);
    return NextResponse.json({ error: 'EXPORT_FAILED' }, { status: 500 });
  }
}
