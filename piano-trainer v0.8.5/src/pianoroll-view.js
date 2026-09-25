/* ============================================================================
 * pianoroll-view.js  —  Falling notes (Synthesia-style)
 * ----------------------------------------------------------------------------
 * Notes fall from the top and reach the "hit line" exactly when they should be
 * played; the hit line sits directly above the on-screen keyboard and each note
 * column aligns with its key (shared keys.js geometry).
 *
 * LEAD-TIME DECISION (chosen as "better for the user"):
 *   Notes are positioned by ABSOLUTE TIME with a FIXED fall speed in pixels per
 *   second, INDEPENDENT of the playback tempo. So the visual speed your eyes and
 *   hands learn stays constant, and when you slow the tempo down to practice,
 *   notes simply spread out and give you proportionally MORE reaction time per
 *   note. Lead time = height above the hit line / speed.
 *
 * THE BEAT GRID (added): pitch was the only thing the view showed. Where a note
 * falls in the bar — the information you need to play it in time rather than
 * merely in order — was invisible. Beat lines, accented barlines and bar numbers
 * now scroll with the music, so a dotted rhythm looks different from an even
 * one before you hear it.
 *
 * PERFORMANCE: the note list is scanned through a moving window (binary search
 * to the first visible note, stop at the last) and key columns come from a Map,
 * so a frame costs O(visible notes) rather than O(all notes x all keys).
 *
 * COLOUR comes from the stylesheet, not from constants in here: the canvas
 * reads the same CSS custom properties the rest of the app uses (--gold for the
 * right hand, --lapis for the left, --ivory for "now"), so the theme has one
 * source of truth and the painted notes can never drift from the lit keys.
 *
 * Rendering uses a single canvas and devicePixelRatio scaling for crisp lines.
 * ========================================================================== */
