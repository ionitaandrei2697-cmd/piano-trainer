const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT="/home/claude/work/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.setViewport({width:1440,height:830});
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  const r=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="twinkle"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2800));
    const a=window.PT.__app, song=a.song;
    const moves=song.notes.filter(n=>n.handMove).map(n=>({t:+n.startSec.toFixed(2),midi:n.midi,kind:n.handMove,staff:n.staff}));
    const jump=moves.find(m=>m.kind==="jump");
    // put the first jump just above the keys
    // seek the way a player does (the scrubber), which also redraws the view
    const sc=document.getElementById("scrubber"); sc.value=String(Math.max(0,jump.t-0.4)); sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    // ivory marks (R,G,B all high and near each other); the difference on/off isolates them
    const amber=()=>{a.roll.render(a.transport.position);const c=document.getElementById("rollCanvas"),x=c.getContext("2d"),d=x.getImageData(0,0,c.width,c.height).data;let n=0;
      for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2];if(R>215&&G>208&&B>192&&R-B<40)n++;}return n;};
    const on=amber();
    const t=document.getElementById("toggleMoves"); t.checked=false; t.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,200));
    const off=amber();
    t.checked=true; t.dispatchEvent(new Event("change"));
    return {moves,handMoves:song.handMoves,on,off,inSettings:!!document.querySelector("#settingsDialog #toggleMoves")};
  });
  console.log("        hand moves in Twinkle:",JSON.stringify(r.moves));
  chk("the optimiser marks where the hand moves (jumps and passes)", r.moves.some(m=>m.kind==="jump")&&r.moves.some(m=>m.kind==="pass"), r.moves);
  console.log("        ivory pixels with marks on:",r.on," off:",r.off);
  chk("a jump is drawn on the falling notes", r.on>r.off+15, {on:r.on,off:r.off});
  chk("the Hand moves toggle lives in Settings → Show and hides the marks", r.inSettings&&r.off<r.on, r);
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
