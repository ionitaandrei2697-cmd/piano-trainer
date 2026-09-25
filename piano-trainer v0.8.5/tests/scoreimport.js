/* Score import: the causes of "given music sheet was incomplete or could not be
 * loaded", each built from the bundled samples and opened through the app's own
 * file input. Every file must open WITH notation and with all of its notes.
 *   encodings   UTF-16 LE/BE with and without a BOM, Latin-1, UTF-8 BOM, no declaration
 *   containers  .mxl with single-quoted container.xml, UTF-16 inside .mxl,
 *               a zip saved as .xml, a MIDI file saved as .musicxml, an HTML page
 *   structure   part id not in the part list, empty part, empty part list,
 *               a part shorter than the others (the engine used to stop there)
 *   content     chord mark on a rest / first note, pitch step "H", missing octave,
 *               zero-length notes, time signature "a/b", an 8va that never ends, score-timewise
 *   parts       voice + piano: the piano is practised, the voice is backing
 *   ornaments   grace notes are heard but never required
 *   fallback    a score the engine refuses still opens, as notes only
 * Run: node tests/scoreimport.js   (CHROME_PATH=... if puppeteer has no Chrome) */
const { open } = require("./harness");
const path = require("path"), fs = require("fs"), os = require("os"), zlib = require("zlib");
const ROOT = process.argv[2] || path.join(__dirname, "..");

function crc32(buf) { let c, crc = 0xFFFFFFFF; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xFF; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const locals = [], centrals = []; let off = 0;
  for (const f of files) {
    const comp = zlib.deflateRawSync(f.data), nm = Buffer.from(f.name), crc = crc32(f.data);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(f.data.length, 22); lh.writeUInt16LE(nm.length, 26);
    locals.push(lh, nm, comp);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(f.data.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(off, 42);
    centrals.push(ch, nm); off += 30 + nm.length + comp.length;
  }
  const cd = Buffer.concat(centrals), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}
const u16le = (s) => Buffer.from(s, "utf16le");
const u16be = (s) => { const b = Buffer.from(s, "utf16le"); for (let i = 0; i < b.length; i += 2) { const t = b[i]; b[i] = b[i + 1]; b[i + 1] = t; } return b; };

let pass = 0, fail = 0;
const chk = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? "  PASS  " : "  FAIL  ") + n + (!ok && x !== undefined ? "  <- " + JSON.stringify(x).slice(0, 300) : "")); };

