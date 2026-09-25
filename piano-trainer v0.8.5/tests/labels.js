const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:1000});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber"); sc.value="2.2"; sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,400));
    const c=document.getElementById("rollCanvas"), cx=c.getContext("2d");
    const darkGlyphPx=()=>{const d=cx.getImageData(0,0,c.width,c.height).data;let n=0;
      for(let i=0;i<d.length;i+=4){ if(d[i]<45&&d[i+1]<50&&d[i+2]<60 && (d[i]+d[i+1]+d[i+2])>0) n++; } return n;};
    const kbLabels=()=>document.querySelectorAll("#keyboardSvg text.pk-label").length;
    const t=document.getElementById("toggleLabels");
    t.checked=false; t.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,400));
    const off={keys:kbLabels(), rollDark:darkGlyphPx()};
    t.checked=true; t.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,500));
    const on={keys:kbLabels(), rollDark:darkGlyphPx()};
    const sample=[...document.querySelectorAll("#keyboardSvg text.pk-label")].slice(0,8).map(e=>e.textContent);
    return {off,on,sample};
  });
  console.log("labels OFF : keyboard labels =", out.off.keys, " | roll dark-glyph px =", out.off.rollDark);
  console.log("labels ON  : keyboard labels =", out.on.keys, " | roll dark-glyph px =", out.on.rollDark);
  console.log("sample key labels:", out.sample.join(" "));
  const rollUnchanged = Math.abs(out.on.rollDark-out.off.rollDark) < out.off.rollDark*0.02 + 50;
  console.log(out.on.keys>40 && out.off.keys===0 ? "  PASS  note names appear on the KEYS only" : "  FAIL  keyboard labels wrong");
  console.log(rollUnchanged ? "  PASS  the falling notes are unaffected by the toggle" : "  FAIL  the roll still draws labels");
  await close(); process.exit(0);
})();
