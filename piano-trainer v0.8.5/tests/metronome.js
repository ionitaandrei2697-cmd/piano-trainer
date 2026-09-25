/* Metronome: one toolbar toggle, settings, audible sound styles (rendered
 * offline and measured), spoken counts that start EARLY by each word's onset,
 * beat numbering, meter override, subdivisions, loop safety, persistence. */
const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=require("path").join(__dirname,"..");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json",".webmanifest":"application/manifest+json"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:(process.env.CHROME_PATH||undefined),args:["--no-sandbox","--mute-audio","--autoplay-policy=no-user-gesture-required"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  const E=(f,...a)=>pg.evaluate(f,...a);
  const set=(id,v)=>E((id,v)=>{const e=document.getElementById(id);e.value=v;e.dispatchEvent(new Event("change"));},id,v);

  console.log("[1] one toggle in the toolbar, the rest in Settings");
  const ui=await E(()=>({toolbarMetro:[...document.querySelectorAll(".rail input[type=checkbox]")].map(e=>e.id),
    oldCountIn:!!document.getElementById("toggleCountIn"),
    settings:["countInMode","metroSound","metroMeter","metroSub","metroLang","clickVol","btnMetroPreview"].every(id=>!!document.querySelector("#settingsDialog #"+id)),
    sounds:[...document.getElementById("metroSound").options].map(o=>o.value)}));
  chk("the toolbar has exactly one metronome toggle", JSON.stringify(ui.toolbarMetro)==='["toggleMetronome"]'&&!ui.oldCountIn, ui);
  chk("Settings holds count-in, sound, voice, beats, subdivisions, volume, preview", ui.settings);
  chk("sounds: classic, wood block, tick, bell, cowbell, voice", JSON.stringify(ui.sounds)==='["classic","woodblock","tick","bell","cowbell","voice"]', ui.sounds);

  console.log("[2] every sound style is audible (rendered offline, RMS measured)");
  const rms=await E(async()=>{
    const out={};
    for (const style of ["classic","woodblock","tick","bell","cowbell"]) {
      const ctx=new OfflineAudioContext(1,Math.floor(44100*0.9),44100);
      const fake={ctx,_clickBus:ctx.destination,metro:{sound:style,countIn:"off",lang:"en"}};
      const p=window.PT.AudioEngine.prototype._makeClickPlayer.call(fake);
      p.event(0.1,{kind:"beat",beat:1,accent:true}); p.event(0.5,{kind:"sub",subdiv:2});
      const buf=await ctx.startRendering(); const d=buf.getChannelData(0);
      let s=0; for(const v of d) s+=v*v; out[style]=+(Math.sqrt(s/d.length)).toFixed(4);
    }
    return out;});
  console.log("        RMS:",JSON.stringify(rms));
  chk("classic, wood block, tick, bell and cowbell all make sound", Object.values(rms).every(v=>v>0.002), rms);

  console.log("[3] the voice: clips load, and each word starts early by its onset");
  const voice=await E(async()=>{
    const ctx=new OfflineAudioContext(1,Math.floor(44100*1.6),44100);
    const fake={ctx,_clickBus:ctx.destination,metro:{sound:"voice",countIn:"off",lang:"en"}};
    const p=window.PT.AudioEngine.prototype._makeClickPlayer.call(fake);
    await p.preloadVoice();
    const starts=[]; const orig=ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource=()=>{const s=orig();const st=s.start.bind(s);s.start=(t,...r)=>{starts.push(+t.toFixed(4));return st(t,...r);};return s;};
    p.event(0.30,{kind:"beat",beat:3,accent:false});      // "three": fricative, late vowel
    p.event(1.10,{kind:"beat",beat:8,accent:false});      // "eight": vowel first
    const buf=await ctx.startRendering(); const d=buf.getChannelData(0);
    const firstSound=(from,to)=>{for(let i=Math.floor(from*44100);i<to*44100;i++) if(Math.abs(d[i])>0.01) return +(i/44100).toFixed(3); return null;};
    return {langs:Object.keys(window.PT_VOICE||{}),words:Object.keys((window.PT_VOICE||{}).ro||{}).length,
            onsets:{three:window.PT_VOICE.en["3"].onset,eight:window.PT_VOICE.en["8"].onset},starts,
            heard:{three:firstSound(0.1,0.6),eight:firstSound(0.9,1.4)}};});
  console.log("        starts:",JSON.stringify(voice.starts),"onsets:",JSON.stringify(voice.onsets),"first sound:",JSON.stringify(voice.heard));
  chk("English and Română counts are available (1-8 + and/și)", voice.langs.includes("en")&&voice.langs.includes("ro")&&voice.words===9, voice);
  chk("'three' starts before its beat by its onset", Math.abs(voice.starts[0]-(0.30-voice.onsets.three))<0.002, voice);
  chk("'eight' (vowel-first) starts almost on the beat", Math.abs(voice.starts[1]-(1.10-voice.onsets.eight))<0.002&&voice.onsets.eight<voice.onsets.three, voice);
  chk("the words are actually audible", voice.heard.three!=null&&voice.heard.eight!=null, voice.heard);

  console.log("[4] beats, accents, meter override, subdivisions — through the real transport");
  await E(async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));});
  const record=async()=>E(async()=>{const a=window.PT.__app,eng=a.engine;const ev=[];const orig=eng.metronomeAt.bind(eng);
    eng.metronomeAt=(t,e)=>{ev.push(e);return orig(t,e);};
    const m=document.getElementById("toggleMetronome");m.checked=true;m.dispatchEvent(new Event("change"));
    document.getElementById("btnPlay").click();await new Promise(r=>setTimeout(r,2300));document.getElementById("btnStop").click();
    eng.metronomeAt=orig;m.checked=false;m.dispatchEvent(new Event("change"));
    return {beats:ev.filter(e=>e.kind==="beat").map(e=>e.beat+(e.accent?"!":"")).join(" "),subs:ev.filter(e=>e.kind==="sub").length,n:ev.filter(e=>e.kind==="beat").length};});
  await set("countInMode","off");
  const m34=await record();
  console.log("        3/4 from the score:",m34.beats);
  chk("the Minuet counts 1 2 3 with the accent on 1", /^1! 2 3 1!( 2)?/.test(m34.beats)&&!/4/.test(m34.beats), m34);
  await set("metroMeter","4/4");
  const m44=await record();
  console.log("        forced 4/4:        ",m44.beats);
  chk("Beats per bar = 4/4 overrides the score", /^1! 2 3 4 1!/.test(m44.beats), m44);
  await set("metroMeter","auto"); await set("metroSub","3");
  const sub=await record();
  chk("Subdivide in 3 adds two soft ticks per beat", sub.subs>=2*(sub.n-1)&&sub.subs<=2*sub.n, sub);
  await set("metroSub","1");

  console.log("[5] count-in with the voice");
  await set("metroLang","ro"); await set("countInMode","voice");
  const ci=await E(async()=>{const a=window.PT.__app,eng=a.engine;const ev=[];const orig=eng.metronomeAt.bind(eng);
    eng.metronomeAt=(t,e)=>{ev.push({t:+(t-eng.now()).toFixed(3),...e});return orig(t,e);};
    document.getElementById("btnPlay").click();await new Promise(r=>setTimeout(r,120));
    const during={pos:a.transport.position,skip:!document.getElementById("btnSkipCountIn").classList.contains("is-hidden")};
    await new Promise(r=>setTimeout(r,3200));document.getElementById("btnStop").click();eng.metronomeAt=orig;
    return {during,countIn:ev.filter(e=>e.countIn).map(e=>e.beat),firstLead:ev.length?ev[0].t:null,voiceReady:!!eng._click&&!!window.PT_VOICE};});
  console.log("        count-in beats:",JSON.stringify(ci.countIn),"first word scheduled",ci.firstLead,"s ahead");
  chk("the count-in counts one bar (1 2 3 in 3/4) before the music", JSON.stringify(ci.countIn)==="[1,2,3]"&&ci.during.pos===0&&ci.during.skip, ci);
  chk("the first word is scheduled early enough to start before its beat", ci.firstLead>=0.12, ci.firstLead);

  console.log("[6] Hear it, and persistence");
  const prev=await E(async()=>{const eng=window.PT.__app.engine;let n=0;const orig=eng.metronomeAt.bind(eng);eng.metronomeAt=(t,e)=>{n++;return orig(t,e);};
    document.getElementById("btnMetroPreview").click();await new Promise(r=>setTimeout(r,400));eng.metronomeAt=orig;return n;});
  chk("'Hear it' plays one bar", prev===3, prev);
  await set("metroSound","bell");
  await pg.reload({waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000}); await new Promise(r=>setTimeout(r,1500));
  const kept=await E(()=>({ci:document.getElementById("countInMode").value,sound:document.getElementById("metroSound").value,lang:document.getElementById("metroLang").value,
    engine:window.PT.__app.engine.metro}));
  chk("settings survive a reload and reach the engine", kept.ci==="voice"&&kept.sound==="bell"&&kept.lang==="ro"&&kept.engine.sound==="bell", kept);
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
