/* ============================================================================
 * parser.js  —  Build the app's internal note model
 * ----------------------------------------------------------------------------
 * Two entry points:
 *
 *   extractFromOSMD(osmd, timingApi)
 *      Reads an ALREADY-LOADED OpenSheetMusicDisplay instance (osmd.load()
 *      must have run; render() is not required for the data model) and returns
 *      a `song` object. This is the single source of truth so audio and the
 *      sheet cursor never drift: both derive from the same parsed data.
 *
 *   parseMIDI(arrayBuffer)
 *      Uses @tonejs/midi to build a `song` from a .mid file. MIDI carries no
 *      notation, so song.hasSheet === false (no OSMD cursor for MIDI in M1).
 *
 * song = {
 *   format: "musicxml" | "midi",
 *   title: string,
 *   hasSheet: boolean,
 *   notes: [{ id, midi, freq, startSec, durSec, staff, measure }], // SORTED by startSec
 *   cursorOnsetsWhole: number[],    // musicxml only: 1:1 with OSMD cursor steps
 *   secondsToWhole: fn,             // musicxml only
 *   wholeToSeconds: fn,             // musicxml only
 *   durationSec: number,
 *   defaultBpm: number,
 *   staffCount: number,
 *   range: { minMidi, maxMidi },
 *   bars: [{ number, startSec, endSec, beats, beatUnit }],  // barline map
 * }
 *
 * `id` is a STABLE per-note key (pitch + onset ms + staff) — the fingering
 * editor stores manual overrides against it, so they survive a reload. Notes
 * used to ship without one, which meant every override was filed under the
 * string "undefined" and, on the next load, painted its finger number onto
 * every note in the piece.
 *
 * Pitch handling note: OSMD's Pitch.Frequency (Hz) is authoritative and was
 * verified against a known C-major scale (A4 -> 440 Hz -> MIDI 69, etc.).
 * We feed Hz straight to the synth and derive MIDI = round(69 + 12*log2(f/440)).
 * ========================================================================== */
