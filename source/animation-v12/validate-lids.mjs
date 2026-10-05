// SPDX-License-Identifier: AGPL-3.0-only
// Independent, hand-located lid landmarks checked in the shipped 256px cels.
import sharp from 'sharp';
import {cell, atlasDirectory} from '../shared/build-profile.mjs';
import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url).pathname,dirs=['animation-v10','animation-v12'];
const atlases=await Promise.all(dirs.map(d=>readFile(atlasDirectory(d)+'manifest.json','utf8').then(JSON.parse)));
const probes={
 'idle-floor':[[109,218],[118,200],[134,210],[117,238],[175,227],[184,219],[205,225],[213,242],[208,259],[190,265]],
 'idle-seat':[[129,213],[139,194],[155,210],[137,232],[195,227],[205,216],[228,227],[236,242],[227,260],[211,266]],
 'idle-lie':[[100,349],[113,330],[131,342],[125,364],[110,371],[178,353],[190,344],[217,358],[224,373],[210,397],[193,398]]
};
const checks=[];
for(const[id,points]of Object.entries(probes))for(const offset of [0,20,35]){
 const buffers=await Promise.all(atlases.map(async(a,i)=>{
  const f=a.frames[a.sequences.find(s=>s.id===id).first+offset];
  return sharp(atlasDirectory(dirs[i])+a.pages[f.page]).extract({left:f.column*cell,top:f.row*cell,width:cell,height:cell}).ensureAlpha().raw().toBuffer();
 }));
 for(const[x,y]of points){
  const at=(Math.floor(y*cell/512)*cell+Math.floor(x*cell/512))*4;
  const delta=Math.max(...[0,1,2,3].map(c=>Math.abs(buffers[0][at+c]-buffers[1][at+c])));
  checks.push({id,offset,x,y,delta});
 }
}
const changed=checks.filter(c=>c.delta!==0);
await writeFile(root+'animation-v12/reviews/lid-pixel-check.json',JSON.stringify({passed:!changed.length,tested:checks.length,changed,checks},null,2)+'\n');
if(changed.length)throw Error('Exported eyelid pixels changed: '+JSON.stringify(changed));
console.log(`${checks.length} exported eyelid samples identical to the approved stationary artwork.`);
