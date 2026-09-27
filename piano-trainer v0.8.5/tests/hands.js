/* Which hand plays a note, when a MIDI file's two tracks get in each other's
 * way (Node, no browser) — parser.untangleHands, run by the app on every MIDI
 * file it opens:
 *  - Für Elise, bars 20-25 as a MIDI file has them: the left-hand track takes
 *    D#5 E5 pairs in the middle of the right hand's E D# E D#. Reported: "I
 *    don't understand the left hand coming in here". Those notes go to the
 *    right hand, at any tempo, and the right hand's line gets one finger per key;
 *  - accompaniments passed from hand to hand on purpose stay as written:
 *    Bach's C major prelude, Gounod's Ave Maria (the same figure written
 *    without ties), a Schumann arpeggio continued by the other hand, a Joplin
 *    rag's hands leap-frogging, a right hand already holding a second voice,
 *    and a trill split between the hands too fast for one;
 *  - the same through a real MIDI file (two tracks -> hands -> repair).
 * Run: node tests/hands.js */
const path = require("path");
const dir = path.join(__dirname, "..", "src") + "/";
globalThis.PT = { keys: require(dir + "keys.js") };
globalThis.Midi = require(path.join(__dirname, "..", "lib", "Midi.js")).Midi;
const P = require(dir + "parser.js"), F = require(dir + "fingering.js"), mk = require("./mkmidi.js");

