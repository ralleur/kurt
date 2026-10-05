// SPDX-License-Identifier: AGPL-3.0-only
import sharp from 'sharp';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {repertoire,study,FPS,GROUND,ANCHOR,BODY_WIDTH,VERSION} from './clips.mjs';
const dir=new URL('.',import.meta.url).pathname,out=dir+'ios-assets/';
await mkdir(out,{recursive:true});await mkdir(dir+'cels/walk',{recursive:true});
// Walking cels are rebuilt from the owner's exact idle in build-walk.mjs.
const cell=256,columns=8,perPage=64,side=cell*columns;
const frames=[],images=[],sequences=[],cache=new Map();
async function imageFor(f){
 const key=JSON.stringify([f.source,!!f.flip,f.breath??0]);if(cache.has(key))return cache.get(key);
 let png=await sharp(dir+`cels/${f.source}.png`).png().toBuffer();
 if(f.breath){
  const scale=1+f.breath,h=Math.round(512*scale),dy=Math.round(GROUND*(1-scale)),y=Math.max(0,dy),crop=Math.max(0,-dy);
  const resized=await sharp(png).resize(512,h).extract({left:0,top:crop,width:512,height:Math.min(h-crop,512-y)}).png().toBuffer();
  png=await sharp({create:{width:512,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:resized,left:0,top:y}]).png().toBuffer();
 }
 if(f.flip)png=await sharp(png).flop().png().toBuffer();
 const result=await sharp(png).resize(cell).png().toBuffer();cache.set(key,result);return result;
}
async function addFrame(f,clip,label,placement){
 const index=frames.length;images.push(await imageFor(f));
 frames.push({index,page:Math.floor(index/perPage),column:index%columns,row:Math.floor(index%perPage/columns),
  time:index/FPS,clip,label,x:placement.x,y:placement.y,width:placement.width,
  lift:f.lift??0,support:f.support??placement.support,...(f.facing===undefined?{}:{facing:f.facing}),
  ...(f.travel===undefined?{}:{travel:f.travel}),source:f.source,
  ...(f.contacts?{contacts:f.contacts,contactRoot:f.contactRoot}:{}),
  ...(f.drawnContact?{drawnContact:f.drawnContact}:{}),
  ...(f.progress===undefined?{}:{progress:f.progress}),...(f.falling?{falling:f.falling}:{})});
}
const route=study();
sequences.push({id:'study',label:'Ein ruhiger Besuch im Raum',first:0,count:route.length});
for(const f of route)await addFrame(f,f.clip,f.label,f);
for(const clip of repertoire){
 const first=frames.length;sequences.push({id:clip.id,label:clip.label,first,count:clip.frames.length,
  ...(clip.swallow===undefined?{}:{swallow:first+clip.swallow}),...(clip.deposit===undefined?{}:{deposit:first+clip.deposit}),
  ...(clip.distance===undefined?{}:{distance:clip.distance}),...(clip.waste?{waste:clip.waste}:{}),
  ...Object.fromEntries(['loopStart','loopEnd','tailStart'].filter(k=>clip[k]!==undefined).map(k=>[k,first+clip[k]]))});
 const seated=clip.support==='seat'||clip.id==='jump-down'||clip.id==='jump-seat';
 for(const f of clip.frames)await addFrame(f,clip.id,clip.label,{x:seated?.41:.305,y:seated?.497:.635,width:(seated?68:104)/1280,support:clip.support});
}
const pages=[];
for(let page=0;page<Math.ceil(images.length/perPage);page++){
 const filename=`kurt-a-${page}.png`;pages.push(filename);
 await sharp({create:{width:side,height:side,channels:4,background:{r:0,g:0,b:0,alpha:0}}})
  .composite(images.slice(page*perPage,(page+1)*perPage).map((input,i)=>({input,left:i%columns*cell,top:Math.floor(i/columns)*cell})))
  .png().toFile(out+filename);
}
const manifest={version:VERSION,fps:FPS,duration:route.length/FPS,routeFrameCount:route.length,cell,columns,sourceSize:512,bodyWidth:BODY_WIDTH,
 anchor:{x:ANCHOR/512,y:GROUND/512},pages,sequences,frames};
await writeFile(out+'manifest.json',JSON.stringify(manifest,null,2)+'\n');
await copyFile(new URL('../shared/room-map.json',import.meta.url),out+'room-map.json');
for(const kind of ['poop','vomit','poop-drop','vomit-drop'])await copyFile(new URL(`../shared/${kind}.png`,import.meta.url),out+kind+'.png');
const roomMap=JSON.parse(await readFile(out+'room-map.json','utf8'));
await writeFile(dir+'atlas-inline.js','window.KURT_ATLAS='+JSON.stringify(manifest)+';\nwindow.KURT_MAP='+JSON.stringify(roomMap)+';\n');
console.log(JSON.stringify({version:VERSION,frames:frames.length,actions:repertoire.length,pages:pages.length,distinctTextures:cache.size}));
