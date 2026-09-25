const puppeteer=require("puppeteer");
const http=require("http"), fs=require("fs"), path=require("path");
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml"};
async function open(root){
  const srv=http.createServer((req,res)=>{
    let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html";
    const f=path.join(root,p);
    fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end("nf");} res.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}); res.end(d); });
  });
  await new Promise(r=>srv.listen(0,r));
  const port=srv.address().port;
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args:["--no-sandbox","--autoplay-policy=no-user-gesture-required","--mute-audio"]});
  const pg=await b.newPage();
  const logs=[]; pg.on("console",m=>logs.push(m.type()+": "+m.text())); pg.on("pageerror",e=>logs.push("PAGEERROR: "+e.message));
  await pg.goto("http://localhost:"+port+"/index.html",{waitUntil:"networkidle2"});
  await pg.waitForFunction("window.PT && document.getElementById('status').textContent.length>0",{timeout:15000});
  await new Promise(r=>setTimeout(r,600));
  return {pg,logs,close:async()=>{await b.close();srv.close();}};
}
module.exports={open};
