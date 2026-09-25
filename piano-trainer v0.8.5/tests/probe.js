const path=(require("path").join(__dirname,"..","src")+"/");
const keys=require(path+"keys.js");
const timing=require(path+"timing.js");
const practiceMod=require(path+"practice.js");
const fing=require(path+"fingering.js");
const theory=require(path+"theory.js");
const x2m=require(path+"convert-xml-to-midi.js");

let fails=0;
function ok(name,cond,extra){ if(!cond){fails++;console.log("FAIL:",name,extra===undefined?"":JSON.stringify(extra));} else console.log("ok  :",name); }

// --- keys layout
const L=keys.layout(60,72,700,100);
ok("layout white count C4..C5 = 8", L.whiteCount===8, L.whiteCount);
ok("black keys narrower", L.blackWidth < L.whiteWidth);
ok("first white x=0", L.keys[0].x===0);

// --- timing
const tm=timing.buildTimingMap([{startWhole:0,durWhole:1,bpm:120},{startWhole:1,durWhole:1,bpm:60}]);
ok("m1 = 2s at 120bpm", Math.abs(tm.wholeToSeconds(1)-2)<1e-9, tm.wholeToSeconds(1));
ok("total = 2+4", Math.abs(tm.totalSeconds-6)<1e-9, tm.totalSeconds);
ok("round trip", Math.abs(tm.secondsToWhole(tm.wholeToSeconds(1.5))-1.5)<1e-9);

// --- practice
const P=practiceMod.Practice;
const song={notes:[
 {midi:60,startSec:0,durSec:.5,staff:0},{midi:48,startSec:0,durSec:.5,staff:1},
 {midi:62,startSec:.5,durSec:.5,staff:0},
 {midi:64,startSec:1,durSec:.5,staff:0},
]};
const p=new P();
p.setLengthMode("off");      // a hold is required by default; this checks the gate logic alone
p.build(song,"wait","right");
ok("gates = 3 for RH", p.events.length===3, p.events.length);
ok("total required = 3", p.score.total===3, p.score.total);
ok("wait: correct note clears", p.noteOn(60)==="correct");
ok("gateIndex advanced", p.gateIndex===1, p.gateIndex);
ok("wrong note counted", p.noteOn(99)==="wrong");
ok("accuracy 50%", p.accuracy()===50, p.accuracy());

// follow-mode miss counting
const p2=new P(); p2.build(song,"follow","both"); p2.setPositionGetter(()=>0);
p2.advanceFollowTo(5);
ok("follow: all missed after passing", p2.score.missed===4, p2.score.missed);

// audioAllows policy
ok("listen+right solos RH", P.audioAllows("listen","right",0)===true && P.audioAllows("listen","right",1)===false);
// Follow/Wait: the app never plays the hand you are learning, and the other
// hand only when asked ("Play the other hand for me")
ok("wait+right mutes RH",  P.audioAllows("wait","right",0)===false && P.audioAllows("wait","right",1)===false
                          && P.audioAllows("wait","right",1,true)===true && P.audioAllows("wait","right",0,true)===false);

// densest error window
ok("densest null under 3", P.densestErrorWindow([1,2],8)===null);
const w=P.densestErrorWindow([1,2,3,40,41],8);
ok("densest picks cluster", w && w.count===3, w);

// --- fingering: octave chord RH should be 1,5
ok("RH octave -> 1,5", JSON.stringify(fing.fingerChord([60,72],"right","M"))==="[1,5]", fing.fingerChord([60,72],"right","M"));
ok("RH triad -> 1,3,5", JSON.stringify(fing.fingerChord([60,64,67],"right","M"))==="[1,3,5]", fing.fingerChord([60,64,67],"right","M"));
ok("LH octave -> 5,1 (low,high)", JSON.stringify(fing.fingerChord([36,48],"left","M"))==="[5,1]", fing.fingerChord([36,48],"left","M"));
const sc=fing.fingerMonophonic([60,62,64,65,67,69,71,72],"right","M");
console.log("     C-scale RH fingering:",sc.join(""));

// annotate assigns .finger and (bug) never an id
const s2={notes:[{midi:60,startSec:0,durSec:.5,staff:0},{midi:64,startSec:.5,durSec:.5,staff:0}]};
fing.annotate(s2,"M");
ok("annotate sets finger", s2.notes[0].finger>0);
ok("BUG CHECK: notes have no .id", s2.notes[0].id===undefined, s2.notes[0].id);

// --- theory
const cmaj=[60,62,64,65,67,69,71,72].map((m,i)=>({midi:m,startSec:i*0.5,durSec:0.5}));
const k=theory.estimateKey(cmaj);
ok("C major detected", k.tonicPc===0 && k.mode==="major", k);
// --- xml->midi header
const bytes=x2m.songToMIDI({notes:[{midi:60,startSec:0,durSec:1,staff:0}],defaultBpm:120,title:"T",timeSigNum:4,timeSigDen:4});
ok("SMF magic MThd", String.fromCharCode(...bytes.slice(0,4))==="MThd");
ok("SMF format 1", bytes[8]===0&&bytes[9]===1);
ok("ntracks 2 (no LH)", bytes[11]===2, bytes[11]);
console.log(fails? ("\n"+fails+" FAILURES") : "\nall probes passed");
