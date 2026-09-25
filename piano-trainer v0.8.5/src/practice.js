/* ============================================================================
 * practice.js  —  Practice modes, note gating, scoring, and timing analysis
 * ----------------------------------------------------------------------------
 * Turns a parsed `song` into an ordered list of "gate" events (one per onset of
 * the practiced hand[s]) and tracks how the player's MIDI input matches them.
 *
 * Modes:
 *   listen  — the app just plays the piece; no scoring, no gating.
 *   follow  — the piece plays at tempo; your hits are scored against the
 *             nearest upcoming gate within a timing window (your hand muted in
 *             audio so you supply it). Misses are counted when a gate passes.
 *   wait    — the playhead HOLDS at each gate until you press the required
 *             notes, then continues. Best for learning notes before timing.
 *             A chord must be HELD TOGETHER: every required note has to be
 *             struck after the gate opened and still be down at the moment
 *             the last one lands. Pressing C, letting go, then E, then G used
 *             to pass — which trains exactly the wrong thing.
 *
 * Practiced hand: "both" | "right" | "left" decides which staff's notes are
 * required/scored (staff 0 = RH, staff >=1 = LH).
 *
 * Scoring: correct / wrong / missed, accuracy %, current & best streak, and a
 * simple points tally.
 *
 * NOTE LENGTH: pressing the right key at the right moment is only two thirds
 * of playing a note. How long you HOLD it is the third. Every matched hit is
 * timed from press to release in SONG seconds and compared with the notated
 * duration, so the measure is independent of practice tempo.
 *
 * lengthMode decides what that measurement DOES:
 *   "off"     — not measured.
 *   "report"  — measured and shown, but a note is correct the instant it is
 *               struck, however briefly you hold it.
 *   "strict"  — the DEFAULT. A note is not correct until it has been held for
 *               its length. In Follow, a clipped or overheld note becomes a
 *               length error and comes off the accuracy. In Wait, the gate
 *               does not open until the chord has been HELD for most of its
 *               written value (at the current tempo, capped so a whole note at
 *               a crawl doesn't take four seconds); let go early and the gate
 *               stays shut and that note must be struck again.
 *
 * TIMING ANALYSIS (follow mode): a hit is not just right or wrong — it lands
 * early or late by a measurable amount. Every matched hit stores its signed
 * offset (negative = early, positive = late) so the app can report mean offset
 * and spread. That distinguishes the two failure modes a "% correct" number
 * hides: consistently rushing (mean far from zero, small spread — a tempo
 * problem) versus unsteadiness (mean near zero, large spread — a control
 * problem). They need different practice, so they should not read the same.
 * ========================================================================== */
