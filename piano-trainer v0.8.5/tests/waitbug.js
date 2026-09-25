const {open}=require("./harness");
const ROOT=process.argv[2]||"/home/claude/work/out";
(async()=>{
  const {pg,close}=await open(ROOT);
  await pg.setViewport({width:1440,height:900});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    document.getElementById("modeWait").checked=true;
    document.getElementById("modeWait").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    document.getElementById("btnPlay").click();
    await new Promise(r=>setTimeout(r,400));
    const log=[];
    const expected=()=>[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi).sort((a,b)=>a-b);
    const pos=()=>+document.getElementById("scrubber").value;
    // C major scale: 60,62,64,65,67,69,71,72
    const MAP={60:"a",62:"s",64:"d",65:"f",67:"g",69:"h",71:"j",72:"k"};
    // wait until a gate is actually open (the app is idle between gates)
    const untilGate=async()=>{ for(let i=0;i<60;i++){ if(expected().length) return true;
      await new Promise(r=>setTimeout(r,50)); } return false; };
    for (let i=0;i<5;i++){
      if(!await untilGate()) { log.push({playhead:+pos().toFixed(3), keyboardWants:["<no gate opened>"]}); break; }
      const want=expected();
      log.push({playhead:+pos().toFixed(3), keyboardWants:want});
      const key=MAP[want[0]];
      if(!key) break;
      document.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));
      await new Promise(r=>setTimeout(r,520));   // a quarter note must be HELD now
      document.dispatchEvent(new KeyboardEvent("keyup",{key,bubbles:true}));
      await new Promise(r=>setTimeout(r,120));
    }
    return log;
  });
  console.log("step | playhead | keys highlighted");
  out.forEach((l,i)=>console.log("  "+i+"   |  "+String(l.playhead).padStart(6)+"  | "+JSON.stringify(l.keyboardWants)));
  const wanted=out.map(l=>l.keyboardWants[0]);
  const expectSeq=[60,62,64,65,67];
  const inSync = out.every((l,i)=>l.keyboardWants[0]===expectSeq[i]) && out[out.length-1].playhead>out[0].playhead+0.1;
  console.log(inSync ? "\n>>> IN SYNC: the highlighted key matches the note at the playhead, every step"
                     : "\n>>> OUT OF SYNC: got "+JSON.stringify(wanted)+" expected "+JSON.stringify(expectSeq.slice(0,out.length)));
  await close(); process.exit(0);
})();
