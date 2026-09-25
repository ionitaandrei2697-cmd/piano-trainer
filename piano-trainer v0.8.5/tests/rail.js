const {open}=require("./harness");
(async()=>{const {pg,close}=await open("/home/claude/work/out");
for (const w of [1440,1360,1280]) { await pg.setViewport({width:w,height:900});
  await new Promise(r=>setTimeout(r,300));
  const r=await pg.evaluate(()=>{const rail=document.querySelector(".rail");const groups=[...rail.querySelectorAll(".rail__group")];
    const tops=new Set(groups.map(g=>Math.round(g.getBoundingClientRect().top)));
    return {h:Math.round(rail.getBoundingClientRect().height),rows:tops.size,scrollable:rail.scrollWidth>rail.clientWidth+2};});
  console.log(w+"px  toolbar "+r.h+"px  rows="+r.rows+"  swipe-row="+r.scrollable);}
await close();process.exit(0);})();
