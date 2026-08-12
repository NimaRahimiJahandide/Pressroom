/**
 * test-version-routes.cjs
 * Guard checks for the version-history routes: auth, ownership, and the
 * GENERATING block. Uses a stub Prisma + session (no DB, no server).
 *
 *   node test-output/test-version-routes.cjs
 */
const Module = require('module');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'vroutes-'));

// ── stubs ────────────────────────────────────────────────────────────────
let session = null;
let db = null;

const stubs = {
  '@/lib/auth': { getServerSession: async () => session },
  '@/lib/prisma': {
    prisma: {
      blogPost: {
        findFirst: async ({ where }) =>
          db.post && db.post.id === where.id && db.post.userId === where.userId ? db.post : null,
        update: async () => {},
      },
      contentVersion: {
        findMany: async () => db.versions,
        findFirst: async ({ where }) => {
          const v = db.versions.find((x) => x.id === where.id);
          if (!v) return null;
          // restore route filters by postId; the PATCH route filters by post.userId
          if (where.postId !== undefined && v.postId !== where.postId) return null;
          if (where.post?.userId !== undefined && db.post.userId !== where.post.userId) return null;
          return v;
        },
        update: async () => {},
        updateMany: async () => {},
      },
      $transaction: async (ops) => Promise.all(ops),
    },
  },
  'next/server': {
    NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) },
  },
};

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (stubs[request]) return request;
  return origResolve.call(this, request, ...rest);
};
for (const [id, exports] of Object.entries(stubs)) {
  require.cache[id] = { id, filename: id, loaded: true, exports };
}

// ── compile the routes under test to CJS ─────────────────────────────────
function load(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const file = path.join(OUT, `${relPath.replace(/[\\/\[\]]/g, '_')}.js`);
  fs.writeFileSync(file, js);
  return require(file);
}

const list = load('src/app/api/posts/[postId]/versions/route.ts');
const restore = load('src/app/api/posts/[postId]/versions/[versionId]/restore/route.ts');
const patch = load('src/app/api/content-version/[versionId]/route.ts');

const req = (body) => ({ json: async () => body });
const OWNER = { userId: 'user-1' };
const fresh = () => {
  db = {
    post: { id: 'post-1', userId: 'user-1', status: 'COMPLETED' },
    versions: [
      { id: 'v2', postId: 'post-1', versionNumber: 2, isCurrent: true, createdAt: new Date(), content: 'second draft here', format: 'MARKDOWN' },
      { id: 'v1', postId: 'post-1', versionNumber: 1, isCurrent: false, createdAt: new Date(), content: '# Title\n\nfirst draft body', format: 'MARKDOWN' },
    ],
  };
};

(async () => {
  // ── GET versions ──
  fresh();
  session = null;
  assert.strictEqual((await list.GET({}, { params: { postId: 'post-1' } })).status, 401, 'GET without session must 401');

  session = { userId: 'someone-else' };
  assert.strictEqual((await list.GET({}, { params: { postId: 'post-1' } })).status, 404, "another user's post must 404, not 403");

  session = OWNER;
  const listed = await list.GET({}, { params: { postId: 'post-1' } });
  assert.strictEqual(listed.status, 200);
  assert.deepStrictEqual(listed.body.map((v) => v.versionNumber), [2, 1], 'newest versionNumber first');
  assert.ok(!('content' in listed.body[0]), 'list must not include full content');
  assert.strictEqual(listed.body[1].wordCount, 5, 'wordCount counts words, not whitespace runs');
  assert.ok(!/[#\n]/.test(listed.body[1].preview), 'preview is plain text');

  // ── POST restore ──
  fresh();
  session = null;
  assert.strictEqual((await restore.POST({}, { params: { postId: 'post-1', versionId: 'v1' } })).status, 401, 'restore without session must 401');

  session = { userId: 'someone-else' };
  assert.strictEqual((await restore.POST({}, { params: { postId: 'post-1', versionId: 'v1' } })).status, 404, "restore on another user's post must 404");

  session = OWNER;
  db.post.status = 'GENERATING';
  const midStream = await restore.POST({}, { params: { postId: 'post-1', versionId: 'v1' } });
  assert.strictEqual(midStream.status, 409, 'restore mid-generation must 409');
  assert.strictEqual(midStream.body.error, 'GENERATION_IN_PROGRESS');

  db.post.status = 'COMPLETED';
  assert.strictEqual(
    (await restore.POST({}, { params: { postId: 'post-1', versionId: 'v-elsewhere' } })).status,
    404,
    "a version that isn't on this post must 404",
  );

  const restored = await restore.POST({}, { params: { postId: 'post-1', versionId: 'v1' } });
  assert.strictEqual(restored.status, 200);
  assert.deepStrictEqual(
    { id: restored.body.id, versionNumber: restored.body.versionNumber },
    { id: 'v1', versionNumber: 1 },
  );
  assert.strictEqual(restored.body.content, db.versions[1].content, 'restore returns content for the editor');

  // ── PATCH content-version (the bug fix) ──
  fresh();
  session = null;
  assert.strictEqual((await patch.PATCH(req({ content: 'x' }), { params: { versionId: 'v1' } })).status, 401, 'PATCH without session must 401');

  session = { userId: 'someone-else' };
  assert.strictEqual((await patch.PATCH(req({ content: 'x' }), { params: { versionId: 'v1' } })).status, 404, "PATCH on another user's version must 404");

  session = OWNER;
  assert.strictEqual((await patch.PATCH(req({}), { params: { versionId: 'v1' } })).status, 400, 'PATCH still validates content');
  assert.strictEqual((await patch.PATCH(req({ content: 'x' }), { params: { versionId: 'v1' } })).status, 200, 'owner can PATCH');

  fs.rmSync(OUT, { recursive: true, force: true });
  console.log('ok — all version route guards pass');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