let pass = 0, fail = 0;
const chk = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && x !== undefined ? "  <- " + JSON.stringify(x) : "")); };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (nm) => { const m = /^([A-G])(#|b)?(-?\d)$/.exec(nm); return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); };
/** "R:E5@3:1 L:D#5@9" — hand, note, onset and length in steps of `step` seconds. */
const piece = (spec, step) => spec.trim().split(/\s+/).map((tok, id) => {
  const [, h, nm, at, len] = /^([RL]):([A-G][#b]?-?\d)@([\d.]+)(?::([\d.]+))?$/.exec(tok);
  return { id, midi: midiOf(nm), startSec: +at * step, durSec: (+(len || 1) - 0.06) * step, staff: h === "R" ? 0 : 1 };
});
const moved = (notes) => { const before = notes.map((n) => n.staff); const r = P.untangleHands(notes); return { n: r.moved, which: notes.filter((x, i) => x.staff !== before[i]) }; };

// Für Elise bars 20-25, as the file has them (sixteenths at 72 BPM = 0.208 s)
const ELISE = `R:E4@0 R:D5@1 R:C5@2 L:E2@3 R:B4@3:2 L:E3@4 L:E4@5 R:E4@6 R:E5@7 L:E4@8 L:E5@9 R:E5@10 R:E6@11
  L:D#5@12 L:E5@13 R:D#5@14 R:E5@15:2 L:D#5@16 L:E5@17 R:D#5@18 R:E5@19 R:D#5@20 R:E5@21 R:D#5@22 R:E5@23
  R:B4@24 R:D5@25 R:C5@26 L:A2@27 R:A4@27:2`;
const SIX = 0.2083;

console.log("\nFür Elise, the E-D# passage (bars 22-25)");
{
  const notes = piece(ELISE, SIX), m = moved(notes);
  const nm = (n) => Object.keys(PC).find((k) => PC[k] === n.midi % 12) || (n.midi % 12 === 3 ? "D#" : "?");
  console.log("        moved: " + m.which.map((n) => (n.staff ? "L:" : "R:") + nm(n) + (Math.floor(n.midi / 12) - 1)).join(" "));
  const hi = notes.filter((n) => n.staff === 1 && n.midi >= 72);
  chk("no left-hand note left among the right hand's (D#5/E5)", hi.length === 0, hi.map((n) => n.startSec));
  chk("the left hand keeps its bass: E2 E3 E4, and E4 again between the right hand's E5s", ["E2", "E3", "E4"].every((x) => notes.some((n) => n.staff === 1 && n.midi === midiOf(x))));
  chk("six notes change hands: the five D#5/E5 and one E4 the right hand dipped down for", m.n === 6, m.n);
  F.annotate({ notes }, "M");
  const e5 = notes.filter((n) => n.staff === 0 && n.midi === 76 && n.startSec > 6.5 * SIX && n.startSec < 10.5 * SIX).map((n) => n.finger);
  chk("the right hand's E5, E5, E5 before E6 get one finger (not 5, then 1 after a jump)", new Set(e5).size === 1, e5);
  const trill = notes.filter((n) => n.staff === 0 && n.startSec >= 12 * SIX - 1e-6 && n.startSec <= 23 * SIX + 1e-6).map((n) => n.finger).join("");
  chk("  ...and the E-D# line is 5-4 throughout", /^(54)+5?$|^(45)+4?$/.test(trill), trill);
  const tempos = [0.5, 0.8, 1.25, 2, 2.5].map((k) => moved(piece(ELISE, SIX * k)).n);
  chk("the same from twice as fast to two and a half times as slow", tempos.every((x) => x === 6), tempos);
}

console.log("\nAccompaniments passed between the hands stay as written");
// Bach, C major prelude: the left hand holds its two notes, the right hand repeats three
chk("Bach, C major prelude, bar 24 (G2 and F3 held under G3 B3 D4)", moved(piece(
  "L:G2@0:8 L:F3@1:3 R:G3@2 R:B3@3 R:D4@4 R:G3@5 R:B3@6 R:D4@7 L:G2@8:8 L:F3@9:3 R:G3@10 R:B3@11 R:D4@12 R:G3@13 R:B3@14 R:D4@15 " +
  "L:C2@16:8 L:E3@17:3 R:G3@18 R:C4@19 R:E4@20", 0.15)).n === 0);
// Gounod's Ave Maria: the same figure, written as plain sixteenths
chk("Gounod, Ave Maria accompaniment (G2 F3 | G3 B3 D4 G3 B3 D4)", moved(piece(
  "L:G2@0 L:F3@1 R:G3@2 R:B3@3 R:D4@4 R:G3@5 R:B3@6 R:D4@7 L:G2@8 L:F3@9 R:G3@10 R:B3@11 R:D4@12 R:G3@13 R:B3@14 R:D4@15 L:G2@16 L:E3@17 R:G3@18", 0.15)).n === 0);
// Schumann, Dichterliebe no. 1: an arpeggio the right hand continues
chk("Schumann, an arpeggio the right hand continues (B3 D4 F4 | F#4 A#4 B4)", moved(piece(
  "R:C#5@0 L:B3@1:6 L:D4@2 L:F4@3 R:F#4@4 R:A#4@5 R:B4@6 R:G5@7 R:F#5@8 L:A#3@9:4 L:D4@10 L:G4@11 R:D5@12", 0.15)).n === 0);
// Joplin, Maple Leaf Rag: the hands leap-frog up the keyboard
chk("Joplin, the hands leap-frogging up (G#3 B3 G#4 | G#4 B4 G#5 | G#4 | G#5 B5 G#6)", moved(piece(
  "L:G#2@0 L:B2@1 L:G#3@2 L:G#2@3:2 L:G#3@4 L:B3@5 L:G#4@6 L:G#3@7:2 R:G#4@8 R:B4@9 R:G#5@10 L:G#4@11:2 R:G#5@12 R:B5@13 R:G#6@14", 0.15)).n === 0);
// the right hand already has two voices: it holds C5 while the left hand plays the D#-E above it
chk("a right hand holding a note through them keeps its hands full (C5 held under D#5 E5)", moved(piece(
  "R:E5@0 R:C5@1:6 L:D#5@2 L:E5@3 R:D#5@4 R:E5@5 R:D#5@7 R:E5@8", 0.2)).n === 0);
// a trill shared by the hands to go faster than one hand can
chk("a trill split between the hands at 16 notes a second (one hand couldn't)", moved(piece(
  "R:E5@0 L:D#5@1 R:E5@2 L:D#5@3 R:E5@4 L:D#5@5 R:E5@6 L:D#5@7 R:E5@8", 0.06)).n === 0);

console.log("\nThrough a MIDI file");
{
  const PPQ = 480, S = PPQ / 4;                       // a sixteenth
  const tempo = { t: 0, bytes: [0xff, 0x51, 0x03, 0x0c, 0xb7, 0x35] };   // 833,333 us a quarter = 72 BPM
  const trk = { R: [tempo, mk.name(0, "Piano RH")], L: [mk.name(0, "Piano LH")] };
  for (const n of piece(ELISE, 1)) trk[n.staff ? "L" : "R"].push(...mk.note(n.staff ? 1 : 0, n.midi, Math.round(n.startSec * S), Math.round((n.durSec + 0.06) * S) - 10));
  const s = P.parseMIDI(new Uint8Array(mk.file([mk.track(trk.R), mk.track(trk.L)], PPQ)).buffer);
  const before = s.notes.filter((n) => n.staff === 1 && n.midi >= 72).length;
  const r = P.untangleHands(s.notes);
  chk("two piano tracks become the hands, and the repair then moves the same six notes", before === 5 && r.moved === 6 && !s.notes.some((n) => n.staff === 1 && n.midi >= 72), { before, moved: r.moved });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
