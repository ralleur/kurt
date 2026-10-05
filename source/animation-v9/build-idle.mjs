// SPDX-License-Identifier: AGPL-3.0-only
// Extend the approved v8 atlas. Breathing deforms the torso locally; the
// original head and grounded paws are immutable. Existing drawings supply
// expressions, with the body kept from the owner's chosen neutral pose.
import sharp from 'sharp';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const dir=new URL('.',import.meta.url).pathname,previous=new URL('../animation-v8/',import.meta.url).pathname;
const out=dir+'ios-assets/'; await mkdir(out,{recursive:true});await mkdir(dir+'reviews',{recursive:true});
const atlas=JSON.parse(await readFile(previous+'ios-assets/manifest.json','utf8'));
for(const file of [...atlas.pages,'room-map.json','poop.png','vomit.png','poop-drop.png','vomit-drop.png'])await copyFile(previous+'ios-assets/'+file,out+file);
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
function breathe(input,pose,amount,angle=0){
 if(!amount&&!angle)return input;
 const out=Buffer.alloc(input.length),low=pose==='lie'||pose==='sleep';
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){
  // Head is on the left of the unmirrored source. Pin it and every paw.
  const head=low?smooth((x-275)/75):Math.max(smooth((x-315)/55),smooth((y-332)/45));
  const feet=1-smooth((y-407)/38);
  const torso=Math.exp(-(((x-(low?350:330))/180)**2))*head*feet;
  const influence=(1-smooth((y-310)/90))*(1-smooth((x-315)/75));
  const theta=-angle*Math.PI/180*influence,px=x-218,py=y-335;
  const eyes=pose==='stand'?[[120,221],[191,244]]:pose==='sit'?[[141,214],[211,239]]:[];
  const gaze=eyes.reduce((v,[cx,cy])=>Math.max(v,Math.exp(-(((x-cx)/18)**4+((y-cy)/23)**4))),0)*angle*.45;
  const sx=Math.max(0,Math.min(511,218+px*Math.cos(theta)-py*Math.sin(theta)+gaze));
  const sy=Math.max(0,Math.min(511,335+px*Math.sin(theta)+py*Math.cos(theta)+amount*torso));
  const xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy;
  const samples=[[xx,yy,(1-fx)*(1-fy)],[Math.min(511,xx+1),yy,fx*(1-fy)],[xx,Math.min(511,yy+1),(1-fx)*fy],[Math.min(511,xx+1),Math.min(511,yy+1),fx*fy]];
  let alpha=0,r=0,g=0,b=0;for(const[ax,ay,w]of samples){const j=(ay*512+ax)*4,aw=input[j+3]*w;alpha+=aw;r+=input[j]*aw;g+=input[j+1]*aw;b+=input[j+2]*aw;}
  const i=(y*512+x)*4;if(alpha){out[i]=Math.round(r/alpha);out[i+1]=Math.round(g/alpha);out[i+2]=Math.round(b/alpha);out[i+3]=Math.round(alpha);}
 }
 return out;
}
async function texture(pose,expression,level,angle=0){
 const key=[pose,expression,level,angle].join(':');if(cache.has(key))return cache.get(key);
 const data=breathe(await drawing(pose,expression),pose,level*(pose==='sleep'||pose==='lie'?5:3.5)/12,angle);
 const index=textures.length;
 textures.push(await sharp(data,{raw:{width:512,height:512,channels:4}}).resize(256).png().toBuffer());cache.set(key,index);return index;
}
const definitions=[
 {id:'idle-floor',pose:'stand',label:'Ruhig stehen · atmen und schauen',seconds:24,period:4,events:[[42,2,'reactions-floor/1'],[44,2,'reactions-floor/2'],[46,2,'reactions-floor/1'],[78,36,'look-left'],[145,2,'reactions-floor/1'],[147,2,'reactions-floor/2'],[149,2,'reactions-floor/1'],[174,36,'look-right'],[246,5,'food-floor/9']]},
 {id:'idle-seat',pose:'sit',label:'Sitzen · atmen und schauen',seconds:27,period:4.5,events:[[47,3,'reactions-seat/11'],[104,36,'look-left'],[183,3,'reactions-seat/11'],[248,38,'look-right']]},
 {id:'idle-lie',pose:'lie',label:'Wach liegen · atmen',seconds:20,period:5,events:[]},
 {id:'idle-sleep',pose:'sleep',label:'Schlafen · ruhig atmen',seconds:30,period:6,events:[]}
];
const firstPage=atlas.pages.length;
for(const def of definitions){
 const first=atlas.frames.length,count=def.seconds*12,support=def.pose==='stand'?'floor':'seat';
 atlas.sequences.push({id:def.id,label:def.label,first,count,ambient:true});
 for(let offset=0;offset<count;offset++){
  const event=def.events.find(([start,n])=>offset>=start&&offset<start+n),expression=event?.[2]??'';
  const angle=expression.startsWith('look')?Math.round((expression==='look-left'?-4:4)*smooth((offset-event[0])/6)*smooth((event[0]+event[1]-offset)/6)*2)/2:0;
  const level=Math.round((1-Math.cos(offset/(def.period*12)*2*Math.PI))*6);
  const tile=await texture(def.pose,expression,level,angle),index=atlas.frames.length;
  atlas.frames.push({index,page:firstPage+Math.floor(tile/64),column:tile%8,row:Math.floor(tile%64/8),time:index/12,clip:def.id,label:def.label,
   x:support==='floor'?.305:.41,y:support==='floor'?.635:.497,width:(support==='floor'?104:68)/1280,lift:0,support,
   source:'base/'+def.pose,expression,breathLevel:level});
 }
}
for(let page=0;page<Math.ceil(textures.length/64);page++){
 const file=`kurt-a-${firstPage+page}.png`;atlas.pages.push(file);
 await sharp({create:{width:2048,height:2048,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(textures.slice(page*64,(page+1)*64).map((input,i)=>({input,left:i%8*256,top:Math.floor(i/8)*256}))).png().toFile(out+file);
}
atlas.version='kurt-a-refined-09';
await writeFile(out+'manifest.json',JSON.stringify(atlas,null,2)+'\n');
const cards=[];
for(const [row,def]of definitions.entries())for(const [col,level]of [0,12].entries()){
 const data=breathe(await drawing(def.pose,''),def.pose,level*(row>=2?5:3.5)/12);
 cards.push({input:await sharp(data,{raw:{width:512,height:512,channels:4}}).flop().resize(256).png().toBuffer(),left:col*256,top:row*256});
}
await sharp({create:{width:512,height:1024,channels:4,background:'#e4eef6'}}).composite(cards).png().toFile(dir+'reviews/breath-extremes.png');
await writeFile(dir+'reviews/assets.json',JSON.stringify({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length,uniqueIdleTextures:textures.length,loops:definitions},null,2)+'\n');
console.log({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length,uniqueIdleTextures:textures.length});
