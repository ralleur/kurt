// SPDX-License-Identifier: AGPL-3.0-only
// Extend the existing texture-motion rig with independent two-axis gaze.
// Clip an isolated iris texture behind a fixed, inset eye opening. Source
// samples are limited to the iris core: no lid, fur or muzzle can travel.
import sharp from 'sharp';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const dir=new URL('.',import.meta.url).pathname,previous=new URL('../animation-v8/',import.meta.url).pathname;
const out=dir+'ios-assets/'; await mkdir(out,{recursive:true});await mkdir(dir+'reviews',{recursive:true});
const previousAtlas=new URL('../animation-v10/ios-assets/',import.meta.url).pathname;
const atlas=JSON.parse(await readFile(previousAtlas+'manifest.json','utf8'));
for(const file of [...atlas.pages,'room-map.json','poop.png','vomit.png','poop-drop.png','vomit-drop.png'])await copyFile(previousAtlas+file,out+file);
const textures=[],cache=new Map(),originals=new Map(),variants=new Map();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
async function original(source){if(!originals.has(source))originals.set(source,await sharp(previous+'cels/'+source+'.png').ensureAlpha().raw().toBuffer());return originals.get(source)}
async function drawing(pose,expression){
 const key=pose+':'+expression;if(variants.has(key))return variants.get(key);
 const master=await original('base/'+pose),data=Buffer.from(master);
 if(expression && !expression.startsWith('look')){
  const donor=await original(expression);
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
   const i=(y*512+x)*4;
   if(expression==='food-floor/9'){
    // Reuse just the drawn tongue and its ink edge, moved to the neutral
    // muzzle. The rest of the head stays pixel-identical to the master.
    const sx=x,sy=y-13,j=(Math.max(0,sy)*512+sx)*4;
    const tongue=Math.pow((sx-127)/26,2)+Math.pow((sy-251)/26,2)<1 && sx>=103&&sx<=151&&sy>=226&&sy<=272;
    if(tongue && donor[j+3]>240 && (donor[j+2]>donor[j+1]*.88 || (sx>106&&sx<145&&sy>232&&sy<266))) {
     for(let c=0;c<3;c++)data[i+c]=donor[j+c];
    }
   }else{
    // Small registered eye patches; every surrounding contour is original.
    const seated=pose==='sit',dx=seated?28:7,dy=seated?2:10;
    const eyes=seated?[[141,214,28,25],[211,239,34,31]]:[[120,221,27,25],[191,244,35,31]];
    let blend=0;
    for(const[cx,cy,rx,ry]of eyes){const r=Math.hypot((x-cx)/rx,(y-cy)/ry);blend=Math.max(blend,1-smooth((r-.84)/.16));}
    const sx=x+dx,sy=y+dy;
    if(blend&&sx>=0&&sx<512&&sy>=0&&sy<512){const j=(sy*512+sx)*4;for(let c=0;c<3;c++)data[i+c]=Math.round(master[i+c]*(1-blend)+donor[j+c]*blend);}
   }
  }
 }
 variants.set(key,data);return data;
}
// Eye openings are fixed. Iris texture and its painted highlight move as one
// piece behind that opening, exposing sclera on the opposite side.
const eyesByPose={
 stand:[[119.5,220,8.5,15,.65,121,217,10,14,30],[192,242,16.8,20,1,188.5,237,14.5,17,-25]],
 sit:[[140,213,8.5,14.5,.65,142,210,10,14,30],[212.5,240,17.2,20,1,209,234,15,17,-25]],
 lie:[[114,350,9.3,15.5,.65,116,347,10,15,27],[199,373,18,21,1,194,366,16,18,-25]]
};
function openingRadius(x,y,eye){
 const[cx,cy,rx,ry,,,,,,angle]=eye,a=angle*Math.PI/180,dx=x-cx,dy=y-cy;
 return Math.hypot((dx*Math.cos(a)+dy*Math.sin(a))/rx,(-dx*Math.sin(a)+dy*Math.cos(a))/ry);
}
function moveEyes(input,pose,gaze){
 if(!gaze.some(Boolean))return input;
 const output=Buffer.from(input);
 for(const eye of eyesByPose[pose]??[]){
  const[cx,cy,rx,ry,perspective,ix,iy,irx,iry]=eye,padding=Math.max(rx,ry);
  for(let y=Math.floor(cy-padding);y<=Math.ceil(cy+padding);y++)for(let x=Math.floor(cx-padding);x<=Math.ceil(cx+padding);x++){
   const opening=openingRadius(x,y,eye),mask=1-smooth((opening-.94)/.06);
   if(!mask)continue;
   const ux=x-gaze[0]*perspective-ix,uy=y-gaze[1]*perspective-iy;
   const radius=Math.hypot(ux/irx,uy/iry),iris=1-smooth((radius-.93)/.07);
   // Extend the painted iris-core edge into its missing outer rim. Sampling
   // the original eye boundary here was what moved a second eyelid in v11.
   const sourceScale=radius>0.65?0.65/radius:1;
   const sx=ix+ux*sourceScale,sy=iy+uy*sourceScale;
   const j=(y*512+x)*4,xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy;
   const samples=[[xx,yy,(1-fx)*(1-fy)],[xx+1,yy,fx*(1-fy)],[xx,yy+1,(1-fx)*fy],[xx+1,yy+1,fx*fy]];
   const white=[250,247,244];
   for(let c=0;c<3;c++){
    const color=samples.reduce((sum,[ax,ay,w])=>sum+input[(ay*512+ax)*4+c]*w,0);
    output[j+c]=Math.round(input[j+c]*(1-mask)+(white[c]*(1-iris)+color*iris)*mask);
   }
  }
 }
 return output;
}
function breathe(input,pose,amount,angle=0,gaze=[0,0]){
 if(!amount&&!angle&&!gaze.some(Boolean))return input;
 input=moveEyes(input,pose,gaze);
 const out=Buffer.alloc(input.length),low=pose==='lie'||pose==='sleep';
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  // Head is on the left of the unmirrored source. Pin it and every paw.
  const head=low?smooth((x-275)/75):Math.max(smooth((x-315)/55),smooth((y-332)/45));
  const feet=1-smooth((y-407)/38);
  const torso=Math.exp(-(((x-(low?350:330))/180)**2))*head*feet;
  const influence=(1-smooth((y-310)/90))*(1-smooth((x-315)/75));
  const theta=-angle*Math.PI/180*influence,px=x-218,py=y-335;
  let sx=218+px*Math.cos(theta)-py*Math.sin(theta);
  let sy=335+px*Math.sin(theta)+py*Math.cos(theta)+amount*torso;
  sx=Math.max(0,Math.min(511,sx));
  sy=Math.max(0,Math.min(511,sy));
  const xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy;
  const samples=[[xx,yy,(1-fx)*(1-fy)],[Math.min(511,xx+1),yy,fx*(1-fy)],[xx,Math.min(511,yy+1),(1-fx)*fy],[Math.min(511,xx+1),Math.min(511,yy+1),fx*fy]];
  let alpha=0,r=0,g=0,b=0;for(const[ax,ay,w]of samples){const j=(ay*512+ax)*4,aw=input[j+3]*w;alpha+=aw;r+=input[j]*aw;g+=input[j+1]*aw;b+=input[j+2]*aw;}
  const i=(y*512+x)*4;if(alpha){out[i]=Math.round(r/alpha);out[i+1]=Math.round(g/alpha);out[i+2]=Math.round(b/alpha);out[i+3]=Math.round(alpha);}
 }
 return out;
}
async function texture(pose,expression,level,angle=0,gaze=[0,0]){
 const key=[pose,expression,level,angle,...gaze].join(':');if(cache.has(key))return cache.get(key);
 const source=await drawing(pose,expression),amount=level*(pose==='sleep'||pose==='lie'?5:3.5)/12;
 const resized=async data=>sharp(data,{raw:{width:512,height:512,channels:4}}).resize(256).raw().toBuffer();
 const data=await resized(breathe(source,pose,amount,angle,gaze));
 if(gaze.some(Boolean)){
  const fixed=await resized(breathe(source,pose,amount,angle));
  // Downsampling must not spread a moving iris into adjacent lid pixels.
  // Reapply the eye opening at the actual atlas resolution after filtering.
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){
   const px=x*2+.5,py=y*2+.5,influence=(1-smooth((py-310)/90))*(1-smooth((px-315)/75));
   const theta=-angle*Math.PI/180*influence,dx=px-218,dy=py-335;
   const sx=218+dx*Math.cos(theta)-dy*Math.sin(theta),sy=335+dx*Math.sin(theta)+dy*Math.cos(theta);
   const mask=(eyesByPose[pose]??[]).reduce((v,eye)=>Math.max(v,1-smooth((openingRadius(sx,sy,eye)-.85)/.15)),0),i=(y*256+x)*4;
   for(let c=0;c<4;c++)data[i+c]=Math.round(fixed[i+c]+(data[i+c]-fixed[i+c])*mask);
  }
 }
 const index=textures.length;
 textures.push(await sharp(data,{raw:{width:256,height:256,channels:4}}).png().toBuffer());cache.set(key,index);return index;
}
const definitions=[
 {id:'idle-floor',pose:'stand',seconds:24,period:4,events:[[42,2,'reactions-floor/1'],[44,2,'reactions-floor/2'],[46,2,'reactions-floor/1'],[78,36,'look-left'],[145,2,'reactions-floor/1'],[147,2,'reactions-floor/2'],[149,2,'reactions-floor/1'],[174,36,'look-right'],[246,5,'food-floor/9']],gaze:[[0,3,5],[14,5,9],[48,-3,4],[83,3,5],[130,8,5],[178,5,9],[223,-2,6],[265,3,5]]},
 {id:'idle-seat',pose:'sit',seconds:27,period:4.5,events:[[47,3,'reactions-seat/11'],[104,36,'look-left'],[183,3,'reactions-seat/11'],[248,38,'look-right']],gaze:[[0,3,5],[18,-3,5],[64,6,9],[111,7,3],[155,3,5],[210,-2,6],[259,5,10],[300,3,5]]},
 {id:'idle-lie',pose:'lie',seconds:20,period:5,events:[],gaze:[[0,3,5],[20,5,9],[69,-3,4],[115,7,4],[165,3,7],[211,3,5]]}
];
function gazeAt(def,offset){
 const index=def.gaze.findLastIndex(([start])=>offset>=start),current=def.gaze[index],previous=def.gaze[Math.max(0,index-1)];
 // Two inbetween exposures, followed by a calm, unevenly timed fixation.
 const t=smooth((offset-current[0])/3);
 return [1,2].map(axis=>Math.round((previous[axis]+(current[axis]-previous[axis])*t)*2)/2);
}
const firstPage=atlas.pages.length;
for(const def of definitions){
 const sequence=atlas.sequences.find(s=>s.id===def.id),first=sequence.first,count=sequence.count;
 for(let offset=0;offset<count;offset++){
  const event=def.events.find(([start,n])=>offset>=start&&offset<start+n),expression=event?.[2]??'';
  const angle=expression.startsWith('look')?Math.round((expression==='look-left'?-4:4)*smooth((offset-event[0])/6)*smooth((event[0]+event[1]-offset)/6)*2)/2:0;
  const level=Math.round((1-Math.cos(offset/(def.period*12)*2*Math.PI))*6);
  const gaze=expression.startsWith('reactions-')?[0,0]:gazeAt(def,offset);
  const tile=await texture(def.pose,expression,level,angle,gaze);
  Object.assign(atlas.frames[first+offset],{page:firstPage+Math.floor(tile/64),column:tile%8,row:Math.floor(tile%64/8),gaze:{x:gaze[0],y:gaze[1]}});
 }
}
for(let page=0;page<Math.ceil(textures.length/64);page++){
 const file=`kurt-a-${firstPage+page}.png`;atlas.pages.push(file);
 await sharp({create:{width:2048,height:2048,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(textures.slice(page*64,(page+1)*64).map((input,i)=>({input,left:i%8*256,top:Math.floor(i/8)*256}))).png().toFile(out+file);
}
atlas.version='kurt-a-refined-12';
await writeFile(out+'manifest.json',JSON.stringify(atlas,null,2)+'\n');
const cards=[];
const checks=[];
for(const [row,def]of definitions.entries())for(const [col,gaze]of [[0,0],[3,5],[-3,4],[8,5],[5,10]].entries()){
 const original=await drawing(def.pose,''),data=breathe(original,def.pose,0,0,gaze);
 let changedInside=0,changedOutside=0;
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  const i=(y*512+x)*4;if(data.subarray(i,i+4).equals(original.subarray(i,i+4)))continue;
  const inside=eyesByPose[def.pose].some(eye=>openingRadius(x,y,eye)<1);
  if(inside)changedInside++;else changedOutside++;
 }
 if(changedOutside || (col>0&&changedInside<400))throw Error(`Eye rig escaped mask or did not move: ${def.pose}, ${gaze}, ${changedInside}/${changedOutside}`);
 checks.push({pose:def.pose,gaze,changedInside,changedOutside});
 cards.push({input:await sharp(data,{raw:{width:512,height:512,channels:4}}).flop().resize(256).png().toBuffer(),left:col*256,top:row*256});
}
await sharp({create:{width:1280,height:768,channels:4,background:'#e4eef6'}}).composite(cards).png().toFile(dir+'reviews/gaze-directions.png');
await writeFile(dir+'reviews/assets.json',JSON.stringify({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length,uniqueIdleTextures:textures.length,loops:definitions,eyeMaskChecks:checks},null,2)+'\n');
console.log({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length,uniqueIdleTextures:textures.length});
await import('./validate-lids.mjs');
await import('./render-preview.mjs');
