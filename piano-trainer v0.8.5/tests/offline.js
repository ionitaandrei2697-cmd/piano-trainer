/* Through the launcher: install the worker, then stop the server and reload —
 * the app must still open from the cache. Then prove an update is picked up. */
const puppeteer=require("puppeteer"); const {execSync}=require("child_process");
(async()=>{
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args:["--no-sandbox","--mute-audio"]});
  const pg=await b.newPage(); const notOk=[]; pg.on("response",r=>{ if(r.status()>=400) notOk.push(r.status()+" "+r.url()); });
  await pg.goto("http://127.0.0.1:8765/",{waitUntil:"networkidle2"});
  await pg.waitForFunction("navigator.serviceWorker.controller || false",{timeout:15000}).catch(()=>{});
  await pg.reload({waitUntil:"networkidle2"});                       // second load: controlled by the worker
  const controlled=await pg.evaluate(()=>!!navigator.serviceWorker.controller);
  console.log("worker controls the page:", controlled, "| favicon/other errors:", notOk.length?notOk.join(" "):"none");
  // stop the server -> offline
  try { process.kill(parseInt(require("fs").readFileSync("/tmp/serve.pid","utf8"),10)); } catch(e){} await new Promise(r=>setTimeout(r,800));
  let offline;
  try { await pg.reload({waitUntil:"domcontentloaded",timeout:15000});
        await pg.waitForFunction("window.PT && !/^Loading/.test(document.getElementById('status').textContent)",{timeout:20000});
        offline=await pg.evaluate(async()=>{
          const bootStatus=document.getElementById("status").textContent.slice(0,70);
          const s=document.getElementById("sampleList"); s.value="odeToJoy"; s.dispatchEvent(new Event("change"));
          await new Promise(r=>setTimeout(r,2800));
          document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,1000)); document.getElementById("btnPause").click();
          return {bootStatus, loaded:document.getElementById("status").textContent.slice(0,50), played:+document.getElementById("scrubber").value};
        });
  } catch(e){ offline="FAILED: "+e.message; }
  console.log("server stopped, reload ->", JSON.stringify(offline));
  await b.close(); process.exit(0);
})();
