# Nuvio Stream API Player Integration

## Live endpoint

Use this public base URL:

```text
https://nuvio-stream-api-20260925.onrender.com
```

The service accepts exactly one of `tmdbId`, `imdbId`, `malId`, or `anilistId`.
For television content, include `type=tv`, `audio=sub|dub|hindi`, `season`, and `episode`.
For movies, use `type=movie` and omit season and episode.

Examples for the Ranma1/2 remake:

```text
GET /api/stream?tmdbId=259140&type=tv&audio=sub&season=1&episode=1
GET /api/stream?malId=59145&type=tv&audio=dub&season=1&episode=1
GET /api/stream?anilistId=178533&type=tv&audio=sub&season=1&episode=1
```

The response is always a top-level JSON array. A successful item contains a direct, server-validated media URL and the exact request headers required by its provider.

```json
[
  {
    "name": "MegaVid",
    "title": "MegaVid — sub",
    "url": "https://megavid.buzz/vid/.../master.m3u8",
    "quality": "AUTO",
    "headers": {
      "User-Agent": "...",
      "Accept": "*/*",
      "Origin": "https://megavid.buzz",
      "Referer": "https://megavid.buzz/"
    },
    "format": "hls",
    "mimeType": "application/x-mpegURL",
    "subtitles": [
      {
        "url": "https://megavid.buzz/sub/.../eng.vtt",
        "label": "English",
        "kind": "captions",
        "default": true
      }
    ]
  }
]
```

`subtitles` is optional. It contains direct WebVTT URLs returned by the provider. The API filters out wrapper pages and non-WebVTT track URLs. The array can contain multiple languages and forced-caption variants.

## Kotlin serialization models

With `kotlinx.serialization`, model the response as follows:

```kotlin
@Serializable
data class StreamSubtitle(
    val url: String,
    val label: String,
    val lang: String? = null,
    val kind: String? = null,
    val default: Boolean? = null,
)

@Serializable
data class DirectStream(
    val name: String? = null,
    val title: String,
    val url: String,
    val quality: String,
    val headers: Map<String, String> = emptyMap(),
    val format: String? = null,
    val mimeType: String? = null,
    val subtitles: List<StreamSubtitle> = emptyList(),
)
```

Resolve immediately before playback. Do not cache signed provider URLs for long periods.

```kotlin
val requestUrl = buildString {
    append("https://nuvio-stream-api-20260925.onrender.com/api/stream?")
    append("tmdbId=259140&type=tv&audio=sub&season=1&episode=1")
}

val request = Request.Builder().url(requestUrl).get().build()
val response = okHttpClient.newCall(request).execute()
check(response.isSuccessful) { "Stream lookup failed: ${response.code}" }

val streams: List<DirectStream> = json.decodeFromString(response.body.string())
val stream = streams.firstOrNull() ?: error("No playable stream returned")
```

## Media3 / ExoPlayer setup

Pass the complete `headers` map to the HTTP data source. Do not copy only `Referer` or only `User-Agent`; the provider can require `Origin` and `Accept` as well.

```kotlin
val dataSourceFactory = DefaultHttpDataSource.Factory()
    .setDefaultRequestProperties(stream.headers)

val subtitleConfigurations = stream.subtitles.map { subtitle ->
    MediaItem.SubtitleConfiguration.Builder(Uri.parse(subtitle.url))
        .setMimeType(MimeTypes.TEXT_VTT)
        .setLabel(subtitle.label)
        .setLanguage(subtitle.lang)
        .setSelectionFlags(
            if (subtitle.default == true) C.SELECTION_FLAG_DEFAULT else 0
        )
        .build()
}

val mediaItem = MediaItem.Builder()
    .setUri(stream.url)
    .setSubtitleConfigurations(subtitleConfigurations)
    .build()

val mediaSource = when {
    stream.format.equals("hls", ignoreCase = true) ||
        stream.mimeType.equals("application/x-mpegURL", ignoreCase = true) ->
        HlsMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)
    else ->
        ProgressiveMediaSource.Factory(dataSourceFactory).createMediaSource(mediaItem)

player.setMediaSource(mediaSource)
player.prepare()
player.play()
```

Use the player track-selection UI to let the user select an English or forced subtitle track. For HLS sources, the subtitle URL is an external WebVTT track and is attached to the `MediaItem`; it is not necessarily embedded in the HLS manifest.

## Nuvio client behavior

A Nuvio-compatible client should treat the response as `List<DirectStream>`. It should select the first playable item and retry the next item after a playback failure. It should pass `headers` to the media request and preserve `subtitles` when converting the stream into the client’s internal model.

Do not transform the media URL into an embed URL, redirect URL, shortener, or browser-local blob URL.

## Errors

Errors are JSON objects rather than arrays:

```json
{
  "error": {
    "code": "streams_not_found",
    "message": "No client-fetchable sub playback stream was available from MegaVid or MegaPlay."
  }
}
```

Treat HTTP `400` as an invalid request, HTTP `404` as no verified source, and HTTP `502` as an upstream metadata/provider failure. A retry should resolve a fresh URL rather than reusing a failed signed URL.

## Verification endpoint

```text
GET https://nuvio-stream-api-20260925.onrender.com/api/health
```

Expected response:

```json
{"status":"ok"}
```

## Provider policy

- `audio=hindi` uses the Blakite Hindi-capable resolver.
- `audio=sub` uses MegaVid first and MegaPlay as fallback.
- `audio=dub` uses MegaVid first and MegaPlay as fallback.
- Returned media is accepted only after server-side direct-media validation.
- The API does not bypass CAPTCHAs, sign-in controls, paywalls, DRM, Cloudflare challenges, or other access restrictions.
