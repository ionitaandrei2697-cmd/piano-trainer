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
chk("fast repeated notes change finger on every stroke", fast.slice(0, 6).every((f, i) => i === 0 || f !== fast[i - 1]), fast);
chk("  ...towards the thumb (3-2-1)", fast.slice(0, 3).join("") === "321", fast);
chk("slow repeated notes keep their finger", new Set(slow.slice(0, 6)).size === 1, slow);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
