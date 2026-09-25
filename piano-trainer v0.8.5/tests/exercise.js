const {open}=require("./harness");
const ROOT=process.argv[2]||require("path").join(__dirname,"..");
(async()=>{
  const {pg,logs,close}=await open(ROOT);
  const report=[];
  const R=async(name,fn)=>{ try{ const v=await pg.evaluate(fn); report.push([name,v]); }catch(e){ report.push([name,"THREW: "+e.message]); } };

  await R("load sample",async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,3000));return document.getElementById("status").textContent;});
  await R("play 1.2s + positions",async()=>{
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,1200));
    const t=document.getElementById("timeNow").textContent;
    document.getElementById("btnPause").click(); return t;});
  await R("seek via scrubber",async()=>{const s=document.getElementById("scrubber");s.value="4";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,200));return document.getElementById("timeNow").textContent;});
  await R("wait mode + gate",async()=>{
    document.getElementById("btnStop").click();
    document.getElementById("modeWait").checked=true; document.getElementById("modeWait").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,500));
    return document.getElementById("status").textContent;});
  await R("follow mode scoring",async()=>{
    document.getElementById("btnStop").click();
    document.getElementById("modeFollow").checked=true; document.getElementById("modeFollow").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,900));
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",bubbles:true}));
    document.dispatchEvent(new KeyboardEvent("keyup",{key:"a",bubbles:true}));
    await new Promise(r=>setTimeout(r,300)); document.getElementById("btnPause").click();
    return {c:document.getElementById("scoreCorrect").textContent,w:document.getElementById("scoreWrong").textContent,m:document.getElementById("scoreMissed").textContent};});
  await R("repeat bars 1-3",async()=>{
    document.getElementById("btnStop").click();
    const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo");
    f.value="1"; t.value="3"; t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    return document.getElementById("loopInfo").textContent;});
  await R("export midi (no download, just call)",async()=>{
    try{ const bytes=window.PT.xmlToMIDI.songToMIDI({notes:[{midi:60,startSec:0,durSec:1,staff:0}],defaultBpm:120,title:"x"}); return "bytes="+bytes.length; }catch(e){return "THREW "+e.message;}});
  await R("keyboard size change",async()=>{const s=document.getElementById("profileSize");s.value="61";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));return "ok";});
  await R("transpose change",async()=>{const s=document.getElementById("profileTranspose");s.value="12";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));return "ok";});
  await R("toggle views off/on",async()=>{
    for(const id of ["toggleSheet","toggleRoll","toggleKeyboard"]){const e=document.getElementById(id);e.checked=false;e.dispatchEvent(new Event("change"));}
    await new Promise(r=>setTimeout(r,200));
    for(const id of ["toggleSheet","toggleRoll","toggleKeyboard"]){const e=document.getElementById(id);e.checked=true;e.dispatchEvent(new Event("change"));}
    await new Promise(r=>setTimeout(r,300)); return "ok";});
  await R("zoom",async()=>{const z=document.getElementById("zoom");z.value="1.5";z.dispatchEvent(new Event("input"));z.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,800));return "ok";});
  report.forEach(([n,v])=>console.log(String(n).padEnd(28), typeof v==="object"?JSON.stringify(v):v));
  console.log("\n--- page errors ---");
  const errs=logs.filter(l=>l.startsWith("PAGEERROR")||l.startsWith("error:"));
  console.log(errs.length?[...new Set(errs)].join("\n"):"(none)");
  await close(); process.exit(0);
})();
