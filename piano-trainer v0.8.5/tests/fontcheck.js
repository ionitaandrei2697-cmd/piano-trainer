const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1200,height:820,deviceScaleFactor:1});
  const out=await pg.evaluate(async()=>{
    await new Promise(r=>setTimeout(r,800));
    const check=(f)=>document.fonts.check('16px "'+f+'"');
    // measure whether the declared face is actually being used: compare the
    // rendered width against an explicit fallback
    const measure=(family)=>{const s=document.createElement("span");
      s.textContent="Handgloves 0123456789"; s.style.cssText="position:absolute;visibility:hidden;font-size:40px;font-family:"+family;
      document.body.appendChild(s); const w=s.getBoundingClientRect().width; s.remove(); return Math.round(w);};
    return {
      newsreader:check("Newsreader"), plex:check("IBM Plex Sans"), plexmono:check("IBM Plex Mono"),
      wDeclared:measure('"Newsreader", ui-serif, Georgia, serif'),
      wFallback:measure('ui-serif, Georgia, serif'),
      uiDeclared:measure('"IBM Plex Sans", system-ui, sans-serif'),
      uiFallback:measure('system-ui, sans-serif'),
      monoDeclared:measure('"IBM Plex Mono", ui-monospace, Menlo, monospace'),
      monoFallback:measure('ui-monospace, Menlo, monospace'),
    };
  });
  console.log("webfont available in this sandbox:", out.newsreader, out.plex, out.plexmono, "(Google Fonts is blocked here)");
  console.log("display  declared="+out.wDeclared+"px  fallback="+out.wFallback+"px  ->", out.wDeclared===out.wFallback?"using the FALLBACK serif (graceful)":"using Newsreader");
  console.log("ui       declared="+out.uiDeclared+"px  fallback="+out.uiFallback+"px  ->", out.uiDeclared===out.uiFallback?"using the FALLBACK sans (graceful)":"using IBM Plex Sans");
  console.log("data     declared="+out.monoDeclared+"px fallback="+out.monoFallback+"px ->", out.monoDeclared===out.monoFallback?"using the FALLBACK mono (graceful)":"using IBM Plex Mono");
  await pg.evaluate(async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber");sc.value="2.2";sc.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,400));});
  await pg.screenshot({path:require("path").join(require("os").tmpdir(),"theme.png")});
  console.log("screenshot saved");
  await close(); process.exit(0);
})();
