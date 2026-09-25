/* ============================================================================
 * transport.js  —  Master clock + look-ahead scheduler
 * ----------------------------------------------------------------------------
 * Owns a virtual playhead in SONG seconds and schedules notes a little ahead
 * against the AudioContext clock (audioEngine.now()). One shared transport keeps
 * every view in sync.
 *
 * Features:
 *   - play / pause / stop / seek
 *   - tempo scaling (rate): songSeconds advance at `rate` per real second
 *     (rate<1 = slower for practice). Note durations are scaled to match.
 *   - A-B loop: when looping and the playhead passes B, it jumps back to A.
 *   - hold gate (wait mode): the playhead can be told to HOLD at a time; when it
 *     reaches it, it pauses there and fires onHold so the app can wait for input.
 *   - note filter: a predicate to mute certain notes (e.g. the hand you play).
 *
 * Clock model (real time t, song position P):
 *   P(t) = offset + (t - ctxStart) * rate           while playing
 *   real time for song position P:  ctxStart + (P - offset) / rate
 *   note duration in real seconds:  durSong / rate
 * Everything reads audioEngine.now() (the AudioContext currentTime), so the
 * synth and the sampled backends share one clock.
 *
 * BOUNDARY RULE (fixes double-triggered notes): the look-ahead window is
 * half-open — it stops just BEFORE a hold gate or a loop end. A note sitting
 * exactly on the gate must not be queued before the gate opens, or it sounds
 * once while the transport is still holding and a second time on resume.
 * Everything the scheduler queued is handed to engine.cancelScheduled() on any
 * discontinuity (pause / stop / seek / wrap / hold), so nothing leaks past it.
 * ========================================================================== */
