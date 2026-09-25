const {open}=require("./harness");
const ROOT=process.argv[2];
(async()=>{
  const {pg,close}=await open(ROOT);
  await pg.setViewport({width:1440,height:1000});
  const out=await pg.evaluate(async()=>{
    // synthetic dense piece: 12000 notes over 20 minutes
    const notes=[];
    for(let i=0;i<12000;i++){
      notes.push({id:"n"+i, midi:48+(i%36), freq:440*Math.pow(2,((48+(i%36))-69)/12),
                  startSec:i*0.1, durSec:0.28, staff:i%2, measure:Math.floor(i/16)});
    }
    const bars=[]; for(let b=0;b<300;b++) bars.push({number:b+1,startSec:b*4,endSec:b*4+4,beats:4,beatUnit:4});
    const song={format:"midi",title:"stress",hasSheet:false,notes,cursorOnsetsWhole:[],
                durationSec:1200,defaultBpm:120,timeSigNum:4,timeSigDen:4,staffCount:2,
                range:{minMidi:48,maxMidi:83},bars};
    const roll=new window.PT.PianoRollView();
    roll.init(document.getElementById("rollCanvas"));
    roll.setRange(21,108); roll.setSong(song); roll.resize();
    const t=(pos)=>{const t0=performance.now(); for(let k=0;k<60;k++) roll.render(pos+k*0.0166); return (performance.now()-t0)/60;};
    const early=t(5), mid=t(600), late=t(1150);
    return {early:+early.toFixed(3), mid:+mid.toFixed(3), late:+late.toFixed(3), notes:notes.length};
  });
  console.log(ROOT.split("/").pop().padEnd(14), "ms/frame  @start="+out.early, " @middle="+out.mid, " @end="+out.late, " ("+out.notes+" notes)");
  await close(); process.exit(0);
})();
