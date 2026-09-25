/* Pixel check of the position slider: played part ivory, rest dark, thumb
 * centred, and a hit area of 24px (mouse) or 44px (touch). Refuses to measure
 * unless a piece is really loaded — an empty app has a disabled slider. */
const {open}=require("./harness");
(async()=>{
  const touch=!!process.env.TOUCH;
  const {pg,close}=await open("/home/claude/work/out");
  const cdp=await pg.target().createCDPSession();
  if (touch) {
    // setViewport with hasTouch RELOADS the page in puppeteer — wait for the new document
    await Promise.all([pg.waitForNavigation({waitUntil:"networkidle2"}).catch(()=>{}),
                       pg.setViewport({width:1440,height:830,deviceScaleFactor:1,hasTouch:true})]);
    await cdp.send("Emulation.setEmulatedMedia",{features:[{name:"pointer",value:"coarse"}]});
    await pg.waitForFunction("window.PT && document.getElementById('status').textContent.length>0",{timeout:15000});
    await new Promise(r=>setTimeout(r,600));
  } else {
    await pg.setViewport({width:1440,height:830,deviceScaleFactor:1});
  }
  const state=await pg.evaluate(async()=>{
    const s=document.getElementById("sampleList"); s.value="minuetG"; s.dispatchEvent(new Event("change"));
    for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,150)); if(!document.getElementById("scrubber").disabled) break; }
    await new Promise(r=>setTimeout(r,400));
    const sc=document.getElementById("scrubber"); sc.value=String(parseFloat(sc.max)*0.5); sc.dispatchEvent(new Event("change"));
    await new Promise(r=>setTimeout(r,300));
    return {disabled:sc.disabled, max:+sc.max, coarse:matchMedia("(pointer: coarse)").matches};
  });
  if (state.disabled || state.max<=1) { console.log("NOT MEASURED — no piece loaded", JSON.stringify(state)); await close(); process.exit(1); }
  const png=await (await pg.$("#scrubber")).screenshot();
  require("fs").writeFileSync("/tmp/scrub.png",png);
  await close();
  const {execSync}=require("child_process");
  console.log((touch?"TOUCH ":"MOUSE ")+"coarse="+state.coarse);
  console.log(execSync(`python3 -c "
from PIL import Image
im=Image.open('/tmp/scrub.png').convert('RGB'); W,H=im.size
# the track row: the brightest row at 20% across the height
col20=[im.getpixel((int(W*.2),y)) for y in range(H)]
ty=max(range(H),key=lambda y:sum(col20[y]))
def c(x,y): return '#%02x%02x%02x'%im.getpixel((x,y))
print('  hit area %dx%d px' % (W,H))
print('  track row y=%d of %d (centre %d)' % (ty,H,H//2))
print('  played   (20%%): ', c(int(W*.2),ty))
print('  unplayed (80%%): ', c(int(W*.8),ty))
col=[im.getpixel((int(W*.5),y)) for y in range(H)]
b=[y for y,p in enumerate(col) if sum(p)>600]
print('  thumb spans rows', (min(b),max(b)) if b else None, '-> centred:', bool(b) and abs((min(b)+max(b))/2-(H-1)/2)<=2)
"`).toString());
  process.exit(0);
})();
