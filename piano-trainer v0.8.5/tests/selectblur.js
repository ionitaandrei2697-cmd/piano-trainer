const {open}=require("./harness");
(async()=>{
  const {pg,close}=await open(process.argv[2]||require("path").join(__dirname,".."));
  await pg.setViewport({width:1440,height:830});
  const out={};
  for (const id of ["sampleList","pieceList"]) {
    const el=await pg.$("#"+id); const box=await el.boundingBox();
    await pg.mouse.click(box.x+box.width/2, box.y+box.height/2);   // a real mouse click
    await new Promise(r=>setTimeout(r,120));
    out[id]=await pg.evaluate((id)=>document.activeElement&&document.activeElement.id===id,id);
    await pg.keyboard.press("Escape");
  }
  console.log("focus kept after a real mouse click (needed for the dropdown to stay open):",JSON.stringify(out));
  await close(); process.exit(0);
})();
