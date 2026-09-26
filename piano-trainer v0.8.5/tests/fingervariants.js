/* Fingering for YOUR hand (Node, no browser):
 *  - a small hand (reaches an octave) still gets the method-book fingerings
 *    (it used to fall to ~62%: a five-finger position counted as a stretch);
 *  - the average hand is exactly the published model (tests/positiontest.js);
 *  - the four styles differ the way they say they do, on real melodies;
 *  - fast repeated notes change finger (3-2-1), slow ones keep it;
 *  - a chord wider than the hand can stretch is marked, and which chords that
 *    is depends on the hand;
 *  - suggestions follow the hand: relaxed for small, compact for large.
 * Run: node tests/fingervariants.js */
const path = require("path");
const dir = path.join(__dirname, "..", "src") + "/";
globalThis.PT = { keys: require(dir + "keys.js") };
const F = require(dir + "fingering.js");
const MEL = require("./melodies.js");
const { BENCH, HELDOUT } = require("./fingerbench.js");

let pass = 0, fail = 0;
const chk = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && x !== undefined ? "  <- " + JSON.stringify(x) : "")); };
const songOf = (p, hand, step) => ({ notes: p.map((m, i) => ({ id: i, midi: m, startSec: i * (step || 0.5), durSec: (step || 0.5) * 0.9, staff: hand === "right" ? 0 : 1 })) });

function textbook(size, strategy) {
  let hit = 0, n = 0;
  for (const b of [...BENCH, ...HELDOUT]) {
    const s = songOf(b.p, b.hand); F.annotate(s, size, { strategy });
    b.f.forEach((e, i) => { if ((Array.isArray(e) ? e : [e]).includes(s.notes[i].finger)) hit++; }); n += b.p.length;
  }
  return 100 * hit / n;
}
function totals(size, strategy) {
  const t = { jumps: 0, passes: 0, stretches: 0 };
  for (const m of MEL) { const s = songOf(m.p, m.hand); F.annotate(s, size, { strategy }); for (const k in t) t[k] += s.fingerStats[k]; }
  return t;
}

console.log("\nHand size");
const small = textbook({ reach: 12 }, "balanced"), avg = textbook({ reach: 15 }, "balanced"), big = textbook({ reach: 17 }, "balanced");
console.log(`        method-book agreement: reaches an octave ${small.toFixed(1)}% · average ${avg.toFixed(1)}% · an eleventh ${big.toFixed(1)}%`);
chk("a hand that reaches an octave still gets the method-book fingerings (>= 95%)", small >= 95, small);
chk("the average hand is the published model (same as the \"M\" preset)", Math.abs(avg - textbook("M", "balanced")) < 1e-9 && F.scaleOf("M") === 1 && F.scaleOf({ reach: 15 }) === 1);
const tS = totals({ reach: 12 }, "balanced"), tA = totals({ reach: 15 }, "balanced");
chk("a small hand needs no more jumps than an average one on these melodies", tS.jumps <= tA.jumps + 1, { small: tS, avg: tA });

console.log("\nStyles (13 melodies, average hand)");
const T = {}; for (const st of Object.keys(F.STRATEGIES)) { T[st] = totals({ reach: 15 }, st); console.log("        " + st.padEnd(9) + JSON.stringify(T[st])); }
chk("legato joins the line: fewer jumps than balanced, paid for in thumb passes", T.legato.jumps < T.balanced.jumps && T.legato.passes > T.balanced.passes, T);
const Ts = {}; for (const st of Object.keys(F.STRATEGIES)) Ts[st] = totals({ reach: 12 }, st);
chk("small hand: 'stay in position' stretches, 'relaxed' never does", Ts.compact.stretches > 0 && Ts.relaxed.stretches === 0 && Ts.compact.jumps <= Ts.balanced.jumps, Ts);
chk("small hand: 'relaxed' moves the hand at least as often as 'balanced'", Ts.relaxed.jumps + Ts.relaxed.passes >= Ts.balanced.jumps + Ts.balanced.passes, Ts);
const v = F.variants(songOf(MEL[0].p, MEL[0].hand), { reach: 15 });
chk("variants() reports all four styles and marks one as suggested", v.length === 4 && v.filter((x) => x.suggested).length === 1, v);

console.log("\nRepeated notes");
const rep = (ioi) => { const s = songOf([64, 64, 64, 64, 64, 64, 65, 67], "right", ioi); F.annotate(s, "M"); return s.notes.map((n) => n.finger); };
const fast = rep(0.1), slow = rep(0.5);
console.log(`        E4 x6 then F G at 0.10 s: ${fast.join("")} · at 0.50 s: ${slow.join("")}`);
chk("a run of fast repeated notes changes finger on every stroke", fast.slice(0, 6).every((f, i) => i === 0 || f !== fast[i - 1]), fast);
chk("  ...in the pianist's cycle: towards the thumb, starting again on 3 or 4 (4-3-2-1, 3-2-1)",
  fast.slice(0, 6).every((f, i) => i === 0 || f === fast[i - 1] - 1 || (fast[i - 1] === 1 && f >= 3)) && fast[0] >= 3, fast);