(function (root) {
  "use strict";

  class PianoRollView {
    constructor() {
      this.canvas = null;
      this.ctx = null;
      this.low = 21; this.high = 108;
      this.song = null;
      this.pxPerSec = 130;       // fall speed (tempo-independent)
      this.hitFrac = 0.9;        // hit line as a fraction of height
      this.theme = null;         // colours read from CSS custom properties
      this._w = 0; this._h = 0; this._dpr = 1;
      this._layout = null;
      this._keyByMidi = new Map();
      this.activeMidis = null;   // Set of currently sounding midis (for glow)
      this.transpose = 0;        // display shift: draw notes where the PLAYER presses them
      this.focusStaff = null;    // 0|1 to emphasise one hand (the other draws dimmed)
      this.showGrid = true;      // beat + bar lines
      this.marks = [];           // [{midi, timeSec, kind:'wrong'|'miss'|'hit', at}]
      this.expected = null;      // Set of song-pitch midis the gate is waiting for
      this.loop = null;          // {a, b} song seconds being repeated
      this.showMoves = true;     // mark where the hand jumps / the thumb passes
      this._maxDur = 0; this._maxDurFor = null;
    }

    init(canvasEl) {
      this.canvas = canvasEl;
      this.ctx = canvasEl.getContext("2d");
      this.readTheme();
      this.resize();
    }

    /** Pull the palette out of the stylesheet so canvas and DOM always agree. */
    readTheme() {
      const fallback = {
        well: "#080c14", rule: "#222d42", ivory: "#f1ece2",
        gold: "#e2b15c", goldHi: "#f4cf8d", goldDeep: "#8d6a2c",
        lapis: "#6c9be8", lapisHi: "#a3c4f5", lapisDeep: "#2f5490",
        jade: "#59c2a0", err: "#d2604f", warn: "#d9a441",
      };
      try {
        const cs = getComputedStyle(document.documentElement);
        const v = (name, dflt) => (cs.getPropertyValue(name) || "").trim() || dflt;
        this.theme = {
          well: v("--well", fallback.well),
          rule: v("--rule", fallback.rule),
          ivory: v("--ivory", fallback.ivory),
          gold: v("--gold", fallback.gold),
          goldHi: v("--gold-hi", fallback.goldHi),
          goldDeep: v("--gold-deep", fallback.goldDeep),
          lapis: v("--lapis", fallback.lapis),
          lapisHi: v("--lapis-hi", fallback.lapisHi),
          lapisDeep: v("--lapis-deep", fallback.lapisDeep),
          jade: v("--jade", fallback.jade),
          err: v("--err", fallback.err),
          warn: v("--warn", fallback.warn),
        };
      } catch (e) { this.theme = fallback; }
      return this.theme;
    }

    setRange(low, high) { this.low = low; this.high = high; this._layout = null; this.resize(); }
    setSong(song) { this.song = song; this.marks = []; }
    setSpeed(pxPerSec) { this.pxPerSec = Math.max(40, Math.min(400, pxPerSec)); }
    setGrid(on) { this.showGrid = !!on; }
    setExpected(set) { this.expected = set && set.size ? set : null; }
    setLoop(a, b) { this.loop = (a != null && b != null && b > a) ? { a, b } : null; }

    /** Record a scoring event so the player can see WHERE it went wrong. */
    mark(midi, timeSec, kind) {
      this.marks.push({ midi, timeSec, kind, at: Date.now() });
      if (this.marks.length > 400) this.marks.splice(0, 200);
    }
    clearMarks() { this.marks = []; }

    /**
     * The exact song note under a click, or null. Used by fingering-edit so
     * the player can point at the falling note they mean, not a pitch class.
     */
    noteAtEvent(evt, posSec) {
      if (!this.canvas || !this._layout || !this.song) return null;
      const rect = this.canvas.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const t = this.timeFromEvent(evt, posSec);
      if (t == null) return null;
      // column -> displayed key -> song pitch (undo the display transpose)
      const key = this._layout.keys.find((k) => x >= k.x && x <= k.x + k.w && k.isBlack)
               || this._layout.keys.find((k) => x >= k.x && x <= k.x + k.w);
      if (!key) return null;
      const songMidi = key.midi - this.transpose;
      const SLACK = 0.06;
      let best = null, bd = Infinity;
      for (const n of this.song.notes) {
        if (n.midi !== songMidi) continue;
        if (t >= n.startSec - SLACK && t <= n.startSec + n.durSec + SLACK) {
          const d = Math.abs(t - n.startSec);
          if (d < bd) { bd = d; best = n; }
        }
      }
      return best;
    }

    /**
     * Song time corresponding to a click at clientY, given the current playhead.
     * The hit line is "now"; pixels above it are future at pxPerSec, pixels
     * below are the immediate past — so clicking a falling note seeks to it.
     */
    timeFromEvent(evt, posSec) {
      if (!this.canvas) return null;
      const rect = this.canvas.getBoundingClientRect();
      const y = evt.clientY - rect.top;
      const hitY = this._h * this.hitFrac;
      return posSec + (hitY - y) / this.pxPerSec;
    }

    resize() {
      if (!this.canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.clientWidth || (this.canvas.parentElement && this.canvas.parentElement.clientWidth) || 1000;
      const h = this.canvas.clientHeight || 260;
      this._dpr = dpr; this._w = w; this._h = h;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!this.theme) this.readTheme();
      this._layout = root.PT.keys.layout(this.low, this.high, w, 1);
      this._keyByMidi = new Map();
      for (const k of this._layout.keys) this._keyByMidi.set(k.midi, k);
    }

    setTranspose(t) { this.transpose = t | 0; }
    setFocusStaff(s) { this.focusStaff = (s === 0 || s === 1) ? s : null; }

    _xFor(midi) { return this._keyByMidi.get(midi + this.transpose) || null; }

    /**
     * Index of the first note that can still be on screen at `fromSec`.
     * Notes are sorted by onset, not by end, so a note that started earlier can
     * still be sounding. Backing the search off by the song's LONGEST note is
     * exact and costs one pass over the piece at load time.
     */
    _firstVisible(fromSec) {
      const notes = this.song.notes;
      if (this._maxDurFor !== this.song) {
        let mx = 0;
        for (const n of notes) if (n.durSec > mx) mx = n.durSec;
        this._maxDur = mx;
        this._maxDurFor = this.song;
      }
      const cut = fromSec - this._maxDur;
      let lo = 0, hi = notes.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (notes[m].startSec < cut) lo = m + 1; else hi = m; }
      return lo;
    }

    /** Draw one frame at song position `posSec`. */
    render(posSec) {
      if (!this.ctx) return;
      const c = this.ctx, W = this._w, H = this._h;
      const T = this.theme || this.readTheme();
      const hitY = H * this.hitFrac;
      c.clearRect(0, 0, W, H);

      // backdrop
      c.fillStyle = T.well;
      c.fillRect(0, 0, W, H);

      // Lanes. Every C is marked so you can find your place at a glance; the
      // black-key lanes are sunk rather than the white ones being lifted, which
      // keeps the surface reading as one piece of lacquer.
      if (this._layout) {
        for (const k of this._layout.keys) {
          if (k.isBlack) {
            c.fillStyle = "rgba(0,0,0,0.45)";
            c.fillRect(k.x, 0, k.w, H);
          } else if (k.midi % 12 === 0) {
            c.fillStyle = "rgba(241,236,226,0.045)";
            c.fillRect(k.x, 0, k.w, H);
          }
        }
      }

      const lead = hitY / this.pxPerSec;        // seconds visible above hit line
      const tail = (H - hitY) / this.pxPerSec;  // seconds visible below (just passed)
      const tTop = posSec + lead, tBottom = posSec - tail;
      const yFor = (t) => hitY - (t - posSec) * this.pxPerSec;

      if (this.showGrid) this._drawGrid(tBottom, tTop, yFor, W, H);
      if (this.loop) this._drawLoop(tBottom, tTop, yFor, W, H);

      // notes (windowed scan)
      if (this.song && this.song.notes && this.song.notes.length) {
        const notes = this.song.notes;
        const start = this._firstVisible(tBottom);
        for (let i = start; i < notes.length; i++) {
          const n = notes[i];
          const dt = n.startSec - posSec;          // >0 upcoming, <0 already hit
          if (dt > lead) break;                     // sorted: nothing later is visible
          if (n.startSec + n.durSec < tBottom) continue; // long gone
          const k = this._xFor(n.midi);
          if (!k) continue;
          const yBottom = yFor(n.startSec);
          const height = Math.max(4, n.durSec * this.pxPerSec);
          const yTop = yBottom - height;
          if (n.backing || n.unreachable) {
            // another instrument, or a note out of any hand's reach: there to hear, not to play
            c.save(); c.globalAlpha = 0.2; c.fillStyle = (this.theme || this.readTheme()).ivory;
            c.fillRect(k.x + 3, yTop, k.w - 6, height); c.restore();
            continue;
          }
          const active = this.activeMidis && this.activeMidis.has(n.midi) &&
                         posSec >= n.startSec && posSec < n.startSec + n.durSec;
          // when one hand is selected, the other hand's notes fade back
          const dim = this.focusStaff != null && ((this.focusStaff === 0) !== (n.staff === 0));
          if (dim) c.globalAlpha = 0.28;
          const wanted = this.expected && this.expected.has(n.midi) &&
                         Math.abs(n.startSec - posSec) < 0.05;
          this._drawNote(k.x + 1, yTop, k.w - 2, height, n.staff, k.isBlack, active, n.finger, n.midi, wanted,
                         this.showMoves ? n.handMove : null, n.pinned, n.wide);
          if (dim) c.globalAlpha = 1;
        }
      }

      this._drawMarks(tBottom, tTop, yFor);

      // The strike zone: everything below the hit line is the run-in to the
      // keys, which sit directly under this canvas with no gap. Darkening it
      // makes the notes look like they are passing into the instrument, and
      // gives a held note somewhere to still be visible.
      const grad = c.createLinearGradient(0, hitY, 0, H);
      grad.addColorStop(0, "rgba(0,0,0,0.0)");
      grad.addColorStop(1, "rgba(0,0,0,0.55)");
      c.fillStyle = grad;
      c.fillRect(0, hitY, W, H - hitY);

      // "now" is the opposite medium: ivory on the dark instrument.
      c.strokeStyle = T.ivory;
      c.globalAlpha = 0.9;
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(0, hitY + 0.5); c.lineTo(W, hitY + 0.5); c.stroke();
      c.globalAlpha = 0.16;
      c.lineWidth = 5;
      c.beginPath(); c.moveTo(0, hitY + 0.5); c.lineTo(W, hitY + 0.5); c.stroke();
      c.globalAlpha = 1;
    }

    /**
     * Beat lines, barlines and bar numbers. `song.bars` comes from the parser:
     * for notation it is the score's real measure table (so tempo changes and
     * odd meters stay correct), for MIDI it is derived from the header tempo.
     */
    _drawGrid(tBottom, tTop, yFor, W, H) {
      const c = this.ctx;
      const bars = this.song && this.song.bars;
      if (!bars || !bars.length) return;
      c.save();
      c.font = '500 9.5px "IBM Plex Mono", ui-monospace, monospace';
      c.textBaseline = "top";
      c.textAlign = "left";
      for (const bar of bars) {
        if (bar.endSec < tBottom) continue;
        if (bar.startSec > tTop) break;
        const y = yFor(bar.startSec);
        // barline
        if (y >= -20 && y <= H + 20) {
          c.strokeStyle = "rgba(241,236,226,0.22)";
          c.lineWidth = 1;
          c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
          c.fillStyle = "rgba(241,236,226,0.4)";
          c.fillText(String(bar.number), 5, y + 4);
        }
        // beats inside the bar
        const beats = Math.max(1, bar.beats || 4);
        const span = (bar.endSec - bar.startSec) / beats;
        if (span * this.pxPerSec < 9) continue;   // too dense to read
        c.strokeStyle = "rgba(241,236,226,0.065)";
        for (let b = 1; b < beats; b++) {
          const by = yFor(bar.startSec + b * span);
          if (by < -5 || by > H + 5) continue;
          c.beginPath(); c.moveTo(0, by + 0.5); c.lineTo(W, by + 0.5); c.stroke();
        }
      }
      c.restore();
    }

    /**
     * The stretch being repeated, as a tinted band with its two edges drawn —
     * so "repeat bars 3–4" is something you can SEE coming down the roll,
     * not just a readout in the toolbar.
     */
    _drawLoop(tBottom, tTop, yFor, W, H) {
      const c = this.ctx, T = this.theme || this.readTheme();
      const { a, b } = this.loop;
      if (b < tBottom || a > tTop) return;
      const yA = yFor(a), yB = yFor(b);      // yB is ABOVE yA (later = higher)
      const top = Math.max(-2, yB), bottom = Math.min(H + 2, yA);
      c.save();
      c.fillStyle = "rgba(89,194,160,0.09)";
      c.fillRect(0, top, W, bottom - top);
      // a solid margin bar down the left edge of the region: the part that
      // reads at a glance, since the edge lines can coincide with the hit line
      c.fillStyle = T.jade; c.globalAlpha = 0.85;
      c.fillRect(0, top, 4, bottom - top);
      c.globalAlpha = 0.6; c.strokeStyle = T.jade; c.lineWidth = 1.5; c.setLineDash([6, 4]);
      for (const y of [yA, yB]) {
        if (y < -2 || y > H + 2) continue;
        c.beginPath(); c.moveTo(4, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
      }
      c.setLineDash([]);
      c.globalAlpha = 0.8;
      c.fillStyle = T.jade;
      c.font = '500 9.5px "IBM Plex Mono", ui-monospace, monospace';
      c.textAlign = "right"; c.textBaseline = "bottom";
      if (yA > 12 && yA < H + 2) c.fillText("repeat \u21bb", W - 8, yA - 3);
      c.restore();
    }

    /** Fading badges where notes were missed or hit wrong. */
    _drawMarks(tBottom, tTop, yFor) {
      if (!this.marks.length) return;
      const c = this.ctx, now = Date.now();
      c.save();
      for (let i = this.marks.length - 1; i >= 0; i--) {
        const m = this.marks[i];
        const age = (now - m.at) / 1000;
        if (age > 6) { this.marks.splice(i, 1); continue; }
        if (m.timeSec < tBottom || m.timeSec > tTop) continue;
        const k = this._xFor(m.midi);
        if (!k) continue;
        const y = yFor(m.timeSec);
        c.globalAlpha = Math.max(0, 1 - age / 6);
        const T2 = this.theme || this.readTheme();
        c.strokeStyle = m.kind === "miss" ? T2.warn : T2.err;
        c.lineWidth = 2;
        const r = Math.min(7, k.w / 2);
        c.beginPath(); c.arc(k.cx, y, r, 0, Math.PI * 2); c.stroke();
        if (m.kind === "miss") {
          c.beginPath(); c.moveTo(k.cx - r * 0.6, y); c.lineTo(k.cx + r * 0.6, y); c.stroke();
        } else {
          c.beginPath();
          c.moveTo(k.cx - r * 0.5, y - r * 0.5); c.lineTo(k.cx + r * 0.5, y + r * 0.5);
          c.moveTo(k.cx + r * 0.5, y - r * 0.5); c.lineTo(k.cx - r * 0.5, y + r * 0.5);
          c.stroke();
        }
      }
      c.globalAlpha = 1;
      c.restore();
    }

    _drawNote(x, y, w, h, staff, isBlack, active, finger, midi, wanted, move, pinned, wide) {
      const c = this.ctx, T = this.theme || this.readTheme();
      // Right hand warm (gold), left hand cool (lapis) — the same two colours
      // that light the keys below. A vertical gradient gives each note a lit
      // top edge, so a stack of them reads as separate bars rather than a slab.
      const hi = staff === 0 ? T.goldHi : T.lapisHi;
      const base = staff === 0 ? T.gold : T.lapis;
      const deep = staff === 0 ? T.goldDeep : T.lapisDeep;
      const r = Math.min(4, w / 2, h / 2);

      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, active ? hi : base);
      g.addColorStop(1, active ? base : deep);
      c.fillStyle = g;
      this._roundRect(x, y, w, h, r);
      c.fill();
      c.lineWidth = 1; c.strokeStyle = active ? hi : base; c.stroke();
      if (active) { c.shadowColor = hi; c.shadowBlur = 14; c.fill(); c.shadowBlur = 0; }
      if (wanted) {
        c.lineWidth = 2; c.strokeStyle = T.ivory;
        this._roundRect(x - 1.5, y - 1.5, w + 3, h + 3, r + 1); c.stroke();
      }
      // FINGER NUMBER: a dark disc with a large ivory digit near the bottom of
      // the note (the edge that reaches the keys first). The old 10 px digit
      // printed straight onto the note was hard to read at a glance, on gold
      // and blue alike; the disc reads the same on both. Sized to the lane.
      // EVERY note gets its number. The disc used to be drawn only on notes
      // tall and wide enough for a full-size one, so sixteenths at the default
      // fall speed (16 px) and the narrow black-key lanes of a smaller window
      // showed none — 44 of 1,534 notes of a pop arrangement at 1440 px, 231 at
      // 1024 px. A short note now gets a smaller disc centred on it (it may
      // overhang the note a little), a narrow lane one that overhangs the lane.
      const full = Math.max(6, Math.min(10, w / 2 - 1));
      const fits = h >= 2 * full + 4;
      const fr = fits ? full : Math.max(5.5, Math.min(full, (h + 2) / 2));
      if (finger && w >= 6) {
        const cx = x + w / 2, cy = fits ? y + h - fr - 3 : y + h / 2;
        c.save();
        c.beginPath(); c.arc(cx, cy, fr, 0, Math.PI * 2);
        c.fillStyle = "rgba(10,14,22,0.86)"; c.fill();
        // YOUR finger (an edit), not the suggestion: a ring around the disc,
        // so an edit saved weeks ago can't pass for what the app suggested
        if (pinned) { c.lineWidth = 1.6; c.strokeStyle = T.ivory; c.stroke(); }
        c.fillStyle = T.ivory;
        c.font = '700 ' + Math.max(8, Math.round(fr * 1.45)) + 'px "IBM Plex Sans", system-ui, sans-serif';
        c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(String(finger), cx, cy + 0.5);
        c.restore();
      }
      // WHERE THE HAND MOVES, just under the note's bottom edge — the edge that
      // reaches the keys first, so the mark arrives when the move has to happen.
      // Ivory with a dark halo: it must read on the gold right-hand notes and
      // the lapis left-hand ones alike (an amber mark vanished on the gold).
      // A jump (the hand lifts to a new position): a break sign, two bars.
      // A thumb pass (the hand glides on): a small arc.
      if (move === "jump" || move === "pass") {
        const cx = x + w / 2, top = y + h + 2;
        c.save();
        c.lineCap = "round";
        const draw = () => {
          c.beginPath();
          if (move === "jump") { c.moveTo(cx - 2.5, top); c.lineTo(cx - 2.5, top + 7); c.moveTo(cx + 2.5, top); c.lineTo(cx + 2.5, top + 7); }
          else { c.arc(cx, top - 1, Math.max(3, Math.min(6, w / 2 - 1)), 0.1 * Math.PI, 0.9 * Math.PI); }
          c.stroke();
        };
        c.strokeStyle = "rgba(10,14,22,0.9)"; c.lineWidth = move === "jump" ? 4.5 : 3.5; draw();   // halo
        c.strokeStyle = T.ivory; c.lineWidth = move === "jump" ? 2 : 1.6; draw();
        c.restore();
      }
      // TOO WIDE FOR YOUR HAND: the chord spans more than this hand can
      // stretch (Settings -> Your hand). The arpeggio sign — a wavy line up
      // the note's left edge — says what a pianist does with it: roll it, or
      // take the far note with the other hand.
      if (wide && h >= 12 && w >= 8) {
        // above the finger disc (which sits at the bottom of the note), so the
        // two never overlap in a narrow lane
        const discTop = finger && fits ? y + h - 2 * fr - 6 : y + h - 3;
        const lx = x + w / 2 - 1, y0 = discTop, y1 = Math.max(y + 3, y0 - 22);
        c.save();
        c.beginPath();
        let up = 0;
        for (let yy = y0; yy > y1; yy -= 3, up++) c.lineTo(lx + (up % 2 ? 2.2 : -0.2), yy);
        c.lineCap = "round"; c.lineJoin = "round";
        c.strokeStyle = "rgba(10,14,22,0.9)"; c.lineWidth = 3.2; c.stroke();
        c.strokeStyle = T.ivory; c.lineWidth = 1.4; c.stroke();
        c.restore();
      }
      // NOTE NAMES deliberately live on the KEYS, not here. A falling block is
      // already telling you the pitch by which lane it is in; lettering it too
      // is redundant, it only fits on long notes (so the labelling is
      // inconsistent), and it competes with the fingering number. On the
      // keyboard the letter sits on the thing you actually have to find.
    }

    _roundRect(x, y, w, h, r) {
      const c = this.ctx;
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    }
  }

  root.PT = root.PT || {};
  root.PT.PianoRollView = PianoRollView;
})(typeof window !== "undefined" ? window : globalThis);
