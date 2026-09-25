/* Hand-position analysis.
 * A HAND POSITION, as taught: each finger stays on its own key. Within one
 * position a key is always played by the same finger, a finger always plays
 * the same key, fingers are in pitch order (no thumb passes), and the span
 * between any two fingers is within Parncutt's COMFORTABLE range (beyond
 * relaxed is a stretch, not a move). positionChanges() counts how often a fingering breaks that;
 * minPositionChanges() computes the smallest number ANY fingering could have
 * (exact dynamic programme over segmentations). */
const SPAN = { "1-2":[-5,-3,1,5,8,10], "1-3":[-4,-2,3,7,10,12], "1-4":[-3,-1,5,9,12,14], "1-5":[-1,1,7,10,13,15],
  "2-3":[1,1,1,2,3,5], "2-4":[1,1,3,4,5,7], "2-5":[2,2,5,6,8,10], "3-4":[1,1,1,2,2,4], "3-5":[1,1,3,4,5,7], "4-5":[1,1,1,2,3,5] };
const MIN_COMF=1, MAX_COMF=4;
/** Can (p1,f1) and (p2,f2) belong to one hand position? (right-hand space) */
function compatible(p1,f1,p2,f2){
  if (p1===p2) return f1===f2;
  if (f1===f2) return false;
  const [lo,hi]= f1<f2 ? [[p1,f1],[p2,f2]] : [[p2,f2],[p1,f1]];
  const d = hi[0]-lo[0];                 // pitch of the higher finger minus the lower finger's
  if (d<=0) return false;                // crossed = a thumb pass or a jump
  const L = SPAN[lo[1]+"-"+hi[1]];
  return d>=L[MIN_COMF] && d<=L[MAX_COMF];
}
const toRH=(p,hand)=>hand==="left"?-p:p;
function positionChanges(pitches,fingers,hand){
  const P=pitches.map(p=>toRH(p,hand)); let seg=[], changes=0, at=[];
  for (let i=0;i<P.length;i++){
    const ok=seg.every(j=>compatible(P[j],fingers[j],P[i],fingers[i]));
    if (!ok){ changes++; at.push(i); seg=[]; }
    seg.push(i);
  }
  return {changes,at};
}
/** Exact minimum over ALL fingerings: fewest segments each playable in one position. */
function minPositionChanges(pitches,hand){
  const P=pitches.map(p=>toRH(p,hand)), n=P.length;
  // a segment is feasible if its distinct keys (<=5) admit an increasing finger assignment, all pairs compatible
  const combos=(m)=>{const out=[];const rec=(start,acc)=>{if(acc.length===m){out.push(acc.slice());return;}for(let f=start;f<=5;f++){acc.push(f);rec(f+1,acc);acc.pop();}};rec(1,[]);return out;};
  const feasible=(i,j)=>{
    const keys=[...new Set(P.slice(i,j+1))].sort((a,b)=>a-b);
    if (keys.length>5) return false;
    for (const fs of combos(keys.length)) {
      let ok=true;
      for (let a=0;a<keys.length&&ok;a++) for (let b=a+1;b<keys.length&&ok;b++) ok=compatible(keys[a],fs[a],keys[b],fs[b]);
      if (ok) return true;
    }
    return false;
  };
  const best=new Array(n+1).fill(Infinity); best[0]=0;
  for (let j=1;j<=n;j++) for (let i=j;i>=1;i--){ if(!feasible(i-1,j-1)) break; best[j]=Math.min(best[j],best[i-1]+1); }
  return best[n]-1;
}
/* A thumb pass (thumb under / finger over, neighbouring notes, within a fifth,
 * not the pinky) lets the hand glide; every other move is a JUMP. */