chk("slow repeated notes keep their finger", new Set(slow.slice(0, 6)).size === 1, slow);
const four = (() => { const s = songOf([64, 64, 64, 64, 65, 67], "right", 0.125); F.annotate(s, "M"); return s.notes.map((n) => n.finger).join(""); })();
chk("four fast repeats then F G: 4-3-2-1 2-3", four === "432123", four);
// Yui, "Again", bar 29 at 120 BPM: E E E-E E E-E A E (eighths with pairs of sixteenths).
// A pair or three of quick notes inside a slower line is ONE finger's job;
// the first version changed finger on the pairs only (3 3 3 2 3 3 2), reported as a bug.
const again = (() => { const t = [0, 0.25, 0.5, 0.625, 0.75, 1.0, 1.125, 1.25, 1.5], p = [64, 64, 64, 64, 64, 64, 64, 69, 64];
  const s = { notes: p.map((m, i) => ({ id: i, midi: m, startSec: t[i], durSec: 0.12, staff: 0 })) }; F.annotate(s, "M"); return s.notes.map((n) => n.finger); })();
console.log(`        "Again", bar 29: ${again.join(" ")}`);
chk("short bursts of quick repeats inside a line keep one finger (\"Again\", bar 29)", new Set(again.filter((f, i) => i !== 7)).size === 1, again);
chk("a finger change on a repeated key is not a hand move", (() => { const s = songOf([64, 64, 64, 64], "right", 0.1); F.annotate(s, "M"); return s.fingerStats.jumps === 0 && s.fingerStats.passes === 0 && s.fingerStats.alternations === 3; })());

console.log("\nChords too wide for the hand");
const wide = (ps, hand, size) => { const s = { notes: ps.map((m, i) => ({ id: i, midi: m, startSec: 0, durSec: 1, staff: hand === "right" ? 0 : 1 })) }; F.annotate(s, size); return s.notes.every((n) => n.wide); };
chk("an octave fits a hand that reaches an octave", !wide([60, 72], "right", { reach: 12 }));
chk("a ninth doesn't", wide([60, 74], "right", { reach: 12 }));
chk("a tenth is too wide for the average hand, fine for one that reaches an eleventh", wide([48, 64], "left", { reach: 15 }) && !wide([48, 64], "left", { reach: 17 }));
chk("a triad is never marked", !wide([60, 64, 67], "right", { reach: 12 }));

console.log("\nSuggestions");
chk("reaches an octave -> relaxed; average -> balanced; an eleventh -> compact",
  F.suggestedStrategy({ reach: 12 }) === "relaxed" && F.suggestedStrategy({ reach: 15 }) === "balanced" && F.suggestedStrategy({ reach: 17.5 }) === "compact",
  [12, 15, 17.5].map((r) => F.suggestedStrategy({ reach: r })));
chk("hand reach reported in semitones (average: 15 practical, 13 comfortable)", (() => { const h = F.handReach({ reach: 15 }); return Math.abs(h.practical - 15) < 1e-9 && Math.abs(h.comfortable - 13) < 1e-9; })());

console.log("\nFür Elise, bars 1-9 (reported by a player with an average hand)");
// Right hand as the MIDI file plays it: sixteenths at 72 BPM (0.208 s), a
// sixteenth rest after each eighth, so the hand is off the keys before C4, E4, D4.
// The four reports: 1 4 5 cramped together; 5 3 1 is easier than 5 4 1;
// C4 E4 A4 B4 without moving the hand (1 2 4 5, not 1 2 + move 3 4);
// E B D C A as 5 2 4 3 then 1, no move (not 5 1 3 2).
const ELISE = "E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 r C4 E4 A4 B4:2 r E4 G#4 B4 C5:2 r E4 E5 D#5 E5 D#5 E5 B4 D5 C5 A4:2 r C4 E4 A4 B4:2 r D4 C5 B4 A4:4";
const elise = (shift, size) => {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, SIX = 0.2083;
  const notes = []; let t = 0;
  for (const tok of ELISE.split(" ")) {
    const [nm, len] = tok.split(":"); const l = +(len || 1);
    if (nm !== "r") { const m = /^([A-G])(#?)(\d)$/.exec(nm); notes.push({ id: notes.length, midi: 12 * (+m[3] + 1) + PC[m[1]] + (m[2] ? 1 : 0) + shift, startSec: t * SIX, durSec: l * SIX - 0.012, staff: 0 }); }
    t += l;
  }
  const s = { notes }; F.annotate(s, size || "M");
  return { f: s.notes.map((n) => n.finger).join(""), moves: s.notes.map((n, i) => (n.handMove ? i : -1)).filter((i) => i >= 0), notes: s.notes };
};
const E0 = elise(0);
console.log("        " + E0.f.replace(/^(.{9})(.{4})(.{4})(.{10})(.{4})(.{4})$/, "$1 | $2 | $3 | $4 | $5 | $6"));
chk("the edition fingering: 545452431 | 1245 | 1245 | 1545452431 | 1245 | 1543", E0.f === "545452431" + "1245" + "1245" + "1545452431" + "1245" + "1543", E0.f);
chk("  ...4 plays D#5 and, a beat later, D5: one finger slides a semitone, the hand stays", E0.f.slice(1, 7) === "454524");
chk("  ...the hand moves only in the rests and on the octave leap E4-E5", JSON.stringify(E0.moves) === JSON.stringify([9, 13, 18, 27, 31]), E0.moves);
chk("  ...no thumb on G#4", E0.notes.every((n) => !(n.midi === 68 && n.finger === 1)));
const shifted = [-5, -7, -12].map((sh) => elise(sh).f);
chk("the same fingering a fourth, a fifth and an octave lower (the rule is not tied to these keys)", shifted.every((f) => f === E0.f), shifted);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
