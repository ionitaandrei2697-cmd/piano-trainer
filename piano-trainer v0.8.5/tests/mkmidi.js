/* A tiny standard-MIDI-file writer (format 1) for test fixtures. */
function vlq(n){const b=[n&0x7f];while(n>>=7)b.unshift((n&0x7f)|0x80);return b;}
function track(events){ // events: [{t:ticks, bytes:[...]}] absolute ticks
  events.sort((a,b)=>a.t-b.t||(a.off?-1:1)); let last=0; const out=[];
  for(const e of events){out.push(...vlq(e.t-last),...e.bytes);last=e.t;}
  out.push(0,0xff,0x2f,0);
  return [0x4d,0x54,0x72,0x6b,(out.length>>>24)&255,(out.length>>>16)&255,(out.length>>>8)&255,out.length&255,...out];
}
function name(t,s){const b=[...Buffer.from(s)];return {t,bytes:[0xff,0x03,...vlq(b.length),...b]};}
function note(ch,midi,t,dur,vel){return [{t,bytes:[0x90|ch,midi,vel||90]},{t:t+dur,off:true,bytes:[0x80|ch,midi,0]}];}
function file(tracks,ppq){const hdr=[0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0,tracks.length,(ppq>>8)&255,ppq&255];return Buffer.from([...hdr,...tracks.flat()]);}
module.exports={track,name,note,file};
if (require.main===module){
  const P=480, Q=P;                       // quarter = 480 ticks, 120 bpm
  const tempo={t:0,bytes:[0xff,0x51,0x03,0x07,0xa1,0x20]}, ts={t:0,bytes:[0xff,0x58,0x04,4,2,24,8]};
  const conductor=track([tempo,ts,name(0,"Opening (full arrangement)")]);
  // melody: a phrase that climbs to E7 (above a 61-key C7)
  const mel=[72,74,76,79,81,84,88,91,93,96,98,100]; const rh=[name(0,"Piano RH"),{t:0,bytes:[0xc0,0]}];
  mel.forEach((m,i)=>rh.push(...note(0,m,i*Q,Q-20)));
  // left hand chords and a bass line down to E1 (below a 61-key C2)
  const lh=[name(0,"Piano LH"),{t:0,bytes:[0xc1,0]}];
  [[48,52,55],[43,47,50],[45,48,52],[41,45,48]].forEach((ch,i)=>ch.forEach(m=>lh.push(...note(1,m,i*3*Q,3*Q-20))));
  const bass=[name(0,"Bass"),{t:0,bytes:[0xc2,33]}];
  [28,31,33,29,28,24].forEach((m,i)=>bass.push(...note(2,m,i*2*Q,2*Q-20)));   // E1 G1 A1 F1 E1 C1
  const strings=[name(0,"Strings"),{t:0,bytes:[0xc3,48]}];
  [[67,71,74],[62,67,71]].forEach((ch,i)=>ch.forEach(m=>strings.push(...note(3,m,i*6*Q,6*Q-20,60))));
  const drums=[name(0,"Drums")];
  for(let i=0;i<12;i++){ drums.push(...note(9,i%2?38:36,i*Q,60,100)); drums.push(...note(9,42,i*Q+Q/2,40,70)); }
  require("fs").writeFileSync(__dirname+"/fixtures/arrangement.mid", file([conductor,track(rh),track(lh),track(bass),track(strings),track(drums)],P));
  console.log("wrote fixtures/arrangement.mid");
}
