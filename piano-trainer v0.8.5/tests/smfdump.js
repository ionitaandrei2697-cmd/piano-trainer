/* Raw Standard MIDI File dump — independent of the app's MIDI library. */
const fs=require("fs"); const buf=fs.readFileSync(process.argv[2]);
let p=0; const u8=()=>buf[p++], u16=()=>(buf[p++]<<8)|buf[p++], u32=()=>((buf[p++]<<24)>>>0)+(buf[p++]<<16)+(buf[p++]<<8)+buf[p++];
const vlq=()=>{let v=0,b;do{b=buf[p++];v=(v<<7)|(b&0x7f);}while(b&0x80);return v;};
const str=(n)=>{const s=buf.slice(p,p+n).toString("latin1");p+=n;return s;};
if(str(4)!=="MThd") throw new Error("not a MIDI file");
const hl=u32(), format=u16(), ntr=u16(), div=u16(); p+=hl-6;
console.log(`format ${format}, ${ntr} tracks, ${div} ticks per quarter, ${buf.length} bytes`);
const GM=["Acoustic Grand Piano","Bright Acoustic Piano","Electric Grand Piano","Honky-tonk Piano","Electric Piano 1","Electric Piano 2","Harpsichord","Clavinet"];
const NM=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"], nm=(m)=>NM[m%12]+(Math.floor(m/12)-1);
const tempos=[], sigs=[]; let totalNotes=0;
for(let t=0;t<ntr;t++){
  if(str(4)!=="MTrk"){console.log("bad chunk");break;} const len=u32(), end=p+len;
  let tick=0, run=0, name="", chans=new Map(), programs=new Map(), sustain=0, lastTick=0;
  while(p<end){
    tick+=vlq(); let st=buf[p];
    if(st<0x80) st=run; else { p++; if(st<0xf0) run=st; }
    const hi=st&0xf0, ch=st&0x0f;
    if(st===0xff){ const type=u8(), l=vlq(); const d=buf.slice(p,p+l); p+=l;
      if(type===0x03) name=d.toString("latin1");
      if(type===0x51) tempos.push({tick,bpm:+(60000000/((d[0]<<16)|(d[1]<<8)|d[2])).toFixed(2)});
      if(type===0x58) sigs.push({tick,sig:d[0]+"/"+(1<<d[1])});
    } else if(st===0xf0||st===0xf7){ const l=vlq(); p+=l; }
    else if(hi===0x90||hi===0x80){ const n=u8(), v=u8();
      if(hi===0x90&&v>0){ const c=chans.get(ch)||{n:0,lo:127,hi:0}; c.n++; c.lo=Math.min(c.lo,n); c.hi=Math.max(c.hi,n); chans.set(ch,c); totalNotes++; }
      lastTick=tick; }
    else if(hi===0xa0||hi===0xe0){ p+=2; }
    else if(hi===0xb0){ const cc=u8(), v=u8(); if(cc===64&&v>=64) sustain++; }
    else if(hi===0xc0){ programs.set(ch,u8()); }
    else if(hi===0xd0){ p+=1; }
    else { console.log("unknown status",st.toString(16),"at",p); break; }
  }
  p=end;
  const chs=[...chans.entries()].map(([c,v])=>`ch${c+1}${c===9?" (DRUMS)":""}: ${v.n} notes ${nm(v.lo)}-${nm(v.hi)}${programs.has(c)?", program "+programs.get(c)+(programs.get(c)<8?" ("+GM[programs.get(c)]+")":""):""}`).join("; ");
  console.log(`track ${t}: "${name}" ${chs||"(no notes)"}${sustain?" · sustain pedal ×"+sustain:""} · ends at tick ${tick}`);
}
console.log("total notes:", totalNotes);
console.log("tempo changes:", tempos.length, tempos.slice(0,12).map(x=>x.bpm+"@"+x.tick).join(", "), tempos.length>12?"…":"");
console.log("time signatures:", sigs.map(x=>x.sig+"@"+x.tick).join(", ")||"(none)");
