/* ============================================================================
 * theory.js  —  Pitch spelling + key estimation (the quality-critical core)
 * ----------------------------------------------------------------------------
 * MIDI gives only pitch NUMBERS (60 = "some C-ish key"). To make readable
 * notation we must decide the SPELLING (is 61 a C# or a Db?) and the KEY
 * SIGNATURE, because those drive accidentals, staff readability, and whether the
 * score looks like music a person wrote vs. machine vomit. Two classic,
 * non-ML, well-validated algorithms — chosen because they run client-side with
 * no model weights and are the published baselines everyone compares against:
 *
 *   1) KEY ESTIMATION — Krumhansl–Schmuckler key-finding.
 *      Build a 12-bin pitch-class histogram weighted by note duration, then
 *      correlate it against the 24 major/minor key profiles (Krumhansl–Kessler
 *      probe-tone weights). Highest correlation = estimated key. This gives us
 *      both the key signature (number of sharps/flats) AND a tonal context that
 *      makes spelling far more accurate.
 *
 *   2) PITCH SPELLING — a PS13-style line-of-fifths method (Meredith).
 *      Each pitch class can be named several ways; on the LINE OF FIFTHS
 *      (… Fb Cb Gb Db Ab Eb Bb F C G D A E B F# C# …) good tonal music keeps
 *      spellings clustered tightly. PS13 names each note by the spelling whose
 *      line-of-fifths position is closest to a local "centre of gravity"
 *      computed over a sliding context window of surrounding notes, anchored by
 *      the estimated key. This reproduces enharmonic choices a musician makes
 *      (e.g. G# in A major, Ab in Eb major) without needing voice/beat info.
 *
 * Output spelling = { step:"C".."B", alter:-2..+2, octave } so the MusicXML
 * writer can emit <step>/<alter>/<octave> and the right accidental.
 *
 * Pure module, no DOM, fully unit-testable in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  // ---- Krumhansl–Kessler key profiles (probe-tone ratings) ----------------
  const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
  const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

  function pc(midi) { return ((midi % 12) + 12) % 12; }

  function rotate(arr, n) {
    const out = new Array(12);
    for (let i = 0; i < 12; i++) out[i] = arr[(i - n + 12) % 12];
    return out;
  }
  function pearson(a, b) {
    const n = a.length;
    let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
    for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; saa += a[i]*a[i]; sbb += b[i]*b[i]; sab += a[i]*b[i]; }
    const num = n*sab - sa*sb;
    const den = Math.sqrt((n*saa - sa*sa) * (n*sbb - sb*sb));
    return den === 0 ? 0 : num / den;
  }

  /**
   * Estimate key from notes (weighted by duration).
   * @returns { tonicPc, mode:"major"|"minor", fifths, name, correlation }
   *          fifths = key-signature sharps(+)/flats(-) for MusicXML.
   */
  function estimateKey(notes) {
    const hist = new Array(12).fill(0);
    for (const n of notes) hist[pc(n.midi)] += Math.max(0.05, n.durSec || 0.25);

    let best = { corr: -Infinity, tonicPc: 0, mode: "major" };
    for (let t = 0; t < 12; t++) {
      const cMaj = pearson(hist, rotate(MAJOR_PROFILE, t));
      if (cMaj > best.corr) best = { corr: cMaj, tonicPc: t, mode: "major" };
      const cMin = pearson(hist, rotate(MINOR_PROFILE, t));
      if (cMin > best.corr) best = { corr: cMin, tonicPc: t, mode: "minor" };
    }
    const fifths = keyFifths(best.tonicPc, best.mode);
    return {
      tonicPc: best.tonicPc, mode: best.mode, fifths,
      name: keyName(best.tonicPc, best.mode, fifths),
      correlation: best.corr,
    };
  }

  // Map (tonic pitch-class, mode) to number of sharps/flats on the line of 5ths.
  // Major keys by pc: C=0 sharps, G=1, D=2, A=3, E=4, B=5, F#=6, C#=7,
  //                   F=-1, Bb=-2, Eb=-3, Ab=-4, Db=-5, Gb=-6, Cb=-7.
  const MAJOR_FIFTHS = { 0:0, 7:1, 2:2, 9:3, 4:4, 11:5, 6:6, 1:7, 5:-1, 10:-2, 3:-3, 8:-4 };
  // Some pcs are ambiguous (6 -> F#=6 or Gb=-6; 1 -> C#=7 or Db=-5). Prefer the
  // simpler (fewer-accidental) signature.
  const MAJOR_FIFTHS_PREF = { 6:-6, 1:-5 }; // Gb over F#, Db over C#
  function majorFifths(tonicPc) {
    if (MAJOR_FIFTHS_PREF[tonicPc] != null) return MAJOR_FIFTHS_PREF[tonicPc];
    return MAJOR_FIFTHS[tonicPc] != null ? MAJOR_FIFTHS[tonicPc] : 0;
  }
  function keyFifths(tonicPc, mode) {
    if (mode === "major") return majorFifths(tonicPc);
    // relative major is 3 semitones up
    return majorFifths(pc(tonicPc + 3));
  }

  const SHARP_ORDER = ["F","C","G","D","A","E","B"];
  const FLAT_ORDER  = ["B","E","A","D","G","C","F"];
  const NOTE_NAMES  = ["C","D","E","F","G","A","B"];

  function keyName(tonicPc, mode, fifths) {
    // Spell the tonic note name using the key's accidental direction.
    const sharp = fifths >= 0;
    const NAMES_SHARP = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const NAMES_FLAT  = ["C","Db","D","Eb","E","F","Gb","G","Ab","A","Bb","B"];
    const nm = (sharp ? NAMES_SHARP : NAMES_FLAT)[tonicPc];
    return nm + " " + mode;
  }

  // ---- Line-of-fifths spelling (PS13-style) --------------------------------
  // Line of fifths position 0 = D (natural centre). Each step of +1 is a perfect
  // fifth up. We map every (pitchClass, lof) so distance on the line measures
  // spelling "distance". For a given pitch class there are several lof entries
  // (enharmonic spellings); we pick the one nearest the local centre.
  //
  // Build a table: for each pitch class, the candidate spellings as
  // { step, alter, lof } where lof is the line-of-fifths index.
  //
  // Generate spellings from -7..+7 fifths around C, plus a few enharmonics.
  const LOF_TABLE = buildLofTable();
  function buildLofTable() {
    // Natural notes' line-of-fifths index (C=0 reference here for simplicity):
    // order by fifths from Fbb... we just generate names for lof in a range.
    // Represent each spelling by (letterIndex 0..6 for C..B, alter).
    // Start from a base: F=-1, C=0, G=1, D=2, A=3, E=4, B=5 (naturals).
    const naturalLof = { C:0, G:1, D:2, A:3, E:4, B:5, F:-1 };
    const letterPc = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
    const table = {}; // pc -> [{step, alter, lof}]
    for (let pcv = 0; pcv < 12; pcv++) table[pcv] = [];
    // For each letter and each alter -2..+2, compute pc and lof.
    for (const letter of NOTE_NAMES) {
      for (let alter = -2; alter <= 2; alter++) {
        const p = pc(letterPc[letter] + alter);
        const lof = naturalLof[letter] + alter * 7; // each accidental = 7 fifths
        table[p].push({ step: letter, alter, lof });
      }
    }
    return table;
  }

  /**
   * Spell a sequence of notes. Uses a sliding window centre-of-gravity on the
   * line of fifths, biased toward the key's tonal centre.
   * @param {Array<{midi,startSec}>} notes  (time-ordered or not; we sort)
   * @param {object} key  from estimateKey()
   * @param {number} [windowSize] notes of context each side (default 9, PS13-ish)
   * @returns {Map} midi+index -> {step, alter, octave}; we attach to each note as .spelling
   */
  function spellNotes(notes, key, windowSize) {
    windowSize = windowSize || 9;
    const sorted = notes.slice().sort((a, b) => (a.startSec - b.startSec) || (a.midi - b.midi));

    // Key centre on the line of fifths: tonic's natural lof, shifted by key.
    // Use the key fifths value directly as the tonal centre (C major -> 0).
    const keyCentre = key ? key.fifths : 0;

    for (let i = 0; i < sorted.length; i++) {
      // local context window
      const lo = Math.max(0, i - windowSize);
      const hi = Math.min(sorted.length - 1, i + windowSize);

      // centre of gravity from already-decided neighbours' best guesses:
      // we use a quick first-pass nominal spelling for the window (nearest to
      // keyCentre) to compute the centre, then spell note i nearest to it.
      let sum = 0, cnt = 0;
      for (let j = lo; j <= hi; j++) {
        const cand = nearestSpelling(pc(sorted[j].midi), keyCentre);
        sum += cand.lof; cnt++;
      }
      const centre = cnt ? (sum / cnt) : keyCentre;

      const chosen = nearestSpelling(pc(sorted[i].midi), centre);
      // octave: MIDI octave adjusted so that, e.g., Cb of C4 stays near octave.
      const octave = spelledOctave(sorted[i].midi, chosen.step, chosen.alter);
      sorted[i].spelling = { step: chosen.step, alter: chosen.alter, octave };
    }
    return sorted;
  }

  function nearestSpelling(pitchClass, centreLof) {
    const cands = LOF_TABLE[pitchClass];
    let best = cands[0], bd = Infinity;
    for (const c of cands) {
      // prefer fewer accidentals on ties via tiny bias toward |alter|
      const d = Math.abs(c.lof - centreLof) + Math.abs(c.alter) * 0.001;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  // Determine the written octave for a spelling. MIDI 60 = C4. We compute the
  // octave so that step+alter+octave reproduces the same MIDI number.
  const LETTER_BASE_PC = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  function spelledOctave(midi, step, alter) {
    // The "natural" pitch class of the letter:
    const base = LETTER_BASE_PC[step];
    // The MIDI of (step, alter, octave o) is base + alter + 12*(o+1).
    // Solve o so it matches midi (choosing the octave that lands the letter
    // nearest the actual sounding pitch — handles Cb/B# octave wrap).
    // midi = base + alter + 12*(o+1)  =>  o = (midi - base - alter)/12 - 1
    let o = Math.round((midi - base - alter) / 12) - 1;
    // verify; adjust if off by an octave due to rounding at wrap points
    const check = base + alter + 12 * (o + 1);
    if (check !== midi) {
      // try neighbours
      for (const d of [0, 1, -1, 2, -2]) {
        if (base + alter + 12 * (o + d + 1) === midi) { o = o + d; break; }
      }
    }
    return o;
  }

  const api = {
    estimateKey, spellNotes, keyFifths, keyName,
    // exposed for tests
    _nearestSpelling: nearestSpelling, _spelledOctave: spelledOctave, _pc: pc,
    SHARP_ORDER, FLAT_ORDER,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.theory = api; }
})(typeof window !== "undefined" ? window : globalThis);
