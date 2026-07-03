/**
 * watchanimeworld.net — Stream Extractor
 *
 * Parses HTML with cheerio to locate playable video URLs.
 * Every cheerio selector is marked with a ⚡ comment so you can
 * find-and-replace them when the site layout changes.
 */

import { fetchPage, fetchText, HEADERS, BASE_URL } from './http.js';
import cheerio from 'cheerio-without-node-native';

// ──────────────────────────────────────────────────────────────
//  SELECTORS — update these when the site HTML changes.
// ──────────────────────────────────────────────────────────────

/**
 * Search results page.
 * The search form typically submits to /search (or /search.html).
 * Results are rendered as <a> links inside a container.
 *
 * ⚡ UPDATE: Change this selector if the search result card layout changes.
 */
const SEL_SEARCH_RESULT_LINK = '.search-results a, .result-item a, .post-item a';
const SEL_SEARCH_RESULT_TITLE = 'h2, h3, .title, .post-title';
const SEL_SEARCH_RESULT_HREF  = '';          // left empty → uses $(el).attr('href')

/**
 * Anime detail / episode-listing page.
 * Individual episode entries are links inside a list container.
 *
 * ⚡ UPDATE: Change if the episode list markup changes.
 */
const SEL_EPISODE_LINK = '.ep-list > a, .episode-list a, .episodes a, .listing a';

/**
 * Video player page — the embedded source URL.
 *
 * ⚡ UPDATE: Change if the player markup changes.
 * Common patterns:
 *   - $('#player source').attr('src')
 *   - $('#player').attr('data-src')
 *   - $('iframe').attr('src')
 *   - script block containing a m3u8 / mp4 URL
 */
const SEL_VIDEO_SRC_DIRECT = '#player source, video source';
const ATTR_VIDEO_SRC_DIRECT = 'src';

const SEL_PLAYER_EMBED = '#player';
const ATTR_PLAYER_EMBED = 'data-src';

const SEL_IFRAME = 'iframe.embed-player, iframe.video-player, .video iframe';

/**
 * Quality badge text next to each server / source button.
 *
 * ⚡ UPDATE: Change if quality labels move or rename.
 */
const SEL_QUALITY_BADGE = '.quality-badge, .server-quality, .label-quality';

/**
 * Title text on the detail page (used to confirm we found the right anime).
 *
 * ⚡ UPDATE: Change if the page title element changes.
 */
const SEL_DETAIL_TITLE = 'h1.post-title, h1.entry-title, h1.anime-title, .anime-info h1';

// ──────────────────────────────────────────────────────────────
//  URL PATTERNS — update when routing changes.
// ──────────────────────────────────────────────────────────────

/**
 * ⚡ UPDATE: The URL pattern for a search query.
 * Common patterns: "/search/{query}", "/?s={query}", "/search?q={query}"
 */
function searchUrl(query) {
  return '/search/' + encodeURIComponent(query);
}

/**
 * ⚡ UPDATE: The URL pattern for an episode page.
 * Common patterns:
 *   "/watch/{slug}-episode-{number}"
 *   "/episode/{slug}/{season}-{episode}"
 *   "/{slug}/episode-{number}"
 */
function episodeUrl(slug, season, episode) {
  if (season && season > 1) {
    return '/' + slug + '/season-' + season + '-episode-' + episode;
  }
  return '/' + slug + '-episode-' + episode;
}

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * Normalise a slug from an anime title:
 *   "Naruto Shippūden" → "naruto-shippuden"
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Try to parse a quality label (1080p, 720p, 480p, CAM, etc.) from text.
 * Returns a clean string or null.
 */
