const {open}=require("./harness");
(async()=>{const {pg,close}=await open("/home/claude/work/out");
await pg.setViewport({width:1440,height:830});
await pg.evaluate(async()=>{const s=document.getElementById("sampleList");s.value="minuetG";s.dispatchEvent(new Event("change"));await new Promise(r=>setTimeout(r,2800));});
const r=await pg.evaluate(()=>{const w=(e)=>Math.round(e.getBoundingClientRect().width);
  const m=document.querySelector(".masthead");
  return {masthead:Math.round(m.getBoundingClientRect().height), brand:w(document.querySelector(".brand")), now:w(document.querySelector(".nowplaying")),
    loaders:[...document.querySelector(".loaders").children].filter(e=>getComputedStyle(e).display!=="none").map(e=>(e.id||e.textContent.trim().slice(0,14))+":"+w(e)),
    loadersW:w(document.querySelector(".loaders")), avail:w(m)};});
console.log(JSON.stringify(r,null,1));await close();process.exit(0);})();
