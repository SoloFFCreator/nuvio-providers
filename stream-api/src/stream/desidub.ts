import type { DirectStream, MediaMetadata, StreamRequest, StreamHeaders } from "./types.js";

const BASE = "https://www.desidubanime.me";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0.0.0 Mobile Safari/537.36";
const SITE_HEADERS: Record<string, string> = {
  "User-Agent": USER_AGENT,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${BASE}/`,
};
const PLAYBACK_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "*/*",
  Referer: `${BASE}/`,
};

async function fetchText(url: string, headers: Record<string, string> = SITE_HEADERS): Promise<string> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`DesiDub HTTP ${response.status}`);
  return response.text();
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function titleScore(requested: string, candidate: string): number {
  const left = normalize(requested);
  const right = normalize(candidate);
  if (!left || !right) return 0;
  if (left === right) return 100;
  if (right.includes(left) || left.includes(right)) return 80;
  const words = left.split(" ").filter(Boolean);
  const hits = words.filter(word => right.includes(word)).length;
  return Math.round((hits / Math.max(words.length, 1)) * 70);
}

function absoluteUrl(value: string): string {
  try { return new URL(value, BASE).toString(); } catch { return ""; }
}

function decodeBase64(value: string): string {
  try {
    const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8").trim();
  } catch { return ""; }
}

function decodeEmbed(value: string): string {
  const decoded = decodeBase64(value);
  const iframe = decoded.match(/src=["']([^"']+)["']/i);
  return absoluteUrl(iframe?.[1] ?? decoded);
}

function extractLinks(html: string): Array<{ url: string; text: string }> {
  const results: Array<{ url: string; text: string }> = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of Array.from(html.matchAll(linkPattern))) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const url = absoluteUrl(match[1]);
    if (url) results.push({ url, text });
  }
  return results;
}

async function findAnimePage(title: string): Promise<string> {
  const html = await fetchText(`${BASE}/?s=${encodeURIComponent(title)}`);
  const candidates = extractLinks(html)
    .filter(item => /\/anime\/|\/watch\//i.test(item.url) && item.text)
    .sort((a, b) => titleScore(title, b.text) - titleScore(title, a.text));
  return candidates[0] && titleScore(title, candidates[0].text) >= 40 ? candidates[0].url : "";
}

async function findEpisodePage(animeUrl: string, request: StreamRequest): Promise<string> {
  if (request.type === "movie") return animeUrl;
  if (!request.season || !request.episode) return "";
  const html = await fetchText(animeUrl);
  const wanted = `${request.season}x${request.episode}`.toLowerCase();
  const links = extractLinks(html).filter(item => /\/watch\//i.test(item.url));
  const match = links.find(item => `${item.url} ${item.text}`.toLowerCase().includes(wanted));
  if (match) return match.url;
  const slug = animeUrl.replace(/\/$/, "").split("/").pop() ?? "";
  return slug ? `${BASE}/watch/${slug}-s${request.season}-episode-${request.episode}/` : "";
}

function extractServers(html: string): Array<{ name: string; url: string }> {
  const servers: Array<{ name: string; url: string }> = [];
  const pattern = /data-embed-id=["']([^"']+:[^"']+)["']/gi;
  for (const match of Array.from(html.matchAll(pattern))) {
    const [name64, url64] = match[1].split(":");
    const name = decodeBase64(name64);
    const url = decodeEmbed(url64);
    if (!name || !url || /streamp2p|p2pplay|strp2p/i.test(`${name} ${url}`)) continue;
    servers.push({ name, url });
  }
  return servers.sort((a, b) => {
    const rank = (value: string) => /vidmoly/i.test(value) ? 1 : /ruby|streamruby/i.test(value) ? 2 : 3;
    return rank(`${a.name} ${a.url}`) - rank(`${b.name} ${b.url}`);
  });
}

function cleanHls(value: string): string {
  const cleaned = value.replace(/\\\//g, "/").replace(/&amp;/g, "&").replace(/[\\"'<>\s]+$/g, "");
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "https:" && /\.m3u8(?:$|[?#])/i.test(parsed.pathname + parsed.search) ? parsed.toString() : "";
  } catch { return ""; }
}

async function resolveServer(server: { name: string; url: string }): Promise<DirectStream | null> {
  try {
    const html = await fetchText(server.url, { ...SITE_HEADERS, Referer: `${BASE}/` });
    const match = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/i);
    const url = match ? cleanHls(match[0]) : "";
    if (!url) return null;
    const referer = `${new URL(server.url).origin}/`;
    return {
      name: "DesiDubAnime",
      url,
      title: `DesiDubAnime — ${server.name}`,
      quality: "AUTO",
      headers: { ...PLAYBACK_HEADERS, Referer: referer },
    };
  } catch { return null; }
}

export async function resolveDesiDubStreams(metadata: MediaMetadata, request: StreamRequest): Promise<DirectStream[]> {
  try {
    const title = metadata.primaryTitle || metadata.titles[0];
    if (!title) return [];
    const animeUrl = await findAnimePage(title);
    if (!animeUrl) return [];
    const episodeUrl = await findEpisodePage(animeUrl, request);
    if (!episodeUrl) return [];
    const html = await fetchText(episodeUrl);
    const servers = extractServers(html);
    for (const server of servers) {
      const stream = await resolveServer(server);
      if (stream) return [stream];
    }
  } catch { return []; }
  return [];
}
