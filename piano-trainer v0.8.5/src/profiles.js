/* ============================================================================
 * profiles.js  —  Hardware / keyboard profiles
 * ----------------------------------------------------------------------------
 * A profile describes the player's instrument and preferences so the on-screen
 * keyboard and piano-roll match their hardware:
 *   - keyboard size  (88 / 76 / 61 / 49 keys → a MIDI range)
 *   - transpose      (octave shift so big pieces fit a small keyboard)
 *   - midiDeviceId   (preferred input)
 *   - audioBackend   ("synth" | "piano")
 *   - noteSpeed      (piano-roll px/sec)
 *   - handSize       (XS..XL, for fingering)
 *
 * Presets cover the common digital-keyboard sizes. Custom profiles can be saved
 * to IndexedDB. Pure data + helpers, unit-testable.
 * ========================================================================== */
(function (root) {
  "use strict";

  // Standard ranges (MIDI note numbers).
  const SIZES = {
    88: { low: 21, high: 108, label: "88 keys (A0–C8)" },   // full piano
    76: { low: 28, high: 103, label: "76 keys (E1–G7)" },
    61: { low: 36, high: 96, label: "61 keys (C2–C7)" },
    49: { low: 36, high: 84, label: "49 keys (C2–C6)" },
    37: { low: 48, high: 84, label: "37 keys (C3–C6)" },
  };

  function defaultProfile() {
    return {
      id: "default",
      name: "Default (88-key)",
      size: 88,
      transpose: 0,        // semitones
      midiDeviceId: "all",
      // The bundled grand piano is offline and sounds like the instrument being
      // learned; the synth stays as the fallback while it loads or if it fails.
      audioBackend: "acoustic_grand_piano",
      controlKeys: { play: null, repeat: null },
      noteSpeed: 130,      // px/sec for the falling notes
      handSize: "M",
    };
  }

  function rangeFor(profile) {
    const s = SIZES[profile.size] || SIZES[88];
    return { low: s.low, high: s.high };
  }

  /** Union the keyboard range with the song's range so nothing is off-screen. */
  function displayRange(profile, song) {
    const r = rangeFor(profile);
    let low = r.low, high = r.high;
    if (song && song.range && song.range.maxMidi >= song.range.minMidi) {
      low = Math.min(low, song.range.minMidi);
      high = Math.max(high, song.range.maxMidi);
    }
    return { low, high };
  }

  const api = { SIZES, defaultProfile, rangeFor, displayRange };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.profiles = api; }
})(typeof window !== "undefined" ? window : globalThis);
