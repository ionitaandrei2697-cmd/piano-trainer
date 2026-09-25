// Every user-facing control, exercised through the UI, with its effect checked.
const {open}=require("./harness");
const ROOT=process.argv[2]||"/home/claude/work/out";
(async()=>{
  const {pg,logs,close}=await open(ROOT,"?debug");
  await pg.setViewport({width:1440,height:900});
  const rows=[]; const row=(area,control,ok,note)=>rows.push({area,control,ok:!!ok,note:note||""});
  const E=(fn,...a)=>pg.evaluate(fn,...a);
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
  const load=(k,mode="modeListen")=>E(async(k,mode)=>{
    document.getElementById("btnStop").click();
    const s=document.getElementById("sampleList"); s.value=k; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    document.getElementById("handBoth").checked=true; document.getElementById("handBoth").dispatchEvent(new Event("change"));
    const m=document.getElementById(mode); m.checked=true; m.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,250));
  },k,mode);

  // ---------------- loading ----------------
  await load("minuetG");
  let r=await E(()=>({t:document.getElementById("title").textContent,n:window.PT.__app.song.notes.length}));
  row("Load","Samples dropdown", r.n===40 && /Minuet/.test(r.t), r.t);
  const inp=await pg.$("#fileInput");
  await inp.uploadFile("/home/claude/work/t/fixtures/sweep.mid"); await sleep(1500);
  r=await E(()=>({noSheet:!document.getElementById("noSheet").classList.contains("is-hidden"),
                  hands:[...new Set(window.PT.__app.song.notes.map(n=>n.staff))].sort().join(",")}));
  row("Load","Open file: .mid", r.noSheet, "no-sheet panel shown");
  row("Load","MIDI hands split", r.hands==="0,1", "staves "+r.hands);
  r=await E(async()=>{document.getElementById("btnConvertSheet").click(); await new Promise(r=>setTimeout(r,3000));
    return {sheet:!!document.querySelector("#sheetContainer svg g.vf-stavenote"), status:document.getElementById("status").textContent};});
  row("Load","Convert MIDI to sheet", r.sheet && /Converted/.test(r.status), r.status.slice(0,40));
  await inp.uploadFile("/home/claude/work/t/fixtures/ode.mxl"); await sleep(3000);
  r=await E(()=>document.getElementById("title").textContent);
  row("Load","Open file: .mxl", /Ode/.test(r), r);
  r=await E(async()=>{
    let captured=null; const orig=URL.createObjectURL;
    URL.createObjectURL=(b)=>{captured={size:b.size,type:b.type}; return "blob:x";};
    const oc=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){};
    document.getElementById("btnExportMidi").click();
    URL.createObjectURL=orig; HTMLAnchorElement.prototype.click=oc;
    return captured;});
  row("Load","Export MIDI", r && r.size>50 && r.type==="audio/midi", r?r.size+" bytes":"nothing produced");
  r=await E(async()=>{const pl=document.getElementById("pieceList");
    const before=[...pl.options].map(o=>o.textContent);
    const opt=[...pl.options].find(o=>/Ode/.test(o.textContent)); pl.value=opt.value; pl.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2500));
    const reopened=/Ode/.test(document.getElementById("title").textContent);
    window.confirm=()=>true; pl.value=opt.value; pl.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,2500));
    document.getElementById("btnDeletePiece").click(); await new Promise(r=>setTimeout(r,400));
    return {reopened, gone:![...pl.options].some(o=>o.value===opt.value), count:before.length};});
  row("Load","Saved pieces: reopen", r.reopened);
  row("Load","Saved pieces: Remove", r.gone);

  // ---------------- transport ----------------
  await load("minuetG");
  r=await E(async()=>{document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,1300));
    const T=window.PT.__app.transport;
    const t=T.position; document.getElementById("btnPause").click();
    const t2=T.position; await new Promise(r=>setTimeout(r,400));
    const t3=T.position;   // the scrubber lags one frame behind; read the clock itself
    document.getElementById("btnStop").click(); await new Promise(r=>setTimeout(r,100));
    return {moved:t>0.9, paused:Math.abs(t3-t2)<0.01, stopped:+document.getElementById("scrubber").value===0};});
  row("Transport","Play", r.moved); row("Transport","Pause", r.paused); row("Transport","Stop", r.stopped);
  r=await E(async()=>{const s=document.getElementById("scrubber"); s.value="5"; s.dispatchEvent(new Event("input")); s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,100)); return +window.PT.__app.transport.position.toFixed(2);});
  row("Transport","Position slider", r===5, r+" s");
  r=await E(async()=>{const t=document.getElementById("tempo"); t.value="0.5"; t.dispatchEvent(new Event("input"));
    const rate=window.PT.__app.transport.rate; t.value="1"; t.dispatchEvent(new Event("input")); return rate;});
  row("Transport","Tempo slider", r===0.5, "rate "+r);
  r=await E(()=>{const v=document.getElementById("volume"); v.value="0.3"; v.dispatchEvent(new Event("input"));
    const g=window.PT.__app.engine._musicBus.gain.value; v.value="0.8"; v.dispatchEvent(new Event("input")); return +g.toFixed(2);});
  row("Transport","Volume slider", r===0.3, "gain "+r);
  r=await E(()=>{const v=document.getElementById("clickVol"); v.value="0.2"; v.dispatchEvent(new Event("input"));
    return +window.PT.__app.engine._clickBus.gain.value.toFixed(2);});
  row("Transport","Click volume", r===0.2, "gain "+r);
  r=await E(()=>{const v=document.getElementById("noteSpeed"); v.value="200"; v.dispatchEvent(new Event("input"));
    const s=window.PT.__app.roll.pxPerSec; v.value="130"; v.dispatchEvent(new Event("input")); return s;});
  row("Transport","Falling-note speed", r===200, r+" px/s");

  // ---------------- metronome ----------------
  r=await E(async()=>{const eng=window.PT.__app.engine; let n=0; const orig=eng.clickAt.bind(eng); eng.clickAt=(w,a)=>{n++;orig(w,a);};
    const m=document.getElementById("toggleMetronome"); m.checked=true; m.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,1200)); document.getElementById("btnStop").click();
    const withClick=n; n=0; m.checked=false; m.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,800)); document.getElementById("btnStop").click();
    eng.clickAt=orig; return {withClick, without:n};});
  row("Metronome","Click on/off", r.withClick>=2 && r.without===0, r.withClick+" clicks on, "+r.without+" off");
  r=await E(async()=>{const c=document.getElementById("countInMode"); c.value="clicks"; c.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,250));
    const inCount=window.PT.__app.transport.inCountIn; const skipShown=!document.getElementById("btnSkipCountIn").classList.contains("is-hidden");
    document.getElementById("btnSkipCountIn").click(); await new Promise(r=>setTimeout(r,120));
    const after=window.PT.__app.transport.inCountIn; document.getElementById("btnStop").click();
    c.checked=false; c.dispatchEvent(new Event("change")); return {inCount,skipShown,after};});
  row("Metronome","Count-in", r.inCount); row("Metronome","Skip count-in", r.skipShown && !r.after);

  // ---------------- repeat ----------------
  r=await E(async()=>{document.getElementById("btnLoopBar").click(); await new Promise(r=>setTimeout(r,120));
    const l=window.PT.__app.transport.loop; document.getElementById("btnLoopClear").click();
    const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo"); f.value="2"; t.value="3"; t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,120)); const l2=window.PT.__app.transport.loop; const bars=window.PT.__app.song.bars;
    const ok2=l2 && Math.abs(l2.a-bars[1].startSec)<1e-6 && Math.abs(l2.b-bars[2].endSec)<1e-6;
    document.getElementById("btnLoopClear").click(); return {bar:!!l, range:ok2, off:!window.PT.__app.transport.loop};});
  row("Repeat","This bar", r.bar); row("Repeat","Bar range", r.range); row("Repeat","Off", r.off);
  r=await E(async()=>{const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo");
    f.value="1"; t.value="1"; t.dispatchEvent(new Event("change")); const T=window.PT.__app.transport;
    const tempo=document.getElementById("tempo"); tempo.value="1.5"; tempo.dispatchEvent(new Event("input"));
    document.getElementById("btnPlay").click(); const b=T.loop.b; let wrapped=false, maxPos=0;
    const t0=performance.now(); while(performance.now()-t0<2600){ const p=T.position; if(p>maxPos)maxPos=p; if(maxPos>0.3&&p<0.1)wrapped=true; await new Promise(r=>setTimeout(r,30)); }
    document.getElementById("btnStop").click(); document.getElementById("btnLoopClear").click();
    tempo.value="1"; tempo.dispatchEvent(new Event("input")); return {wrapped, neverPast:maxPos<=b+0.05};});
  row("Repeat","Wraps at the end of the range", r.wrapped && r.neverPast);

  // ---------------- modes ----------------
  await load("scale","modeWait");
  r=await E(async()=>{document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,300));
    const exp=[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi);
    document.getElementById("btnStop").click(); return exp;});
  row("Modes","Wait: highlights the key", r.join()==="60", JSON.stringify(r));
  await load("scale","modeFollow");
  r=await E(async()=>{document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,60));
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,320));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,80));
    document.getElementById("btnPause").click();
    return {c:document.getElementById("scoreCorrect").textContent, panel:!document.getElementById("scorePanel").classList.contains("is-hidden")};});
  row("Modes","Follow: scores a hit", r.c==="1" && r.panel, "correct "+r.c);
  r=await E(async()=>{const h=document.getElementById("handRight"); h.checked=true; h.dispatchEvent(new Event("change"));
    const n=window.PT.__app.practice.events.length; const l=document.getElementById("handLeft"); l.checked=true; l.dispatchEvent(new Event("change"));
    const n2=window.PT.__app.practice.events.length; const status=document.getElementById("status").textContent;
    const b=document.getElementById("handBoth"); b.checked=true; b.dispatchEvent(new Event("change")); return {n,n2,status};});
  row("Modes","Hand selector", r.n===8 && r.n2===0, "right "+r.n+" gates, left "+r.n2);
  row("Modes","Empty-hand warning", /no left-hand notes/.test(r.status));

  // ---------------- coach ----------------
  await load("scale","modeFollow");
  r=await E(async()=>{document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,4400));   // play nothing
    return {drill:!document.getElementById("btnDrill").classList.contains("is-hidden"), label:document.getElementById("btnDrill").textContent};});
  row("Coach","Drill offered after a rough run", r.drill, r.label);
  r=await E(async()=>{document.getElementById("btnDrill").click(); await new Promise(r=>setTimeout(r,150));
    const on=!!window.PT.__app.transport.loop; document.getElementById("btnLoopClear").click(); return on;});
  row("Coach","Drill sets a repeat", r);
  r=await E(async()=>{
    const A=window.PT.__app; const ramp=document.getElementById("toggleRamp"); ramp.checked=true; ramp.dispatchEvent(new Event("change"));
    const tempo=document.getElementById("tempo"); tempo.value="0.8"; tempo.dispatchEvent(new Event("input"));
    const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo"); f.value="1"; t.value="1"; t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnPlay").click();
    const codes=["KeyA","KeyS","KeyD","KeyF"]; const T=A.transport;
    for(let i=0;i<4;i++){ while(T.position < i*0.5-0.01) await new Promise(r=>setTimeout(r,5));
      document.dispatchEvent(new KeyboardEvent("keydown",{code:codes[i],bubbles:true}));
      await new Promise(r=>setTimeout(r,400));
      document.dispatchEvent(new KeyboardEvent("keyup",{code:codes[i],bubbles:true})); }
    await new Promise(r=>setTimeout(r,900));
    const rate=T.rate; document.getElementById("btnStop").click(); document.getElementById("btnLoopClear").click();
    ramp.checked=false; ramp.dispatchEvent(new Event("change")); tempo.value="1"; tempo.dispatchEvent(new Event("input"));
    return {rate, acc:document.getElementById("scoreAcc").textContent};});
  row("Coach","Auto tempo raises after a clean pass", Math.abs(r.rate-0.85)<0.001, "80% -> "+Math.round(r.rate*100)+"%");

  // ---------------- practice log ----------------
  await load("minuetG");
  r=await E(async()=>{const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo"); f.value="1"; t.value="2"; t.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,21500));
    document.getElementById("btnStop").click(); document.getElementById("btnLoopClear").click();
    const sw=document.getElementById("sampleList"); sw.value="scale"; sw.dispatchEvent(new Event("change"));   // ends the session
    await new Promise(r=>setTimeout(r,2600));
    return {records:window.PT.__app.plog.records.length, secs:(window.PT.__app.plog.records.at(-1)||{}).seconds};});
  row("Log","Session recorded after 21 s", r.records>=1 && r.secs>=20, (r.secs||0)+" s logged");

  // ---------------- settings ----------------
  r=await E(async()=>{document.getElementById("btnSettings").click(); await new Promise(r=>setTimeout(r,120));
    const open=document.getElementById("settingsDialog").open; document.getElementById("btnSettingsClose").click();
    return {open, closed:!document.getElementById("settingsDialog").open};});
  row("Settings","Open / close", r.open && r.closed);
  await load("minuetG");
  r=await E(async()=>{const t=(id,v)=>{const e=document.getElementById(id); e.checked=v; e.dispatchEvent(new Event("change"));};
    const hid=(id)=>document.getElementById(id).classList.contains("is-hidden");
    t("toggleSheet",false); t("toggleRoll",false); t("toggleKeyboard",false); await new Promise(r=>setTimeout(r,200));
    const off=[hid("sheetPanel"),hid("rollPanel"),hid("keyboardPanel")];
    t("toggleSheet",true); t("toggleRoll",true); t("toggleKeyboard",true); await new Promise(r=>setTimeout(r,300));
    const on=[hid("sheetPanel"),hid("rollPanel"),hid("keyboardPanel")];
    t("toggleLabels",true); await new Promise(r=>setTimeout(r,200)); const labels=document.querySelectorAll("#keyboardSvg text.pk-label").length;
    t("toggleLabels",false);
    t("toggleCursor",false); const curHidden=getComputedStyle(document.getElementById("cursorImg-0")).opacity==="0"; t("toggleCursor",true);
    t("toggleGrid",false); const grid=window.PT.__app.roll.showGrid; t("toggleGrid",true);
    return {off:off.every(Boolean), on:on.every(x=>!x), labels, curHidden, gridOff:grid===false};});
  row("Settings","Panels on/off", r.off && r.on); row("Settings","Note names", r.labels>40, r.labels+" labels");
  row("Settings","Cursor on/off", r.curHidden); row("Settings","Beat grid on/off", r.gridOff);
  r=await E(async()=>{const z=document.getElementById("zoom"); z.value="1.3"; z.dispatchEvent(new Event("input")); z.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,1200)); const manual=window.PT.__app.sheet.osmd.Zoom; const fitOff=!document.getElementById("toggleFit").checked;
    const f=document.getElementById("toggleFit"); f.checked=true; f.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,1200));
    return {manual, fitOff, fitted:window.PT.__app.sheet.fittedZoom};});
  row("Settings","Zoom slider", Math.abs(r.manual-1.3)<0.01 && r.fitOff, "zoom "+r.manual);
  row("Settings","Fit score", r.fitted>0.4, "fitted "+r.fitted);
  r=await E(async()=>{const s=document.getElementById("profileSize"); s.value="61"; s.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,200));
    const keys61=document.querySelectorAll("#keyboardSvg [data-midi]").length;
    const tr=document.getElementById("profileTranspose"); tr.value="12"; tr.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,200));
    const T=window.PT.__app.roll.transpose; s.value="88"; s.dispatchEvent(new Event("change")); tr.value="0"; tr.dispatchEvent(new Event("change"));
    return {keys61, T};});
  row("Settings","Keyboard size", r.keys61===61, r.keys61+" keys"); row("Settings","Transpose", r.T===12);
  r=await E(async()=>{const b=document.getElementById("profileBackend"); b.value="acoustic_grand_piano"; b.dispatchEvent(new Event("change"));
    for(let i=0;i<60;i++){ await new Promise(r=>setTimeout(r,200)); if(/loaded|failed/.test(document.getElementById("backendNote").textContent)) break; }
    const note=document.getElementById("backendNote").textContent, be=window.PT.__app.engine.backend;
    b.value="synth"; b.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,200)); return {note,be};});
  row("Settings","Sound: bundled grand piano", r.be==="sf" && /loaded/.test(r.note), r.note);
  r=await E(()=>{const mi=new window.PT.MidiInput(); const got=[];
    mi.onNoteOn=(n,v)=>got.push("on"+n+"@"+v.toFixed(2)); mi.onNoteOff=(n)=>got.push("off"+n); mi.onSustain=(d)=>got.push("ped"+(d?1:0));
    const send=(...b)=>mi._onMessage("x",{data:Uint8Array.from(b)});
    send(0x90,60,100); send(0x90,60,0); send(0x80,62,40); send(0xB0,64,127); send(0xB0,64,0); send(0x93,64,64);
    return got.join(" ");});
  row("MIDI","Message parsing (note-on/off, vel-0, pedal, any channel)", r==="on60@0.79 off60 off62 ped1 ped0 on64@0.50", r);

  // ---------------- report ----------------
  const w=[0,0,0,0].map((_,i)=>Math.max(...rows.map(x=>[x.area,x.control,x.ok?"ok":"FAIL",x.note][i].length)));
  for (const x of rows) console.log("  "+(x.ok?"ok  ":"FAIL")+"  "+x.area.padEnd(10)+x.control.padEnd(44)+x.note);
  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  console.log("\n"+rows.filter(x=>x.ok).length+"/"+rows.length+" controls working"+(errs.length?" | PAGE ERRORS: "+errs.join(" | "):" | no page errors"));
  await close(); process.exit(0);
})();
