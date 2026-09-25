/* Regression test for real-world MIDI files, on a synthetic fixture with the
 * structure of the uploaded "The World": meter changes, a few bass notes below
 * C2 (some in octaves), and chords too wide for one hand. */
const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=process.argv[2]||"/home/claude/work/out"; const FIX=path.join(__dirname,"fixtures","Mixed_Meter_Test.mid");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio","--autoplay-policy=no-user-gesture-required"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message)); await pg.setViewport({width:1440,height:830});
  await pg.evaluateOnNewDocument(()=>{
    const inp={id:"k",name:"USB-MIDI",state:"connected",connection:"open",type:"input",onmidimessage:null};
    navigator.requestMIDIAccess=()=>Promise.resolve({inputs:new Map([["k",inp]]),outputs:new Map(),onstatechange:null});
    window.__midi=(bytes)=>{ if(inp.onmidimessage) inp.onmidimessage({data:new Uint8Array(bytes),timeStamp:performance.now()}); };
  });
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  await pg.evaluate(async()=>{const s=document.getElementById("profileSize");s.value="61";s.dispatchEvent(new Event("change"));document.getElementById("btnMidi").click();await new Promise(r=>setTimeout(r,300));});
  const open=async()=>{const inp=await pg.$("#fileInput");await inp.uploadFile(FIX);await pg.waitForFunction("document.getElementById('status').textContent.startsWith('Loaded')",{timeout:20000});await new Promise(r=>setTimeout(r,300));};
  await open();
  const r=await pg.evaluate(()=>{const a=window.PT.__app,s=a.song,rg=window.PT.profiles.rangeFor(a.profile),prac=s.notes.filter(n=>!n.backing&&!n.unreachable);
    const g=new Map(); for(const n of prac){const k=Math.round(n.startSec*1000)+(n.staff===0?"R":"L"); if(!g.has(k)) g.set(k,[]); g.get(k).push(n.midi);}
    const cfg=a.transport.metronome; const beats=[]; for(let k=0;k<9;k++) beats.push(cfg.beatInBar(k));
    return {title:document.getElementById("title").textContent,status:document.getElementById("status").textContent,
      meters:s.bars.map(b=>b.beats+"/"+b.beatUnit).join(" "),bar1:+(s.bars[0].endSec-s.bars[0].startSec).toFixed(3),
      top:Math.max(...prac.filter(n=>n.staff===0).map(n=>n.midi)),outside:prac.filter(n=>n.midi<rg.low||n.midi>rg.high).length,
      fit:s.fitResult,reach:s.reach,wide:[...g.values()].filter(v=>Math.max(...v)-Math.min(...v)>13).length,beats:beats.join(""),
      saved:[...document.getElementById("pieceList").options].filter(o=>/Mixed Meter/.test(o.textContent)).length};});
  console.log("        "+r.status);
  chk("title comes from the file name, tidied", r.title==="Mixed Meter Test", r.title);
  chk("bars follow every time signature (5/8 4/4 4/4 9/8 4/4 23/16 4/4)", r.meters.startsWith("5/8 4/4 4/4 9/8 4/4 23/16 4/4"), r.meters);
  chk("the 5/8 first bar lasts 1.25 s at 120 bpm", Math.abs(r.bar1-1.25)<0.002, r.bar1);
  chk("the metronome counts the real bars (5 in the 5/8 bar, then 4)", r.beats.startsWith("123451234"), r.beats);
  chk("few notes outside: only those move, the melody stays where written (top A5)", r.fit&&r.fit.folded>0&&!r.fit.shift&&r.top===81, {fit:r.fit,top:r.top});
  chk("octave basses merge when the low note moves up", r.fit&&r.fit.merged>=2, r.fit);
  chk("chords too wide for one hand are shared with the other", r.reach&&r.reach.moved===2&&r.wide===0, {reach:r.reach,wide:r.wide});
  chk("nothing practised lies outside the keyboard", r.outside===0, r.outside);
  await open();
  const again=await pg.evaluate(()=>[...document.getElementById("pieceList").options].filter(o=>/Mixed Meter/.test(o.textContent)).length);
  chk("opening the same file again reuses its saved piece (no duplicate)", again===1, again);
  const play=await pg.evaluate(async()=>{const a=window.PT.__app;
    const lm=document.getElementById("lengthMode"); lm.value="report"; lm.dispatchEvent(new Event("change"));
    const w=document.getElementById("modeWait"); w.checked=true; w.dispatchEvent(new Event("change",{bubbles:true}));
    const t=document.getElementById("tempo"); t.value=t.max; t.dispatchEvent(new Event("input")); await new Promise(r=>setTimeout(r,300));
    const p=a.practice, total=p.events.length; const T=a.profile.transpose||0;
    while (p.gateIndex<total) { const idx=p.gateIndex, keys=[...p.events[idx].required].map(m=>m+T);
      for (const k of keys) window.__midi([0x90,k,90]); await new Promise(r=>setTimeout(r,25)); for (const k of keys) window.__midi([0x80,k,0]);
      const until=performance.now()+6000; while (p.gateIndex===idx&&performance.now()<until) await new Promise(r=>setTimeout(r,8));
      if (p.gateIndex===idx) return {stuck:idx,total}; }
    return {cleared:p.gateIndex,total,wrong:p.score.wrong};});
  chk("the whole piece can be played through in Wait mode on 61 keys", !play.stuck&&play.cleared===play.total&&play.wrong===0, play);
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
