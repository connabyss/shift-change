// node export.cjs out.glb [query]  -> the game's 3D scene in photo mode, as GLB (+ camera json)
const { chromium } = require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'../..'); const MT={'.js':'text/javascript','.html':'text/html','.glb':'model/gltf-binary','.jpg':'image/jpeg'};
const srv=http.createServer((q,r)=>{if(q.method==='POST'){const n=+new URL(q.url,'http://x').searchParams.get('i');const ws=fs.createWriteStream(process.argv[2]+'.part'+n);q.pipe(ws);ws.on('finish',()=>{r.end('ok')});return;}let p=new URL(q.url,'http://x').pathname;if(p==='/')p='/index.html';fs.readFile(path.join(ROOT,p),(e,b)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'content-type':MT[path.extname(p)]||'application/octet-stream'});r.end(b);});}).listen(0);
(async()=>{const port=srv.address().port;const b=await chromium.launch();const pg=await b.newPage({viewport:{width:960,height:600}});
pg.on('pageerror',e=>console.log('ERR',String(e)));
await pg.addInitScript(()=>{const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=(f)=>{if(window.__stop)return 0;return raf(f);};});
await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await pg.goto(`http://127.0.0.1:${port}/${process.argv[3]||'?seed=4242&3d=1&photo=1'}`);
await pg.waitForFunction(()=>window.__dh,null,{timeout:120000});await pg.evaluate(()=>{window.__stop=1});
await pg.waitForFunction(()=>window.__dh.in3d(),null,{timeout:180000,polling:1000});
await pg.waitForTimeout(3000);
await pg.evaluate(()=>{__dh.begin();__dh.hush();__dh.tick(0.05,100);__dh.hush();__dh.draw3d();});
const out=await pg.evaluate(async()=>{
  const { GLTFExporter } = await import('/vendor/addons/exporters/GLTFExporter.js');
  const { scene, photoCam } = window.__dh.scene3d();
  // leave out the unlit see-through overlays (painted-on grime and dust: the path tracer makes its own shade) and helpers
  const hidden=[]; scene.traverse(o=>{ if(o.isMesh && o.material && !Array.isArray(o.material) && o.material.isMeshBasicMaterial && o.material.transparent && o.visible){o.visible=false;hidden.push(o);} });
  scene.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:true,maxTextureSize:2048});
  hidden.forEach(o=>o.visible=true);
  const CH=40e6;let parts=0;for(let o=0;o<glb.byteLength;o+=CH){await fetch('/upload?i='+parts,{method:'POST',body:glb.slice(o,o+CH)});parts++;}
  const cam={pos:photoCam.position.toArray(),quat:photoCam.quaternion.toArray(),fov:photoCam.fov,aspect:photoCam.aspect,focus:photoCam.userData.focus};
  return {parts,cam,n:glb.byteLength,t:Object.prototype.toString.call(glb)};
});
fs.writeFileSync(process.argv[2],Buffer.concat([...Array(out.parts).keys()].map(i=>{const f=process.argv[2]+'.part'+i,b=fs.readFileSync(f);fs.unlinkSync(f);return b;})));fs.writeFileSync(process.argv[2]+'.cam.json',JSON.stringify(out.cam));
console.log("ok",out.n,out.t,fs.statSync(process.argv[2]).size,JSON.stringify(out.cam));await b.close();srv.close();})();
