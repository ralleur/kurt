// SPDX-License-Identifier: AGPL-3.0-only
// Rebind the validated contact clock to the exact idle selected by the owner.
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
import {pose} from './motion.mjs';
import {dress} from '../costumes/dress.mjs';
import {costume, atlasDirectory} from '../shared/build-profile.mjs';
import {render} from './deform.mjs';
const dir=new URL('.',import.meta.url).pathname;
const texture=await sharp(await dress('base/stand', await sharp(dir+'cels/base/stand.png').png().toBuffer())).ensureAlpha().raw().toBuffer();
const walkDirectory=costume?atlasDirectory('walk'):dir+'cels/walk/';
await mkdir(walkDirectory,{recursive:true});await mkdir(dir+'reviews',{recursive:true});
let minArea=Infinity,folds=0;
for(let i=0;i<85;i++){
 const result=render(texture,pose(i/12));
 minArea=Math.min(minArea,result.minArea);folds+=result.folds;
 await sharp(result.data,{raw:{width:512,height:512,channels:4}}).png().toFile(walkDirectory+`${i}.png`);
}
if (!costume) await writeFile(dir+'reviews/walk-geometry.json',JSON.stringify({frames:85,minArea,folds,master:'../animation-v7/cels/settle/1.png'},null,2)+'\n');
if(folds)throw Error(`New idle walking cage folds: ${folds}`);
console.log({frames:85,minArea,folds});
