const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=process.argv[2]||"/home/claude/work/out";
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio"]});
  const pg=await b.newPage();
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  const res=await pg.evaluate(async()=>{
    const N=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], nm=(m)=>N[m%12]+(Math.floor(m/12)-1);
    const out=[];
    for (const k of Object.keys(window.PT.samples)) {
      const s=document.getElementById("sampleList"); s.value=k; s.dispatchEvent(new Event("change"));
      await new Promise(r=>setTimeout(r,2600));
      const song=window.PT.__app.song;
      for (const staff of [0,1]) {
        const g=new Map();
        for (const n of song.notes) { if(staff===0?n.staff!==0:n.staff<1) continue; const key=Math.round(n.startSec*1000); if(!g.has(key)) g.set(key,[]); g.get(key).push(n); }
        const onsets=[...g.keys()].sort((a,b)=>a-b).map(k=>g.get(k));
        for (let i=1;i<onsets.length;i++) {
          const a=onsets[i-1], c=onsets[i];
          if (a.length!==1||c.length!==1) continue;
          if (a[0].midi===c[0].midi && a[0].finger!==c[0].finger)
            out.push({piece:k,hand:staff?"LH":"RH",note:nm(c[0].midi),fingers:a[0].finger+"→"+c[0].finger,at:+c[0].startSec.toFixed(2),
                      context:onsets.slice(Math.max(0,i-4),i+4).map(x=>x.map(n=>nm(n.midi)+":"+n.finger).join("+")).join(" ")});
        }
      }
    }
    return {samples:Object.keys(window.PT.samples),hits:out};
  });
  console.log("samples:",res.samples.join(", "));
  if(!res.hits.length) console.log("no repeated note changes finger in any sample");
  for (const h of res.hits) console.log(`${h.piece.padEnd(10)} ${h.hand} ${h.note.padEnd(4)} ${h.fingers} at ${h.at}s   | ${h.context}`);
  await b.close(); srv.close(); process.exit(0);
})();
