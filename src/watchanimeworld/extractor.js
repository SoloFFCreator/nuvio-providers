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
const SEL_SEARCH_RESULT_LINK = '.result-item a, .post-item a, article a';
const SEL_SEARCH_RESULT_TITLE = 'h2, h3, .title, .post-title';
const SEL_SEARCH_RESULT_HREF  = '';

/**
 * Anime detail / episode-listing page.
 * Individual episode entries are links inside a list container.
 *
 * ⚡ UPDATE: Change if the episode list markup changes.
 */
const SEL_EPISODE_LINK = '.list-episodes a, .episodes-list a, .ep-list a, .episode-list a, a[href*="/episode/"]';

/**
 * Video player page — the embedded source URL.
 */
const SEL_VIDEO_SRC_DIRECT = '#player source, video source';
const ATTR_VIDEO_SRC_DIRECT = 'src';

const SEL_PLAYER_EMBED = '#player';
const ATTR_PLAYER_EMBED = 'data-src';

const SEL_IFRAME = 'iframe';

/**
 * Quality badge text next to each server / source button.
 */
const SEL_QUALITY_BADGE = '.quality-badge, .server-quality, .label-quality';

/**
 * Title text on the detail page (used to confirm we found the right anime).
 */
const SEL_DETAIL_TITLE = 'h1.post-title, h1.entry-title, h1.anime-title, .anime-info h1';

// ──────────────────────────────────────────────────────────────
//  URL PATTERNS — update when routing changes.
// ──────────────────────────────────────────────────────────────

/**
 * ⚡ UPDATE: The URL pattern for a search query.
 */
function searchUrl(query) {
  return '/?s=' + encodeURIComponent(query);
}

/**
 * ⚡ UPDATE: The URL pattern for an episode page.
 */
function episodeUrl(slug, season, episode) {
  var cleanSlug = slug.replace(/\/$/, '');
  // Naruto specifically uses 1x1, 1x2 etc.
  return '/episode/' + cleanSlug + '-' + season + 'x' + episode + '/';
}

