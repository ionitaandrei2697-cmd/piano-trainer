const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:1000});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber"); sc.value="2"; sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,400));

    const c=document.getElementById("rollCanvas");
    const ctx=c.getContext("2d");
    const px=(x,y)=>{const d=ctx.getImageData(Math.round(x),Math.round(y),1,1).data;return [d[0],d[1],d[2]];};
    const img=ctx.getImageData(0,0,c.width,c.height).data;
    // count distinctly-coloured pixel families
    let amber=0, teal=0, gridline=0, bright=0;
    for(let i=0;i<img.length;i+=4){
      const r=img[i],g=img[i+1],b=img[i+2];
      if(r>180&&g>120&&b<120) amber++;
      else if(r<120&&g>140&&b>130) teal++;
      else if(Math.abs(r-g)<6&&Math.abs(g-b)<6&&r>18&&r<40) gridline++;
      if(r>200&&g>180) bright++;
    }
    // does the grid actually change anything? toggle it off and re-measure
    const before=amber+teal;
    document.getElementById("toggleGrid").checked=false;
    document.getElementById("toggleGrid").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    const img2=ctx.getImageData(0,0,c.width,c.height).data;
    let gridline2=0;
    for(let i=0;i<img2.length;i+=4){
      const r=img2[i],g=img2[i+1],b=img2[i+2];
      if(Math.abs(r-g)<6&&Math.abs(g-b)<6&&r>18&&r<40) gridline2++;
    }
    document.getElementById("toggleGrid").checked=true;
    document.getElementById("toggleGrid").dispatchEvent(new Event("change"));

    // note-name labels on the roll
    document.getElementById("toggleLabels").checked=true;
    document.getElementById("toggleLabels").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    const img3=ctx.getImageData(0,0,c.width,c.height).data;
    let dark=0; for(let i=0;i<img3.length;i+=4){ if(img3[i]<60&&img3[i+1]<45&&img3[i+2]<25) dark++; }

    // layout sanity: nothing overflows horizontally
    const de=document.documentElement;
    const overflow = de.scrollWidth - de.clientWidth;

    // shortcut dialog opens
    document.getElementById("btnHelp").click();
    const dlgOpen = document.getElementById("helpDialog").open === true;
    document.getElementById("btnHelpClose").click();

    const panels = ["sheetPanel","rollPanel","keyboardPanel","scorePanel","logPanel"].map(id=>{
      const e=document.getElementById(id); const r=e.getBoundingClientRect();
      return {id, w:Math.round(r.width), h:Math.round(r.height), hidden:e.classList.contains("is-hidden")};
    });
    return {amber,teal,gridWithGrid:gridline,gridWithout:gridline2,labelDarkPx:dark,overflow,dlgOpen,panels,
            logBars:document.getElementById("logChart").children.length};
  });
  console.log("falling-note pixels   : amber(RH)="+out.amber+"  teal(LH)="+out.teal);
  console.log("beat-grid pixels      : grid on="+out.gridWithGrid+"  grid off="+out.gridWithout+
              "  -> "+(out.gridWithGrid>out.gridWithout*1.5?"grid renders":"NO VISIBLE GRID"));
  console.log("note-name label pixels: "+out.labelDarkPx+" (dark glyphs on the note bodies)");
  console.log("horizontal overflow   : "+out.overflow+" px");
  console.log("shortcuts dialog opens: "+out.dlgOpen);
  console.log("practice-log columns  : "+out.logBars);
  console.log("panel sizes           :"); out.panels.forEach(p=>console.log("   ",p.id.padEnd(15),p.w+"x"+p.h,p.hidden?"(hidden)":""));
  await close(); process.exit(0);
})();
