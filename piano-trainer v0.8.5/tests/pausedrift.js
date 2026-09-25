const {open}=require("./harness");
(async()=>{const {pg,close}=await open(require("path").join(__dirname,".."));
const r=await pg.evaluate(async()=>{
  const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));
  const out=[];
  for (let i=0;i<8;i++){
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,500+i*37));
    document.getElementById("btnPause").click();
    const a={ui:+document.getElementById("scrubber").value};
    await new Promise(r=>setTimeout(r,600));
    const b={ui:+document.getElementById("scrubber").value};
    out.push({uiJump:+(b.ui-a.ui).toFixed(4)});
  }
  // the transport itself, read through its own position getter via the time label pipeline:
  // pause, then sample the scrubber repeatedly over 1 s — it must be constant after the first frame
  document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,700));
  document.getElementById("btnPause").click();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));   // let the final frame land
  const samples=[]; for(let i=0;i<10;i++){ samples.push(+document.getElementById("scrubber").value); await new Promise(r=>setTimeout(r,100)); }
  return {out, samples, spread:Math.max(...samples)-Math.min(...samples)};
});
console.log("display change between 'just paused' and +600 ms:", r.out.map(o=>o.uiJump).join(", "));
console.log("after the final frame, 10 samples over 1 s -> spread", r.spread, r.spread===0?"(frozen: no drift)":"(DRIFTS)");
await close();process.exit(0);})();
