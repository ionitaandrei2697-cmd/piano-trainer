/* ============================================================================
 * sheet-view.js  —  OpenSheetMusicDisplay wrapper + cursor sync (Milestone 1)
 * ----------------------------------------------------------------------------
 * OSMD (BSD-3-Clause) renders real notation as SVG and provides a cursor we can
 * step note-by-note. OSMD's own audio player is sponsor-only and not in the
 * open-source build, so we drive the cursor ourselves from the shared transport.
 *
 * Cursor sync strategy (index-based):
 *   song.cursorOnsetsWhole[] is built in parser.js with exactly ONE entry per
 *   OSMD cursor stop (every vertical container, rests included), in order. So
 *   cursor step N corresponds to cursorOnsetsWhole[N]. To sync:
 *     targetWhole = song.secondsToWhole(position)
 *     targetIndex = (last i with cursorOnsetsWhole[i] <= targetWhole)
 *   then step the cursor next()/previous() until _cursorIndex === targetIndex.
 *   Stepping (rather than rebuilding) keeps it cheap every animation frame.
 *
 * Known M1 limitation: this assumes the cursor visits stops 1:1 with the
 * container list, i.e. no repeats / voltas / multi-movement jumps. Fine for the
 * simple practice pieces M1 targets; flagged for a later milestone.
 * ========================================================================== */
