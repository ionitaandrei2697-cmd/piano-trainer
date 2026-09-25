const dir=(require("path").join(__dirname,"..","src")+"/"); globalThis.PT={keys:require(dir+"keys.js")};
const F=require(dir+"fingering.js");
const {BENCH,HELDOUT}=require("./fingerbench.js"); const {jumps,minMoves}=require("./positions.js"); const MEL=require("./melodies.js");
const agree=(set,J)=>{let hit=0,n=0;for(const b of set){const g=F.fingerMonophonic(b.p,b.hand,"M",{jumpW:J});b.f.forEach((e,i)=>{if((Array.isArray(e)?e:[e]).includes(g[i]))hit++;});n+=b.p.length;}return (100*hit/n).toFixed(1)+"%";};
console.log("   J   tuning  held-out   jumps  passes  moves=J*j+p (exact min)  optimal  swaps  Twinkle");
for (const J of [1,1.5,2,2.5,3,5,1000]) {
  let tj=0,tp=0,opt=0,sw=0,tw="",mv=0,mn=0;
  for (const m of MEL){ const ioi=m.p.map((_,i)=>i?0.5:null); const f=F.fingerMonophonic(m.p,m.hand,"M",{ioi,jumpW:J});
    const r=jumps(m.p,f,m.hand); tj+=r.jumps; tp+=r.passes; const w=J*r.jumps+r.passes, best=minMoves(m.p,m.hand,J); mv+=w; mn+=best; if(Math.abs(w-best)<1e-9) opt++;
    for(let i=1;i<m.p.length;i++) if(m.p[i]===m.p[i-1]&&f[i]!==f[i-1]) sw++;
    if(m.name==="Twinkle, full melody") tw=r.jumps+"j "+r.passes+"p"; }
  console.log(String(J===1000?"inf":J).padStart(4)+agree(BENCH,J).padStart(9)+agree(HELDOUT,J).padStart(10)+String(tj).padStart(8)+String(tp).padStart(8)+(mv+" ("+mn+")").padStart(24)+(opt+"/"+MEL.length).padStart(9)+String(sw).padStart(7)+"  "+tw);
}
