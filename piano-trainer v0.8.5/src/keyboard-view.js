/* ============================================================================
 * keyboard-view.js  —  On-screen piano keyboard (SVG)
 * ----------------------------------------------------------------------------
 * Renders a piano from a MIDI range using the shared geometry in keys.js, so it
 * lines up under the falling-notes view. Keys can be highlighted from several
 * independent "sources" at once, each with its own colour:
 *   play      a note the app is sounding during playback (amber)
 *   user      a key the player is pressing via MIDI / mouse (cyan)
 *   expected  a note the player must press at a wait-mode gate (outlined)
 *   correct / wrong  brief flashes for scoring feedback
 *
 * Highlight state is tracked per source so they don't clobber each other.
 * ========================================================================== */
(function (root) {
  "use strict";

  const SVGNS = "http://www.w3.org/2000/svg";
  const SOURCES = ["playR", "playL", "user", "expected", "correct", "wrong", "holding"];

  class KeyboardView {
    constructor() {
      this.svg = null;
      this.low = 21; this.high = 108;
      this.keyEls = new Map();       // midi -> <rect>
      this.state = new Map();        // midi -> Set(sources)
      this.onKey = null;             // (midi, isDown) => void  (mouse preview)
      this._h = 120;
      this.showLabels = false;       // note names on white keys
      this._badges = null;           // midi -> short text (e.g. finger number)
      this._typing = null;           // {low, high} stretch the typing keys cover
      this._down = new Map();        // pointerId -> midi currently held
      this._wh = 0; this._bh = 0;    // last white/black key heights (for badges)
      this._badgeLayer = null;
    }

    init(svgEl) {
      this.svg = svgEl;
      // Pointer capture + a remembered "which key did this pointer press"
      // fixes the stuck note you got by pressing one key, sliding, and letting
      // go over another: the note-off used to be sent for the key under the
      // cursor at release time, so the key you actually pressed never stopped.
      this._down = new Map();   // pointerId -> midi
      this.svg.addEventListener("pointerdown", (e) => {
        const midi = this._midiAt(e);
        if (midi == null) return;
        this._down.set(e.pointerId, midi);
        try { this.svg.setPointerCapture(e.pointerId); } catch (err) {}
        e.preventDefault();
        if (this.onKey) this.onKey(midi, true);
      });
      const release = (e) => {
        const midi = this._down.get(e.pointerId);
        if (midi == null) return;
        this._down.delete(e.pointerId);
        try { this.svg.releasePointerCapture(e.pointerId); } catch (err) {}
        if (this.onKey) this.onKey(midi, false);
      };
      this.svg.addEventListener("pointerup", release);
      this.svg.addEventListener("pointercancel", release);
      this.svg.addEventListener("lostpointercapture", release);
      // Sliding across the keys while held plays them, like a real glissando.
      this.svg.addEventListener("pointermove", (e) => {
        if (!this._down.has(e.pointerId)) return;
        const midi = this._midiAt(e);
        const cur = this._down.get(e.pointerId);
        if (midi == null || midi === cur) return;
        this._down.set(e.pointerId, midi);
        if (this.onKey) { this.onKey(cur, false); this.onKey(midi, true); }
      });
    }

    /** Which key is under a pointer event (black keys win, they sit on top). */
    _midiAt(e) {
      const el = (typeof document !== "undefined" && document.elementFromPoint)
        ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
      const t = (el && el.dataset && el.dataset.midi) ? el : e.target;
      if (t && t.dataset && t.dataset.midi) return parseInt(t.dataset.midi, 10);
      return null;
    }

    /** Release everything the mouse/touch is holding (e.g. on blur). */
    releasePointers() {
      for (const [, midi] of this._down) if (this.onKey) this.onKey(midi, false);
      this._down.clear();
    }

    setRange(low, high) { this.low = low; this.high = high; }

    render() {
      if (!this.svg) return;
      const W = this.svg.clientWidth || this.svg.parentElement.clientWidth || 1000;
      const H = this._h;
      const K = root.PT.keys.layout(this.low, this.high, W, H);
      this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      this.svg.innerHTML = "";
      this.keyEls.clear();
      this._wh = K.whiteHeight; this._bh = K.blackHeight;

      // White keys first, then black on top.
      const whites = K.keys.filter((k) => !k.isBlack);
      const blacks = K.keys.filter((k) => k.isBlack);
      for (const k of whites) this._addKey(k, K.whiteHeight, false);
      for (const k of blacks) this._addKey(k, K.blackHeight, true);

      // Note-name labels (white keys only — accidentals depend on key context).
      if (this.showLabels) {
        const NAMES = ["C", null, "D", null, "E", "F", null, "G", null, "A", null, "B"];
        for (const k of whites) {
          const letter = NAMES[((k.midi % 12) + 12) % 12];
          if (!letter) continue;
          const t = document.createElementNS(SVGNS, "text");
          t.setAttribute("x", (k.x + k.w / 2).toFixed(2));
          t.setAttribute("y", (K.whiteHeight - 5).toFixed(2));
          t.setAttribute("class", "pk-label" + (letter === "C" ? " pk-label--c" : ""));
          t.textContent = letter + (Math.floor(k.midi / 12) - 1);
          this.svg.appendChild(t);
        }
      }

      // A hairline under the stretch of the piano the computer keyboard can
      // reach. Without it there is no way to know where your typing hands are
      // pointing, and Z / X move it.
      if (this._typing) {
        const lo = this._typing.low, hi = this._typing.high;
        const inRange = K.keys.filter((k) => !k.isBlack && k.midi >= lo && k.midi <= hi);
        if (inRange.length) {
          const x1 = Math.min(...inRange.map((k) => k.x));
          const x2 = Math.max(...inRange.map((k) => k.x + k.w));
          const bar = document.createElementNS(SVGNS, "rect");
          bar.setAttribute("x", x1.toFixed(2));
          bar.setAttribute("y", (K.whiteHeight - 2.5).toFixed(2));
          bar.setAttribute("width", (x2 - x1).toFixed(2));
          bar.setAttribute("height", "2.5");
          bar.setAttribute("class", "pk-typing");
          this.svg.appendChild(bar);
        }
      }

      // Badge layer last so it draws above everything.
      this._badgeLayer = document.createElementNS(SVGNS, "g");
      this.svg.appendChild(this._badgeLayer);
      this._renderBadges();
      this._repaintAll();
    }

    setLabels(on) { this.showLabels = !!on; }

    /** Mark the stretch of keys the computer keyboard is currently mapped to. */
    setTypingRange(low, high) {
      this._typing = (low == null) ? null : { low, high };
      if (this.svg) this.render();
    }

    /**
     * Show short texts (e.g. suggested finger numbers) as badges on keys.
     * map: Map/object midi -> text, or null to clear.
     */
    setBadges(map) {
      this._badges = map || null;
      this._renderBadges();
    }

    _renderBadges() {
      if (!this._badgeLayer) return;
      this._badgeLayer.innerHTML = "";
      if (!this._badges) return;
      const entries = (this._badges && typeof this._badges.entries === "function")
        ? [...this._badges.entries()]
        : Object.entries(this._badges).map(([k, v]) => [parseInt(k, 10), v]);
      for (const [midi, text] of entries) {
        const el = this.keyEls.get(midi);
        if (!el) continue;
        const x = parseFloat(el.getAttribute("x")) + parseFloat(el.getAttribute("width")) / 2;
        const black = el.classList.contains("pk--black");
        const cy = black ? this._bh * 0.45 : this._wh * 0.62;
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("cx", x.toFixed(2)); c.setAttribute("cy", cy.toFixed(2));
        c.setAttribute("r", "9"); c.setAttribute("class", "pk-badge");
        const t = document.createElementNS(SVGNS, "text");
        t.setAttribute("x", x.toFixed(2)); t.setAttribute("y", (cy + 3.5).toFixed(2));
        t.setAttribute("class", "pk-badge__text");
        t.textContent = String(text);
        this._badgeLayer.appendChild(c);
        this._badgeLayer.appendChild(t);
      }
    }

    _addKey(k, h, black) {
      const r = document.createElementNS(SVGNS, "rect");
      r.setAttribute("x", k.x.toFixed(2));
      r.setAttribute("y", "0");
      r.setAttribute("width", k.w.toFixed(2));
      r.setAttribute("height", h.toFixed(2));
      r.setAttribute("rx", black ? "2" : "3");
      r.setAttribute("class", "pk " + (black ? "pk--black" : "pk--white"));
      r.setAttribute("data-midi", String(k.midi));
      this.svg.appendChild(r);
      this.keyEls.set(k.midi, r);
    }

    add(source, midi) { this._mut(midi, source, true); }
    remove(source, midi) { this._mut(midi, source, false); }

    setSource(source, midiIterable) {
      // Clear this source everywhere, then set the given notes.
      for (const [midi, set] of this.state) {
        if (set.has(source)) { set.delete(source); this._paint(midi); }
      }
      if (midiIterable) for (const m of midiIterable) this._mut(m, source, true);
    }

    clearSource(source) { this.setSource(source, null); }

    flash(source, midi, ms) {
      this._flashTimers = this._flashTimers || new Map();
      const k = source + ":" + midi;
      const prev = this._flashTimers.get(k);
      if (prev) clearTimeout(prev);
      this._mut(midi, source, true);
      this._flashTimers.set(k, setTimeout(() => {
        this._flashTimers.delete(k);
        this._mut(midi, source, false);
      }, ms || 200));
    }

    _mut(midi, source, on) {
      let set = this.state.get(midi);
      if (!set) { set = new Set(); this.state.set(midi, set); }
      if (on) set.add(source); else set.delete(source);
      this._paint(midi);
    }

    _paint(midi) {
      const el = this.keyEls.get(midi);
      if (!el) return;
      const set = this.state.get(midi) || new Set();
      const base = el.classList.contains("pk--black") ? "pk pk--black" : "pk pk--white";
      const cls = [base];
      for (const s of SOURCES) if (set.has(s)) cls.push("is-" + s);
      el.setAttribute("class", cls.join(" "));
    }

    _repaintAll() { for (const midi of this.keyEls.keys()) this._paint(midi); }
  }

  root.PT = root.PT || {};
  root.PT.KeyboardView = KeyboardView;
})(typeof window !== "undefined" ? window : globalThis);
