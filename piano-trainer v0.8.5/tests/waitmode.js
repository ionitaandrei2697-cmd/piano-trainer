const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT="/home/claude/work/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".json":"application/json",".webmanifest":"application/manifest+json"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio","--autoplay-policy=no-user-gesture-required"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.setViewport({width:1440,height:830});
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  const E=(f,...a)=>pg.evaluate(f,...a);
  await E(async()=>{const s=document.getElementById("sampleList");s.value="scale";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));});
  const geom=()=>E(()=>({transport:getComputedStyle(document.querySelector(".transport")).display,score:Math.round(document.querySelector(".paper").getBoundingClientRect().height),
    notes:Math.round(document.querySelector(".rollwrap").getBoundingClientRect().height)}));
  await E(async()=>{const f=document.getElementById("modeFollow");f.checked=true;f.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,700));});
  const follow=await geom();     // compare like with like: Follow also shows the scoreboard
  await E(async()=>{const w=document.getElementById("modeWait");w.checked=true;w.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,700));});
  const wait=await geom();
  console.log("        Follow:",JSON.stringify(follow),"  Wait:",JSON.stringify(wait));
  chk("the transport bar is hidden in Wait mode", wait.transport==="none"&&follow.transport!=="none", {follow,wait});
  chk("its height goes to the panels", wait.score+wait.notes>follow.score+follow.notes+30, {follow,wait});
  const armed=await E(()=>({lit:[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi),status:document.getElementById("status").textContent,
    playing:window.PT.__app.transport.isPlaying}));
  chk("without pressing Play, the first key is already lit", armed.lit.includes(60)&&!armed.playing, armed);

  // play the whole scale, holding each note — never touching Play
  const keys=["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK"];
  const t0=Date.now();
  for (const k of keys) { await E(async(k)=>{document.dispatchEvent(new KeyboardEvent("keydown",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,560));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,650));},k); }
  await new Promise(r=>setTimeout(r,1500));
  const secs=(Date.now()-t0)/1000;
  const end=await E(()=>({correct:document.getElementById("scoreCorrect").textContent,hud:document.getElementById("hudText").textContent,
    lit:[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi),
    green:[...document.querySelectorAll("#sheetContainer g.vf-stavenote")].filter(g=>/59c2a0/i.test(g.querySelector(".vf-notehead path").getAttribute("fill"))).length}));
  chk("the whole piece plays through from the keyboard alone", end.correct==="8", end);
  chk("all eight noteheads are green on the score", end.green===8, end.green);
  chk("at the end it says how to go again, and lights the first key", /play the first note to go again/.test(end.hud)&&end.lit.includes(60), end);
  // sessions under 20 s are deliberately not saved, so read the counter while it runs:
  // replay the first 5 notes and look at the open session
  await E(async()=>{for(const k of ["KeyA","KeyS","KeyD","KeyF","KeyG"]){document.dispatchEvent(new KeyboardEvent("keydown",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,560));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,650));}});
  const open_=await E(()=>{const o=window.PT.__app.plog._open;return o?{mode:o.mode,s:+o.seconds.toFixed(1)}:null;});
  console.log("        open session after 5 notes (~6 s of playing):",JSON.stringify(open_));
  chk("Wait-mode practice time is counted (activity, not playhead motion)", open_&&open_.mode==="wait"&&open_.s>=4, open_);
  // back to the end, for the restart check
  await E(async()=>{for(const k of ["KeyH","KeyJ","KeyK"]){document.dispatchEvent(new KeyboardEvent("keydown",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,560));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:k,bubbles:true}));await new Promise(r=>setTimeout(r,650));} await new Promise(r=>setTimeout(r,1500));});
  // the first note after the end starts a fresh run; the score stays until then
  const again=await E(async()=>{document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));await new Promise(r=>setTimeout(r,560));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));await new Promise(r=>setTimeout(r,400));
    return {correct:document.getElementById("scoreCorrect").textContent,pos:+document.getElementById("scrubber").value,
      green:[...document.querySelectorAll("#sheetContainer g.vf-stavenote")].filter(g=>/59c2a0/i.test(g.querySelector(".vf-notehead path").getAttribute("fill"))).length};});
  chk("the first note after the end starts a fresh run", again.correct==="1"&&again.pos>0.3&&again.green===1, again);

  // regression: a real window resize must not leave the colours on a vanished score
  await pg.setViewport({width:1300,height:800}); await new Promise(r=>setTimeout(r,900));
  const rs=await E(async()=>{document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyS",bubbles:true}));await new Promise(r=>setTimeout(r,560));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyS",bubbles:true}));await new Promise(r=>setTimeout(r,400));
    return [...document.querySelectorAll("#sheetContainer g.vf-stavenote")].filter(g=>/59c2a0/i.test(g.querySelector(".vf-notehead path").getAttribute("fill"))).length;});
  chk("after resizing the window, played notes still colour the score", rs===2, rs);
  const knobs=await E(()=>["volume","noteSpeed","clickVol"].every(id=>!!document.querySelector("#settingsDialog #"+id)));
  chk("volume, fall speed and click volume are reachable in Settings", knobs);
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
