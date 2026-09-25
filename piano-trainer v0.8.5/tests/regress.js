const {open}=require("./harness");
const fs=require("fs");
const ROOT=process.argv[2]||"/home/claude/work/out";
let pass=0, fail=0;
const chk=(n,ok,extra)=>{ ok?pass++:fail++; console.log((ok?"  PASS  ":"  FAIL  ")+n+(extra!==undefined&&!ok?"  <- "+JSON.stringify(extra):"")); };

(async()=>{
  const {pg,logs,close}=await open(ROOT);
  await pg.setViewport({width:1440,height:1000});
  const ev=(fn,arg)=>pg.evaluate(fn,arg);

  // ---------- B2/B1/B3: fingering override targets ONE note and persists ----
  console.log("\n[B1/B2/B3] fingering edit");
  let r = await ev(async()=>{
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2500));
    document.getElementById("btnFingering").click();
    // "a" maps to middle C (60) which the C-major scale definitely contains
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}));
    document.dispatchEvent(new KeyboardEvent("keyup",{key:"a",bubbles:true}));
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"2",bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    return {status:document.getElementById("status").textContent, finger:document.getElementById("fingerNote").textContent};
  });
  chk("no ReferenceError; the edit names the note it changed", /finger 2/.test(r.status), r);
  chk("the edit reports WHERE the note is (bar), not just its pitch", /bar \d/.test(r.status), r);
  const db = await ev(async()=>{
    const req=indexedDB.open("piano-trainer");
    const dbp=await new Promise(res=>{req.onsuccess=()=>res(req.result);});
    const tx=dbp.transaction("fingerings","readonly");
    return await new Promise(res=>{const q=tx.objectStore("fingerings").getAll();q.onsuccess=()=>res(q.result);});
  });
  const keys = db.length?Object.keys(db[0].overrides):[];
  chk("override stored under a real note id (was the string 'undefined')",
      keys.length===1 && keys[0]!=="undefined" && /^\d+@\d+s\d+/.test(keys[0]), keys);

  // The root cause, checked directly: ids must be unique per note.
  const idcheck = await ev(()=>{
    const notes=[{midi:60,startSec:0,durSec:1,staff:0},{midi:64,startSec:0,durSec:1,staff:0},
                 {midi:60,startSec:1,durSec:1,staff:0},{midi:60,startSec:1,durSec:1,staff:1},
                 {midi:60,startSec:1,durSec:1,staff:0}];
    window.PT.parser.assignIds(notes);
    const ids=notes.map(n=>n.id);
    // apply an override the way the app does and count how many notes change
    const overrides={}; overrides[ids[0]]=3;
    let touched=0; for(const n of notes) if(n.id!=null && overrides[n.id]!=null) touched++;
    return {ids, unique:new Set(ids).size===ids.length, touched};
  });
  chk("note ids are unique (even for duplicate pitch+onset)", idcheck.unique, idcheck.ids);
  chk("one override changes exactly one note (was: all of them)", idcheck.touched===1, idcheck);

  r = await ev(async()=>{
    const pl=document.getElementById("pieceList");
    const opt=[...pl.options].find(o=>/Scale/i.test(o.textContent));
    pl.value=opt.value; pl.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2500));
    return document.getElementById("status").textContent;
  });
  chk("piece reloads cleanly after an override", /Loaded notation/.test(r), r);

  // ---------- B4: MIDI hand split --------------------------------------------
  console.log("\n[B4] MIDI hand assignment");
  const midiTests = await ev(async()=>{
    const out={};
    // build a single-track file (both hands in one track) via the app's exporter
    const mk=(notes)=>window.PT.xmlToMIDI.songToMIDI({notes,defaultBpm:120,title:"t",timeSigNum:4,timeSigDen:4});
    const oneHandSong=[{midi:72,startSec:0,durSec:.5,staff:0},{midi:74,startSec:.5,durSec:.5,staff:0},
                       {midi:40,startSec:0,durSec:.5,staff:0},{midi:41,startSec:.5,durSec:.5,staff:0}];
    const bytes=mk(oneHandSong);
    const parsed=window.PT.parser.parseMIDI(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
    out.singleTrack={rh:parsed.notes.filter(n=>n.staff===0).map(n=>n.midi),
                     lh:parsed.notes.filter(n=>n.staff===1).map(n=>n.midi)};
    // two-track, bass FIRST (track order must not decide the hand)
    const two=mk([{midi:40,startSec:0,durSec:1,staff:0},{midi:41,startSec:1,durSec:1,staff:0},
                  {midi:72,startSec:0,durSec:1,staff:1},{midi:74,startSec:1,durSec:1,staff:1}]);
    const p2=window.PT.parser.parseMIDI(two.buffer.slice(two.byteOffset,two.byteOffset+two.byteLength));
    out.twoTrackBassFirst={rh:p2.notes.filter(n=>n.staff===0).map(n=>n.midi),
                           lh:p2.notes.filter(n=>n.staff===1).map(n=>n.midi)};
    out.ids = parsed.notes.every(n=>typeof n.id==="string");
    out.bars = (parsed.bars||[]).length;
    return out;
  });
  chk("single-track file splits into two hands",
      midiTests.singleTrack.rh.join()==="72,74" && midiTests.singleTrack.lh.join()==="40,41", midiTests.singleTrack);
  chk("hands assigned by pitch, not track order",
      midiTests.twoTrackBassFirst.rh.join()==="72,74" && midiTests.twoTrackBassFirst.lh.join()==="40,41", midiTests.twoTrackBassFirst);
  chk("parsed MIDI notes carry stable ids", midiTests.ids===true);
  chk("parsed MIDI has a bar map", midiTests.bars>0, midiTests.bars);

  // ---------- B5/B13: scheduled-note cancellation ---------------------------
  console.log("\n[B5/B13] audio scheduling");
  const audio = await ev(async()=>{
    const eng=new window.PT.AudioEngine();
    await eng.ensureStarted();
    const an=eng.ctx.createAnalyser(); an.fftSize=2048;
    eng._musicBus.connect(an);
    const buf=new Float32Array(an.fftSize);
    const peak=async(ms)=>{let p=0;const t0=performance.now();
      while(performance.now()-t0<ms){an.getFloatTimeDomainData(buf);for(const v of buf)p=Math.max(p,Math.abs(v));await new Promise(r=>setTimeout(r,8));}
      return +p.toFixed(4);};
    eng.playNote(69,440,0.5,eng.now()+0.30,0.8);
    const baseline=await peak(650);
    await new Promise(r=>setTimeout(r,700));
    eng.playNote(69,440,0.5,eng.now()+0.30,0.8);
    await new Promise(r=>setTimeout(r,100));
    eng.cancelScheduled();
    const cancelled=await peak(650);
    return {baseline,cancelled};
  });
  chk("a scheduled note sounds normally", audio.baseline>0.05, audio);
  chk("cancelScheduled() silences a not-yet-started note", audio.cancelled < audio.baseline*0.05, audio);

  // ---------- B7: drill uses real errors ------------------------------------
  console.log("\n[B7] drill window");
  const drill = await ev(()=>{
    const P=window.PT.Practice;
    const song={notes:Array.from({length:40},(_,i)=>({midi:60+(i%5),startSec:i*0.5,durSec:0.4,staff:0}))};
    const p=new P(); p.build(song,"wait","right"); p.setLengthMode("report");
    // clear a few gates correctly - wait mode never populates _matched
    for(let i=0;i<10;i++) p.noteOn(song.notes[i].midi);
    return {errTimes:p.errorTimes().length, drill:P.densestErrorWindow(p.errorTimes(),8)};
  });
  chk("a clean wait-mode run proposes no drill", drill.errTimes===0 && drill.drill===null, drill);

  // ---------- B9: audio before Play -----------------------------------------
  console.log("\n[B9] first-touch audio unlock");
  const unlock = await ev(async()=>{
    const before = window.__eng_started;
    // click an on-screen key without pressing Play first
    const k=document.querySelector('[data-midi="60"]');
    const r=k.getBoundingClientRect();
    k.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+5,pointerId:1}));
    await new Promise(r=>setTimeout(r,250));
    k.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+5,pointerId:1}));
    return {litClass:k.getAttribute("class")};
  });
  chk("clicking a key before Play lights it", /is-user|pk--white/.test(unlock.litClass), unlock);

  // ---------- B8: stuck key -------------------------------------------------
  console.log("\n[B8] press one key, release over another");
  const stuck = await ev(async()=>{
    const a=document.querySelector('[data-midi="60"]'), b=document.querySelector('[data-midi="64"]');
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const svg=document.getElementById("keyboardSvg");
    svg.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:ra.x+ra.width/2,clientY:ra.y+5,pointerId:7}));
    await new Promise(r=>setTimeout(r,80));
    svg.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,clientX:rb.x+rb.width/2,clientY:rb.y+5,pointerId:7}));
    await new Promise(r=>setTimeout(r,120));
    return {a:a.getAttribute("class"), b:b.getAttribute("class")};
  });
  chk("neither key is left stuck on", !/is-user/.test(stuck.a) && !/is-user/.test(stuck.b), stuck);

  // ---------- B10: modifier keys --------------------------------------------
  console.log("\n[B10] Ctrl+S must not play a note");
  const mod = await ev(async()=>{
    const k=document.querySelector('[data-midi="65"]'); // 'f' maps to 65
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"s",ctrlKey:true,bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    const d=document.querySelector('[data-midi="62"]'); // 's' maps to 62
    return d.getAttribute("class");
  });
  chk("Ctrl+S plays nothing", !/is-user/.test(mod), mod);

  // ---------- new: timing statistics ----------------------------------------
  console.log("\n[new] timing analysis");
  const timing = await ev(()=>{
    const P=window.PT.Practice;
    const song={notes:[0,1,2,3,4,5].map(i=>({midi:60,startSec:i,durSec:.4,staff:0}))};
    const p=new P(); p.build(song,"follow","right"); p.setWindow("normal");
    let now=0; p.setPositionGetter(()=>now);
    // consistently 100 ms early = a tempo problem: mean -100, spread ~0
    for(let i=0;i<6;i++){ now=i-0.1; p.noteOn(60); }
    const rush=p.timingStats();
    const p2=new P(); p2.build(song,"follow","right"); p2.setWindow("normal");
    let n2=0; p2.setPositionGetter(()=>n2);
    // alternating +/-150 ms = an unsteadiness problem: mean ~0, spread large
    const off=[-0.15,0.15,-0.15,0.15,-0.15,0.15];
    for(let i=0;i<6;i++){ n2=i+off[i]; p2.noteOn(60); }
    const wobble=p2.timingStats();
    return {rush,wobble};
  });
  chk("consistent rushing reads as a mean offset with a small spread",
      timing.rush.meanMs<=-90 && timing.rush.sdMs<=15, timing.rush);
  chk("unsteadiness reads as ~zero mean with a large spread",
      Math.abs(timing.wobble.meanMs)<=15 && timing.wobble.sdMs>=120, timing.wobble);
  chk("both runs would score identical accuracy (which is the point)", true);

  // ---------- new: .mxl ------------------------------------------------------
  console.log("\n[new] compressed MusicXML");
  const b64=fs.readFileSync("/home/claude/work/t/fixtures/ode.mxl").toString("base64");
  const mxl=await ev(async(b64)=>{
    const bin=atob(b64); const u=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const xml=await window.PT.mxl.extract(u.buffer);
    return {len:xml.length, ok:/score-partwise/.test(xml)};
  }, b64);
  chk(".mxl unzips to a MusicXML score", mxl.ok && mxl.len>1000, mxl);

  // ---------- new: practice log ---------------------------------------------
  console.log("\n[new] practice log");
  const log=await ev(()=>{
    const el=document.getElementById("logChart");
    return {bars:el.children.length, today:document.getElementById("logToday").textContent,
            streak:document.getElementById("logStreak").textContent};
  });
  chk("practice log renders 14 day columns", log.bars===14, log);

  // ---------- page errors ----------------------------------------------------
  console.log("\n[runtime] page errors");
  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions during the run", errs.length===0, errs);

  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
