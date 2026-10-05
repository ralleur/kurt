// SPDX-License-Identifier: AGPL-3.0-only
// Compare the actual bundled cels, including the final atlas-size eye mask.
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
const dir=new URL('.',import.meta.url).pathname,previous=new URL('../animation-v10/',import.meta.url).pathname;
const atlases=await Promise.all([previous,dir].map(d=>readFile(d+'ios-assets/manifest.json','utf8').then(JSON.parse)));
const offsets={'idle-floor':[0,51,133,20],'idle-seat':[0,21,149,67],'idle-lie':[0,72,118,23]};
const cards=[],details=[];
for(const [row,[id,frames]]of Object.entries(offsets).entries())for(let col=0;col<5;col++){
 const a=atlases[col===0?0:1],f=a.frames[a.sequences.find(s=>s.id===id).first+(col===0?0:frames[col-1])];
 const cel=await sharp((col===0?previous:dir)+'ios-assets/'+a.pages[f.page]).extract({left:f.column*256,top:f.row*256,width:256,height:256}).flop().png().toBuffer();
 cards.push({input:cel,left:col*256,top:row*256});
 details.push({input:await sharp(cel).extract({left:136,top:row===2?163:row===1?90:94,width:78,height:52}).resize(312,208).png().toBuffer(),left:col*312,top:row*208});
}
await sharp({create:{width:1280,height:768,channels:4,background:'#e4eef6'}}).composite(cards).png().toFile(dir+'reviews/gaze-directions.png');
await sharp({create:{width:1560,height:624,channels:4,background:'#e4eef6'}}).composite(details).png().toFile(dir+'reviews/eye-detail.png');