function parseQuality(raw) {
  if (!raw) return null;
  var match = raw.match(/\b(4K|2160p|1080p|720p|480p|360p|CAM|HD|SD|FHD)\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Look for a direct .m3u8 / .mp4 URL anywhere in the page HTML
 * (handles cases where the URL is embedded in inline JS).
 */
function extractUrlFromScripts(html) {
  // ⚡ UPDATE: If the site obfuscates URLs with a different pattern, add regexes here.
  var patterns = [
    /["'](https?:\/\/[^\s"']+\.(m3u8|mp4))["']/i,
    /file\s*:\s*["'](https?:\/\/[^\s"']+)["']/i,
    /source\s*:\s*["'](https?:\/\/[^\s"']+)["']/i,
    /video_url\s*=\s*["'](https?:\/\/[^\s"']+)["']/i,
    /data-url\s*=\s*["'](https?:\/\/[^\s"']+)["']/i,
  ];
  for (var i = 0; i < patterns.length; i++) {
    var m = html.match(patterns[i]);
    if (m) return m[1];
  }
  return null;
}

/**
 * Extract stream URLs from an iframe src (e.g. a third-party embed).
 * Returns the iframe URL — the Nuvio player may be able to resolve it,
 * or you can add a secondary extraction step here.
 */
function extractFromIframe($) {
  var src = $(SEL_IFRAME).attr('src');
  if (src) {
    // Make absolute if relative
    if (src.startsWith('/')) {
      src = BASE_URL + src;
    }
    return src;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
//  MAIN PIPELINE
// ──────────────────────────────────────────────────────────────

/**
 * Step 1 — Search the site for an anime by title.
 *
 * @param {string} title  - Anime name to search for.
 * @returns {Promise<{slug: string, title: string, detailUrl: string}|null>}
 */
async function searchAnime(title) {
  var html = await fetchPage(searchUrl(title));
  var $ = cheerio.load(html);

  var result = null;
  $(SEL_SEARCH_RESULT_LINK).each(function () {
    var el = $(this);
    var link = el.attr('href') || '';
    var name = el.find(SEL_SEARCH_RESULT_TITLE).text().trim() || el.text().trim();

    if (!name) return;

    // Basic fuzzy match — the first result is usually the best hit
    // ⚡ UPDATE: Tighten this heuristic if the site returns noisy results.
    var normalisedName = name.toLowerCase();
    var normalisedQuery = title.toLowerCase();
    if (normalisedName.indexOf(normalisedQuery) !== -1 ||
        normalisedQuery.indexOf(normalisedName.split(/[:\-(]/)[0].trim()) !== -1) {
      result = {
        slug: link.replace(/^\/|\/$/g, '').split('/').pop(),
        title: name,
        detailUrl: link.startsWith('http') ? link : BASE_URL + link,
      };
      return false; // break the loop
    }
  });

  if (!result) {
    console.log('[watchanimeworld] No search result matched "' + title + '"');
  }
  return result;
}

/**
 * Step 2 — Fetch the anime detail page and return the URL for
 *          a specific season × episode.
 *
 * @param {string} detailUrl - Full URL to the anime's page.
 * @param {number|null} season
 * @param {number|null} episode
 * @returns {Promise<string|null>} - URL of the episode page.
 */
async function resolveEpisodePage(detailUrl, season, episode) {
  var html = await fetchText(detailUrl);
  var $ = cheerio.load(html);

  // Try the direct URL-construction approach first (no second request).
  var slug = detailUrl
    .replace(BASE_URL, '')
    .replace(/^\/|\/$/g, '')
    .split('/')[0];
  var constructed = episodeUrl(slug, season, episode);

  console.log('[watchanimeworld] Trying constructed URL: ' + constructed);

  // Verify the episode link actually exists on the detail page.
  var found = false;
  $(SEL_EPISODE_LINK).each(function () {
    var href = $(this).attr('href') || '';
    // Match by episode number in the href
    var epNum = String(episode);
    if (href.indexOf(epNum) !== -1) {
      found = true;
      // If the site uses a different slug pattern, use the actual href instead.
      constructed = href.startsWith('http') ? href : BASE_URL + href;
      return false; // break
    }
  });

  if (!found) {
    console.log('[watchanimeworld] Episode ' + episode + ' not found in listing, ' +
                'falling back to constructed URL: ' + constructed);
  }

  return BASE_URL + constructed;
}

/**
 * Step 3 — Extract the actual video stream URL(s) from an episode page.
 *
 * @param {string} episodePageUrl - Full URL of the episode/player page.
 * @returns {Promise<Array<{name:string, title:string, url:string, quality:string, headers:object}>>}
 */
async function extractStreamsFromPage(episodePageUrl) {
  var html = await fetchText(episodePageUrl);
  var $ = cheerio.load(html);
  var streams = [];

  // ── Strategy A: Direct <source> tag inside a <video> / #player ──
  var directSrc = $(SEL_VIDEO_SRC_DIRECT).attr(ATTR_VIDEO_SRC_DIRECT);
  if (directSrc) {
    var quality = parseQuality($(SEL_QUALITY_BADGE).first().text()) || 'AUTO';
    streams.push({
      name: 'watchanimeworld',
      title: quality + ' — Direct',
      url: directSrc,
      quality: quality,
      headers: HEADERS,
    });
  }

  // ── Strategy B: data-src attribute on the player div ──
  if (streams.length === 0) {
    var embedSrc = $(SEL_PLAYER_EMBED).attr(ATTR_PLAYER_EMBED);
    if (embedSrc) {
      var qualityB = parseQuality($(SEL_QUALITY_BADGE).first().text()) || 'AUTO';
      streams.push({
        name: 'watchanimeworld',
        title: qualityB + ' — Embed',
        url: embedSrc,
        quality: qualityB,
        headers: HEADERS,
      });
    }
  }

  // ── Strategy C: Iframe embed (third-party player) ──
  if (streams.length === 0) {
    var iframeUrl = extractFromIframe($);
    if (iframeUrl) {
      streams.push({
        name: 'watchanimeworld',
        title: 'Embed Player',
        url: iframeUrl,
        quality: 'AUTO',
        headers: HEADERS,
      });
    }
  }

  // ── Strategy D: Regex scan of inline <script> blocks ──
  if (streams.length === 0) {
    var scriptUrl = extractUrlFromScripts(html);
    if (scriptUrl) {
      var inferredQuality = 'AUTO';
      if (scriptUrl.indexOf('.m3u8') !== -1) {
        inferredQuality = 'AUTO'; // HLS — quality determined by manifest
      }
      streams.push({
        name: 'watchanimeworld',
        title: inferredQuality + ' — Script Extract',
        url: scriptUrl,
        quality: inferredQuality,
        headers: HEADERS,
      });
    }
  }

  // ── Strategy E: Multiple server buttons (some sites list VidSrc, Mega, etc.) ──
  // ⚡ UPDATE: Add selectors for server-list buttons if the site provides multiple servers.
  // Example:
  // $('.server-item a').each(function () { ... });

  if (streams.length === 0) {
    console.log('[watchanimeworld] No streams found on: ' + episodePageUrl);
  }

  return streams;
}

// ──────────────────────────────────────────────────────────────
//  PUBLIC API
// ──────────────────────────────────────────────────────────────

/**
 * Full extraction pipeline: search → resolve episode → extract streams.
 *
 * @param {string} title          - Anime title (used for site search).
 * @param {string} mediaType      - "movie" or "tv".
 * @param {number|null} season    - Season number (1-based).
 * @param {number|null} episode   - Episode number (1-based).
 * @returns {Promise<Array>}      - Array of stream objects.
 */
async function extractStreams(title, mediaType, season, episode) {
  // Step 1 — Search
  var searchResult = await searchAnime(title);
  if (!searchResult) {
    console.log('[watchanimeworld] Search returned no results for: ' + title);
    return [];
  }

  console.log('[watchanimeworld] Found: ' + searchResult.title +
              ' → ' + searchResult.detailUrl);

  // Movies: no season/episode — use the detail page directly
  if (mediaType === 'movie') {
    return await extractStreamsFromPage(searchResult.detailUrl);
  }

  // TV: resolve the specific episode
  if (episode == null) {
    console.log('[watchanimeworld] No episode specified for TV media');
    return [];
  }

  var epUrl = await resolveEpisodePage(searchResult.detailUrl, season, episode);
  return await extractStreamsFromPage(epUrl);
}

export { extractStreams, searchAnime, resolveEpisodePage, extractStreamsFromPage };