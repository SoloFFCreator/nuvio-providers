/**
 * watchanimeworld.net — HTTP Utilities
 *
 * Wraps fetch with site-specific headers to mimic a real browser session.
 * Update BASE_URL if the domain changes.
 */

// ──────────────────────────────────────────────────────────────
// UPDATE THIS if the site moves to a new domain.
// ──────────────────────────────────────────────────────────────
const BASE_URL = 'https://watchanimeworld.top';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':
    'text/html,application/xhtml+xml,application/xml;q=0.9,' +
    'image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE_URL + '/',
  'X-Requested-With': 'XMLHttpRequest',
};

/**
 * Perform a GET request and return the response body as text.
 *
 * @param {string} url   - Fully-qualified URL to fetch.
 * @param {object} [extra={}]  - Extra options merged into the fetch call
 *                              (e.g. { headers: { 'Cookie': '...' } }).
 * @returns {Promise<string>}  - Response body text.
 */
async function fetchText(url, extra) {
  var opts = Object.assign({ headers: Object.assign({}, HEADERS) }, extra || {});
  if (extra && extra.headers) {
    Object.assign(opts.headers, extra.headers);
  }

  console.log('[watchanimeworld] GET ' + url);

  var res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error('HTTP ' + res.status + ' for ' + url);
  }
  return await res.text();
}

/**
 * Shorthand: fetch text relative to BASE_URL.
 * @param {string} path - e.g. "/search?q=naruto"
 * @param {object} [extra]
 * @returns {Promise<string>}
 */
function fetchPage(path, extra) {
  return fetchText(BASE_URL + path, extra);
}

export { BASE_URL, HEADERS, fetchText, fetchPage };