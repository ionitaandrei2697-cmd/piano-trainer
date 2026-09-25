/* ============================================================================
 * timing.js  —  Musical-time <-> real-time conversion
 * ----------------------------------------------------------------------------
 * MusicXML positions everything in "whole notes" (a quarter note = 0.25 whole
 * notes). To play audio and move the cursor we need real SECONDS. Tempo can
 * change measure-to-measure, so we precompute a piecewise table:
 *
 *   for each measure i:  { startWhole, startSec, bpm }
 *
 * and interpolate linearly inside a measure at that measure's tempo.
 *
 * Conversion (BPM = quarter notes per minute):
 *   seconds_per_whole_note = 4 * (60 / BPM)      // 4 quarters in a whole note
 *
 * This module is plain JS with no browser dependencies so it can be unit
 * tested in Node. It attaches to window.PT in the browser, or module.exports
 * under Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  /**
   * Build a timing map from an ordered list of measures.
   * @param {Array<{startWhole:number, durWhole:number, bpm:number}>} measures
   *        startWhole = absolute position of the measure start (whole notes)
   *        durWhole   = measure duration (whole notes)
   *        bpm        = tempo in effect for this measure (quarter = N per min)
   * @returns {object} timing map with conversion helpers
   */
  function buildTimingMap(measures) {
    const table = [];
    let cumSec = 0;
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      const bpm = m.bpm > 0 ? m.bpm : 120;
      table.push({ startWhole: m.startWhole, startSec: cumSec, bpm });
      const secPerWhole = 4 * (60 / bpm);
      cumSec += m.durWhole * secPerWhole;
    }
    const totalSeconds = cumSec;

    function rowForWhole(whole) {
      // last row whose startWhole <= whole
      let lo = 0, hi = table.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (table[mid].startWhole <= whole + 1e-9) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      return table[ans];
    }

    function rowForSeconds(sec) {
      let lo = 0, hi = table.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (table[mid].startSec <= sec + 1e-9) { ans = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      return table[ans];
    }

    function wholeToSeconds(whole) {
      if (table.length === 0) return 0;
      const r = rowForWhole(whole);
      const secPerWhole = 4 * (60 / r.bpm);
      return r.startSec + (whole - r.startWhole) * secPerWhole;
    }

    function secondsToWhole(sec) {
      if (table.length === 0) return 0;
      const r = rowForSeconds(sec);
      const wholePerSec = r.bpm / (4 * 60);
      return r.startWhole + (sec - r.startSec) * wholePerSec;
    }

    return { table, totalSeconds, wholeToSeconds, secondsToWhole };
  }

  const api = { buildTimingMap };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PT = root.PT || {};
    root.PT.timing = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
