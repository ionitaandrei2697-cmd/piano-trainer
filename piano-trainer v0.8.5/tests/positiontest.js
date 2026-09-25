/* Hand-position guarantees of the fingering engine (Node, no browser):
 *  - on every melody of the corpus the weighted number of moves (2 x jumps +
 *    thumb passes) equals the EXACT minimum over all fingerings;
 *  - no repeated note changes finger at moderate speed;
 *  - textbook agreement does not fall below its measured level;
 *  - the search never hits its safety bound (so the result is exact);
 *  - a 3000-onset piece with chords is fingered in well under two seconds. */
const dir="/home/claude/work/out/src/"; globalThis.PT={keys:require(dir+"keys.js")};
const F=require(dir+"fingering.js");
const {jumps,minMoves}=require("./positions.js"); const MEL=require("./melodies.js"); const {BENCH,HELDOUT}=require("./fingerbench.js");
let pass=0,fail=0; const chk=(n,ok,x)=>{ok?pass++:fail++;console.log((ok?"  PASS  ":"  FAIL  ")+n+(!ok&&x!==undefined?"  <- "+JSON.stringify(x):""));};
let notOpt=[], swaps=0, beam=false, maxStates=0;
for (const m of MEL){
  const ioi=m.p.map((_,i)=>i?0.5:null);
  const res=F.fingerHand(m.p.map(p=>({keys:[p],rep:p})),m.hand,"M",{ioi});
  const f=m.p.map((p,i)=>res.fingers[i].get(p));
  const r=jumps(m.p,f,m.hand), w=2*r.jumps+r.passes, best=minMoves(m.p,m.hand,2);
  if (Math.abs(w-best)>1e-9) notOpt.push(m.name+": "+w+" vs "+best);
  for(let i=1;i<m.p.length;i++) if(m.p[i]===m.p[i-1]&&f[i]!==f[i-1]) swaps++;
  beam=beam||res.beamHit; maxStates=Math.max(maxStates,res.maxStates);
}
chk("every melody reaches the exact minimum of hand moves ("+MEL.length+" melodies)", notOpt.length===0, notOpt);
chk("no repeated note changes finger at moderate speed", swaps===0, swaps);
chk("the search never hit its safety bound (max "+maxStates+" states per note)", !beam, maxStates);
const agree=(set)=>{let hit=0,n=0;for(const b of set){const g=F.fingerMonophonic(b.p,b.hand,"M");b.f.forEach((e,i)=>{if((Array.isArray(e)?e:[e]).includes(g[i]))hit++;});n+=b.p.length;}return 100*hit/n;};
const t1=agree(BENCH), t2=agree(HELDOUT);
chk("textbook fingerings, tuning set >= 96% ("+t1.toFixed(1)+"%)", t1>=96-1e-9, t1);
chk("textbook fingerings, held-out set = 100% ("+t2.toFixed(1)+"%)", t2>=100-1e-9, t2);
// the reported pattern: a slow repeated D4 must keep its finger whichever way the line goes
const D=[["G3 A3 B3 C4 D4 D4 E4 F4 G4 A4","right"],["A4 G4 F4 E4 D4 D4 C4 B3 A3 G3","right"],["D4 C4 B3 A3 G3 G3 A3 B3 C4 D4 D4 E4 F4 G4 A4","left"]];
const n=(s)=>s.split(" ").map(t=>{const m=t.match(/^([A-G])(\d)$/);return 12*(+m[2]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]];});
let dSwaps=[]; for (const [s,h] of D){ const p=n(s); const f=F.fingerMonophonic(p,h,"M",{ioi:p.map((_,i)=>i?0.5:null)});
  for(let i=1;i<p.length;i++) if(p[i]===p[i-1]&&f[i]!==f[i-1]) dSwaps.push(s+" -> "+f.join("")); }
chk("a slow repeated D4 at a position boundary keeps its finger", dSwaps.length===0, dSwaps);
// speed
let seed=7; const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648; const sc=[0,2,4,5,7,9,11];
const notes=[]; let deg=14,id=0; for(let i=0;i<3000;i++){deg=Math.max(7,Math.min(24,deg+[-2,-1,-1,0,1,1,2,4,-4][Math.floor(rnd()*9)]));
  notes.push({id:id++,midi:48+12*Math.floor(deg/7)+sc[deg%7],startSec:i*0.25,durSec:0.24,staff:0});
  if(i%4===0){const root=36+sc[Math.floor(rnd()*7)];for(const iv of [0,4,7])notes.push({id:id++,midi:root+iv,startSec:i*0.25,durSec:0.9,staff:1});}}
const t0=Date.now(); F.annotate({notes},"M"); const ms=Date.now()-t0;
chk("3000 onsets with chords fingered in "+ms+" ms (< 2000)", ms<2000&&notes.every(x=>x.finger>=1&&x.finger<=5), ms);
console.log("\n"+pass+" passed, "+fail+" failed"); process.exit(fail?1:0);
