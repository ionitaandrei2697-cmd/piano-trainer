/* ============================================================================
 * convert-xml-to-midi.js  —  Song  →  Standard MIDI File (.mid)
 * ----------------------------------------------------------------------------
 * The easy direction. Whatever the app has loaded — MusicXML parsed by OSMD or
 * an imported MIDI — already lives in our note model as
 *   { midi, startSec, durSec, staff }
 * which is exactly what a MIDI file encodes. This module writes a Standard MIDI
 * File (SMF, format 1) by hand (no dependency): a header chunk plus one track
 * for the right hand and one for the left, with note-on/note-off events placed
 * on a tempo grid.
 *
 * Encoding choices:
 *   - PPQ (ticks per quarter) = 480 (a common, high-resolution value).
 *   - One tempo meta-event at t0 from the song's BPM; times are converted
 *     seconds → ticks via that tempo so playback matches the app.
 *   - RH → MIDI channel 0, LH → channel 1 (and separate tracks), so the file
 *     re-imports cleanly with hands separated.
 *   - Running status is NOT used (each event carries its status byte) for
 *     maximum compatibility and simpler code.
 *
 * Output is a Uint8Array; the app wraps it in a Blob for download.
 * Pure module, unit-testable in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  const PPQ = 480;

  // Variable-length quantity (MIDI delta-time encoding).
  function vlq(value) {
    value = Math.max(0, Math.round(value));
    const bytes = [value & 0x7f];
    value >>= 7;
    while (value > 0) { bytes.unshift((value & 0x7f) | 0x80); value >>= 7; }
    return bytes;
  }

  function pushU32(arr, v) { arr.push((v>>>24)&0xff,(v>>>16)&0xff,(v>>>8)&0xff,v&0xff); }
  function pushU16(arr, v) { arr.push((v>>>8)&0xff, v&0xff); }
  function strBytes(s) { return Array.from(s).map((c) => c.charCodeAt(0) & 0xff); }
  /**
   * MIDI meta text is a byte string. charCodeAt on "Fur Elise" with an umlaut
   * (or any Romanian diacritic) returns a value above 255, which used to be
   * truncated into a stray byte and corrupted the event. Encode as UTF-8 —
   * what every modern sequencer reads — and fall back to ASCII if unavailable.
   */
  function textBytes(s) {
    s = String(s);
    if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(s));
    return Array.from(s).map((c) => (c.charCodeAt(0) < 128 ? c.charCodeAt(0) : 63));
  }

  function trackChunk(events) {
    // events: [{tick, bytes:[...]}] absolute ticks; we sort + delta-encode.
    events.sort((a, b) => a.tick - b.tick || (a.order||0) - (b.order||0));
    const data = [];
    let last = 0;
    for (const e of events) {
      const delta = e.tick - last; last = e.tick;
      data.push(...vlq(delta), ...e.bytes);
    }
    // end-of-track meta
    data.push(...vlq(0), 0xff, 0x2f, 0x00);
    const chunk = [];
    chunk.push(...strBytes("MTrk"));
    pushU32(chunk, data.length);
    chunk.push(...data);
    return chunk;
  }

  /**
   * @param {object} song  note model ({notes:[{midi,startSec,durSec,staff}], defaultBpm, title})
   * @returns {Uint8Array} SMF bytes
   */
  function songToMIDI(song) {
    const bpm = song.defaultBpm || 120;
    const secPerQuarter = 60 / bpm;
    const tickPerSec = PPQ / secPerQuarter;
    const toTicks = (sec) => Math.round(sec * tickPerSec);

    // --- conductor track: tempo + time signature ---
    const microsPerQuarter = Math.round(secPerQuarter * 1e6);
    const cond = [];
    cond.push({ tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (microsPerQuarter>>16)&0xff, (microsPerQuarter>>8)&0xff, microsPerQuarter&0xff] });
    const num = song.timeSigNum || 4, den = song.timeSigDen || 4;
    const denPow = Math.round(Math.log2(den));
    cond.push({ tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, num, denPow, 24, 8] });
    if (song.title) {
      const t = textBytes(String(song.title)).slice(0, 120);
      cond.push({ tick: 0, order: 2, bytes: [0xff, 0x03, t.length, ...t] });
    }

    // --- hand tracks ---
    function handTrack(staffMatch, channel, name) {
      const ev = [];
      const nm = textBytes(name);
      ev.push({ tick: 0, order: 0, bytes: [0xff, 0x03, nm.length, ...nm] });
      // program change: acoustic grand piano (0)
      ev.push({ tick: 0, order: 1, bytes: [0xc0 | channel, 0] });
      for (const n of song.notes) {
        if (!staffMatch(n.staff)) continue;
        const on = toTicks(n.startSec);
        const off = Math.max(on + 1, toTicks(n.startSec + n.durSec));
        const vel = 80;
        ev.push({ tick: on, order: 5, bytes: [0x90 | channel, n.midi & 0x7f, vel] });
        ev.push({ tick: off, order: 4, bytes: [0x80 | channel, n.midi & 0x7f, 0] });
      }
      return trackChunk(ev);
    }

    const hasLH = song.notes.some((n) => n.staff >= 1);
    const tracks = [trackChunk(cond), handTrack((s) => s === 0, 0, "Right hand")];
    if (hasLH) tracks.push(handTrack((s) => s >= 1, 1, "Left hand"));

    // --- header ---
    const header = [];
    header.push(...strBytes("MThd"));
    pushU32(header, 6);
    pushU16(header, 1);             // format 1
    pushU16(header, tracks.length); // ntracks
    pushU16(header, PPQ);           // division

    const all = header.concat(...tracks);
    return Uint8Array.from(all);
  }

  const api = { songToMIDI, _vlq: vlq, PPQ };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.xmlToMIDI = api; }
})(typeof window !== "undefined" ? window : globalThis);
