const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(process.argv[2]||require("path").join(__dirname,".."));
  for (const [w,h] of [[1440,900],[1280,800],[1512,982],[1024,768],[390,844]]) {
    await pg.setViewport({width:w,height:h,deviceScaleFactor:1});
    await pg.evaluate(async()=>{const s=document.getElementById("sampleList");
      if(s.value!=="minuetG"){s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));}
      const t=document.getElementById("toggleLabels"); if(!t.checked){t.checked=true;t.dispatchEvent(new Event("change"));}
      await new Promise(r=>setTimeout(r,500));});
    const r=await pg.evaluate(()=>{
      const inst=document.querySelector(".instrument").getBoundingClientRect();
      const kb=document.querySelector(".kbwrap").getBoundingClientRect();
      const svg=document.getElementById("keyboardSvg").getBoundingClientRect();
      const labels=[...document.querySelectorAll("#keyboardSvg text.pk-label")];
      const cut=labels.filter(l=>{const b=l.getBoundingClientRect(); return b.bottom>inst.bottom+0.5||b.bottom>svg.bottom+0.5;}).length;
      const sc=document.getElementById("sheetContainer");
      return {clip:+(kb.bottom-inst.bottom).toFixed(1), labels:labels.length, cut,
              kbH:Math.round(svg.height), rollH:Math.round(document.querySelector(".rollwrap").getBoundingClientRect().height),
              scoreH:Math.round(document.querySelector(".paper").getBoundingClientRect().height),
              bar: sc.offsetWidth-sc.clientWidth};
    });
    console.log(`${String(w)}x${String(h).padEnd(4)}  score=${String(r.scoreH).padStart(3)}  notes=${String(r.rollH).padStart(3)}  keys=${String(r.kbH).padStart(3)}  clipped=${r.clip>0.5?r.clip+"px":"no"}  labels cut off=${r.cut}/${r.labels}  score scrollbar=${r.bar}px`);
  }
  await close(); process.exit(0);
})();
