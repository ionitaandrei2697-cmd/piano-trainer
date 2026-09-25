/* ============================================================================
 * audio-engine.js  —  Sound output with pluggable backend
 * ----------------------------------------------------------------------------
 * Interchangeable voices behind ONE interface and ONE mixing bus:
 *   - "synth"            raw Web Audio triangle voices (zero network, default).
 *   - bundled sampler    lib/acoustic_grand_piano-mp3.js decoded once (offline).
 *   - GM soundfonts      soundfont-player samples from the gleitz CDN.
 *
 * Every backend exposes the same tiny player contract:
 *     player.play(midi, whenCtxTime, { duration, gain }) -> handle
 *     handle.stop(atCtxTime)     musical release
 *     handle.cancel()            SILENT kill (used when un-scheduling)
 *
 * WHY THE SYNTH IS NO LONGER Tone.PolySynth
 * -----------------------------------------
 * The transport schedules ~120 ms ahead. When you pause, seek, or a loop wraps,
 * those already-scheduled notes must be un-scheduled or they sound as "ghost"
 * notes after the playhead has moved. Measured in Chrome: after
 * `PolySynth.releaseAll()` a note scheduled 300 ms in the future still played
 * at full amplitude (peak 0.78 with and without the call) — releaseAll only
 * releases voices that are ALREADY sounding. Raw oscillator voices can be
 * stopped and disconnected before they ever start, so cancellation is exact.
 * The waveform and ADSR below are the same ones the PolySynth was configured
 * with, so the sound is unchanged.
 *
 * All scheduled times are absolute AudioContext times (== audioEngine.now()),
 * which is exactly what the transport's scheduler feeds.
 *
 * NOTE: browsers block audio until a user gesture; call ensureStarted() from a
 * click/keypress before the first note.
 * ========================================================================== */
