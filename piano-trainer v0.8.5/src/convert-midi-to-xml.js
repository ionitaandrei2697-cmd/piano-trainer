/* ============================================================================
 * convert-midi-to-xml.js  —  MIDI  →  MusicXML (original notation engine)
 * ----------------------------------------------------------------------------
 * The hard direction. A MIDI file is raw note events (pitch number, onset/offset
 * in seconds, velocity). Sheet music needs: a key signature, spelled pitches,
 * a beat grid, measures, rhythmic note values, two hands on two staves, ties
 * across barlines, and rests. This module reconstructs all of that.
 *
 * PIPELINE (each step documented inline):
 *   1. Notes already parsed (parser.parseMIDI) → {midi,startSec,durSec,staff}.
 *      We re-derive timing in BEATS using the file's tempo so quantization is
 *      musical, not wall-clock.
 *   2. KEY + SPELLING via theory.js (Krumhansl key, PS13-style spelling).
 *   3. QUANTIZE onsets and durations to a grid (default 1/16) in "divisions".
 *   4. HAND SPLIT: assign each note to RH (treble) / LH (bass). If the MIDI
 *      already had 2 tracks we trust that; otherwise we split by a moving pitch
 *      break (a light Chew–Wu-style choice: minimise hand crossing / leaps).
 *   5. MEASURE SEGMENTATION from a time signature (default 4/4) using the beat
 *      grid; notes spanning a barline are SPLIT and TIED.
 *   6. Within each measure & staff, build a single voice as a sequence of
 *      chords + rests that exactly fills the measure (gap → rest).
 *   7. EMIT MusicXML: part-wise, 2 staves, key, time, clefs, notes with
 *      <step>/<alter>/<octave>, <duration>, <type>, <dot>, <tie>, <chord>,
 *      <staff>, and <rest>.
 *
 * QUALITY NOTES / honest limits (surfaced to the user):
 *   - Quantization grid is user-selectable; the default 1/16 suits most pieces
 *     but triplets/swing won't be perfect (a known hard case for ALL non-ML
 *     converters — see the research: live timing needs ML or manual cleanup).
 *   - Time signature is assumed (default 4/4) unless the MIDI declares one; we
 *     read it when present.
 *   - The result is meant to be a faithful, READABLE first draft you can refine
 *     in MuseScore/Dorico — not an engraver-perfect edition.
 *
 * Pure module (no DOM); unit-testable in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  const theory = (typeof require !== "undefined") ? require("./theory.js") : root.PT.theory;

  // Note-type names by duration in quarter notes (for <type>).
  // value = quarters; we also detect a single dot.
  const TYPES = [
    { q: 4, type: "whole" },
    { q: 2, type: "half" },
    { q: 1, type: "quarter" },
    { q: 0.5, type: "eighth" },
    { q: 0.25, type: "16th" },
    { q: 0.125, type: "32nd" },
  ];

  function pc(m) { return ((m % 12) + 12) % 12; }

  /** Choose <type> + dots for a duration given in DIVISIONS (per quarter). */
  function durationToType(divs, divisionsPerQuarter) {
    const quarters = divs / divisionsPerQuarter;
    // try exact, then dotted (1.5x), pick closest representable
    let best = { type: "quarter", dots: 0, err: Infinity };
    for (const t of TYPES) {
      for (const dots of [0, 1]) {
        const factor = dots === 1 ? 1.5 : 1;
        const val = t.q * factor;
        const err = Math.abs(val - quarters);
        if (err < best.err) best = { type: t.type, dots, err, val };
      }
    }
    return best;
  }

  /**
   * Decompose a duration (in divisions) into a chain of EXACTLY representable
   * values — plain or single-dotted whole..32nd — to be emitted as tied notes.
   * A 5-sixteenths note becomes quarter⌒16th instead of one note whose visual
   * <type> lies about its <duration>. Greedy largest-first (the standard draft
   * heuristic; beat-aligned splitting is an engraving refinement).
   * Returns [{divs, type, dots}]; guaranteed to sum exactly to `divs`.
   */
  function decomposeDuration(divs, dpq) {
    // representable values in divisions, deduped, descending
    const vals = [];
    for (const t of TYPES) {
      for (const dots of [1, 0]) {
        const d = t.q * (dots ? 1.5 : 1) * dpq;
        if (Number.isInteger(d) && d > 0) vals.push({ divs: d, type: t.type, dots });
      }
    }
    vals.sort((a, b) => b.divs - a.divs);
    const out = [];
    let rem = Math.max(1, Math.round(divs));
    while (rem > 0) {
      const pick = vals.find((v) => v.divs <= rem);
      if (!pick) { // remainder smaller than a 32nd: absorb into a 32nd (keeps timing via <duration>)
        out.push({ divs: rem, type: "32nd", dots: 0 });
        break;
      }
      out.push({ divs: pick.divs, type: pick.type, dots: pick.dots });
      rem -= pick.divs;
    }
    return out;
  }

  /**
   * Main entry.
   * @param {object} song  from parser.parseMIDI (notes in seconds + defaultBpm)
   * @param {object} opts  { grid: 16|8|4|32, beatsPerMeasure, beatUnit, divisions }
   * @returns {string} MusicXML
   */
  function midiToMusicXML(song, opts) {
    opts = opts || {};
    const grid = opts.grid || 16;                       // quantize to 1/grid notes
    const beatsPerMeasure = opts.beatsPerMeasure || song.timeSigNum || 4;
    const beatUnit = opts.beatUnit || song.timeSigDen || 4;
    const bpm = song.defaultBpm || 120;
    const secPerQuarter = 60 / bpm;

    // divisions = ticks per quarter note in MusicXML. Use LCM-ish value that
    // represents the grid and dotted values cleanly; 1/16 needs 4 per quarter,
    // dotted-16th needs 8; use grid/4 * 2 to allow a dot. Cap sensibly.
    const divisionsPerQuarter = Math.max(4, (grid / 4) * 2);

    // 1) seconds -> quarters -> divisions
    const notes = song.notes.map((n) => {
      const startQ = n.startSec / secPerQuarter;
      const durQ = Math.max(0.0001, n.durSec / secPerQuarter);
      return {
        midi: n.midi, staff: n.staff,
        startDiv: Math.round(startQ * divisionsPerQuarter),
        rawDurDiv: Math.max(1, Math.round(durQ * divisionsPerQuarter)),
        startSec: n.startSec, durSec: n.durSec,
      };
    });

    // 2) key + spelling. Spell on a copy keyed by midi+startSec, then map back.
    const key = theory.estimateKey(song.notes);
    const spelled = theory.spellNotes(
      notes.map((n) => ({ midi: n.midi, startSec: n.startSec })), key
    );
    const spellMap = new Map();
    for (const s of spelled) spellMap.set(s.midi + "@" + s.startSec.toFixed(6), s.spelling);
    for (const n of notes) {
      n.spelling = spellMap.get(n.midi + "@" + n.startSec.toFixed(6));
      if (!n.spelling) {
        // standalone fallback (shouldn't normally happen)
        n.spelling = theory.spellNotes([{ midi: n.midi, startSec: 0 }], key)[0].spelling;
      }
    }

    // 3) quantize onsets + durations to the grid (in divisions)
    const gridDiv = divisionsPerQuarter * (4 / grid);     // divisions per grid step
    const measureDiv = divisionsPerQuarter * 4 * (beatsPerMeasure / beatUnit);
    for (const n of notes) {
      n.startDiv = Math.round(n.startDiv / gridDiv) * gridDiv;
      let q = Math.round(n.rawDurDiv / gridDiv) * gridDiv;
      if (q < gridDiv) q = gridDiv;                       // min one grid step
      n.durDiv = q;
    }

    // 4) hand split
    assignHands(notes, song);

    // total length in divisions -> number of measures
    let maxEnd = 0;
    for (const n of notes) maxEnd = Math.max(maxEnd, n.startDiv + n.durDiv);
    const measureCount = Math.max(1, Math.ceil(maxEnd / measureDiv));

    // 5+6) per staff, split notes at barlines (tie) and build measure voices
    const staves = [0, 1];
    const perStaffMeasures = {};   // staff -> [ measureEvents ]
    for (const st of staves) {
      perStaffMeasures[st] = buildStaffMeasures(
        notes.filter((n) => n.staff === st), measureCount, measureDiv, gridDiv, divisionsPerQuarter
      );
    }

    // 7) emit MusicXML
    return emitXML({
      title: song.title || "Converted from MIDI",
      key, beatsPerMeasure, beatUnit, divisionsPerQuarter,
      measureCount, perStaffMeasures, measureDiv, bpm,
    });
  }

  // ---- hand assignment -----------------------------------------------------
  function assignHands(notes, song) {
    // If the source MIDI clearly had >=2 staves already, keep them.
    const distinct = new Set(notes.map((n) => n.staff));
    if (distinct.size >= 2) return;

    // Otherwise split by a break point. Use a simple, robust rule: notes at or
    // above the running median split go RH, below go LH, with middle C (60) as a
    // sensible default break and hysteresis to avoid flapping within a chord.
    // (A light stand-in for Chew–Wu contig voice separation; good enough for
    // typical two-hand piano without full graph optimisation.)
    const sorted = notes.slice().sort((a, b) => a.startDiv - b.startDiv || a.midi - b.midi);
    let breakPoint = 60;
    // group by onset to keep chords together
    const groups = new Map();
    for (const n of sorted) {
      const k = n.startDiv;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    for (const [, g] of groups) {
      // adapt break toward the gap in this onset's pitches if there's a clear one
      const pitches = g.map((x) => x.midi).sort((a, b) => a - b);
      let bp = breakPoint;
      if (pitches.length >= 2) {
        let maxGap = -1, gapAt = breakPoint;
        for (let i = 1; i < pitches.length; i++) {
          const gap = pitches[i] - pitches[i - 1];
          if (gap > maxGap && pitches[i - 1] < 72 && pitches[i] > 48) { maxGap = gap; gapAt = (pitches[i] + pitches[i - 1]) / 2; }
        }
        if (maxGap >= 4) bp = gapAt;     // clear hand gap in a chord
      }
      for (const n of g) n.staff = n.midi >= bp ? 0 : 1;
      breakPoint = bp; // carry forward (hysteresis)
    }
  }

  // ---- build one staff's measures -----------------------------------------
  function buildStaffMeasures(staffNotes, measureCount, measureDiv, gridDiv, dpq) {
    // OVERLAP CLIPPING (validity): MusicXML's single-voice timeline can't hold
    // a note that keeps sounding past the NEXT onset in the same voice — the
    // event durations would sum past the measure. Real piano MIDI does this all
    // the time (a held note under a moving line, sustain-pedal overlaps), so we
    // clip each onset-group's duration to the gap until the next onset. Chords
    // (same onset) stay intact; what's lost is only the visual sustain overlap.
    // A two-voice-per-staff layout is the known future refinement; clipping is
    // the simplification that guarantees valid, readable output today.
    const sorted = staffNotes.slice().sort((a, b) => a.startDiv - b.startDiv || a.midi - b.midi);
    const onsetStarts = [...new Set(sorted.map((n) => n.startDiv))].sort((a, b) => a - b);
    const nextOnset = new Map();
    for (let i = 0; i < onsetStarts.length; i++) {
      nextOnset.set(onsetStarts[i], i + 1 < onsetStarts.length ? onsetStarts[i + 1] : Infinity);
    }
    for (const n of sorted) {
      const gap = nextOnset.get(n.startDiv) - n.startDiv;
      if (n.durDiv > gap) n.durDiv = gap;
    }

    // Split notes that cross barlines into tied segments.
    const segs = [];
    for (const n of sorted) {
      let start = n.startDiv, remaining = n.durDiv, first = true;
      while (remaining > 0) {
        const measureIndex = Math.floor(start / measureDiv);
        const measureEnd = (measureIndex + 1) * measureDiv;
        const segLen = Math.min(remaining, measureEnd - start);
        const last = (segLen >= remaining);
        segs.push({
          midi: n.midi, spelling: n.spelling,
          start, dur: segLen, measureIndex,
          tieStart: !last,            // continues into next measure
          tieStop: !first,            // continuation of a previous segment
        });
        start += segLen; remaining -= segLen; first = false;
      }
    }

    // Group segments per measure, then per onset (chords).
    const measures = [];
    for (let mi = 0; mi < measureCount; mi++) measures.push([]);
    const byMeasure = new Map();
    for (const s of segs) {
      if (!byMeasure.has(s.measureIndex)) byMeasure.set(s.measureIndex, []);
      byMeasure.get(s.measureIndex).push(s);
    }

    for (let mi = 0; mi < measureCount; mi++) {
      const ms = (byMeasure.get(mi) || []).sort((a, b) => a.start - b.start || a.midi - b.midi);
      const measureStart = mi * measureDiv;
      // group by onset
      const onsets = [];
      let cur = null;
      for (const s of ms) {
        if (!cur || s.start !== cur.start) { cur = { start: s.start, dur: s.dur, notes: [] }; onsets.push(cur); }
        cur.dur = Math.max(cur.dur, s.dur);  // chord dur = longest member
        cur.notes.push(s);
      }
      // walk the measure timeline, inserting rests for gaps
      const events = [];
      let cursor = measureStart;
      for (const on of onsets) {
        if (on.start > cursor) events.push({ rest: true, start: cursor, dur: on.start - cursor });
        events.push({ rest: false, start: on.start, dur: on.dur, notes: on.notes });
        cursor = Math.max(cursor, on.start + on.dur);
      }
      const measureEnd = measureStart + measureDiv;
      if (cursor < measureEnd) events.push({ rest: true, start: cursor, dur: measureEnd - cursor });
      measures[mi] = events;
    }
    return measures;
  }

  // ---- emit MusicXML -------------------------------------------------------
  function emitXML(ctx) {
    const { title, key, beatsPerMeasure, beatUnit, divisionsPerQuarter, measureCount, perStaffMeasures, bpm } = ctx;
    const tempoBpm = Math.round(bpm || 120);
    const L = [];
    L.push('<?xml version="1.0" encoding="UTF-8"?>');
    L.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
    L.push('<score-partwise version="3.1">');
    L.push(`  <work><work-title>${esc(title)}</work-title></work>`);
    L.push('  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>');
    L.push('  <part id="P1">');

    for (let mi = 0; mi < measureCount; mi++) {
      L.push(`    <measure number="${mi + 1}">`);
      if (mi === 0) {
        L.push('      <attributes>');
        L.push(`        <divisions>${divisionsPerQuarter}</divisions>`);
        L.push(`        <key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>`);
        L.push(`        <time><beats>${beatsPerMeasure}</beats><beat-type>${beatUnit}</beat-type></time>`);
        L.push('        <staves>2</staves>');
        L.push('        <clef number="1"><sign>G</sign><line>2</line></clef>');
        L.push('        <clef number="2"><sign>F</sign><line>4</line></clef>');
        L.push('      </attributes>');
        L.push('      <direction placement="above"><direction-type>');
        L.push(`        <metronome><beat-unit>quarter</beat-unit><per-minute>${tempoBpm}</per-minute></metronome>`);
        L.push(`      </direction-type><sound tempo="${tempoBpm}"/></direction>`);
      }
      // staff 1 (RH, voice 1), then backup, then staff 2 (LH, voice 2)
      emitStaffMeasure(L, perStaffMeasures[0][mi] || [], 1, 1, divisionsPerQuarter);
      const used = measureDivUsed(perStaffMeasures[0][mi] || []);
      if (used > 0) L.push(`      <backup><duration>${used}</duration></backup>`);
      emitStaffMeasure(L, perStaffMeasures[1][mi] || [], 2, 2, divisionsPerQuarter);
      L.push('    </measure>');
    }

    L.push('  </part>');
    L.push('</score-partwise>');
    return L.join("\n");
  }

  function measureDivUsed(events) {
    let s = 0; for (const e of events) s += e.dur; return s;
  }

  function emitStaffMeasure(L, events, staffNum, voiceNum, dpq) {
    for (const e of events) {
      const chain = decomposeDuration(e.dur, dpq);
      if (e.rest) {
        // Rests don't tie — emit the chain as sequential rests.
        for (const part of chain) {
          L.push('      <note>');
          L.push('        <rest/>');
          L.push(`        <duration>${part.divs}</duration>`);
          L.push(`        <voice>${voiceNum}</voice>`);
          L.push(`        <type>${part.type}</type>`);
          if (part.dots) L.push('        <dot/>');
          L.push(`        <staff>${staffNum}</staff>`);
          L.push('      </note>');
        }
      } else {
        // For each chain part, emit the whole chord (first member plain, the
        // rest with <chord/>). Tie linkage per member:
        //   part 0       gets tieStop only if the SEGMENT continues a barline tie
        //   parts 1..N-1 get tieStop (linking to the previous part)
        //   parts 0..N-2 get tieStart (linking to the next part)
        //   part N-1     gets tieStart only if the SEGMENT ties into next measure
        const notes = e.notes.slice().sort((a, b) => a.midi - b.midi);
        chain.forEach((part, p) => {
          const isFirst = p === 0, isLast = p === chain.length - 1;
          notes.forEach((nn, idx) => {
            const tieStop = (!isFirst) || nn.tieStop;
            const tieStart = (!isLast) || nn.tieStart;
            const sp = nn.spelling;
            L.push('      <note>');
            if (idx > 0) L.push('        <chord/>');
            L.push('        <pitch>');
            L.push(`          <step>${sp.step}</step>`);
            if (sp.alter) L.push(`          <alter>${sp.alter}</alter>`);
            L.push(`          <octave>${sp.octave}</octave>`);
            L.push('        </pitch>');
            L.push(`        <duration>${part.divs}</duration>`);
            if (tieStop) L.push('        <tie type="stop"/>');
            if (tieStart) L.push('        <tie type="start"/>');
            L.push(`        <voice>${voiceNum}</voice>`);
            L.push(`        <type>${part.type}</type>`);
            if (part.dots) L.push('        <dot/>');
            L.push(`        <staff>${staffNum}</staff>`);
            if (tieStop || tieStart) {
              L.push('        <notations>');
              if (tieStop) L.push('          <tied type="stop"/>');
              if (tieStart) L.push('          <tied type="start"/>');
              L.push('        </notations>');
            }
            L.push('      </note>');
          });
        });
      }
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  const api = { midiToMusicXML, durationToType, decomposeDuration, _assignHands: assignHands };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.midiToXML = api; }
})(typeof window !== "undefined" ? window : globalThis);
