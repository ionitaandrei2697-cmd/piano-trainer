/* Regression test for the "D4 with 5, then 1" report (Ode to Joy): no single
 * fingering edit — one note pinned to any finger, or any "every <pitch>" rule —
 * may make a slowly repeated note change finger in the re-fit around it.
 * (In the engine before the hand-position rework, pinning the first D4 of bar 4
 * to 5 re-fitted the next D4 to 1.) */
const dir=process.argv[2]||"/home/claude/work/out/src/"; globalThis.PT={keys:require(dir+"keys.js")};
const F=require(dir+"fingering.js");
const n=(s)=>s.trim().split(/\s+/).map(t=>{const m=t.match(/^([A-G])(\d)$/);return 12*(+m[2]+1)+{C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]];});
const RH=n("E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4 D4 D4 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4 C4 C4");
const RD=[1,1,1,1,1,1,1,1,1,1,1,1,1.5,0.5,2, 1,1,1,1,1,1,1,1,1,1,1,1,1.5,0.5,2];
const LH=n("C3 C3 G2 G2 C3 C3 G2 G2 C3 C3 G2 G2 C3 C3 G2 C3"); const LD=[2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2];
const mk=()=>{const notes=[];let t=0,id=0;RH.forEach((m,i)=>{notes.push({id:id++,midi:m,startSec:t,durSec:RD[i]*0.475,staff:0});t+=RD[i]*0.5;});
  t=0;LH.forEach((m,i)=>{notes.push({id:id++,midi:m,startSec:t,durSec:LD[i]*0.475,staff:1});t+=LD[i]*0.5;});return {notes};};
const swaps=(s,pinnedIds)=>{const out=[];for(const staff of [0,1]){const ns=s.notes.filter(x=>staff===0?x.staff===0:x.staff>=1).sort((a,b)=>a.startSec-b.startSec);
  for(let i=1;i<ns.length;i++){const a=ns[i-1],b=ns[i]; if(a.midi===b.midi&&a.finger!==b.finger&&!(pinnedIds.has(a.id)&&pinnedIds.has(b.id))) out.push(b.midi+" "+a.finger+"->"+b.finger);}}return out;};
let tried=0; const bad=[];
const base=mk(); const total=base.notes.length;
for (let id=0; id<total; id++) for (let f=1; f<=5; f++) {
  const s=mk(); F.annotate(s,"M",{pins:new Map([[id,f]])}); tried++;
  const w=swaps(s,new Set([id])); if (w.length) bad.push("pin note "+id+" -> "+f+": "+w.join(", "));
}
for (const staff of [0,1]) for (const pitch of [...new Set((staff?LH:RH))]) for (let f=1;f<=5;f++) {
  const s=mk(); const ids=s.notes.filter(x=>(staff?x.staff>=1:x.staff===0)&&x.midi===pitch).map(x=>x.id);
  F.annotate(s,"M",{pins:new Map(ids.map(i=>[i,f]))}); tried++;
  const w=swaps(s,new Set(ids)); if (w.length) bad.push("rule "+pitch+" -> "+f+": "+w.join(", "));
}
console.log((bad.length?"  FAIL  ":"  PASS  ")+"no single edit ("+tried+" tried) makes a repeated note change finger"+(bad.length?"  <- "+bad.slice(0,5).join(" | "):""));
console.log("\n"+(bad.length?0:1)+" passed, "+(bad.length?1:0)+" failed"); process.exit(bad.length?1:0);
