const {open}=require("./harness");
const ROOT=process.argv[2]||require("path").join(__dirname,"..");
(async()=>{
  const {pg,close}=await open(ROOT);
  for (const [w,h] of [[1440,900],[1280,800],[1512,982],[1024,768]]) {
    await pg.setViewport({width:w,height:h,deviceScaleFactor:1});
    await pg.evaluate(async()=>{const s=document.getElementById("sampleList");
      if(s.value!=="minuetG"){s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));}
      await new Promise(r=>setTimeout(r,500));});
    const r=await pg.evaluate(()=>{
      const sc=document.getElementById("sheetContainer"), svg=sc.querySelector("svg");
      const box=sc.getBoundingClientRect();
      // find the two staves of the first system: cluster note/stem paths by y
      const ys=[];
      for(const g of svg.querySelectorAll("g.vf-stavenote")){const b=g.getBoundingClientRect();ys.push([b.top,b.bottom]);}
      ys.sort((a,b)=>a[0]-b[0]);
      const systems=[]; let cur=null;
      for(const [a,b] of ys){ if(!cur||a>cur[1]+45){cur=[a,b];systems.push(cur);} else cur[1]=Math.max(cur[1],b); }
      const sys=systems[0];
      const visTop=Math.max(sys[0],box.top), visBot=Math.min(sys[1],box.bottom);
      const visible=Math.max(0,visBot-visTop), total=sys[1]-sys[0];
      // is the LOWER staff (bass / left hand) visible? use the lower half
      const bassTop=sys[0]+total*0.55;
      const bassVisible = bassTop < box.bottom && sys[1] <= box.bottom + 2;
      const kb=document.querySelector(".kbwrap").getBoundingClientRect();
      return {panelH:Math.round(box.height), systemH:Math.round(total),
              visiblePct:Math.round(100*visible/total), bassVisible,
              allFit: kb.bottom<=window.innerHeight+1};
    });
    console.log(`${String(w)}x${String(h).padEnd(4)}  score panel=${String(r.panelH).padStart(3)}px  grand staff=${r.systemH}px  visible=${String(r.visiblePct).padStart(3)}%  left-hand staff ${r.bassVisible?"VISIBLE":"CUT OFF"}   three views fit: ${r.allFit}`);
  }
  await close(); process.exit(0);
})();
