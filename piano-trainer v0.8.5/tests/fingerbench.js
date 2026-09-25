/* Fingering benchmark: textbook passages with (near-)universal fingerings.
 * Each expected entry is the finger, or an array of acceptable fingers.
 * "textbook" = standard scale/position/arpeggio fingerings found in every method;
 * "edition"  = the common edition fingering (single well-known source of practice);
 * "player"   = a fingering a player asked for. */
const BENCH = [
  // ---------------- right hand ----------------
  { name:"C major scale up",        hand:"right", conf:"textbook", p:[60,62,64,65,67,69,71,72], f:[1,2,3,1,2,3,4,5] },
  { name:"C major scale down",      hand:"right", conf:"textbook", p:[72,71,69,67,65,64,62,60], f:[5,4,3,2,1,3,2,1] },
  { name:"G major scale up",        hand:"right", conf:"textbook", p:[67,69,71,72,74,76,78,79], f:[1,2,3,1,2,3,4,5] },
  { name:"D major scale up",        hand:"right", conf:"textbook", p:[62,64,66,67,69,71,73,74], f:[1,2,3,1,2,3,4,5] },
  { name:"A major scale up",        hand:"right", conf:"textbook", p:[69,71,73,74,76,78,80,81], f:[1,2,3,1,2,3,4,5] },
  { name:"E major scale up",        hand:"right", conf:"textbook", p:[64,66,68,69,71,73,75,76], f:[1,2,3,1,2,3,4,5] },
  { name:"F major scale up",        hand:"right", conf:"textbook", p:[65,67,69,70,72,74,76,77], f:[1,2,3,4,1,2,3,4] },
  { name:"A minor scale up",        hand:"right", conf:"textbook", p:[69,71,72,74,76,77,79,81], f:[1,2,3,1,2,3,4,5] },
  { name:"five-finger C up/down",   hand:"right", conf:"textbook", p:[60,62,64,65,67,65,64,62,60], f:[1,2,3,4,5,4,3,2,1] },
  { name:"C major arpeggio",        hand:"right", conf:"textbook", p:[60,64,67,72], f:[1,2,3,5] },
  { name:"Ode to Joy, RH phrase",   hand:"right", conf:"textbook", p:[64,64,65,67,67,65,64,62,60,60,62,64,64,62,62], f:[3,3,4,5,5,4,3,2,1,1,2,3,3,2,2] },
  { name:"Minuet in G, opening",    hand:"right", conf:"edition",  p:[74,67,69,71,72,74,67,67], f:[5,1,2,3,4,5,1,1] },
  // ---------------- left hand ----------------
  { name:"C major scale up (LH)",   hand:"left",  conf:"textbook", p:[48,50,52,53,55,57,59,60], f:[5,4,3,2,1,3,2,1] },
  { name:"C major scale down (LH)", hand:"left",  conf:"textbook", p:[60,59,57,55,53,52,50,48], f:[1,2,3,1,2,3,4,5] },
  { name:"G major scale up (LH)",   hand:"left",  conf:"textbook", p:[43,45,47,48,50,52,54,55], f:[5,4,3,2,1,3,2,1] },
  { name:"F major scale up (LH)",   hand:"left",  conf:"textbook", p:[41,43,45,46,48,50,52,53], f:[5,4,3,2,1,3,2,1] },
  { name:"five-finger C (LH)",      hand:"left",  conf:"textbook", p:[48,50,52,53,55,53,52,50,48], f:[5,4,3,2,1,2,3,4,5] },
  { name:"C major arpeggio (LH)",   hand:"left",  conf:"textbook", p:[48,52,55,60], f:[5,4,2,1] },
  { name:"Ode to Joy, LH (C3/G2)",  hand:"left",  conf:"player",   p:[48,48,43,43,48,48,43,43], f:[[1,2],[1,2],5,5,[1,2],[1,2],5,5] },
];
/* HELD-OUT: never used while adjusting the model — reported separately, so a
 * change that only memorises the tuning set shows up as a gap between the two. */
const HELDOUT = [
  { name:"D major scale up (LH)",   hand:"left",  conf:"textbook", p:[50,52,54,55,57,59,61,62], f:[5,4,3,2,1,3,2,1] },
  { name:"A major scale up (LH)",   hand:"left",  conf:"textbook", p:[45,47,49,50,52,54,56,57], f:[5,4,3,2,1,3,2,1] },
  { name:"E minor scale up",        hand:"right", conf:"textbook", p:[64,66,67,69,71,72,74,76], f:[1,2,3,1,2,3,4,5] },
  { name:"C major, two octaves",    hand:"right", conf:"textbook", p:[60,62,64,65,67,69,71,72,74,76,77,79,81,83,84], f:[1,2,3,1,2,3,4,1,2,3,1,2,3,4,5] },
  { name:"Mary Had a Little Lamb",  hand:"right", conf:"textbook", p:[64,62,60,62,64,64,64,62,62,62,64,67,67], f:[3,2,1,2,3,3,3,2,2,2,3,5,5] },
  { name:"Jingle Bells, chorus",    hand:"right", conf:"textbook", p:[64,64,64,64,64,64,64,67,60,62,64], f:[3,3,3,3,3,3,3,5,1,2,3] },
  { name:"five-finger G (LH)",      hand:"left",  conf:"textbook", p:[43,45,47,48,50,48,47,45,43], f:[5,4,3,2,1,2,3,4,5] },
  { name:"C arpeggio, two octaves", hand:"right", conf:"textbook", p:[60,64,67,72,76,79,84], f:[1,2,3,1,2,3,5] },
];
function score(fingerFn, label, set){
  let notes=0, hit=0, exact=0; const rows=[];
  set=set||BENCH;
  for (const b of set) {
    const got=fingerFn(b.p,b.hand,"M");
    let ok=0;
    b.f.forEach((e,i)=>{ const acc=Array.isArray(e)?e:[e]; if(acc.includes(got[i])) ok++; });
    notes+=b.p.length; hit+=ok; if(ok===b.p.length) exact++;
    rows.push({name:b.name,conf:b.conf,ok,n:b.p.length,got:got.join(""),want:b.f.map(e=>Array.isArray(e)?"("+e.join("|")+")":e).join("")});
  }
  console.log("\n==== "+label+" ====");
  for (const r of rows) console.log((r.ok===r.n?"  ✓ ":"  ✗ ")+r.name.padEnd(26)+(" "+r.ok+"/"+r.n).padEnd(7)+" got "+r.got.padEnd(16)+(r.ok===r.n?"":" want "+r.want)+"  ["+r.conf+"]");
  console.log(`  notes: ${hit}/${notes} (${(100*hit/notes).toFixed(1)}%)   passages exactly right: ${exact}/${set.length}`);
  return {hit,notes,exact};
}
module.exports={BENCH,HELDOUT,score};
if (require.main===module) {
  const dir=process.argv[2]||(require("path").join(__dirname,"..","src")+"/");
  globalThis.PT={keys:require(dir+"keys.js")};
  const F=require(dir+"fingering.js");
  score(F.fingerMonophonic, "TUNING SET — "+dir, BENCH);
  score(F.fingerMonophonic, "HELD-OUT SET — "+dir, HELDOUT);
}
