/* ============================================================================
 * app.js  —  Bootstrap & full UI wiring
 * ----------------------------------------------------------------------------
 * Brings every module together into one synchronized app:
 *
 *   load  → parser (MusicXML via OSMD, .mxl via mxl.js, or MIDI via @tonejs/midi)
 *           → fingering.annotate → 3 synchronized views:
 *               • SheetView      (OSMD notation + moving cursor)
 *               • PianoRollView  (falling notes + beat grid)
 *               • KeyboardView   (on-screen piano)
 *   play  → Transport (shared clock) drives audio + all three views via one
 *           requestAnimationFrame loop reading transport.position.
 *   practice → listen / follow / wait, with the practiced hand muted in audio,
 *              note gating in wait mode, and live scoring + timing from MIDI.
 *   input → Web MIDI (or mouse / computer keyboard) lights keys, feeds scoring,
 *           and sounds notes live.
 *   persistence → IndexedDB remembers pieces, the active profile, view toggles,
 *                 tempo, fingering overrides, best scores, and practice sessions.
 *
 * All cross-module timing flows through Transport so nothing drifts.
 * ========================================================================== */
(function () {
  "use strict";

  const PT = window.PT;
  const $ = (id) => document.getElementById(id);

  // ---- module instances ----------------------------------------------------
  let engine, transport, sheet, roll, keyboard, midi, store, plog;
  let practice;
  let song = null;
  let profile = PT.profiles.defaultProfile();
  let fingerOverrides = {};          // noteId -> finger (one note, manual)
  let fingerRules = {};              // "L:43" -> finger (every G2 in the left hand, manual)
  let rafId = null;
  let scrubbing = false;
  let pieceId = null;                // id of currently loaded piece (for scores/fingerings)
  let pieceName = "";
  let lastMidiBuffer = null;         // raw ArrayBuffer of last loaded MIDI (for convert-to-sheet)
  let onsetTimes = [];               // sorted unique note onsets of the loaded song (for step-back)
  let passSnapshot = null;           // score at the start of the current loop pass (for auto ramp)
  let playAccumMs = 0, lastTickWall = 0, breakNudged = false; // distributed-practice nudge
  let countInPoll = null;                        // watches for the count-in ending
  let runFinished = false;                       // a run ended; next Play starts a fresh one
  let latencySec = 0;                            // measured output delay (wireless audio)

  /*
   * What the player PERCEIVES as now. Audio reaches the ears latencySec after
   * the transport schedules it, so while playing, "now" for the eyes and for
   * judging a key press is the transport position minus that delay. Paused or
   * held at a Wait gate there is nothing in flight, so the true position is
   * shown — otherwise the display would sit short of the gate.
   */
  function perceivedPos() {
    const p = transport.position;
    return (latencySec > 0 && transport.isPlaying && !transport.inCountIn) ? Math.max(0, p - latencySec) : p;
  }
  let activeCursor = 0;              // moving index into song.notes for the sounding-note scan

  // view visibility
  const show = { sheet: true, roll: true, keyboard: true };

  /* ------------------------------------------------------------------------
   * Typing keyboard as a piano.
   *
   *      W   E       T   Y   U       O   P
   *    A   S   D   F   G   H   J   K   L   ;   '
   *    C   D   E   F   G   A   B   C   D   E   F
   *
   * The home row is the white keys and the row above holds the black ones,
   * each sitting in the gap between the two whites it divides — which is what
   * makes the shape land under the fingers the way a keyboard does. R, I and [
   * are deliberately SILENT: they sit over E-F, B-C and E-F, and a piano has no
   * black key in those gaps. Leaving them dead is what makes the pattern
   * legible by touch instead of being an arbitrary row of letters.
   *
   * Range C4-F5, an octave and a fourth, shifted with Z and X.
   *
   * Keyed on event.code (physical position), not event.key, so the layout is
   * identical on a Romanian, German or French keyboard — on those, the ; and '
   * keys do not produce ";" and "'" at all.
   * ---------------------------------------------------------------------- */
  const COMP_WHITE = ["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL","Semicolon","Quote"];
  const COMP_WHITE_SEMIS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17];
  const COMP_BLACK = { KeyW: 1, KeyE: 3, KeyT: 6, KeyY: 8, KeyU: 10, KeyO: 13, KeyP: 15 };
  const COMP_MAP = new Map();
  COMP_WHITE.forEach((code, i) => COMP_MAP.set(code, COMP_WHITE_SEMIS[i]));
  for (const code in COMP_BLACK) COMP_MAP.set(code, COMP_BLACK[code]);
  const COMP_SPAN = 17;                 // semitones from the lowest to highest
  const COMP_BASE_DEFAULT = 60;         // low key = middle C
  let compBase = COMP_BASE_DEFAULT;

  const els = {};
  function cacheEls() {
    [
      "fileInput","sampleList","btnExportMidi","btnHelp","btnHelpClose","helpDialog","btnSettings","btnSettingsClose","settingsDialog",
      "btnConvertSheet","convertGrid","btnDeletePiece",
      "btnPlay","btnPause","btnStop","scrubber","timeNow","timeTotal",
      "volume","tempo","tempoVal","zoom","zoomVal","noteSpeed","noteSpeedVal",
      "status","title","tempoInfo",
      "sheetPanel","sheetContainer","rollPanel","rollCanvas","keyboardPanel","keyboardSvg",
      "noSheet","toggleSheet","toggleRoll","toggleKeyboard","toggleLabels","toggleCursor","toggleGrid","toggleFit","toggleColour","toggleMoves","toggleOtherHand","lengthMode",
      "toggleMetronome","countInMode","metroSound","metroMeter","metroSub","metroLang","btnMetroPreview","btnSkipCountIn","clickVol","timingWindow",
      "modeListen","modeFollow","modeWait","handBoth","handRight","handLeft",
      "scorePanel","scoreCorrect","scoreWrong","scoreMissed","scoreAcc","scoreTiming","scoreLength",
      "scoreStreak","scorePoints","scoreBest",
      "btnMidi","midiDevices","midiStatus","midiChip","midiOpts","midiParts","toggleFitKeys","fitNote","btnExportData","btnImportData","importFile","dataNote",
      "profileSize","profileTranspose","profileBackend","backendNote",
      "btnLoopBar","btnLoopClear","loopInfo","loopFrom","loopTo","scrubLoop",
      "btnFingering","fingerNote","pieceList","toggleRamp","btnDrill","firstRun",
      "logPanel","logHint","logToday","logStreak","logTotal","logAdvice","logChart","logTrend",
      "hud","hudText","hudBar","hudBarWrap","fingerPad","fingerScope","scopeNote","scopePitch","scopePitchLabel","btnResetFingering","btnQuickListen","btnQuickLearn",
      "btnLearnPlay","btnLearnRepeat","btnClearControls","ctlPlayName","ctlRepeatName",
      "latency","latencyVal","btnCalibrate","calibNote","calibPanel","calibText","calibPad","dropZone",
      "handReach","handCm","handNote","fingerStyles","setNav","toasts","btnStyles","pieceInfo",
    ].forEach((id) => { els[id] = $(id); });
  }

  // ---- helpers -------------------------------------------------------------
  let _lastAriaTime = "";
  function announceScrub(pos) {
    const t = fmtTime(pos);
    if (t !== _lastAriaTime) { _lastAriaTime = t; els.scrubber.setAttribute("aria-valuetext", t + " of " + fmtTime(transport.duration)); }
  }

  function fmtTime(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  /*
   * MESSAGES take no space. The status line is read out to screen readers but
   * not shown in the page; its latest text sits in the panel over the falling
   * notes, which appears only while the pointer is over them. Errors — the
   * rare message that needs you to act — show for a few seconds regardless.
   */
  let alertTimer = 0;
  /**
   * opts.toast: false for practice feedback (it has the heads-up display);
   * otherwise a message with a kind also shows as a toast — except while the
   * music is playing, when only an error may interrupt.
   */
  function setStatus(msg, kind, opts) {
    els.status.textContent = msg;
    els.status.className = "status" + (kind ? " status--" + kind : "");
    const playing = transport && transport.isPlaying && !transport.inCountIn;
    if (msg && kind && !(opts && opts.toast === false) && (!playing || kind === "err")) toast(msg, kind);
    if (!els.hud) return;
    els.hudText.textContent = msg;
    els.hud.className = "hud" + (kind ? " hud--" + kind : "") + (msg ? "" : " is-empty");
    if (kind === "err") {
      els.hud.classList.add("is-alert");
      clearTimeout(alertTimer);
      alertTimer = setTimeout(() => els.hud && els.hud.classList.remove("is-alert"), 6000);
    }
  }
  /*
   * Practice feedback goes to the heads-up display over the falling notes AND
   * to the status line. The HUD is where the eyes are while playing (and is
   * aria-hidden); the status line keeps the aria-live announcement, so a
   * screen reader hears each message once.
   *   opts.sticky  keep it up until replaced (a gate that is waiting)
   *   opts.ms      how long a transient message stays (default 2.6 s)
   *   opts.holdMs  run the progress bar for this long (a hold in Wait)
   */
  /*
   * TOASTS: what just happened, for a few seconds, in the corner. The first
   * sentence is set bold so a long load summary reads at a glance; hovering
   * holds it, the x dismisses it. At most three at a time; a repeat of the
   * newest one replaces it instead of stacking.
   */
  function toast(msg, kind) {
    const box = els.toasts;
    if (!box) return;
    const last = box.lastElementChild;
    if (last && last.dataset.msg === msg) last.remove();
    const t = document.createElement("div");
    t.className = "toast toast--" + (kind || "ok");
    t.dataset.msg = msg;
    const text = document.createElement("div"); text.className = "toast__text";
    const m = /^(.+?[.!?\u2014])(\s.*)?$/.exec(msg);
    if (m && m[2]) { const b = document.createElement("b"); b.textContent = m[1]; text.append(b, document.createTextNode(m[2])); }
    else text.textContent = msg;
    const x = document.createElement("button"); x.className = "toast__close"; x.type = "button"; x.textContent = "\u00d7";
    x.setAttribute("aria-label", "Dismiss"); x.tabIndex = -1;
    t.append(text, x);
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    const life = kind === "err" ? 9000 : kind === "warn" ? 7000 : Math.min(7000, 3200 + msg.length * 18);
    let timer = 0;
    const leave = () => { t.classList.add("is-leaving"); setTimeout(() => t.remove(), 220); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(leave, life); };
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", arm);
    x.addEventListener("click", leave);
    arm();
  }

  let hudTimer = null;
  function coach(msg, kind, opts) {
    opts = opts || {};
    setStatus(msg, kind, { toast: false });
    if (!els.hud) return;
    clearTimeout(hudTimer);
    const bar = els.hudBar;
    bar.classList.remove("is-running");
    if (opts.holdMs) {
      els.hudBarWrap.classList.remove("is-hidden");
      els.hud.style.setProperty("--hold-ms", opts.holdMs + "ms");
      void bar.offsetWidth;                       // restart the animation
      bar.classList.add("is-running");
    } else {
      els.hudBarWrap.classList.add("is-hidden");
    }
  }
  function hideHud() { /* the panel shows on hover; nothing to hide */ }

  function midiName(m) {
    const N = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    return N[((m%12)+12)%12] + (Math.floor(m/12) - 1);
  }
  function transposed(m) { return m + (profile.transpose || 0); }

  /** Bar number containing a song time, or null when the piece has no bar map. */
  function barAt(sec) {
    if (!song || !song.bars || !song.bars.length) return null;
    const bars = song.bars;
    let lo = 0, hi = bars.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].startSec <= sec + 1e-6) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return bars[ans];
  }
  function barLabel(sec) {
    const b = barAt(sec);
    return b ? "bar " + b.number : fmtTime(sec);
  }

  /** Composer / meter / tempo, set as an edition would set it. */
  function headerMeta(rate) {
    if (!song) return "\u2014";
    const bits = [];
    const who = (song.composer || "").trim();
    if (who) bits.push(who);
    if (song.timeSigNum && song.timeSigDen) bits.push(song.timeSigNum + "/" + song.timeSigDen);
    const r = rate == null ? (transport ? transport.rate : 1) : rate;
    const bpm = Math.round(song.defaultBpm * r);
    bits.push(Math.abs(r - 1) < 1e-6 ? bpm + " BPM" : bpm + " BPM \u00b7 " + Math.round(r * 100) + "%");
    return bits.join("  \u00b7  ");
  }

  const PLACEHOLDER_TITLES = /^(midi file|untitled( score)?|score|no title|title)$/i;
  /** A score's own title, or null when it's a library placeholder. */
  /** FNV-1a over the bytes: a stable id for a file's content. */
  function contentHash(buf) {
    const u = new Uint8Array(buf); let h = 0x811c9dc5;
    for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }
  /** "Death_Note_The_World" -> "Death Note The World". */
  const prettyTitle = (stem) => stem.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim() || stem;

  function realTitle(t) {
    const s = (t || "").trim();
    return (!s || PLACEHOLDER_TITLES.test(s)) ? null : s;
  }

  const INSTRUMENT_LABELS = {
    synth: "offline synth",
    acoustic_grand_piano: "grand piano (bundled)",
    bright_acoustic_piano: "bright piano",
    electric_piano_1: "electric piano",
    harpsichord: "harpsichord",
    vibraphone: "vibraphone",
    music_box: "music box",
  };
  function instrumentLabel(v) { return INSTRUMENT_LABELS[v] || v; }

  // ============================================================ your hand
  /*
   * The fingering is worked out for the player's hand. It is described the
   * way a teacher asks — the widest interval thumb to little finger — and
   * stored in semitones (profile.handReach). The average adult hand of the
   * fingering model reaches 15: between a ninth and a tenth.
   */
  function handSpec() {
    return { reach: profile.handReach || (PT.fingering.HAND_REACH && PT.fingering.HAND_REACH[profile.handSize]) || 15 };
  }
  const REACH_NAMES = [[11.5, "less than an octave"], [13, "an octave"], [14.5, "a ninth"], [15.5, "between a ninth and a tenth"], [16.75, "a tenth"], [Infinity, "an eleventh or more"]];
  const reachName = (st) => REACH_NAMES.find(([lim]) => st < lim)[1];
  /*
   * Hand span in cm -> the widest interval, a RULE OF THUMB rather than a
   * measurement: a white key is 2.35 cm wide (an octave is 16.5 cm on a
   * standard keyboard), each white key is on average 12/7 semitones, and
   * about 2 cm of the span goes to the fingertips landing inside the keys.
   * It gives an octave at 18 cm and a ninth-to-tenth at 22 cm, in line with
   * published hand-span surveys, but a hand's flexibility matters as much as
   * its length — the interval you can play is the better input.
   */
  const cmToReach = (cm) => ((cm - 2) / 2.35) * (12 / 7);
  const STYLE_TEXT = {
    balanced: ["Balanced", "Fewest hand moves, then the most comfortable fingers \u2014 the method-book choice."],
    compact: ["Stay in position", "Stretches instead of moving the hand: fewer shifts. For a hand that reaches a tenth."],
    relaxed: ["Relaxed hand", "Never stretches past a relaxed span; the hand moves more often instead. For small hands."],
    legato: ["Legato", "Passes the thumb under (or a finger over) rather than lifting the hand, to keep lines joined."],
  };
  let fingerStrategy = null;      // this piece's fingering style; null = the one suggested for the hand
  const currentStrategy = () => fingerStrategy || PT.fingering.suggestedStrategy(handSpec());

  function showHand() {
    const reach = handSpec().reach;
    const opts = [...els.handReach.options].map((o) => parseFloat(o.value));
    let best = opts[0];
    for (const v of opts) if (Math.abs(v - reach) < Math.abs(best - reach)) best = v;
    els.handReach.value = String(best);
    els.handNote.textContent = "reaches " + reachName(reach) + " \u00b7 " + STYLE_TEXT[PT.fingering.suggestedStrategy(handSpec())][0].toLowerCase() + " suggested";
  }
  /** Settings -> Your hand: every fingering style, measured on the open piece. */
  let stylesTimer = 0;
  function renderStyles() {
    const box = els.fingerStyles;
    if (!box) return;
    clearTimeout(stylesTimer);
    if (!song || !song.notes.some((n) => !n.backing)) { box.innerHTML = "<p class='styles__empty'>Open a piece to compare fingering styles for it.</p>"; return; }
    box.innerHTML = "<p class='styles__empty'>Measuring the styles on this piece\u2026</p>";
    stylesTimer = setTimeout(() => {
      const list = PT.fingering.variants(song, handSpec(), { pins: currentPins() });
      const cur = currentStrategy();
      box.innerHTML = "";
      for (const v of list) {
        const [name, desc] = STYLE_TEXT[v.strategy];
        const lab = document.createElement("label");
        lab.className = "style" + (v.strategy === cur ? " is-on" : "");
        const inp = document.createElement("input");
        inp.type = "radio"; inp.name = "fingerStyle"; inp.value = v.strategy; inp.checked = v.strategy === cur;
        const body = document.createElement("span"); body.className = "style__body";
        const h = document.createElement("span"); h.className = "style__name"; h.textContent = name;
        if (v.suggested) { const b = document.createElement("em"); b.className = "style__badge"; b.textContent = "suggested for your hand"; h.appendChild(b); }
        const d = document.createElement("span"); d.className = "style__desc"; d.textContent = desc;
        const st = document.createElement("span"); st.className = "style__stats";
        const pl = (n, w, many) => n + " " + (n === 1 ? w : many || w + "s");
        st.textContent = [pl(v.jumps, "shift"), pl(v.passes, "pass", "passes"), pl(v.stretches, "stretch", "stretches")]
          .concat(v.alternations ? [pl(v.alternations, "finger change") + " on repeated notes"] : [])
          .concat(v.wideChords ? [pl(v.wideChords, "chord") + " too wide to hold"] : []).join(" \u00b7 ");
        body.append(h, d, st);
        lab.append(inp, body);
        box.appendChild(lab);
      }
    }, 30);
  }
  function setFingerStrategy(name) {
    fingerStrategy = name === PT.fingering.suggestedStrategy(handSpec()) ? null : name;
    applyFingerOverrides();
    saveFingerings();
    drawFrame();
    for (const l of els.fingerStyles.querySelectorAll(".style")) l.classList.toggle("is-on", l.querySelector("input").value === name);
    const fs = song && song.fingerStats;
    setStatus("Fingering: " + STYLE_TEXT[name][0] + (fs ? " \u2014 " + fs.jumps + " shifts, " + fs.passes + " thumb passes, " + fs.stretches + " stretches." : "."), "ok");
  }
  function setHandReach(reach) {
    profile.handReach = Math.max(9, Math.min(21, reach));
    persistProfile();
    showHand();
    if (!song) return;
    if (song.format === "midi") {        // which notes one hand can hold changes with it
      reimportMidi({ parts: Object.fromEntries((song.tracks || []).map((t) => [t.index, t.part])), fit: midiOpts.fit }).catch(showErr);
    } else {
      applyFingerOverrides(); drawFrame();
    }
    renderStyles();
  }

  // ============================================================ loading
  /*
   * A score reaches the notation engine in up to three attempts, because the
   * engine's one error ("given music sheet was incomplete or could not be
   * loaded") covers every way its reader can fail:
   *   1. the score as written, after normalize() has repaired what is known to
   *      break it (part list vs parts, misplaced chord marks, bad pitches…);
   *   2. simplified — notes, rests and structure only;
   *   3. no engraving at all: the notes read by score-import's own reader, so
   *      the piece still plays on the falling notes and the keyboard.
   * The load message says which one it took and what was repaired.
   */
  let xmlOpts = { parts: null };               // the open score's part choices
  let lastXml = null;                          // normalized MusicXML of the open score
  async function loadMusicXMLText(xml, fallbackTitle, persistAs, choice) {
    setStatus("Parsing notation\u2026");
    await endSession();
    lastMidiBuffer = null;
    xmlOpts = { parts: (choice && choice.parts) || null };
    const SI = PT.scoreImport;
    const prep = SI.normalize(xml);
    // re-reading the open score (new part choices) keeps what the first read repaired
    let fixes = ((choice && choice.fixes) || []).concat(prep.fixes), engraved = true, text = prep.xml, firstErr = null;
    try {
      await sheet.loadXML(text);
    } catch (e1) {
      firstErr = e1;
      console.warn("Notation engine refused the score; retrying simplified.", e1);
      const simple = SI.simplify(text);
      try {
        await sheet.loadXML(simple.xml);
        text = simple.xml;
        fixes = fixes.concat(simple.fixes);
      } catch (e2) {
        console.warn("Simplified score refused too; opening without notation.", e2);
        engraved = false;
      }
    }
    lastXml = text;
    if (engraved) {
      els.sheetPanel.classList.toggle("is-hidden", !show.sheet);
      els.noSheet.classList.add("is-hidden");
      song = PT.parser.extractFromOSMD(sheet.osmd, PT.timing, { parts: xmlOpts.parts });
      sheet.bindSong(song);
      updateZoomLabel();
    } else {
      sheet.clear();
      song = SI.notesFromMusicXML(text, PT.timing, { parts: xmlOpts.parts });
      song.engraveError = (firstErr && firstErr.message) || "unknown";
      els.sheetPanel.classList.add("is-hidden");
      showNoSheet("unengraved");
    }
    song.importFixes = fixes;
    finishLoad(fallbackTitle, "musicxml", text, persistAs);
  }
  /** Re-read the open score with new part choices (Settings -> This piece). */
  async function rechooseScoreParts(parts) {
    if (!song || song.format !== "musicxml" || !lastXml) return;
    const at = transport.position;
    await loadMusicXMLText(lastXml, pieceName || song.title, { id: pieceId, store: true }, { parts, fixes: song.importFixes || [] });
    if (at > 0) seekTo(Math.min(at, transport.duration || at));
  }

  /** The panel shown where the score would be: a MIDI file, or a score that could not be engraved. */
  function showNoSheet(kind) {
    els.noSheet.classList.remove("is-hidden");
    els.noSheet.dataset.kind = kind;
    const h = els.noSheet.querySelector("h2"), p = els.noSheet.querySelector("p");
    if (kind === "unengraved") {
      h.textContent = "This score opened without its notation";
      p.innerHTML = "The notation engine could not draw it, even simplified, so it is open <b>as notes only</b>: " +
        "the falling notes, the keyboard, scoring and every practice mode work. " +
        "<b>Make a simple score</b> re-writes the notes as a clean two-staff score the engine can draw.";
      els.btnConvertSheet.textContent = "Make a simple score";
    } else {
      h.textContent = "No notation in this file";
      p.innerHTML = "MIDI carries no sheet music. You can <b>convert it into notation</b> below &mdash; it estimates the key, spells the notes, and lays them out on two staves &mdash; or play it as it is, with the falling notes, the keyboard, scoring and the practice modes.";
      els.btnConvertSheet.textContent = "Convert to sheet music";
    }
  }
  // ============================================================ MIDI import
  const bufToB64 = (buf) => { const u = new Uint8Array(buf); let t = ""; for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(t); };
  const b64ToBuf = (b64) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  let midiOpts = { parts: null, fit: true };   // the open MIDI piece's choices

  /** The keys the player's keyboard has, in SONG pitch (transpose undone). */
  function playableSongRange() {
    const r = PT.profiles.rangeFor(profile), T = profile.transpose || 0;
    return { low: r.low - T, high: r.high - T };
  }
  const isPlayable = (n) => { const r = playableSongRange(); return n.midi >= r.low && n.midi <= r.high; };

  /*
   * FIT TO THE KEYBOARD. A downloaded MIDI file is written for no keyboard in
   * particular — a bass at E1 or a descant at E7 is fine on an 88-key piano and
   * missing on a 61-key one (C2-C7). Two steps, practice part only (backing
   * keeps its sound):
   *   1. if the part is narrow enough, move ALL of it by whole octaves until it
   *      fits — the music is unchanged, just higher or lower;
   *   2. otherwise move only the notes outside, each by the fewest octaves that
   *      bring it in (a bass E1 becomes E2: an octave doubling, not a wrong
   *      note), and merge any that land on a note already sounding there.
   * On by default; Settings -> This piece -> Fit to my keyboard turns it off
   * (then notes you can't reach are played by the app instead of asked).
   */
  const FIT_FEW = 0.15;         // up to this share of notes outside: move only those
  function fitToKeyboard(sg) {
    const { low, high } = playableSongRange();
    const prac = sg.notes.filter((n) => !n.backing);
    if (!prac.length) return { moved: 0 };
    let lo = Infinity, hi = -Infinity;
    for (const n of prac) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
    if (lo >= low && hi <= high) return { moved: 0 };
    const set = (n, m) => { n.midi = m; n.freq = 440 * Math.pow(2, (m - 69) / 12); };
    // Move as little of the music as possible. A few notes outside (the
    // lowest bass notes of "The World": 39 of 852) are moved in on their own
    // and everything else stays where it was written; moving the whole part an
    // octave instead would have put its melody up around A6. Only when many
    // notes are outside — a file written an octave off — does the whole part
    // move, which keeps its texture intact.
    const outside = prac.filter((n) => n.midi < low || n.midi > high).length;
    let k = null;
    if (outside > FIT_FEW * prac.length) {
      for (let c = -4; c <= 4; c++) if (lo + 12 * c >= low && hi + 12 * c <= high && (k === null || Math.abs(c) < Math.abs(k))) k = c;
    }
    if (k !== null) { for (const n of prac) set(n, n.midi + 12 * k); return { shift: k, moved: prac.length }; }
    let folded = 0;
    for (const n of prac) {
      let m = n.midi;
      while (m < low) m += 12;
      while (m > high) m -= 12;
      if (m !== n.midi) { set(n, m); folded++; }
    }
    const seen = new Map(), drop = new Set();
    for (const n of sg.notes) {
      if (n.backing) continue;
      const key = Math.round(n.startSec * 1000) + ":" + n.midi;
      const o = seen.get(key);
      if (!o) { seen.set(key, n); continue; }
      if (n.durSec > o.durSec) { drop.add(o); seen.set(key, n); } else drop.add(n);
    }
    if (drop.size) sg.notes = sg.notes.filter((n) => !drop.has(n));
    return { folded, merged: drop.size };
  }
  function practiceRange(sg) {
    let lo = Infinity, hi = -Infinity;
    for (const n of sg.notes) if (!n.backing) { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; }
    sg.range = { minMidi: isFinite(lo) ? lo : 60, maxMidi: isFinite(hi) ? hi : 72 };
  }
  function midiSummary(sg) {
    const names = (part) => (sg.tracks || []).filter((t) => t.part === part).map((t) => t.name || t.instrument || "track " + (t.index + 1));
    const bits = [];
    const back = names("backing");
    const pracTracks = (sg.tracks || []).filter((t) => t.part === "practice");
    // unnamed tracks would all read "acoustic grand piano": say what they are instead
    const prac = pracTracks.every((t) => !t.name)
      ? [pracTracks.length === 2 ? "both hands" : pracTracks.length === 1 ? "one track" : "all " + pracTracks.length + " tracks"]
      : names("practice");
    const drums = (sg.tracks || []).some((t) => t.percussion && t.part === "off");
    if ((sg.tracks || []).length > 1) {
      bits.push("practising " + prac.join(", "));
      if (back.length) bits.push("backing: " + back.join(", "));
      if (drums) bits.push("drums left out");
    }
    if (sg.reach && sg.reach.moved) bits.push(sg.reach.moved + " note" + (sg.reach.moved === 1 ? "" : "s") + " too far for one hand given to the other");
    if (sg.reach && sg.reach.left) bits.push(sg.reach.left + " out of reach, played for you");
    if (sg.meterChanges) bits.push("bars follow its " + sg.meterChanges + " time-signature change" + (sg.meterChanges === 1 ? "" : "s"));
    const f = sg.fitResult, r = PT.profiles.rangeFor(profile);
    const keys = profile.size + " keys (" + midiName(r.low) + "\u2013" + midiName(r.high) + ")";
    if (f && f.shift) bits.push("moved " + (f.shift > 0 ? "up " : "down ") + (Math.abs(f.shift) === 1 ? "an octave" : Math.abs(f.shift) + " octaves") + " to fit your " + keys);
    else if (f && f.folded) bits.push(f.folded + " note" + (f.folded === 1 ? "" : "s") + " outside your " + keys + " moved in by an octave" + (f.merged ? " (" + f.merged + " merged)" : ""));
    else if (!f && sg.notes.some((n) => !n.backing && !isPlayable(n))) bits.push("notes outside your " + keys + " will play by themselves");
    return bits.join(" \u00b7 ");
  }

  /** What loading a score did: which parts are yours, and what was repaired. */
  function scoreSummary(sg) {
    const bits = [];
    const parts = sg.scoreParts || [];
    if (parts.length > 1) {
      const nm = (p) => p.name || "part " + (p.index + 1);
      const prac = parts.filter((p) => p.part === "practice").map(nm);
      const back = parts.filter((p) => p.part === "backing").map(nm);
      bits.push("practising " + prac.join(" + "));
      if (back.length) bits.push("backing: " + back.join(", ") + " (Settings \u2192 This piece)");
    }
    if (sg.importFixes && sg.importFixes.length) bits.push("repaired on import: " + sg.importFixes.join("; "));
    return bits.join(" \u00b7 ");
  }

  /**
   * Settings -> This piece: the parts of the open piece and what each one does
   * — the tracks of a MIDI file, or the instruments of a score (voice + piano,
   * a band arrangement…). Fitting to the keyboard applies to MIDI only: a
   * score is never re-written, it has to match its notation.
   */
  function renderMidiOpts() {
    const isMidi = !!(song && song.format === "midi" && song.tracks);
    const scoreParts = song && song.format === "musicxml" && song.scoreParts && song.scoreParts.length > 1 ? song.scoreParts : null;
    els.midiOpts.classList.toggle("is-hidden", !isMidi && !scoreParts);
    els.midiOpts.dataset.kind = isMidi ? "midi" : "score";
    if (!isMidi && !scoreParts) return;
    const fitRow = els.toggleFitKeys.closest(".setgroup__row");
    if (fitRow) fitRow.classList.toggle("is-hidden", !isMidi);
    if (isMidi) {
      els.toggleFitKeys.checked = midiOpts.fit;
      const f = song.fitResult;
      els.fitNote.textContent = !midiOpts.fit ? "off" : f && f.shift ? "whole part moved " + (f.shift > 0 ? "up " : "down ") + Math.abs(f.shift) + " oct."
                              : f && f.folded ? f.folded + " note" + (f.folded === 1 ? "" : "s") + " moved in" : "already fits";
    }
    els.midiParts.innerHTML = "";
    const rows = isMidi
      ? song.tracks.map((t) => ({ index: t.index, part: t.part, off: t.part === "off",
          name: t.name || "Track " + (t.index + 1),
          meta: (t.instrument || "") + " \u00b7 " + t.count + " notes" + (t.percussion ? "" : " \u00b7 " + midiName(t.lo) + "\u2013" + midiName(t.hi)) }))
      : scoreParts.map((p) => ({ index: p.index, part: p.part, off: p.part === "off",
          name: p.name || "Part " + (p.index + 1),
          meta: p.staffCount + (p.staffCount === 1 ? " staff" : " staves") }));
    for (const t of rows) {
      const row = document.createElement("div");
      row.className = "part" + (t.off ? " is-off" : "");
      const name = document.createElement("span"); name.className = "part__name"; name.textContent = t.name;
      const meta = document.createElement("span"); meta.className = "part__meta"; meta.textContent = t.meta;
      const sel = document.createElement("select"); sel.className = "select select--inline"; sel.setAttribute("aria-label", "Part for " + t.name);
      for (const [v, l] of [["practice", "Practice"], ["backing", "Backing"], ["off", "Off"]]) { const o = document.createElement("option"); o.value = v; o.textContent = l; sel.appendChild(o); }
      sel.value = t.part; sel.dataset.track = String(t.index);
      row.append(name, meta, sel);
      els.midiParts.appendChild(row);
    }
  }
  /** Re-read the open MIDI file with new choices (parts, fit, keyboard). */
  async function reimportMidi(choice) {
    if (!song || song.format !== "midi" || !lastMidiBuffer) return;
    const at = transport.position;
    await loadMIDIBuffer(lastMidiBuffer, pieceName || song.title, { id: pieceId, store: true }, choice);
    if (at > 0) seekTo(Math.min(at, transport.duration || at));
  }

  async function loadMIDIBuffer(buf, fallbackTitle, persistAs, choice) {
    setStatus("Parsing MIDI\u2026");
    await endSession();
    lastMidiBuffer = buf;
    midiOpts = { parts: (choice && choice.parts) || null, fit: !(choice && choice.fit === false) };
    song = PT.parser.parseMIDI(buf, { parts: midiOpts.parts });
    song.fitResult = midiOpts.fit ? fitToKeyboard(song) : null;
    // a hand can't hold a chord wider than its comfortable 1-5 span (13
    // semitones for a medium hand): hand the outer note to the other hand
    song.reach = PT.parser.repairReach(song.notes, Math.round(PT.fingering.handReach(handSpec()).comfortable));
    practiceRange(song);
    sheet.clear();
    lastXml = null;
    els.sheetPanel.classList.add("is-hidden");
    showNoSheet("midi");
    finishLoad(fallbackTitle, "midi", buf, persistAs);
  }

  function finishLoad(fallbackTitle, format, content, persistAs) {
    // fingering (the piece's own style, if it has one, arrives with its edits)
    fingerStrategy = null;
    PT.fingering.annotate(song, handSpec(), { strategy: currentStrategy() });

    // views range from profile ∪ song — in PLAYED space, so the falling notes
    // land on exactly the keys the player presses even with transpose set
    const T = profile.transpose || 0;
    const shifted = { range: { minMidi: song.range.minMidi + T, maxMidi: song.range.maxMidi + T } };
    const range = PT.profiles.displayRange(profile, shifted);
    keyboard.setRange(range.low, range.high); keyboard.render();
    roll.setTranspose(T);
    roll.setRange(range.low, range.high); roll.setSong(song); roll.resize();

    // transport
    transport.load(song);
    transport.setRate(parseFloat(els.tempo.value));
    transport.clearLoop(); loopA = loopB = null; loopPass = 0; updateLoopInfo();
    if (song.bars && song.bars.length) { els.loopFrom.max = String(song.bars.length); els.loopTo.max = String(song.bars.length); }
    applyMetronome();
    if (els.firstRun) els.firstRun.classList.add("is-hidden");
    document.body.classList.remove("is-empty");

    passSnapshot = null;
    activeCursor = 0;
    if (els.btnDrill) els.btnDrill.classList.add("is-hidden");

    // onset list for step-back (chords merged within 12 ms)
    onsetTimes = [];
    for (const n of song.notes) {
      if (!onsetTimes.length || n.startSec - onsetTimes[onsetTimes.length - 1] > 0.012) {
        onsetTimes.push(n.startSec);
      }
    }

    // practice rebuild for current mode/hand
    rebuildPractice();

    // header. OSMD hands back a placeholder ("Untitled Score") for a score with
    // no <work-title>, and the old check only rejected the exact string
    // "Untitled" — so pieces without an embedded title were saved under OSMD's
    // placeholder instead of the file or sample name the player recognises.
    const title = realTitle(song.title) || fallbackTitle || "Untitled";
    pieceName = title;
    els.title.textContent = title;
    // The page no longer engraves its own title (the header owns it), so the
    // header carries the rest of the score's identity too.
    els.tempoInfo.textContent = headerMeta();
    els.timeTotal.textContent = fmtTime(song.durationSec);
    els.timeNow.textContent = "0:00";
    els.scrubber.max = String(Math.max(0.001, song.durationSec));
    els.scrubber.value = "0";
    enableControls(true);
    if (els.btnExportMidi) els.btnExportMidi.disabled = false;
    if (els.btnDeletePiece) els.btnDeletePiece.disabled = false;

    const r = song.range;
    const played = song.notes.filter((n) => !n.backing);
    const hands = played.some((n) => n.staff >= 1) ? "two hands" : "one hand";
    const extra = song.format === "midi" ? midiSummary(song) : scoreSummary(song);
    const outside = song.format !== "midi" ? played.filter((n) => !isPlayable(n)).length : 0;
    if (els.pieceInfo) {
      // the load summary stays readable here after its toast is gone
      els.pieceInfo.textContent = "";
      const b = document.createElement("b"); b.textContent = title;
      els.pieceInfo.append(b, document.createTextNode(" \u2014 " + (song.format === "midi" ? "MIDI" : song.hasSheet ? "MusicXML" : "MusicXML, opened as notes only") +
        " \u00b7 " + played.length + " notes to play" + (extra ? " \u00b7 " + extra : "") + "."));
    }
    const head = song.format === "midi" ? "Loaded MIDI. "
               : song.hasSheet ? "Loaded notation. "
               : "Opened as notes only \u2014 the notation engine couldn't draw this score (" + (song.engraveError || "unknown error") + "). ";
    setStatus(
      head +
      (played.length ? `${played.length} notes \u00b7 ${midiName(r.minMidi)}\u2013${midiName(r.maxMidi)} \u00b7 ${hands}` : "no notes to play in this score") +
      (extra ? " \u00b7 " + extra : "") +
      (outside ? ` \u00b7 ${outside} note${outside === 1 ? " is" : "s are"} outside your keyboard and will play by themselves (Transpose in Settings can bring them in)` : ""),
      song.hasSheet && !(song.importFixes && song.importFixes.length) ? "ok" : "warn"
    );

    // persist piece + load its best score and fingering overrides
    pieceId = persistAs && persistAs.id ? persistAs.id : ("piece-" + Date.now());
    if (persistAs && persistAs.store !== false) {
      // MIDI bytes are stored too (base64, so a backup file can carry them):
      // a saved MIDI piece used to be listed but impossible to reopen.
      const rec = { id: pieceId, name: title, format, addedAt: Date.now(),
                    content: format === "midi" ? bufToB64(content) : content };
      if (format === "midi") {
        rec.parts = Object.fromEntries((song.tracks || []).map((t) => [t.index, t.part]));
        rec.fit = midiOpts.fit;
      } else if (xmlOpts.parts) {
        rec.parts = xmlOpts.parts;
      }
      store.put("pieces", rec);
      refreshPieceList();
      store.setSetting("lastPiece", pieceId);
    }
    loadPieceExtras();
    renderMidiOpts();

    drawFrame();
  }

  async function loadPieceExtras() {
    if (!pieceId) return;
    const f = await store.get("fingerings", pieceId);
    fingerOverrides = (f && f.overrides) || {};
    fingerRules = (f && f.rules) || {};
    fingerStrategy = (f && PT.fingering.STRATEGIES[f.strategy]) ? f.strategy : null;
    applyFingerOverrides();
    if (els.settingsDialog.open && settingsTab === "hand") renderStyles();
    // Saved edits are easy to forget and look like suggestions: say so.
    const nEdits = Object.keys(fingerOverrides).length + Object.keys(fingerRules).length;
    if (nEdits) {
      // added to the load summary, not in place of it
      const base = els.status.textContent.replace(/\s*\u00b7\s*\d+ fingering edits? of yours.*$/, "");
      setStatus(base + " \u00b7 " + nEdits + (nEdits === 1 ? " fingering edit of yours" : " fingering edits of yours") +
                " (underlined on the falling notes; Settings \u2192 This piece \u2192 Reset fingering removes " + (nEdits === 1 ? "it" : "them") + ").", "ok");
    }
    const sc = await store.get("scores", pieceId);
    els.scoreBest.textContent = sc ? (sc.points + " pts / " + sc.accuracy + "%") : "\u2014";
    renderLog();
    drawFrame();
  }

  /*
   * FINGER EDITS are not pasted on top of the automatic fingering: they are
   * handed to the optimiser as fixed points ("pins") and everything around them
   * is re-fingered to fit. So forcing G2 onto the pinky can change the finger
   * of the note before it too, instead of leaving an island that no longer
   * connects. Two kinds of edit, one note wins over a rule:
   *   fingerOverrides  noteId -> finger       "this note"
   *   fingerRules      "L:43" -> finger       "every G2 in the left hand"
   */
  const handKey = (n) => (n.staff === 0 ? "R" : "L") + ":" + n.midi;
  function currentPins() {
    const pins = new Map();
    for (const n of song.notes) {
      if (n.id != null && fingerOverrides[n.id] != null) pins.set(n.id, fingerOverrides[n.id]);
      else if (fingerRules[handKey(n)] != null) pins.set(n.id, fingerRules[handKey(n)]);
    }
    return pins;
  }
  /** Re-finger the piece with the edits pinned. Returns how many notes changed. */
  function applyFingerOverrides() {
    if (!song) return 0;
    const before = song.notes.map((n) => n.finger);
    PT.fingering.annotate(song, handSpec(), { pins: currentPins(), strategy: currentStrategy() });
    let changed = 0;
    song.notes.forEach((n, i) => { if (n.finger !== before[i]) changed++; });
    if (els.btnResetFingering) els.btnResetFingering.disabled = !Object.keys(fingerOverrides).length && !Object.keys(fingerRules).length;
    return changed;
  }
  function saveFingerings() {
    if (pieceId) store.put("fingerings", { id: pieceId, overrides: fingerOverrides, rules: fingerRules, strategy: fingerStrategy });
  }
  /** Notes an edit on `n` would touch in "every" scope: same pitch, same hand. */
  function samePitchSameHand(n) {
    const k = handKey(n);
    return song.notes.filter((x) => handKey(x) === k);
  }
  const HAND_NAME = { R: "right hand", L: "left hand" };
  function updateScopeLabel() {
    const n = fingerEditNoteRef;
    if (!n) { els.scopePitchLabel.textContent = "Every one"; return; }
    const count = samePitchSameHand(n).length;
    els.scopePitchLabel.textContent = "Every " + midiName(transposed(n.midi)) + " \u00b7 " +
      HAND_NAME[handKey(n)[0]] + " (" + count + ")";
  }
  const fingerScope = () => (els.scopePitch.checked ? "pitch" : "note");

  // ============================================================ practice
  function currentMode() {
    return els.modeWait.checked ? "wait" : els.modeFollow.checked ? "follow" : "listen";
  }
  function currentHand() {
    return els.handRight.checked ? "right" : els.handLeft.checked ? "left" : "both";
  }

  function rebuildPractice() {
    if (!song) return;
    const mode = currentMode(), hand = currentHand();
    practice.setWindow(els.timingWindow ? els.timingWindow.value : "normal");
    practice.setLengthMode(els.lengthMode ? els.lengthMode.value : "strict");
    practice.setPlayable(isPlayable);
    practice.build(song, mode, hand);
    // grace notes: playing one is right, but no gate waits for it
    const orn = song.notes.filter((n) => n.ornament);
    practice.setOrnamentTest(orn.length ? (m, t) => orn.some((n) => n.midi === m && Math.abs(n.startSec - t) < 0.6) : null);
    practice.setPositionGetter(() => perceivedPos());
    practice.setRateGetter(() => transport.rate);

    // One audio policy for the hand selector: Listen SOLOS the selected hand;
    // Follow/Wait mute it (you play it) while the app plays the other.
    // Backing parts and notes your keyboard doesn't have are always the app's.
    const hearOther = !!(els.toggleOtherHand && els.toggleOtherHand.checked);
    const mine = (n) => hand === "both" || (hand === "right" ? n.staff === 0 : n.staff >= 1);
    // backing always plays; a note you CAN'T play (off the keyboard, out of reach)
    // plays only if it belongs to the hand you are learning — the other hand
    // stays silent unless you ask for it
    transport.noteFilter = (n) => n.backing ||
      ((n.unreachable || !isPlayable(n)) && (mode !== "listen") && (mine(n) || hearOther)) ||
      PT.Practice.audioAllows(mode, hand, n.staff, hearOther);
    practice.setPlayable(isPlayable);

    // make the isolation visible too: fade the other hand in the falling notes
    roll.setFocusStaff(hand === "right" ? 0 : hand === "left" ? 1 : null);
    roll.clearMarks();
    roll.setExpected(null);
    drawFrame();

    sheet.clearMarks();
    practice.releaseAllKeys();

    // scoring panel visibility
    els.scorePanel.classList.toggle("is-hidden", mode === "listen");
    els.timingWindow.disabled = mode !== "follow";

    // wait-mode: set first hold gate
    if (mode === "wait") transport.setHold(practice.nextGateTime());
    else transport.clearHold();
    const wasWait = document.body.classList.contains("is-wait");
    document.body.classList.toggle("is-wait", mode === "wait");
    if (wasWait !== (mode === "wait")) window.dispatchEvent(new Event("resize"));   // the stage re-flows
    lastPressWall = 0;

    // A hand with nothing to play is a silent, confusing run: say so.
    if (mode !== "listen" && hand !== "both" && practice.events.length === 0) {
      setStatus("This piece has no " + hand + "-hand notes \u2014 nothing to practise on that side.", "warn");
    }

    keyboard.clearSource("expected");
    refreshScore(practice.score, practice.accuracy());
    armWait();
  }

  function onGateOpen(e) {
    // Light the required keys (transposed to the player's keyboard), with the
    // suggested finger number as a badge on each.
    keyboard.setSource("expected", [...e.required].map(transposed));
    roll.setExpected(e.required);
    const badges = new Map();
    for (const m of e.required) {
      const n = song && song.notes.find(
        (x) => x.midi === m && Math.abs(x.startSec - e.timeSec) < 0.012
      );
      if (n && n.finger) badges.set(transposed(m), n.finger);
    }
    keyboard.setBadges(badges.size ? badges : null);
    const names = [...e.required].sort((a, b) => a - b).map((m) => midiName(transposed(m))).join(" + ");
    coach((e.required.size > 1 ? "Play together: " : "Waiting for ") + names + "\u2026", "warn", { sticky: true });
    drawFrame();
  }
  /** Strict length in Wait: the chord is down — now it has to be held. */
  function onHolding(h) {
    const sec = h.sec, ms = Math.round(sec * 1000);
    coach("Hold it\u2026 " + (sec >= 0.25 ? sec.toFixed(1) + " s" : ""), "warn", { sticky: true, holdMs: ms });
    keyboard.setSource("expected", [...h.event.required].map(transposed));
    // the chord fills with green on the keys themselves while it is held
    if (els.keyboardSvg) els.keyboardSvg.style.setProperty("--hold-ms", ms + "ms");
    keyboard.setSource("holding", [...h.event.required].map(transposed));
  }
  /** A note's release has been judged (either mode). */
  function onLength(r) {
    if (!r || r.verdict === "good" || !r.event) return;
    if (practice.lengthMode !== "strict") return;
    const songMidi = r.midi;
    for (const n of notesAtGate(r.event, songMidi)) sheet.markNote(n, "held");
    keyboard.flash("wrong", transposed(songMidi), 160);
    roll.mark(songMidi, r.event.timeSec, "wrong");
    if (currentMode() === "wait") {
      keyboard.clearSource("holding");
      coach("Let go too soon \u2014 strike " + midiName(transposed(songMidi)) + " again and hold it.", "warn", { sticky: true });
    } else {
      coach(r.verdict === "short" ? "Clipped \u2014 hold notes for their length." : "Overheld \u2014 release on time.", "warn");
    }
    els.scoreLength.textContent = lengthText();
  }

  /*
   * WAIT MODE HAS NO PLAY BUTTON. The transport bar is hidden there, so the
   * mode has to work without it: the keys to press light up the moment the
   * app is waiting (mode chosen, piece loaded, seek, stop, end), the first
   * right note starts things, and after the last note the next first note
   * starts a fresh run — the finished run's score stays on screen until then.
   */
  function armWait() {
    if (!song || !practice || currentMode() !== "wait" || transport.isPlaying) return;
    const gt = practice.nextGateTime();
    if (gt == null) return;
    transport.setHold(gt);
    practice.openCurrentGate();
  }
  function restartWaitRun() {
    runFinished = false;
    transport.seek(0);
    practice.resetRun();
    sheet.clearMarks(); roll.clearMarks(); roll.setExpected(null);
    keyboard.clearSource("expected"); keyboard.setBadges(null);
    if (els.btnDrill) els.btnDrill.classList.add("is-hidden");
    armWait();
  }
  // Practice time in Wait mode is ACTIVITY, not playhead motion: the playhead
  // stands still at every gate, which is where the practising happens. Each
  // gap between key presses counts, up to 30 s (a longer silence is a break).
  let lastPressWall = 0;
  function countWaitActivity() {
    const now = Date.now();
    if (lastPressWall && plog) plog.addTime(Math.min(30000, now - lastPressWall));
    lastPressWall = now;
  }

  function onGateProgress(p) {
    const names = (arr) => arr.slice().sort((a, b) => a - b).map((m) => midiName(transposed(m)));
    const missing = p.required.filter((m) => !p.held.includes(m));
    keyboard.clearSource("holding");
    coach(p.held.length
      ? `Hold ${names(p.required).join(" + ")} together \u2014 still need ${names(missing).join(", ")}.`
      : `Chord released \u2014 play ${names(p.required).join(" + ")} together.`, "warn", { sticky: true });
  }
  function onGateCleared() {
    keyboard.clearSource("expected");
    keyboard.setBadges(null);
    roll.setExpected(null);
    // advance hold to next gate and resume
    transport.setHold(practice.nextGateTime());
    transport.play({ countIn: false });
    ensureRaf();
    keyboard.clearSource("holding");
    coach("Good \u2014 keep going.", "ok", { ms: 1200 });
  }

  function refreshScore(score, acc) {
    els.scoreCorrect.textContent = score.correct;
    els.scoreWrong.textContent = score.wrong;
    els.scoreMissed.textContent = score.missed;
    els.scoreAcc.textContent = acc + "%";
    els.scoreStreak.textContent = score.streak + " (best " + score.bestStreak + ")";
    els.scorePoints.textContent = score.points;
    els.scoreTiming.textContent = timingText();
    els.scoreLength.textContent = lengthText();
  }

  /**
   * Note-length readout: the typical held-to-written ratio, plus whichever
   * fault is more common. Kept out of the accuracy figure on purpose — you can
   * play every note correctly and in time and still clip all of them.
   */
  function lengthText() {
    if (practice.lengthMode === "off") return "off";
    if (currentMode() === "wait") {
      const e = practice.score.lengthErrors;
      return e ? e + " let go early" : "held";
    }
    const l = practice.lengthStats();
    if (!l.n) return "\u2014";
    const pct = Math.round(l.median * 100) + "%";
    if (l.short > l.long && l.short) return pct + " \u00b7 " + l.short + " clipped";
    if (l.long > l.short && l.long) return pct + " \u00b7 " + l.long + " overheld";
    return pct + " \u00b7 even";
  }

  /**
   * Timing readout. Two numbers, because they mean different things:
   *   the sign of the mean says whether you are ahead of or behind the beat
   *   (a tempo choice), and the spread says how consistent you are (control).
   */
  function timingText() {
    if (currentMode() !== "follow") return "\u2014";
    const t = practice.timingStats();
    if (!t.n) return "\u2014";
    const dir = t.meanMs < -8 ? "ahead" : t.meanMs > 8 ? "behind" : "on";
    const mag = Math.abs(t.meanMs);
    return (dir === "on" ? "on the beat" : mag + " ms " + dir) + " \u00b1" + t.sdMs;
  }

  async function saveBestScore() {
    if (!pieceId || !practice || currentMode() === "listen") return;
    const judged = practice.score.correct + practice.score.wrong + practice.score.missed;
    if (!judged) return;
    const acc = practice.accuracy(), pts = practice.score.points;
    const prev = await store.get("scores", pieceId);
    if (!prev || pts > prev.points) {
      await store.put("scores", { id: pieceId, points: pts, accuracy: acc, at: Date.now() });
      els.scoreBest.textContent = pts + " pts / " + acc + "%";
    }
  }

  // ============================================================ practice log
  function beginSession() {
    if (!plog || !pieceId) return;
    plog.begin(pieceId, pieceName, currentMode(), currentHand());
  }
  async function endSession() {
    if (!plog) return;
    const s = practice ? practice.score : null;
    const rec = await plog.end(s ? {
      correct: s.correct, wrong: s.wrong, missed: s.missed,
      accuracy: practice.accuracy(), points: s.points,
      mode: currentMode(), hand: currentHand(),
    } : null);
    if (rec) renderLog();
    return rec;
  }

  function renderLog() {
    if (!plog || !els.logChart) return;
    const days = plog.dailyTotals(14);
    const today = Math.round(plog.todaySeconds() / 60);
    const total = Math.round(days.reduce((s, d) => s + d.seconds, 0) / 60);
    const streak = plog.streak();
    els.logToday.textContent = today + " min";
    els.logStreak.textContent = streak + (streak === 1 ? " day" : " days");
    els.logTotal.textContent = total + " min";
    els.logHint.textContent = streak > 1 ? "\u00b7 " + streak + "-day streak" : (today ? "\u00b7 " + today + " min today" : "");

    const max = Math.max(60, ...days.map((d) => d.seconds));
    els.logChart.innerHTML = "";
    for (const d of days) {
      const col = document.createElement("div");
      col.className = "log__bar" + (d.seconds ? "" : " log__bar--empty");
      col.style.setProperty("--h", Math.round(100 * d.seconds / max) + "%");
      col.title = d.day + " \u2014 " + Math.round(d.seconds / 60) + " min";
      els.logChart.appendChild(col);
    }

    // Spacing beats massing: nudge toward a second day rather than a longer one.
    const daysPractised = days.filter((d) => d.seconds > 0).length;
    els.logAdvice.textContent = daysPractised <= 1
      ? "Short sessions on more days beat one long one \u2014 sleep between them is when motor memory consolidates."
      : (today > 45 ? "Long session today. Stopping while it still feels good is fine; tomorrow does the consolidating."
                    : "");

    const trend = pieceId ? plog.pieceTrend(pieceId) : [];
    if (trend.length >= 2) {
      const last = trend.slice(-8);
      els.logTrend.innerHTML = "<span class='log__trendlabel'>" + (pieceName || "this piece") + " accuracy</span>" +
        last.map((t) => "<i style='--v:" + t.accuracy + "%' title='" + t.accuracy + "%'></i>").join("") +
        "<span class='log__trendlabel'>" + last[last.length - 1].accuracy + "%</span>";
    } else {
      els.logTrend.innerHTML = "";
    }
  }

  // ============================================================ input
  const livePress = new Map();     // midi -> press number, while the key is down
  let pressSeq = 0;
  function handleNoteOn(midiNote, velocity) {
    if (practice && currentMode() === "wait" && song) {
      if (runFinished) restartWaitRun();          // the first note after the end starts again
      if (!plog || !plog._open) beginSession();
      countWaitActivity();
    }
    // Browsers keep audio muted until a gesture; unlock on the first key so the
    // on-screen keyboard and a MIDI keyboard both sound before Play is pressed.
    // The note is sounded once the audio is running — and only if the key is
    // still down by then: a quick first tap used to start the note AFTER its
    // release had already been handled, leaving it ringing for good.
    const press = ++pressSeq;
    livePress.set(midiNote, press);
    if (!engine.started) {
      engine.ensureStarted().then(() => {
        if (livePress.get(midiNote) === press) engine.noteOnLive(midiNote, PT.parser.midiToFreq(midiNote), velocity || 0.8);
      });
    }
    const sounding = midiNote;            // what the player physically pressed
    const songNote = sounding - (profile.transpose || 0); // map back to score pitch
    keyboard.add("user", sounding);
    engine.noteOnLive(sounding, PT.parser.midiToFreq(sounding), velocity || 0.8);

    // fingering edit: remember which note to re-finger on the next 1–5 press
    if (els.fingerNote && els.btnFingering && els.btnFingering.classList.contains("is-on")) {
      fingerEditNoteRef = nearestNoteOfPitch(songNote, transport.position);
      fingerEditMidiNote = songNote;
      updateScopeLabel();
      els.fingerNote.textContent = fingerEditNoteRef
        ? midiName(songNote) + " @ " + barLabel(fingerEditNoteRef.startSec) + " \u2014 press 1\u20135"
        : midiName(songNote) + " \u2014 not in this piece";
    }

    if (practice && currentMode() !== "listen") {
      const res = practice.noteOn(songNote);
      const hit = practice.lastHit;
      if (res === "correct") {
        keyboard.flash("correct", sounding, 220);
        if (hit && hit.event) paintScore(hit.event, songNote, "correct");
        if (hit && hit.grade && hit.grade !== "ontime") {
          coach(hit.grade === "early" ? "A touch early." : "A touch late.", "warn", { ms: 1100 });
        }
      } else if (res === "wrong") {
        keyboard.flash("wrong", sounding, 220);
        roll.mark(songNote, transport.position, "wrong");
        // Wait mode: a wrong press marks what the gate is still waiting for.
        if (currentMode() === "wait" && hit && hit.event) {
          for (const n of notesAtGate(hit.event)) {
            if (!practice.pressedForGate.has(n.midi)) sheet.markNote(n, "wrong");
          }
        }
      }
    }
  }
  function handleNoteOff(midiNote) {
    livePress.delete(midiNote);
    keyboard.remove("user", midiNote);
    engine.noteOffLive(midiNote);
    // Release is part of the note too. In Follow it closes the length
    // measurement; in Wait it is how the app knows a chord came apart.
    if (practice && currentMode() !== "listen") {
      const songNote = midiNote - (profile.transpose || 0);
      practice.noteOff(songNote);          // verdicts arrive through onLength
      els.scoreLength.textContent = lengthText();
    }
  }

  /** The song notes of the practiced hand at a gate, optionally one pitch. */
  function notesAtGate(e, midi) {
    if (!song || !e) return [];
    const out = [];
    for (const n of song.notes) {
      if (n.startSec > e.timeSec + 0.012) break;
      if (Math.abs(n.startSec - e.timeSec) > 0.012) continue;
      if (midi != null && n.midi !== midi) continue;
      if (!e.required.has(n.midi)) continue;
      out.push(n);
    }
    return out;
  }

  /** Colour the engraved notes for a scoring event. */
  function paintScore(e, midi, state) {
    if (!song || !song.hasSheet) return;
    for (const n of notesAtGate(e, midi)) sheet.markNote(n, state);
  }

  /** The occurrence of a pitch closest to a song time (for fingering edits). */
  function nearestNoteOfPitch(songMidi, atSec) {
    if (!song) return null;
    let best = null, bd = Infinity;
    for (const n of song.notes) {
      if (n.midi !== songMidi) continue;
      const d = Math.abs(n.startSec - atSec);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // ============================================================ raf loop
  function ensureRaf() { if (rafId === null) rafId = requestAnimationFrame(tick); }
  function tick() {
    const now = Date.now();
    if (lastTickWall) {
      const dt = now - lastTickWall;
      playAccumMs += dt;
      if (plog && currentMode() !== "wait") plog.addTime(dt);   // Wait counts activity instead
    }
    lastTickWall = now;
    if (!breakNudged && playAccumMs > 10 * 60 * 1000) {
      breakNudged = true;
      setStatus("Ten minutes of practice \u2014 research says a short break now helps it stick.", "ok");
    }
    const pos = perceivedPos();
    syncViews(pos);
    if (practice && currentMode() === "follow") {
      const before = practice.score.missTimes.length;
      practice.advanceFollowTo(pos);
      for (let i = before; i < practice.score.missTimes.length; i++) {
        markMissedAt(practice.score.missTimes[i]);
      }
    }
    if (transport.isPlaying) rafId = requestAnimationFrame(tick);
    else { rafId = null; lastTickWall = 0; drawFrame(); }
  }
  function drawFrame() { syncViews(perceivedPos()); }

  /** Put a "missed" badge on every required note of the gate at `t`. */
  function markMissedAt(t) {
    const e = practice.events.find((x) => Math.abs(x.timeSec - t) < 1e-6);
    if (!e) return;
    for (const m of e.required) {
      if (!e._matched || !e._matched.has(m)) { roll.mark(m, t, "miss"); paintScore(e, m, "wrong"); }
    }
  }

  function syncViews(pos) {
    els.timeNow.textContent = fmtTime(pos);
    if (!scrubbing) els.scrubber.value = String(pos);
    els.scrubber.style.setProperty("--p", transport.duration ? (100 * pos / transport.duration).toFixed(2) : "0");
    announceScrub(pos);

    // sheet cursor
    if (song && song.hasSheet && sheet.loaded && show.sheet) sheet.syncTo(pos, song);

    // active sounding notes, computed once for both roll + keyboard
    const active = (show.roll || show.keyboard) ? activeSoundingSet(pos) : null;

    if (show.roll) {
      roll.activeMidis = active ? new Set([...active.r, ...active.l]) : null;
      roll.render(pos);
    }
    if (show.keyboard && active) {
      keyboard.setSource("playR", [...active.r].map(transposed));
      keyboard.setSource("playL", [...active.l].map(transposed));
    }
  }

  /**
   * Currently sounding notes, split by hand so the keys can light in the
   * matching colour (right = amber, left = teal). Song-pitch space; the caller
   * transposes for the keyboard. Muted (practiced) hands are skipped so the
   * player's own presses show instead.
   *
   * The scan starts from a cursor that walks forward with the playhead instead
   * of restarting at note 0 every frame — on a long piece that was tens of
   * thousands of comparisons per frame for a handful of sounding notes.
   */
  function activeSoundingSet(pos) {
    const r = new Set(), l = new Set();
    if (!song || !song.notes.length) return { r, l };
    const notes = song.notes;
    const maxDur = song._maxDur || (song._maxDur = notes.reduce((m, n) => Math.max(m, n.durSec), 0));
    // Re-seek only when the playhead jumps backwards (seek/loop wrap).
    if (activeCursor >= notes.length || notes[activeCursor].startSec > pos) activeCursor = 0;
    let i = activeCursor;
    const from = pos - maxDur;
    while (i < notes.length && notes[i].startSec < from) i++;
    activeCursor = i;
    for (; i < notes.length; i++) {
      const n = notes[i];
      if (n.startSec > pos) break;
      if (pos < n.startSec + n.durSec) {
        if (!n.backing && (!transport.noteFilter || transport.noteFilter(n))) (n.staff === 0 ? r : l).add(n.midi);
      }
    }
    return { r, l };
  }

  // ============================================================ metronome
  /**
   * Build the transport's metronome config from the loaded song.
   * Sheet pieces click through their real tempo map (wholeToSeconds), so the
   * clicks stay correct across tempo changes; MIDI pieces use a constant beat.
   * Accents follow the bar map rather than "every N beats from zero", so a
   * pickup measure doesn't push every downbeat accent onto the wrong beat.
   */
  function metronomeConfig() {
    if (!song) return null;
    // Beats per bar: the score's time signature, unless the player chose one
    // (a MIDI file's header can simply be wrong).
    const override = els.metroMeter && els.metroMeter.value !== "auto" ? els.metroMeter.value.split("/").map(Number) : null;
    const num = override ? override[0] : (song.timeSigNum || 4);
    const den = override ? override[1] : (song.timeSigDen || 4);
    const beatsPerMeasure = num;
    let beatTimeFor;
    if (song.hasSheet && song.wholeToSeconds) {
      const beatWhole = 1 / den;                              // the denominator's beat unit
      beatTimeFor = (k) => {
        const t = song.wholeToSeconds(k * beatWhole);
        return (t == null || t > song.durationSec + 1e-6) ? null : t;
      };
    } else if (!override && song.bars && song.bars.length && song.bars.every((b) => b.beats > 0)) {
      // A MIDI file's own bars, meter changes included: each bar has its own
      // number of beats, evenly spaced across it.
      const beats = [];
      for (const b of song.bars) for (let j = 0; j < b.beats; j++) beats.push({ t: b.startSec + (j * (b.endSec - b.startSec)) / b.beats, n: j + 1, of: b.beats });
      beatTimeFor = (k) => (k < beats.length ? beats[k].t : null);
      return { enabled: els.toggleMetronome.checked, beatsPerMeasure: song.bars[0].beats, beatTimeFor,
               accentFor: (k) => k < beats.length && beats[k].n === 1, beatInBar: (k) => (k < beats.length ? beats[k].n : 1),
               subdiv: els.metroSub ? parseInt(els.metroSub.value, 10) || 1 : 1 };
    } else {
      const spb = (60 / (song.defaultBpm || 120)) * (4 / den);
      beatTimeFor = (k) => {
        const t = k * spb;
        return t > song.durationSec + 1e-6 ? null : t;
      };
    }
    // Where each beat sits in its bar — the accent, and which number a voice says.
    // With the score's own meter this follows the real barlines (so a pickup
    // bar counts "3" and "4", not "1" and "2"); an override counts from the top.
    const beatInBar = (k) => {
      if (override) return (k % num) + 1;
      const t = beatTimeFor(k);
      const b = t == null ? null : barAt(t);
      if (!b) return (k % num) + 1;
      const span = (b.endSec - b.startSec) / Math.max(1, b.beats || num);
      return Math.max(1, Math.min(num, Math.round((t - b.startSec) / (span || 1)) + 1));
    };
    const accentFor = (k) => beatInBar(k) === 1;
    const subdiv = els.metroSub ? parseInt(els.metroSub.value, 10) || 1 : 1;
    return { enabled: els.toggleMetronome.checked, beatsPerMeasure, beatTimeFor, accentFor, beatInBar, subdiv };
  }
  function applyMetronome() { transport.metronome = metronomeConfig(); }

  // ============================================================ seeking
  /** One seek path for scrubber / roll click / arrow keys (handles wait mode). */
  function seekTo(sec) {
    transport.seek(Math.max(0, Math.min(transport.duration, sec)));
    activeCursor = 0;
    if (currentMode() !== "listen" && practice) {
      // Any seek invalidates the match state (a backward seek in Follow would
      // otherwise score replayed notes as wrong); rewind gates to the new spot.
      practice.resetTo(transport.position);
      practice.clearHeld();
      if (song) sheet.clearMarks(song.notes, transport.position);
      keyboard.clearSource("expected");
      keyboard.setBadges(null);
      roll.setExpected(null);
      if (currentMode() === "wait") { transport.setHold(practice.nextGateTime()); armWait(); }
    }
    drawFrame();
    if (transport.isPlaying) ensureRaf();
  }

  /** After a scored run, offer to loop the passage where errors clustered. */
  function offerDrill() {
    els.btnDrill.classList.add("is-hidden");
    if (!practice || currentMode() === "listen" || !song) return;
    // Wrong presses AND real misses. The old version reconstructed misses from
    // gates with no match, which in Wait mode is EVERY gate (wait mode never
    // fills that set), so it proposed drilling the whole piece.
    const w = PT.Practice.densestErrorWindow(practice.errorTimes(), 8);
    if (!w) return;
    const b = Math.min(song.durationSec, w.b);
    els.btnDrill.dataset.a = String(w.a);
    els.btnDrill.dataset.b = String(b);
    els.btnDrill.textContent = "Drill " + barLabel(w.a) + "\u2013" + barLabel(b);
    els.btnDrill.classList.remove("is-hidden");
  }

  /** Snap a loop point to the nearest note onset (within 300 ms) — musical loops. */
  function snapToOnset(t) {
    if (!song || !song.notes.length) return t;
    let best = t, bd = 0.3;
    for (const n of song.notes) {
      const d = Math.abs(n.startSec - t);
      if (d < bd) { bd = d; best = n.startSec; }
      if (n.startSec > t + 0.3) break;
    }
    return best;
  }

  // ============================================================ transport ctl
  async function doPlay() {
    if (!song) return;
    // Pressing Play (or Space) again while the count-in is clicking starts the
    // music immediately rather than pausing — the clicks are a run-up, not
    // playback, so that is what the button means at that moment.
    if (transport.inCountIn && transport.skipCountIn()) {
      setCountInUI(false);
      setStatus("Count-in skipped.", "ok");
      return;
    }
    await engine.ensureStarted();
    // A finished run's score and coloured notes stay up for review until the
    // next Play — which is where they must be reset. Without this the second
    // run inherited the first one's state: in Follow the first correct note
    // scored as wrong, in Wait nothing waited at all.
    if (runFinished) {
      runFinished = false;
      if (practice) { practice.resetRun(); practice.resetTo(transport.position); }
      sheet.clearMarks(); roll.clearMarks(); roll.setExpected(null);
      keyboard.clearSource("expected"); keyboard.setBadges(null);
      passSnapshot = practice ? { ...practice.score } : null;
      if (els.btnDrill) els.btnDrill.classList.add("is-hidden");
    }
    beginSession();
    // wait mode: if we're sitting on a hold gate, open it (waiting for input)
    if (currentMode() === "wait" && practice) {
      const gateT = practice.nextGateTime();
      if (gateT != null && Math.abs(transport.position - gateT) < 0.02) {
        practice.openCurrentGate();
        ensureRaf();
        return; // don't roll forward; wait for the player
      }
      transport.setHold(practice.nextGateTime());
    }
    const withCountIn = els.countInMode.value !== "off";
    transport.play({ countIn: withCountIn });
    ensureRaf();
    if (withCountIn && transport.inCountIn) {
      setCountInUI(true);
      coach("Count-in\u2026 press Space or Skip to start now.", "warn", { ms: Math.max(1500, (transport._preRoll || 2) * 1000) });
    }
  }

  /** Show/hide the skip affordance while the count-in is running. */
  function setCountInUI(on) {
    if (!els.btnSkipCountIn) return;
    els.btnSkipCountIn.classList.toggle("is-hidden", !on);
    if (on) {
      clearInterval(countInPoll);
      countInPoll = setInterval(() => {
        if (!transport.inCountIn) { clearInterval(countInPoll); setCountInUI(false); }
      }, 60);
    } else {
      clearInterval(countInPoll);
    }
  }
  function doPause() { setCountInUI(false); transport.pause(); practice.clearHeld(); hideHud(); keyboard.clearSource("holding"); saveBestScore(); }
  function doStop() {
    setCountInUI(false);
    runFinished = false;
    hideHud(); keyboard.clearSource("holding");
    transport.stop();
    saveBestScore();
    if (sheet.loaded) sheet.reset();
    if (practice) { practice.resetRun(); practice.clearHeld(); if (currentMode()==="wait") transport.setHold(practice.nextGateTime()); }
    runFinished = false;
    keyboard.clearSource("playR"); keyboard.clearSource("playL"); keyboard.clearSource("expected");
    keyboard.setBadges(null);
    roll.clearMarks(); roll.setExpected(null);
    sheet.clearMarks();
    activeCursor = 0;
    syncViews(0);
    armWait();
  }

  // ============================================================ loop
  let loopA = null, loopB = null, loopPass = 0;
  function loopBars() {
    if (loopA == null || loopB == null) return null;
    const a = barAt(loopA), b = barAt(Math.max(loopA, loopB - 0.001));
    return (a && b) ? { from: a.number, to: b.number } : null;
  }
  function updateLoopInfo() {
    const on = loopA != null && loopB != null;
    const bars = loopBars();
    const group = els.btnLoopBar.closest(".rail__group");
    if (group) group.classList.toggle("is-on", on);
    if (on) {
      // The bar numbers are in the inputs; the readout carries only the pass
      // count (and the time range for a piece with no bar map).
      els.loopInfo.textContent = bars ? (loopPass ? "pass " + loopPass : "\u21bb")
                                      : fmtTime(loopA) + "\u2013" + fmtTime(loopB);
      els.loopFrom.value = bars ? bars.from : ""; els.loopTo.value = bars ? bars.to : "";
      els.scrubLoop.classList.remove("is-hidden");
      const d = transport.duration || 1;
      els.scrubLoop.style.setProperty("--a", (100 * loopA / d).toFixed(2));
      els.scrubLoop.style.setProperty("--b", (100 * loopB / d).toFixed(2));
    } else {
      els.loopInfo.textContent = "off";
      els.loopFrom.value = ""; els.loopTo.value = "";
      els.scrubLoop.classList.add("is-hidden");
    }
    els.loopInfo.classList.toggle("is-hidden", !on);   // the Off button already says "off"
    roll.setLoop(loopA, loopB);
    drawFrame();
  }
  function setLoopRange(a, b) {
    loopA = a; loopB = b; loopPass = 0;
    transport.setLoop(loopA, loopB);
    updateLoopInfo();
    if (practice && currentMode() !== "listen") passSnapshot = { ...practice.score };
  }
  /** Repeat a range of bars typed into the toolbar. */
  function loopBarsRange(from, to) {
    if (!song || !song.bars || !song.bars.length) return;
    const n = song.bars.length;
    from = Math.max(1, Math.min(n, from | 0)); to = Math.max(from, Math.min(n, to | 0));
    setLoopRange(song.bars[from - 1].startSec, Math.min(song.durationSec, song.bars[to - 1].endSec));
    seekTo(song.bars[from - 1].startSec);
    coach("Repeating " + (from === to ? "bar " + from : "bars " + from + "\u2013" + to) +
              " \u2014 play it until it's clean." + (els.toggleRamp.checked ? " Clean passes raise the tempo." : ""), "ok", { ms: 3200 });
  }
  /** Loop the bar the playhead is inside — the commonest thing you actually want. */
  function loopCurrentBar() {
    if (!song) return;
    const b = barAt(transport.position);
    if (!b) { setStatus("This piece has no bar map to loop.", "warn"); return; }
    setLoopRange(b.startSec, Math.min(song.durationSec, b.endSec));
    seekTo(b.startSec);
    coach("Repeating bar " + b.number + " \u2014 play it until it's clean." +
              (els.toggleRamp.checked ? " Clean passes raise the tempo." : ""), "ok", { ms: 3200 });
  }

  // ============================================================ profiles
  function applyProfileToControls() {
    els.profileSize.value = String(profile.size);
    els.profileTranspose.value = String(profile.transpose);
    els.profileBackend.value = profile.audioBackend;
    els.noteSpeed.value = String(profile.noteSpeed);
    els.noteSpeedVal.textContent = profile.noteSpeed + " px/s";
    roll.setSpeed(profile.noteSpeed);
  }
  async function persistProfile() { await store.put("profiles", profile); await store.setSetting("activeProfile", profile.id); }

  function applyProfileRanges() {
    const T = profile.transpose || 0;
    const shifted = song
      ? { range: { minMidi: song.range.minMidi + T, maxMidi: song.range.maxMidi + T } }
      : null;
    const range = PT.profiles.displayRange(profile, shifted);
    keyboard.setRange(range.low, range.high); keyboard.render();
    roll.setTranspose(T);
    roll.setRange(range.low, range.high); roll.resize();
    drawFrame();
  }

  /** Where the typing keyboard currently sits, e.g. "C4–F5". */
  function typingRangeLabel() { return midiName(compBase) + "\u2013" + midiName(compBase + COMP_SPAN); }

  // ============================================================ piece list
  async function refreshPieceList() {
    const pieces = (await store.getAll("pieces")) || [];
    pieces.sort((a,b)=> (b.addedAt||0)-(a.addedAt||0));
    els.pieceList.innerHTML = "";
    if (!pieces.length) {
      els.pieceList.innerHTML = '<option value="">(no saved pieces)</option>';
      return;
    }
    els.pieceList.innerHTML = '<option value="">Saved pieces\u2026</option>';
    for (const p of pieces) {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name + (p.format === "midi" ? " (MIDI, re-open file)" : "");
      els.pieceList.appendChild(o);
    }
  }
  async function openSavedPiece(id) {
    const p = await store.get("pieces", id);
    if (!p) return;
    if (!p.content) {
      setStatus("That piece was saved by an older version without its file \u2014 open it from disk once more and it will reopen from here after that.", "warn");
      return;
    }
    if (p.format === "midi") { await loadMIDIBuffer(b64ToBuf(p.content), p.name, { id: p.id, store: false }, { parts: p.parts, fit: p.fit }); return; }
    await loadMusicXMLText(p.content, p.name, { id: p.id, store: false }, p.parts ? { parts: p.parts } : null);
  }
  async function deleteSavedPiece(id) {
    const p = await store.get("pieces", id);
    if (!p) return;
    await store.delete("pieces", id);
    await store.delete("scores", id);
    await store.delete("fingerings", id);
    const last = await store.getSetting("lastPiece", null);
    if (last === id) await store.setSetting("lastPiece", null);
    await refreshPieceList();
    setStatus("Removed \u201c" + p.name + "\u201d from saved pieces.", "ok");
  }

  // ============================================================ fingering edit
  let fingerEditMidiNote = null;   // the SONG-pitch last targeted for a finger edit
  let fingerEditNoteRef = null;    // the EXACT note the edit will apply to

  /**
   * Apply a finger number. The note is the one the player POINTED AT — clicked
   * in the falling-notes view, or the occurrence of the pressed pitch nearest
   * the playhead. The old code re-searched by pitch and ignored the clicked
   * note entirely, so clicking a note in bar 12 re-fingered one in bar 2.
   */
  function setFinger(finger) {
    if (!song) return;
    const target = fingerEditNoteRef ||
      (fingerEditMidiNote != null ? nearestNoteOfPitch(fingerEditMidiNote, transport.position) : null);
    if (!target) { setStatus("Pick a note first \u2014 click a falling note or press its key.", "warn"); return; }
    const scope = fingerScope();
    const name = midiName(transposed(target.midi));
    const group = scope === "pitch" ? samePitchSameHand(target) : [target];
    const direct = new Set(group.map((x) => x.id));
    if (finger === 0) {                                   // back to automatic
      if (scope === "pitch") { delete fingerRules[handKey(target)]; for (const x of group) delete fingerOverrides[x.id]; }
      else delete fingerOverrides[target.id];
    } else if (scope === "pitch") {
      fingerRules[handKey(target)] = finger;
      for (const x of group) delete fingerOverrides[x.id];  // "every" means every
    } else {
      fingerOverrides[target.id] = finger;
    }
    const before = new Map(song.notes.map((n) => [n.id, n.finger]));
    applyFingerOverrides();
    saveFingerings();
    // how many OTHER notes the optimiser re-fingered to fit the edit
    let knock = 0;
    for (const n of song.notes) if (!direct.has(n.id) && before.get(n.id) !== n.finger) knock++;
    drawFrame();
    const where = scope === "pitch" ? `every ${name} in the ${HAND_NAME[handKey(target)[0]]} (${group.length})` : `${name} @ ${barLabel(target.startSec)}`;
    const what = finger === 0 ? "back to automatic" : "finger " + finger;
    const tail = knock ? ` \u00b7 ${knock} neighbouring finger${knock === 1 ? "" : "s"} adjusted to fit` : "";
    coach(`${where}: ${what}${tail}.`, "ok", { ms: 3500 });
    setStatus(`${where}: ${what}${tail}.`, "ok");
  }

  function enableControls(on) {
    [els.btnPlay, els.btnPause, els.btnStop, els.scrubber,
     els.btnLoopBar, els.btnLoopClear, els.loopFrom, els.loopTo, els.btnFingering].forEach((e)=>{ if(e) e.disabled = !on; });
  }

  function showErr(err) { console.error(err); setStatus("Error: " + (err && err.message ? err.message : err), "err"); }

  // ---- download helpers ------------------------------------------------------
  function safeName(s) {
    return String(s).replace(/[^\w\u00C0-\u024f \-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 60) || "piece";
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Open a MusicXML / .mxl / MIDI File object (file picker or drag-and-drop). */
  async function openFile(file) {
    const name = file.name.toLowerCase();
    const stem = file.name.replace(/\.[^.]+$/, "");
    if (!/\.(mid|midi|kar|rmi|mxl|xml|musicxml)$/.test(name)) {
      throw new Error("That isn't a score this app can open \u2014 use MusicXML (.xml, .musicxml, .mxl) or MIDI (.mid).");
    }
    // What the file IS decides how it is read, not its extension: a zipped
    // score saved as .xml, or a MIDI file called .musicxml, used to fail with
    // the notation engine's generic error. Text is decoded by its real
    // encoding (UTF-16 scores from Finale/Sibelius were read as UTF-8).
    const buf = await file.arrayBuffer();
    if (/\.mxl$/.test(name)) setStatus("Unzipping compressed MusicXML\u2026");
    const got = await PT.scoreImport.readScoreFile(buf, PT.mxl);
    // The id comes from the file's CONTENT: opening the same file again finds
    // the same saved piece (its parts, fingering edits and best score) instead
    // of adding a duplicate under a new timestamp.
    if (got.kind === "midi") {
      const id = "midi-" + contentHash(got.buf);
      const saved = await store.get("pieces", id);
      await loadMIDIBuffer(got.buf, prettyTitle(stem), { id }, saved ? { parts: saved.parts, fit: saved.fit } : null);
    } else {
      if (!/<score-(partwise|timewise)\b/.test(got.text.slice(0, 20000))) {
        throw new Error("\u201c" + file.name + "\u201d isn't a MusicXML score" +
          (/<html/i.test(got.text.slice(0, 2000)) ? " \u2014 it is a web page (a download that saved the page instead of the file)." : "."));
      }
      const id = (got.zipped ? "mxl-" : "xml-") + contentHash(new TextEncoder().encode(got.text).buffer);
      const saved = await store.get("pieces", id);
      await loadMusicXMLText(got.text, prettyTitle(stem), { id }, saved && saved.parts ? { parts: saved.parts } : null);
    }
  }

  // ============================================================ keyboard chip
  /** The masthead chip: the keyboard's state at a glance, and one tap to fix it. */
  function updateMidiChip() {
    const c = els.midiChip;
    if (!c) return;
    c.classList.remove("is-on", "is-warn");
    if (!midi.supported()) { c.textContent = "No MIDI in this browser"; c.classList.add("is-warn"); c.disabled = true; return; }
    if (midi.enabled && midi.inputs.length) {
      const active = midi.activeId !== "all" ? midi.inputs.find((d) => d.id === midi.activeId) : null;
      const name = (active || midi.inputs[0]).name;
      c.textContent = name + (midi.inputs.length > 1 && !active ? " +" + (midi.inputs.length - 1) : "");
      c.title = "MIDI keyboard connected \u2014 click for device settings";
      c.classList.add("is-on");
    } else if (midi.enabled) {
      c.textContent = "Plug in your keyboard";
      c.title = "Connected to MIDI, but no keyboard is plugged in";
      c.classList.add("is-warn");
    } else {
      c.textContent = "Connect keyboard";
      c.title = "Use a MIDI keyboard (USB) \u2014 the browser will ask once";
    }
  }

  // ============================================================ your data
  /*
   * Everything the app remembers lives in this browser, for this address. A
   * page opened from file:// and the same app on http://localhost are, to the
   * browser, two different sites with separate storage — so moving between
   * them looked like losing every saved piece, fingering and practice day.
   * A backup file carries it across (and survives clearing browser data).
   */
  const BACKUP_STORES = ["pieces", "settings", "profiles", "scores", "fingerings", "sessions"];
  async function exportData() {
    const out = { app: "piano-trainer", version: 1, exportedAt: new Date().toISOString(), stores: {} };
    let rows = 0;
    for (const name of BACKUP_STORES) { out.stores[name] = (await store.getAll(name)) || []; rows += out.stores[name].length; }
    const day = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(out)], { type: "application/json" }), "piano-trainer-backup-" + day + ".json");
    els.dataNote.textContent = "Saved " + out.stores.pieces.length + " pieces, " + out.stores.sessions.length + " practice sessions.";
    return rows;
  }
  async function importData(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { throw new Error("That file isn't a Piano Trainer backup."); }
    if (!data || data.app !== "piano-trainer" || !data.stores) throw new Error("That file isn't a Piano Trainer backup.");
    let added = 0;
    for (const name of BACKUP_STORES) {
      for (const row of (data.stores[name] || [])) {
        if (!row || typeof row !== "object") continue;
        if (name === "settings" ? row.key == null : row.id == null) continue;
        await store.put(name, row); added++;
      }
    }
    return { added, pieces: (data.stores.pieces || []).length, sessions: (data.stores.sessions || []).length };
  }

  // ============================================================ hands-free
  let learning = null;                  // "play" | "repeat" while waiting for a key
  function showControlKeys() {
    const ck = profile.controlKeys || {};
    els.ctlPlayName.textContent = ck.play != null ? midiName(ck.play) : "none";
    els.ctlRepeatName.textContent = ck.repeat != null ? midiName(ck.repeat) : "none";
  }
  /** Returns true when the key was consumed as a control, not a note. */
  function controlKeyDown(note) {
    if (learning) {
      profile.controlKeys = Object.assign({ play: null, repeat: null }, profile.controlKeys || {});
      profile.controlKeys[learning] = note;
      const which = learning; learning = null;
      persistProfile(); showControlKeys();
      setStatus(midiName(note) + " now " + (which === "play" ? "starts and pauses." : "repeats the current bar."), "ok");
      return true;
    }
    const ck = profile.controlKeys || {};
    if (note === ck.play) {
      if (transport.inCountIn) doPlay().catch(showErr);
      else if (transport.isPlaying) doPause(); else doPlay().catch(showErr);
      return true;
    }
    if (note === ck.repeat) {
      if (loopA != null) { loopA = loopB = null; loopPass = 0; transport.clearLoop(); updateLoopInfo(); coach("Repeat off.", "ok", { ms: 1500 }); }
      else if (song) loopCurrentBar();
      return true;
    }
    return false;
  }
  function isControlKey(note) {
    const ck = profile.controlKeys || {};
    return note === ck.play || note === ck.repeat;
  }

  // ============================================================ sound delay
  function setLatency(sec) {
    latencySec = Math.max(0, Math.min(0.4, sec || 0));
    els.latency.value = String(Math.round(latencySec * 1000));
    els.latencyVal.textContent = Math.round(latencySec * 1000) + " ms";
    drawFrame();
  }
  /*
   * Eight clicks at a known spacing; the player taps along to what they hear.
   * The median of (tap - click) over the last six is the delay between the
   * app scheduling a sound and the player hearing and answering it — output
   * latency plus input latency. It also absorbs a little of everyone's habit
   * of tapping slightly AHEAD of a beat, which pulls the number down a few
   * milliseconds; the slider is there to trim it.
   */
  let calib = null;
  async function startCalibration() {
    await engine.ensureStarted();
    if (transport.isPlaying) doPause();
    const n = 8, gap = 0.6, t0 = engine.now() + 0.8;
    calib = { clicks: [], taps: [] };
    for (let i = 0; i < n; i++) { const t = t0 + i * gap; calib.clicks.push(t); engine.clickAt(t, i % 4 === 0); }
    els.calibPanel.classList.remove("is-hidden");
    els.calibText.textContent = "Tap along with the clicks \u2014 any key, a MIDI key, or this pad.";
    setTimeout(finishCalibration, (0.8 + n * gap + 0.6) * 1000);
  }
  function calibTap() {
    if (!calib) return;
    calib.taps.push(engine.now());
    els.calibPad.classList.add("is-hit"); setTimeout(() => els.calibPad.classList.remove("is-hit"), 90);
  }
  function finishCalibration() {
    if (!calib) return;
    const { clicks, taps } = calib; calib = null;
    const diffs = [];
    for (const tap of taps) {
      let best = null;
      for (const c of clicks) if (best == null || Math.abs(tap - c) < Math.abs(tap - best)) best = c;
      if (best != null && Math.abs(tap - best) < 0.3) diffs.push(tap - best);
    }
    const use = diffs.slice(-6).sort((a, b) => a - b);
    if (use.length < 4) {
      els.calibText.textContent = "Not enough taps landed near the clicks (" + use.length + "). Try again.";
      return;
    }
    const med = use[use.length >> 1];
    setLatency(Math.max(0, med));
    store.setSetting("latencyMs", Math.round(latencySec * 1000));
    els.calibText.textContent = "Measured " + Math.round(med * 1000) + " ms from " + use.length + " taps.";
    els.calibNote.textContent = "set to " + Math.round(latencySec * 1000) + " ms";
  }

  // ============================================================ wiring
  function wire() {
    // file open — MusicXML, compressed MusicXML (.mxl), or MIDI
    els.fileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try { await openFile(file); } catch (err) { showErr(err); }
      finally { e.target.value = ""; }
    });

    els.sampleList.addEventListener("change", () => {
      const k = els.sampleList.value;
      if (!k || !PT.samples[k]) return;
      loadMusicXMLText(PT.samples[k].xml, PT.samples[k].title, { id: "sample-" + k, store: true }).catch(showErr);
      els.sampleList.value = "";
    });

    els.pieceList.addEventListener("change", () => {
      if (els.pieceList.value) openSavedPiece(els.pieceList.value).catch(showErr);
    });
    // Remove acts on the piece that is OPEN. It used to act on whatever was
    // selected in the Saved-pieces dropdown — which, since choosing there opens
    // the piece, meant re-selecting the piece you were already looking at just
    // to make the button wake up.
    els.btnDeletePiece.addEventListener("click", async () => {
      if (!pieceId) return;
      const p = await store.get("pieces", pieceId);
      if (!p) { setStatus("This piece isn't in your saved pieces.", "warn"); return; }
      if (window.confirm("Remove \u201c" + p.name + "\u201d from saved pieces, along with its best score and fingering edits? (It stays open for now.)")) {
        deleteSavedPiece(pieceId).catch(showErr);
      }
    });

    // --- conversions ---
    els.btnExportMidi.addEventListener("click", () => {
      if (!song) return;
      try {
        const bytes = PT.xmlToMIDI.songToMIDI(song);
        downloadBlob(new Blob([bytes], { type: "audio/midi" }),
          safeName(realTitle(song.title) || pieceName || "piano-trainer") + ".mid");
        setStatus("Exported MIDI.", "ok");
      } catch (e) { showErr(e); }
    });

    els.btnConvertSheet.addEventListener("click", async () => {
      if (!song || song.hasSheet) return;
      const grid = parseInt(els.convertGrid.value, 10) || 16;
      setStatus("Estimating key, spelling notes, laying out staves\u2026");
      try {
        const src = Object.assign({}, song, { notes: song.notes.filter((n) => !n.backing).map((n) => Object.assign({}, n)) });
        const xml = PT.midiToXML.midiToMusicXML(src, { grid });
        const title = realTitle(song.title) || pieceName || "Converted from MIDI";
        await loadMusicXMLText(xml, title, { id: "converted-" + contentHash(new TextEncoder().encode(xml).buffer), store: true });
        setStatus("Converted to sheet music. It's an automatic first draft \u2014 estimated key/time and 1/" + grid + " quantization; refine in MuseScore if needed. You can also Export MIDI from here.", "ok");
      } catch (e) { showErr(e); }
    });

    // transport
    els.btnPlay.addEventListener("click", () => doPlay().catch(showErr));
    els.btnPause.addEventListener("click", doPause);
    els.btnStop.addEventListener("click", doStop);

    els.scrubber.addEventListener("input", () => { scrubbing = true; els.timeNow.textContent = fmtTime(parseFloat(els.scrubber.value)); });
    els.scrubber.addEventListener("change", () => {
      const v = parseFloat(els.scrubber.value); scrubbing = false;
      seekTo(v);
    });

    // click a falling note (or anywhere on the roll) to seek to that moment
    els.rollCanvas.addEventListener("click", (e) => {
      if (!song) return;
      if (els.btnFingering.classList.contains("is-on")) {
        const n = roll.noteAtEvent(e, transport.position);
        if (n) {
          fingerEditNoteRef = n;
          fingerEditMidiNote = n.midi;
          updateScopeLabel();
          els.fingerNote.textContent =
            midiName(n.midi) + " @ " + barLabel(n.startSec) + " \u2014 press 1\u20135";
        } else {
          setStatus("No note there \u2014 click one of the falling notes.", "warn");
        }
        return;   // selecting, not seeking, while in edit mode
      }
      const t = roll.timeFromEvent(e, transport.position);
      if (t != null) seekTo(t);
    });

    // mouse wheel on the falling notes scrubs the timeline 1:1 with the pixels
    els.rollCanvas.addEventListener("wheel", (e) => {
      if (!song) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; // lines -> px
      seekTo(transport.position - dy / roll.pxPerSec);
    }, { passive: false });

    // right-click steps back one onset group (chord); repeat to walk backwards
    els.rollCanvas.addEventListener("contextmenu", (e) => {
      if (!song) return;
      e.preventDefault();
      stepOnset(-1);
    });

    // volume / click volume / tempo / zoom / note speed
    els.volume.addEventListener("input", () => engine.setVolume(parseFloat(els.volume.value)));
    els.volume.addEventListener("change", () => store.setSetting("volume", parseFloat(els.volume.value)));
    els.clickVol.addEventListener("input", () => engine.setClickVolume(parseFloat(els.clickVol.value)));
    els.clickVol.addEventListener("change", () => store.setSetting("clickVol", parseFloat(els.clickVol.value)));
    els.tempo.addEventListener("input", () => applyTempo(parseFloat(els.tempo.value)));
    // Zoom: automatic by default (the score is sized so a whole system fits the
    // panel). Touching the slider is the opt-out; the Fit chip is the way back.
    els.zoom.addEventListener("input", () => {
      els.zoomVal.textContent = Math.round(parseFloat(els.zoom.value)*100)+"%";
      if (els.toggleFit.checked) { els.toggleFit.checked = false; store.setSetting("fitScore", false); }
    });
    els.zoom.addEventListener("change", () => {
      if (sheet.loaded) sheet.setZoom(parseFloat(els.zoom.value));
      store.setSetting("zoom", parseFloat(els.zoom.value));
    });
    els.toggleFit.addEventListener("change", () => {
      const on = els.toggleFit.checked;
      store.setSetting("fitScore", on);
      sheet.setAutoFit(on);
      if (!on && sheet.loaded) sheet.setZoom(parseFloat(els.zoom.value));
      updateZoomLabel();
    });
    sheet.onFit = () => updateZoomLabel();
    els.noteSpeed.addEventListener("input", () => {
      const s = parseInt(els.noteSpeed.value,10);
      els.noteSpeedVal.textContent = s + " px/s";
      roll.setSpeed(s); profile.noteSpeed = s; drawFrame();
    });
    els.noteSpeed.addEventListener("change", persistProfile);

    // metronome
    els.toggleMetronome.addEventListener("change", () => { applyMetronome(); store.setSetting("metronome", els.toggleMetronome.checked); });
    // ---- metronome settings ----
    const metroChanged = () => {
      engine.setMetronome({ sound: els.metroSound.value, countIn: els.countInMode.value, lang: els.metroLang.value });
      applyMetronome();
      store.setSetting("metro", { countIn: els.countInMode.value, sound: els.metroSound.value, meter: els.metroMeter.value,
                                  sub: els.metroSub.value, lang: els.metroLang.value });
    };
    [els.countInMode, els.metroSound, els.metroMeter, els.metroSub, els.metroLang].forEach((el) => el.addEventListener("change", metroChanged));
    // "Hear it": one bar at the current tempo, in the chosen sound
    els.btnMetroPreview.addEventListener("click", async () => {
      await engine.ensureStarted();
      engine.setMetronome({ sound: els.metroSound.value, countIn: els.countInMode.value, lang: els.metroLang.value });
      if (engine._click.preloadVoice && (els.metroSound.value === "voice" || els.countInMode.value === "voice")) await engine._click.preloadVoice();
      const cfg = metronomeConfig() || { beatsPerMeasure: 4, subdiv: parseInt(els.metroSub.value, 10) || 1 };
      const n = cfg.beatsPerMeasure || 4;
      const spb = song ? Math.max(0.25, ((cfg.beatTimeFor(1) || 0.5) - (cfg.beatTimeFor(0) || 0)) / transport.rate) : 0.5;
      const t0 = engine.now() + 0.18;
      for (let i = 0; i < n; i++) {
        engine.metronomeAt(t0 + i * spb, { kind: "beat", beat: i + 1, accent: i === 0 });
        for (let j = 1; j < (cfg.subdiv || 1); j++) engine.metronomeAt(t0 + i * spb + (j * spb) / cfg.subdiv, { kind: "sub", subdiv: cfg.subdiv });
      }
    });
    els.btnSkipCountIn.addEventListener("click", () => {
      if (transport.skipCountIn()) { setCountInUI(false); setStatus("Count-in skipped.", "ok"); }
    });

    // view toggles
    const tog = (key, el, panel, after) => el.addEventListener("change", () => {
      show[key] = el.checked;
      els[panel].classList.toggle("is-hidden", !el.checked);
      if (key === "roll" && el.checked) roll.resize();
      if (key === "keyboard" && el.checked) keyboard.render();
      if (after) after();
      drawFrame();
      store.setSetting("views", show);
    });
    // The sheet panel only makes sense for notation; MIDI has none to show.
    tog("sheet", els.toggleSheet, "sheetPanel", () => {
      if (els.toggleSheet.checked && (!song || !song.hasSheet)) {
        els.sheetPanel.classList.add("is-hidden");
      }
    });
    tog("roll", els.toggleRoll, "rollPanel");
    tog("keyboard", els.toggleKeyboard, "keyboardPanel");
    els.toggleCursor.addEventListener("change", () => {
      sheet.setCursorVisible(els.toggleCursor.checked);
      store.setSetting("cursorBar", els.toggleCursor.checked);
    });
    els.toggleGrid.addEventListener("change", () => {
      roll.setGrid(els.toggleGrid.checked);
      drawFrame();
      store.setSetting("beatGrid", els.toggleGrid.checked);
    });
    // Note names label the KEYS. The falling notes already say which pitch they
    // are by the lane they fall in.
    els.toggleLabels.addEventListener("change", () => {
      keyboard.setLabels(els.toggleLabels.checked);
      keyboard.render();
      drawFrame();
      store.setSetting("labels", els.toggleLabels.checked);
    });

    // practice mode + hand + timing window
    [els.modeListen, els.modeFollow, els.modeWait].forEach((r) =>
      r.addEventListener("change", () => {
        endSession();
        doStop(); rebuildPractice();
        store.setSetting("mode", currentMode());
        const m = currentMode();
        // (the mode's explanation lives in its button's tooltip now, not on screen)
      }));
    [els.handBoth, els.handRight, els.handLeft].forEach((r) =>
      r.addEventListener("change", () => { rebuildPractice(); store.setSetting("hand", currentHand()); }));
    els.timingWindow.addEventListener("change", () => {
      practice.setWindow(els.timingWindow.value);
      store.setSetting("timingWindow", els.timingWindow.value);
      setStatus("Timing window: " + els.timingWindow.options[els.timingWindow.selectedIndex].textContent + ".", "ok");
    });

    // MIDI
    els.midiChip.addEventListener("click", async () => {
      if (midi.enabled && midi.inputs.length) { openSettings("device"); return; }
      await engine.ensureStarted();
      await midi.enable();          // a user gesture: the permission prompt may show
      updateMidiChip();
    });
    els.btnMidi.addEventListener("click", async () => {
      await engine.ensureStarted();
      const ok = await midi.enable();
      els.btnMidi.classList.toggle("is-on", ok);
    });
    els.midiDevices.addEventListener("change", () => { midi.setActive(els.midiDevices.value); profile.midiDeviceId = els.midiDevices.value; persistProfile(); });

    // profile controls
    // a MIDI piece is re-fitted to the new keyboard (a MusicXML score is left as written)
    const refitMidi = () => { if (song && song.format === "midi") reimportMidi({ parts: Object.fromEntries((song.tracks || []).map((t) => [t.index, t.part])), fit: midiOpts.fit }).catch(showErr); };
    els.profileSize.addEventListener("change", () => { profile.size = parseInt(els.profileSize.value,10); applyProfileRanges(); persistProfile(); refitMidi(); });
    els.profileTranspose.addEventListener("change", () => { profile.transpose = parseInt(els.profileTranspose.value,10); applyProfileRanges(); persistProfile(); refitMidi(); });
    els.profileBackend.addEventListener("change", async () => {
      const wanted = els.profileBackend.value;
      await engine.ensureStarted();
      profile.audioBackend = wanted;
      els.backendNote.textContent = wanted === "synth"
        ? "offline synth"
        : "loading " + instrumentLabel(wanted) + "\u2026";
      const got = await engine.setBackend(wanted);
      els.backendNote.textContent = got === wanted
        ? instrumentLabel(got) + (got === "synth" ? "" : " (samples loaded)")
        : instrumentLabel(wanted) + " failed to load \u2014 using synth";
      els.profileBackend.value = got;
      profile.audioBackend = got;
      persistProfile();
    });

    // repeat a passage
    els.btnLoopBar.addEventListener("click", loopCurrentBar);
    els.btnLoopClear.addEventListener("click", () => { loopA=loopB=null; loopPass=0; transport.clearLoop(); updateLoopInfo(); setStatus("Repeat off.", "ok"); });
    const rangeChanged = () => {
      const f = parseInt(els.loopFrom.value, 10), t = parseInt(els.loopTo.value, 10);
      if (!f && !t) return;
      loopBarsRange(f || t, t || f);
    };
    els.loopFrom.addEventListener("change", rangeChanged);
    els.loopTo.addEventListener("change", rangeChanged);
    [els.loopFrom, els.loopTo].forEach((inp) => inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); rangeChanged(); inp.blur(); }
    }));

    // coach
    els.btnDrill.addEventListener("click", () => {
      const a = snapToOnset(parseFloat(els.btnDrill.dataset.a || "0"));
      let b = snapToOnset(parseFloat(els.btnDrill.dataset.b || "0"));
      if (b <= a) b = a + 4;
      setLoopRange(a, b);
      seekTo(a);
      setStatus("Looping the rough passage \u2014 slow the tempo, repeat until clean.", "ok");
    });
    els.toggleRamp.addEventListener("change", () => store.setSetting("autoRamp", els.toggleRamp.checked));

    els.btnFingering.addEventListener("click", () => {
      fingerEditMidiNote = null;
      fingerEditNoteRef = null;
      els.fingerNote.textContent = "\u2014";
      els.btnFingering.classList.toggle("is-on");
      els.fingerNote.classList.toggle("is-hidden", !els.btnFingering.classList.contains("is-on"));
      els.fingerPad.classList.toggle("is-hidden", !els.btnFingering.classList.contains("is-on"));
      els.fingerScope.classList.toggle("is-hidden", !els.btnFingering.classList.contains("is-on"));
      updateScopeLabel();
      setStatus(els.btnFingering.classList.contains("is-on")
        ? "Fingering edit: click a falling note (or press its key), then press 1\u20135."
        : "Fingering edit off.", "ok");
    });

    // settings window
    const openDlg = (d) => { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); };
    const closeDlg = (d) => { if (d.close) d.close(); else d.removeAttribute("open"); };
    els.btnSettings.addEventListener("click", () => openSettings());
    els.btnStyles.addEventListener("click", () => openSettings("hand"));
    els.setNav.addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showSettingsTab(b.dataset.tab); });
    els.setNav.addEventListener("keydown", (e) => {
      const tabs = [...els.setNav.querySelectorAll("[data-tab]")];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const d = (e.key === "ArrowDown" || e.key === "ArrowRight") ? 1 : (e.key === "ArrowUp" || e.key === "ArrowLeft") ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = tabs[(i + d + tabs.length) % tabs.length];
      next.focus(); showSettingsTab(next.dataset.tab);
    });
    els.handReach.addEventListener("change", () => { els.handCm.value = ""; setHandReach(parseFloat(els.handReach.value)); });
    els.handCm.addEventListener("change", () => {
      const cm = parseFloat(els.handCm.value);
      if (!(cm >= 14 && cm <= 28)) { els.handNote.textContent = "a hand span is usually 17\u201325 cm"; return; }
      setHandReach(Math.round(cmToReach(cm) * 2) / 2);
    });
    els.fingerStyles.addEventListener("change", (e) => {
      const r = e.target.closest("input[name=fingerStyle]");
      if (r && song) setFingerStrategy(r.value);
    });
    els.btnSettingsClose.addEventListener("click", () => closeDlg(els.settingsDialog));
    // click on the backdrop closes
    [els.settingsDialog, els.helpDialog].forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) closeDlg(d); }));

    els.toggleOtherHand.addEventListener("change", () => {
      store.setSetting("otherHand", els.toggleOtherHand.checked);
      rebuildPractice();
    });
    els.toggleMoves.addEventListener("change", () => {
      roll.showMoves = els.toggleMoves.checked; drawFrame();
      store.setSetting("showMoves", els.toggleMoves.checked);
    });
    els.toggleColour.addEventListener("change", () => {
      sheet.setOverlayEnabled(els.toggleColour.checked);
      store.setSetting("colourNotes", els.toggleColour.checked);
    });
    els.lengthMode.addEventListener("change", () => {
      practice.setLengthMode(els.lengthMode.value);
      store.setSetting("lengthMode", els.lengthMode.value);
      refreshScore(practice.score, practice.accuracy());   // accuracy depends on the mode
      setStatus("Note length: " + els.lengthMode.options[els.lengthMode.selectedIndex].textContent.toLowerCase() + ".", "ok");
    });

    // ---- finger numbers by tap (touch has no 1-5 keys) ----
    els.fingerPad.addEventListener("click", (e) => {
      const b = e.target.closest("[data-f]");
      if (b) setFinger(parseInt(b.dataset.f, 10));
    });
    [els.scopeNote, els.scopePitch].forEach((r) => r.addEventListener("change", () => store.setSetting("fingerScope", fingerScope())));
    els.btnResetFingering.addEventListener("click", () => {
      if (!window.confirm("Forget every finger you changed in this piece and go back to the automatic suggestions?")) return;
      fingerOverrides = {}; fingerRules = {};
      const changed = applyFingerOverrides();
      saveFingerings(); drawFrame();
      setStatus("Fingering reset to automatic (" + changed + " notes changed back).", "ok");
    });

    // ---- first run: start with something ----
    const quick = async (mode, hand) => {
      await loadMusicXMLText(PT.samples.odeToJoy.xml, PT.samples.odeToJoy.title, { id: "sample-odeToJoy", store: true });
      ({ both: els.handBoth, right: els.handRight, left: els.handLeft })[hand].checked = true;
      ({ listen: els.modeListen, wait: els.modeWait })[mode].checked = true;
      store.setSetting("mode", mode); store.setSetting("hand", hand);
      rebuildPractice();
      await doPlay();
      coach(mode === "listen" ? "Listening \u2014 watch the notes land on the keys."
                              : "Play the highlighted key \u2014 the music waits for you.", "ok", { ms: 4000 });
    };
    els.btnQuickListen.addEventListener("click", () => quick("listen", "both").catch(showErr));
    els.btnQuickLearn.addEventListener("click", () => quick("wait", "right").catch(showErr));

    // ---- hands-free: MIDI-learn control keys ----
    const learnBtn = (which) => {
      learning = which;
      (which === "play" ? els.ctlPlayName : els.ctlRepeatName).textContent = "press a key\u2026";
      setStatus("Press the key on your MIDI keyboard to use for " + (which === "play" ? "play/pause" : "repeat-bar") + ".", "warn");
    };
    els.btnLearnPlay.addEventListener("click", () => learnBtn("play"));
    els.btnLearnRepeat.addEventListener("click", () => learnBtn("repeat"));
    els.btnClearControls.addEventListener("click", () => {
      learning = null; profile.controlKeys = { play: null, repeat: null };
      persistProfile(); showControlKeys(); setStatus("Hands-free keys cleared.", "ok");
    });

    // ---- MIDI parts ----
    els.midiParts.addEventListener("change", (e) => {
      const sel = e.target.closest("select[data-track]");
      if (!sel || !song) return;
      const list = song.format === "midi" ? song.tracks : song.scoreParts;
      if (!list) return;
      const parts = Object.fromEntries(list.map((t) => [t.index, t.part]));
      parts[sel.dataset.track] = sel.value;
      if (!Object.values(parts).includes("practice")) { setStatus("At least one part has to be the one you practise.", "warn"); renderMidiOpts(); return; }
      if (song.format === "midi") reimportMidi({ parts, fit: midiOpts.fit }).catch(showErr);
      else rechooseScoreParts(parts).catch(showErr);
    });
    els.toggleFitKeys.addEventListener("change", () => {
      reimportMidi({ parts: Object.fromEntries((song.tracks || []).map((t) => [t.index, t.part])), fit: els.toggleFitKeys.checked }).catch(showErr);
    });

    // ---- your data ----
    els.btnExportData.addEventListener("click", () => exportData().catch(showErr));
    els.btnImportData.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      try {
        const r = await importData(f);
        els.dataNote.textContent = "Restored " + r.pieces + " pieces and " + r.sessions + " practice sessions \u2014 reloading\u2026";
        setTimeout(() => location.reload(), 900);
      } catch (err) { els.dataNote.textContent = err.message; showErr(err); }
    });

    // ---- sound delay ----
    els.latency.addEventListener("input", () => setLatency(parseInt(els.latency.value, 10) / 1000));
    els.latency.addEventListener("change", () => store.setSetting("latencyMs", Math.round(latencySec * 1000)));
    els.btnCalibrate.addEventListener("click", () => startCalibration().catch(showErr));
    els.calibPad.addEventListener("pointerdown", (e) => { e.preventDefault(); calibTap(); });

    // ---- drop a file anywhere to open it ----
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
    window.addEventListener("dragenter", (e) => { if (!hasFiles(e)) return; dragDepth++; els.dropZone.classList.remove("is-hidden"); });
    window.addEventListener("dragleave", () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) els.dropZone.classList.add("is-hidden"); });
    window.addEventListener("dragover", (e) => { if (hasFiles(e)) e.preventDefault(); });
    window.addEventListener("drop", (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); dragDepth = 0; els.dropZone.classList.add("is-hidden");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) openFile(f).catch(showErr);
    });

    // ---- drag the falling notes to scrub (a finger has no mouse wheel) ----
    let drag = null, suppressClick = false;
    els.rollCanvas.addEventListener("pointerdown", (e) => {
      if (!song || els.btnFingering.classList.contains("is-on")) return;
      drag = { id: e.pointerId, y: e.clientY, pos: transport.position, moved: false, wasPlaying: transport.isPlaying };
    });
    els.rollCanvas.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dy) < 7) return;
      if (!drag.moved) {
        drag.moved = true;
        try { els.rollCanvas.setPointerCapture(e.pointerId); } catch (err) {}
        if (drag.wasPlaying) doPause();
      }
      // content follows the finger: pulling the notes down moves forward in time
      seekTo(drag.pos + dy / roll.pxPerSec);
    });
    const endDrag = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      suppressClick = drag.moved;
      drag = null;
    };
    els.rollCanvas.addEventListener("pointerup", endDrag);
    els.rollCanvas.addEventListener("pointercancel", endDrag);
    els.rollCanvas.addEventListener("click", (e) => {
      if (suppressClick) { suppressClick = false; e.stopImmediatePropagation(); }
    }, true);

    // shortcuts dialog
    const openHelp = () => { if (els.helpDialog.showModal) els.helpDialog.showModal(); else els.helpDialog.setAttribute("open",""); };
    const closeHelp = () => { if (els.helpDialog.close) els.helpDialog.close(); else els.helpDialog.removeAttribute("open"); };
    els.btnHelp.addEventListener("click", openHelp);
    els.btnHelpClose.addEventListener("click", closeHelp);

    // keyboard view: mouse preview + (edit mode) pick a note to re-finger
    keyboard.onKey = (m, down) => { if (down) handleNoteOn(m, 0.8); else handleNoteOff(m); };

    // scoring callbacks
    practice.onScore = (s, acc) => { refreshScore(s, acc); };
    practice.onGateOpen = onGateOpen;
    practice.onGateCleared = onGateCleared;
    practice.onGateProgress = onGateProgress;
    practice.onHolding = onHolding;
    practice.onLength = onLength;

    // transport callbacks
    transport.onEnd = () => {
      keyboard.clearSource("playR"); keyboard.clearSource("playL"); keyboard.setBadges(null);
      // Notes in the last timing window before the end were never counted as
      // missed, because the playhead stopped before passing them.
      if (practice && currentMode() === "follow") {
        const before = practice.score.missTimes.length;
        practice.advanceFollowTo(Infinity);
        for (let i = before; i < practice.score.missTimes.length; i++) markMissedAt(practice.score.missTimes[i]);
      }
      runFinished = true;   // keep the result on screen; the next Play resets
      activeCursor = 0;
      syncViews(0); saveBestScore();
      offerDrill();
      if (currentMode() !== "listen" && practice) {
        const t = practice.timingStats();
        const timing = t.n ? ` \u00b7 timing ${t.meanMs > 0 ? "+" : ""}${t.meanMs} ms \u00b1${t.sdMs}` : "";
        const l = practice.lengthStats();
        const len = l.n ? ` \u00b7 note length ${Math.round(l.median * 100)}%` : "";
        setStatus(`Finished \u2014 ${practice.score.points} pts \u00b7 ${practice.accuracy()}% accuracy (${practice.score.correct} correct, ${practice.score.wrong} wrong, ${practice.score.missed} missed)${timing}${len}.`, "ok");
      } else {
        setStatus("Finished.", "ok");
      }
      endSession();
      if (currentMode() === "wait" && practice && practice.events.length) {
        // show what the first note is; the score stays until it is played
        const first = practice.events[0];
        keyboard.setSource("expected", [...first.required].map(transposed));
        coach("Finished \u2014 play the first note to go again.", "ok", { ms: 6000 });
      }
    };
    transport.onLoop = (aSec) => {
      activeCursor = 0;
      loopPass++;
      if (practice && currentMode() !== "listen" && passSnapshot) {
        const dC = practice.score.correct - passSnapshot.correct;
        const dW = practice.score.wrong - passSnapshot.wrong;
        const dM = practice.score.missed - passSnapshot.missed;
        const dL = (practice.score.lengthErrors || 0) - (passSnapshot.lengthErrors || 0);
        const attempts = dC + dW + dM;
        if (attempts) {
          const pct = Math.round(100 * Math.max(0, dC - (practice.lengthMode === "strict" ? dL : 0)) / attempts);
          coach("Pass " + loopPass + ": " + pct + "% \u00b7 " + dW + " wrong \u00b7 " + dM + " missed" +
                    (dL ? " \u00b7 " + dL + " wrong length" : ""), pct >= 95 ? "ok" : "warn", { ms: 3500 });
        }
      } else if (loopPass > 0) {
        setStatus("Pass " + loopPass + ".", "ok");
      }
      updateLoopInfo();
      if (practice && currentMode() !== "listen") {
        // Gradual tempo raising (motor-learning: increase difficulty only after
        // clean executions): a loop pass with >=4 attempts at >=95% accuracy
        // steps the tempo up 5%, capped at 100%.
        if (els.toggleRamp.checked && currentMode() === "follow" && passSnapshot) {
          const dW = practice.score.wrong - passSnapshot.wrong;
          const dM = practice.score.missed - passSnapshot.missed;
          const dRaw = practice.score.correct - passSnapshot.correct;
          const attempts = dRaw + dW + dM;
          // With note length Required, a clipped note is not a clean note —
          // the pass report already said so; the ramp now agrees with it.
          const dL = practice.lengthMode === "strict"
            ? (practice.score.lengthErrors || 0) - (passSnapshot.lengthErrors || 0) : 0;
          const dC = Math.max(0, dRaw - dL);
          const rate = transport.rate;
          if (attempts >= 4 && dC / attempts >= 0.95 && rate < 0.999) {
            applyTempo(Math.min(1, Math.round((rate + 0.05) * 100) / 100));
            coach("Clean pass \u2014 tempo up to " + Math.round(transport.rate * 100) + "%.", "ok", { ms: 3500 });
          } else if (attempts >= 4 && dC / attempts < 0.70 && rate > 0.501) {
            // Accuracy first: when a pass falls apart, back the tempo off so
            // the loop trains correct movements rather than rehearsing errors.
            applyTempo(Math.max(0.5, Math.round((rate - 0.05) * 100) / 100));
            coach("Rough pass \u2014 tempo down to " + Math.round(transport.rate * 100) + "%.", "warn", { ms: 3500 });
          }
        }
        passSnapshot = { ...practice.score };
        practice.resetTo(aSec);
        if (song) sheet.clearMarks(song.notes, aSec);
        keyboard.clearSource("expected");
        keyboard.setBadges(null);
        roll.setExpected(null);
        if (currentMode() === "wait") transport.setHold(practice.nextGateTime());
      }
    };
    transport.onHold = () => { if (practice && currentMode()==="wait") practice.openCurrentGate(); };
    transport.onStateChange = (playing) => {
      els.btnPlay.classList.toggle("is-hidden", playing);
      els.btnPause.classList.toggle("is-hidden", !playing);
      document.body.classList.toggle("is-playing", playing);
    };

    // MIDI callbacks
    midi.onNoteOn = (m, v) => {
      if (calib) { calibTap(); return; }
      if (controlKeyDown(m)) return;
      handleNoteOn(m, v);
    };
    midi.onNoteOff = (m) => { if (!isControlKey(m)) handleNoteOff(m); };
    // Transport buttons on a keyboard (MIDI real-time messages).
    midi.onTransport = (kind) => {
      if (kind === "stop") { if (transport.isPlaying) doPause(); return; }
      if (kind === "start") seekTo(loopA != null ? loopA : 0);   // Start means "from the top"
      if (!transport.isPlaying) doPlay().catch(showErr);
    };
    midi.onSustain = (down) => engine.setSustain(down);
    midi.onPanic = () => { engine.allNotesOff(); keyboard.clearSource("user"); if (practice) practice.releaseAllKeys(); };
    midi.onDevices = (list) => {
      setTimeout(updateMidiChip, 0);
      els.midiDevices.innerHTML = '<option value="all">All devices</option>';
      for (const d of list) { const o=document.createElement("option"); o.value=d.id; o.textContent=d.name; els.midiDevices.appendChild(o); }
      const wanted = profile.midiDeviceId || "all";
      const known = wanted === "all" || list.some((d) => d.id === wanted);
      els.midiDevices.value = known ? wanted : "all";
      midi.setActive(els.midiDevices.value);   // was set on the <select> only
    };
    // MIDI messages used to appear only inside the Settings dialog — invisible
    // when it is closed, which is exactly when the masthead chip is used.
    midi.onStatus = (t, k) => {
      els.midiStatus.textContent = t; els.midiStatus.className = "status status--" + (k||"");
      if (k === "err" || k === "warn") coach(t, k, { ms: 6000 }); else setStatus(t, k);
      updateMidiChip();
    };
    midi.onConnect = (name, atStartup) => {
      if (atStartup) setStatus(name + " connected.", "ok");
      else coach(name + " connected.", "ok", { ms: 2500 });
      updateMidiChip();
    };
    midi.onDisconnect = (name) => {
      coach(name + " disconnected \u2014 plug it back in to keep playing.", "warn", { ms: 5000 });
      if (practice) practice.releaseAllKeys();
      updateMidiChip();
    };

    wireKeys();

    // Losing focus with keys held used to leave them ringing.
    window.addEventListener("blur", () => {
      keyboard.releasePointers();
      for (const [, m] of heldCompKeys) handleNoteOff(m);
      heldCompKeys.clear();
      engine.allNotesOff();
      keyboard.clearSource("user");
      if (practice) practice.releaseAllKeys();
    });
    window.addEventListener("pagehide", () => { endSession(); });

    // The stage flexes to fill the window, so the canvas and the keyboard have
    // to follow the LAYOUT rather than only the window: a ResizeObserver
    // catches panel toggles and font settling as well as a window resize.
    let resizeTimer = null;
    // toasts sit just under the toolbar, clear of its buttons
    const placeToasts = () => {
      const rail = document.querySelector(".rail");
      if (!rail || !els.toasts) return;
      els.toasts.style.setProperty("--toast-top", Math.max(12, Math.round(rail.getBoundingClientRect().bottom + 10)) + "px");
    };
    placeToasts();
    window.addEventListener("scroll", placeToasts, { passive: true });
    const relayout = () => {
      placeToasts();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (show.roll) roll.resize();
        if (show.keyboard) keyboard.render();
        drawFrame();
      }, 90);
    };
    window.addEventListener("resize", relayout);
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(relayout);
      ro.observe(els.rollCanvas);
      ro.observe(els.keyboardSvg);

      // The score is engraved to a specific width, and the cursor is placed in
      // that same pixel space — so a panel that changed width without a
      // re-engrave would put the cursor back out of true. Re-render on a real
      // width change only (engraving is expensive), and re-place the cursor.
      let lastW = 0, sheetTimer = null;
      let lastH = 0;
      const reflow = new ResizeObserver((entries) => {
        const w = Math.round(entries[0].contentRect.width);
        const h = Math.round(entries[0].contentRect.height);
        // Width re-lays the systems out; height matters too when the score is
        // fitted to the panel (hiding the transport in Wait mode makes it taller).
        const widthChanged = w && Math.abs(w - lastW) >= 8;
        const heightChanged = h && Math.abs(h - lastH) >= 12 && sheet.autoFit;
        if (!widthChanged && !heightChanged) return;
        lastW = w; lastH = h;
        clearTimeout(sheetTimer);
        sheetTimer = setTimeout(() => {
          if (song && song.hasSheet && sheet.loaded) { sheet.reflow(); drawFrame(); }
        }, 220);
      });
      reflow.observe(els.sheetContainer);
    }
  }

  // ---- settings sections ------------------------------------------------------
  let settingsTab = "piece";
  function showSettingsTab(tab) {
    settingsTab = tab;
    for (const b of els.setNav.querySelectorAll("[data-tab]")) {
      const on = b.dataset.tab === tab;
      b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1;
    }
    let first = true;
    for (const sec of els.settingsDialog.querySelectorAll(".setgroup[data-tab]")) {
      const on = sec.dataset.tab === tab;
      sec.hidden = !on;
      sec.classList.toggle("is-first", on && first);
      if (on) first = false;
    }
    const pane = els.settingsDialog.querySelector(".setpanes");
    if (pane) pane.scrollTop = 0;
    if (tab === "hand") renderStyles();
  }
  function openSettings(tab) {
    const d = els.settingsDialog;
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute("open", "");
    showSettingsTab(tab || settingsTab);
  }

  /** The zoom knob reports the fitted value when auto-fit is on. */
  function updateZoomLabel() {
    if (els.toggleFit.checked) {
      const z = sheet.fittedZoom || 1;
      els.zoomVal.textContent = "auto \u00b7 " + Math.round(z * 100) + "%";
      els.zoom.value = String(Math.max(0.5, Math.min(2, z)));
    } else {
      els.zoomVal.textContent = Math.round(parseFloat(els.zoom.value) * 100) + "%";
    }
  }

  /** Tempo in one place: transport, labels, BPM readout and persistence. */
  function applyTempo(r) {
    r = Math.max(0.3, Math.min(1.5, r));
    transport.setRate(r);
    els.tempo.value = String(r);
    els.tempoVal.textContent = Math.round(r * 100) + "%";
    if (song) els.tempoInfo.textContent = headerMeta(r);
    store.setSetting("tempo", r);
  }

  /** Step to the previous/next chord onset. */
  function stepOnset(dir) {
    if (!song || !onsetTimes.length) return;
    const pos = transport.position;
    if (dir < 0) {
      let prev = 0;
      for (const t of onsetTimes) { if (t < pos - 0.03) prev = t; else break; }
      seekTo(prev);
    } else {
      const next = onsetTimes.find((t) => t > pos + 0.03);
      seekTo(next == null ? transport.duration : next);
    }
  }

  // ============================================================ shortcuts
  // code -> the midi note it actually sounded, so a key released after an
  // octave shift still stops the note it started.
  const heldCompKeys = new Map();

  // A few environments (some Android soft keyboards, remote-desktop clients)
  // deliver keydown without `code`. Fall back to the character so those users
  // still get a playable keyboard, accepting that the fallback assumes a US
  // layout — which is exactly the case `code` exists to avoid.
  const CHAR_TO_CODE = {
    a:"KeyA", s:"KeyS", d:"KeyD", f:"KeyF", g:"KeyG", h:"KeyH", j:"KeyJ", k:"KeyK", l:"KeyL",
    ";":"Semicolon", "'":"Quote",
    w:"KeyW", e:"KeyE", r:"KeyR", t:"KeyT", y:"KeyY", u:"KeyU", i:"KeyI", o:"KeyO", p:"KeyP",
    z:"KeyZ", x:"KeyX", c:"KeyC", b:"KeyB", m:"KeyM",
    "[":"BracketLeft", "]":"BracketRight", ",":"Comma", ".":"Period", " ":"Space",
    0:"Digit0", 1:"Digit1", 2:"Digit2", 3:"Digit3", 4:"Digit4", 5:"Digit5",
  };
  function codeOf(e) {
    if (e.code) return e.code;
    const k = (e.key || "").toLowerCase();
    return CHAR_TO_CODE[k] || "";
  }

  function compMidiFor(code) {
    const semi = COMP_MAP.get(code);
    return semi == null ? null : compBase + semi;
  }

  /** Move the typing keyboard by an octave and say where it landed. */
  function shiftCompOctave(dir) {
    const next = compBase + dir * 12;
    if (next < 12 || next + COMP_SPAN > 120) return;
    // release anything held, or it would never be stopped
    for (const [, m] of heldCompKeys) handleNoteOff(m);
    heldCompKeys.clear();
    compBase = next;
    store.setSetting("typingOctave", compBase);
    keyboard.setTypingRange(compBase, compBase + COMP_SPAN);
    setStatus("Typing keyboard: " + midiName(compBase) + "\u2013" + midiName(compBase + COMP_SPAN) +
              " (Z / X to move).", "ok");
  }

  /*
   * A mouse or finger click leaves focus on the control it hit. With focus on
   * the Follow radio, Chrome turns the arrow keys into mode changes; with focus
   * on a chip, Space toggles it instead of playing. So after a POINTER
   * interaction the control lets go of focus. Keyboard users are unaffected:
   * tabbing to a control and using the arrows still works natively, because
   * nothing is released unless a pointer went down in the last moment.
   */
  function wireFocusRelease() {
    let pointerAt = -1e9;
    document.addEventListener("pointerdown", () => { pointerAt = performance.now(); }, true);
    const release = (e) => {
      const t = e.target;
      if (!t || !t.matches || performance.now() - pointerAt > 1500) return;
      if (t.closest("dialog")) return;
      if (t.matches('input[type="number"], input[type="text"], textarea')) return;
      // A <select> is released only after a choice (change), never on the click
      // that OPENS it — blurring it there closes its list the moment it appears.
      if (e.type === "click" && t.matches("select")) return;
      if (t.matches("button, select, input")) setTimeout(() => { if (document.activeElement === t) t.blur(); }, 0);
    };
    document.addEventListener("change", release, true);
    document.addEventListener("click", release, true);
  }

  function wireKeys() {
    wireFocusRelease();
    document.addEventListener("keydown", (e) => {
      if (calib && !e.repeat && e.key !== "Escape" && e.key !== "Tab") { e.preventDefault(); calibTap(); return; }
      // An open dialog owns the keyboard: nothing may play or start behind it.
      if (document.querySelector("dialog[open]")) return;
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT" || e.target.tagName === "TEXTAREA")) return;
      if (e.target && e.target.isContentEditable) return;
      // Ctrl+S, Cmd+A and friends must not play notes or steal the spacebar.
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // computer-keyboard piano
      const code = codeOf(e);
      if (COMP_MAP.has(code)) {
        if (!e.repeat && !heldCompKeys.has(code)) {
          const m = compMidiFor(code);
          heldCompKeys.set(code, m);
          handleNoteOn(m, 0.8);
        }
        e.preventDefault();
        return;
      }

      // fingering numbers take priority over everything else while editing
      if (els.btnFingering.classList.contains("is-on") && /^(Digit|Numpad)[0-5]$/.test(code)) {
        e.preventDefault(); setFinger(parseInt(code.slice(-1), 10)); return;
      }

      switch (code) {
        case "Space":
          e.preventDefault();
          if (transport.inCountIn) { doPlay().catch(showErr); return; }   // skip the run-up
          transport.isPlaying ? doPause() : doPlay().catch(showErr);
          return;
        case "ArrowLeft":  if (song) { e.preventDefault(); seekTo(transport.position - 5); } return;
        case "ArrowRight": if (song) { e.preventDefault(); seekTo(transport.position + 5); } return;
        case "Comma":      if (song) { e.preventDefault(); stepOnset(-1); } return;
        case "Period":     if (song) { e.preventDefault(); stepOnset(1); } return;
        case "BracketLeft":  e.preventDefault(); applyTempo(transport.rate - 0.05); return;
        case "BracketRight": e.preventDefault(); applyTempo(transport.rate + 0.05); return;
      }
      // Letter shortcuts also go by physical position, and they live on the
      // bottom row now: the home row belongs to the piano. B for Bar, C for
      // Clear, Z/X for the octave — all clear of the playing keys.
      switch (code) {
        case "KeyM":
          if (e.repeat) return;
          els.toggleMetronome.checked = !els.toggleMetronome.checked;
          applyMetronome();
          store.setSetting("metronome", els.toggleMetronome.checked);
          setStatus("Metronome " + (els.toggleMetronome.checked ? "on" : "off") + ".", "ok");
          return;
        case "KeyB": if (song) loopCurrentBar(); return;
        case "KeyC": loopA=loopB=null; loopPass=0; transport.clearLoop(); updateLoopInfo(); setStatus("Repeat off.", "ok"); return;
        case "KeyZ": if (!e.repeat) shiftCompOctave(-1); return;
        case "KeyX": if (!e.repeat) shiftCompOctave(1); return;
      }
      if (e.key === "?") { els.btnHelp.click(); return; }
    });
    document.addEventListener("keyup", (e) => {
      const code = codeOf(e);
      if (heldCompKeys.has(code)) {
        const m = heldCompKeys.get(code);
        heldCompKeys.delete(code);
        handleNoteOff(m);
      }
    });
  }

  // ============================================================ boot
  async function boot() {
    cacheEls();
    if (!window.Tone || !window.opensheetmusicdisplay) {
      setStatus("Libraries failed to load \u2014 check the lib/ folder is next to index.html.", "err");
      return;
    }
    store = new PT.Storage();

    // restore profile + settings
    const savedActive = await store.getSetting("activeProfile", null);
    if (savedActive) { const p = await store.get("profiles", savedActive); if (p) profile = p; }

    engine = new PT.AudioEngine();
    transport = new PT.Transport(engine);
    sheet = new PT.SheetView();   sheet.init(els.sheetContainer);
    roll = new PT.PianoRollView(); roll.init(els.rollCanvas);
    // Re-read the palette after the stylesheet has definitely applied, so the
    // canvas colours can never be stuck on the built-in fallbacks.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => { roll.readTheme(); drawFrame(); }).catch(() => {});
    }
    keyboard = new PT.KeyboardView(); keyboard.init(els.keyboardSvg);
    midi = new PT.MidiInput();
    practice = new PT.Practice();
    plog = new PT.PracticeLog(store);
    await plog.load();

    // initial ranges/render
    const range = PT.profiles.rangeFor(profile);
    keyboard.setRange(range.low, range.high); keyboard.render();
    roll.setRange(range.low, range.high); roll.resize();

    applyProfileToControls();
    showHand();

    // restore view toggles / tempo / mode / hand
    const savedViews = await store.getSetting("views", null);
    if (savedViews) {
      Object.assign(show, savedViews);
      els.toggleSheet.checked = show.sheet; els.toggleRoll.checked = show.roll; els.toggleKeyboard.checked = show.keyboard;
      els.sheetPanel.classList.toggle("is-hidden", !show.sheet);
      els.rollPanel.classList.toggle("is-hidden", !show.roll);
      els.keyboardPanel.classList.toggle("is-hidden", !show.keyboard);
    }
    const savedVol = await store.getSetting("volume", 0.8);
    els.volume.value = String(savedVol); engine.setVolume(savedVol);
    const savedZoom = await store.getSetting("zoom", 1);
    els.zoom.value = String(savedZoom);
    setLatency((await store.getSetting("latencyMs", 0)) / 1000);
    showControlKeys();

    els.toggleOtherHand.checked = await store.getSetting("otherHand", false);
    els.toggleMoves.checked = await store.getSetting("showMoves", true);
    roll.showMoves = els.toggleMoves.checked;
    els.toggleColour.checked = await store.getSetting("colourNotes", true);
    sheet.setOverlayEnabled(els.toggleColour.checked);
    els.lengthMode.value = await store.getSetting("lengthMode", "strict");
    practice.setLengthMode(els.lengthMode.value);
    const fitOn = await store.getSetting("fitScore", true);
    els.toggleFit.checked = fitOn;
    sheet.autoFit = fitOn;
    if (!fitOn) sheet.osmd.Zoom = savedZoom;
    updateZoomLabel();
    const savedTempo = await store.getSetting("tempo", 1);
    els.tempo.value = String(savedTempo); els.tempoVal.textContent = Math.round(savedTempo*100)+"%"; transport.setRate(savedTempo);
    const savedMode = await store.getSetting("mode", "listen");
    ({listen:els.modeListen, follow:els.modeFollow, wait:els.modeWait}[savedMode]||els.modeListen).checked = true;
    const savedHand = await store.getSetting("hand", "both");
    ({both:els.handBoth, right:els.handRight, left:els.handLeft}[savedHand]||els.handBoth).checked = true;
    els.timingWindow.value = await store.getSetting("timingWindow", "normal");
    practice.setWindow(els.timingWindow.value);
    els.timingWindow.disabled = savedMode !== "follow";

    // metronome / count-in / note names / beat grid / click volume
    els.toggleMetronome.checked = await store.getSetting("metronome", false);
    const metro = await store.getSetting("metro", null);
    if (metro) {
      els.countInMode.value = metro.countIn || "off"; els.metroSound.value = metro.sound || "classic";
      els.metroMeter.value = metro.meter || "auto"; els.metroSub.value = metro.sub || "1"; els.metroLang.value = metro.lang || "en";
    } else {
      // older versions had a simple count-in checkbox, which clicked; the voice is what it was missing
      els.countInMode.value = (await store.getSetting("countIn", false)) ? "voice" : "off";
    }
    engine.setMetronome({ sound: els.metroSound.value, countIn: els.countInMode.value, lang: els.metroLang.value });
    const savedLabels = await store.getSetting("labels", false);
    els.toggleLabels.checked = savedLabels;
    keyboard.setLabels(savedLabels);
    if (savedLabels) keyboard.render();
    (await store.getSetting("fingerScope", "note")) === "pitch" ? (els.scopePitch.checked = true) : (els.scopeNote.checked = true);
    compBase = await store.getSetting("typingOctave", COMP_BASE_DEFAULT);
    if (!(compBase >= 12 && compBase + COMP_SPAN <= 120)) compBase = COMP_BASE_DEFAULT;
    keyboard.setTypingRange(compBase, compBase + COMP_SPAN);
    const savedGrid = await store.getSetting("beatGrid", true);
    els.toggleGrid.checked = savedGrid; roll.setGrid(savedGrid);
    els.toggleRamp.checked = await store.getSetting("autoRamp", false);
    const savedCursor = await store.getSetting("cursorBar", true);
    els.toggleCursor.checked = savedCursor;
    sheet.setCursorVisible(savedCursor);
    const savedClickVol = await store.getSetting("clickVol", 0.6);
    els.clickVol.value = String(savedClickVol);
    engine.setClickVolume(savedClickVol);

    // populate the samples dropdown
    for (const k of (PT.samplesOrder || Object.keys(PT.samples))) {
      const o = document.createElement("option");
      o.value = k; o.textContent = PT.samples[k].title;
      els.sampleList.appendChild(o);
    }

    wire();

    // A returning player never has to press Connect: if the browser already
    // allowed MIDI, reconnect without asking (this never shows a prompt).
    // Must run AFTER wire(): the device list and announcements are delivered
    // through handlers wire() installs — before it, they went nowhere.
    updateMidiChip();
    midi.autoConnect().then(() => updateMidiChip()).catch(() => updateMidiChip());
    enableControls(false);
    await refreshPieceList();
    renderLog();

    // reopen the last piece (only ones whose content we actually stored)
    let reopened = false;
    try {
      const lastId = await store.getSetting("lastPiece", null);
      if (lastId) {
        const p = await store.get("pieces", lastId);
        if (p && p.content) {
          if (p.format === "midi") await loadMIDIBuffer(b64ToBuf(p.content), p.name, { id: p.id, store: false }, { parts: p.parts, fit: p.fit });
          else await loadMusicXMLText(p.content, p.name, { id: p.id, store: false }, p.parts ? { parts: p.parts } : null);
          reopened = true;
        }
      }
    } catch (e) { /* a failed auto-reopen should never block the app */ }

    // backend note + apply saved instrument (samples load lazily, non-blocking)
    if (profile.audioBackend === "piano") profile.audioBackend = "acoustic_grand_piano"; // legacy
    if (profile.audioBackend && profile.audioBackend !== "synth") {
      const wanted = profile.audioBackend;
      els.profileBackend.value = wanted;
      els.backendNote.textContent = "loading " + instrumentLabel(wanted) + "\u2026";
      engine.setBackend(wanted).then((got) => {
        els.backendNote.textContent = got !== "synth"
          ? instrumentLabel(got) + " (samples loaded)"
          : instrumentLabel(wanted) + " failed to load \u2014 using synth";
        els.profileBackend.value = got;
      }).catch(() => { els.backendNote.textContent = "load failed \u2014 using synth"; });
    } else {
      els.backendNote.textContent = "offline synth";
    }

    // register PWA service worker (only over http/https, not file://)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch(()=>{});
    }

    if (!reopened) {
      setStatus("Ready. Load a sample or open a MusicXML / MIDI file. Press ? for shortcuts.", "ok", { toast: false });
      if (els.firstRun) els.firstRun.classList.remove("is-hidden");
      document.body.classList.add("is-empty");
    }
  }

  // Test/debug hook: only with ?debug in the URL. Lets automated tests look at
  // state that the UI does not expose (the engine's gain, the song model).
  if (/[?&]debug\b/.test(location.search)) {
    window.PT.__app = {
      get engine() { return engine; }, get transport() { return transport; },
      get practice() { return practice; }, get sheet() { return sheet; },
      get roll() { return roll; }, get keyboard() { return keyboard; },
      get midi() { return midi; }, get plog() { return plog; }, get song() { return song; },
      get profile() { return profile; },
    };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
