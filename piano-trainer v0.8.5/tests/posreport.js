const dir=process.argv[2]||"/home/claude/work/out/src/";
globalThis.PT={keys:require(dir+"keys.js")};
const F=require(dir+"fingering.js");
const {jumps,minMoves}=require("./positions.js"); const J=2;
const MEL=require("./melodies.js");
let tot=0, totMin=0, optimal=0, slowSwaps=0;
for (const m of MEL){
  const ioi=m.p.map((_,i)=>i?0.5:null);
  const f=F.fingerMonophonic(m.p,m.hand,"M",{ioi});
  const pc=jumps(m.p,f,m.hand), mn=minMoves(m.p,m.hand,J); pc.changes=J*pc.jumps+pc.passes;
  let swaps=0; for(let i=1;i<m.p.length;i++) if(m.p[i]===m.p[i-1]&&f[i]!==f[i-1]) swaps++;
  tot+=pc.changes; totMin+=mn; if(pc.changes===mn) optimal++; slowSwaps+=swaps;
  console.log((pc.changes===mn?"  = ":"  + ")+m.name.padEnd(36)+(" moves "+pc.changes+" (min "+mn+") = "+pc.jumps+" jumps, "+pc.passes+" passes").padEnd(40)+(swaps?" repeated-note swaps "+swaps:"").padEnd(24)+" "+f.join(""));
}
console.log(`  TOTAL moves (2 x jumps + passes) ${tot} vs exact minimum ${totMin} · optimal on ${optimal}/${MEL.length} · finger swaps on slow repeated notes: ${slowSwaps}`);
