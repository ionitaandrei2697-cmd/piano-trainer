const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1200,height:900,deviceScaleFactor:1});
  await pg.evaluate(async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber");sc.value="2.2";sc.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,400));});
  const rects=await pg.evaluate(()=>{
    const g=(sel)=>{const e=document.querySelector(sel); if(!e) return null; const r=e.getBoundingClientRect();
      return {sel, x:Math.round(r.x),y:Math.round(r.y+window.scrollY),w:Math.round(r.width),h:Math.round(r.height)};};
    return [".masthead",".nowplaying",".rail",".paper",".rollwrap",".kbwrap",".transport"].map(g).filter(Boolean);
  });
  await pg.screenshot({path:require("path").join(require("os").tmpdir(),"compose.png"),fullPage:true});
  console.log(JSON.stringify(rects));
  await close(); process.exit(0);
})();