(function (root) {
  "use strict";

  const Tone = root.Tone;

  // Instruments bundled with the app (no network needed). The file is a
  // midi-js soundfont: a <script> that defines MIDI.Soundfont[name] as a map
  // of note names -> base64 mp3 data URIs. We inject it lazily, decode the 88
  // samples into AudioBuffers, and play them through plain Web Audio.
  const LOCAL_SOUNDFONTS = {
    acoustic_grand_piano: "lib/acoustic_grand_piano-mp3.js",
  };
  const NOTE_BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const MAX_VOICES = 64;

  function noteNameToMidi(name) {
    const m = /^([A-G])([b#]?)(-?\d)$/.exec(name);
    if (!m) return null;
    const acc = m[2] === "b" ? -1 : (m[2] === "#" ? 1 : 0);
    return NOTE_BASE[m[1]] + acc + (parseInt(m[3], 10) + 1) * 12;
  }
  function dataUriToArrayBuffer(uri) {
    const b64 = uri.slice(uri.indexOf(",") + 1);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  /** Hold the current value and stop any ramp, without an audible step. */
  function holdGain(param, t) {
    try {
      if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t);
      else param.cancelScheduledValues(t);
    } catch (e) { try { param.cancelScheduledValues(t); } catch (e2) {} }
  }

  class AudioEngine {
    constructor(opts) {
      opts = opts || {};
      this.maxPolyphony = opts.maxPolyphony || MAX_VOICES;
      this._started = false;
      this.backend = "synth";

      this.ctx = Tone.getContext().rawContext;

      // ---- mixing buses (plain Web Audio so every backend shares them) ----
      this._musicBus = this.ctx.createGain();
      this._musicBus.gain.value = 0.8;
      this._musicBus.connect(this.ctx.destination);
      this._sfBus = this._musicBus;           // kept for soundfont-player wiring
      this._clickBus = this.ctx.createGain();
      this._clickBus.gain.value = 0.6;
      this._clickBus.connect(this.ctx.destination);

      this.metro = { sound: "classic", countIn: "off", lang: "en" };
      this._synth = this._makeSynthPlayer();
      this._click = this._makeClickPlayer();

      this._sf = null;            // ACTIVE sampled instrument (backend "sf")
      this._sfName = null;
      this._sfLoaded = new Map(); // name -> loaded instrument (cache)
      this._sfLoading = new Map();// name -> in-flight promise (dedupe)
      this._live = new Map();     // midi -> live handle (for noteOffLive)
      this._sustain = false;      // sustain pedal (CC64) state for live input
      this._sustained = new Map();// midi -> handle held only by the pedal
      this._scheduled = [];       // handles for notes the transport queued ahead
      this._localScripts = new Map();
    }

    // ---- lifecycle ---------------------------------------------------------
    async ensureStarted() {
      if (this._started) {
        if (this.ctx.state === "suspended") { try { await this.ctx.resume(); } catch (e) {} }
        return;
      }
      try { await Tone.start(); } catch (e) { /* fall through to raw resume */ }
      const raw = Tone.getContext().rawContext;
      if (raw !== this.ctx) {
        // Tone swapped the context: rebuild the buses on the live one.
        this.ctx = raw;
        this._musicBus = this.ctx.createGain(); this._musicBus.gain.value = 0.8;
        this._musicBus.connect(this.ctx.destination);
        this._sfBus = this._musicBus;
        this._clickBus = this.ctx.createGain(); this._clickBus.gain.value = 0.6;
        this._clickBus.connect(this.ctx.destination);
        this._synth = this._makeSynthPlayer();
        this._click = this._makeClickPlayer();
      }
      if (this.ctx.state === "suspended") { try { await this.ctx.resume(); } catch (e) {} }
      this._started = true;
    }

    now() { return this.ctx.currentTime; }
    get started() { return this._started; }

    // ---- backends ----------------------------------------------------------
    /**
     * Switch the sound. name = "synth" or a General-MIDI instrument name.
     * Returns the backend actually in effect ("synth" on failure).
     */
    async setBackend(name) {
      if (name === "piano") name = "acoustic_grand_piano"; // legacy alias
      if (!name || name === "synth") { this.backend = "synth"; return "synth"; }
      const inst = await this._loadInstrument(name);
      if (inst) {
        this._sf = inst; this._sfName = name; this.backend = "sf";
        return name;
      }
      this.backend = "synth";
      return "synth";
    }

    /** The player object for the active backend. */
    _player() {
      return (this.backend === "sf" && this._sf) ? this._sf : this._synth;
    }

    async _loadInstrument(name) {
      if (this._sfLoaded.has(name)) return this._sfLoaded.get(name);
      if (this._sfLoading.has(name)) return this._sfLoading.get(name);
      if (LOCAL_SOUNDFONTS[name]) {
        const p = this._loadLocalSoundfont(name, LOCAL_SOUNDFONTS[name])
          .then((inst) => {
            this._sfLoading.delete(name);
            if (inst) { this._sfLoaded.set(name, inst); return inst; }
            return this._loadCdnInstrument(name);  // bundled failed -> try CDN
          })
          .catch(() => { this._sfLoading.delete(name); return this._loadCdnInstrument(name); });
        this._sfLoading.set(name, p);
        return p;
      }
      return this._loadCdnInstrument(name);
    }

    async _loadCdnInstrument(name) {
      if (this._sfLoaded.has(name)) return this._sfLoaded.get(name);
      if (this._sfLoading.has(name)) return this._sfLoading.get(name);
      if (!root.Soundfont) return null;
      const p = root.Soundfont.instrument(this.ctx, name, {
        soundfont: "MusyngKite",
        destination: this._musicBus,
      }).then((inst) => {
        // NOTE: destination above already routes the player to the music bus.
        // A second connect() would SUM a duplicate path (+6 dB) — do not add one.
        const wrapped = this._wrapSoundfont(inst);
        this._sfLoaded.set(name, wrapped);
        this._sfLoading.delete(name);
        return wrapped;
      }).catch((e) => {
        console.warn("soundfont load failed:", name, e);
        this._sfLoading.delete(name);
        return null;
      });
      this._sfLoading.set(name, p);
      return p;
    }

    /** Give soundfont-player instruments the same play/stop/cancel contract. */
    _wrapSoundfont(inst) {
      const ctx = this.ctx;
      const active = new Set();
      return {
        kind: "soundfont",
        play(midi, when, opts) {
          opts = opts || {};
          const node = inst.play(midi, when, { duration: opts.duration, gain: opts.gain });
          const handle = {
            when: when,
            stop(t) { try { node.stop(t == null ? ctx.currentTime : t); } catch (e) {} active.delete(handle); },
            cancel() { try { node.stop(0); } catch (e) {} try { node.disconnect(); } catch (e) {} active.delete(handle); },
          };
          active.add(handle);
          return handle;
        },
        stop() { for (const h of [...active]) h.stop(); try { inst.stop(); } catch (e) {} },
        cancelAll() { for (const h of [...active]) h.cancel(); try { inst.stop(); } catch (e) {} },
      };
    }

    /** Inject a local midi-js soundfont script (works from file:// too). */
    _injectScript(url) {
      if (this._localScripts.has(url)) return this._localScripts.get(url);
      const p = new Promise((resolve, reject) => {
        if (typeof document === "undefined") return reject(new Error("no DOM"));
        const s = document.createElement("script");
        s.src = url;
        s.onload = () => resolve(true);
        s.onerror = () => reject(new Error("script load failed: " + url));
        document.head.appendChild(s);
      });
      this._localScripts.set(url, p);
      return p;
    }

    async _loadLocalSoundfont(name, url) {
      try {
        await this._injectScript(url);
        const bank = root.MIDI && root.MIDI.Soundfont && root.MIDI.Soundfont[name];
        if (!bank) return null;
        const entries = Object.entries(bank);
        const buffers = new Map();   // midi -> { buffer, offset }
        const decode = (buf) => new Promise((res, rej) => {
          const r = this.ctx.decodeAudioData(buf, res, rej);
          if (r && r.then) r.then(res, rej);   // promise- and callback-style ctxs
        });
        // MP3 carries mandatory encoder/decoder priming: ~25-50 ms of silence
        // at the start of every file. Untrimmed, every note SOUNDS that much
        // after its scheduled instant, so the cursor / falling notes / lit keys
        // all seem to run ahead of the audio. Measure the real onset per sample
        // and start playback there.
        const leadingSilence = (buf) => {
          try {
            const ch = buf.getChannelData(0);
            const cap = Math.min(ch.length, Math.floor(buf.sampleRate * 0.25));
            for (let i = 0; i < cap; i++) if (Math.abs(ch[i]) > 0.001) return i / buf.sampleRate;
            return 0;
          } catch (e) { return 0; }
        };
        for (let i = 0; i < entries.length; i += 12) {
          await Promise.all(entries.slice(i, i + 12).map(async ([noteName, uri]) => {
            const midi = noteNameToMidi(noteName);
            if (midi == null) return;
            try {
              const buf = await decode(dataUriToArrayBuffer(uri));
              buffers.set(midi, { buffer: buf, offset: leadingSilence(buf) });
            } catch (e) {}
          }));
        }
        if (!buffers.size) return null;
        return this._makeLocalPlayer(buffers);
      } catch (e) {
        console.warn("bundled soundfont failed:", name, e);
        return null;
      }
    }

    /** A minimal sampler over decoded buffers: exact note, else nearest pitched. */
    _makeLocalPlayer(buffers) {
      const ctx = this.ctx, bus = this._musicBus;
      const active = new Set();
      const keys = [...buffers.keys()].sort((a, b) => a - b);
      function nearest(midi) {
        if (buffers.has(midi)) return midi;
        let best = keys[0];
        for (const k of keys) if (Math.abs(k - midi) < Math.abs(best - midi)) best = k;
        return best;
      }
      return {
        kind: "sampler",
        play(midi, when, opts) {
          opts = opts || {};
          const t0 = Math.max(when == null ? ctx.currentTime : when, ctx.currentTime);
          const base = nearest(midi);
          const rec = buffers.get(base);
          const src = ctx.createBufferSource();
          src.buffer = rec.buffer;
          src.playbackRate.value = Math.pow(2, (midi - base) / 12);
          const g = ctx.createGain();
          g.gain.value = typeof opts.gain === "number" ? opts.gain : 0.8;
          src.connect(g); g.connect(bus);
          const handle = {
            when: t0,
            stop(t) {
              const tt = Math.max(t == null ? ctx.currentTime : t, t0);
              try { g.gain.setTargetAtTime(0, tt, 0.04); } catch (e) {}
              try { src.stop(tt + 0.3); } catch (e) {}
              active.delete(handle);
            },
            cancel() {
              // Silent: kill before a single sample reaches the bus.
              try { g.gain.cancelScheduledValues(0); g.gain.value = 0; } catch (e) {}
              try { src.stop(ctx.currentTime); } catch (e) {}
              try { src.disconnect(); g.disconnect(); } catch (e) {}
              active.delete(handle);
            },
          };
          active.add(handle);
          src.onended = () => active.delete(handle);
          try { src.start(t0, rec.offset || 0); } catch (e) {}
          if (opts.duration) handle.stop(t0 + opts.duration);
          return handle;
        },
        stop() { for (const h of [...active]) h.stop(); },
        cancelAll() { for (const h of [...active]) h.cancel(); },
      };
    }

    /**
     * Raw Web Audio synth voice. Triangle oscillator with the same ADSR the
     * PolySynth used (attack .004, decay .45 to sustain .18, release .9), but
     * every voice keeps its own nodes so it can be stopped before it starts.
     */
    _makeSynthPlayer() {
      const ctx = this.ctx, bus = this._musicBus;
      const active = new Set();
      const A = 0.004, D = 0.45, S = 0.18, R = 0.9;
      return {
        kind: "synth",
        play(midi, when, opts) {
          opts = opts || {};
          const t0 = Math.max(when == null ? ctx.currentTime : when, ctx.currentTime);
          const peak = (typeof opts.gain === "number" ? opts.gain : 0.8) * 0.55;
          const sus = Math.max(peak * S, 1e-4);
          const freq = 440 * Math.pow(2, (midi - 69) / 12);

          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(freq, t0);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(Math.max(peak, 1e-4), t0 + A);
          g.gain.exponentialRampToValueAtTime(sus, t0 + A + D);
          osc.connect(g); g.connect(bus);

          // Voice stealing keeps a dense passage from spawning unbounded nodes.
          if (active.size >= MAX_VOICES) {
            const oldest = active.values().next().value;
            if (oldest) oldest.cancel();
          }

          let stopped = false;
          const handle = {
            when: t0,
            stop(t) {
              if (stopped) return; stopped = true;
              const tt = Math.max(t == null ? ctx.currentTime : t, t0 + A);
              holdGain(g.gain, tt);
              try { g.gain.exponentialRampToValueAtTime(0.0001, tt + R); } catch (e) {}
              try { osc.stop(tt + R + 0.02); } catch (e) {}
              active.delete(handle);
            },
            cancel() {
              stopped = true;
              try { g.gain.cancelScheduledValues(0); g.gain.value = 0; } catch (e) {}
              try { osc.stop(ctx.currentTime); } catch (e) {}
              try { osc.disconnect(); g.disconnect(); } catch (e) {}
              active.delete(handle);
            },
          };
          active.add(handle);
          osc.onended = () => { active.delete(handle); try { osc.disconnect(); g.disconnect(); } catch (e) {} };
          try { osc.start(t0); } catch (e) {}
          if (opts.duration) handle.stop(t0 + opts.duration);
          return handle;
        },
        stop() { for (const h of [...active]) h.stop(); },
        cancelAll() { for (const h of [...active]) h.cancel(); },
      };
    }

    /** Metronome click: a short pitched blip on its own bus. */
    /*
     * METRONOME SOUNDS. Every sound is built from oscillators, noise and
     * filters scheduled on the audio clock, and every one can be cancelled
     * before it starts (pause, seek, loop wrap). The voice is recorded speech
     * (lib/voice-counts.js, loaded on first use) started EARLY by each word's
     * measured perceptual onset, so "three" — which begins with a fricative —
     * lands on the beat as squarely as "eight".
     *   kind "beat": {beat (1..n), accent}   kind "sub": a subdivision tick
     */
    _makeClickPlayer() {
      const ctx = this.ctx, bus = this._clickBus, engine = this;
      const active = new Set();
      let noise = null;
      const noiseBuf = () => {
        if (noise) return noise;
        noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        return noise;
      };
      const track = (nodes, stopAt) => {
        const h = {
          cancel() {
            for (const n of nodes) { try { if (n.stop) n.stop(ctx.currentTime); } catch (e) {} try { n.disconnect(); } catch (e) {} }
            active.delete(h);
          },
        };
        active.add(h);
        const src = nodes.find((n) => n.stop);
        if (src) src.onended = () => { active.delete(h); for (const n of nodes) { try { n.disconnect(); } catch (e) {} } };
        return h;
      };
      const env = (t0, peak, decay) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(Math.max(peak, 1e-4), t0 + 0.0015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
        g.connect(bus);
        return g;
      };
      const tone = (t0, type, freq, peak, decay) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
        const g = env(t0, peak, decay); o.connect(g);
        o.start(t0); o.stop(t0 + decay + 0.02);
        return [o, g];
      };
      const burst = (t0, filterType, freq, q, peak, decay) => {
        const src = ctx.createBufferSource(); src.buffer = noiseBuf();
        const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
        const g = env(t0, peak, decay); src.connect(f); f.connect(g);
        src.start(t0); src.stop(t0 + decay + 0.02);
        return [src, f, g];
      };
      const SOUNDS = {
        classic: (t, acc, sub) => tone(t, "square", sub ? 1400 : (acc ? 1760 : 1175), sub ? 0.12 : (acc ? 0.5 : 0.3), 0.06),
        woodblock: (t, acc, sub) => [
          ...tone(t, "sine", sub ? 1500 : (acc ? 1250 : 930), sub ? 0.18 : (acc ? 0.8 : 0.55), 0.045),
          ...burst(t, "bandpass", sub ? 3200 : 2500, 4, sub ? 0.1 : 0.35, 0.012)],
        tick: (t, acc, sub) => burst(t, "highpass", sub ? 6000 : (acc ? 3000 : 4200), 0.7, sub ? 0.18 : (acc ? 0.9 : 0.6), acc ? 0.018 : 0.010),
        bell: (t, acc, sub) => {
          const f0 = sub ? 1760 : (acc ? 1320 : 880), pk = sub ? 0.08 : (acc ? 0.3 : 0.2), dec = sub ? 0.18 : 0.7;
          // inharmonic partials, the thing that makes a bell sound like a bell
          return [...tone(t, "sine", f0, pk, dec), ...tone(t, "sine", f0 * 2.76, pk * 0.45, dec * 0.6), ...tone(t, "sine", f0 * 5.4, pk * 0.25, dec * 0.35)];
        },
        cowbell: (t, acc, sub) => {
          // two square waves at 540/800 Hz through a band-pass: the classic drum-machine recipe
          const pk = sub ? 0.08 : (acc ? 0.35 : 0.24), dec = sub ? 0.08 : 0.25;
          const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 2640; f.Q.value = 1.2;
          const g = env(t, pk, dec); f.connect(g);
          const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
          o1.type = o2.type = "square";
          const k = acc && !sub ? 1.12 : 1;
          o1.frequency.setValueAtTime(540 * k, t); o2.frequency.setValueAtTime(800 * k, t);
          o1.connect(f); o2.connect(f); o1.start(t); o2.start(t); o1.stop(t + dec + 0.02); o2.stop(t + dec + 0.02);
          return [o1, o2, f, g];
        },
      };
      let voiceBufs = null, voiceLoading = null, lastVoice = null;
      const loadVoice = () => {
        if (voiceBufs || voiceLoading) return voiceLoading;
        voiceLoading = (async () => {
          if (!root.PT_VOICE && typeof document !== "undefined") {
            await new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = "lib/voice-counts.js"; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
          }
          const out = {};
          for (const lang of Object.keys(root.PT_VOICE || {})) {
            out[lang] = {};
            for (const [key, v] of Object.entries(root.PT_VOICE[lang])) {
              const b64 = v.data.slice(v.data.indexOf(",") + 1), bin = atob(b64), u = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
              const buf = await new Promise((res, rej) => { const r = ctx.decodeAudioData(u.buffer, res, rej); if (r && r.then) r.then(res, rej); });
              out[lang][key] = { buf, onset: v.onset || 0 };
            }
          }
          voiceBufs = out;
          return out;
        })().catch((e) => { console.warn("voice counts failed to load", e); voiceLoading = null; return null; });
        return voiceLoading;
      };
      const say = (t, key, lang, gain) => {
        const set = voiceBufs && (voiceBufs[lang] || voiceBufs.en);
        const clip = set && set[key];
        if (!clip) return null;
        const start = Math.max(ctx.currentTime, t - clip.onset);   // the word's vowel on the beat
        // a word still speaking when the next one starts is faded out, not doubled
        if (lastVoice && lastVoice.end > start) { try { lastVoice.g.gain.setTargetAtTime(0, start, 0.012); } catch (e) {} }
        const src = ctx.createBufferSource(); src.buffer = clip.buf;
        const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(bus);
        src.start(start); src.stop(start + clip.buf.duration + 0.01);
        lastVoice = { g, end: start + clip.buf.duration };
        return [src, g];
      };
      return {
        /** Legacy two-argument click. */
        click(when, freq, gain) {
          const t0 = Math.max(when == null ? ctx.currentTime : when, ctx.currentTime);
          track(tone(t0, "square", freq, gain, 0.06));
        },
        /** One metronome event in the configured style. */
        event(when, ev) {
          const t = Math.max(when == null ? ctx.currentTime : when, ctx.currentTime);
          const style = engine.metro.sound;
          const voiced = style === "voice" || (ev.countIn && engine.metro.countIn === "voice");
          // counts go up to eight; a longer bar (9/8, 23/16) ticks past it rather than miscount
          if (voiced && ev.kind === "beat" && voiceBufs && (ev.beat || 1) <= 8) {
            const n = say(t, String(ev.beat || 1), engine.metro.lang, ev.accent ? 1.0 : 0.8);
            if (n) return track(n);
          }
          if (voiced && ev.kind === "sub" && voiceBufs && ev.subdiv === 2) {
            const n = say(t, "and", engine.metro.lang, 0.55);
            if (n) return track(n);
          }
          const make = SOUNDS[voiced ? "woodblock" : style] || SOUNDS.classic;   // voice subdivisions tick softly
          return track(make(t, !!ev.accent, ev.kind === "sub"));
        },
        preloadVoice: loadVoice,
        cancelAll() { for (const h of [...active]) h.cancel(); lastVoice = null; },
      };
    }

    // ---- playback ----------------------------------------------------------
    /** Scheduled note. when = absolute ctx time (>= now). */
    playNote(midi, freq, durSec, when, velocity) {
      if (!this._started) return;
      const v = typeof velocity === "number" ? velocity : 0.8;
      const dur = Math.max(0.03, durSec);
      try {
        const h = this._player().play(midi, when, { duration: dur, gain: v });
        if (h) {
          this._scheduled.push(h);
          if (this._scheduled.length > 512) this._scheduled.splice(0, 256);
        }
      } catch (e) { /* never let a bad note break the scheduler */ }
    }

    /**
     * Drop every note the transport queued ahead. Notes that have not started
     * are killed silently; ones already sounding get a normal release. This is
     * what makes pause / seek / loop-wrap / wait-gates clean.
     */
    cancelScheduled() {
      const now = this.now();
      for (const h of this._scheduled) {
        if (!h) continue;
        try { (h.when != null && h.when > now + 0.001) ? h.cancel() : h.stop(now); } catch (e) {}
      }
      this._scheduled.length = 0;
      if (this._click && this._click.cancelAll) this._click.cancelAll();
    }

    /** Live note-on for MIDI input (held until noteOffLive). */
    noteOnLive(midi, freq, velocity) {
      if (!this._started) return;
      const v = typeof velocity === "number" ? velocity : 0.8;
      const prev = this._live.get(midi);
      if (prev) { try { prev.stop(this.now()); } catch (e) {} }
      try {
        const h = this._player().play(midi, this.now(), { gain: v });
        this._live.set(midi, h);
      } catch (e) {}
    }

    noteOffLive(midi) {
      const h = this._live.get(midi);
      if (h == null) return;
      this._live.delete(midi);
      // Sustain pedal down: the key is released but the pedal keeps it sounding.
      if (this._sustain) {
        const prev = this._sustained.get(midi);
        if (prev != null) this._releaseHandle(prev);
        this._sustained.set(midi, h);
        return;
      }
      this._releaseHandle(h);
    }

    _releaseHandle(h) {
      if (h && typeof h.stop === "function") { try { h.stop(this.now()); } catch (e) {} }
    }

    /** Sustain pedal (MIDI CC64). Lifting it releases pedal-held notes. */
    setSustain(on) {
      this._sustain = !!on;
      if (!this._sustain) {
        for (const h of this._sustained.values()) this._releaseHandle(h);
        this._sustained.clear();
      }
    }

    /** Release every live note (panic / CC123 / focus loss). */
    allNotesOff() {
      for (const h of this._live.values()) this._releaseHandle(h);
      this._live.clear();
      for (const h of this._sustained.values()) this._releaseHandle(h);
      this._sustained.clear();
    }

    /**
     * Metronome click at an absolute ctx time. Accented beats (downbeats) are
     * higher and a touch louder than the others.
     */
    /**
     * Metronome settings: sound "classic"|"woodblock"|"tick"|"bell"|"cowbell"|"voice",
     * countIn "off"|"voice"|"clicks", lang "en"|"ro". The voice clips load the first
     * time they are needed; until then a voice setting falls back to a wood block.
     */
    setMetronome(opts) {
      Object.assign(this.metro, opts || {});
      if (this.metro.sound === "voice" || this.metro.countIn === "voice") {
        const p = this._click.preloadVoice();
        if (p && p.then) p.then(() => { if (this.onVoiceReady) this.onVoiceReady(); });
      }
    }

    /** A metronome event on the audio clock (see _makeClickPlayer). */
    metronomeAt(when, ev) {
      if (!this._started) return;
      try { this._click.event(when, ev || { kind: "beat", beat: 1, accent: true }); } catch (e) {}
    }

    clickAt(when, accented) {
      if (!this._started) return;
      this.metronomeAt(when, { kind: "beat", beat: 1, accent: !!accented });
    }

    setClickVolume(linear) { this._clickBus.gain.value = Math.max(0, Math.min(1, linear)); }

    releaseAll() {
      this.cancelScheduled();
      try { this._synth.stop(); } catch (e) {}
      for (const inst of this._sfLoaded.values()) { if (inst && inst.stop) { try { inst.stop(); } catch (e) {} } }
      this._live.clear();
      this._sustained.clear();
    }

    setVolume(linear) {
      this._musicBus.gain.value = Math.max(0, Math.min(1, linear));
    }
  }

  root.PT = root.PT || {};
  root.PT.AudioEngine = AudioEngine;
})(typeof window !== "undefined" ? window : globalThis);
