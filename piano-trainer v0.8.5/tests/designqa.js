const {open}=require("./harness");
(async()=>{
  const {pg,logs,close}=await open("/home/claude/work/out");
  await pg.setViewport({width:1440,height:1000,deviceScaleFactor:2});
  const out=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,3000));
    const sc=document.getElementById("scrubber"); sc.value="2.2"; sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,500));

    // --- contrast ---
    const lum=(c)=>{const [r,g,b]=c.map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*r+0.7152*g+0.0722*b;};
    const parse=(str)=>{const m=str.match(/\d+(\.\d+)?/g).map(Number);return [m[0],m[1],m[2]];};
    const ratio=(a,b)=>{const L1=lum(a),L2=lum(b);return ((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05));};
    const bgOf=(el)=>{let e=el;while(e){const cs=getComputedStyle(e);
      const bi=cs.backgroundImage;
      if(bi&&bi!=="none"&&/rgb/.test(bi)){const m=bi.match(/rgba?\([^)]+\)/g);if(m&&m.length)return parse(m[0]);}
      const b=cs.backgroundColor;if(b&&!/rgba\(0, 0, 0, 0\)|transparent/.test(b))return parse(b);
      e=e.parentElement;}return [14,20,32];};
    const contrast=(sel,label)=>{const e=document.querySelector(sel);if(!e)return null;
      const cs=getComputedStyle(e);
      return {label, size:cs.fontSize, weight:cs.fontWeight, ratio:+ratio(parse(cs.color),bgOf(e)).toFixed(2), family:cs.fontFamily.split(",")[0].replace(/"/g,"")};};
    const contrasts=[
      contrast(".nowplaying__name","piece title"),
      contrast(".brand h1","wordmark"),
      contrast(".status","status line"),
      contrast(".rail__label","group label"),
      contrast(".seg__opt input:checked + span","selected mode"),
      contrast(".chip","toggle pill"),
      contrast(".score__cell b","readout value"),
      contrast(".score__cell span","readout label"),
      contrast(".time","transport time"),
      contrast(".btn--file","primary button"),
      contrast(".btn--ghost","ghost button"),
      contrast(".seg__opt span","unselected mode"),
      contrast(".knob__label","knob label"),
    ].filter(Boolean);

    // --- palette actually applied ---
    const cs=getComputedStyle(document.documentElement);
    const tok=(n)=>cs.getPropertyValue(n).trim();
    const palette={ink:tok("--ink"),well:tok("--well"),ivory:tok("--ivory"),gold:tok("--gold"),lapis:tok("--lapis"),jade:tok("--jade")};

    // --- the fused instrument: is there a gap between roll and keys? ---
    const rollR=document.getElementById("rollPanel").getBoundingClientRect();
    const kbR=document.getElementById("keyboardPanel").getBoundingClientRect();
    const seam=+(kbR.top-rollR.bottom).toFixed(2);

    // --- canvas colour sampling: are notes gold/lapis? ---
    const c=document.getElementById("rollCanvas"), cx=c.getContext("2d");
    const img=cx.getImageData(0,0,c.width,c.height).data;
    const hue=(r,g,b)=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return -1;
      let h; if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; return Math.round(h*60+360)%360;};
    let warm=0,cool=0,neutralBright=0;
    for(let i=0;i<img.length;i+=4){const r=img[i],g=img[i+1],b=img[i+2];
      const mx=Math.max(r,g,b); if(mx<70) continue;
      const h=hue(r,g,b), sat=(mx-Math.min(r,g,b))/mx;
      if(sat<0.12&&mx>200) neutralBright++;
      else if(h>=25&&h<=60&&sat>0.25) warm++;
      else if(h>=190&&h<=245&&sat>0.25) cool++;
    }

    // --- fonts really loaded? ---
    const fonts=[...document.fonts].map(f=>f.family+" "+f.style+" "+f.status);
    const uniq=[...new Set(fonts.map(f=>f.split(" ")[0]))];

    // --- layout ---
    const de=document.documentElement;
    const overflow=de.scrollWidth-de.clientWidth;
    const panels=["sheetPanel","rollPanel","keyboardPanel","scorePanel"].map(id=>{
      const r=document.getElementById(id).getBoundingClientRect();
      return id+" "+Math.round(r.width)+"x"+Math.round(r.height);});

    // --- OSMD title suppressed? (more page for the music) ---
    const svg=document.querySelector("#sheetContainer svg");
    const svgH=svg?Math.round(svg.getBoundingClientRect().height):0;

    return {contrasts,palette,seam,warm,cool,neutralBright,uniq,overflow,panels,svgH};
  });

  console.log("PALETTE APPLIED :", JSON.stringify(out.palette));
  console.log("FONTS LOADED    :", out.uniq.join(", "));
  console.log("");
  console.log("CONTRAST (WCAG AA needs 4.5, or 3.0 for >=18.66px bold / >=24px)");
  for(const c of out.contrasts){
    const px=parseFloat(c.size), large = px>=24 || (px>=18.66 && parseInt(c.weight)>=700);
    const need = large?3.0:4.5;
    const ok = c.ratio>=need ? "ok " : "LOW";
    console.log("  "+ok+" "+String(c.ratio).padStart(5)+" : "+c.label.padEnd(16)+c.size.padEnd(8)+c.family);
  }
  console.log("");
  console.log("FUSED INSTRUMENT: gap between falling notes and keys = "+out.seam+"px "+(out.seam===0?"(seamless)":"(GAP!)"));
  console.log("CANVAS COLOUR   : warm/gold px="+out.warm+"  cool/lapis px="+out.cool+"  ivory-bright px="+out.neutralBright);
  console.log("HORIZ OVERFLOW  : "+out.overflow+"px");
  console.log("PANELS          : "+out.panels.join("  |  "));
  console.log("SCORE SVG HEIGHT: "+out.svgH+"px of engraving in the page");

  // responsive
  for (const w of [390, 768, 1440]) {
    await pg.setViewport({width:w,height:900});
    await new Promise(r=>setTimeout(r,500));
    const r=await pg.evaluate(()=>({o:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      rail:Math.round(document.querySelector(".rail").getBoundingClientRect().height),
      tp:Math.round(document.querySelector(".transport").getBoundingClientRect().height)}));
    console.log("RESPONSIVE "+String(w).padStart(4)+"px : overflow="+r.o+"  toolbar="+r.rail+"px  transport="+r.tp+"px");
  }
  const errs=[...new Set(logs.filter(l=>l.startsWith("PAGEERROR")))];
  console.log("PAGE ERRORS     : "+(errs.length?errs.join(" | "):"(none)"));
  await close(); process.exit(0);
})();
