/* ============================================================================
 * sw.js  —  Service worker (offline app shell)
 * ----------------------------------------------------------------------------
 * Caches the local app shell on install so the app works fully offline once
 * visited (over http/localhost — service workers don't run from file://).
 * Strategy: cache-first for our own files, network passthrough for everything
 * else (e.g. Google Fonts, soundfont samples), so the offline synth path never
 * depends on the network while the optional online extras still work when up.
 *
 * Bump CACHE when files change to invalidate the old cache.
 * ========================================================================== */
const CACHE = "piano-trainer-v24";
const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "icon.svg",
  "lib/Tone.js",
  "lib/Midi.js",
  "lib/opensheetmusicdisplay.min.js",
  "lib/soundfont-player.min.js",
  "lib/acoustic_grand_piano-mp3.js",
  "lib/voice-counts.js",
  "src/keys.js",
  "src/timing.js",
  "src/mxl.js",
  "src/score-import.js",
  "src/parser.js",
  "src/theory.js",
  "src/convert-midi-to-xml.js",
  "src/convert-xml-to-midi.js",
  "src/fingering.js",
  "src/profiles.js",
  "src/storage.js",
  "src/practice-log.js",
  "src/samples.js",
  "src/audio-engine.js",
  "src/transport.js",
  "src/sheet-view.js",
  "src/pianoroll-view.js",
  "src/keyboard-view.js",
  "src/midi-input.js",
  "src/practice.js",
  "src/app.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/*
 * NETWORK FIRST, cache as the fallback. This used to be cache-first, which
 * meant that once installed the worker served its cached copies until sw.js
 * itself changed byte-for-byte — so any update shipped without bumping CACHE
 * above was silently invisible. The app is served from this same computer, so
 * the network is effectively instant; the cache is only needed when the server
 * isn't running, and then the fetch fails fast (connection refused) and the
 * cached copy is used. Every successful response refreshes the cache.
 */
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return res;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then((hit) =>
        hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))
    )
  );
});
