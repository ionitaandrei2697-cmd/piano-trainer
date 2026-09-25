/* Round 9: the other hand is silent when you learn one hand; finger numbers
 * are large discs; messages don't take room (hover over the falling notes). */
const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT=process.argv[2]||"/home/claude/work/out"; const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"};
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio","--autoplay-policy=no-user-gesture-required"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message)); await pg.setViewport({width:1440,height:830,deviceScaleFactor:1});
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  await pg.evaluate(async()=>{const s=document.getElementById("sampleList");s.value="odeToJoy";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));});
  const heard=(mode,hand,other)=>pg.evaluate(async(mode,hand,other)=>{const a=window.PT.__app;
    const o=document.getElementById("toggleOtherHand"); if(o.checked!==other){o.checked=other;o.dispatchEvent(new Event("change"));}
    const h=document.getElementById(hand);h.checked=true;h.dispatchEvent(new Event("change",{bubbles:true}));
    const m=document.getElementById(mode);m.checked=true;m.dispatchEvent(new Event("change",{bubbles:true}));
    document.getElementById("btnStop").click(); await new Promise(r=>setTimeout(r,150));
    const played=[]; const orig=a.engine.playNote.bind(a.engine); a.engine.playNote=(midi,...r)=>{played.push(midi);return orig(midi,...r);};
    if (mode==="modeWait") {           // play the gates yourself for 2 s and listen to what the app adds
      const until=performance.now()+2000;
      while(performance.now()<until){ const e=a.practice.events[a.practice.gateIndex]; if(!e) break;
        for(const k of e.required) document.dispatchEvent(new KeyboardEvent("keydown",{code:({60:"KeyA",62:"KeyS",64:"KeyD",65:"KeyF",67:"KeyG"})[k]||"KeyA",bubbles:true}));
        await new Promise(r=>setTimeout(r,520));
        for(const k of e.required) document.dispatchEvent(new KeyboardEvent("keyup",{code:({60:"KeyA",62:"KeyS",64:"KeyD",65:"KeyF",67:"KeyG"})[k]||"KeyA",bubbles:true}));
        await new Promise(r=>setTimeout(r,150)); }
    } else { document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,2000)); }
    document.getElementById("btnStop").click(); a.engine.playNote=orig;
    // the typing keyboard's own sounding notes go through noteOnLive, not playNote: these are the app's
    return {rh:played.filter(m=>m>=60).length, lh:played.filter(m=>m<60).length};},mode,hand,other);

  console.log("[1] the other hand is silent");
  let r=await heard("modeFollow","handRight",false); chk("Follow, right hand: the app plays nothing (no left hand, none of yours)", r.rh===0&&r.lh===0, r);
  r=await heard("modeFollow","handLeft",false);  chk("Follow, left hand: the app plays nothing", r.rh===0&&r.lh===0, r);
  r=await heard("modeFollow","handBoth",false);  chk("Follow, both hands: the app no longer doubles your notes", r.rh===0&&r.lh===0, r);
  r=await heard("modeWait","handRight",false);   chk("Wait, right hand: while you play, the left hand stays silent", r.lh===0&&r.rh===0, r);
  r=await heard("modeListen","handRight",false); chk("Listen, right hand: only the right hand (a solo)", r.rh>0&&r.lh===0, r);
  r=await heard("modeListen","handBoth",false);  chk("Listen, both: everything", r.rh>0&&r.lh>0, r);
  r=await heard("modeFollow","handRight",true);  chk("with 'Play the other hand for me' the left hand comes back (and yours stays yours)", r.lh>0&&r.rh===0, r);
  await heard("modeListen","handBoth",false);
  const kept=await pg.evaluate(async()=>{const o=document.getElementById("toggleOtherHand");o.checked=true;o.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));
    return !!document.querySelector("#settingsDialog #toggleOtherHand");});
  await pg.reload({waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000}); await new Promise(r=>setTimeout(r,2500));
  const persisted=await pg.evaluate(()=>document.getElementById("toggleOtherHand").checked);
  chk("the option lives in Settings and is remembered", kept&&persisted, {kept,persisted});
  await pg.evaluate(()=>{const o=document.getElementById("toggleOtherHand");o.checked=false;o.dispatchEvent(new Event("change"));});

  console.log("[2] messages take no room");
  const msg=await pg.evaluate(async()=>{const m=document.getElementById("modeWait");m.checked=true;m.dispatchEvent(new Event("change",{bubbles:true}));await new Promise(r=>setTimeout(r,600));
    const st=document.getElementById("status"), hud=document.getElementById("hud");
    return {statusH:st.getBoundingClientRect().height, masthead:Math.round(document.querySelector(".masthead").getBoundingClientRect().height),
      explanation:/play the lit key to start/.test(document.getElementById("hudText").textContent+st.textContent),
      tip:document.getElementById("modeWait").closest("label").title, hudText:document.getElementById("hudText").textContent,
      aria:st.getAttribute("aria-live")};});
  chk("no explanation of the mode appears when you switch", !msg.explanation, msg);
  chk("...it is in the button's tooltip instead", /Wait: play the lit key/.test(msg.tip), msg.tip);
  chk("the status line takes no room (masthead is one row)", msg.statusH<=1&&msg.masthead<=46, msg);
  chk("...but is still announced to screen readers", msg.aria==="polite");
  const box=await pg.evaluate(()=>{const r=document.querySelector(".rollwrap").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  await pg.mouse.move(700,15); await new Promise(r=>setTimeout(r,250));
  const hidden=await pg.evaluate(()=>getComputedStyle(document.getElementById("hud")).opacity);
  await pg.mouse.move(box.x+box.w/2,box.y+box.h/2); await new Promise(r=>setTimeout(r,300));
  const shown=await pg.evaluate(()=>getComputedStyle(document.getElementById("hud")).opacity);
  chk("messages over the falling notes show only on hover", hidden==="0"&&shown==="1", {hidden,shown});
  await pg.mouse.move(700,15); await new Promise(r=>setTimeout(r,250));
  const alert=await pg.evaluate(async()=>{const inp=document.getElementById("fileInput");
    const dt=new DataTransfer(); dt.items.add(new File(["not a score"],"notes.txt",{type:"text/plain"}));
    window.dispatchEvent(new DragEvent("drop",{dataTransfer:dt,bubbles:true,cancelable:true})); await new Promise(r=>setTimeout(r,400));
    return {opacity:getComputedStyle(document.getElementById("hud")).opacity,text:document.getElementById("hudText").textContent};});
  chk("an error still shows without hover", alert.opacity==="1"&&/isn't a score/.test(alert.text), alert);

  console.log("[3] finger numbers and room for the falling notes");
  const px=await pg.evaluate(async()=>{const a=window.PT.__app;const sc=document.getElementById("scrubber");sc.value="0.2";sc.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,300));
    a.roll.render(a.transport.position); const c=document.getElementById("rollCanvas"),x=c.getContext("2d"),d=x.getImageData(0,0,c.width,c.height).data;
    let disc=0, digit=0; for(let i=0;i<d.length;i+=4){const R=d[i],G=d[i+1],B=d[i+2]; if(R<24&&G<28&&B<40) disc++; if(R>225&&G>218&&B>200) digit++;}
    return {disc,digit,notes:Math.round(document.querySelector(".rollwrap").getBoundingClientRect().height)};});
  chk("finger numbers are drawn as dark discs with light digits", px.disc>200&&px.digit>40, px);
  chk("the falling notes are taller than before (Wait, 1440x830: was 146 px)", px.notes>=190, px.notes);
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
