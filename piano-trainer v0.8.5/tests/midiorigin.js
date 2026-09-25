const puppeteer=require("puppeteer");
(async()=>{
  const b=await puppeteer.launch({headless:"new",executablePath:"/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome",
    args:["--no-sandbox","--mute-audio"]});
  const probe=async(url,label)=>{
    const pg=await b.newPage();
    await pg.goto(url,{waitUntil:"domcontentloaded"});
    const r=await pg.evaluate(async()=>{
      const out={secure:window.isSecureContext, origin:location.origin, hasAPI:typeof navigator.requestMIDIAccess==="function"};
      try { const perm=await navigator.permissions.query({name:"midi"}); out.permission=perm.state; } catch(e){ out.permission="query failed: "+e.name; }
      try {
        const res=await Promise.race([navigator.requestMIDIAccess().then(a=>"granted, inputs="+a.inputs.size),
                                      new Promise(r=>setTimeout(()=>r("no answer in 3 s (prompt pending)"),3000))]);
        out.request=res;
      } catch(e){ out.request="rejected: "+e.name+" — "+e.message; }
      return out;
    });
    console.log(label.padEnd(28), JSON.stringify(r));
    await pg.close();
  };
  // http://localhost via a tiny server
  const http=require("http"),fs=require("fs");
  const srv=http.createServer((q,s)=>{s.writeHead(200,{"Content-Type":"text/html"});s.end("<!doctype html><title>x</title>");});
  await new Promise(r=>srv.listen(8123,r));
  await probe("file:///home/claude/work/out/index.html","file://");
  await probe("http://localhost:8123/","http://localhost");
  await probe("http://127.0.0.1:8123/","http://127.0.0.1");
  srv.close(); await b.close(); process.exit(0);
})();
