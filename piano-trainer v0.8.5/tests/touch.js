const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open("/home/claude/work/out");
  const client=await pg.target().createCDPSession();
  const report=async(label,w,h,touch)=>{
    await pg.setViewport({width:w,height:h,deviceScaleFactor:2,hasTouch:touch});
    if (touch) await client.send("Emulation.setEmulatedMedia",{features:[{name:"pointer",value:"coarse"},{name:"hover",value:"none"}]});
    else await client.send("Emulation.setEmulatedMedia",{features:[]});
    await pg.evaluate(async()=>{const s=document.getElementById("sampleList");if(!window.__ld){window.__ld=1;s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));}
      await new Promise(r=>setTimeout(r,500));});
    const r=await pg.evaluate(()=>{
      const coarse=matchMedia("(pointer: coarse)").matches;
      // every visible interactive control in the main workspace (dialogs closed)
      const els=[...document.querySelectorAll(".workspace button, .workspace select, .workspace input, .workspace .chip, .workspace .seg__opt")]
        .filter(e=>{const s=getComputedStyle(e); if(s.display==="none"||s.visibility==="hidden") return false;
          if(e.matches("input[type=radio],input[type=checkbox],input[type=file]")) return false;   // their label is the target
          const r=e.getBoundingClientRect(); return r.width>0&&r.height>0;});
      const small=[], under40=[];
      for(const e of els){const r=e.getBoundingClientRect();const h=Math.round(r.height),w=Math.round(r.width);
        const name=(e.id||e.textContent||e.getAttribute("aria-label")||e.className).toString().trim().replace(/\s+/g," ").slice(0,26);
        if(h<24||w<24) small.push(name+" "+w+"x"+h); else if(h<40) under40.push(name+" "+w+"x"+h);}
      const f=(s)=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().height):0;};
      const kb=document.querySelector(".kbwrap").getBoundingClientRect(), inst=document.querySelector(".instrument").getBoundingClientRect();
      return {coarse, n:els.length, small, under40, rail:f(".rail"), mast:f(".masthead"), transport:f(".transport"),
        score:f(".paper"), notes:f(".rollwrap"), keys:f(".kbwrap"), fits: kb.bottom<=innerHeight+1 && document.querySelector(".transport").getBoundingClientRect().bottom<=innerHeight+1,
        clipped: kb.bottom>inst.bottom+0.5, overflowX: document.documentElement.scrollWidth-document.documentElement.clientWidth};
    });
    console.log("\n"+label+"  coarse pointer="+r.coarse+"  controls="+r.n);
    console.log("  below 24px (WCAG AA fail): "+(r.small.length?r.small.join(" | "):"none"));
    console.log("  24-39px (below Microsoft's 40px touch guidance): "+(r.under40.length?r.under40.length+" — "+r.under40.slice(0,8).join(" | "):"none"));
    console.log("  masthead "+r.mast+" · toolbar "+r.rail+" · transport "+r.transport+" · score "+r.score+" · notes "+r.notes+" · keys "+r.keys);
    console.log("  all three panels + transport fit: "+r.fits+" · keyboard clipped: "+r.clipped+" · horizontal overflow: "+r.overflowX+"px");
  };
  await report("Surface @200% (1440x830), mouse", 1440,830,false);
  await report("Surface @200% (1440x830), TOUCH",1440,830,true);
  await report("Surface @175% (1646x960), TOUCH",1646,960,true);
  await close(); process.exit(0);
})();
