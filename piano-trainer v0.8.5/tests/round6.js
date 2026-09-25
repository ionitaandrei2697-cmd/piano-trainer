const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open(require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:900});
  let pass=0,fail=0;
  const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
  const CODES={a:"KeyA",s:"KeyS",d:"KeyD",f:"KeyF",g:"KeyG",h:"KeyH",j:"KeyJ",k:"KeyK"};

  // ===================== 1. chords must be held together ====================
  console.log("[1] wait mode: simultaneous chords");
  const chord=await pg.evaluate(async()=>{
    const SEMI=["KeyA","KeyW","KeyS","KeyE","KeyD","KeyF","KeyT","KeyG","KeyY","KeyH","KeyU","KeyJ","KeyK","KeyO","KeyL","KeyP","Semicolon","Quote"];
    const s=document.getElementById("sampleList"); s.value="twoHand"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2800));
    document.getElementById("modeWait").checked=true; document.getElementById("modeWait").dispatchEvent(new Event("change"));
    document.getElementById("handLeft").checked=true; document.getElementById("handLeft").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,350));
    const exp=()=>[...document.querySelectorAll("#keyboardSvg .is-expected")].map(e=>+e.dataset.midi).sort((a,b)=>a-b);
    const pos=()=>+document.getElementById("scrubber").value;
    const want=exp();
    if (want.length<2) return {skip:true, want};
    // bring the typing keyboard to the chord: base must satisfy base <= min && max <= base+17
    let base=60;
    const fire=(code)=>document.dispatchEvent(new KeyboardEvent("keydown",{code,bubbles:true}));
    const lo=Math.min(...want), hi=Math.max(...want);
    if (hi-lo>17) return {skip:true, want, reason:"wider than the typing range"};
    while (base>lo) { fire("KeyZ"); base-=12; await new Promise(r=>setTimeout(r,80)); }
    while (base+17<hi) { fire("KeyX"); base+=12; await new Promise(r=>setTimeout(r,80)); }
    const codeOf=(m)=>SEMI[m-base];
    const down=(m)=>document.dispatchEvent(new KeyboardEvent("keydown",{code:codeOf(m),bubbles:true}));
    const up=(m)=>document.dispatchEvent(new KeyboardEvent("keyup",{code:codeOf(m),bubbles:true}));
    const p0=pos();
    for (const m of want){ down(m); await new Promise(r=>setTimeout(r,60)); up(m); await new Promise(r=>setTimeout(r,60)); }
    await new Promise(r=>setTimeout(r,250));
    const afterSeq={pos:pos(), status:document.getElementById("status").textContent};
    for (const m of want){ down(m); await new Promise(r=>setTimeout(r,30)); }
    await new Promise(r=>setTimeout(r,1500));   // strict: hold for the chord's length (capped 1.2 s)
    const afterHeld={pos:pos()};
    for (const m of want) up(m);
    // restore the default typing octave for later tests
    while (base<60) { fire("KeyX"); base+=12; await new Promise(r=>setTimeout(r,60)); }
    while (base>60) { fire("KeyZ"); base-=12; await new Promise(r=>setTimeout(r,60)); }
    return {want, typeable:want, p0, afterSeq, afterHeld, allTypeable:true};
  });
  if (chord.skip) console.log("   (first gate not typeable — skipped)");
  else {
    console.log("   gate wants", chord.want, "| typeable", chord.typeable);
    chk("sequential presses do NOT advance the gate", chord.allTypeable ? chord.afterSeq.pos===chord.p0 : true, chord);
    chk("the status explains what is still needed", /together|still need|released/i.test(chord.afterSeq.status), chord.afterSeq.status);
    chk("holding every note together DOES advance", chord.allTypeable ? chord.afterHeld.pos>chord.p0+0.05 : true, chord);
  }

  // ===================== 2. score overlay ===================================
  console.log("[2] score overlay");
  const ov=await pg.evaluate(async(CODES)=>{
    document.getElementById("btnStop").click();
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    document.getElementById("handBoth").checked=true; document.getElementById("handBoth").dispatchEvent(new Event("change"));
    document.getElementById("modeWait").checked=true; document.getElementById("modeWait").dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    document.getElementById("btnPlay").click(); await new Promise(r=>setTimeout(r,300));
    const heads=()=>[...document.querySelectorAll("#sheetContainer g.vf-stavenote")].map(g=>{
      const p=g.querySelector(".vf-notehead path"); return p?p.getAttribute("fill"):null;});
    const before=heads();
    // wrong press first (E instead of C) -> the waiting note should go red
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"d",code:"KeyD",bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    document.dispatchEvent(new KeyboardEvent("keyup",{key:"d",code:"KeyD",bubbles:true}));
    await new Promise(r=>setTimeout(r,150));
    const afterWrong=heads();
    // then the right one, HELD for its length -> green
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"a",code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,600));
    document.dispatchEvent(new KeyboardEvent("keyup",{key:"a",code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const afterRight=heads();
    // does a re-render (zoom change) keep the colours?
    const z=document.getElementById("zoom"); z.value="1.2"; z.dispatchEvent(new Event("input")); z.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,1400));
    const afterZoom=heads();
    // stop clears
    document.getElementById("btnStop").click(); await new Promise(r=>setTimeout(r,200));
    const afterStop=heads();
    return {before:before[0], afterWrong:afterWrong[0], afterRight:afterRight[0], afterZoom:afterZoom[0], afterStop:afterStop[0], total:before.length};
  }, CODES);
  chk("noteheads start as ink", /#000000|black/i.test(ov.before), ov);
  chk("a wrong press paints the waiting note red", /d2604f/i.test(ov.afterWrong), ov);
  chk("the correct press paints it green", /59c2a0/i.test(ov.afterRight), ov);
  chk("colours survive a re-render (zoom)", /59c2a0/i.test(ov.afterZoom), ov);
  chk("Stop clears the overlay", /#000000|black/i.test(ov.afterStop), ov);

  // ===================== 3. auto-fit ========================================
  console.log("[3] auto-fit");
  const fit=await pg.evaluate(async()=>{
    const f=document.getElementById("toggleFit"); f.checked=true; f.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,1200));
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3200));
    const sc=document.getElementById("sheetContainer");
    const panel=sc.clientHeight;
    const svg=sc.querySelector("svg");
    const heads=[...svg.querySelectorAll("g.vf-stavenote")].map(g=>{const b=g.getBoundingClientRect();return [b.top,b.bottom];}).sort((a,b)=>a[0]-b[0]);
    const systems=[]; let cur=null; for(const [a,b] of heads){ if(!cur||a>cur[1]+45){cur=[a,b];systems.push(cur);} else cur[1]=Math.max(cur[1],b); }
    const tallest=Math.max(...systems.map(s=>s[1]-s[0]));
    return {panel, tallest:Math.round(tallest), zoomLabel:document.getElementById("zoomVal").textContent,
            fits: tallest < panel, fitOn:document.getElementById("toggleFit").checked};
  });
  chk("Fit is on by default and the label says so", fit.fitOn && /auto/.test(fit.zoomLabel), fit);
  chk("the tallest system fits inside the panel", fit.fits, fit);
  console.log("   panel "+fit.panel+"px, tallest system "+fit.tallest+"px, "+fit.zoomLabel);
  const manual=await pg.evaluate(async()=>{
    const z=document.getElementById("zoom"); z.value="0.6"; z.dispatchEvent(new Event("input")); z.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,900));
    return {fitOn:document.getElementById("toggleFit").checked, label:document.getElementById("zoomVal").textContent};
  });
  chk("touching the zoom slider turns Fit off", !manual.fitOn && /60%/.test(manual.label), manual);

  // ===================== 4. select contrast =================================
  console.log("[4] dropdown palette");
  const sel=await pg.evaluate(()=>{
    const s=document.getElementById("profileBackend");
    const cs=getComputedStyle(s), o=getComputedStyle(s.options[1]);   // an UNselected option
    return {scheme:cs.colorScheme, optBg:o.backgroundColor, optFg:o.color};
  });
  chk("selects ask for the dark colour scheme", sel.scheme==="dark", sel);
  chk("options are styled in the app palette (not grey-on-white)", /21, 29, 44/.test(sel.optBg) && /234, 230, 221/.test(sel.optFg), sel);

  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
