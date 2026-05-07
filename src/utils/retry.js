const logger = require('../logger');

/**
 * Retry an async function up to maxAttempts times with exponential backoff.
 * Delays: 1s → 2s → 4s (doubles each attempt).
 *
 * @param {Function} fn - async function to retry
 * @param {Object} opts
 * @param {string} opts.label - log prefix (e.g. '[sheets]')
 * @param {number} [opts.maxAttempts=3]
 * @param {number} [opts.baseDelayMs=1000]
 * @returns {Promise<*>} resolves with fn's return value
 */
async function retry(fn, { label = '[retry]', maxAttempts = 3, baseDelayMs = 1000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`${label} Attempt ${attempt}/${maxAttempts} failed: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw lastErr;
}

module.exports = { retry };
