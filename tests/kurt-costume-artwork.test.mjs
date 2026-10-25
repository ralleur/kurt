// SPDX-License-Identifier: AGPL-3.0-only
import {test} from 'node:test';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {headMatrix,crownMatrix,refractEyes,catalog} from '../source/costumes/dress.mjs';
import {readFile} from 'node:fs/promises';

test('raised paws, paw pads and the side-view tail retain their original pixels',()=>{
  execFileSync(process.execPath,['--input-type=module','-e',`
    import assert from 'node:assert/strict';
    import sharp from 'sharp';
    import {readFile} from 'node:fs/promises';
    import {dress} from './source/costumes/dress.mjs';
    const probes=[
      ['body-actions/1',[[60,300],[170,300]]],
      ['body-actions/2',[[145,415],[212,440],[300,457]]],
      ['body-actions/10',[[110,350],[225,360]]],
      ['scoot/1',[[70,385],[337,428]]],
      ['turn/1',[[407,245],[430,258]]],
      ['carry/2',[[170,396],[230,411]]],
      ['carry/3',[[151,378],[201,393],[420,321]]],
      ['carry/5',[[164,409],[221,419]]]
    ];
    for(const [source,points]of probes){
      const path=source.startsWith('carry/')
        ? 'source/animation-v10/cels/carry-'+source.split('/')[1]+'.png'
        : 'source/animation-v8/cels/'+source+'.png';
      const input=await readFile(path);
      const original=await sharp(input).ensureAlpha().raw().toBuffer();
      const dressed=await sharp(await dress(source,input)).ensureAlpha().raw().toBuffer();
      for(const [x,y]of points){
        const index=(y*512+x)*4;
        assert.ok(original[index+3]>240,source+' probe must be an actual opaque drawing pixel');
        assert.deepEqual(dressed.subarray(index,index+4),original.subarray(index,index+4),source+' '+x+','+y);
      }
    }
  `],{cwd:new URL('../',import.meta.url),env:{...process.env,KURT_COSTUME:'oma'},stdio:'pipe'});
});

test('wig follows its skull anchors independently of the eyes, including mirrored poses',async()=>{
  const rig=JSON.parse(await readFile(new URL('../source/costumes/rig.json',import.meta.url)));
  for(const fit of Object.values(rig.drawings)){
    const [a,b,c,d,e,f]=crownMatrix(fit);
    for(let i=0;i<4;i+=2){
      const [x,y]=rig.crownReference.slice(i,i+2);
      assert.ok(Math.abs(a*x+c*y+e-fit.crown[i]*512/300)<1e-8);
      assert.ok(Math.abs(b*x+d*y+f-fit.crown[i+1]*512/300)<1e-8);
    }
  }
});

test('strong lenses enlarge actual eye pixels while preserving alpha and pixels outside the glass',async()=>{
  const input=Buffer.alloc(512*512*4,255);
  for(const [cx,cy]of [[120,220],[191,244]])for(let y=cy-8;y<=cy+8;y++)for(let x=cx-8;x<=cx+8;x++){
    if(Math.hypot(x-cx,y-cy)<=8){const i=(y*512+x)*4;input.fill(30,i,i+3);}
  }
  const fit={eyes:[120,220,191,244].map(v=>v*300/512)};
  const png=await sharp(input,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
  const output=await sharp(await refractEyes(png,fit,catalog.oma.optics)).raw().toBuffer();
  const span=(data,cx,cy)=>{let count=0;for(let x=cx-25;x<=cx+25;x++)if(data[(cy*512+x)*4]<100)count++;return count;};
  for(const [cx,cy]of [[120,220],[191,244]]){
    assert.ok(span(output,cx,cy)>=span(input,cx,cy)*1.4);
    assert.ok(span(output,cx,cy)<=span(input,cx,cy)*1.7);
  }
  for(let y=0;y<512;y++)for(let x=0;x<512;x++){
    const i=(y*512+x)*4;
    assert.equal(output[i+3],input[i+3]);
    if(x<90||x>233||y<186||y>278)assert.deepEqual(output.subarray(i,i+4),input.subarray(i,i+4));
  }
  assert.deepEqual(await refractEyes(png,{...fit,view:'back'},catalog.oma.optics),png);
});


test('head attachments hit both registered eye anchors in either direction',()=>{
  for(const fit of [
    {eyes:[70,129,112,143]},
    {eyes:[151,123,109,149],mirror:true},
    {eyes:[209,128,166,141],mirror:true}
  ]){
    const [a,b,c,d,e,f]=headMatrix(fit);
    for(const [i,[x,y]]of [[120,220],[191,244]].entries()){
      assert.ok(Math.abs(a*x+c*y+e-fit.eyes[i*2]*512/300)<1e-9);
      assert.ok(Math.abs(b*x+d*y+f-fit.eyes[i*2+1]*512/300)<1e-9);
    }
  }
});
