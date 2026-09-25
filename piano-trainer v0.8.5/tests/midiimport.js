const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=require("path").join(__dirname,".."); const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:(process.env.CHROME_PATH||undefined),args:["--no-sandbox","--mute-audio"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message)); await pg.setViewport({width:1440,height:830});
  const url="http://localhost:"+srv.address().port+"/index.html?debug";
  await pg.goto(url,{waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  const E=(f,...a)=>pg.evaluate(f,...a);
  await E(async()=>{const s=document.getElementById("profileSize");s.value="61";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));});
  const open=async(file)=>{const inp=await pg.$("#fileInput");await inp.uploadFile(file);await new Promise(r=>setTimeout(r,2600));};
  const state=()=>E(()=>{const a=window.PT.__app,s=a.song,r=window.PT.profiles.rangeFor(a.profile),T=a.profile.transpose||0;
    const prac=s.notes.filter(n=>!n.backing);
    const status=document.getElementById("status").textContent;      // read the load summary BEFORE Wait greets you
    const wait=document.getElementById("modeWait");wait.checked=true;wait.dispatchEvent(new Event("change",{bubbles:true}));
    const bad=a.practice.events.filter(e=>[...e.required].some(m=>m+T<r.low||m+T>r.high)).length;
    const back=document.getElementById("modeListen");back.checked=true;back.dispatchEvent(new Event("change",{bubbles:true}));
    return {status,prac:prac.length,backing:s.notes.filter(n=>n.backing).length,
      outside:prac.filter(n=>n.midi+T<r.low||n.midi+T>r.high).length,badGates:bad,gates:a.practice.events.length,
      backingAsked:a.practice.events.some(e=>[...e.required].some(m=>s.notes.some(n=>n.backing&&n.midi===m&&Math.abs(n.startSec-e.timeSec)<0.012&&!s.notes.some(x=>!x.backing&&x.midi===m&&Math.abs(x.startSec-e.timeSec)<0.012)))),
      backingFingers:s.notes.filter(n=>n.backing&&n.finger).length, backingHeard:s.notes.filter(n=>n.backing).every(n=>a.transport.noteFilter(n)),
      drums:(s.tracks||[]).filter(t=>t.percussion).map(t=>t.part), parts:(s.tracks||[]).map(t=>(t.name||"?")+":"+t.part).join(" "),
      rows:document.querySelectorAll("#midiParts .part").length, optsShown:!document.getElementById("midiOpts").classList.contains("is-hidden")};});

  console.log("[1] a full arrangement on 61 keys");
  await open(require("path").join(__dirname,"fixtures")+"/arrangement.mid");
  let st=await state();
  console.log("        "+st.status);
  chk("drums are left out", JSON.stringify(st.drums)==='["off"]', st.drums);
  chk("piano tracks are practised, the other instruments are backing", /Piano RH:practice Piano LH:practice Bass:backing Strings:backing/.test(st.parts), st.parts);
  chk("every practised note is on a key the keyboard has", st.outside===0, st.outside);
  chk("no Wait gate asks for a key the keyboard doesn't have", st.badGates===0&&st.gates>0, st);
  chk("backing is never asked, has no fingering, and is heard", !st.backingAsked&&st.backingFingers===0&&st.backingHeard, st);
  chk("the load summary says what happened", /backing: Bass, Strings/.test(st.status)&&/drums left out/.test(st.status)&&/moved in by an octave/.test(st.status), st.status);
  chk("Settings lists the tracks", st.optsShown&&st.rows===5, st);

  console.log("[2] a piano piece one octave too low: the whole part moves up");
  await open(require("path").join(__dirname,"fixtures")+"/lowpiano.mid");
  st=await state(); const rng=await E(()=>{const s=window.PT.__app.song;return s.range;});
  console.log("        "+st.status);
  chk("moved up one octave as a whole (nothing folded)", /moved up an octave to fit your 61 keys/.test(st.status)&&rng.minMidi===36&&rng.maxMidi===96, {status:st.status,rng});

  console.log("[3] fit off: notes you can't reach play by themselves");
  await E(async()=>{const t=document.getElementById("toggleFitKeys");t.checked=false;t.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));});
  st=await state();
  chk("with fitting off the low notes stay where they were written", st.outside>0, st.outside);
  chk("...but no gate asks for them, and the app plays them", st.badGates===0&&await E(()=>{const a=window.PT.__app;return a.song.notes.filter(n=>n.midi<36).every(n=>a.transport.noteFilter(n));}), st);
  chk("...and the summary says so", /will play by themselves/.test(st.status), st.status);

  console.log("[4] changing a part, and reopening a saved MIDI piece");
  await open(require("path").join(__dirname,"fixtures")+"/arrangement.mid");
  await E(async()=>{const sel=[...document.querySelectorAll("#midiParts select")].find(x=>x.closest(".part").textContent.includes("Bass"));
    sel.value="practice";sel.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,2600));});
  st=await state();
  chk("Bass switched to Practice becomes notes to play, fitted in", /Bass:practice/.test(st.parts)&&st.outside===0&&st.prac>24, st);
  await pg.reload({waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000}); await new Promise(r=>setTimeout(r,3500));
  st=await state();
  chk("after a reload the MIDI piece reopens by itself, with the part choice kept", /Bass:practice/.test(st.parts)&&/Loaded MIDI/.test(st.status), {parts:st.parts,status:st.status});
  const fromList=await E(async()=>{const pl=document.getElementById("pieceList");const o=[...pl.options].find(o=>/lowpiano|MIDI/i.test(o.textContent)&&!/Opening/.test(o.textContent));
    if(!o) return {opts:[...pl.options].map(x=>x.textContent)};pl.value=o.value;pl.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));
    return {status:document.getElementById("status").textContent};});
  chk("a saved MIDI piece opens from the Saved pieces list", /Loaded MIDI/.test(fromList.status||""), fromList);

  console.log("[5] a smaller keyboard re-fits the piece");
  await open(require("path").join(__dirname,"fixtures")+"/arrangement.mid");
  await E(async()=>{const s=document.getElementById("profileSize");s.value="49";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));});
  st=await state();
  chk("switching to 49 keys (C2-C6) re-fits every practised note", st.outside===0&&st.badGates===0&&/49 keys/.test(st.status), st);
  await E(async()=>{const s=document.getElementById("profileSize");s.value="61";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));});
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