(function (root) {
  "use strict";

  const A4 = 440;
  function freqToMidi(f) { return Math.round(69 + 12 * Math.log2(f / A4)); }
  function midiToFreq(m) { return A4 * Math.pow(2, (m - 69) / 12); }

  /**
   * Stable identity for a note: pitch + onset (ms) + staff. Two notes can share
   * all three only if they are literally the same event, and the value is
   * reproducible across reloads of the same file, which is what fingering
   * overrides need. A trailing counter disambiguates true duplicates.
   */
  function assignIds(notes) {
    const seen = new Map();
    for (const n of notes) {
      const base = n.midi + "@" + Math.round(n.startSec * 1000) + "s" + n.staff;
      const k = seen.get(base) || 0;
      seen.set(base, k + 1);
      n.id = k ? base + "#" + k : base;
    }
    return notes;
  }

  /** Barline map from a timing table (one row per measure). */
  function barsFromTable(table, totalSeconds, beats, beatUnit) {
    const bars = [];
    for (let i = 0; i < table.length; i++) {
      bars.push({
        number: i + 1,
        startSec: table[i].startSec,
        endSec: i + 1 < table.length ? table[i + 1].startSec : totalSeconds,
        beats: beats, beatUnit: beatUnit,
      });
    }
    return bars;
  }

  // ---- MusicXML / OSMD -----------------------------------------------------
  const KEYBOARD_NAME = /pian|pno|klav|clav|keyboard|keys\b|fortepiano|cemb|harpsi|organ|orgel|celest|synth|épinette|spinet/i;
  const PERC_NAME = /drum|perc|batter|schlag|timpan|kit\b|cymbal|snare/i;
  /**
   * WHICH STAVES ARE THE PIANIST'S. Staff 0 used to be "the right hand" and
   * every other staff "the left hand" — right for a piano score, wrong for
   * anything else: in a song for voice and piano the singer's line became the
   * right hand and BOTH piano staves the left, so Wait mode asked for the
   * vocal melody and the whole accompaniment at once. Now each part (MusicXML
   * instrument) is Practice / Backing / Off, as MIDI tracks are: the keyboard
   * part (by name, else the first two-stave part) is practised — its upper
   * staff the right hand, the rest the left — and the others play along.
   * Without a keyboard part, one or two lines are yours; an ensemble gives
   * its top line to the right hand and its bass to the left.
   */
  function scorePartsInfo(sheet) {
    return (sheet.Instruments || []).map((ins, i) => {
      const name = String((ins.Name != null ? ins.Name : ins.NameLabel && ins.NameLabel.text) || "").trim();
      const staves = (ins.Staves || []).map((s) => s.idInMusicSheet);
      return { index: i, name, staves, staffCount: staves.length, percussion: PERC_NAME.test(name) };
    });
  }
  function defaultScoreParts(info) {
    const out = {};
    for (const p of info) out[p.index] = p.percussion ? "off" : "backing";
    const pitched = info.filter((p) => !p.percussion);
    if (!pitched.length) { for (const p of info) out[p.index] = "practice"; return out; }
    // a keyboard part; or its two hands written as two one-staff parts
    // ("Piano (right)" + "Piano (left)"), which are practised together
    const keyboards = pitched.filter((p) => KEYBOARD_NAME.test(p.name));
    if (keyboards.length >= 2 && keyboards.slice(0, 2).every((p) => p.staffCount === 1)) {
      out[keyboards[0].index] = out[keyboards[1].index] = "practice"; return out;
    }
    const piano = keyboards[0] || pitched.find((p) => p.staffCount >= 2);
    if (piano) { out[piano.index] = "practice"; return out; }
    if (pitched.length <= 2) { for (const p of pitched) out[p.index] = "practice"; return out; }
    out[pitched[0].index] = "practice"; out[pitched[pitched.length - 1].index] = "practice";
    return out;
  }

  function extractFromOSMD(osmd, timingApi, opts) {
    opts = opts || {};
    const sheet = osmd.Sheet;
    const defaultBpm = sheet.DefaultStartTempoInBpm || 120;

    // parts: which staves are practised (and as which hand), which play along
    const partsInfo = scorePartsInfo(sheet);
    const roles = Object.assign(defaultScoreParts(partsInfo), opts.parts || {});
    if (!partsInfo.some((p) => roles[p.index] === "practice")) Object.assign(roles, defaultScoreParts(partsInfo));
    const staffRole = new Map();          // idInMusicSheet -> { role, hand }
    let firstPracticeStaff = null;
    for (const p of partsInfo) for (const id of p.staves) {
      const role = roles[p.index];
      if (role === "practice" && firstPracticeStaff == null) firstPracticeStaff = id;
      staffRole.set(id, { role, hand: role === "practice" ? (id === firstPracticeStaff ? 0 : 1) : null });
    }

    // 1) Measure table (for tempo + timing). Tempo carries forward when a
    //    measure has no explicit mark.
    const sourceMeasures = sheet.SourceMeasures;
    const measureRows = [];
    let currentBpm = defaultBpm;
    for (let i = 0; i < sourceMeasures.length; i++) {
      const m = sourceMeasures[i];
      const bpm = m.TempoInBPM && m.TempoInBPM > 0 ? m.TempoInBPM : currentBpm;
      currentBpm = bpm;
      measureRows.push({
        startWhole: m.AbsoluteTimestamp.RealValue,
        durWhole: m.Duration.RealValue,
        bpm,
      });
    }
    const timing = timingApi.buildTimingMap(measureRows);

    // 2) Walk every vertical container (= every cursor stop) in order.
    //    - cursorOnsetsWhole: one entry per container (incl. rest-only ones)
    //      so it stays 1:1 with OSMD's cursor steps.
    //    - notes: sounding notes only, converted to seconds.
    const cursorOnsetsWhole = [];
    const notes = [];
    const staffSet = new Set();
    let minMidi = Infinity, maxMidi = -Infinity;

    for (let mi = 0; mi < sourceMeasures.length; mi++) {
      const measure = sourceMeasures[mi];
      const containers = measure.VerticalSourceStaffEntryContainers;
      for (let ci = 0; ci < containers.length; ci++) {
        const container = containers[ci];
        const onsetWhole = container.getAbsoluteTimestamp().RealValue;
        cursorOnsetsWhole.push(onsetWhole);
        const onsetSec = timing.wholeToSeconds(onsetWhole);

        const staffEntries = container.StaffEntries;
        for (let si = 0; si < staffEntries.length; si++) {
          const se = staffEntries[si];
          if (!se) continue;
          const sheetStaff = se.ParentStaff ? se.ParentStaff.idInMusicSheet : si;
          const sr = staffRole.get(sheetStaff) || { role: "practice", hand: sheetStaff === 0 ? 0 : 1 };
          if (sr.role === "off") continue;
          const backing = sr.role === "backing";

          const voiceEntries = se.VoiceEntries;
          for (let vi = 0; vi < voiceEntries.length; vi++) {
            const ve = voiceEntries[vi];
            // Grace notes take no time in the bar: the engine files them at
            // their main note's onset, so they used to become extra chord
            // notes that Wait mode demanded TOGETHER with the main note. They
            // are ornaments now: heard just before the beat, never required,
            // and pressing one isn't counted as a wrong note.
            const grace = !!ve.IsGrace;
            const veNotes = ve.Notes;
            for (let ni = 0; ni < veNotes.length; ni++) {
              const note = veNotes[ni];
              if (note.isRest && note.isRest()) continue;
              if (!note.Pitch) continue;
              if (note.IsCueNote) continue;                 // cue notes are someone else's part, printed small
              if (!backing) staffSet.add(sr.hand);

              // Tie handling: only the start note triggers; its sounded length
              // is the FULL tied duration. Continuation notes are skipped.
              let durWhole = note.Length.RealValue;
              const tie = note.NoteTie;
              if (tie) {
                if (tie.StartNote && tie.StartNote !== note) continue; // continuation
                if (tie.Duration) durWhole = tie.Duration.RealValue;    // total
              }

              const freq = note.Pitch.Frequency;
              const midi = freqToMidi(freq);
              if (!backing && !grace) {
                if (midi < minMidi) minMidi = midi;
                if (midi > maxMidi) maxMidi = midi;
              }

              const durSec = timing.wholeToSeconds(onsetWhole + durWhole) - onsetSec;
              const rec = grace ? {
                midi, freq,
                startSec: Math.max(0, onsetSec - 0.07),     // just ahead of the beat
                durSec: 0.07,
                staff: backing ? (midi >= 60 ? 0 : 1) : sr.hand,
                measure: mi,
                backing: true, ornament: true,
              } : {
                midi,
                freq,
                startSec: onsetSec,
                durSec: Math.max(0.03, durSec),
                staff: backing ? (midi >= 60 ? 0 : 1) : sr.hand,
                measure: mi,
              };
              if (backing && !grace) rec.backing = true;
              // The OSMD source note is the key that finds this note's
              // engraved notehead after ANY re-render (the SVG elements are
              // rebuilt each time, the source objects are not). Non-enumerable
              // so it never leaks into anything that serialises the song.
              Object.defineProperty(rec, "_src", { value: note, enumerable: false, writable: true });
              notes.push(rec);
            }
          }
        }
      }
    }

    notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
    assignIds(notes);

    // Time signature from the first measure (OSMD exposes ActiveTimeSignature
    // as a Fraction with Numerator/Denominator). Used by the metronome for
    // correct downbeat accents (e.g. 3/4 pieces accent every 3 beats).
    let tsNum = 4, tsDen = 4;
    const firstMeasure = sheet.SourceMeasures && sheet.SourceMeasures[0];
    if (firstMeasure && firstMeasure.ActiveTimeSignature &&
        firstMeasure.ActiveTimeSignature.Numerator > 0) {
      tsNum = firstMeasure.ActiveTimeSignature.Numerator;
      tsDen = firstMeasure.ActiveTimeSignature.Denominator || 4;
    }

    return {
      format: "musicxml",
      title: (sheet.Title && sheet.Title.text) || sheet.TitleString || "Untitled",
      composer: (sheet.Composer && sheet.Composer.text) || "",
      hasSheet: true,
      notes,
      cursorOnsetsWhole,
      secondsToWhole: timing.secondsToWhole,
      wholeToSeconds: timing.wholeToSeconds,
      durationSec: timing.totalSeconds,
      defaultBpm,
      timeSigNum: tsNum,
      timeSigDen: tsDen,
      staffCount: staffSet.size || 1,
      range: {
        minMidi: isFinite(minMidi) ? minMidi : 0,
        maxMidi: isFinite(maxMidi) ? maxMidi : 0,
      },
      bars: barsFromTable(timing.table, timing.totalSeconds, tsNum, tsDen),
      scoreParts: partsInfo.map((p) => ({ index: p.index, name: p.name, staffCount: p.staffCount, percussion: p.percussion, part: roles[p.index] })),
    };
  }

  // ---- MIDI (@tonejs/midi) -------------------------------------------------

  /**
   * Split a flat note list into right (staff 0) and left (staff 1) hands.
   *
   * Used when the file's own track layout can't be trusted: a format-0 file has
   * ONE track holding both hands, and a file with three or more note tracks has
   * no single track that means "left hand". The rule is a moving break point:
   * inside each onset group look for the widest pitch gap (>= a minor third)
   * and split there, otherwise keep the previous break. Middle C seeds it.
   */
  function splitHandsByPitch(notes) {
    const groups = new Map();
    for (const n of notes) {
      const k = Math.round(n.startSec * 1000);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    let breakPoint = 60;
    for (const k of [...groups.keys()].sort((a, b) => a - b)) {
      const g = groups.get(k);
      const pitches = g.map((x) => x.midi).sort((a, b) => a - b);
      let bp = breakPoint;
      if (pitches.length >= 2) {
        let maxGap = -1, gapAt = breakPoint;
        for (let i = 1; i < pitches.length; i++) {
          const gap = pitches[i] - pitches[i - 1];
          if (gap > maxGap && pitches[i - 1] < 72 && pitches[i] > 48) {
            maxGap = gap; gapAt = (pitches[i] + pitches[i - 1]) / 2;
          }
        }
        if (maxGap >= 4) bp = gapAt;
      }
      for (const n of g) n.staff = n.midi >= bp ? 0 : 1;
      breakPoint = bp;
    }
    return notes;
  }
  /*
   * PARTS. A MIDI file downloaded for a song is usually an arrangement, not a
   * piano score: piano tracks, but also bass, strings, guitar — and drums on
   * channel 10, whose "notes" are drum sounds (36 is a kick, not a C2). Each
   * track gets a part:
   *   practice  — the notes you play (split into hands);
   *   backing   — heard, drawn faintly, never asked of you, no fingering;
   *   off       — left out (drums by default: they are not pitches).
   * Default: the piano tracks are practice and everything else is backing; a
   * file with no piano track practises all its pitched tracks. opts.parts
   * ({trackIndex: part}) overrides — the Parts list in Settings sets it.
   */
  function midiTracks(midi) {
    return midi.tracks.map((t, i) => ({ t, i })).filter((x) => x.t.notes && x.t.notes.length).map(({ t, i }) => {
      const inst = t.instrument || {};
      const percussion = !!inst.percussion || t.channel === 9;
      let lo = Infinity, hi = -Infinity;
      for (const n of t.notes) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
      return { index: i, name: (t.name || "").trim(), instrument: percussion ? "drums" : (inst.name || ""),
               family: percussion ? "drums" : (inst.family || ""), percussion, count: t.notes.length, lo, hi };
    });
  }
  function defaultParts(info) {
    const anyPiano = info.some((x) => !x.percussion && x.family === "piano");
    const parts = {};
    for (const x of info) parts[x.index] = x.percussion ? "off" : (!anyPiano || x.family === "piano") ? "practice" : "backing";
    return parts;
  }

  /*
   * BAR MAP. A MIDI file can change its time signature as often as it likes —
   * the uploaded "The World" does it 18 times (5/8, 4/4, 9/8, 6/4, 3/4, 8/4,
   * 23/16, 15/16...). Using only the first one put the whole piece in 5/8:
   * barlines, bar numbers, the metronome, the count-in and Repeat were wrong
   * nearly everywhere. Bars are laid out in TICKS (exact: a bar is
   * num * 4/den quarter notes), a new signature takes effect at its tick, and
   * each bar's start and end go through the file's tempo map. (The library's
   * own measure counter gets mixed meters wrong, so it isn't used.)
   */
  function midiBars(midi, sigs, durationSec) {
    const ppq = (midi.header && midi.header.ppq) || 480;
    const toSec = (tk) => (midi.header && midi.header.ticksToSeconds ? midi.header.ticksToSeconds(tk) : (tk / ppq) * 0.5);
    const list = sigs.length ? sigs.slice() : [{ tick: 0, num: 4, den: 4 }];
    if (list[0].tick > 0) list.unshift({ tick: 0, num: 4, den: 4 });
    const endTick = Math.max(1, midi.durationTicks || 0);
    const bars = [];
    let tick = 0, si = 0;
    for (let number = 1; tick < endTick && number < 4096; number++) {
      while (si + 1 < list.length && list[si + 1].tick <= tick) si++;
      const { num, den } = list[si];
      let len = Math.round(num * (4 / den) * ppq);
      const next = si + 1 < list.length ? list[si + 1].tick : Infinity;
      if (tick + len > next) len = next - tick;           // a signature arriving mid-bar cuts it
      if (len <= 0) break;
      bars.push({ number, startSec: toSec(tick), endSec: Math.min(durationSec, toSec(tick + len)), beats: num, beatUnit: den });
      tick += len;
    }
    return bars;
  }

  /*
   * REACH. When a file is split into hands by track (or by pitch), a hand can
   * be handed notes it cannot hold at once: in "The World" the left-hand
   * track has D2 + A4 together (31 semitones) while the right hand plays
   * nothing new. A pianist takes A4 with the right hand. For every onset, while
   * one hand's chord is wider than `reach` semitones, its note nearest the
   * other hand moves across — if the other hand then still spans no more than
   * `reach` and holds at most five notes. Anything still out of reach is left
   * to the app to play (n.unreachable). Scores (MusicXML) are never touched:
   * there the hands are the editor's choice.
   */
  function repairReach(notes, reach) {
    const groups = new Map();
    for (const n of notes) {
      if (n.backing) continue;
      const k = Math.round(n.startSec * 1000);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(n);
    }
    let moved = 0, left = 0;
    const span = (a) => (a.length ? Math.max(...a.map((x) => x.midi)) - Math.min(...a.map((x) => x.midi)) : 0);
    for (const g of groups.values()) {
      const R = g.filter((n) => n.staff === 0), L = g.filter((n) => n.staff >= 1);
      for (let guard = 0; span(L) > reach && guard < 5; guard++) {
        const h = L.reduce((a, b) => (b.midi > a.midi ? b : a));
        const R2 = R.concat([h]);
        if (R2.length > 5 || span(R2) > reach) break;
        h.staff = 0; L.splice(L.indexOf(h), 1); R.push(h); moved++;
      }
      for (let guard = 0; span(R) > reach && guard < 5; guard++) {
        const l = R.reduce((a, b) => (b.midi < a.midi ? b : a));
        const L2 = L.concat([l]);
        if (L2.length > 5 || span(L2) > reach) break;
        l.staff = 1; R.splice(R.indexOf(l), 1); L.push(l); moved++;
      }
      // still too wide: the notes furthest from the hand's other notes are the app's
      for (const [hand, fromTop] of [[L, true], [R, false]]) {
        while (span(hand) > reach) {
          const x = hand.reduce((a, b) => (fromTop ? (b.midi > a.midi ? b : a) : (b.midi < a.midi ? b : a)));
          x.unreachable = true; hand.splice(hand.indexOf(x), 1); left++;
        }
      }
    }
    return { moved, left };
  }

  function parseMIDI(arrayBuffer, opts) {
    opts = opts || {};
    const MidiCtor = root.Midi;
    if (!MidiCtor) throw new Error("@tonejs/midi (window.Midi) not loaded");
    const midi = new MidiCtor(arrayBuffer);

    const info = midiTracks(midi);
    const parts = Object.assign(defaultParts(info), opts.parts || {});
    // a choice that leaves nothing to practise falls back to the defaults
    if (!info.some((x) => parts[x.index] === "practice")) Object.assign(parts, defaultParts(info));
    const practiceTracks = info.filter((x) => parts[x.index] === "practice");

    const notes = [];
    // HAND MAPPING (practice notes only). Exactly two practice tracks are
    // trusted (assigned by mean pitch, not track order: the bass track is not
    // always second); anything else falls back to a pitch split.
    const trustTracks = practiceTracks.length === 2;
    let trebleIndex = -1;
    if (trustTracks) {
      const mean = practiceTracks.map((x) => { const t = midi.tracks[x.index]; return t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length; });
      trebleIndex = practiceTracks[mean[0] >= mean[1] ? 0 : 1].index;
    }
    for (const x of info) {
      const part = parts[x.index];
      if (part === "off") continue;
      for (const n of midi.tracks[x.index].notes) {
        notes.push({
          midi: n.midi, freq: midiToFreq(n.midi), startSec: n.time, durSec: Math.max(0.03, n.duration),
          staff: part === "backing" ? (n.midi >= 60 ? 0 : 1) : (trustTracks ? (x.index === trebleIndex ? 0 : 1) : 0),
          measure: 0, track: x.index, backing: part === "backing",
        });
      }
    }
    notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
    if (!trustTracks && notes.length) {
      const practice = notes.filter((n) => !n.backing);
      splitHandsByPitch(practice);
    }
    assignIds(notes);
    let minMidi = Infinity, maxMidi = -Infinity;
    for (const n of notes) if (!n.backing) { if (n.midi < minMidi) minMidi = n.midi; if (n.midi > maxMidi) maxMidi = n.midi; }

    const name =
      (midi.header && midi.header.name) ||
      (midi.tracks.find((t) => t.name) || {}).name ||
      "MIDI file";

    const sigs = ((midi.header && midi.header.timeSignatures) || [])
      .map((t) => ({ tick: t.ticks, num: t.timeSignature[0], den: t.timeSignature[1] }))
      .filter((x) => x.num > 0 && x.den > 0).sort((a, b) => a.tick - b.tick);
    const tsNum = sigs.length ? sigs[0].num : 4;
    const tsDen = sigs.length ? sigs[0].den : 4;
    const bpm = (midi.header && midi.header.tempos && midi.header.tempos[0] && midi.header.tempos[0].bpm) || 120;
    const durationSec = midi.duration || (notes.length ? notes[notes.length - 1].startSec + notes[notes.length - 1].durSec : 0);
    const bars = midiBars(midi, sigs, durationSec);

    return {
      format: "midi",
      title: name,
      composer: "",
      hasSheet: false,
      notes,
      cursorOnsetsWhole: [],
      secondsToWhole: null,
      wholeToSeconds: null,
      durationSec,
      defaultBpm: bpm,
      timeSigNum: tsNum,
      timeSigDen: tsDen,
      staffCount: notes.some((n) => !n.backing && n.staff >= 1) ? 2 : 1,
      range: {                                   // the PRACTICE part's range
        minMidi: isFinite(minMidi) ? minMidi : 0,
        maxMidi: isFinite(maxMidi) ? maxMidi : 0,
      },
      bars,
      tracks: info.map((x) => Object.assign({}, x, { part: parts[x.index] })),
      meterChanges: Math.max(0, sigs.length - 1),
    };
  }

  const api = { extractFromOSMD, defaultScoreParts, scorePartsInfo, parseMIDI, midiTracks, defaultParts, midiBars, repairReach, freqToMidi, midiToFreq, assignIds, splitHandsByPitch };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.PT = root.PT || {};
    root.PT.parser = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
