const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(require("path").join(__dirname,".."));
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="scale"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,2600));
    const lit=()=>[...document.querySelectorAll("#keyboardSvg .is-user")].map(e=>+e.dataset.midi);
    const res={};
    for (const [key,want] of [["a",60],["w",61],[";",76],["'",77]]) {
      // NO code property at all — the fallback path
      document.dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}));
      await new Promise(r=>setTimeout(r,50));
      res[key]=lit()[0]??null;
      document.dispatchEvent(new KeyboardEvent("keyup",{key,bubbles:true}));
      await new Promise(r=>setTimeout(r,50));
    }
    return {res, stuck:lit().length};
  });
  console.log("without e.code (US-layout fallback):", JSON.stringify(out.res));
  const ok = out.res.a===60 && out.res.w===61 && out.res[";"]===76 && out.res["'"]===77 && out.stuck===0;
  console.log(ok ? "  PASS  the fallback maps correctly and releases cleanly" : "  FAIL");
  await close(); process.exit(ok?0:1);
})();
