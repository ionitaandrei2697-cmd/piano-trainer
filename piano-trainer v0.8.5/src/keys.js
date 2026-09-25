/* ============================================================================
 * keys.js  —  Keyboard geometry (shared by keyboard view + falling-notes view)
 * ----------------------------------------------------------------------------
 * Given a MIDI range [low..high] and a pixel width, returns the rectangle for
 * every key so the on-screen keyboard and the piano-roll lanes line up exactly
 * (the roll's note columns sit directly above their keys).
 *
 * White keys tile the width evenly; black keys are narrower and overlaid,
 * centred on the gap after their preceding white key. Pure module, no DOM, so
 * the layout maths is unit-testable in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const WHITE_PC = { 0: true, 2: true, 4: true, 5: true, 7: true, 9: true, 11: true };
  // How many white keys precede each pitch-class within an octave (C=0).
  const WHITE_INDEX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };

  function pc(midi) { return ((midi % 12) + 12) % 12; }
  function isBlack(midi) { return !WHITE_PC[pc(midi)]; }
  function keyName(midi) { return NAMES[pc(midi)] + (Math.floor(midi / 12) - 1); }

  // Absolute white-key index of a MIDI note (number of white keys from MIDI 0).
  function whiteOrdinal(midi) {
    const octave = Math.floor(midi / 12);
    return octave * 7 + WHITE_INDEX[pc(midi)];
  }

  /**
   * Compute key rectangles.
   * @param {number} low  lowest MIDI note (inclusive)
   * @param {number} high highest MIDI note (inclusive)
   * @param {number} width total pixel width available
   * @param {number} [whiteHeight] white-key height (default 1, for ratios)
   * @returns {object} { keys:[{midi,isBlack,x,w,cx}], whiteWidth, whiteCount,
   *                     blackWidth, whiteHeight, blackHeight }
   */
  function layout(low, high, width, whiteHeight) {
    whiteHeight = whiteHeight || 1;
    // Snap the range to whole white keys at each end for a tidy keyboard edge.
    while (isBlack(low) && low > 0) low--;
    while (isBlack(high) && high < 127) high++;

    // Count white keys in range.
    const firstWhiteOrd = whiteOrdinal(low);
    let whiteCount = 0;
    for (let m = low; m <= high; m++) if (!isBlack(m)) whiteCount++;
    if (whiteCount === 0) whiteCount = 1;

    const whiteWidth = width / whiteCount;
    const blackWidth = whiteWidth * 0.62;
    const blackHeight = whiteHeight * 0.62;

    const keys = [];
    for (let m = low; m <= high; m++) {
      if (!isBlack(m)) {
        const wi = whiteOrdinal(m) - firstWhiteOrd;
        const x = wi * whiteWidth;
        keys.push({ midi: m, isBlack: false, x, w: whiteWidth, cx: x + whiteWidth / 2 });
      } else {
        // Centre the black key on the boundary after its preceding white key.
        const prevWhite = m - 1; // black always follows a white in 12-TET layout
        const wi = whiteOrdinal(prevWhite) - firstWhiteOrd;
        const boundary = (wi + 1) * whiteWidth;
        const x = boundary - blackWidth / 2;
        keys.push({ midi: m, isBlack: true, x, w: blackWidth, cx: boundary });
      }
    }
    // Black keys drawn last (on top): keep order but flag for renderers.
    return { keys, whiteWidth, whiteCount, blackWidth, whiteHeight, blackHeight, low, high };
  }

  const api = { layout, isBlack, keyName, pc, whiteOrdinal, NAMES };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.keys = api; }
})(typeof window !== "undefined" ? window : globalThis);
