// SPDX-License-Identifier: AGPL-3.0-only
// Register the generated drawings to the approved model's size and floor.
import sharp from 'sharp';
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
const dir=new URL('.',import.meta.url).pathname, previous=new URL('../animation-v9/ios-assets/',import.meta.url).pathname;
const out=dir+'ios-assets/'; await mkdir(out,{recursive:true});await mkdir(dir+'cels',{recursive:true});await mkdir(dir+'reviews',{recursive:true});
const atlas=JSON.parse(await readFile(previous+'manifest.json','utf8'));
for(const file of [...atlas.pages,'room-map.json','poop.png','vomit.png','poop-drop.png','vomit-drop.png'])await copyFile(previous+file,out+file);
const tips=[[205,81],[617,59],[1074,48],[1519,49],[195,483],[630,484],[1054,508],[1528,545]];
const textures=[],grips=[],cards=[];
for(let i=0;i<8;i++){
 const left=Math.round(i%4*1774/4),top=Math.round(Math.floor(i/4)*887/2);
 const right=Math.round((i%4+1)*1774/4),bottom=Math.round((Math.floor(i/4)+1)*887/2);
 const {data,info}=await sharp(dir+'sources/carry.png').extract({left,top,width:right-left,height:bottom-top}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let x0=info.width,y0=info.height,x1=0,y1=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>12){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
 const scale=1.08,w=Math.round((x1-x0+1)*scale),h=Math.round((y1-y0+1)*scale),dx=Math.round(258-w/2),dy=477-h;
 const cel=await sharp(data,{raw:info}).extract({left:x0,top:y0,width:x1-x0+1,height:y1-y0+1}).resize(w,h).png().toBuffer();
 const registered=await sharp({create:{width:512,height:512,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:cel,left:dx,top:dy}]).png().toBuffer();
 await writeFile(dir+`cels/carry-${i}.png`,registered);
 textures.push(await sharp(registered).resize(256).png().toBuffer());
 grips.push({x:(dx+(tips[i][0]-left-x0)*scale)/512,y:(dy+(tips[i][1]-top-y0)*scale)/512});
 cards.push({input:await sharp(registered).flop().resize(256).png().toBuffer(),left:i%4*256,top:Math.floor(i/4)*256});
}
const page=atlas.pages.length,file=`kurt-a-${page}.png`;atlas.pages.push(file);
await sharp({create:{width:2048,height:2048,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite(textures.map((input,i)=>({input,left:i*256,top:0}))).png().toFile(out+file);
const hold=(cel,count)=>Array(count).fill(cel);
const definitions=[
 {id:'carry-lift',label:'Hochheben',cels:[0,0,1,1,2,2]},
 {id:'carry-hang',label:'Am Finger hängen',ambient:true,cels:[...hold(2,8),...hold(3,3),...hold(2,4),...hold(4,3),...hold(2,8),...hold(5,2),...hold(2,8)]},
 {id:'carry-release',label:'Sanft absetzen',cels:[2,2,1,6,6,7,7,0]}
];
for(const def of definitions){
 const first=atlas.frames.length;
 atlas.sequences.push({id:def.id,label:def.label,first,count:def.cels.length,ambient:def.ambient});
 for(const cel of def.cels){const index=atlas.frames.length;atlas.frames.push({index,page,column:cel,row:0,time:index/12,clip:def.id,label:def.label,x:.305,y:.635,width:.081355,lift:0,support:'air',grip:grips[cel]});}
}
atlas.version='kurt-a-refined-10';
await writeFile(out+'manifest.json',JSON.stringify(atlas,null,2)+'\n');
await sharp({create:{width:1024,height:512,channels:4,background:'#e4eef6'}}).composite(cards).png().toFile(dir+'reviews/carry-contact-sheet.png');
await writeFile(dir+'reviews/assets.json',JSON.stringify({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length,grips,definitions},null,2)+'\n');
console.log({version:atlas.version,frames:atlas.frames.length,pages:atlas.pages.length});
