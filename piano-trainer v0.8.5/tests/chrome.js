const {open}=require("./harness");
(async()=>{const {pg,close}=await open("/home/claude/work/out");
await pg.setViewport({width:1440,height:900});
await pg.evaluate(async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));});
const r=await pg.evaluate(()=>{
  const h=(sel)=>Math.round(document.querySelector(sel).getBoundingClientRect().height);
  const rail=document.querySelector(".rail");
  const groups=[...rail.querySelectorAll(".rail__group")].map(g=>({label:(g.querySelector(".rail__label")||{textContent:"(tools)"}).textContent,w:Math.round(g.getBoundingClientRect().width)}));
  return {masthead:h(".masthead"),rail:h(".rail"),transport:h(".transport"),railClientW:rail.clientWidth,
          groupsTotal:groups.reduce((s,g)=>s+g.w,0)+groups.length*14, groups};});
console.log(JSON.stringify(r,null,1));
await close();process.exit(0);})();
