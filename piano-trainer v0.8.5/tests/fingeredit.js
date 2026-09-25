const puppeteer=require("puppeteer"), http=require("http"), fs=require("fs"), path=require("path");
const ROOT="/home/claude/work/out";
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
(async()=>{
  const srv=http.createServer((q,s)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/index.html";
    fs.readFile(path.join(ROOT,p),(e,d)=>{if(e){s.writeHead(404);return s.end();}s.writeHead(200);s.end(d);});});
  await new Promise(r=>srv.listen(0,r));
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",args:["--no-sandbox","--mute-audio"]});
  const pg=await b.newPage(); const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
  await pg.goto("http://localhost:"+srv.address().port+"/index.html?debug",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  await pg.evaluate(()=>{window.confirm=()=>true;});
  const E=(f,...a)=>pg.evaluate(f,...a);
  const load=async()=>E(async()=>{const s=document.getElementById("sampleList");s.value="odeToJoy";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2600));});
  const fingers=(staff,midi)=>E((staff,midi)=>window.PT.__app.song.notes.filter(n=>(staff===0?n.staff===0:n.staff>=1)&&(midi==null||n.midi===midi)).map(n=>n.finger),staff,midi);
  const press=(code)=>E(async(code)=>{document.dispatchEvent(new KeyboardEvent("keydown",{code,bubbles:true}));await new Promise(r=>setTimeout(r,40));
    document.dispatchEvent(new KeyboardEvent("keyup",{code,bubbles:true}));await new Promise(r=>setTimeout(r,60));},code);
  await load();
  console.log("automatic:  LH G2 =",(await fingers(1,43)).join(""),"| LH C3 =",(await fingers(1,48)).join(""));
  chk("automatic fingering already puts G2 on 5 in the left hand", (await fingers(1,43)).every(f=>f===5));

  // ---- "every" scope: G2 -> 4 everywhere (the opposite, to see it apply) ----
  await E(()=>document.getElementById("btnFingering").click());
  const ui=await E(()=>({scope:!document.getElementById("fingerScope").classList.contains("is-hidden"),pad:!document.getElementById("fingerPad").classList.contains("is-hidden"),
    auto:!!document.querySelector('#fingerPad [data-f="0"]')}));
  chk("edit mode shows the scope choice, the pad and Auto", ui.scope&&ui.pad&&ui.auto, ui);
  await press("KeyZ"); await press("KeyZ");            // typing keyboard down two octaves: C2..F3
  await press("KeyG");                                  // G2
  const label=await E(()=>document.getElementById("scopePitchLabel").textContent);
  chk("the 'every' option names the pitch, hand and count", /Every G2 · left hand \(\d+\)/.test(label), label);
  await E(()=>{const r=document.getElementById("scopePitch");r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}));});
  const c3Before=(await fingers(1,48)).join("");
  await press("Digit4");
  const g2=await fingers(1,43), c3=(await fingers(1,48)).join("");
  const msg=await E(()=>document.getElementById("status").textContent);
  chk("'every' changes every G2 in the left hand", g2.length>1&&g2.every(f=>f===4), g2);
  console.log("        C3 before:",c3Before," after:",c3,"  status:",msg);
  chk("the neighbours re-fit (C3 changes with G2) and the status says so", c3!==c3Before&&/neighbouring/.test(msg), {c3Before,c3,msg});
  chk("the right hand is untouched", (await fingers(0)).join("")==="334554321123322334554321123211", (await fingers(0)).join(""));

  // ---- Auto brings the rule back to automatic ----
  await press("Digit0");
  chk("Auto (0) returns every G2 to the automatic finger", (await fingers(1,43)).every(f=>f===5), await fingers(1,43));

  // ---- "this note" scope: only one G2 ----
  await E(()=>{const r=document.getElementById("scopeNote");r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}));});
  await press("KeyG"); await press("Digit3");
  const one=await fingers(1,43);
  const pinned=await E(async()=>{const a=window.PT.__app;const req=indexedDB.open("piano-trainer");
    const db=await new Promise(r=>{req.onsuccess=()=>r(req.result);});
    const row=await new Promise(r=>{const q=db.transaction("fingerings").objectStore("fingerings").getAll();q.onsuccess=()=>r(q.result);});
    return {overrides:Object.keys(row[0].overrides||{}).length, rules:Object.keys(row[0].rules||{}).length, status:document.getElementById("status").textContent};});
  console.log("        G2 fingers:",one.join(""),"  stored:",JSON.stringify({overrides:pinned.overrides,rules:pinned.rules}),"  status:",pinned.status);
  chk("'this note' pins exactly ONE note (no rule)", pinned.overrides===1&&pinned.rules===0&&one[0]===3, pinned);
  chk("any other change is a reported re-fit, not a second edit", one.slice(1).every(f=>f===3||f===5)&&(one.filter(f=>f===3).length===1||/neighbouring/.test(pinned.status)), {one,status:pinned.status});

  // ---- persistence ----
  await E(()=>{const r=document.getElementById("scopePitch");r.checked=true;r.dispatchEvent(new Event("change",{bubbles:true}));});
  await E(()=>{window.PT.__app.transport.seek(0);});
  await pg.reload({waitUntil:"networkidle2"}); await pg.waitForFunction("window.PT && window.PT.__app",{timeout:15000});
  await new Promise(r=>setTimeout(r,3200)); await pg.evaluate(()=>{window.confirm=()=>true;});
  const after=await fingers(1,43);
  const scopeKept=await E(()=>document.getElementById("scopePitch").checked);
  chk("the one-note edit survives a reload (same result)", after.join("")===one.join(""), {after,one});
  const shown=await E(()=>({pinned:window.PT.__app.song.notes.filter(n=>n.pinned).length,status:document.getElementById("status").textContent}));
  chk("a saved edit is marked as yours (pinned) and announced when the piece opens, after the load summary", shown.pinned===1&&/Loaded notation.*fingering edit of yours/.test(shown.status), shown);
  chk("the chosen scope is remembered", scopeKept);

  // ---- reset ----
  const resetEnabled=await E(()=>!document.getElementById("btnResetFingering").disabled);
  await E(()=>document.getElementById("btnResetFingering").click()); await new Promise(r=>setTimeout(r,300));
  chk("Settings → Reset fingering is available and restores automatic", resetEnabled&&(await fingers(1,43)).every(f=>f===5), await fingers(1,43));
  chk("no uncaught errors", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await b.close(); srv.close(); process.exit(fail?1:0);
})();
