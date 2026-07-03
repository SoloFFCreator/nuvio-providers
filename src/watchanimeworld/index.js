/**
 * watchanimeworld.net — Nuvio Provider Entry Point
 *
 * Orchestrates the full pipeline:
 *   TMDB ID → title lookup → search → episode resolution → stream extraction
 *
 * Build with:  node build.js watchanimeworld
 * Output:      providers/watchanimeworld.js
 */

import { fetchText, BASE_URL } from './http.js';
import { extractStreams } from './extractor.js';
import cheerio from 'cheerio-without-node-native';

// ──────────────────────────────────────────────────────────────
//  TMDB → TITLE RESOLVER
//
//  Nuvio only sends a TMDB ID. We resolve it to a human-readable
//  title via the public TMDB API so the on-site search can match it.
// ──────────────────────────────────────────────────────────────

var TMDB_API = 'https://api.themoviedb.org/3';
var TMDB_KEY = ''; // ⚡ SET YOUR TMDB API KEY HERE (or rely on in-app fallback)

/**
 * Fetch the display title for a TMDB ID.
 * Tries the TMDB API first; falls back to a Google search scrape
 * if no API key is configured.
 *
 * @param {string} tmdbId
 * @param {string} mediaType  - "movie" or "tv"
 * @returns {Promise<string>} - e.g. "Naruto Shippuden"
 */
async function resolveTitle(tmdbId, mediaType) {
  // ── Path A: TMDB API (recommended) ──
  if (TMDB_KEY) {
    try {
      var endpoint = mediaType === 'movie' ? 'movie' : 'tv';
      var url = TMDB_API + '/' + endpoint + '/' + tmdbId +
                '?api_key=' + TMDB_KEY + '&language=en-US';
      var json = JSON.parse(await fetchText(url));
      return json.title || json.name || '';
    } catch (e) {
      console.log('[watchanimeworld] TMDB lookup failed: ' + e.message);
    }
  }

  // ── Path B: Scrape TMDB's public page (no key needed) ──
  try {
    var typePath = mediaType === 'movie' ? 'movie' : 'tv';
    var pageUrl = 'https://www.themoviedb.org/' + typePath + '/' + tmdbId;
    var html = await fetchText(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
                       'AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    var $ = cheerio.load(html);
    var title = $('h2 a').text().trim() ||
                $('h1').text().trim() ||
                $('title').text().trim().split(' | ')[0].split(' — ')[0];
    if (title) return title;
  } catch (e) {
    console.log('[watchanimeworld] TMDB page scrape failed: ' + e.message);
  }

  // ── Path C: Fallback — construct a slug directly from the ID ──
  // This will only work if the target site uses TMDB IDs in its URLs.
  console.log('[watchanimeworld] Could not resolve title for TMDB ' + tmdbId);
  return '';
}

// ──────────────────────────────────────────────────────────────
//  NUvio ENTRY POINT
// ──────────────────────────────────────────────────────────────

/**
 * Main function called by the Nuvio app.
 *
 * @param {string}      tmdbId    - TMDB ID (e.g. "550")
 * @param {string}      mediaType - "movie" or "tv"
 * @param {number|null} season    - Season number (1-based), null for movies
 * @param {number|null} episode   - Episode number (1-based), null for movies
 * @returns {Promise<Array>}      - Array of stream objects for the player.
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    console.log('[watchanimeworld] Request: ' + mediaType + ' / ' +
                tmdbId + ' / S' + (season || '?') + 'E' + (episode || '?'));

    // 1. Resolve TMDB ID → human-readable title
    var title = await resolveTitle(tmdbId, mediaType);
    if (!title) {
      console.log('[watchanimeworld] Aborting — could not resolve title');
      return [];
    }
    console.log('[watchanimeworld] Resolved title: ' + title);

    // 2. Delegate to the extractor pipeline (search → episode → streams)
    var streams = await extractStreams(title, mediaType, season, episode);

    console.log('[watchanimeworld] Returning ' + streams.length + ' stream(s)');
    return streams;
  } catch (error) {
    console.error('[watchanimeworld] Fatal: ' + error.message);
    return [];
  }
}

module.exports = { getStreams };