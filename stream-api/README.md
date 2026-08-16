# Midnight Anime Stream API

This API resolves a single AniList or MyAnimeList identifier to one or more playback-ready streams. It returns signed HLS `.m3u8` URLs where the provider makes them available, along with the request headers needed by ExoPlayer.

## Run locally

```bash
cd stream-api
pnpm install
pnpm dev
```

The API reads the `PORT` environment variable. The health endpoint is `GET /api/health`.

## Deploy

Deploy `stream-api/` as a standard Node.js service. Install dependencies, build TypeScript, and run the compiled server with a platform-provided `PORT` value.

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

For managed Manus hosting, open the saved project checkpoint and select **Publish** in the management interface. For another Node.js host, set its build command to `pnpm install --frozen-lockfile && pnpm build` and its start command to `pnpm start`.

## Request

Use exactly one identifier. `anilistId` is the primary input; `malId` is also supported. The `type` parameter is required and only accepts `movie` or `tv`. Television requests also require positive `season` and `episode` values.

```text
GET /api/stream?anilistId=20&type=tv&season=1&episode=1
GET /api/stream?malId=20&type=tv&season=1&episode=1
```

Each request must include the following header.

```text
X-App-Package: com.midnight.anime
```

The only allowed `X-App-Package` values are `com.midnight.anime` and `com.midnight.anime.tv`.

> `X-App-Package` is a basic private-app restriction and can be reproduced by a determined third-party client. Use a stronger app-attestation mechanism before treating this API as publicly secure.

## Success response

The response body is a JSON array. Each stream object includes exactly the required fields `url`, `title`, `quality`, and `headers`.

```json
[
  {
    "url": "https://example.net/master.m3u8?signature=...",
    "title": "WatchAnimeWorld — Direct HLS",
    "quality": "AUTO",
    "headers": {
      "User-Agent": "Mozilla/5.0 ...",
      "Referer": "https://play.zephyrix.top/"
    }
  }
]
```

## Error response

Errors return an HTTP status and a JSON object containing an error `code` and `message`. Common statuses are `400` for invalid parameters, `403` for an unapproved package name, `404` when no stream is available, and `502` when an upstream provider cannot be reached.

## Kotlin / ExoPlayer example

Define the response model and request the API immediately before starting playback. The app header must match one of the two allowed package names.

```kotlin
data class DirectStream(
    val url: String,
    val title: String,
    val quality: String,
    val headers: Map<String, String>
)

val request = Request.Builder()
    .url("https://YOUR_API_HOST/api/stream?anilistId=20&type=tv&season=1&episode=1")
    .header("X-App-Package", applicationContext.packageName)
    .get()
    .build()

val response = okHttpClient.newCall(request).execute()
check(response.isSuccessful) { "Stream lookup failed: ${response.code}" }
val streams: List<DirectStream> = json.decodeFromString(response.body.string())
val stream = streams.first()

val streamHeaders = stream.headers
val dataSourceFactory = DefaultHttpDataSource.Factory()
    .setDefaultRequestProperties(streamHeaders)

val mediaItem = MediaItem.fromUri(stream.url)
val mediaSource = HlsMediaSource.Factory(dataSourceFactory)
    .createMediaSource(mediaItem)

player.setMediaSource(mediaSource)
player.prepare()
player.play()
```

> Signed HLS URLs can expire. Resolve a fresh stream immediately before playback instead of storing response URLs long term.
