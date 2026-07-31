/**
 * test-cancel-v2.mjs
 * Cancel faster (500ms) and log more details.
 */

const BASE = 'http://localhost:3456';
const COOKIE = 'session=test-user-001';

async function main() {
  console.log('Starting generate request...');
  const startTime = Date.now();
  
  const genPromise = fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': COOKIE },
    body: JSON.stringify({ postId: 'test-post-001' }),
  });

  const response = await genPromise;
  const logId = response.headers.get('x-generation-log-id');
  const elapsed = Date.now() - startTime;
  console.log(`LogId: ${logId} (${elapsed}ms after request)`);
  
  if (!logId) {
    console.error('No logId! Status:', response.status);
    console.error('Body:', await response.text());
    return;
  }

  // Read stream in background
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;
  let streamFinished = false;
  
  const readStream = (async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        const tokens = text.match(/event: token/g);
        tokenCount += tokens ? tokens.length : 0;
        if (!streamFinished) {
          process.stdout.write(`\rTokens: ${tokenCount} (${Date.now() - startTime}ms)`);
        }
      }
    } catch (e) {
      console.log(`\nStream error (expected after cancel): ${e.message}`);
    }
    streamFinished = true;
    console.log(`\nStream ended. Total tokens: ${tokenCount}`);
  })();

  // Cancel after just 500ms
  console.log('\nWaiting 500ms before cancel...');
  await new Promise(r => setTimeout(r, 500));
  
  const cancelTime = Date.now() - startTime;
  console.log(`\nSending cancel at ${cancelTime}ms...`);
  
  const cancelResponse = await fetch(`${BASE}/api/generate/${logId}/cancel`, {
    method: 'POST',
    headers: { 'Cookie': COOKIE },
  });
  
  const cancelBody = await cancelResponse.json();
  const cancelElapsed = Date.now() - startTime;
  console.log(`Cancel response (${cancelElapsed}ms): ${JSON.stringify(cancelBody)}`);
  
  // Wait for stream to finish
  await readStream;
  
  console.log(`\nTotal time: ${Date.now() - startTime}ms`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