(function (root) {
  "use strict";

  const ONSET_EPS = 0.012;        // group notes within 12 ms as one onset
  const DEFAULT_WINDOW = 0.35;    // ± seconds a hit may land from a gate (follow)
  const ONTIME_MS = 60;           // inside this, a hit reads as "on time"

  // Note-length judgement. Pianists routinely release a shade early even when
  // playing legato, so the band is deliberately generous and asymmetric; only
  // a clearly clipped or clearly overheld note is called out. Notes shorter
  // than MIN_JUDGED_SEC are skipped — at speed the release of a semiquaver
  // says more about the action of the key than about the player.
  const SHORT_RATIO = 0.55;
  const LONG_RATIO = 1.75;
  const MIN_JUDGED_SEC = 0.12;
  // Wait mode, strict: hold a chord for this fraction of its shortest written
  // value before the gate opens, but never longer than HOLD_CAP_SEC of real
  // time — a whole note at 40% tempo would otherwise take a five-second hold.
  const HOLD_FRACTION = 0.7;
  const HOLD_CAP_SEC = 1.2;

  // Named windows so the demand can grow with the player.
  const WINDOWS = { relaxed: 0.5, normal: 0.35, strict: 0.18 };

  function handMatches(hand, staff) {
    if (hand === "both") return true;
    if (hand === "right") return staff === 0;
    return staff >= 1; // left
  }

  class Practice {
    constructor() {
      this.mode = "listen";
      this.hand = "both";
      this.window = DEFAULT_WINDOW;
      this.lengthMode = "strict";  // "off" | "report" | "strict"
      this._rateGetter = null;     // () => transport rate, for the wait-mode hold
      this._holdTimer = null;      // wait-mode: pending gate open
      this._holdUntil = 0;
      this.events = [];          // [{ index, timeSec, required:Set<midi>, all:Set<midi> }]
      this.gateIndex = 0;        // next gate to satisfy (wait mode)
      this.pressedForGate = new Set();
      this.score = this._freshScore();
      this.lastHit = null;       // { type, offsetSec, grade } for the newest press

      // callbacks (assigned by app)
      this.onGateOpen = null;    // (event) => void   — wait: now waiting for these
      this.onGateCleared = null; // (event) => void   — wait: requirements met
      this.onScore = null;       // (score, accuracy) => void
      this.onFeedback = null;    // ({midi, type, grade, offsetSec}) => void
      this.onLength = null;      // ({midi, ratio, verdict}) => void
      this.onGateProgress = null;// ({held, required, event}) => void — wait: partial chord
      this.onHolding = null;     // ({event, sec}) => void — wait: chord down, now hold it
      this._holding = new Map(); // midi -> { pressedAt, notated } while held
      this._down = new Set();    // every key physically down right now (wait)
    }

    /** How note length is treated: "off", "report", or "strict" (default). */
    setLengthMode(m) {
      this.lengthMode = (m === "off" || m === "report") ? m : "strict";
      if (this.lengthMode !== "strict") this._cancelHold();
    }
    setRateGetter(fn) { this._rateGetter = fn; }

    /** Timing window, by name ("relaxed"|"normal"|"strict") or in seconds. */
    setWindow(w) {
      const v = typeof w === "string" ? WINDOWS[w] : w;
      this.window = (typeof v === "number" && v > 0.02) ? v : DEFAULT_WINDOW;
    }

    _freshScore() {
      return { correct: 0, wrong: 0, missed: 0, total: 0, streak: 0, bestStreak: 0, points: 0,
               errorTimes: [],    // song-seconds of each wrong press (for drilling)
               missTimes: [],     // song-seconds of each missed note (for drilling)
               offsets: [],       // signed seconds, matched follow-mode hits
               lengths: [],       // held / notated ratio per released note
               lengthErrors: 0 }; // strict: right note, wrong length
    }

    _recordError() {
      const t = this.mode === "wait"
        ? (this.events[this.gateIndex] ? this.events[this.gateIndex].timeSec : 0)
        : (this._positionGetter ? this._positionGetter() : 0);
      this.score.errorTimes.push(t);
    }

    /** Build gate events for the song restricted to the practiced hand(s). */
    build(song, mode, hand) {
      this.mode = mode || "listen";
      this.hand = hand || "both";
      this.events = [];
      this.gateIndex = 0;
      this._followCursor = 0;
      this.pressedForGate = new Set();
      this.score = this._freshScore();
      this.lastHit = null;
      this._holding = new Map();

      if (!song || !song.notes.length) { this._emitScore(); return; }

      // Group notes by onset time.
      const groups = [];
      let cur = null;
      for (const n of song.notes) {
        if (!cur || n.startSec - cur.t > ONSET_EPS) {
          cur = { t: n.startSec, notes: [] };
          groups.push(cur);
        }
        cur.notes.push(n);
      }

      let idx = 0;
      for (const g of groups) {
        const required = new Set();
        const all = new Set();
        for (const n of g.notes) {
          all.add(n.midi);
          if (this.isAsked(n)) required.add(n.midi);
        }
        // Only onsets that involve the practiced hand become gates.
        if (required.size > 0) {
          const durations = new Map();
          for (const n of g.notes) {
            if (this.isAsked(n)) {
              // a repeated pitch in one onset: keep the longer written value
              durations.set(n.midi, Math.max(durations.get(n.midi) || 0, n.durSec));
            }
          }
          this.events.push({ index: idx++, timeSec: g.t, required, all, durations });
        }
      }
      this.score.total = this.events.reduce((s, e) => s + e.required.size, 0);
      this._emitScore();
    }

    /**
     * Is this note asked of the player? Not if it is backing (another
     * instrument of an arrangement), and not if its key isn't on the player's
     * keyboard — a Wait gate that needs a key you don't have can never open.
     * Those notes are played by the app instead.
     */
    isAsked(note) {
      if (note.backing || note.unreachable) return false;
      if (this._playable && !this._playable(note)) return false;
      return handMatches(this.hand, note.staff);
    }
    /** fn(note) -> can the player's keyboard produce it? (null = assume yes) */
    setPlayable(fn) { this._playable = fn || null; }

    /** Notes the app should MUTE in audio (the practiced hand you play yourself). */
    shouldMute(note) {
      if (this.mode === "listen") return false;
      return this.isAsked(note);
    }

    /** In wait mode, the time the transport should hold at (or null). */
    nextGateTime() {
      if (this.mode !== "wait") return null;
      if (this.gateIndex >= this.events.length) return null;
      return this.events[this.gateIndex].timeSec;
    }

    /** Called by the app when the transport reaches/holds at the current gate. */
    openCurrentGate() {
      if (this.mode !== "wait") return null;
      const e = this.events[this.gateIndex];
      if (!e) return null;
      // pressedForGate is NOT wiped here. It was reset when the previous gate
      // cleared, so anything in it now was struck while the playhead travelled
      // to this gate — anticipation, which should count. (A key merely HELD
      // over from the previous chord was never re-struck, so it isn't in it.)
      if (this.onGateOpen) this.onGateOpen(e);
      return e;
    }

    /** Required MIDI notes for the current (open) gate, for UI highlighting. */
    currentRequired() {
      const e = this.events[this.gateIndex];
      return e ? e.required : new Set();
    }

    /** The gate the player is working on right now (wait mode), or null. */
    currentGate() { return this.events[this.gateIndex] || null; }

    /** Handle a played note. Returns 'correct' | 'wrong' | 'ignored'. */
    noteOn(midi) {
      if (this.mode === "wait") return this._noteOnWait(midi);
      if (this.mode === "follow") return this._noteOnFollow(midi);
      return "ignored"; // listen
    }

    _grade(offsetSec) {
      if (offsetSec == null) return "ontime";
      const ms = offsetSec * 1000;
      if (Math.abs(ms) <= ONTIME_MS) return "ontime";
      return ms < 0 ? "early" : "late";
    }

    _noteOnWait(midi) {
      this._down.add(midi);
      const e = this.events[this.gateIndex];
      if (!e) { this.lastHit = { type: "ignored", offsetSec: null, grade: "ontime" }; return "ignored"; }
      if (e.required.has(midi)) {
        if (!this.pressedForGate.has(midi)) {
          this.pressedForGate.add(midi);
          this._credit(true);
          this._feedback(midi, "correct", "ontime", null, e);
        }
        // The gate clears only when EVERY required note was struck since the
        // PREVIOUS gate cleared (so a note played early, while the playhead
        // travelled here, counts) AND is still physically down now. A note
        // merely held over from the last chord was never re-struck, so it
        // must be struck again; the "still down" condition is what makes a
        // chord a chord.
        const together = [...e.required].every((m) => this.pressedForGate.has(m) && this._down.has(m));
        if (together) {
          if (this.lengthMode === "strict") this._beginHold(e);
          else this._clearGate(e);
        } else if (e.required.size > 1 && this.onGateProgress) {
          const held = [...e.required].filter((m) => this.pressedForGate.has(m) && this._down.has(m));
          this.onGateProgress({ held, required: [...e.required], event: e });
        }
        return "correct";
      }
      this._credit(false);
      this._recordError();
      this._feedback(midi, "wrong", null, null, e);
      return "wrong";
    }

    /** Open the gate: advance first, then announce (see note on ordering). */
    _clearGate(e) {
      // ORDER MATTERS. The app's onGateCleared handler resumes the transport,
      // whose scheduler can reach the next hold and fire onGateOpen
      // SYNCHRONOUSLY inside that call. Advance first, then announce, or the
      // old gate gets re-opened.
      this._cancelHold();
      this.gateIndex++;
      this.pressedForGate = new Set();
      if (this.onGateCleared) this.onGateCleared(e);
    }

    /** Real seconds a chord must be held before its gate opens (strict wait). */
    holdSecFor(e) {
      let shortest = Infinity;
      for (const m of e.required) {
        const d = e.durations && e.durations.get(m);
        if (d && d < shortest) shortest = d;
      }
      if (!isFinite(shortest)) return 0;
      const rate = (this._rateGetter && this._rateGetter()) || 1;
      return Math.min(HOLD_CAP_SEC, (HOLD_FRACTION * shortest) / rate);
    }

    _beginHold(e) {
      this._cancelHold();
      const sec = this.holdSecFor(e);
      if (sec <= 0.05) { this._clearGate(e); return; }
      this._holdUntil = Date.now() + sec * 1000;
      if (this.onHolding) this.onHolding({ event: e, sec });
      this._holdTimer = setTimeout(() => {
        this._holdTimer = null;
        // Every required note still down? Then it was held for its length.
        const still = [...e.required].every((m) => this._down.has(m));
        if (still && this.events[this.gateIndex] === e) this._clearGate(e);
      }, sec * 1000);
    }

    _cancelHold() {
      if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
      this._holdUntil = 0;
    }

    /** Seconds still to hold before the current wait gate opens (0 = none). */
    holdRemaining() { return this._holdTimer ? Math.max(0, (this._holdUntil - Date.now()) / 1000) : 0; }

    _noteOnFollow(midi) {
      // Match against the nearest gate (by current playhead) requiring this note.
      const t = this._positionGetter ? this._positionGetter() : 0;
      let bestI = -1, bestDt = Infinity, bestSigned = 0;
      for (let i = Math.max(0, this._followCursor - 2); i < this.events.length; i++) {
        const e = this.events[i];
        const signed = t - e.timeSec;          // + = you were late
        const dt = Math.abs(signed);
        if (dt > this.window + 0.2 && e.timeSec > t) break;
        if (e.required.has(midi) && !(e._matched && e._matched.has(midi))) {
          if (dt < bestDt) { bestDt = dt; bestI = i; bestSigned = signed; }
        }
      }
      if (bestI >= 0 && bestDt <= this.window) {
        const e = this.events[bestI];
        e._matched = e._matched || new Set();
        e._matched.add(midi);
        e._offsets = e._offsets || [];
        e._offsets.push(bestSigned);
        this.score.offsets.push(bestSigned);
        // remember the press so noteOff can measure how long it was held
        this._holding = this._holding || new Map();
        this._holding.set(midi, { pressedAt: t, notated: (e.durations && e.durations.get(midi)) || 0, event: e });
        const grade = this._grade(bestSigned);
        this._credit(true);
        this._feedback(midi, "correct", grade, bestSigned, e);
        return "correct";
      }
      this._credit(false);
      this._recordError();
      this._feedback(midi, "wrong", null, null);
      return "wrong";
    }

    /**
     * Key released. In follow mode this closes the length measurement opened by
     * the matching noteOn. Returns 'short' | 'good' | 'long' | null.
     */
    noteOff(midi) {
      this._down.delete(midi);
      if (this.mode === "wait") {
        const e = this.events[this.gateIndex];
        // Let go during the hold: the note was clipped. The gate stays shut and
        // that note has to be struck again (the others, still down, stand).
        if (this._holdTimer && e && e.required.has(midi)) {
          this._cancelHold();
          this.pressedForGate.delete(midi);
          this.score.lengthErrors++;
          this.score.streak = 0;
          this._emitScore();
          if (this.onLength) this.onLength({ midi, ratio: 0, verdict: "short", event: e });
          return "short";
        }
        // Letting go of part of a half-built chord: say so, so the player
        // knows why nothing advanced.
        if (e && e.required.size > 1 && this.pressedForGate.has(midi) && this.onGateProgress) {
          const held = [...e.required].filter((m) => this.pressedForGate.has(m) && this._down.has(m));
          this.onGateProgress({ held, required: [...e.required], event: e });
        }
        return null;
      }
      if (this.lengthMode === "off") { this._holding && this._holding.delete(midi); return null; }
      if (this.mode !== "follow" || !this._holding) return null;
      const rec = this._holding.get(midi);
      if (!rec) return null;
      this._holding.delete(midi);
      if (!rec.notated || rec.notated < MIN_JUDGED_SEC) return null;
      const t = this._positionGetter ? this._positionGetter() : 0;
      const held = t - rec.pressedAt;                 // song seconds, tempo-free
      if (held <= 0) return null;
      const ratio = held / rec.notated;
      this.score.lengths.push(ratio);
      const verdict = ratio < SHORT_RATIO ? "short" : (ratio > LONG_RATIO ? "long" : "good");
      if (verdict !== "good" && this.lengthMode === "strict") {
        // Right note, wrong length: it comes off the accuracy.
        this.score.lengthErrors++;
        this.score.streak = 0;
        this._emitScore();
      }
      if (this.onLength) this.onLength({ midi, ratio, verdict, event: rec.event || null });
      return verdict;
    }

    /** Drop any half-finished length measurements (seek, stop, loop wrap). */
    clearHeld() { if (this._holding) this._holding.clear(); }
    /** Forget which keys are down (focus loss, all-notes-off). */
    releaseAllKeys() { this._down.clear(); this._cancelHold(); }

    /**
     * How the held lengths came out.
     * median — the typical ratio of played length to written length. Below 1
     *          you are clipping notes, above 1 you are running them together.
     * The median rather than the mean, because one note left down while you
     * reach for the next would drag an average a long way.
     */
    lengthStats() {
      const l = this.score.lengths;
      if (!l || !l.length) return { n: 0, median: 1, short: 0, good: 0, long: 0 };
      const sorted = l.slice().sort((a, b) => a - b);
      const mid = sorted.length >> 1;
      const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      let short = 0, good = 0, long = 0;
      for (const r of l) { if (r < SHORT_RATIO) short++; else if (r > LONG_RATIO) long++; else good++; }
      return { n: l.length, median, short, good, long };
    }

    /** Follow mode: call as the playhead passes gates to count missed notes. */
    advanceFollowTo(posSec) {
      if (this.mode !== "follow") return;
      while (this._followCursor < this.events.length &&
             this.events[this._followCursor].timeSec + this.window < posSec) {
        const e = this.events[this._followCursor];
        const matched = e._matched ? e._matched.size : 0;
        const missed = e.required.size - matched;
        if (missed > 0) {
          e._missed = missed;
          this.score.missed += missed;
          this.score.missTimes.push(e.timeSec);
          this.score.streak = 0;
          this._emitScore();
        }
        this._followCursor++;
      }
    }

    setPositionGetter(fn) { this._positionGetter = fn; }

    resetRun() {
      this.gateIndex = 0;
      this.pressedForGate = new Set();
      this._followCursor = 0;
      for (const e of this.events) { delete e._matched; delete e._offsets; delete e._missed; }
      this.score = this._freshScore();
      this.score.total = this.events.reduce((s, e) => s + e.required.size, 0);
      this.lastHit = null;
      this.clearHeld();
      this._cancelHold();
      this._emitScore();
    }

    /**
     * Rewind to a position WITHOUT wiping the score — used on A-B loop wraps so
     * drilling a passage accumulates attempt statistics (accuracy is
     * attempts-based, so re-attempting the same notes is counted fairly).
     * Gates/matches at or after posSec become available again.
     */
    resetTo(posSec) {
      let i = 0;
      while (i < this.events.length && this.events[i].timeSec < posSec - 1e-6) i++;
      this.gateIndex = i;
      this._followCursor = i;
      this.pressedForGate = new Set();
      this.clearHeld();
      this._cancelHold();
      for (let j = i; j < this.events.length; j++) {
        delete this.events[j]._matched; delete this.events[j]._offsets; delete this.events[j]._missed;
      }
    }

    _credit(correct) {
      if (correct) {
        this.score.correct++;
        this.score.streak++;
        this.score.bestStreak = Math.max(this.score.bestStreak, this.score.streak);
        this.score.points += 10 + Math.min(40, this.score.streak); // streak bonus
      } else {
        this.score.wrong++;
        this.score.streak = 0;
      }
      this._emitScore();
    }

    accuracy() {
      const judged = this.score.correct + this.score.wrong + this.score.missed;
      if (!judged) return 100;
      // In strict mode a clipped or overheld note was the right note, so it is
      // still counted in `correct` for the streak and the points — but it is
      // not a correct NOTE, so it comes off the accuracy.
      const good = Math.max(0, this.score.correct - (this.lengthMode === "strict" ? this.score.lengthErrors : 0));
      return Math.round((good / judged) * 100);
    }

    /**
     * Timing summary of the matched hits so far.
     * mean  — signed average offset in ms (negative = rushing, positive = dragging)
     * sd    — standard deviation in ms: how STEADY you are, independent of
     *         whether you are ahead or behind. A player 80 ms ahead every single
     *         time has a tempo problem; one averaging 0 ms with an 80 ms spread
     *         has a steadiness problem. Both would show the same accuracy %.
     */
    timingStats() {
      const o = this.score.offsets;
      const n = o.length;
      if (!n) return { n: 0, meanMs: 0, sdMs: 0, absMeanMs: 0, early: 0, late: 0, ontime: 0 };
      let sum = 0, absSum = 0, early = 0, late = 0, ontime = 0;
      for (const v of o) {
        sum += v; absSum += Math.abs(v);
        const g = this._grade(v);
        if (g === "early") early++; else if (g === "late") late++; else ontime++;
      }
      const mean = sum / n;
      let varSum = 0;
      for (const v of o) varSum += (v - mean) * (v - mean);
      return {
        n,
        meanMs: Math.round(mean * 1000),
        sdMs: Math.round(Math.sqrt(varSum / n) * 1000),
        absMeanMs: Math.round((absSum / n) * 1000),
        early, late, ontime,
      };
    }

    /** Song-seconds where things went wrong (wrong presses + misses). */
    errorTimes() {
      return (this.score.errorTimes || []).concat(this.score.missTimes || []);
    }

    _emitScore() { if (this.onScore) this.onScore(this.score, this.accuracy()); }
    _feedback(midi, type, grade, offsetSec, event) {
      this.lastHit = { midi, type, grade: grade || null, offsetSec: offsetSec == null ? null : offsetSec,
                       event: event || null };
      if (this.onFeedback) this.onFeedback(this.lastHit);
    }
  }

  // init follow cursor lazily
  Practice.prototype._followCursor = 0;

  const api = { Practice };
  /**
   * The single audio policy for the hand selector ("the hand you're working
   * on"): in LISTEN it SOLOS that hand — only it plays; in FOLLOW/WAIT it is
   * muted (the player supplies it) while the app plays the other hand.
   * Returns true if a note on `staff` should be heard.
   */
  /*
   * WHAT THE APP PLAYS BY ITSELF.
   *   Listen: everything, or only the selected hand (a solo).
   *   Follow / Wait: nothing of the part you are learning — you make those
   *   sounds — and, when you practise one hand, not the other hand either
   *   (it used to play along; a learner asked for silence). hearOther brings
   *   the other hand back as accompaniment (Settings -> Coach).
   * With both hands selected the app used to play EVERY note in Follow and
   * Wait while you played them too, so each of your notes sounded twice.
   */
  function audioAllows(mode, hand, staff, hearOther) {
    const both = !hand || hand === "both";
    if (mode === "listen") return both ? true : handMatches(hand, staff);
    if (both) return false;
    return !!hearOther && !handMatches(hand, staff);
  }
  /**
   * Deliberate-practice targeting: given the times of errors (wrong presses +
   * misses), find the `width`-second window containing the most of them.
   * Returns {a, b, count} or null when there are fewer than 3 errors —
   * drilling a passage is only worth suggesting when errors actually cluster.
   */
  function densestErrorWindow(times, width) {
    width = width || 8;
    if (!times || times.length < 3) return null;
    const t = times.slice().sort((x, y) => x - y);
    let best = { count: 0, a: t[0] };
    for (let i = 0, j = 0; i < t.length; i++) {
      while (t[i] - t[j] > width) j++;
      const count = i - j + 1;
      if (count > best.count) best = { count, a: t[j] };
    }
    if (best.count < 3) return null;
    return { a: Math.max(0, best.a - 0.5), b: best.a + width + 0.5, count: best.count };
  }
  Practice.densestErrorWindow = densestErrorWindow;
  Practice.audioAllows = audioAllows;
  Practice.WINDOWS = WINDOWS;
  Practice.LENGTH_BANDS = { short: SHORT_RATIO, long: LONG_RATIO, minJudged: MIN_JUDGED_SEC,
                            holdFraction: HOLD_FRACTION, holdCap: HOLD_CAP_SEC };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.Practice = Practice; }
})(typeof window !== "undefined" ? window : globalThis);