(function (root) {
  "use strict";

  const OSMDns = root.opensheetmusicdisplay;

  class SheetView {
    constructor() {
      this.osmd = null;
      this.container = null;
      this._loaded = false;
      this._cursorIndex = 0;
      this._onsets = null;     // reference to song.cursorOnsetsWhole
    }

    init(container) {
      this.container = container;
      this.autoFit = false;      // set by the app; fitToPanel() picks the zoom
      this.fittedZoom = 1;
      this.onFit = null;         // (zoom) => void
      this._noteEls = new Map(); // OSMD source note -> <g.vf-stavenote>
      this._marks = new Map();   // source note -> "correct" | "wrong" | "held"
      this.overlayEnabled = true;
      // "now" is always rendered in the OPPOSITE medium: ivory on the dark
      // instrument, ink on the ivory page. So the cursor here is a soft ink
      // wash rather than a coloured bar — it never competes with the hand
      // colours, which are the only saturated things in the app.
      // Title/subtitle/composer are drawn by the app header instead of inside
      // the engraving, which also gives the score ~60px more page to use.
      this.osmd = new OSMDns.OpenSheetMusicDisplay(container, {
        backend: "svg",
        // OFF on purpose. OSMD's own resize handler re-renders the SVG behind
        // the app's back, so the notehead map, the coloured marks and the
        // cursor pointed at elements no longer on the page (found when the
        // score stopped colouring after the transport hid in Wait mode). The
        // app re-flows the score itself (ResizeObserver -> reflow() ->
        // _afterRender()), which rebuilds all three. One resize path, not two.
        autoResize: false,
        drawTitle: false,
        drawSubtitle: false,
        drawComposer: false,
        drawingParameters: "default",
        followCursor: false,   // we manage scrolling ourselves
        cursorsOptions: [{ type: 0, color: "#171d29", alpha: 0.13, follow: false }],
      });

      // OSMD reserves a generous page margin all round — sensible for a printed
      // page, wasteful in a panel, and the top margin was sized for a title we
      // no longer engrave. Reclaiming it is what lets a full grand staff (both
      // hands) fit on a laptop instead of the bass stave falling off the bottom.
      // Units are OSMD units (1 unit = 10px); defaults are 5 on every side.
      try {
        const r = this.osmd.EngravingRules;
        if (r) {
          r.PageTopMargin = 1.2;
          r.PageBottomMargin = 1.0;
          r.PageLeftMargin = 1.5;
          r.PageRightMargin = 1.5;
        }
      } catch (e) { /* older builds: keep the defaults */ }
    }

    /** Parse + render MusicXML, then show the cursor at the start. */
    async loadXML(xml) {
      this._loaded = false;
      this._marks = new Map();
      this._noteEls = new Map();
      await this.osmd.load(xml);
      this.osmd.Zoom = this.autoFit ? 1 : (this.osmd.Zoom || 1);
      this._loaded = true;
      if (this.autoFit) this.fitToPanel(); else this.osmd.render();
      this.osmd.cursor.show();
      this.osmd.cursor.reset();
      this._cursorIndex = 0;
      this._applyCursorVisibility();
      this._rebuildNoteMap();
    }

    /** Attach the onset table from the parsed song (call after parser ran). */
    bindSong(song) {
      this._onsets = song && song.hasSheet ? song.cursorOnsetsWhole : null;
    }

    /** Move the cursor to match a playhead position (seconds). */
    syncTo(posSec, song) {
      if (!this._loaded || !this.osmd || !song.secondsToWhole) return;
      const cursor = this.osmd.cursor;
      const it = cursor.Iterator;
      if (!it || !it.currentTimeStamp) return;

      // Sync against OSMD's OWN iterator timestamp instead of a parallel index
      // list: the iterator is the ground truth for where each cursor stop sits
      // in musical time, so the bar can't drift on repeats, multi-voice stops,
      // or anything else that makes stop-counting diverge from the data model.
      const target = song.secondsToWhole(posSec);
      const EPS = 1e-6;
      // The iterator's timestamp goes away once the cursor runs off the end, so
      // every read is guarded — reading it blind used to throw a TypeError on
      // the last note of a piece.
      const ts = () => {
        const it2 = cursor.Iterator;
        return (it2 && it2.currentTimeStamp) ? it2.currentTimeStamp.RealValue : null;
      };
      let moved = false, guard = 0, cur = ts();
      if (cur == null) return;

      while (!cursor.Iterator.EndReached && cur < target - EPS && guard++ < 4096) {
        cursor.next(); moved = true;
        cur = ts();
        if (cur == null) break;
      }
      guard = 0;
      cur = ts();
      while (cur != null && cur > target + EPS && guard++ < 4096) {
        const before = cur;
        cursor.previous(); moved = true;
        cur = ts();
        if (cur == null || cur >= before - EPS) break;   // pinned at the first stop
      }

      if (moved) {
        cursor.update();
        this._applyCursorVisibility();
        this._scrollCursorIntoView();
      }
    }

    reset() {
      if (!this._loaded || !this.osmd) return;
      this.osmd.cursor.reset();
      this._cursorIndex = 0;
      this.osmd.cursor.update();
    }

    clear() {
      if (this.osmd) {
        try { this.osmd.clear(); } catch (e) { /* ignore */ }
      }
      this._loaded = false;
      this._cursorIndex = 0;
      this._onsets = null;
    }

    /**
     * Re-engrave at the container's current width and put the cursor back where
     * it belongs. Needed because the cursor is positioned in the SAME pixel
     * space as the engraving: if the panel changes width and the score is not
     * re-laid-out, the two spaces disagree and the cursor drifts.
     */
    reflow() {
      if (!this.loaded || !this.osmd) return;
      try {
        if (this.autoFit) this.fitToPanel(); else this.osmd.render();
        this._afterRender();
      } catch (e) { /* a failed reflow must never break playback */ }
    }

    /** Everything that must happen after OSMD rebuilds the SVG. */
    _afterRender() {
      if (this.cursor) {
        this.cursor.show();
        this.cursor.update();
        this._applyCursorVisibility();
      }
      this._rebuildNoteMap();
      this._reapplyMarks();
    }

    // ------------------------------------------------------------ overlay
    /**
     * Map each OSMD source note to the <g class="vf-stavenote"> that draws it.
     * The SVG is thrown away on every render, so the map is rebuilt after each
     * one; the source-note objects themselves are stable for the sheet's life,
     * which is what makes them a usable key.
     */
    _rebuildNoteMap() {
      this._noteEls = new Map();
      const g = this.osmd && (this.osmd.graphic || this.osmd.GraphicSheet);
      if (!g || !g.MeasureList) return;
      try {
        for (const measure of g.MeasureList) for (const gm of measure) {
          if (!gm) continue;
          for (const se of gm.staffEntries || []) for (const gve of se.graphicalVoiceEntries || []) {
            for (const gn of gve.notes || []) {
              const el = gn.getSVGGElement && gn.getSVGGElement();
              if (el && gn.sourceNote) this._noteEls.set(gn.sourceNote, el);
            }
          }
        }
      } catch (e) { /* older OSMD: overlay silently unavailable */ }
    }

    _markColour(state) {
      if (!this._colours) {
        const cs = getComputedStyle(document.documentElement);
        const v = (n, d) => (cs.getPropertyValue(n) || "").trim() || d;
        this._colours = { correct: v("--jade", "#59c2a0"), wrong: v("--err", "#d2604f"), held: v("--warn", "#d9a441") };
      }
      return this._colours[state] || null;
    }

    /**
     * Colour a note's engraved notehead: "correct" (green), "wrong" (red), or
     * null to restore the ink. The state is remembered so a re-render (zoom,
     * resize, auto-fit) paints it back.
     */
    markNote(note, state) {
      if (!note || !note._src) return;
      if (!this._marks) this._marks = new Map();
      if (state) this._marks.set(note._src, state); else this._marks.delete(note._src);
      this._paint(note._src, this.overlayEnabled === false ? null : state);
    }

    /** Master switch for the coloured noteheads (marks are still recorded). */
    setOverlayEnabled(on) {
      this.overlayEnabled = !!on;
      if (!this._marks) return;
      for (const [src, state] of this._marks) this._paint(src, on ? state : null);
    }

    _paint(src, state) {
      const el = this._noteEls && this._noteEls.get(src);
      if (!el) return;
      const colour = state ? this._markColour(state) : null;
      el.querySelectorAll(".vf-notehead path, .vf-notehead").forEach((p) => {
        if (colour) { p.setAttribute("fill", colour); p.setAttribute("stroke", colour); }
        else { p.setAttribute("fill", "#000000"); p.setAttribute("stroke", "none"); }
      });
      el.classList.toggle("is-correct", state === "correct");
      el.classList.toggle("is-wrong", state === "wrong");
      el.classList.toggle("is-held", state === "held");
    }

    _reapplyMarks() {
      if (!this._marks || this.overlayEnabled === false) return;
      for (const [src, state] of this._marks) this._paint(src, state);
    }

    /** Clear the overlay from `fromSec` onward (or everything when omitted). */
    clearMarks(notes, fromSec) {
      if (!this._marks || !this._marks.size) return;
      if (fromSec == null || !notes) {
        for (const src of [...this._marks.keys()]) this._paint(src, null);
        this._marks.clear();
        return;
      }
      for (const n of notes) {
        if (n.startSec >= fromSec - 1e-6 && n._src && this._marks.has(n._src)) {
          this._marks.delete(n._src);
          this._paint(n._src, null);
        }
      }
    }

    // ------------------------------------------------------------ auto-fit
    /**
     * Pick the zoom at which the tallest system fits the panel, so the score
     * never needs a manual zoom and both staves of a grand staff are always
     * on screen. Height scales linearly with zoom, so one measurement gives
     * the answer; a second pass catches the case where the changed width
     * reflowed the systems differently.
     */
    fitToPanel() {
      if (!this.osmd || !this.loaded) return;
      const panel = this.container;
      const cs = getComputedStyle(panel);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const avail = panel.clientHeight - pad;
      if (avail < 80) { this.osmd.render(); return; }
      const rules = this.osmd.EngravingRules;
      const marginUnits = ((rules && rules.PageTopMargin) || 0) + ((rules && rules.PageBottomMargin) || 0);
      const unit = (rules && rules.UnitInPixels) || 10;
      let zoom = this.osmd.Zoom || 1;
      for (let pass = 0; pass < 2; pass++) {
        this.osmd.Zoom = zoom;
        this.osmd.render();
        const g = this.osmd.graphic || this.osmd.GraphicSheet;
        const systems = g && g.MusicPages && g.MusicPages[0] && g.MusicPages[0].MusicSystems;
        if (!systems || !systems.length) break;
        let tallest = 0;
        for (const sys of systems) {
          const h = sys.PositionAndShape && sys.PositionAndShape.Size ? sys.PositionAndShape.Size.height : 0;
          if (h > tallest) tallest = h;
        }
        if (!tallest) break;
        // px the tallest system takes at this zoom, plus the page margins
        const needPx = (tallest + marginUnits + 1.5) * unit * zoom;
        const next = Math.max(0.5, Math.min(1.4, zoom * (avail / needPx) * 0.97));
        if (Math.abs(next - zoom) < 0.03) break;
        zoom = Math.round(next * 100) / 100;
      }
      this.fittedZoom = this.osmd.Zoom;
      if (this.onFit) this.onFit(this.fittedZoom);
    }

    setAutoFit(on) {
      this.autoFit = !!on;
      if (this.autoFit && this.loaded) { this.fitToPanel(); this._afterRender(); }
    }

    /** Manual zoom (turns auto-fit off at the app level). */
    setZoom(factor) {
      if (!this.osmd) return;
      this.autoFit = false;
      this.osmd.Zoom = factor;
      this.osmd.render();
      if (this._loaded) this._afterRender();
    }

    /** Show/hide the green cursor bar; tracking and auto-scroll keep working. */
    setCursorVisible(v) {
      this._cursorVisible = v !== false;
      this._applyCursorVisibility();
    }

    _applyCursorVisibility() {
      const el = this.osmd && this.osmd.cursor && this.osmd.cursor.cursorElement;
      if (el) el.style.opacity = (this._cursorVisible === false) ? "0" : "";
    }

    get loaded() {
      return this._loaded;
    }

    // Keep the cursor visible by scrolling the sheet panel, not the page.
    _scrollCursorIntoView() {
      const el = this.osmd && this.osmd.cursor && this.osmd.cursor.cursorElement;
      if (!el || !this.container) return;
      const cRect = this.container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      if (eRect.top < cRect.top + 40 || eRect.bottom > cRect.bottom - 40) {
        const delta = (eRect.top - cRect.top) - this.container.clientHeight * 0.35;
        this.container.scrollTop += delta;
      }
    }
  }

  root.PT = root.PT || {};
  root.PT.SheetView = SheetView;
})(typeof window !== "undefined" ? window : globalThis);
