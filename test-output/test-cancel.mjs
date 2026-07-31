/**
 * test-cancel.mjs
 * Starts a generate request and cancels it mid-stream.
 * Uses Node.js fetch (built-in) for parallel requests.
 */

const BASE = 'http://localhost:3456';
const COOKIE = 'session=test-user-001';

async function main() {
  console.log('Starting generate request...');
  
  // Start the generate request as a fetch with streaming response
  const genPromise = fetch(`${BASE}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': COOKIE,
    },
    body: JSON.stringify({ postId: 'test-post-001' }),
  });

  const response = await genPromise;
  
  // Get logId from headers
  const logId = response.headers.get('x-generation-log-id');
  console.log('LogId:', logId);
  
  if (!logId) {
    console.error('No logId found! Status:', response.status);
    const text = await response.text();
    console.error('Response:', text);
    return;
  }

  // Start reading the stream in background (don't await)
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let tokenCount = 0;
  let cancelled = false;
  
  const readStream = (async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      const tokens = text.match(/event: token/g);
      tokenCount += tokens ? tokens.length : 0;
      if (!cancelled) {
        process.stdout.write(`\rTokens received: ${tokenCount}`);
      }
    }
    console.log(`\nStream ended. Total tokens: ${tokenCount}`);
  })();

  // Wait a short time, then cancel
  console.log('Waiting 1.5s before cancel...');
  await new Promise(r => setTimeout(r, 1500));
  
  console.log(`\nSending cancel request for logId: ${logId}`);
  cancelled = true;
  
  const cancelResponse = await fetch(`${BASE}/api/generate/${logId}/cancel`, {
    method: 'POST',
    headers: { 'Cookie': COOKIE },
  });
  
  const cancelBody = await cancelResponse.json();
  console.log('Cancel response:', JSON.stringify(cancelBody));
  
  // Wait for stream to finish reading
  await readStream;
  console.log('Done.');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
