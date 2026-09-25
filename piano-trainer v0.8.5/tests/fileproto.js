const puppeteer=require("puppeteer");
(async()=>{
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args:["--no-sandbox","--allow-file-access-from-files","--autoplay-policy=no-user-gesture-required","--mute-audio"]});
  const pg=await b.newPage();
  const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.goto("file:///home/claude/work/out/index.html",{waitUntil:"networkidle2"});
  await new Promise(r=>setTimeout(r,2500));
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="twoHand"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2500));
    document.getElementById("btnPlay").click();
    await new Promise(r=>setTimeout(r,1800));
    const t=document.getElementById("timeNow").textContent+" scrub="+document.getElementById("scrubber").value;
    document.getElementById("btnStop").click();
    return {status:document.getElementById("status").textContent, played:t,
            hasDecomp: typeof DecompressionStream==="function"};
  });
  console.log("file:// status      :", out.status);
  console.log("file:// playback    :", out.played, "(advanced from 0:00)");
  console.log("DecompressionStream :", out.hasDecomp);
  console.log("page errors         :", errs.length?[...new Set(errs)].join(" | "):"(none)");
  await b.close(); process.exit(0);
})();
