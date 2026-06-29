// Minimal retry helper: retry an async fn a few times with a short backoff.
async function retry(fn, attempts = 3, delayMs = 800) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
module.exports = { retry };
