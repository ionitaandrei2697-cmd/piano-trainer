const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open("/home/claude/work/out");
  for (const [w,h] of [[1440,900],[1280,800],[1200,900],[1512,982],[1024,768],[390,844]]) {
    await pg.setViewport({width:w,height:h,deviceScaleFactor:1});
    await pg.evaluate(async()=>{const s=document.getElementById("sampleList");if(s.value!=="minuetG"){s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));}
      await new Promise(r=>setTimeout(r,400));});
    const r=await pg.evaluate(()=>{
      const g=(s)=>{const e=document.querySelector(s);const b=e.getBoundingClientRect();return {t:Math.round(b.top),b:Math.round(b.bottom),h:Math.round(b.height)};};
      const kb=g(".kbwrap"), tr=g(".transport"), pa=g(".paper"), ro=g(".rollwrap"), ra=g(".rail");
      return {vh:window.innerHeight, rail:ra.h, paper:pa.h, roll:ro.h, kbBottom:kb.b, trBottom:tr.b,
              allVisible: kb.b<=window.innerHeight+1 && tr.b<=window.innerHeight+1,
              cw:Math.round(document.getElementById("rollCanvas").getBoundingClientRect().height)};
    });
    console.log(`${String(w).padStart(4)}x${String(h).padEnd(4)}  toolbar=${String(r.rail).padStart(3)}  score=${String(r.paper).padStart(3)}  notes=${String(r.roll).padStart(3)}  keys bottom=${String(r.kbBottom).padStart(4)}/${r.vh}  ->  ${r.allVisible?"ALL THREE VIEWS + TRANSPORT FIT":"still below the fold"}`);
  }
  await close(); process.exit(0);
})();
