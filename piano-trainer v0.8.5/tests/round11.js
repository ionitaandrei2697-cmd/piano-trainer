/* Reported on Für Elise: "the left hand still comes in over the right hand",
 * with a screenshot of a converted score, after the MIDI repair (tests/hands.js)
 * had shipped. The score was a conversion made BEFORE the repair, saved by the
 * app and reopened by itself: a score's staves were never repaired. Now:
 *  - a MIDI file with the passage (D#5 E5 in the left-hand track, in the
 *    middle of the right hand's E D# E D#) opens with them in the right hand;
 *  - a conversion saved before the repair is repaired and redrawn when it is
 *    reopened, and saved again, so this happens once;
 *  - a fresh conversion carries the app's mark (so a downloaded copy is known);
 *  - a real score is never touched.
 * The passage is rebuilt here from the notes (Beethoven, public domain), not
 * the reporter's file.
 * Run: node tests/round11.js */
const { open } = require("./harness");
const path = require("path"), fs = require("fs"), os = require("os");
const { Midi } = require(path.join(__dirname, "..", "lib", "Midi.js"));
const ROOT = process.argv[2] || path.join(__dirname, "..");

let pass = 0, fail = 0;
const chk = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && x !== undefined ? "  <- " + JSON.stringify(x).slice(0, 300) : "")); };

// Für Elise bars 20-25 as a two-track file has them (hand:note@sixteenth[:length])
const ELISE = `R:E4@0 R:D5@1 R:C5@2 L:E2@3 R:B4@3:2 L:E3@4 L:E4@5 R:E4@6 R:E5@7 L:E4@8 L:E5@9 R:E5@10 R:E6@11
  L:D#5@12 L:E5@13 R:D#5@14 R:E5@15:2 L:D#5@16 L:E5@17 R:D#5@18 R:E5@19 R:D#5@20 R:E5@21 R:D#5@22 R:E5@23
  R:B4@24 R:D5@25 R:C5@26 L:A2@27 R:A4@27:2`;
function buildMidi(file) {
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }, S = 60 / 72 / 4;
  const m = new Midi(); m.header.setTempo(72);
  const rh = m.addTrack(), lh = m.addTrack(); rh.name = "Piano"; lh.name = "Piano";
  for (let rep = 0; rep < 2; rep++) for (const tok of ELISE.trim().split(/\s+/)) {
    const [, h, st, sh, oc, at, len] = /^([RL]):([A-G])(#?)(\d)@(\d+)(?::(\d+))?$/.exec(tok);
    (h === "R" ? rh : lh).addNote({ midi: 12 * (+oc + 1) + PC[st] + (sh ? 1 : 0), time: (rep * 30 + +at) * S, duration: (+(len || 1) - 0.06) * S });
  }
  fs.writeFileSync(file, Buffer.from(m.toArray()));
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pt-r11-"));
  const mid = path.join(tmp, "elise-passage.mid");
  buildMidi(mid);
  const { pg, logs, close } = await open(ROOT, "?debug");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = () => pg.evaluate(() => { const s = PT.__app.song; return { format: s.format, lhHigh: s.notes.filter((n) => n.staff >= 1 && n.midi >= 72).length,
    untangled: s.untangled || null, status: document.getElementById("status").textContent }; });
  const reopen = async () => { await pg.reload({ waitUntil: "networkidle2" }); await pg.waitForFunction("window.PT && PT.__app && PT.__app.song", { timeout: 20000 }); await wait(2500); };

  console.log("\nThe MIDI file");
  const inp = await pg.$("#fileInput");
  await inp.uploadFile(mid); await wait(1500);
  const a = await state();
  chk("the left-hand track's D#5/E5 in the right hand's line are played by the right hand", a.format === "midi" && a.lhHigh === 0 && a.untangled && a.untangled.moved > 0, a);
  chk("  ...and the load message says so", /in the other hand's register given to that hand/.test(a.status), a.status);

  console.log("\nA conversion saved before the repair");
  await pg.evaluate(() => { PT.parser.untangleHands = () => ({ moved: 0 }); });        // the app as it was
  await inp.uploadFile(mid); await wait(1500);
  await pg.evaluate(() => document.getElementById("btnConvertSheet").click()); await wait(3500);
  const b = await state();
  chk("(set up: converted the old way, the notes are on the left-hand staff)", b.format === "musicxml" && b.lhHigh > 0, b);
  await reopen();
  const c = await state();
  chk("reopened, it is repaired: no left-hand note left in the right hand's line", c.format === "musicxml" && c.lhHigh === 0, c);
  chk("  ...the score redrawn, and the message says so", c.untangled && c.untangled.redrawn && /score redrawn/.test(c.status), c);
  const staffOk = await pg.evaluate(() => { const s = PT.__app.song; return s.notes.filter((n) => n.midi >= 72).every((n) => n.staff === 0); });
  chk("  ...the redrawn score has those notes on the upper staff", staffOk);
  await reopen();
  const d = await state();
  chk("reopened again: the redrawn score was saved, nothing left to repair", d.format === "musicxml" && d.lhHigh === 0 && !d.untangled, d);

  console.log("\nA fresh conversion, and a real score");
  await (await pg.$("#fileInput")).uploadFile(mid); await wait(1500);          // (the page was reloaded)
  await pg.evaluate(() => document.getElementById("btnConvertSheet").click()); await wait(3500);
  const mark = await pg.evaluate(() => PT.midiToXML.conversionOf(PT.midiToXML.midiToMusicXML(PT.__app.song, { grid: 16 }), "piece-1"));
  chk("a fresh conversion carries the app's mark (a downloaded copy is known)", mark && mark.grid === 16, mark);
  await pg.evaluate(() => { const s = document.getElementById("sampleList"); s.value = "minuetG"; s.dispatchEvent(new Event("change")); }); await wait(2000);
  const e = await pg.evaluate(() => ({ conv: PT.midiToXML.conversionOf("<score-partwise/>", "sample-minuetG"), untangled: PT.__app.song.untangled || null }));
  chk("a real score is not one of the app's conversions and is left as written", e.conv === null && e.untangled === null, e);

  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  chk("no page errors", errs.length === 0, errs);
  await close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
