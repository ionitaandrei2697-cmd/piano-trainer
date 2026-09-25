/* ============================================================================
 * score-import.js  —  Get a score file into a shape the notation engine reads
 * ----------------------------------------------------------------------------
 * "Error: given music sheet was incomplete or could not be loaded" is what the
 * notation library (OSMD) says whenever its reader throws — for ANY reason. It
 * was reproduced from four distinct causes, each fixed here before OSMD sees
 * the file:
 *
 *   1. ENCODING. Finale, Sibelius and older exporters write MusicXML as
 *      UTF-16. The app decoded every file as UTF-8, so the text came out as
 *      "<\0?\0x\0m\0l\0…" and nothing downstream could parse it (in the test
 *      corpora: 42 of 232 music21 scores, 5 of 447 MuseScore test files).
 *      decodeText() reads the byte-order mark, the byte pattern, and the XML
 *      declaration, in that order, and falls back to Windows-1252 for legacy
 *      8-bit files instead of turning every accented letter into U+FFFD.
 *   2. STRUCTURE. OSMD throws — "incomplete" — when a <part> has no
 *      <score-part> in the part-list, when the ids disagree, or when a part
 *      has no measures (what a score with a hidden or deleted instrument, or
 *      a hand-edited/converted file, often contains). normalize() makes the
 *      part-list and the parts agree.
 *   3. INVALID CONTENT that crashes the reader or the renderer: <chord/> on a
 *      rest or on the first note of a bar, a step that isn't A-G (German H),
 *      a missing octave, a time signature like "a/b", an 8va line that never
 *      ends, a zero <divisions>. Each is repaired in place and reported.
 *   4. SHAPE. A score-timewise file (legal MusicXML, rejected by OSMD) is
 *      turned into score-partwise; a zipped score saved as .xml, a MIDI file
 *      named .xml and similar mix-ups are recognised by their bytes, not
 *      their extension.
 *
 * If OSMD still refuses a score, simplify() strips everything that is not
 * notes, rests and structure (directions, lyrics, chord symbols, repeats…) for
 * a second attempt, and notesFromMusicXML() — a small independent reader — is
 * the last resort: the piece then opens without engraving, playable on the
 * falling notes and the keyboard, instead of not at all.
 *
 * Browser module (DOMParser / XMLSerializer / TextDecoder); the byte helpers
 * also run in Node.
 * ========================================================================== */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- bytes
  function asBytes(buf) {
    return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }

  /** What a file IS, from its first bytes: "zip" | "midi" | "rmid" | "text". */
  function sniff(buf) {
    const u = asBytes(buf);
    if (u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b && (u[2] === 3 || u[2] === 5) && (u[3] === 4 || u[3] === 6)) return "zip";
    if (u.length >= 4 && u[0] === 0x4d && u[1] === 0x54 && u[2] === 0x68 && u[3] === 0x64) return "midi";   // MThd
    if (u.length >= 12 && u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 &&
        u[8] === 0x52 && u[9] === 0x4d && u[10] === 0x49 && u[11] === 0x44) return "rmid";                  // RIFF….RMID
    return "text";
  }

  /** The Standard MIDI File inside a RIFF .rmi wrapper. */
  function unwrapRmid(buf) {
    const u = asBytes(buf);
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let p = 12;
    while (p + 8 <= u.length) {
      const id = String.fromCharCode(u[p], u[p + 1], u[p + 2], u[p + 3]);
      const len = dv.getUint32(p + 4, true);
      if (id === "data") return u.slice(p + 8, p + 8 + len).buffer;
      p += 8 + len + (len & 1);
    }
    throw new Error("That .rmi file has no MIDI data inside.");
  }

  function decoderFor(label) {
    try { return new TextDecoder(label); } catch (e) { return null; }
  }

  /**
   * Bytes -> text, honouring how the file was actually written.
   *   BOM first (UTF-8 / UTF-16LE / UTF-16BE), then the tell-tale zero bytes
   *   of UTF-16 without a BOM, then the encoding the XML declaration names.
   *   A file that claims UTF-8 but isn't (a legacy 8-bit export) is read as
   *   Windows-1252, the superset of Latin-1 that such files use.
   */
  function decodeText(buf) {
    const u = asBytes(buf);
    let label = null, skip = 0;
    if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) { label = "utf-8"; skip = 3; }
    else if (u[0] === 0xff && u[1] === 0xfe) { label = "utf-16le"; skip = 2; }
    else if (u[0] === 0xfe && u[1] === 0xff) { label = "utf-16be"; skip = 2; }
    else if (u.length > 3 && u[0] === 0x3c && u[1] === 0 && u[2] !== 0) label = "utf-16le";
    else if (u.length > 3 && u[0] === 0 && u[1] === 0x3c) label = "utf-16be";
    if (!label) {
      let head = "";
      for (let i = 0; i < Math.min(u.length, 256); i++) head += String.fromCharCode(u[i]);
      const m = /<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/i.exec(head);
      const declared = m ? m[1].toLowerCase() : "utf-8";
      // "UTF-16" declared over single-byte content: the file was re-saved
      // without updating the declaration. The bytes win.
      label = /^utf-?16/.test(declared) ? "utf-8" : declared;
    }
    const body = skip ? u.subarray(skip) : u;
    if (label === "utf-8" || label === "utf8") {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(body); }
      catch (e) { return (decoderFor("windows-1252") || new TextDecoder("utf-8")).decode(body); }
    }
    const dec = decoderFor(label) || new TextDecoder("utf-8");
    return dec.decode(body).replace(/^﻿/, "");
  }

  /**
   * Read a dropped / picked file by what it contains.
   * @returns {Promise<{kind:"midi", buf:ArrayBuffer} | {kind:"xml", text:string, zipped:boolean}>}
   */
  async function readScoreFile(buf, mxl) {
    const kind = sniff(buf);
    if (kind === "midi") return { kind: "midi", buf };
    if (kind === "rmid") return { kind: "midi", buf: unwrapRmid(buf) };
    if (kind === "zip") {
      if (!mxl) throw new Error("Compressed MusicXML support is missing (src/mxl.js).");
      const bytes = await mxl.extractBytes(buf);
      return { kind: "xml", text: decodeText(bytes), zipped: true };
    }
    return { kind: "xml", text: decodeText(buf), zipped: false };
  }

  // ---------------------------------------------------------------- XML text
  const HTML_ENTITIES = { nbsp: 160, copy: 169, reg: 174, deg: 176, middot: 183, hellip: 8230, ndash: 8211, mdash: 8212,
    lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, sharp: 9839, flat: 9837, natural: 9838, eacute: 233, egrave: 232,
    auml: 228, ouml: 246, uuml: 252, Auml: 196, Ouml: 214, Uuml: 220, szlig: 223, aacute: 225, iacute: 237, oacute: 243,
    uacute: 250, ccedil: 231, ntilde: 241, acirc: 226, icirc: 238, ecirc: 234, ocirc: 244, ucirc: 251, agrave: 224 };

  function parseXML(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    return { doc, error: err ? (err.textContent || "parse error").replace(/\s+/g, " ").trim() : null };
  }

  /** Parse, repairing the text-level faults that make XML ill-formed. */
  function parseLenient(text, fixes) {
    let t = String(text).replace(/^﻿/, "").replace(/^\s+/, "");
    let r = parseXML(t);
    if (!r.error) return r.doc;
    // A DOCTYPE with an internal subset or an unreachable DTD, HTML entities
    // that XML doesn't define, stray control characters, junk after the root.
    t = t.replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/i, "");
    t = t.replace(/&([A-Za-z]+);/g, (m, name) =>
      /^(amp|lt|gt|quot|apos)$/.test(name) ? m : HTML_ENTITIES[name] ? "&#" + HTML_ENTITIES[name] + ";" : "");
    t = t.replace(/&(?![A-Za-z]+;|#\d+;|#x[0-9A-Fa-f]+;)/g, "&amp;");
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    const end = Math.max(t.lastIndexOf("</score-partwise>"), t.lastIndexOf("</score-timewise>"));
    if (end > 0) t = t.slice(0, t.indexOf(">", end) + 1);
    r = parseXML(t);
    if (!r.error) { fixes.push("repaired XML syntax"); return r.doc; }
    const e = new Error("This file isn't valid XML, so it can't be read as a score (" + r.error.slice(0, 160) + ").");
    e.userFacing = true;
    throw e;
  }

  const kids = (el, name) => { const out = []; for (const c of el.children) if (!name || c.tagName === name) out.push(c); return out; };
  const kid = (el, name) => { for (const c of el.children) if (c.tagName === name) return c; return null; };
  const txt = (el, name) => { const k = el && kid(el, name); return k ? k.textContent.trim() : null; };

  /** score-timewise (measure > part) -> score-partwise (part > measure). */
  function timewiseToPartwise(doc) {
    const tw = doc.documentElement;
    const pw = doc.createElement("score-partwise");
    for (const a of tw.attributes) pw.setAttribute(a.name, a.value);
    const measures = kids(tw, "measure");
    for (const c of kids(tw)) if (c.tagName !== "measure") pw.appendChild(c.cloneNode(true));
    const ids = [];
    const pl = kid(pw, "part-list");
    if (pl) for (const sp of pl.getElementsByTagName("score-part")) ids.push(sp.getAttribute("id"));
    for (const m of measures) for (const p of kids(m, "part")) if (!ids.includes(p.getAttribute("id"))) ids.push(p.getAttribute("id"));
    for (const id of ids) {
      const part = doc.createElement("part");
      part.setAttribute("id", id);
      for (const m of measures) {
        const mp = kids(m, "part").find((p) => p.getAttribute("id") === id);
        const out = doc.createElement("measure");
        for (const a of m.attributes) out.setAttribute(a.name, a.value);
        if (mp) for (const c of kids(mp)) out.appendChild(c.cloneNode(true));
        part.appendChild(out);
      }
      pw.appendChild(part);
    }
    doc.replaceChild(pw, tw);
    return doc;
  }

  const STEPS = /^[A-G]$/;

  /**
   * Make a MusicXML document safe for OSMD. Returns the fixed text and a list
   * of what was changed (empty for a clean score).
   */
  function normalize(text) {
    const fixes = [];
    const doc = parseLenient(text, fixes);
    let rootName = doc.documentElement.tagName;
    if (rootName === "score-timewise") { timewiseToPartwise(doc); fixes.push("converted a time-wise score"); rootName = "score-partwise"; }
    if (rootName !== "score-partwise") {
      const e = new Error(rootName === "opus"
        ? "This is a MusicXML opus (a list of other score files), not a score — open one of the scores it names."
        : "This file isn't a MusicXML score (its root element is <" + rootName + ">).");
      e.userFacing = true;
      throw e;
    }
    const score = doc.documentElement;

    // ---- the part-list and the parts must agree ------------------------
    let pl = kid(score, "part-list");
    if (!pl) { pl = doc.createElement("part-list"); score.insertBefore(pl, kid(score, "part")); fixes.push("added a missing part list"); }
    let parts = kids(score, "part");
    for (const p of parts) {
      if (!kid(p, "measure")) { p.remove(); fixes.push("removed an empty part"); }
    }
    parts = kids(score, "part");
    if (!parts.length) {
      const e = new Error("This score has no music in it — none of its parts has a single bar.");
      e.userFacing = true;
      throw e;
    }
    const scoreParts = [...pl.getElementsByTagName("score-part")];
    const declared = new Set(scoreParts.map((sp) => sp.getAttribute("id")));
    const seen = new Set();
    let renamed = 0, added = 0;
    parts.forEach((p, i) => {
      let id = p.getAttribute("id");
      if (id && declared.has(id) && !seen.has(id)) { seen.add(id); return; }
      // the part at the same position in the list, if that one is unclaimed
      const sp = scoreParts[i];
      const cand = sp && sp.getAttribute("id");
      if (cand && !seen.has(cand) && !parts.some((q) => q !== p && q.getAttribute("id") === cand)) {
        p.setAttribute("id", cand); seen.add(cand); renamed++; return;
      }
      id = "P-auto-" + (i + 1);
      p.setAttribute("id", id);
      const nsp = doc.createElement("score-part");
      nsp.setAttribute("id", id);
      const nm = doc.createElement("part-name"); nm.textContent = "Part " + (i + 1);
      nsp.appendChild(nm);
      pl.appendChild(nsp);
      seen.add(id); added++;
    });
    if (renamed) fixes.push("matched " + renamed + " part id" + (renamed === 1 ? "" : "s") + " to the part list");
    if (added) fixes.push("listed " + added + " undeclared part" + (added === 1 ? "" : "s"));
    let dropped = 0;
    for (const sp of [...pl.getElementsByTagName("score-part")]) if (!seen.has(sp.getAttribute("id"))) { sp.remove(); dropped++; }
    if (dropped) fixes.push("dropped " + dropped + " part-list entr" + (dropped === 1 ? "y" : "ies") + " with no music");
    for (const g of [...pl.getElementsByTagName("part-group")]) if (!g.getAttribute("type")) g.remove();

    // Parts of different lengths: the engine reads bars only while EVERY part
    // still has one, so the whole score silently stopped at the end of the
    // shortest part (a one-bar extra part left one bar of music). The short
    // parts are padded with empty bars, which the engine fills with rests.
    const allParts = kids(score, "part");
    const longest = allParts.reduce((a, p) => (kids(p, "measure").length > kids(a, "measure").length ? p : a), allParts[0]);
    const refMeasures = kids(longest, "measure");
    let padded = 0;
    for (const p of allParts) {
      const have = kids(p, "measure").length;
      for (let i = have; i < refMeasures.length; i++) {
        const m = doc.createElement("measure");
        m.setAttribute("number", refMeasures[i].getAttribute("number") || String(i + 1));
        p.appendChild(m); padded++;
      }
    }
    if (padded) fixes.push("filled out " + padded + " missing bar" + (padded === 1 ? "" : "s") + " in shorter parts");

    // Every part must say how long its notes are (<divisions>) and which clef
    // it is in before its first note; a part that doesn't crashes the layout
    // ("reading 'parent'"). The divisions of the first part that has them are
    // the safe default: parts share the bar grid.
    let divDefault = null;
    for (const d of score.getElementsByTagName("divisions")) { const v = parseFloat(d.textContent); if (v > 0) { divDefault = String(v); break; } }
    let attrFix = 0;
    for (const p of kids(score, "part")) {
      const m1 = kid(p, "measure");
      let at = null, sawNote = false, hasDiv = false, hasClef = false;
      for (const el of kids(m1)) {
        if (el.tagName === "note") { sawNote = true; break; }
        if (el.tagName === "attributes") { at = at || el; if (kid(el, "divisions")) hasDiv = true; if (kid(el, "clef")) hasClef = true; }
      }
      if (hasDiv && hasClef) continue;
      if (!at) { at = doc.createElement("attributes"); m1.insertBefore(at, m1.firstChild); }
      if (!hasDiv) { const d = doc.createElement("divisions"); d.textContent = divDefault || "1"; at.insertBefore(d, at.firstChild); }
      if (!hasClef) {
        let sum = 0, n = 0;
        for (const o of p.getElementsByTagName("octave")) { sum += parseInt(o.textContent, 10) || 4; n++; if (n > 40) break; }
        const low = n && sum / n < 4;
        const c = doc.createElement("clef");
        c.innerHTML = low ? "<sign>F</sign><line>4</line>" : "<sign>G</sign><line>2</line>";
        // clef comes after divisions/key/time/staves in the schema
        at.appendChild(c);
      }
      attrFix++;
    }
    if (attrFix) fixes.push("gave " + attrFix + " part" + (attrFix === 1 ? "" : "s") + " a missing clef or note-length unit");

    // ---- measure contents ------------------------------------------------
    let chordFix = 0, stepFix = 0, octFix = 0, timeFix = 0, divFix = 0, durFix = 0, shiftFix = 0;
    for (const p of kids(score, "part")) {
      // 8va lines: a start with no stop crashes the layout. Document order is
      // not time order (a stop can be written before its start, after a
      // <backup>), so they are matched by count per line number, not in turn.
      const shifts = new Map();             // number -> { starts: [], stops: [] }
      for (const os of p.getElementsByTagName("octave-shift")) {
        const k = os.getAttribute("number") || "1";
        if (!shifts.has(k)) shifts.set(k, { starts: [], stops: [] });
        const t = os.getAttribute("type");
        if (t === "stop") shifts.get(k).stops.push(os);
        else if (t === "up" || t === "down") shifts.get(k).starts.push(os);
      }
      for (const { starts, stops } of shifts.values()) {
        if (!starts.length) { for (const os of stops) os.remove(); shiftFix += stops.length; continue; }
        for (let i = stops.length; i < starts.length; i++) { starts[i].remove(); shiftFix++; }
      }
      let curDiv = parseFloat(divDefault) || 1;
      for (const m of kids(p, "measure")) {
        let prevWasNote = false;
        for (const el of kids(m)) {
          const tag = el.tagName;
          if (tag === "attributes") {
            for (const d of kids(el, "divisions")) {
              const v = parseFloat(d.textContent);
              if (!(v > 0)) { d.remove(); divFix++; } else curDiv = v;
            }
            for (const t of kids(el, "time")) {
              if (kid(t, "senza-misura")) continue;
              const beats = kids(t, "beats").map((b) => b.textContent.trim());
              const types = kids(t, "beat-type").map((b) => b.textContent.trim());
              const ok = beats.length && beats.length === types.length &&
                beats.every((b) => /^\d+(\s*\+\s*\d+)*$/.test(b) && b.split("+").reduce((s, x) => s + parseInt(x, 10), 0) > 0) &&
                types.every((b) => /^\d+$/.test(b) && parseInt(b, 10) > 0);
              if (!ok) { t.remove(); timeFix++; }
            }
            prevWasNote = false;
            continue;
          }
          if (tag === "backup" || tag === "forward") {
            const d = kid(el, "duration");
            if (!d || !(parseFloat(d.textContent) >= 0)) { el.remove(); durFix++; }
            prevWasNote = false;
            continue;
          }
          if (tag === "direction") {
            // a direction emptied by the repairs above says nothing any more
            const dts = el.getElementsByTagName("direction-type");
            if ((!dts.length || [...dts].every((d) => !d.children.length)) && !kid(el, "sound")) el.remove();
            continue;
          }
          if (tag !== "note") continue;
          const isRest = !!kid(el, "rest");
          const chord = kid(el, "chord");
          if (chord && (isRest || !prevWasNote)) { chord.remove(); chordFix++; }
          const pitch = kid(el, "pitch");
          if (pitch) {
            const step = kid(pitch, "step");
            let s = step ? step.textContent.trim().toUpperCase() : "";
            if (s === "H") s = "B";
            if (step && STEPS.test(s)) { if (step.textContent !== s) { step.textContent = s; stepFix++; } }
            else {
              // no usable pitch: keep the time it takes, as a rest
              pitch.remove(); const r = doc.createElement("rest");
              el.insertBefore(r, el.firstChild);
              for (const c of kids(el, "chord")) c.remove();
              for (const t of [...kids(el, "tie"), ...el.getElementsByTagName("tied")]) t.remove();
              stepFix++;
            }
            const oct = kid(pitch, "octave");
            const ov = oct ? parseInt(oct.textContent, 10) : NaN;
            if (kid(el, "pitch") && !(ov >= 0 && ov <= 9)) {
              if (oct) oct.textContent = String(Math.max(0, Math.min(9, isNaN(ov) ? 4 : ov)));
              else { const o = doc.createElement("octave"); o.textContent = "4"; pitch.appendChild(o); }
              octFix++;
            }
            const alt = kid(pitch, "alter");
            if (alt && !isFinite(parseFloat(alt.textContent))) { alt.remove(); stepFix++; }
          }
          const rest = kid(el, "rest");
          if (rest) {
            const ds = kid(rest, "display-step"), dO = kid(rest, "display-octave");
            if ((ds && !STEPS.test(ds.textContent.trim())) || (dO && !(parseInt(dO.textContent, 10) >= 0))) {
              if (ds) ds.remove(); if (dO) dO.remove(); stepFix++;
            }
          }
          // A note that takes no time (duration 0, negative, unreadable) crashes
          // the engine's layout. Its written value says what it should be.
          const d = kid(el, "duration");
          if (d && !kid(el, "grace") && !(parseFloat(d.textContent) > 0)) {
            const ty = TYPE_WHOLE[txt(el, "type") || ""];
            let whole = ty || 0.25;
            const dots = kids(el, "dot").length;
            if (dots) whole *= 2 - Math.pow(0.5, dots);
            const tm = kid(el, "time-modification");
            if (tm) { const a = parseFloat(txt(tm, "actual-notes")), n = parseFloat(txt(tm, "normal-notes")); if (a > 0 && n > 0) whole *= n / a; }
            d.textContent = String(Math.max(1, Math.round(whole * 4 * curDiv)));
            durFix++;
          }
          prevWasNote = !isRest;
        }
      }
    }
    if (chordFix) fixes.push("fixed " + chordFix + " misplaced chord mark" + (chordFix === 1 ? "" : "s"));
    if (stepFix) fixes.push("fixed " + stepFix + " unreadable pitch" + (stepFix === 1 ? "" : "es"));
    if (octFix) fixes.push("fixed " + octFix + " missing octave" + (octFix === 1 ? "" : "s"));
    if (timeFix) fixes.push("ignored " + timeFix + " unreadable time signature" + (timeFix === 1 ? "" : "s"));
    if (divFix) fixes.push("ignored " + divFix + " invalid <divisions>");
    if (durFix) fixes.push("fixed " + durFix + " invalid duration" + (durFix === 1 ? "" : "s"));
    if (shiftFix) fixes.push("removed " + shiftFix + " unterminated 8va line" + (shiftFix === 1 ? "" : "s"));

    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(score);
    return { xml, fixes };
  }

  /**
   * Second attempt, when OSMD still throws: keep what is needed to read and
   * play the notes, drop what is only engraving (and is where the reader's
   * less-travelled code paths are).
   */
  function simplify(xml) {
    const fixes = [];
    const doc = parseLenient(xml, fixes);
    const score = doc.documentElement;
    const DROP = ["direction", "harmony", "figured-bass", "print", "sound", "listening", "bookmark", "link", "grouping", "credit", "defaults"];
    let n = 0;
    for (const name of DROP) for (const el of [...score.getElementsByTagName(name)]) { el.remove(); n++; }
    for (const el of [...score.getElementsByTagName("barline")]) { el.remove(); n++; }
    for (const el of [...score.getElementsByTagName("measure-style")]) { el.remove(); n++; }
    for (const note of [...score.getElementsByTagName("note")]) {
      // grace and cue notes take no time in the bar; their chord handling is
      // one of the reader's crash paths (a grace chord after a grace note)
      if (kid(note, "grace") || kid(note, "cue")) { note.remove(); n++; continue; }
      for (const name of ["lyric", "beam", "stem", "notehead", "play", "listen", "instrument"]) for (const el of kids(note, name)) { el.remove(); n++; }
      for (const nt of kids(note, "notations")) {
        for (const c of kids(nt)) if (c.tagName !== "tied") { c.remove(); n++; }
        if (!nt.children.length) nt.remove();
      }
      if (note.getAttribute("print-object") === "no") note.removeAttribute("print-object");
    }
    for (const at of [...score.getElementsByTagName("attributes")]) {
      for (const name of ["staff-details", "transpose", "directive", "part-symbol", "instruments", "for-part"]) for (const el of kids(at, name)) { el.remove(); n++; }
    }
    fixes.push("left out " + n + " engraving detail" + (n === 1 ? "" : "s") + " (dynamics, lyrics, repeats, chord symbols…)");
    return { xml: '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(score), fixes };
  }

  // ---------------------------------------------------------------- parts
  const KEYBOARD_NAME = /pian|pno|klav|clav|keyboard|keys\b|fortepiano|cemb|harpsi|organ|orgel|celest|synth|épinette|spinet/i;
  const PERC_NAME = /drum|perc|batter|schlag|timpan|kit\b|cymbal|snare/i;

  /**
   * Which staves are the pianist's. A score for voice and piano, or a lead
   * sheet with a band, used to give the "right hand" to whatever staff came
   * first (the singer) and the left hand to EVERYTHING else — so Wait mode
   * asked for the vocal line and both piano staves at once.
   *   parts: [{ name, staves, percussion }]  ->  per part: "practice" | "backing" | "off"
   */
  function defaultScoreParts(parts) {
    const out = parts.map(() => "backing");
    parts.forEach((p, i) => { if (p.percussion || PERC_NAME.test(p.name || "")) out[i] = "off"; });
    const pitched = parts.map((p, i) => i).filter((i) => out[i] !== "off");
    if (!pitched.length) return parts.map(() => "practice");
    // a keyboard part; or its two hands written as two one-staff parts
    // ("Piano (right)" + "Piano (left)"), which are practised together
    const keyboards = pitched.filter((i) => KEYBOARD_NAME.test(parts[i].name || ""));
    if (keyboards.length >= 2 && keyboards.slice(0, 2).every((i) => parts[i].staves === 1)) { out[keyboards[0]] = out[keyboards[1]] = "practice"; return out; }
    let piano = keyboards.length ? keyboards[0] : null;
    if (piano == null) piano = pitched.find((i) => parts[i].staves >= 2);
    if (piano != null) { out[piano] = "practice"; return out; }
    // no keyboard part: a single line/instrument is yours; an ensemble gives
    // its top line to the right hand and its bass to the left
    if (pitched.length <= 2) { for (const i of pitched) out[i] = "practice"; return out; }
    out[pitched[0]] = "practice"; out[pitched[pitched.length - 1]] = "practice";
    return out;
  }

  // ---------------------------------------------------------------- fallback reader
  const TYPE_WHOLE = { maxima: 8, long: 4, breve: 2, whole: 1, half: 0.5, quarter: 0.25, eighth: 0.125, "16th": 1 / 16,
    "32nd": 1 / 32, "64th": 1 / 64, "128th": 1 / 128, "256th": 1 / 256, "512th": 1 / 512, "1024th": 1 / 1024 };
  const STEP_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /**
   * An independent MusicXML reader for the notes alone, used when the
   * notation engine refuses a score even after simplification. It follows
   * divisions, <backup>/<forward>, chords, ties across bars, tempo marks and
   * transposing parts; grace and cue notes are left out (they are not part of
   * the beat). The result has no engraving (hasSheet: false) but plays,
   * scrolls and scores like any other piece.
   */
  function notesFromMusicXML(xml, timingApi, opts) {
    opts = opts || {};
    const doc = parseLenient(xml, []);
    if (doc.documentElement.tagName === "score-timewise") timewiseToPartwise(doc);
    const score = doc.documentElement;
    const names = new Map();
    for (const sp of score.getElementsByTagName("score-part")) names.set(sp.getAttribute("id"), txt(sp, "part-name") || "");
    const partEls = kids(score, "part");
    const partInfo = partEls.map((p) => {
      let staves = 1;
      for (const s of p.getElementsByTagName("staves")) staves = Math.max(staves, parseInt(s.textContent, 10) || 1);
      const percussion = [...p.getElementsByTagName("sign")].some((s) => s.textContent.trim() === "percussion") ||
                         p.getElementsByTagName("unpitched").length > 0;
      return { name: names.get(p.getAttribute("id")) || "", staves, percussion };
    });
    const roles = Object.assign(defaultScoreParts(partInfo), opts.parts || {});

    // Two passes over every part: the first measures each bar (a bar lasts as
    // long as its longest part — a pickup bar is short in all of them), the
    // second places the notes on that shared grid, so one part with an
    // under-filled bar can't drift out of step with the others.
    const lens = [];      // bar length in whole notes, max over parts
    const meters = [];    // { num, den } per bar (from the first part)
    const tempos = [];    // tempo mark in effect at the end of each bar (first part that has one)
    let firstBpm = 0;
    const raw = [];       // { midi, startWhole, durWhole, staffNo, part, backing }
    const walk = (p, pi, starts) => {
      const role = roles[pi];
      let divisions = 1, pos = 0, measureStart = 0, lastStart = 0;
      let num = 4, den = 4, transpose = 0, bpm = 0;
      const ties = new Map();          // "midi|staff|voice" -> open note
      kids(p, "measure").forEach((m, mi) => {
        if (starts) measureStart = starts[mi] != null ? starts[mi] : measureStart;
        pos = measureStart;
        let maxPos = measureStart;
        for (const el of kids(m)) {
          const tag = el.tagName;
          if (tag === "attributes") {
            const dv = parseFloat(txt(el, "divisions")); if (dv > 0) divisions = dv;
            const t = kid(el, "time");
            if (t && kid(t, "beats")) {
              const b = (txt(t, "beats") || "4").split("+").reduce((s, x) => s + (parseInt(x, 10) || 0), 0);
              const bt = parseInt(txt(t, "beat-type"), 10);
              if (b > 0 && bt > 0) { num = b; den = bt; }
            }
            const tr = kid(el, "transpose");
            if (tr) transpose = (parseInt(txt(tr, "chromatic"), 10) || 0) + 12 * (parseInt(txt(tr, "octave-change"), 10) || 0);
          } else if (tag === "backup") {
            pos -= (parseFloat(txt(el, "duration")) || 0) / divisions / 4;
            if (pos < measureStart) pos = measureStart;
          } else if (tag === "forward") {
            pos += (parseFloat(txt(el, "duration")) || 0) / divisions / 4;
            maxPos = Math.max(maxPos, pos);
          } else if (tag === "direction" || tag === "sound") {
            const snd = tag === "sound" ? el : kid(el, "sound");
            let t = snd ? parseFloat(snd.getAttribute("tempo")) : NaN;
            if (!(t > 0) && tag === "direction") {
              const pm = el.getElementsByTagName("per-minute")[0];
              const bu = el.getElementsByTagName("beat-unit")[0];
              const v = pm ? parseFloat(pm.textContent.replace(/[^\d.]/g, "")) : NaN;
              if (v > 0) t = v * ((TYPE_WHOLE[bu ? bu.textContent.trim() : "quarter"] || 0.25) / 0.25) *
                             (el.getElementsByTagName("beat-unit-dot").length ? 1.5 : 1);
            }
            if (t > 0) { bpm = t; if (!firstBpm && mi === 0) firstBpm = t; }
          } else if (tag === "note") {
            if (kid(el, "grace") || kid(el, "cue")) continue;
            const chord = !!kid(el, "chord");
            let durWhole = (parseFloat(txt(el, "duration")) || 0) / divisions / 4;
            if (!(durWhole > 0)) { const ty = TYPE_WHOLE[txt(el, "type") || ""]; durWhole = ty || 0; }
            const start = chord ? lastStart : pos;
            if (!chord) { lastStart = pos; pos += durWhole; maxPos = Math.max(maxPos, pos); }
            const pitch = kid(el, "pitch");
            if (!starts || !pitch || role === "off") continue;
            const step = (txt(pitch, "step") || "C").toUpperCase();
            const midi = 12 * ((parseInt(txt(pitch, "octave"), 10) || 4) + 1) + (STEP_PC[step] || 0) +
                         Math.round(parseFloat(txt(pitch, "alter")) || 0) + transpose;
            const staffNo = Math.max(1, parseInt(txt(el, "staff"), 10) || 1);
            const voice = txt(el, "voice") || "1";
            const tieTypes = kids(el, "tie").map((t) => t.getAttribute("type"));
            const key = midi + "|" + staffNo + "|" + voice;
            const open = ties.get(key);
            if (open && tieTypes.includes("stop") && Math.abs(open.startWhole + open.durWhole - start) < 1e-6) {
              open.durWhole += durWhole;
              if (!tieTypes.includes("start")) ties.delete(key);
              continue;
            }
            const rec = { midi, startWhole: start, durWhole, part: pi, staffNo, staves: partInfo[pi].staves, backing: role === "backing", measure: mi };
            raw.push(rec);
            if (tieTypes.includes("start")) ties.set(key, rec);
          }
        }
        let len = maxPos - measureStart;
        if (!(len > 1e-9)) len = num / den;
        if (!starts) {
          lens[mi] = Math.max(lens[mi] || 0, len);
          if (!meters[mi]) meters[mi] = { num, den };
          if (bpm > 0 && tempos[mi] == null) tempos[mi] = bpm;
          measureStart += len;
        }
      });
    };
    partEls.forEach((p, pi) => walk(p, pi, null));
    if (!lens.length) {
      const e = new Error("This score has no bars that could be read.");
      e.userFacing = true;
      throw e;
    }
    const starts = [];
    const rows = [];      // { startWhole, durWhole, bpm }
    let acc = 0, cur = firstBpm || 120;
    for (let i = 0; i < lens.length; i++) {
      starts.push(acc);
      if (tempos[i] > 0) cur = tempos[i];
      rows.push({ startWhole: acc, durWhole: lens[i], bpm: cur });
      if (!meters[i]) meters[i] = meters[i - 1] || { num: 4, den: 4 };
      acc += lens[i];
    }
    partEls.forEach((p, pi) => walk(p, pi, starts));
    const timing = timingApi.buildTimingMap(rows);
    const practiceParts = roles.map((r, i) => (r === "practice" ? i : -1)).filter((i) => i >= 0);
    const notes = [];
    let minMidi = Infinity, maxMidi = -Infinity;
    for (const r of raw) {
      const startSec = timing.wholeToSeconds(r.startWhole);
      const durSec = Math.max(0.03, timing.wholeToSeconds(r.startWhole + r.durWhole) - startSec);
      // staff 0 = right hand, 1 = left: the upper staff of the (first) practice
      // part is the right hand, its lower staff (or a second practice part) the left
      let staff;
      if (r.backing) staff = r.midi >= 60 ? 0 : 1;
      else if (practiceParts.length > 1) staff = r.part === practiceParts[0] ? 0 : 1;
      else staff = r.staves >= 2 ? (r.staffNo >= 2 ? 1 : 0) : 0;
      notes.push({ midi: r.midi, freq: 440 * Math.pow(2, (r.midi - 69) / 12), startSec, durSec, staff, measure: r.measure, backing: r.backing });
      if (!r.backing) { if (r.midi < minMidi) minMidi = r.midi; if (r.midi > maxMidi) maxMidi = r.midi; }
    }
    notes.sort((a, b) => a.startSec - b.startSec || a.midi - b.midi);
    const bars = timing.table.map((row, i) => ({
      number: i + 1, startSec: row.startSec,
      endSec: i + 1 < timing.table.length ? timing.table[i + 1].startSec : timing.totalSeconds,
      beats: meters[i].num, beatUnit: meters[i].den,
    }));
    const work = score.getElementsByTagName("work-title")[0] || score.getElementsByTagName("movement-title")[0];
    const composer = [...score.getElementsByTagName("creator")].find((c) => (c.getAttribute("type") || "") === "composer");
    return {
      format: "musicxml",
      title: work ? work.textContent.trim() : "",
      composer: composer ? composer.textContent.trim() : "",
      hasSheet: false,
      notes,
      cursorOnsetsWhole: [],
      secondsToWhole: timing.secondsToWhole,
      wholeToSeconds: timing.wholeToSeconds,
      durationSec: timing.totalSeconds,
      defaultBpm: firstBpm || (rows[0] && rows[0].bpm) || 120,
      timeSigNum: meters[0] ? meters[0].num : 4,
      timeSigDen: meters[0] ? meters[0].den : 4,
      staffCount: notes.some((n) => !n.backing && n.staff >= 1) ? 2 : 1,
      range: { minMidi: isFinite(minMidi) ? minMidi : 60, maxMidi: isFinite(maxMidi) ? maxMidi : 72 },
      bars,
      scoreParts: partInfo.map((p, i) => Object.assign({ index: i, part: roles[i] }, p)),
    };
  }

  const api = { sniff, decodeText, readScoreFile, unwrapRmid, normalize, simplify, notesFromMusicXML, defaultScoreParts, parseLenient, timewiseToPartwise };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.PT = root.PT || {}; root.PT.scoreImport = api; }
})(typeof window !== "undefined" ? window : globalThis);
