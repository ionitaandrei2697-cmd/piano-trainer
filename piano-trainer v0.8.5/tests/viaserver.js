const puppeteer=require("puppeteer");
(async()=>{
  const b=await puppeteer.launch({headless:"new",executablePath:(process.env.CHROME_PATH||undefined),
    args:["--no-sandbox","--autoplay-policy=no-user-gesture-required","--mute-audio"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  const failed=[]; pg.on("requestfailed",r=>failed.push(r.url())); 
  const notOk=[]; pg.on("response",r=>{ if(r.status()>=400 && r.url().startsWith("http://127.0.0.1")) notOk.push(r.status()+" "+r.url()); });
  const t0=Date.now();
  await pg.goto("http://127.0.0.1:8765/",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && document.getElementById('status').textContent.length>0",{timeout:20000});
  const boot=Date.now()-t0;
  const r=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2800));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,1200)); document.getElementById("btnPause").click();
    let sw="none"; try { const reg=await navigator.serviceWorker.getRegistration(); sw=reg?(reg.active?"active":(reg.installing?"installing":"waiting")):"not registered"; } catch(e){ sw="error "+e.message; }
    return {secure:isSecureContext, origin:location.origin, status:document.getElementById("status").textContent,
            pos:+document.getElementById("scrubber").value, sw, midiAPI:typeof navigator.requestMIDIAccess};
  });
  console.log("boot time through the PowerShell server:", boot, "ms");
  console.log(JSON.stringify(r,null,1));
  console.log("failed requests:", failed.filter(u=>u.startsWith("http://127.0.0.1")).length, "| 4xx/5xx from our server:", notOk.length?notOk.join(" "):"none", "| page errors:", errs.length?errs.join(" | "):"none");
  await b.close(); process.exit(0);
})();
