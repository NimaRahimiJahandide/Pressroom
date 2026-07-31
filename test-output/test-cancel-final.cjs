/**
 * test-cancel-final.cjs
 * 3 cancel repetitions with different delays.
 * Logs everything: tokens received, cancel response, DB state.
 */
const { PrismaClient } = require('@prisma/client');

const BASE = 'http://localhost:3456';
const COOKIE = 'session=test-user-001';
const POST_ID = 'test-post-001';
const DELAYS = [300, 800, 1500]; // ms before sending cancel

const prisma = new PrismaClient();

async function resetPost() {
  await prisma.blogPost.update({
    where: { id: POST_ID },
    data: { status: 'DRAFT', finalContent: null, wordCount: 0 },
  });
  await prisma.generationLog.deleteMany({ where: { postId: POST_ID } });
  await prisma.contentVersion.deleteMany({ where: { postId: POST_ID } });
}

async function runCancelTest(delayMs, attemptNum) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`ATTEMPT ${attemptNum}: cancel after ${delayMs}ms`);
  console.log('='.repeat(60));

  await resetPost();
  const startTime = Date.now();

  // Start generate
  const response = await fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIE },
    body: JSON.stringify({ postId: POST_ID }),
  });

  const logId = response.headers.get('x-generation-log-id');
  const headerTime = Date.now() - startTime;
  console.log(`LogId: ${logId} (${headerTime}ms after request start)`);

  // Read stream in background
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;

  const readStream = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const tokens = text.match(/event: token/g);
        tokenCount += tokens ? tokens.length : 0;
      }
    } catch (e) {
      console.log(`  Stream read error: ${e.message}`);
    }
  })();

  // Wait for delay, then cancel
  await new Promise(r => setTimeout(r, delayMs));

  const cancelTime = Date.now() - startTime;
  console.log(`\n  Sending cancel at ${cancelTime}ms...`);

  let cancelStatus, cancelBody;
  try {
    const cancelResp = await fetch(`${BASE}/api/generate/${logId}/cancel`, {
      method: 'POST',
      headers: { 'Cookie': COOKIE },
    });
    cancelStatus = cancelResp.status;
    cancelBody = await cancelResp.json();
  } catch (e) {
    cancelStatus = 'ERROR';
    cancelBody = { error: e.message };
  }

  console.log(`  Cancel response: HTTP ${cancelStatus} — ${JSON.stringify(cancelBody)}`);

  // Wait for stream to finish
  await readStream;
  const totalTime = Date.now() - startTime;
  console.log(`  Tokens received: ${tokenCount} (${totalTime}ms total)`);

  // Check DB state
  await new Promise(r => setTimeout(r, 500)); // wait for fire-and-forget tx
  const log = await prisma.generationLog.findFirst({ orderBy: { createdAt: 'desc' } });
  const post = await prisma.blogPost.findUnique({ where: { id: POST_ID } });
  const versions = await prisma.contentVersion.count({ where: { postId: POST_ID } });

  console.log(`\n  === DB STATE ===`);
  console.log(`  GenerationLog.status:      ${log?.status}`);
  console.log(`  GenerationLog.abortReason: ${log?.abortReason}`);
  console.log(`  GenerationLog.errorCode:   ${log?.errorCode}`);
  console.log(`  BlogPost.status:           ${post?.status}`);
  console.log(`  ContentVersions count:     ${versions}`);

  const passed = log?.status === 'CANCELLED' && log?.abortReason === 'USER_CANCELLED' && post?.status === 'CANCELLED';
  console.log(`\n  RESULT: ${passed ? '✅ PASS' : '❌ FAIL'}`);

  return { attemptNum, delayMs, tokenCount, cancelStatus, cancelBody, logStatus: log?.status, abortReason: log?.abortReason, postStatus: post?.status, passed };
}

async function main() {
  const results = [];
  for (let i = 0; i < DELAYS.length; i++) {
    const r = await runCancelTest(DELAYS[i], i + 1);
    results.push(r);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  for (const r of results) {
    console.log(`#${r.attemptNum} (${r.delayMs}ms): ${r.passed ? '✅' : '❌'} tokens=${r.tokenCount} log=${r.logStatus} abort=${r.abortReason} post=${r.postStatus}`);
  }
}

main().finally(() => prisma.$disconnect());
