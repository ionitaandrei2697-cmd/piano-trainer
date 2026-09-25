const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:1000});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber"); sc.value="2"; sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,400));
    const c=document.getElementById("rollCanvas"), ctx=c.getContext("2d");
    const grab=()=>Array.from(ctx.getImageData(0,0,c.width,c.height).data);
    const setGrid=async(on)=>{const e=document.getElementById("toggleGrid");e.checked=on;e.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,350));};
    await setGrid(true);  const on=grab();
    await setGrid(false); const off=grab();
    let diff=0; for(let i=0;i<on.length;i+=4) if(Math.abs(on[i]-off[i])>3||Math.abs(on[i+1]-off[i+1])>3) diff++;
    // find horizontal lines: rows where many pixels got brighter with the grid on
    const W=c.width,H=c.height; const rows=[];
    for(let y=0;y<H;y++){ let n=0;
      for(let x=0;x<W;x+=4){const i=(y*W+x)*4; if(on[i]-off[i]>6) n++;}
      if(n>W/8) rows.push(y);
    }
    // bar numbers are drawn as text near x=4
    await setGrid(true);
    return {changedPx:diff, lineRows:rows.length, sampleRows:rows.slice(0,8), H};
  });
  console.log("pixels changed by the beat grid :", out.changedPx);
  console.log("horizontal lines detected       :", out.lineRows, "at y =", out.sampleRows.join(","), "(canvas height "+out.H+")");
  console.log(out.changedPx>3000 && out.lineRows>=2 ? ">>> beat grid renders correctly" : ">>> GRID PROBLEM");
  await close(); process.exit(0);
})();
