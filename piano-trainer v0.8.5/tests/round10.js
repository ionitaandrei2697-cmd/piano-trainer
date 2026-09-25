/* Reported after round 3, with a real file (a two-track pop arrangement at 120 BPM):
 *  - after "Convert to sheet music" the page stayed white until a reload: the
 *    score was drawn while its panel was still hidden (0 px wide);
 *  - some falling notes had no finger number: the disc was only drawn on notes
 *    tall and wide enough for a full-size one (sixteenths, black-key lanes);
 *  - the two hand-move marks had no legend.
 * The file is rebuilt here with the same structure (eighths with pairs of
 * sixteenths on one key, a left hand of octaves), not the original.
 * (Repeated-note fingering in that passage is checked in tests/fingervariants.js.)
 * Run: node tests/round10.js */
const { open } = require("./harness");
const path = require("path"), fs = require("fs"), os = require("os");
const { Midi } = require(path.join(__dirname, "..", "lib", "Midi.js"));
const ROOT = process.argv[2] || path.join(__dirname, "..");

let pass = 0, fail = 0;
const chk = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && x !== undefined ? "  <- " + JSON.stringify(x).slice(0, 300) : "")); };

function buildMidi(file) {
  const m = new Midi(); m.header.setTempo(120);
  const rh = m.addTrack(), lh = m.addTrack();
  const q = 0.5, e = 0.25, s = 0.125;
  let t = 0;
  for (let bar = 0; bar < 16; bar++) {
    // E E E-E E E-E A E  (eighths, pairs of sixteenths, one leap)
    const pat = [[e, 64], [e, 64], [s, 64], [s, 64], [e, 64], [s, 64], [s, 64], [e, 69], [e, 64], [e + q, null]];
    let u = t + e;
    for (const [d, p] of pat) { if (p) rh.addNote({ midi: p, time: u, duration: d * 0.9 }); u += d; }
    for (const [dt, p] of [[0, 40], [e, 40]]) { lh.addNote({ midi: p, time: t + dt, duration: e * 0.9 }); lh.addNote({ midi: p + 12, time: t + dt, duration: e * 0.9 }); }
    t += 4 * q;
  }
  // a C major scale up two octaves: the thumb has to pass under
  [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84].forEach((p, i) => rh.addNote({ midi: p, time: t + i * e, duration: e * 0.9 }));
  fs.writeFileSync(file, Buffer.from(m.toArray()));
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pt-r10-"));
  const mid = path.join(tmp, "again-like.mid");
  buildMidi(mid);
  const { pg, logs, close } = await open(ROOT, "?debug");
  const svgW = () => pg.evaluate(() => { const s = document.querySelector("#sheetContainer svg"); return s ? Math.round(s.getBoundingClientRect().width) : -1; });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  console.log("\nThe page after Convert to sheet music");
  const inp = await pg.$("#fileInput");
  await inp.uploadFile(mid); await wait(1500);
  await pg.evaluate(() => document.getElementById("btnConvertSheet").click()); await wait(3500);
  const w1 = await svgW();
  chk("the converted score is drawn at the panel's width (was 0 px: a white page)", w1 > 300, w1);
  await pg.evaluate(() => { const t = document.getElementById("toggleSheet"); t.checked = false; t.dispatchEvent(new Event("change")); });
  await pg.evaluate(() => { const s = document.getElementById("sampleList"); s.value = "minuetG"; s.dispatchEvent(new Event("change")); }); await wait(1500);
  const pending = await pg.evaluate(() => PT.__app.sheet.pendingRender);
  await pg.evaluate(() => { const t = document.getElementById("toggleSheet"); t.checked = true; t.dispatchEvent(new Event("change")); }); await wait(1500);
  const w2 = await svgW(), mapped = await pg.evaluate(() => PT.__app.sheet._noteEls.size);
  chk("a score opened while the Score panel is off is drawn when the panel comes back", pending === true && w2 > 300 && mapped > 0, { pending, w2, mapped });

  console.log("\nFinger numbers on the falling notes");
  await inp.uploadFile(mid); await wait(1500);
  for (const vw of [1440, 1024]) {
    await pg.setViewport({ width: vw, height: vw === 1440 ? 900 : 768, deviceScaleFactor: 1 }); await wait(700);
    const r = await pg.evaluate(() => {
      const A = PT.__app, roll = A.roll, pos = 4.0;
      A.transport.seek(pos);
      // count the digits the roll draws in one frame, against the practised notes in view
      const ctx = roll.ctx, orig = ctx.fillText; let digits = 0;
      ctx.fillText = function (t, ...rest) { if (/^[1-5]$/.test(String(t))) digits++; return orig.call(this, t, ...rest); };
      roll.render(pos);
      ctx.fillText = orig;
      const lead = roll.canvas.height / (window.devicePixelRatio || 1) / roll.pxPerSec;
      const inView = A.song.notes.filter((n) => !n.backing && n.finger && n.startSec - pos <= lead && n.startSec + n.durSec >= pos - 0.2).length;
      return { digits, inView, pxPerSec: roll.pxPerSec };
    });
    chk(`every practised note in view shows its finger at ${vw} px (${r.digits} numbers for ${r.inView} notes)`, r.digits >= r.inView && r.inView > 10, r);
  }

  console.log("\nThe hand-move legend");
  const lg = await pg.evaluate(() => ({ shown: !document.getElementById("rollLegend").classList.contains("is-hidden"),
    marks: [...document.querySelectorAll("#rollLegend [data-mark]:not(.is-hidden)")].map((e) => e.dataset.mark) }));
  chk("the legend names the marks this piece has (a scale: the thumb passes)", lg.shown && lg.marks.includes("pass") && !lg.marks.includes("wide"), lg);
  await pg.evaluate(() => { const t = document.getElementById("toggleMoves"); t.checked = false; t.dispatchEvent(new Event("change")); });
  const off = await pg.evaluate(() => document.getElementById("rollLegend").classList.contains("is-hidden"));
  chk("  ...and goes with the marks when Hand moves is off", off);

  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  chk("no uncaught errors", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  await close();
  process.exit(fail ? 1 : 0);
})();
