const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open("/home/claude/work/out","?debug");
  await pg.setViewport({width:1440,height:900});
  let pass=0,fail=0;
  const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
  const E=(fn,...a)=>pg.evaluate(fn,...a);
  const load=(k,mode="modeListen",hand="handBoth")=>E(async(k,mode,hand)=>{
    document.getElementById("btnStop").click();
    const s=document.getElementById("sampleList"); s.value=k; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    const h=document.getElementById(hand); h.checked=true; h.dispatchEvent(new Event("change"));
    const m=document.getElementById(mode); m.checked=true; m.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,250));
  },k,mode,hand);

  console.log("[fixes]");
  await load("scale","modeFollow");
  let r=await E(async()=>{const tempo=document.getElementById("tempo"); tempo.value="1.5"; tempo.dispatchEvent(new Event("input"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,3600));
    const missed=+document.getElementById("scoreMissed").textContent;
    const reds=[...document.querySelectorAll("#sheetContainer g.vf-stavenote .vf-notehead path")].filter(p=>/d2604f/i.test(p.getAttribute("fill"))).length;
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,40));
    const redsAfterReplay=[...document.querySelectorAll("#sheetContainer g.vf-stavenote .vf-notehead path")].filter(p=>/d2604f/i.test(p.getAttribute("fill"))).length;
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,250));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,80));
    document.getElementById("btnPause").click(); tempo.value="1"; tempo.dispatchEvent(new Event("input"));
    return {missed, reds, redsAfterReplay, c:+document.getElementById("scoreCorrect").textContent, w:+document.getElementById("scoreWrong").textContent};});
  chk("end of run: all 8 misses counted, including the last note", r.missed===8, r);
  chk("...and the score shows them red for review", r.reds===8, r);
  chk("next Play clears the old run", r.redsAfterReplay===0, r);
  chk("...and the first note of the new run scores correct", r.c===1 && r.w===0, r);

  await load("scale","modeWait");
  r=await E(async()=>{const sc=document.getElementById("scrubber"); sc.value=String(parseFloat(sc.max)-0.05); sc.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,500));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,500));
    return {pos:+document.getElementById("scrubber").value, exp:[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi)};});
  chk("Wait: a replay after the end waits at the first note again", r.pos===0 && r.exp.join()==="60", r);

  r=await E(()=>{const P=window.PT.Practice; const song={notes:[{midi:60,startSec:0,durSec:1,staff:0},{midi:64,startSec:1,durSec:1,staff:0},{midi:67,startSec:1,durSec:1,staff:0}]};
    const p=new P(); p.build(song,"wait","right"); p.setLengthMode("report"); let cleared=0; p.onGateCleared=()=>cleared++;
    p.noteOn(60); p.noteOff(60);           // gate 0 cleared; playhead now travelling
    p.noteOn(64);                          // anticipated: struck before gate 1 opens
    p.openCurrentGate();                   // gate 1 opens
    p.noteOn(67);                          // chord completed with E still down
    return {cleared, gate:p.gateIndex};});
  chk("Wait: a note struck on the way to a gate still counts when it opens", r.cleared===2, r);

  r=await E(async()=>{document.getElementById("btnSettings").click(); await new Promise(r=>setTimeout(r,100));
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); document.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const leaked=document.querySelectorAll("#keyboardSvg .is-user").length>0 || !document.getElementById("btnPause").classList.contains("is-hidden");
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    document.getElementById("btnSettingsClose").click(); return leaked;});
  chk("nothing plays or starts behind an open dialog", !r);

  r=await E(async()=>{const f=document.getElementById("modeFollow");
    document.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); f.focus(); f.closest("label").click();
    await new Promise(r=>setTimeout(r,60)); const released=document.activeElement===document.body;
    f.focus(); await new Promise(r=>setTimeout(r,1700));        // keyboard focus (no pointer): must be kept
    f.dispatchEvent(new Event("change",{bubbles:true})); await new Promise(r=>setTimeout(r,60));
    return {released, keptForKeyboard:document.activeElement===f};});
  chk("a mouse/touch click hands focus back so Space and arrows work", r.released, r);
  chk("keyboard-only navigation keeps focus (accessibility preserved)", r.keptForKeyboard, r);

  r=await E(()=>{const t=(s)=>getComputedStyle(document.querySelector(s)).touchAction; return {k:t("#keyboardSvg"),r:t("#rollCanvas"),b:t("#btnPlay")};});
  chk("touch: the keyboard and falling notes receive the finger", r.k==="none" && r.r==="none", r);
  chk("touch: buttons skip the double-tap zoom delay", r.b==="manipulation", r);

  r=await E(()=>{ const mi=new window.PT.MidiInput(); const got=[]; mi.onTransport=(k)=>got.push(k);
    for (const b of [0xfa,0xfb,0xfc,0xf8,0xfe]) mi._onMessage("x",{data:Uint8Array.of(b)}); return got.join(",");});
  chk("MIDI Start/Continue/Stop are read (clock and sensing ignored)", r==="start,continue,stop", r);

  console.log("[ux]");
  await load("scale","modeWait");
  r=await E(async()=>{document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,300));
    const hud=document.getElementById("hud"); const waiting={shown:!hud.classList.contains("is-hidden"), text:document.getElementById("hudText").textContent};
    const inRoll=document.getElementById("rollPanel").contains(hud);
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,120));
    const holding={text:document.getElementById("hudText").textContent, bar:document.getElementById("hudBar").classList.contains("is-running"),
      keyFill:document.querySelector('#keyboardSvg [data-midi="60"]').getAttribute("class")};
    await new Promise(r=>setTimeout(r,500)); document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    return {waiting, inRoll, holding, after:document.getElementById("hudText").textContent};});
  chk("feedback appears over the falling notes, where the eyes are", r.inRoll && r.waiting.shown && /Waiting for C4/.test(r.waiting.text), r.waiting);
  chk("holding shows a progress bar", /Hold it/.test(r.holding.text) && r.holding.bar, r.holding);
  chk("...and the held key fills on the keyboard", /is-holding/.test(r.holding.keyFill), r.holding.keyFill);

  r=await E(async()=>{const f=document.getElementById("modeFollow"); f.checked=true; f.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,80)); return {text:document.getElementById("hudText").textContent, tip:f.closest("label").title};});
  // Explanations moved to the mode buttons' tooltips at the user's request (they
  // cluttered the falling notes). Note: hover doesn't exist on a touchscreen.
  chk("changing mode puts no explanation on screen (it lives in the button's tooltip)", !/Follow — play along/.test(r.text) && /Follow: play along/.test(r.tip), r);

  r=await E(async()=>{document.getElementById("btnFingering").click(); await new Promise(r=>setTimeout(r,80));
    const padShown=!document.getElementById("fingerPad").classList.contains("is-hidden");
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    document.querySelector('#fingerPad [data-f="4"]').click(); await new Promise(r=>setTimeout(r,80));
    const n=window.PT.__app.song.notes.find(x=>x.midi===60); document.getElementById("btnFingering").click();
    return {padShown, finger:n.finger, hidden:document.getElementById("fingerPad").classList.contains("is-hidden")};});
  chk("fingering: on-screen 1-5 buttons set a finger without a keyboard", r.padShown && r.finger===4 && r.hidden, r);

  r=await E(async()=>{const A=window.PT.__app; const note=A.profile.controlKeys;
    document.getElementById("btnLearnPlay").click();
    A.midi.onNoteOn(21,0.8); A.midi.onNoteOff(21);                 // learn A0
    const assigned=document.getElementById("ctlPlayName").textContent;
    A.midi.onNoteOn(21,0.8); await new Promise(r=>setTimeout(r,300));
    const playing=A.transport.isPlaying, lit=document.querySelectorAll('#keyboardSvg [data-midi="21"].is-user').length;
    A.midi.onNoteOff(21); A.midi.onNoteOn(21,0.8); await new Promise(r=>setTimeout(r,100));
    const paused=!A.transport.isPlaying; A.midi.onNoteOff(21);
    document.getElementById("btnLearnRepeat").click(); A.midi.onNoteOn(108,0.8); A.midi.onNoteOff(108);
    A.midi.onNoteOn(108,0.8); A.midi.onNoteOff(108); await new Promise(r=>setTimeout(r,100));
    const looped=!!A.transport.loop; A.midi.onNoteOn(108,0.8); A.midi.onNoteOff(108); const unlooped=!A.transport.loop;
    A.midi.onTransport("start"); await new Promise(r=>setTimeout(r,250)); const rtStart=A.transport.isPlaying;
    A.midi.onTransport("stop"); await new Promise(r=>setTimeout(r,80)); const rtStop=!A.transport.isPlaying;
    document.getElementById("btnClearControls").click();
    return {assigned, playing, lit, paused, looped, unlooped, rtStart, rtStop};});
  chk("hands-free: MIDI-learn assigns a play/pause key", r.assigned==="A0", r);
  chk("...that key starts and pauses, and makes no sound", r.playing && r.paused && r.lit===0, r);
  chk("...a repeat key toggles repeat-this-bar", r.looped && r.unlooped, r);
  chk("...keyboard Start/Stop buttons drive the transport", r.rtStart && r.rtStop, r);

  r=await E(async()=>{const A=window.PT.__app; document.getElementById("btnStop").click();
    const L=document.getElementById("latency"); L.value="200"; L.dispatchEvent(new Event("input"));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,700));
    const tp=A.transport.position, shown=+document.getElementById("scrubber").value, judged=A.practice._positionGetter();
    document.getElementById("btnPause").click(); await new Promise(r=>setTimeout(r,50));
    const pausedShown=+document.getElementById("scrubber").value, pausedTrue=A.transport.position;
    L.value="0"; L.dispatchEvent(new Event("input")); return {lag:+(tp-shown).toFixed(3), judgedLag:+(tp-judged).toFixed(3), pausedShown, pausedTrue};});
  chk("sound delay shifts what you see by the delay", Math.abs(r.lag-0.2)<0.03, r);
  chk("...and what the judge counts as now", Math.abs(r.judgedLag-0.2)<0.03, r);
  chk("...but paused, the true position is shown", Math.abs(r.pausedShown-r.pausedTrue)<0.01, r);

  r=await E(async()=>{const A=window.PT.__app; document.getElementById("btnSettings").click();
    document.getElementById("btnCalibrate").click(); await new Promise(r=>setTimeout(r,200));
    const eng=A.engine; const t0=eng.now()+0.6;   // first click is scheduled 0.8 s after start; we started 0.2 s ago
    for (let i=0;i<8;i++){ const target=t0+i*0.6+0.12; while(eng.now()<target) await new Promise(r=>setTimeout(r,4));
      document.getElementById("calibPad").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true})); }
    await new Promise(r=>setTimeout(r,1500));
    const ms=parseInt(document.getElementById("latency").value,10), text=document.getElementById("calibText").textContent;
    document.getElementById("latency").value="0"; document.getElementById("latency").dispatchEvent(new Event("input"));
    document.getElementById("btnSettingsClose").click(); return {ms,text};});
  chk("'Measure it' recovers a 120 ms delay from taps (±25 ms)", Math.abs(r.ms-120)<=25, r);

  r=await E(async()=>{const dt=new DataTransfer(); const xml=window.PT.samples.minuetG.xml;
    dt.items.add(new File([xml],"dropped-minuet.musicxml",{type:"application/xml"}));
    window.dispatchEvent(new DragEvent("dragenter",{dataTransfer:dt}));
    const zone=!document.getElementById("dropZone").classList.contains("is-hidden");
    window.dispatchEvent(new DragEvent("drop",{dataTransfer:dt,cancelable:true})); await new Promise(r=>setTimeout(r,2800));
    return {zone, title:document.getElementById("title").textContent, hidden:document.getElementById("dropZone").classList.contains("is-hidden")};});
  chk("drag a file onto the page to open it", r.zone && /Minuet/.test(r.title) && r.hidden, r);

  r=await E(async()=>{const c=document.getElementById("rollCanvas"), b=c.getBoundingClientRect(); const T=window.PT.__app.transport;
    document.getElementById("btnStop").click(); const p0=T.position;
    const ev=(t,y)=>c.dispatchEvent(new PointerEvent(t,{bubbles:true,pointerId:9,clientX:b.x+200,clientY:y}));
    ev("pointerdown",b.y+40); for(let y=40;y<=170;y+=10) ev("pointermove",b.y+y); ev("pointerup",b.y+170);
    c.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:b.x+200,clientY:b.y+170}));
    await new Promise(r=>setTimeout(r,80));
    return {p0, p1:+T.position.toFixed(2), expect:+(130/window.PT.__app.roll.pxPerSec).toFixed(2)};});
  chk("drag the falling notes to scrub, and the drag isn't read as a click", Math.abs(r.p1-r.expect)<0.12, r);

  console.log("[defaults & first run]");
  const {pg:pg2,close:close2}=await require("./harness").open("/home/claude/work/out");
  r=await pg2.evaluate(async()=>{for(let i=0;i<50;i++){ await new Promise(r=>setTimeout(r,200)); if(/loaded|failed/.test(document.getElementById("backendNote").textContent)) break; }
    return {first:!document.getElementById("firstRun").classList.contains("is-hidden"), sound:document.getElementById("backendNote").textContent};});
  chk("a new user starts on the bundled grand piano", /grand piano.*loaded/.test(r.sound), r.sound);
  chk("a new user sees the quick-start card", r.first);
  r=await pg2.evaluate(async()=>{document.getElementById("btnQuickLearn").click(); await new Promise(r=>setTimeout(r,3200));
    return {title:document.getElementById("title").textContent, wait:document.getElementById("modeWait").checked, right:document.getElementById("handRight").checked,
            exp:document.querySelectorAll("#keyboardSvg .is-expected").length, gone:document.getElementById("firstRun").classList.contains("is-hidden")};});
  chk("'Learn it' loads a piece in Wait, right hand, waiting for the first note", /Ode/.test(r.title) && r.wait && r.right && r.exp>0 && r.gone, r);
  await close2();

  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