(async () => {
  const { pg, logs, close } = await open(ROOT, "?debug");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pt-import-"));
  const ode = await pg.evaluate(() => PT.samples.odeToJoy.xml);
  const ODE_NOTES = 46;

  // a mutation of Ode to Joy, done with the browser's own DOM
  const mutate = (fnSrc) => pg.evaluate((xml, src) => {
    const d = new DOMParser().parseFromString(xml, "application/xml");
    const all = (s) => [...d.querySelectorAll(s)];
    (new Function("d", "all", src))(d, all);
    const s = new XMLSerializer().serializeToString(d);
    return s.startsWith("<?xml") ? s : '<?xml version="1.0" encoding="UTF-8"?>\n' + s;
  }, ode, fnSrc);

  async function load(name, buf) {
    const f = path.join(tmp, name);
    fs.writeFileSync(f, buf);
    await pg.evaluate(() => { document.getElementById("status").textContent = "__"; });
    const inp = await pg.$("#fileInput");
    await inp.uploadFile(f);
    await pg.waitForFunction(() => { const t = document.getElementById("status").textContent; return t !== "__" && !/^(Parsing|Unzipping)/.test(t); }, { timeout: 30000 });
    return pg.evaluate(() => {
      const A = PT.__app, s = A.song;
      return { status: document.getElementById("status").textContent, sheet: !!(s && s.hasSheet && A.sheet.loaded),
               format: s && s.format, notes: s ? s.notes.filter((n) => !n.backing).length : 0,
               backing: s ? s.notes.filter((n) => n.backing && !n.ornament).length : 0,
               ornaments: s ? s.notes.filter((n) => n.ornament).length : 0,
               parts: s && s.scoreParts ? s.scoreParts.map((p) => p.name + ":" + p.part) : null };
    });
  }
  const opensWithAll = async (label, name, buf) => {
    const r = await load(name, buf);
    chk(label, r.sheet && r.notes === ODE_NOTES, r);
    return r;
  };

  console.log("\nEncodings");
  const decl16 = ode.replace(/encoding="UTF-8"/i, 'encoding="UTF-16"');
  await opensWithAll("UTF-16 LE with BOM (.xml)", "u16le.xml", Buffer.concat([Buffer.from([0xff, 0xfe]), u16le(decl16)]));
  await opensWithAll("UTF-16 BE with BOM (.musicxml)", "u16be.musicxml", Buffer.concat([Buffer.from([0xfe, 0xff]), u16be(decl16)]));
  await opensWithAll("UTF-16 LE without a BOM", "u16nobom.xml", u16le(decl16));
  await opensWithAll("UTF-8 with a BOM", "u8bom.xml", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(ode)]));
  const lat = ode.replace(/encoding="UTF-8"/i, 'encoding="ISO-8859-1"').replace(/<work-title>[^<]*<\/work-title>/, "<work-title>Für Élise</work-title>");
  const r1 = await opensWithAll("Latin-1, declared", "latin1.xml", Buffer.from(lat, "latin1"));
  chk("  ...and its accented title survives", /Für Élise/.test(await pg.evaluate(() => document.getElementById("title").textContent)), r1.status);
  await opensWithAll("no XML declaration, a comment first", "nodecl.xml", Buffer.from("<!-- exported -->\n" + ode.replace(/^<\?xml[^>]*>\s*/, "")));

  console.log("\nContainers");
  const container = "<?xml version='1.0' encoding='UTF-8'?>\n<container><rootfiles><rootfile full-path='score.xml' media-type='application/vnd.recordare.musicxml+xml'/></rootfiles></container>";
  await opensWithAll(".mxl with a single-quoted container.xml", "q.mxl", zip([{ name: "META-INF/container.xml", data: Buffer.from(container) }, { name: "score.xml", data: Buffer.from(ode) }]));
  await opensWithAll(".mxl holding UTF-16 (Finale)", "u16.mxl", zip([{ name: "META-INF/container.xml", data: Buffer.from(container) }, { name: "score.xml", data: Buffer.concat([Buffer.from([0xff, 0xfe]), u16le(decl16)]) }]));
  await opensWithAll("a zipped score saved as .xml", "zipped.xml", zip([{ name: "META-INF/container.xml", data: Buffer.from(container) }, { name: "score.xml", data: Buffer.from(ode) }]));
  const midi = await load("really-midi.musicxml", fs.readFileSync(path.join(__dirname, "fixtures", "lowpiano.mid")));
  chk("a MIDI file saved as .musicxml opens as MIDI", midi.format === "midi" && midi.notes > 0, midi);
  const html = await load("page.xml", Buffer.from("<!DOCTYPE html><html><body>Not found</body></html>"));
  chk("an HTML page gets a clear message, not the engine's", /web page/.test(html.status) && !/incomplete/.test(html.status), html.status);

  console.log("\nStructure (each used to give “given music sheet was incomplete”)");
  await opensWithAll("a part whose id isn't in the part list", "idmismatch.xml", Buffer.from(await mutate(`all("part")[0].setAttribute("id","PX");`)));
  await opensWithAll("an empty part", "emptypart.xml", Buffer.from(await mutate(`const pl=d.querySelector("part-list"); const sp=d.createElement("score-part"); sp.setAttribute("id","P9"); sp.innerHTML="<part-name>X</part-name>"; pl.appendChild(sp); const p=d.createElement("part"); p.setAttribute("id","P9"); d.documentElement.appendChild(p);`)));
  await opensWithAll("an empty part list", "emptylist.xml", Buffer.from(await mutate(`d.querySelector("part-list").innerHTML="";`)));
  await opensWithAll("a part missing from the part list, one bar long", "undeclared.xml", Buffer.from(await mutate(`const p=d.createElement("part"); p.setAttribute("id","P9"); p.innerHTML='<measure number="1"><note><rest/><duration>4</duration></note></measure>'; d.documentElement.appendChild(p);`)));
  await opensWithAll("a part shorter than the others keeps every note", "short.xml", Buffer.from(await mutate(`const pl=d.querySelector("part-list"); const sp=d.createElement("score-part"); sp.setAttribute("id","P9"); sp.innerHTML="<part-name>X</part-name>"; pl.appendChild(sp); const p=d.createElement("part"); p.setAttribute("id","P9"); p.innerHTML='<measure number="1"><attributes><divisions>1</divisions><clef><sign>G</sign><line>2</line></clef></attributes><note><rest/><duration>4</duration></note></measure>'; d.documentElement.appendChild(p);`)));

  console.log("\nContent that crashed the reader or the renderer");
  await opensWithAll("<chord/> on a note right after <backup>", "chordbackup.xml", Buffer.from(await mutate(`const m=all("measure")[1]; const b=m.querySelector("backup"); const n=b&&b.nextElementSibling; if(n) n.insertBefore(d.createElement("chord"), n.firstChild);`)));
  const hstep = await load("hstep.xml", Buffer.from(await mutate(`all("pitch step")[3].textContent="H";`)));
  chk("pitch step “H” (German B)", hstep.sheet && hstep.notes === ODE_NOTES, hstep);
  await opensWithAll("a missing octave", "nooct.xml", Buffer.from(await mutate(`all("pitch octave")[3].remove();`)));
  await opensWithAll("notes with a duration of 0", "zerodur.xml", Buffer.from(await mutate(`all("note duration").slice(3,6).forEach(e=>e.textContent="0");`)));
  await opensWithAll("time signature “a/b”", "badtime.xml", Buffer.from(await mutate(`const t=d.querySelector("time"); t.innerHTML="<beats>a</beats><beat-type>b</beat-type>";`)));
  await opensWithAll("an 8va that never ends", "8va.xml", Buffer.from(await mutate(`const m=all("measure")[1]; const dir=d.createElement("direction"); dir.innerHTML='<direction-type><octave-shift type="down" size="8"/></direction-type>'; m.insertBefore(dir,m.querySelector("note"));`)));
  const tw = await pg.evaluate((xml) => {
    const d = new DOMParser().parseFromString(xml, "application/xml"), pw = d.documentElement, t = d.createElement("score-timewise");
    for (const c of [...pw.children]) if (c.tagName !== "part") t.appendChild(c.cloneNode(true));
    const parts = [...pw.children].filter((c) => c.tagName === "part"), n = parts[0].querySelectorAll(":scope > measure").length;
    for (let i = 0; i < n; i++) { const m = d.createElement("measure"); m.setAttribute("number", String(i + 1));
      for (const p of parts) { const pm = p.querySelectorAll(":scope > measure")[i], pe = d.createElement("part"); pe.setAttribute("id", p.getAttribute("id")); for (const c of [...pm.children]) pe.appendChild(c.cloneNode(true)); m.appendChild(pe); }
      t.appendChild(m); }
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(t);
  }, ode);
  await opensWithAll("score-timewise", "timewise.xml", Buffer.from(tw));

  console.log("\nParts and ornaments");
  const vp = await mutate(`
    const pl=d.querySelector("part-list"); const sp=d.createElement("score-part"); sp.setAttribute("id","PV"); sp.innerHTML="<part-name>Voice</part-name>";
    pl.insertBefore(sp, pl.firstChild);
    const p=d.createElement("part"); p.setAttribute("id","PV");
    const ms=all("part")[0].querySelectorAll(":scope > measure");
    ms.forEach((m,i)=>{ const x=d.createElement("measure"); x.setAttribute("number",String(i+1));
      x.innerHTML=(i===0?'<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+'<note><pitch><step>A</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>whole</type></note>';
      p.appendChild(x); });
    d.documentElement.insertBefore(p, all("part")[0]);`);
  const vr = await load("voice-piano.xml", Buffer.from(vp));
  chk("voice + piano: the piano is practised, both hands", vr.sheet && vr.notes === ODE_NOTES && vr.parts && vr.parts.join() === "Voice:backing,Piano:practice", vr);
  chk("  ...and the voice line plays along as backing", vr.backing === 8, vr);
  const gr = await load("grace.xml", Buffer.from(await mutate(`const n=all("note").find(x=>x.querySelector("pitch")); const g=n.cloneNode(true); g.querySelector("duration").remove(); g.insertBefore(d.createElement("grace"), g.firstChild); g.querySelector("step").textContent="F"; n.parentNode.insertBefore(g,n);`)));
  chk("a grace note is an ornament, not a required note", gr.sheet && gr.notes === ODE_NOTES && gr.ornaments === 1, gr);
  const graceWrong = await pg.evaluate(async () => {
    document.getElementById("modeWait").click();
    await new Promise((r) => setTimeout(r, 400));
    const A = PT.__app, orn = A.song.notes.find((n) => n.ornament);
    const before = A.practice.score.wrong;
    const res = A.practice.noteOn(orn.midi);
    A.practice.noteOff(orn.midi);
    document.getElementById("modeListen").click();
    return { res, wrongAdded: A.practice.score.wrong - before };
  });
  chk("  ...and playing it in Wait is not counted wrong", graceWrong.res === "ignored" && graceWrong.wrongAdded === 0, graceWrong);

  console.log("\nLast resort");
  const fb = await pg.evaluate(async (xml) => {
    const A = PT.__app, real = A.sheet.loadXML.bind(A.sheet);
    A.sheet.loadXML = async () => { throw new Error("simulated engine failure"); };
    const f = new File([xml], "refused.musicxml");
    const dt = new DataTransfer(); dt.items.add(f);
    const inp = document.getElementById("fileInput"); inp.files = dt.files;
    document.getElementById("status").textContent = "__";
    inp.dispatchEvent(new Event("change"));
    await new Promise((r) => { const t0 = Date.now(); (function w() { const s = document.getElementById("status").textContent; if ((s !== "__" && !/^Parsing/.test(s)) || Date.now() - t0 > 15000) r(); else setTimeout(w, 50); })(); });
    A.sheet.loadXML = real;
    const s = A.song;
    return { status: document.getElementById("status").textContent, hasSheet: s.hasSheet, notes: s.notes.filter((n) => !n.backing).length,
             bars: s.bars.length, noSheetShown: !document.getElementById("noSheet").classList.contains("is-hidden"),
             button: document.getElementById("btnConvertSheet").textContent };
  }, ode);
  chk("a score the engine refuses opens as notes only, all notes, with its bars", !fb.hasSheet && fb.notes === ODE_NOTES && fb.bars >= 8 && /notes only/.test(fb.status), fb);
  chk("  ...and offers to make a simple score from them", fb.noSheetShown && /simple score/i.test(fb.button), fb);

  const errs = logs.filter((l) => /PAGEERROR/.test(l));
  chk("no uncaught errors", errs.length === 0, errs);
  console.log(`\n${pass} passed, ${fail} failed`);
  fs.rmSync(tmp, { recursive: true, force: true });
  await close();
  process.exit(fail ? 1 : 0);
})();