const PAIR=(f1,p1,f2,p2)=>f1<f2?{d:p2-p1}:{d:p1-p2};
function isPass(p1,f1,p2,f2){ if(f1===f2||(f1!==1&&f2!==1)||p1===p2||f1===5||f2===5) return false; const {d}=PAIR(f1,p1,f2,p2); return d<0&&-d<=7; }
function jumps(pitches,fingers,hand){
  const P=pitches.map(p=>toRH(p,hand)); let seg=[], j=0, passes=0, at=[];
  for (let i=0;i<P.length;i++){
    if (!seg.every(k=>compatible(P[k],fingers[k],P[i],fingers[i]))){
      if (isPass(P[i-1],fingers[i-1],P[i],fingers[i])) passes++; else { j++; at.push(i); }
      seg=[];
    }
    seg.push(i);
  }
  return {jumps:j,passes,at};
}
/** Exact minimum number of JUMPS over all fingerings (segments joined by thumb passes are free). */
function minJumps(pitches,hand){
  const P=pitches.map(p=>toRH(p,hand)), n=P.length;
  const combos=(m)=>{const out=[];const rec=(st,acc)=>{if(acc.length===m){out.push(acc.slice());return;}for(let f=st;f<=5;f++){acc.push(f);rec(f+1,acc);acc.pop();}};rec(1,[]);return out;};
  const assigns=(i,j)=>{const keys=[...new Set(P.slice(i,j+1))].sort((a,b)=>a-b); if(keys.length>5) return null;
    const ok=[]; for(const fs of combos(keys.length)){let good=true;for(let a=0;a<keys.length&&good;a++)for(let b=a+1;b<keys.length&&good;b++)good=compatible(keys[a],fs[a],keys[b],fs[b]);
      if(good) ok.push(new Map(keys.map((k,x)=>[k,fs[x]])));} return ok.length?ok:null;};
  // best[j] : Map(finger of note j -> min jumps for notes 0..j, ending a segment at j)
  const best=Array.from({length:n},()=>new Map());
  for (let j=0;j<n;j++) for (let i=j;i>=0;i--){
    const A=assigns(i,j); if(!A) break;
    for (const a of A){
      const fi=a.get(P[i]), fj=a.get(P[j]);
      let base;
      if (i===0) base=0;
      else { base=Infinity; for (const [fprev,v] of best[i-1]) base=Math.min(base, v+(isPass(P[i-1],fprev,P[i],fi)?0:1)); }
      if (base<(best[j].has(fj)?best[j].get(fj):Infinity)) best[j].set(fj,base);
    }
  }
  return Math.min(...best[n-1].values());
}
/** Exact minimum of J x jumps + passes over all fingerings. */
function minMoves(pitches,hand,J){
  const P=pitches.map(p=>toRH(p,hand)), n=P.length;
  const combos=(m)=>{const out=[];const rec=(st,acc)=>{if(acc.length===m){out.push(acc.slice());return;}for(let f=st;f<=5;f++){acc.push(f);rec(f+1,acc);acc.pop();}};rec(1,[]);return out;};
  const assigns=(i,j)=>{const keys=[...new Set(P.slice(i,j+1))].sort((a,b)=>a-b); if(keys.length>5) return null;
    const ok=[]; for(const fs of combos(keys.length)){let good=true;for(let a=0;a<keys.length&&good;a++)for(let b=a+1;b<keys.length&&good;b++)good=compatible(keys[a],fs[a],keys[b],fs[b]);
      if(good) ok.push(new Map(keys.map((k,x)=>[k,fs[x]])));} return ok.length?ok:null;};
  const best=Array.from({length:n},()=>new Map());
  for (let j=0;j<n;j++) for (let i=j;i>=0;i--){
    const A=assigns(i,j); if(!A) break;
    for (const a of A){ const fi=a.get(P[i]), fj=a.get(P[j]); let base;
      if (i===0) base=0; else { base=Infinity; for (const [fp,v] of best[i-1]) base=Math.min(base, v+(isPass(P[i-1],fp,P[i],fi)?1:J)); }
      if (base<(best[j].has(fj)?best[j].get(fj):Infinity)) best[j].set(fj,base); } }
  return Math.min(...best[n-1].values());
}
module.exports={compatible,positionChanges,minPositionChanges,jumps,minJumps,minMoves};
