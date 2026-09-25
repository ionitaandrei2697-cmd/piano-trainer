/* Functional audit: every user-facing function, driven through the real UI.
 * A simulated USB MIDI keyboard is injected before the app loads, so the MIDI
 * path (connect, note on/off, velocity-0 note-off, sustain, hot-plug,
 * transport buttons) runs through the app's own code. */
const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=process.argv[2]||"/home/claude/work/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".mid":"audio/midi",".mxl":"application/zip"};
const results=[]; let area="";
const rec=(name,ok,detail)=>results.push({area,name,ok:!!ok,detail});
(async()=>{
  const srv=http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{ if(e){res.writeHead(404);return res.end();} res.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"}); res.end(d); });});
  await new Promise(r=>srv.listen(0,r)); const port=srv.address().port;
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args:["--no-sandbox","--autoplay-policy=no-user-gesture-required","--mute-audio"]});
  const pg=await b.newPage();
  const errors=[]; pg.on("pageerror",e=>errors.push(e.message));
  await pg.evaluateOnNewDocument(()=>{
    // ---- a simulated USB MIDI keyboard ----
    const mk=(id,name)=>({id,name,manufacturer:"Casio",state:"connected",connection:"open",type:"input",onmidimessage:null});
    const inputs=new Map([["casio-1",mk("casio-1","CASIO USB-MIDI")]]);
    const access={inputs,outputs:new Map(),onstatechange:null,sysexEnabled:false};
    window.__midiRequests=0;
    navigator.requestMIDIAccess=()=>{ window.__midiRequests++; return Promise.resolve(access); };
    const q=navigator.permissions&&navigator.permissions.query.bind(navigator.permissions);
    if(q) navigator.permissions.query=(d)=>d&&d.name==="midi"?Promise.resolve({state:window.__midiPerm||"granted",onchange:null}):q(d);
    window.__midi=(bytes,id)=>{const inp=inputs.get(id||"casio-1"); if(inp&&inp.onmidimessage) inp.onmidimessage({data:new Uint8Array(bytes),timeStamp:performance.now()});};
    window.__unplug=()=>{inputs.delete("casio-1"); if(access.onstatechange) access.onstatechange({port:{id:"casio-1",state:"disconnected"}});};
    window.__plug=()=>{inputs.set("casio-1",mk("casio-1","CASIO USB-MIDI")); if(access.onstatechange) access.onstatechange({port:{id:"casio-1",state:"connected"}});};
  });
  await pg.setViewport({width:1440,height:830});
  await pg.goto("http://localhost:"+port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app && document.getElementById('status').textContent.length>0",{timeout:15000});
  await new Promise(r=>setTimeout(r,800));
  const E=(fn,...a)=>pg.evaluate(fn,...a);
  const W=(ms)=>new Promise(r=>setTimeout(r,ms));
  const load=(k)=>E(async(k)=>{const s=document.getElementById("sampleList");s.value=k;s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));},k);
  const setRadio=(id)=>E((id)=>{const e=document.getElementById(id);e.checked=true;e.dispatchEvent(new Event("change",{bubbles:true}));},id);
  const click=(id)=>E((id)=>document.getElementById(id).click(),id);
  const key=(code,type)=>E((code,type)=>document.dispatchEvent(new KeyboardEvent(type||"keydown",{code,bubbles:true})),code,type);
  const st=()=>E(()=>document.getElementById("status").textContent);
  const lit=()=>E(()=>[...document.querySelectorAll("#keyboardSvg .is-user")].map(e=>+e.dataset.midi));

  // ================================================================ loading
  area="Loading";
  for (const k of ["scale","twoHand","odeToJoy","minuetG","twinkle"]) {
    const ok=await E(async(k)=>{if(!window.PT.samples[k])return "missing";const s=document.getElementById("sampleList");s.value=k;s.dispatchEvent(new Event("change"));
      await new Promise(r=>setTimeout(r,2400));return document.getElementById("status").textContent;},k);
    rec("sample: "+k, /Loaded notation/.test(ok), ok);
  }
  const b64=fs.readFileSync("/home/claude/work/t/fixtures/ode.mxl").toString("base64");
  const inp=await pg.$("#fileInput"); await inp.uploadFile("/home/claude/work/t/fixtures/ode.mxl"); await W(2800);
  rec("open .mxl via file picker", /Loaded notation/.test(await st()), await st());
  // MIDI file: export the current piece, then open it back
  const midiPath="/tmp/audit-export.mid";
  const bytes=await E(()=>Array.from(window.PT.xmlToMIDI.songToMIDI(window.PT.__app.song)));
  fs.writeFileSync(midiPath,Buffer.from(bytes));
  await inp.uploadFile(midiPath); await W(1800);
  const midiLoad=await E(()=>({status:document.getElementById("status").textContent,noSheet:!document.getElementById("noSheet").classList.contains("is-hidden"),n:window.PT.__app.song.notes.length}));
  rec("open .mid (exported by the app)", /Loaded MIDI/.test(midiLoad.status)&&midiLoad.noSheet&&midiLoad.n>10, midiLoad);
  await click("btnConvertSheet"); await W(3000);
  rec("convert MIDI -> sheet music", /Converted to sheet music/.test(await st()), await st());
  const exp=await E(()=>{try{const b=window.PT.xmlToMIDI.songToMIDI(window.PT.__app.song);return String.fromCharCode(...b.slice(0,4))+" "+b.length;}catch(e){return "THREW "+e.message;}});
  rec("export MIDI produces a valid file", /^MThd \d+/.test(exp), exp);
  const bad=await E(async()=>{const f=new File(["hello"],"notes.txt",{type:"text/plain"});const dt=new DataTransfer();dt.items.add(f);
    window.dispatchEvent(new DragEvent("drop",{dataTransfer:dt,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,500));return document.getElementById("status").textContent;});
  rec("dropping a non-score file gives a clear error", /isn't a score/.test(bad), bad);
  const drop=await E(async(b64)=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
    const f=new File([u],"ode.mxl");const dt=new DataTransfer();dt.items.add(f);
    window.dispatchEvent(new DragEvent("drop",{dataTransfer:dt,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,2800));return document.getElementById("status").textContent;},b64);
  rec("drag-and-drop a score opens it", /Loaded notation/.test(drop), drop);

  // ================================================================ saved pieces
  area="Saved pieces";
  const saved=await E(()=>[...document.getElementById("pieceList").options].map(o=>o.textContent));
  rec("loaded pieces are listed", saved.length>=3, saved);
  const reopen=await E(async()=>{const pl=document.getElementById("pieceList");const o=[...pl.options].find(o=>/Minuet/.test(o.textContent));
    if(!o)return "no minuet";pl.value=o.value;pl.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));return document.getElementById("title").textContent;});
  rec("reopen a saved piece", /Minuet/.test(reopen), reopen);

  // ================================================================ transport
  area="Transport";
  await load("minuetG");
  await click("btnPlay"); await W(1300);
  let pos=await E(()=>+document.getElementById("scrubber").value);
  rec("play advances the playhead", pos>0.8, pos);
  await click("btnPause");
  // the display settles one frame after the click; read after it lands
  const p1=await E(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r(+document.getElementById("scrubber").value))))); await W(500);
  const p2=await E(()=>+document.getElementById("scrubber").value);
  rec("pause holds the position", p2===p1, {p1,p2});
  await E(()=>{const s=document.getElementById("scrubber");s.value="5";s.dispatchEvent(new Event("change"));}); await W(200);
  rec("scrubber seeks", Math.abs(await E(()=>+document.getElementById("scrubber").value)-5)<0.05);
  await click("btnStop"); await W(200);
  rec("stop returns to the start", (await E(()=>+document.getElementById("scrubber").value))===0);
  await E(()=>{const t=document.getElementById("tempo");t.value="0.5";t.dispatchEvent(new Event("input"));});
  await click("btnPlay"); await W(1000); pos=await E(()=>+document.getElementById("scrubber").value); await click("btnPause");
  rec("tempo 50% plays at half speed", pos>0.35&&pos<0.65, pos);
  await E(()=>{const t=document.getElementById("tempo");t.value="1";t.dispatchEvent(new Event("input"));});
  await click("btnStop");
  const clicks=await E(async()=>{const eng=window.PT.__app.engine;let n=0;const orig=eng.metronomeAt.bind(eng);eng.metronomeAt=(t,a)=>{n++;return orig(t,a);};
    const m=document.getElementById("toggleMetronome");m.checked=true;m.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click();await new Promise(r=>setTimeout(r,1400));document.getElementById("btnPause").click();
    m.checked=false;m.dispatchEvent(new Event("change"));eng.metronomeAt=orig;return n;});
  rec("metronome schedules clicks", clicks>=2, clicks);
  await click("btnStop");
  const ci=await E(async()=>{const c=document.getElementById("countInMode");c.value="clicks";c.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click();await new Promise(r=>setTimeout(r,250));
    const during={pos:+document.getElementById("scrubber").value,skip:!document.getElementById("btnSkipCountIn").classList.contains("is-hidden")};
    document.getElementById("btnSkipCountIn").click();await new Promise(r=>setTimeout(r,500));
    const after=+document.getElementById("scrubber").value;document.getElementById("btnStop").click();
    c.value="off";c.dispatchEvent(new Event("change"));return {during,after};});
  rec("count-in holds the music, Skip starts it", ci.during.pos===0&&ci.during.skip&&ci.after>0.2, ci);

  // ================================================================ views
  area="Views & settings";
  await load("minuetG");
  for (const [id,panel] of [["toggleSheet","sheetPanel"],["toggleRoll","rollPanel"],["toggleKeyboard","keyboardPanel"]]) {
    const r=await E(async(id,panel)=>{const t=document.getElementById(id);t.checked=false;t.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,150));
      const hidden=document.getElementById(panel).classList.contains("is-hidden");t.checked=true;t.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,250));
      return {hidden,back:!document.getElementById(panel).classList.contains("is-hidden")};},id,panel);
    rec("panel toggle: "+id.replace("toggle",""), r.hidden&&r.back, r);
  }
  const nn=await E(async()=>{const t=document.getElementById("toggleLabels");t.checked=true;t.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,200));
    const n=document.querySelectorAll("#keyboardSvg text.pk-label").length;t.checked=false;t.dispatchEvent(new Event("change"));return n;});
  rec("note names on the keys", nn>40, nn);
  const cur=await E(async()=>{const t=document.getElementById("toggleCursor");t.checked=false;t.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,150));
    const c=document.getElementById("cursorImg-0");const hid=c&&getComputedStyle(c).opacity==="0";t.checked=true;t.dispatchEvent(new Event("change"));return hid;});
  rec("cursor can be hidden", cur, cur);
  const zoom=await E(async()=>{const z=document.getElementById("zoom");z.value="1.4";z.dispatchEvent(new Event("input"));z.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,1300));const fit=document.getElementById("toggleFit").checked;const lab=document.getElementById("zoomVal").textContent;
    const f=document.getElementById("toggleFit");f.checked=true;f.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,1300));
    return {fitAfterManual:fit,lab,labAfterFit:document.getElementById("zoomVal").textContent};});
  rec("manual zoom turns Fit off; Fit restores auto", !zoom.fitAfterManual&&/140%/.test(zoom.lab)&&/auto/.test(zoom.labAfterFit), zoom);
  const spd=await E(()=>{const s=document.getElementById("noteSpeed");s.value="200";s.dispatchEvent(new Event("input"));return window.PT.__app.roll.pxPerSec;});
  rec("fall speed slider", spd===200, spd);
  const vol=await E(()=>{const v=document.getElementById("volume");v.value="0.3";v.dispatchEvent(new Event("input"));return +window.PT.__app.engine._musicBus.gain.value.toFixed(2);});
  rec("volume slider", vol===0.3, vol);
  const size=await E(async()=>{const s=document.getElementById("profileSize");s.value="61";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));
    const n=document.querySelectorAll("#keyboardSvg [data-midi]").length;s.value="88";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));return n;});
  rec("keyboard size (61 keys)", size>=61&&size<88, size);
  const piano=await E(async()=>{const s=document.getElementById("profileBackend");s.value="acoustic_grand_piano";s.dispatchEvent(new Event("change"));
    for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,250));if(/loaded|failed/.test(document.getElementById("backendNote").textContent))break;}
    const note=document.getElementById("backendNote").textContent;s.value="synth";s.dispatchEvent(new Event("change"));return note;});
  rec("bundled grand piano loads offline", /samples loaded/.test(piano), piano);
  const dlg=await E(async()=>{document.getElementById("btnSettings").click();const o=document.getElementById("settingsDialog").open;
    document.getElementById("btnSettingsClose").click();document.getElementById("btnHelp").click();const h=document.getElementById("helpDialog").open;
    document.getElementById("btnHelpClose").click();return {o,h};});
  rec("settings and shortcuts dialogs open", dlg.o&&dlg.h, dlg);

  // ================================================================ practice
  area="Practice";
  await load("scale"); await setRadio("handBoth"); await setRadio("modeWait"); await click("btnPlay"); await W(300);
  await key("KeyA"); await W(550); await key("KeyA","keyup"); await W(500);
  rec("Wait: held note opens the gate", (await E(()=>+document.getElementById("scrubber").value))>0.3);
  await click("btnStop"); await setRadio("modeFollow"); await click("btnPlay");
  for (const c of ["KeyA","KeyS","KeyD"]) { await W(c==="KeyA"?30:120); await key(c); await W(380); await key(c,"keyup"); }
  await W(150); await click("btnPause");
  const fol=await E(()=>({c:document.getElementById("scoreCorrect").textContent,acc:document.getElementById("scoreAcc").textContent,tim:document.getElementById("scoreTiming").textContent}));
  rec("Follow: on-time held notes score correct", fol.c==="3", fol);
  rec("Follow: timing readout populated", /ms|beat/.test(fol.tim), fol.tim);
  await click("btnStop"); await setRadio("modeListen");
  const hands=await E(()=>{const A=window.PT.Practice.audioAllows;return [A("listen","right",0),A("listen","right",1),A("wait","left",1),A("wait","left",0),A("wait","left",0,true),A("follow","both",0)].join();});
  rec("hand audio policy (listen solos; follow/wait play neither hand unless asked)", hands==="true,false,false,false,true,false", hands);
  await load("minuetG");
  const rep=await E(async()=>{const f=document.getElementById("loopFrom"),t=document.getElementById("loopTo");f.value="2";t.value="2";t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));const tr=window.PT.__app.transport;const loop=tr.loop?{a:+tr.loop.a.toFixed(2),b:+tr.loop.b.toFixed(2)}:null;
    document.getElementById("btnPlay").click();await new Promise(r=>setTimeout(r,3200));const pass=document.getElementById("loopInfo").textContent;
    const pos=tr.position;document.getElementById("btnPause").click();return {loop,pass,pos:+pos.toFixed(2)};});
  rec("Repeat bar 2 wraps and counts passes", rep.loop&&/pass [1-9]/.test(rep.pass)&&rep.pos>=rep.loop.a-0.01&&rep.pos<=rep.loop.b+0.01, rep);
  await click("btnLoopClear");
  const ramp=await E(async()=>{const a=window.PT.__app;const r=document.getElementById("toggleRamp");r.checked=true;r.dispatchEvent(new Event("change"));
    document.getElementById("modeFollow").checked=true;document.getElementById("modeFollow").dispatchEvent(new Event("change"));
    const t=document.getElementById("tempo");t.value="0.8";t.dispatchEvent(new Event("input"));
    document.getElementById("loopFrom").value="1";document.getElementById("loopTo").value="1";document.getElementById("loopTo").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    // simulate a clean pass: credit every gate in bar 1 directly, then wrap
    const p=a.practice, before=a.transport.rate;
    for(const e of p.events){ if(e.timeSec>=a.transport.loop.b) break; for(const m of e.required){ p.score.correct++; } }
    a.transport.onLoop(a.transport.loop.a);
    const after=a.transport.rate; r.checked=false;r.dispatchEvent(new Event("change"));
    document.getElementById("btnLoopClear").click();t.value="1";t.dispatchEvent(new Event("input"));
    document.getElementById("modeListen").checked=true;document.getElementById("modeListen").dispatchEvent(new Event("change"));
    return {before:+before.toFixed(2),after:+after.toFixed(2)};});
  rec("Auto tempo raises the tempo after a clean pass", ramp.after>ramp.before, ramp);

  // ================================================================ fingering
  area="Fingering";
  await load("scale");
  const fg=await E(async()=>{const a=window.PT.__app;const before=a.song.notes.map(n=>n.finger);document.getElementById("btnFingering").click();
    const pad=!document.getElementById("fingerPad").classList.contains("is-hidden");
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    document.querySelector('#fingerPad [data-f="4"]').click();await new Promise(r=>setTimeout(r,200));
    const statusAfterEdit=document.getElementById("status").textContent;
    const n=a.song.notes.find(n=>n.midi===60);document.getElementById("btnFingering").click();
    const changed=a.song.notes.filter((x,i)=>x.finger!==before[i]).map(x=>x.midi);
    return {pad,finger:n&&n.finger,changed,status:statusAfterEdit};});
  rec("fingering edit: tap pad pins ONE note, neighbours re-fit (and it says so)",
      fg.pad&&fg.finger===4&&fg.changed.includes(60)&&(fg.changed.length===1||/neighbouring/.test(fg.status)), fg);

  // ================================================================ keyboard input
  area="Typing & mouse input";
  await load("scale");
  await key("KeyA"); let l=await lit(); await key("KeyA","keyup");
  rec("typing piano plays C4 on A", l.includes(60), l);
  await key("KeyX"); await key("KeyA"); l=await lit(); await key("KeyA","keyup"); await key("KeyZ");
  rec("X shifts the typing keyboard up an octave", l.includes(72), l);
  const sp=await E(async()=>{const b=document.getElementById("btnLoopBar");b.focus();
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true}));await new Promise(r=>setTimeout(r,300));
    const playing=window.PT.__app.transport.isPlaying;document.getElementById("btnStop").click();return playing;});
  rec("Space plays even when a toolbar button has focus", sp, sp);
  const blocked=await E(async()=>{document.getElementById("btnSettings").click();
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));const l=[...document.querySelectorAll("#keyboardSvg .is-user")].length;
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));document.getElementById("btnSettingsClose").click();return l;});
  rec("typing is ignored while a dialog is open", blocked===0, blocked);

  // ================================================================ MIDI keyboard
  area="MIDI keyboard";
  await load("scale");
  const conn=await E(async()=>{document.getElementById("btnMidi").click();await new Promise(r=>setTimeout(r,400));
    return {status:document.getElementById("midiStatus").textContent,devices:[...document.getElementById("midiDevices").options].map(o=>o.textContent)};});
  rec("Connect lists the keyboard", conn.devices.includes("CASIO USB-MIDI"), conn);
  await E(()=>window.__midi([0x90,60,100])); await W(80); l=await lit();
  rec("note-on lights the key", l.includes(60), l);
  const vel=await E(()=>{const e=window.PT.__app.engine;const h=e._live.get(60);return !!h;});
  rec("note-on sounds live", vel);
  await E(()=>window.__midi([0x90,60,0])); await W(80); l=await lit();
  rec("velocity-0 note-on releases (running-status form)", !l.includes(60), l);
  await E(()=>window.__midi([0x90,62,90])); await E(()=>window.__midi([0x80,62,0])); await W(80); l=await lit();
  rec("0x80 note-off releases", !l.includes(62), l);
  await E(()=>window.__midi([0x93,64,90])); await W(60); l=await lit(); await E(()=>window.__midi([0x83,64,0]));
  rec("any MIDI channel is accepted", l.includes(64), l);
  const sus=await E(async()=>{const e=window.PT.__app.engine;window.__midi([0xB0,64,127]);window.__midi([0x90,65,90]);window.__midi([0x80,65,0]);
    await new Promise(r=>setTimeout(r,60));const held=e._sustained.has(65);window.__midi([0xB0,64,0]);await new Promise(r=>setTimeout(r,60));
    return {held,released:!e._sustained.has(65)};});
  rec("sustain pedal (CC64) holds and releases", sus.held&&sus.released, sus);
  await setRadio("modeWait"); await click("btnPlay"); await W(300);
  await E(()=>window.__midi([0x90,60,100])); await W(600); await E(()=>window.__midi([0x80,60,0])); await W(500);
  rec("MIDI key clears a Wait gate", (await E(()=>+document.getElementById("scrubber").value))>0.3);
  await click("btnStop"); await setRadio("modeListen");
  const rt=await E(async()=>{window.__midi([0xFA]);await new Promise(r=>setTimeout(r,400));const a=window.PT.__app.transport.isPlaying;
    window.__midi([0xFC]);await new Promise(r=>setTimeout(r,200));return {started:a,stopped:!window.PT.__app.transport.isPlaying};});
  rec("keyboard Start/Stop buttons (real-time) drive playback", rt.started&&rt.stopped, rt);
  const hot=await E(async()=>{window.__midi([0x90,67,100]);await new Promise(r=>setTimeout(r,50));window.__unplug();await new Promise(r=>setTimeout(r,200));
    const afterUnplug={devices:[...document.getElementById("midiDevices").options].map(o=>o.textContent),stuck:[...document.querySelectorAll("#keyboardSvg .is-user")].map(e=>+e.dataset.midi),status:document.getElementById("status").textContent};
    window.__plug();await new Promise(r=>setTimeout(r,200));
    return {afterUnplug,replugged:[...document.getElementById("midiDevices").options].map(o=>o.textContent),status:document.getElementById("status").textContent};});
  rec("unplugging mid-note leaves no stuck key", hot.afterUnplug.stuck.length===0, hot.afterUnplug);
  rec("unplug / replug is announced", /disconnect/i.test(hot.afterUnplug.status)&&/connect/i.test(hot.status), {unplug:hot.afterUnplug.status,replug:hot.status});
  const learn=await E(async()=>{document.getElementById("btnLearnPlay").click();window.__midi([0x90,108,90]);window.__midi([0x80,108,0]);
    await new Promise(r=>setTimeout(r,100));const name=document.getElementById("ctlPlayName").textContent;
    window.__midi([0x90,108,90]);await new Promise(r=>setTimeout(r,400));const playing=window.PT.__app.transport.isPlaying;
    window.__midi([0x80,108,0]);window.__midi([0x90,108,90]);window.__midi([0x80,108,0]);await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnClearControls").click();return {name,playing};});
  rec("hands-free: learn a key, it toggles play", /C8/.test(learn.name)&&learn.playing, learn);

  // ================================================================ persistence
  area="Persistence";
  await E(async()=>{const t=document.getElementById("tempo");t.value="0.75";t.dispatchEvent(new Event("input"));
    document.getElementById("modeFollow").checked=true;document.getElementById("modeFollow").dispatchEvent(new Event("change"));
    document.getElementById("handLeft").checked=true;document.getElementById("handLeft").dispatchEvent(new Event("change"));
    const g=document.getElementById("toggleGrid");g.checked=false;g.dispatchEvent(new Event("change"));
    const s=document.getElementById("midiDevices");s.value="casio-1";s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,600));});
  await pg.reload({waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000}); await W(3200);
  const per=await E(()=>({tempo:document.getElementById("tempoVal").textContent,follow:document.getElementById("modeFollow").checked,
    left:document.getElementById("handLeft").checked,grid:document.getElementById("toggleGrid").checked,title:document.getElementById("title").textContent,
    midiAuto:window.__midiRequests,device:document.getElementById("midiDevices").value,midiStatus:document.getElementById("midiStatus").textContent,
    savedId:window.PT.__app.profile.midiDeviceId, active:window.PT.__app.midi.activeId,
    opts:[...document.getElementById("midiDevices").options].map(o=>o.value), chip:document.getElementById("midiChip").textContent}));
  rec("tempo, mode, hand, view toggles survive a reload", per.tempo==="75%"&&per.follow&&per.left&&per.grid===false, per);
  rec("last piece reopens automatically", per.title!=="No piece loaded", per.title);
  rec("MIDI keyboard reconnects automatically after reload", per.midiAuto>0&&per.device==="casio-1", per);

  // ================================================================ recently added
  area="Recently added";
  await E(()=>{window.confirm=()=>true;});
  const chip=await E(async()=>{const c=document.getElementById("midiChip");const on={t:c.textContent,cls:c.className};
    window.__unplug();await new Promise(r=>setTimeout(r,200));const off={t:c.textContent,cls:c.className};
    window.__plug();await new Promise(r=>setTimeout(r,200));return {on,off,back:c.textContent};});
  rec("keyboard chip shows connected / unplugged states", /CASIO/.test(chip.on.t)&&/is-on/.test(chip.on.cls)&&/Plug in/.test(chip.off.t)&&/CASIO/.test(chip.back), chip);
  const quick=await E(async()=>{document.getElementById("btnQuickLearn").click();await new Promise(r=>setTimeout(r,3400));
    const hud=document.getElementById("hud");const hr=hud.getBoundingClientRect(),rr=document.getElementById("rollPanel").getBoundingClientRect();
    const out={title:document.getElementById("title").textContent,wait:document.getElementById("modeWait").checked,right:document.getElementById("handRight").checked,
      hud:!hud.classList.contains("is-hidden"),hudText:document.getElementById("hudText").textContent,
      hudOverNotes:hr.top>=rr.top-1&&hr.bottom<=rr.bottom+1};
    document.getElementById("btnStop").click();return out;});
  rec("'Learn it' opens a piece in Wait, right hand", /Ode/.test(quick.title)&&quick.wait&&quick.right, quick);
  rec("practice feedback shows over the falling notes (HUD)", quick.hud&&quick.hudOverNotes&&quick.hudText.length>3, quick);
  const drag=await E(async()=>{const c=document.getElementById("rollCanvas");const r=c.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;
    const tr=window.PT.__app.transport;tr.seek(2);await new Promise(r=>setTimeout(r,100));const before=tr.position;const px=window.PT.__app.roll.pxPerSec;
    const ev=(t,yy)=>c.dispatchEvent(new PointerEvent(t,{bubbles:true,clientX:x,clientY:yy,pointerId:9,pointerType:"touch",isPrimary:true}));
    ev("pointerdown",y);for(let i=1;i<=10;i++)ev("pointermove",y+i*10);ev("pointerup",y+100);
    await new Promise(r=>setTimeout(r,150));return {before:+before.toFixed(3),after:+tr.position.toFixed(3),expect:+(before+100/px).toFixed(3)};});
  rec("dragging the falling notes scrubs (touch)", Math.abs(drag.after-drag.expect)<0.05, drag);
  const cal=await E(async()=>{const a=window.PT.__app;await a.engine.ensureStarted();
    document.getElementById("btnCalibrate").click();const t0=a.engine.now();
    await new Promise(r=>setTimeout(r,60));   // startCalibration is async: let it show the panel
    const panel=!document.getElementById("calibPanel").classList.contains("is-hidden");
    // tap 100 ms after each click, on the pad
    const pad=document.getElementById("calibPad");
    for(let i=0;i<8;i++){const due=t0+0.8+i*0.6+0.10;while(a.engine.now()<due) await new Promise(r=>setTimeout(r,5));
      pad.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,pointerId:5}));}
    await new Promise(r=>setTimeout(r,1500));
    return {panel,text:document.getElementById("calibText").textContent,ms:parseInt(document.getElementById("latency").value,10)};});
  rec("sound-delay calibration measures a 100 ms delay", cal.panel&&cal.ms>=80&&cal.ms<=130, cal);
  await E(()=>{const l=document.getElementById("latency");l.value="0";l.dispatchEvent(new Event("input"));l.dispatchEvent(new Event("change"));});
  // backup: capture the exported file instead of downloading it
  const backup=await E(async()=>{let blob=null;const orig=URL.createObjectURL;URL.createObjectURL=(b)=>{blob=b;return orig.call(URL,b);};
    document.getElementById("btnExportData").click();await new Promise(r=>setTimeout(r,800));URL.createObjectURL=orig;
    return blob?await blob.text():null;});
  const bk=backup?JSON.parse(backup):null;
  rec("backup exports every store", bk&&bk.app==="piano-trainer"&&["pieces","settings","profiles","scores","fingerings","sessions"].every(k=>Array.isArray(bk.stores[k]))&&bk.stores.pieces.length>=3,
      bk?Object.fromEntries(Object.entries(bk.stores).map(([k,v])=>[k,v.length])):null);
  // remove the open piece, then restore it from the backup
  const rm=await E(async()=>{const pl=document.getElementById("pieceList");const o=[...pl.options].find(o=>/Minuet/.test(o.textContent));
    pl.value=o.value;pl.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));
    document.getElementById("btnDeletePiece").click();await new Promise(r=>setTimeout(r,500));
    return {status:document.getElementById("status").textContent,listed:[...pl.options].some(o=>/Minuet/.test(o.textContent)),stillOpen:document.getElementById("title").textContent};});
  rec("Remove takes the OPEN piece off the list (it stays open)", !rm.listed&&/Minuet/.test(rm.stillOpen)&&/Removed/.test(rm.status), rm);
  fs.writeFileSync("/tmp/audit-backup.json", backup||"{}");
  const imp=await pg.$("#importFile"); await imp.uploadFile("/tmp/audit-backup.json");
  await W(1200); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000}).catch(()=>{}); await W(3000);
  const restored=await E(()=>[...document.getElementById("pieceList").options].some(o=>/Minuet/.test(o.textContent)));
  rec("restoring the backup brings the removed piece back", restored, restored);
  const junk=await E(async()=>{const f=new File(["{\"hello\":1}"],"x.json",{type:"application/json"});const dt=new DataTransfer();dt.items.add(f);
    const inp=document.getElementById("importFile");inp.files=dt.files;inp.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,400));
    return document.getElementById("dataNote").textContent;});
  rec("a file that isn't a backup is refused with a clear message", /isn't a Piano Trainer backup/.test(junk), junk);

  // ================================================================ report
  await b.close(); srv.close();
  let cur2="", pass=0, fail=0;
  for (const r of results) {
    if (r.area!==cur2){cur2=r.area;console.log("\n"+r.area);}
    r.ok?pass++:fail++;
    console.log("  "+(r.ok?"✓":"✗")+" "+r.name+(r.ok?"":"   <- "+JSON.stringify(r.detail)));
  }
  console.log("\nuncaught page errors: "+(errors.length?[...new Set(errors)].join(" | "):"none"));
  console.log(pass+" working, "+fail+" not working");
  process.exit(0);
})();
