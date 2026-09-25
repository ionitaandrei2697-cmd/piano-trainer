// Node harness for transport.js with a fake audio engine + fake timers.
global.window = global;               // transport attaches to root.PT
const fs=require("fs");
eval(fs.readFileSync(require("path").join(__dirname,"..","src","transport.js"),"utf8"));
const Transport = global.PT.Transport;

let T = 0;                            // fake ctx clock
const scheduled = [];
const engine = {
  now: () => T,
  playNote: (m,f,d,when) => scheduled.push({m, when, d}),
  releaseAll: () => { released.push(T); },
  clickAt: () => {},
};
let released=[];
// fake setInterval: we tick manually
const realSI=global.setInterval, realCI=global.clearInterval;
let ticker=null;
global.setInterval=(fn)=>{ticker=fn;return 1;};
global.clearInterval=()=>{ticker=null;};

const song={ notes:[
 {midi:60,freq:261,startSec:0.00,durSec:.4,staff:0},
 {midi:62,freq:293,startSec:0.50,durSec:.4,staff:0},
 {midi:64,freq:329,startSec:1.00,durSec:.4,staff:0},
], durationSec:2 };

const tr=new Transport(engine);
tr.load(song);
tr.setHold(0.5);                       // pretend wait-mode gate at 0.5 s
tr.onHold=()=>{};
tr.play();
function advance(dt){ T+=dt; if(ticker) ticker(); }
for(let i=0;i<30 && tr.isPlaying;i++) advance(0.025);
console.log("after reaching gate: position =", tr.position.toFixed(3), "playing =", tr.isPlaying);
console.log("scheduled so far:", scheduled.map(s=>`${s.m}@${s.when.toFixed(3)}`).join(", "));
// gate cleared -> resume, exactly what app.js onGateCleared does
tr.setHold(1.0);
tr.play();
for(let i=0;i<30 && tr.isPlaying;i++) advance(0.025);
console.log("scheduled after resume:", scheduled.map(s=>`${s.m}@${s.when.toFixed(3)}`).join(", "));
const count62 = scheduled.filter(s=>s.m===62).length;
console.log(count62>1 ? `>>> BUG CONFIRMED: gate note 62 scheduled ${count62}x (double-trigger)` : "note 62 scheduled once");
