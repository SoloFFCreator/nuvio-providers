# Nuvio Stream API

This open-source Node.js service resolves one AniList or MyAnimeList identifier into direct playback URLs for anime applications and Nuvio-compatible clients. It is free to run and does not require an API key, login, or Android package header.

The service returns only direct `.m3u8`, `.mp4`, or `.mkv` URLs. It does not return shorteners, iframe pages, or embed URLs. The resolver also performs a server-side availability check before returning a source so expired or forbidden links are filtered out before playback.

## Run locally

```bash
cd stream-api
pnpm install
pnpm dev
```

The API reads the `PORT` environment variable. The health endpoint is `GET /api/health`.

## Deploy

Deploy `stream-api/` as a standard Node.js service. Install dependencies, build TypeScript, and run the compiled server with the platform-provided `PORT` value.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

For the hosted deployment, the current base URL is `https://nuvioapi-erbmmxkc.manus.space`.

## Request

Use exactly one identifier. `anilistId` is the primary input; `malId` is also supported. The `type` parameter is required and accepts `movie` or `tv`. Television requests require positive `season` and `episode` values.

```text
GET https://nuvioapi-erbmmxkc.manus.space/api/stream?anilistId=20&type=tv&season=1&episode=1
GET https://nuvioapi-erbmmxkc.manus.space/api/stream?malId=20&type=tv&season=1&episode=1
```

No special headers are required. The endpoint is intentionally public so that the Android app and Nuvio can call it without package-name restrictions.

## Success response

The response body is always a JSON array, including when only one direct source is available. A one-item array is valid and must not be changed into a bare object. Each item follows the Nuvio stream schema and includes a provider `name`, display `title`, direct `url`, `quality`, and playback `headers`.

```json
[
  {
    "name": "WatchAnimeWorld",
    "title": "WatchAnimeWorld — Direct HLS",
    "url": "https://example.net/master.m3u8?signature=...",
    "quality": "AUTO",
    "headers": {
      "User-Agent": "Mozilla/5.0 ...",
      "Accept": "text/html,application/xhtml+xml,...",
      "Accept-Language": "en-US,en;q=0.9",
      "X-Requested-With": "XMLHttpRequest",
      "Referer": "https://play.zephyrix.top/"
    }
  }
]
```

The `name` field is required for Nuvio provider compatibility. Extra sources may be returned when available; the client should select the first playable source and try the next source after a playback failure.

## Error response

Errors return an HTTP status and a JSON object containing an error `code` and `message`. Common statuses are `400` for invalid parameters, `404` when no direct source is available, and `502` when an upstream provider cannot be reached.

```json
{
  "error": {
    "code": "streams_not_found",
    "message": "No direct playback stream was available for this title."
  }
}
```

## Kotlin / ExoPlayer example

Use the array response directly. Do not decode the body as a single stream object and do not require `X-App-Package`.

```kotlin
data class DirectStream(
    val name: String,
    val title: String,
    val url: String,
    val quality: String,
    val headers: Map<String, String> = emptyMap()
)

val request = Request.Builder()
    .url("https://nuvioapi-erbmmxkc.manus.space/api/stream?anilistId=20&type=tv&season=1&episode=1")
    .get()
    .build()

val response = okHttpClient.newCall(request).execute()
check(response.isSuccessful) { "Stream lookup failed: ${response.code}" }
val streams: List<DirectStream> = json.decodeFromString(response.body.string())
check(streams.isNotEmpty()) { "No playable stream returned" }
val stream = streams.first()

val dataSourceFactory = DefaultHttpDataSource.Factory()
    .setDefaultRequestProperties(stream.headers)

val mediaItem = MediaItem.fromUri(stream.url)
val mediaSource = when {
    stream.url.substringBefore('?').endsWith(".m3u8", ignoreCase = true) ->
        HlsMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
    else -> ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
}

player.setMediaSource(mediaSource)
player.prepare()
player.play()
```

Signed HLS URLs can expire, so resolve a fresh stream immediately before playback instead of storing response URLs long term.

### Network validation

The API validates fresh direct media links before returning them and checks HLS master, child-playlist, and first-segment access with the source's playback headers. Cloudflare may still make a request appear differently from different egress networks: a sandbox or server probe can receive a challenge while an Android/Nuvio client that uses the freshly returned URL and every returned header can play it. Therefore, the Android player must pass the **entire** `headers` map into its media data source, must resolve immediately before playback, and must report any playback error so the source can be rechecked.

## Nuvio provider requirements

Nuvio calls a provider's `getStreams` function and expects an array. Every array item should contain `name`, `title`, and `url`, with `quality` and `headers` included when available. A single source is represented as `[source]`, not as `source` and not as `{ sources: [source] }`. The bundled WatchAnimeWorld provider now filters embed pages, short-link redirects, and non-playable URLs before returning results.

## License and source

The source is maintained in `https://github.com/SoloFFCreator/nuvio-providers`, branch `template`, under `stream-api/`. Review and adapt the provider code before deploying it in jurisdictions where upstream streaming sources may be restricted.