(function (root) {
  "use strict";

  const LOOKAHEAD = 0.12;  // real seconds scheduled ahead
  const TICK_MS = 25;
  const MIN_LEAD = 0.005;
  const BOUNDARY_EPS = 1e-4; // keep notes exactly on a gate/loop-end out of the window
  // Metronome events are queued further ahead than notes: a spoken count has
  // to START before its beat (by the word's perceptual onset, up to ~120 ms),
  // which is impossible if the beat is only discovered 20 ms before it falls.
  const METRO_EXTRA = 0.15;
  const COUNTIN_LEAD = 0.14; // the count-in's first word needs the same head start

  class Transport {
    constructor(audioEngine) {
      this.engine = audioEngine;
      this.song = null;

      this._playing = false;
      this._offset = 0;          // song seconds at last (re)start
      this._ctxStart = 0;        // ctx time at last (re)start
      this._nextIdx = 0;
      this._timer = null;
      this.rate = 1;             // tempo scale (1 = authored tempo)

      this.loop = null;          // { a, b } song seconds, or null
      this.holdTime = null;      // song seconds to hold at (wait mode), or null
      this._held = false;

      this.noteFilter = null;    // (note) => bool : false to mute

      // Metronome: { enabled, beatsPerMeasure, beatTimeFor(k)->songSec|null,
      //              accentFor(k)->bool (optional) }.
      // beatTimeFor maps beat index k to song seconds — supplied by the app so
      // sheet pieces click through their real tempo map while MIDI pieces use a
      // constant beat. null/undefined past the end stops the clicks.
      this.metronome = null;
      this._nextBeat = 0;
      this._preRoll = 0;         // real seconds of count-in still pending

      // callbacks
      this.onStateChange = null; // (isPlaying)
      this.onEnd = null;         // ()
      this.onHold = null;        // (timeSec) — reached a hold gate
      this.onLoop = null;        // (aSec)
    }

    load(song) { this.stop(); this.song = song; this._offset = 0; }

    get duration() { return this.song ? this.song.durationSec : 0; }
    get isPlaying() { return this._playing; }
    /** True while the count-in clicks are running and the music hasn't started. */
    get inCountIn() { return this._playing && this.engine.now() < this._ctxStart; }

    get position() {
      if (!this.song) return 0;
      let pos = this._offset;
      if (this._playing) {
        pos = (this.engine.now() - this._ctxStart) * this.rate + this._offset;
        // During a count-in pre-roll the clock anchor sits in the future, which
        // would compute a position before the start point — hold the display at
        // the start until the music actually begins.
        if (pos < this._offset) pos = this._offset;
      }
      if (pos < 0) pos = 0;
      if (pos > this.duration) pos = this.duration;
      return pos;
    }

    setRate(r) {
      r = Math.max(0.1, Math.min(2, r || 1));
      if (this._playing) {
        if (this.inCountIn) {
          // Re-anchor without collapsing the remaining count-in.
          const remaining = (this._ctxStart - this.engine.now()) * (this.rate / r);
          this._ctxStart = this.engine.now() + remaining;
        } else {
          this._offset = this.position;
          this._ctxStart = this.engine.now();
        }
        // Anything already queued was timed at the old rate.
        this._unschedule();
        this._nextIdx = this._firstIndexAtOrAfter(this._offset);
        this._nextBeat = this._firstBeatAtOrAfter(this._offset);
      }
      this.rate = r;
    }

    setLoop(aSec, bSec) {
      if (aSec == null || bSec == null) { this.loop = null; return; }
      const a = Math.max(0, Math.min(aSec, bSec));
      const b = Math.min(this.duration, Math.max(aSec, bSec));
      this.loop = (b - a > 0.05) ? { a, b } : null;
    }
    clearLoop() { this.loop = null; }

    setHold(timeSec) { this.holdTime = timeSec; this._held = false; }
    clearHold() { this.holdTime = null; this._held = false; }

    _unschedule() { if (this.engine.cancelScheduled) this.engine.cancelScheduled(); }

    _ctxTimeFor(songSec) {
      const t = this._ctxStart + (songSec - this._offset) / this.rate;
      const floor = this.engine.now() + MIN_LEAD;
      return t < floor ? floor : t;
    }

    _emitState() { if (this.onStateChange) this.onStateChange(this._playing); }

    _firstIndexAtOrAfter(songSec) {
      const notes = this.song ? this.song.notes : null;
      if (!notes || !notes.length) return 0;
      let lo = 0, hi = notes.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].startSec < songSec - 1e-6) lo = m + 1; else hi = m; }
      return lo;
    }

    play(opts) {
      if (!this.song || this._playing) return;
      this._playing = true;
      this._held = false;

      // Count-in: one measure of clicks BEFORE the music. The clock anchor is
      // pushed into the future by the pre-roll length, so every note keeps its
      // normal scheduling math and simply starts after the clicks.
      let pre = 0, bar = 0;
      if (opts && opts.countIn && this.metronome && this.metronome.beatsPerMeasure) {
        bar = this._countInRealSec();
        pre = bar + COUNTIN_LEAD;
      }
      this._ctxStart = this.engine.now() + pre;
      this._preRoll = pre;
      if (pre > 0) this._scheduleCountIn(bar);

      this._nextIdx = this._firstIndexAtOrAfter(this._offset);
      this._nextBeat = this._firstBeatAtOrAfter(this._offset);
      this._startTimer();
      this._emitState();
    }

    /**
     * Cut the count-in short and start the music now. The clicks are already
     * queued in the audio graph, so they have to be cancelled rather than just
     * forgotten, and the clock anchor moves to this instant so every note keeps
     * its normal scheduling maths.
     */
    skipCountIn() {
      if (!this._playing || !this.inCountIn) return false;
      this._unschedule();
      this._ctxStart = this.engine.now();
      this._preRoll = 0;
      this._nextIdx = this._firstIndexAtOrAfter(this._offset);
      this._nextBeat = this._firstBeatAtOrAfter(this._offset);
      this._schedule();
      return true;
    }

    /** Real-seconds length of a one-measure count-in at the current start. */
    _countInRealSec() {
      const m = this.metronome;
      const beats = m.beatsPerMeasure || 4;
      let spacingSong = 0.5;
      if (m.beatTimeFor) {
        const k0 = this._firstBeatAtOrAfter(this._offset);
        const t0 = m.beatTimeFor(k0), t1 = m.beatTimeFor(k0 + 1);
        if (t0 != null && t1 != null && t1 > t0) spacingSong = t1 - t0;
      }
      return (beats * spacingSong) / this.rate;
    }

    _scheduleCountIn(barRealSec) {
      const m = this.metronome || {};
      const beats = m.beatsPerMeasure || 4;
      const spacing = barRealSec / beats;
      const t0 = this.engine.now() + COUNTIN_LEAD;
      for (let i = 0; i < beats; i++) {
        const when = t0 + i * spacing;
        if (this.engine.metronomeAt) this.engine.metronomeAt(when, { kind: "beat", beat: i + 1, accent: i === 0, countIn: true });
        else if (this.engine.clickAt) this.engine.clickAt(when, i === 0);
        // subdivisions in the count-in too, so the first bar starts with the pulse you'll hear
        const sub = m.subdiv || 1;
        for (let j = 1; j < sub && this.engine.metronomeAt; j++) {
          this.engine.metronomeAt(when + (j * spacing) / sub, { kind: "sub", subdiv: sub, countIn: true });
        }
      }
    }

    /** First metronome beat index whose time is at/after songSec. */
    _firstBeatAtOrAfter(songSec) {
      const m = this.metronome;
      if (!m || !m.beatTimeFor) return 0;
      const t = (k) => m.beatTimeFor(k);
      if (t(0) == null || t(0) >= songSec - 1e-6) return 0;
      let lo = 0, hi = 1;
      while (t(hi) != null && t(hi) < songSec - 1e-6) {
        lo = hi; hi *= 2;
        if (hi > 1 << 20) break;
      }
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const v = t(mid);
        if (v == null || v >= songSec - 1e-6) hi = mid; else lo = mid + 1;
      }
      return lo;
    }

    pause() {
      if (!this._playing) return;
      this._offset = this.position;
      this._playing = false;
      this._stopTimer();
      this._unschedule();
      this.engine.releaseAll();
      this._emitState();
    }

    stop() {
      this._playing = false;
      this._stopTimer();
      this._offset = 0;
      this._nextIdx = 0;
      this._held = false;
      this._unschedule();
      this.engine.releaseAll();
      this._emitState();
    }

    seek(sec) {
      const clamped = Math.max(0, Math.min(this.duration, sec));
      const wasPlaying = this._playing;
      if (wasPlaying) { this._stopTimer(); this._unschedule(); this.engine.releaseAll(); }
      this._offset = clamped;
      this._playing = false;
      this._held = false;
      if (wasPlaying) this.play();
      else this._emitState();
    }

    _startTimer() {
      this._stopTimer();
      this._schedule();
      this._timer = setInterval(() => this._schedule(), TICK_MS);
    }
    _stopTimer() { if (this._timer !== null) { clearInterval(this._timer); this._timer = null; } }

    _schedule() {
      if (!this._playing || !this.song) return;
      const pos = this.position;

      // A-B loop wrap.
      if (this.loop && pos >= this.loop.b - 1e-6) {
        this._wrapTo(this.loop.a);
        if (this.onLoop) this.onLoop(this.loop.a);
        return;
      }

      // Hold gate (wait mode).
      if (this.holdTime != null && !this._held && pos >= this.holdTime - 1e-6) {
        this._offset = this.holdTime;
        this._playing = false;
        this._held = true;
        this._stopTimer();
        this._unschedule();
        this.engine.releaseAll();
        this._emitState();
        if (this.onHold) this.onHold(this.holdTime);
        return;
      }

      // End of piece.
      if (pos >= this.duration - 1e-6) { this.stop(); if (this.onEnd) this.onEnd(); return; }

      // Half-open horizon: never queue the note that sits ON a gate/loop end.
      const horizon = pos + LOOKAHEAD * this.rate;
      let cap = horizon;
      if (this.loop) cap = Math.min(cap, this.loop.b - BOUNDARY_EPS);
      if (this.holdTime != null) cap = Math.min(cap, this.holdTime - BOUNDARY_EPS);

      const notes = this.song.notes;
      while (this._nextIdx < notes.length && notes[this._nextIdx].startSec <= cap) {
        const n = notes[this._nextIdx];
        if (n.startSec >= this._offset - 1e-6) {
          if (!this.noteFilter || this.noteFilter(n)) {
            const when = this._ctxTimeFor(n.startSec);
            // backing parts sit behind the part being practised
            this.engine.playNote(n.midi, n.freq, n.durSec / this.rate, when, n.backing ? 0.42 : 0.82);
          }
        }
        this._nextIdx++;
      }

      // Metronome clicks ride the same look-ahead window, mapped through the
      // piece's beat grid so tempo changes in the score click correctly.
      const m = this.metronome;
      if (m && m.enabled && m.beatTimeFor && (this.engine.metronomeAt || this.engine.clickAt)) {
        const beats = m.beatsPerMeasure || 4;
        // the metronome looks further ahead (see METRO_EXTRA), but never past
        // a loop end, a hold gate or the end of the piece
        let limit = this.duration + 1e-6;
        if (this.loop) limit = Math.min(limit, this.loop.b - BOUNDARY_EPS);
        if (this.holdTime != null) limit = Math.min(limit, this.holdTime - BOUNDARY_EPS);
        const mcap = Math.min(limit, pos + (LOOKAHEAD + METRO_EXTRA) * this.rate);
        const sub = m.subdiv || 1;
        for (;;) {
          const bt = m.beatTimeFor(this._nextBeat);
          if (bt == null || bt > mcap) break;
          if (bt >= this._offset - 1e-6) {
            const k = this._nextBeat;
            const accented = m.accentFor ? !!m.accentFor(k) : (k % beats === 0);
            const beat = m.beatInBar ? m.beatInBar(k) : (k % beats) + 1;
            if (this.engine.metronomeAt) this.engine.metronomeAt(this._ctxTimeFor(bt), { kind: "beat", beat, accent: accented });
            else this.engine.clickAt(this._ctxTimeFor(bt), accented);
            if (sub > 1 && this.engine.metronomeAt) {
              const nb = m.beatTimeFor(k + 1);
              if (nb != null) for (let j = 1; j < sub; j++) {
                const ts = bt + (j * (nb - bt)) / sub;
                if (ts >= limit) break;                    // never tick past a loop end or gate
                this.engine.metronomeAt(this._ctxTimeFor(ts), { kind: "sub", subdiv: sub });
              }
            }
          }
          this._nextBeat++;
        }
      }
    }

    _wrapTo(aSec) {
      this._unschedule();
      this.engine.releaseAll();
      this._offset = aSec;
      this._ctxStart = this.engine.now();
      this._nextIdx = this._firstIndexAtOrAfter(aSec);
      this._nextBeat = this._firstBeatAtOrAfter(aSec);
    }
  }

  root.PT = root.PT || {};
  root.PT.Transport = Transport;
})(typeof window !== "undefined" ? window : globalThis);
