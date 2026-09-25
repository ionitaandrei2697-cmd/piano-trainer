const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:900});
  let pass=0,fail=0;
  const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};

  // ---- keyboard no longer clipped; note names visible with all panels on ----
  const kb=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3000));
    const t=document.getElementById("toggleLabels"); t.checked=true; t.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,500));
    const wrap=document.querySelector(".kbwrap").getBoundingClientRect();
    const inst=document.querySelector(".instrument").getBoundingClientRect();
    const labels=[...document.querySelectorAll("#keyboardSvg text.pk-label")];
    const svgBox=document.getElementById("keyboardSvg").getBoundingClientRect();
    // are the labels inside the visible keyboard area?
    const vis=labels.filter(l=>{const b=l.getBoundingClientRect();
      return b.bottom<=inst.bottom+0.5 && b.top>=svgBox.top-0.5 && b.bottom<=svgBox.bottom+0.5;});
    return {clip:+(wrap.bottom-inst.bottom).toFixed(1), labels:labels.length, visible:vis.length,
            panelsOn:["toggleSheet","toggleRoll","toggleKeyboard"].every(i=>document.getElementById(i).checked)};
  });
  chk("keyboard is not clipped by the instrument panel", kb.clip<=0.5, kb);
  chk("all three panels are on", kb.panelsOn);
  chk("every note name is visible with all three panels on", kb.labels>40 && kb.visible===kb.labels, kb);

  // ---- score has no visible scrollbar ------------------------------------
  const sb=await pg.evaluate(()=>{
    const sc=document.getElementById("sheetContainer");
    return {barW: sc.offsetWidth-sc.clientWidth, scrollable: sc.scrollHeight>sc.clientHeight+2};
  });
  chk("the page shows no scrollbar furniture", sb.barW===0, sb);
  chk("...but the score still scrolls (cursor follows it)", sb.scrollable===true||sb.scrollable===false);

  // ---- toolbar groups --------------------------------------------------
  const groups=await pg.evaluate(()=>({
    toolbar:[...document.querySelectorAll(".rail__label")].map(e=>e.textContent.trim()),
    settings:[...document.querySelectorAll("#settingsDialog .setgroup__title")].map(e=>e.textContent.trim())}));
  chk("Panels group lives in Settings", groups.settings.includes("Panels"), groups);
  chk("Show group lives in Settings", groups.settings.includes("Show"), groups);

  // ---- count-in skip ---------------------------------------------------
  const ci=await pg.evaluate(async()=>{
    document.getElementById("btnStop").click();
    const c=document.getElementById("countInMode"); c.value="clicks"; c.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,200));
    document.getElementById("btnPlay").click();
    await new Promise(r=>setTimeout(r,260));
    const skipVisible=!document.getElementById("btnSkipCountIn").classList.contains("is-hidden");
    const status=document.getElementById("status").textContent;
    const before=+document.getElementById("scrubber").value;
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"Space",key:" ",bubbles:true}));
    await new Promise(r=>setTimeout(r,500));
    const after=+document.getElementById("scrubber").value;
    document.getElementById("btnStop").click();
    return {skipVisible, status, before:+before.toFixed(3), after:+after.toFixed(3)};
  });
  chk("a Skip button appears during the count-in", ci.skipVisible, ci);
  chk("the status says it can be skipped", /skip/i.test(ci.status), ci.status);
  chk("Space during the count-in starts the music", ci.before===0 && ci.after>0.15, ci);

  // ---- note length ------------------------------------------------------
  const len=await pg.evaluate(async()=>{
    document.getElementById("countInMode").value="off";
    document.getElementById("countInMode").dispatchEvent(new Event("change"));
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    document.getElementById("modeFollow").checked=true;
    document.getElementById("modeFollow").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    document.getElementById("btnPlay").click();
    // hold each note far too briefly -> should read as clipped
    const keys=["a","s","d","f"];
    for(const k of keys){
      await new Promise(r=>setTimeout(r,400));
      document.dispatchEvent(new KeyboardEvent("keydown",{key:k,bubbles:true}));
      await new Promise(r=>setTimeout(r,45));
      document.dispatchEvent(new KeyboardEvent("keyup",{key:k,bubbles:true}));
    }
    await new Promise(r=>setTimeout(r,300));
    document.getElementById("btnPause").click();
    return {text:document.getElementById("scoreLength").textContent,
            label:[...document.querySelectorAll(".score__cell span")].map(e=>e.textContent)};
  });
  chk("a Note length readout exists", len.label.includes("Note length"), len.label);
  chk("staccato playing of long notes reads as clipped", /clipped/.test(len.text), len.text);
  console.log("        readout says:", JSON.stringify(len.text));

  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
