const {open}=require("./harness");
const ROOT=process.argv[2]||"/home/claude/work/out";
(async()=>{
  const {pg,close}=await open(ROOT);
  await pg.setViewport({width:1440,height:1000});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3200));
    const sc=document.getElementById("scrubber"), dur=parseFloat(sc.max);
    const cur=()=>document.getElementById("cursorImg-0");
    const svg=()=>document.querySelector("#sheetContainer svg");
    // A notehead is on the cursor's system when its centre lies inside the
    // cursor's own vertical extent — the cursor spans the whole grand staff.
    const errAt=async(t)=>{
      sc.value=String(t); sc.dispatchEvent(new Event("change"));
      await new Promise(r=>setTimeout(r,230));
      const cb=cur().getBoundingClientRect(); const cx=cb.x+cb.width/2;
      let best=null,bd=1e9;
      for(const g of svg().querySelectorAll("g.vf-stavenote")){
        const b=g.getBoundingClientRect(), y=b.y+b.height/2;
        if(y<cb.y||y>cb.y+cb.height) continue;
        const d=Math.abs(b.x+b.width/2-cx); if(d<bd){bd=d;best=b.x+b.width/2;}
      }
      return best==null?null:+(cx-best).toFixed(1);
    };
    const run=async(n)=>{const a=[];for(let i=0;i<n;i++){const e=await errAt(dur*(i+0.5)/n); if(e!=null)a.push(e);}return a;};
    const z100=await run(14);
    const z=document.getElementById("zoom");
    z.value="2"; z.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,1800));
    const z200=await run(10);
    z.value="0.7"; z.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,1600));
    const z70=await run(10);
    return {z100,z200,z70, cursorW:+cur().getBoundingClientRect().width.toFixed(1)};
  });
  const w=(a)=>a.length?Math.max(...a.map(Math.abs)).toFixed(1):"n/a";
  console.log("cursor bar width   :", out.cursorW+"px  (it should COVER the notehead, so error < half this is dead-on)");
  console.log("zoom  70%  n="+String(out.z70.length).padStart(2)+"  worst error:", w(out.z70)+"px");
  console.log("zoom 100%  n="+String(out.z100.length).padStart(2)+"  worst error:", w(out.z100)+"px");
  console.log("zoom 200%  n="+String(out.z200.length).padStart(2)+"  worst error:", w(out.z200)+"px");
  await close(); process.exit(0);
})();
