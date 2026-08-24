/**
 * test-version-panel.cjs
 * Renders the version history panel in its four states (loading, empty,
 * one version, restorable) and asserts the markup for each.
 *
 *   node test-output/test-version-panel.cjs
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ts = require('typescript');
const assert = require('assert');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vpanel-'));

// ── stubs: everything the page imports except the panel itself ───────────
let versionsResult = { isLoading: true };
let phase = 'completed';
let postResult = { isLoading: true, data: undefined, error: null };

const stubs = {
  '@tanstack/react-query': {
    QueryClient: class {},
    QueryClientProvider: ({ children }) => children,
  },
  // Default-exported modules need the `default` key: the CJS output reads
  // next_link_1.default, not the module object itself.
  'next/link': { default: ({ children, ...p }) => React.createElement('a', p, children) },
  '@/components/BlogEditor': { BlogEditor: () => React.createElement('div', { id: 'editor' }) },
  '@/stores/generationStore': {
    useGenerationStore: (sel) => sel({ phase }),
  },
  '@/hooks/useVersions': {
    useVersions: () => versionsResult,
    useRestoreVersion: () => ({ isPending: false, variables: undefined, error: null, mutateAsync: async () => {} }),
    usePost: () => postResult,
  },
  // The compiled file lives in a temp dir, so hand it react explicitly.
  react: React,
  'react/jsx-runtime': require('react/jsx-runtime'),
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return request;
  return origResolve.call(this, request, ...rest);
};
for (const [id, exports] of Object.entries(stubs)) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
stubs['@/stores/generationStore'].useGenerationStore.setState = () => {};
stubs['@/stores/generationStore'].useGenerationStore.getState = () => ({ reset() {} });

const src = fs.readFileSync(path.join(ROOT, 'src/app/posts/[postId]/page.tsx'), 'utf8');
// jsx: ReactJSX (not React) — the page never imports React itself, so the
// classic runtime would emit unresolved React.createElement calls.
const js = ts.transpileModule(src, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const file = path.join(OUT, 'page.js');
fs.writeFileSync(file, js);
const Page = require(file).default;

const render = () => renderToStaticMarkup(React.createElement(Page, { params: { postId: 'post-1' } }));

const version = (n, isCurrent) => ({
  id: `v${n}`,
  versionNumber: n,
  isCurrent,
  createdAt: new Date().toISOString(),
  wordCount: 120 * n,
  preview: `preview of draft ${n}`,
});

// The panel is behind the History toggle, so the closed state comes first.
const closed = render();
assert.ok(!closed.includes('Version history'), 'panel is hidden until History is pressed');
assert.ok(closed.includes('History'), 'History toggle always rendered');

// Re-render with the panel open. The History toggle is a client
// interaction, so seed it instead: historyOpen is the only useState(false)
// on the page, so returning true for that one call opens the panel.
const realUseState = React.useState;
React.useState = function (init) {
  return realUseState(init === false ? true : init);
};

const cases = [
  { name: 'loading', data: { isLoading: true }, expect: 'Loading versions' },
  { name: 'empty', data: { isLoading: false, data: [] }, expect: 'No versions yet' },
  { name: 'single version', data: { isLoading: false, data: [version(1, true)] }, expect: 'Version 1' },
  { name: 'multi version', data: { isLoading: false, data: [version(2, true), version(1, false)] }, expect: 'Version 2' },
  { name: 'error', data: { isLoading: false, error: new Error('boom') }, expect: 'Could not load version history' },
];

for (const c of cases) {
  versionsResult = c.data;
  const html = render();
  assert.ok(html.includes('Version history'), `${c.name}: panel is open`);
  assert.ok(html.includes(c.expect), `${c.name}: expected "${c.expect}"`);
  if (c.name === 'single version') {
    assert.ok(html.includes('Current'), 'the only version still gets the Current badge');
    assert.ok(!html.includes('No versions yet'), 'one version is not an empty state');
  }
  if (c.name === 'multi version') {
    assert.strictEqual((html.match(/>\s*Current\s*</g) ?? []).length, 1, 'exactly one Current badge');
  }
}

// Restore is offered only for a selected non-current version, and never
// while the post is generating. selectedId is the only useState(null), so
// seeding that one simulates a click on version 1.
versionsResult = { isLoading: false, data: [version(2, true), version(1, false)] };
assert.ok(!render().includes('Restore this version'), 'restore hidden until a version is selected');

React.useState = function (init) {
  if (init === false) return realUseState(true);
  if (init === null) return realUseState('v1');
  return realUseState(init);
};
assert.ok(render().includes('Restore this version'), 'restore offered for a selected older version');

// Selecting the current version must not offer a restore.
React.useState = function (init) {
  if (init === false) return realUseState(true);
  if (init === null) return realUseState('v2');
  return realUseState(init);
};
assert.ok(!render().includes('Restore this version'), 'no restore for the version already current');

React.useState = function (init) {
  if (init === false) return realUseState(true);
  if (init === null) return realUseState('v1');
  return realUseState(init);
};
phase = 'generating';
assert.ok(!render().includes('Restore this version'), 'restore hidden while generating');

React.useState = realUseState;
fs.rmSync(OUT, { recursive: true, force: true });
console.log('ok — panel renders correctly in every state');