// ──────────────────────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseQuality(raw) {
  if (!raw) return null;
  var match = raw.match(/\b(4K|2160p|1080p|720p|480p|360p|CAM|HD|SD|FHD)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function extractUrlFromScripts(html) {
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
 * Simple Base64 decoder for environments without atob()
 */
function base64Decode(str) {
  try {
    // Standard browser/Nuvio environment atob
    var binary = atob(str);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } catch (e) {
    try {
      // Fallback for Node-like environments
      return Buffer.from(str, 'base64').toString('utf8');
    } catch (e2) {
      console.log('[watchanimeworld] Base64 decode failed');
      return '';
    }
  }
}

function extractFromIframe($, html) {
  var streams = [];
  var iframes = $('iframe');
  
  iframes.each(function() {
    var src = $(this).attr('src') || $(this).attr('data-src') || '';
    if (!src) return;
    
    if (src.startsWith('/')) src = BASE_URL + src;
    
    // Check for internal player API with Base64 data
    if (src.includes('player1.php?data=') || src.includes('player2.php?data=')) {
      try {
        var urlObj = new URL(src);
        var base64Data = urlObj.searchParams.get('data');
        if (base64Data) {
          var decoded = JSON.parse(base64Decode(base64Data));
          if (Array.isArray(decoded)) {
            decoded.forEach(function(item) {
              if (item.link) {
                streams.push({
                  name: 'watchanimeworld',
                  title: 'WatchAnimeWorld — ' + (item.language || 'Direct'),
                  url: item.link,
                  quality: 'AUTO',
                  headers: HEADERS
                });
              }
            });
          }
        }
      } catch (e) {
        console.log('[watchanimeworld] Failed to decode player data: ' + e.message);
      }
    } else if (!src.includes('ads') && !src.includes('facebook') && !src.includes('twitter')) {
      // General iframe fallback
      streams.push({
        name: 'watchanimeworld',
        title: 'Embed Player',
        url: src,
        quality: 'AUTO',
        headers: HEADERS
      });
    }
  });
  
  return streams;
}

// ──────────────────────────────────────────────────────────────
//  MAIN PIPELINE
// ──────────────────────────────────────────────────────────────

async function searchAnime(title) {
  var html = await fetchPage(searchUrl(title));
  var $ = cheerio.load(html);

  var result = null;
  // The site uses <article> for search results.
  $('article, .result-item, .post-item').each(function () {
    var el = $(this);
    // Find the link that contains /series/ or /movies/
    var linkEl = el.find('a').filter(function() {
      var h = $(this).attr('href') || '';
      return h.indexOf('/series/') !== -1 || h.indexOf('/movies/') !== -1;
    }).first();
    
    if (!linkEl.length) linkEl = el.find('a').first();
    
    var link = linkEl.attr('href') || '';
    var name = el.find('h2, h3').first().text().trim() || el.text().trim();

    if (!name || !link) return;

    var normalisedName = name.toLowerCase();
    var normalisedQuery = title.toLowerCase();
    
    // Check for match
    var isExact = normalisedName === normalisedQuery;
    var isPartial = normalisedName.indexOf(normalisedQuery) !== -1;
    var isFuzzy = normalisedQuery.indexOf(normalisedName.split(/[:\-(]/)[0].trim()) !== -1;

    if (isExact || isPartial || isFuzzy || (title === 'Naruto' && normalisedName === 'naruto')) {
      // Priority: if we find an exact match, we should definitely take it.
      if (result && isPartial && !isExact) return; 
      if (result && result.title.toLowerCase() === normalisedQuery && !isExact) return;
      
      var absoluteUrl = link.startsWith('http') ? link : BASE_URL + (link.startsWith('/') ? link : '/' + link);
      var parts = absoluteUrl.replace(/\/$/, '').split('/');
      var slug = parts[parts.length - 1];
      
      result = {
        slug: slug,
        title: name,
        detailUrl: absoluteUrl,
      };
      // If exact match, we can stop. Otherwise, keep looking for an exact match.
      if (isExact) return false;
    }
  });

  if (!result) {
    console.log('[watchanimeworld] No search result matched "' + title + '"');
  }
  return result;
}

async function resolveEpisodePage(detailUrl, season, episode) {
  var html = await fetchText(detailUrl);
  var $ = cheerio.load(html);

  // Try the direct URL-construction approach first (no second request).
  var slug = detailUrl
    .replace(BASE_URL, '')
    .replace(/^\/|\/$/g, '')
    .split('/')
    .filter(Boolean)
    .pop();
  var constructed = episodeUrl(slug, season, episode);

  console.log('[watchanimeworld] Trying constructed URL: ' + constructed);

  // Verify the episode link actually exists on the detail page.
  var found = false;
  $(SEL_EPISODE_LINK).each(function () {
    var href = $(this).attr('href') || '';
    // Ensure it's an episode link and not a series link
    if (href.indexOf('/episode/') === -1) return;

    // Match by episode number in the href
    var epPattern = season + 'x' + episode;
    var epAlt1 = '-' + season + '-' + episode + '/';
    var epAlt2 = '-' + episode + '/';
    if (href.indexOf(epPattern) !== -1 || href.indexOf(epAlt1) !== -1 || href.endsWith(epAlt2)) {
      found = true;
      constructed = href.startsWith('http') ? href : BASE_URL + (href.startsWith('/') ? href : '/' + href);
      return false;
    }
  });

  if (!found) {
    console.log('[watchanimeworld] Episode ' + episode + ' not found in listing, ' +
                'falling back to constructed URL: ' + constructed);
    return constructed.startsWith('http') ? constructed : BASE_URL + constructed;
  }

  return constructed;
}

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

  // ── Strategy C: Iframe embed (third-party player) & Internal API ──
  if (streams.length === 0) {
    var iframeStreams = extractFromIframe($, html);
    if (iframeStreams.length > 0) {
      streams = streams.concat(iframeStreams);
    }
  }

  // ── Strategy D: Regex scan of inline <script> blocks ──
  if (streams.length === 0) {
    var scriptUrl = extractUrlFromScripts(html);
    if (scriptUrl) {
      var inferredQuality = 'AUTO';
      streams.push({
        name: 'watchanimeworld',
        title: inferredQuality + ' — Script Extract',
        url: scriptUrl,
        quality: inferredQuality,
        headers: HEADERS,
      });
    }
  }

  if (streams.length === 0) {
    console.log('[watchanimeworld] No streams found on: ' + episodePageUrl);
  }

  return streams;
}

async function extractStreams(title, mediaType, season, episode) {
  var searchResult = await searchAnime(title);
  if (!searchResult) {
    console.log('[watchanimeworld] Search returned no results for: ' + title);
    return [];
  }

  console.log('[watchanimeworld] Found: ' + searchResult.title +
              ' → ' + searchResult.detailUrl);

  if (mediaType === 'movie') {
    return await extractStreamsFromPage(searchResult.detailUrl);
  }

  if (episode == null) {
    console.log('[watchanimeworld] No episode specified for TV media');
    return [];
  }

  var epUrl = await resolveEpisodePage(searchResult.detailUrl, season, episode);
  return await extractStreamsFromPage(epUrl);
}

export { extractStreams, searchAnime, resolveEpisodePage, extractStreamsFromPage };
