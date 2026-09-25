const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open("/home/claude/work/out");
  await pg.setViewport({width:1440,height:900});
  let pass=0,fail=0;
  const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};

  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    const lit=()=>[...document.querySelectorAll("#keyboardSvg .is-user")].map(e=>+e.dataset.midi);
    const press=async(code,key)=>{
      document.dispatchEvent(new KeyboardEvent("keydown",{code,key:key||"",bubbles:true}));
      await new Promise(r=>setTimeout(r,45));
      const m=lit();
      document.dispatchEvent(new KeyboardEvent("keyup",{code,key:key||"",bubbles:true}));
      await new Promise(r=>setTimeout(r,45));
      return {midi:m[0]??null, releasedClean: lit().length===0};
    };
    const map={};
    const codes=["KeyA","KeyW","KeyS","KeyE","KeyD","KeyR","KeyF","KeyT","KeyG","KeyY","KeyH","KeyU","KeyJ","KeyI","KeyK","KeyO","KeyL","KeyP","Semicolon","BracketLeft","Quote"];
    let stuck=0;
    for(const c of codes){ const r=await press(c); map[c]=r.midi; if(!r.releasedClean) stuck++; }
    // octave shift
    const before=map.KeyA;
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyX",bubbles:true}));
    await new Promise(r=>setTimeout(r,120));
    const afterUp=(await press("KeyA")).midi;
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyZ",bubbles:true}));
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyZ",bubbles:true}));
    await new Promise(r=>setTimeout(r,140));
    const afterDown=(await press("KeyA")).midi;
    const status=document.getElementById("status").textContent;
    // shift back to default and test the stuck-note case across an octave change
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyX",bubbles:true}));
    await new Promise(r=>setTimeout(r,100));
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyX",bubbles:true}));  // shift while held
    await new Promise(r=>setTimeout(r,80));
    document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyA",bubbles:true}));
    await new Promise(r=>setTimeout(r,120));
    const stuckAfterShift=lit();
    // marker on the on-screen keyboard
    const marker=document.querySelectorAll("#keyboardSvg .pk-typing").length;
    // loop shortcuts moved off the home row
    document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyB",bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const loop=document.getElementById("loopInfo").textContent;
    return {map, stuck, before, afterUp, afterDown, status, stuckAfterShift, marker, loop};
  });

  const expect={KeyA:60,KeyW:61,KeyS:62,KeyE:63,KeyD:64,KeyR:null,KeyF:65,KeyT:66,KeyG:67,KeyY:68,
                KeyH:69,KeyU:70,KeyJ:71,KeyI:null,KeyK:72,KeyO:73,KeyL:74,KeyP:75,Semicolon:76,
                BracketLeft:null,Quote:77};
  const names=["C4","C#4","D4","D#4","E4","—","F4","F#4","G4","G#4","A4","A#4","B4","—","C5","C#5","D5","D#5","E5","—","F5"];
  console.log("  physical key -> note");
  Object.keys(expect).forEach((c,i)=>{
    const got=out.map[c], want=expect[c];
    console.log("    "+c.padEnd(12)+" -> "+String(got===null?"silent":got).padStart(6)+"   expected "+
      String(want===null?"silent":want).padStart(6)+"  "+names[i].padStart(4)+(got===want?"":"   <-- MISMATCH"));
  });
  chk("every physical key maps to the right note", Object.keys(expect).every(c=>out.map[c]===expect[c]));
  chk("R, I and [ are silent (no black key in those gaps)", out.map.KeyR===null&&out.map.KeyI===null&&out.map.BracketLeft===null);
  chk("no note is left sounding after release", out.stuck===0, out.stuck);
  chk("X raises the range an octave", out.afterUp===out.before+12, {before:out.before,afterUp:out.afterUp});
  chk("Z lowers it", out.afterDown===out.before-12, {before:out.before,afterDown:out.afterDown});
  chk("the status names the new range", /Typing keyboard: \w+\d/.test(out.status), out.status);
  chk("shifting octave while a key is held leaves nothing stuck", out.stuckAfterShift.length===0, out.stuckAfterShift);
  chk("the on-screen keyboard marks the typing range", out.marker===1, out.marker);
  chk("B repeats the current bar (moved off the home row)", out.loop==="↻" || /pass/.test(out.loop), out.loop);

  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  chk("no uncaught exceptions", errs.length===0, errs);
  console.log("\n"+pass+" passed, "+fail+" failed");
  await close(); process.exit(fail?1:0);
})();
