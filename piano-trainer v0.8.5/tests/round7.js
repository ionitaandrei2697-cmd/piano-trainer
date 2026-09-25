const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open("/home/claude/work/out");
  await pg.setViewport({width:1440,height:900});
  let pass=0,fail=0;
  const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
  const load=async(k,mode)=>pg.evaluate(async(k,mode)=>{
    document.getElementById("btnStop").click();
    const s=document.getElementById("sampleList"); s.value=k; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    document.getElementById("handBoth").checked=true; document.getElementById("handBoth").dispatchEvent(new Event("change"));
    document.getElementById(mode).checked=true; document.getElementById(mode).dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
  },k,mode);

  // ============ 1. note length is REQUIRED (wait mode) ============
  console.log("[1] wait mode: a note must be held for its length");
  await load("scale","modeWait");
  const w=await pg.evaluate(async()=>{
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,300));
    const head=()=>{const g=document.querySelector("#sheetContainer g.vf-stavenote");const p=g&&g.querySelector(".vf-notehead path");return p?p.getAttribute("fill"):null;};
    const pos=()=>+document.getElementById("scrubber").value;
    const st=()=>document.getElementById("status").textContent;
    // tap it: right note, released immediately
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    const holding=st();
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,500));
    const tapped={pos:pos(), head:head(), status:st(), len:document.getElementById("scoreLength").textContent, acc:document.getElementById("scoreAcc").textContent};
    // now hold it properly
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,600));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    const held={pos:pos(), head:head()};
    return {holding, tapped, held};
  });
  chk("while the note is down the status asks you to hold it", /Hold it/.test(w.holding), w.holding);
  chk("a tapped note does NOT open the gate", w.tapped.pos===0, w.tapped);
  chk("...its notehead goes amber (right note, wrong length)", /d9a441/i.test(w.tapped.head), w.tapped);
  chk("...and the readout counts it", /let go early/.test(w.tapped.len), w.tapped.len);
  chk("...and the status says what to do", /again and hold/.test(w.tapped.status), w.tapped.status);
  chk("holding it for its length opens the gate", w.held.pos>0.05, w.held);
  chk("...and the notehead goes green", /59c2a0/i.test(w.held.head), w.held);

  // ============ 2. note length is REQUIRED (follow mode) ============
  console.log("[2] follow mode: clipped notes come off the accuracy");
  await load("scale","modeFollow");
  const f=await pg.evaluate(async()=>{
    document.getElementById("btnPlay").click();
    const keys=["KeyA","KeyS","KeyD","KeyF"];
    // first two clipped (60 ms), last two held (420 ms) — all on time
    for (let i=0;i<keys.length;i++){
      await new Promise(r=>setTimeout(r,i?  (i<2?440:80) : 60));
      document.dispatchEvent(new KeyboardEvent("keydown",{code:keys[i],bubbles:true}));
      await new Promise(r=>setTimeout(r, i<2?60:420));
      document.dispatchEvent(new KeyboardEvent("keyup",{code:keys[i],bubbles:true}));
    }
    await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnPause").click();
    const heads=[...document.querySelectorAll("#sheetContainer g.vf-stavenote")].slice(0,4).map(g=>g.querySelector(".vf-notehead path").getAttribute("fill"));
    return {acc:document.getElementById("scoreAcc").textContent, correct:document.getElementById("scoreCorrect").textContent,
            len:document.getElementById("scoreLength").textContent, heads};
  });
  chk("all four notes registered as the right pitch", f.correct==="4", f);
  chk("but the two clipped ones are not counted as correct notes", /50%/.test(f.acc), f);
  chk("readout names the fault", /clipped/.test(f.len), f.len);
  chk("score: clipped notes amber, held notes green", /d9a441/i.test(f.heads[0]) && /59c2a0/i.test(f.heads[3]), f.heads);

  // ============ 3. the setting changes the contract ============
  console.log("[3] Note length setting");
  const rep=await pg.evaluate(async()=>{
    const m=document.getElementById("lengthMode"); m.value="report"; m.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,150));
    const acc=document.getElementById("scoreAcc").textContent;
    m.value="strict"; m.dispatchEvent(new Event("change"));
    return {acc, inSettings: !!document.querySelector("#settingsDialog #lengthMode")};
  });
  chk("'Reported only' restores the old contract (same run reads 100%)", /100%/.test(rep.acc), rep);
  chk("the setting lives in the Settings window", rep.inSettings);

  // ============ 4. Repeat controls ============
  console.log("[4] Repeat");
  await load("minuetG","modeListen");
  const rp=await pg.evaluate(async()=>{
    const f=document.getElementById("loopFrom"), t=document.getElementById("loopTo");
    f.value="3"; t.value="4"; t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,250));
    const band=document.getElementById("scrubLoop");
    const cs=getComputedStyle(band);
    const info=document.getElementById("loopInfo").textContent, status=document.getElementById("status").textContent;
    const groupOn=document.querySelector(".rail__group--repeat").classList.contains("is-on");
    // the band should sit inside the track and the roll should draw the region
    const c=document.getElementById("rollCanvas"), ctx=c.getContext("2d");
    const img=ctx.getImageData(0,0,c.width,c.height).data; let jade=0;
    for(let i=0;i<img.length;i+=4){ if(img[i+1]>img[i]+40 && img[i+1]>img[i+2]+10 && img[i+1]>90) jade++; }
    // Off
    document.getElementById("btnLoopClear").click(); await new Promise(r=>setTimeout(r,150));
    const off=document.getElementById("loopInfo").textContent, bandHidden=band.classList.contains("is-hidden");
    // B key repeats the current bar
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyB",bubbles:true})); await new Promise(r=>setTimeout(r,200));
    const bKey=document.getElementById("loopInfo").textContent;
    return {info,status,groupOn,bandVisible:cs.display!=="none",bandW:parseFloat(cs.width),jade,off,bandHidden,bKey,
            noAB: !document.getElementById("btnLoopA") && !document.getElementById("btnLoopB")};
  });
  chk("typing bar numbers sets the repeat (inputs hold the range, readout the pass)", rp.info==="↻" || /pass/.test(rp.info), rp.info);
  chk("the status explains WHY", /until it's clean/.test(rp.status), rp.status);
  chk("the repeated stretch is drawn on the scrubber", rp.bandVisible && rp.bandW>5, rp);
  chk("...and on the falling notes", rp.jade>200, rp.jade);
  chk("Off clears it and hides the band", rp.off==="off" && rp.bandHidden, rp);
  chk("B repeats the current bar", rp.bKey==="↻" || /pass/.test(rp.bKey), rp.bKey);
  chk("the A/B jargon is gone", rp.noAB);

  // ============ 5. declutter + colour toggle ============
  console.log("[5] settings window and colour toggle");
  const st=await pg.evaluate(async()=>{
    const groups=[...document.querySelectorAll(".rail .rail__label")].map(e=>e.textContent.trim());
    document.getElementById("btnSettings").click(); await new Promise(r=>setTimeout(r,150));
    const open=document.getElementById("settingsDialog").open;
    const titles=[...document.querySelectorAll("#settingsDialog .setgroup__title")].map(e=>e.textContent.trim());
    document.getElementById("btnSettingsClose").click();
    const railRows=new Set([...document.querySelectorAll(".rail__group")].map(g=>Math.round(g.getBoundingClientRect().top))).size;
    const railH=Math.round(document.querySelector(".rail").getBoundingClientRect().height);
    return {groups, open, titles, railRows, railH, deviceBelow: !!document.querySelector(".app > details:not(#logPanel)")};
  });
  chk("toolbar keeps only Mode, Hand, Repeat (+ the one Metronome toggle and tools)", JSON.stringify(st.groups)===JSON.stringify(["Mode","Hand","Repeat"]), st.groups);
  chk("Settings opens with Panels / Show / Coach / Device & sound", st.open && ["Panels","Show","Coach","Device & sound"].every(t=>st.titles.includes(t)), st.titles);
  chk("toolbar is a single row on a wide screen", st.railRows===1, st);
  chk("Device & sound no longer sits at the page bottom", !st.deviceBelow);
  console.log("   toolbar height "+st.railH+"px (was 86)");
  await load("scale","modeWait");
  const col=await pg.evaluate(async()=>{
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,300));
    const head=()=>document.querySelector("#sheetContainer g.vf-stavenote .vf-notehead path").getAttribute("fill");
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,600));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true})); await new Promise(r=>setTimeout(r,200));
    const on=head();
    const t=document.getElementById("toggleColour"); t.checked=false; t.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,150));
    const off=head();
    t.checked=true; t.dispatchEvent(new Event("change")); await new Promise(r=>setTimeout(r,150));
    const back=head();
    return {on,off,back};
  });
  chk("colour toggle off restores ink, on repaints", /59c2a0/i.test(col.on) && /#000000/.test(col.off) && /59c2a0/i.test(col.back), col);

  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
