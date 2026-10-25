// SPDX-License-Identifier: AGPL-3.0-only
import {test} from 'node:test';
import assert from 'node:assert/strict';

// Exercise the real component's async image swap without a browser clock.
const decoded = [];
globalThis.Image = class {
  decode() { return new Promise((resolve,reject) => decoded.push({image:this,resolve,reject})); }
};
globalThis.CustomEvent ??= class extends Event { constructor(type,options){super(type);this.detail=options.detail;} };
globalThis.HTMLElement = class {
  attributes = new Map();
  events = [];
  attachShadow() {
    const element = {setAttribute(){}};
    return this.shadowRoot = {querySelector:()=>element};
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name,value) { this.attributes.set(name,String(value));this.attributeChangedCallback(); }
  dispatchEvent(event) { this.events.push(event); }
};
globalThis.customElements = {get:()=>true};
const {KurtCompanion} = await import('../runtime/web/kurt-element.mjs');
function fixture() {
  decoded.length=0;
  const element=new KurtCompanion();
  element.abort=new AbortController();
  element.assetBase=new URL('https://example.invalid/kurt/');
  element.atlas={costumes:{oma:{label:'Oma',pages:['costumes/oma/0.webp','costumes/oma/1.webp']}}};
  element.pages=element.basePages=[{base:0},{base:1}];
  element.costumeCache=new Map();
  element.motion={elapsed:3.25,frame:39};
  element.draw=()=>{element.draws=(element.draws||0)+1;};
  return element;
}
test('costume swaps atomically after decoding and preserves the current motion',async()=>{
  const element=fixture(),original=element.pages,motion=element.motion;
  element.attributes.set('costume','oma');
  const pending=element.applyCostume();
  assert.equal(decoded.length,2);
  decoded[0].resolve();await Promise.resolve();
  assert.equal(element.pages,original,'one decoded page must not partially change the outfit');
  decoded[1].resolve();await pending;
  assert.equal(element.activeCostume,'oma');
  assert.equal(element.motion,motion);
  assert.deepEqual(motion,{elapsed:3.25,frame:39});
  assert.equal(element.pages[0],decoded[0].image);
  assert.equal(element.events.at(-1).type,'kurt-costume-change');
  element.costume='';
  assert.equal(element.pages,original);
  element.costume='oma';
  assert.equal(element.pages[0],decoded[0].image,'decoded costumes are reused');
  assert.equal(decoded.length,2);
});
test('a delayed costume load cannot override a newer selection',async()=>{
  const element=fixture(),original=element.pages;
  element.attributes.set('costume','oma');const pending=element.applyCostume();
  element.costume='';
  for(const page of decoded)page.resolve();await pending;
  assert.equal(element.pages,original);
  assert.equal(element.activeCostume,'');
});
test('missing pages and unknown costumes keep the last complete appearance',async()=>{
  const element=fixture(),original=element.pages;
  element.attributes.set('costume','oma');const pending=element.applyCostume();
  decoded[0].reject(new Error('missing costume page'));decoded[1].resolve();await pending;
  assert.equal(element.pages,original);
  assert.equal(element.events.at(-1).type,'kurt-error');
  element.attributes.set('costume','missing');await element.applyCostume();
  assert.equal(element.pages,original);
  assert.match(element.events.at(-1).detail.message,/Unknown Kurt costume/);
});
test('disconnecting during a load prevents a late image swap',async()=>{
  const element=fixture(),original=element.pages;
  element.attributes.set('costume','oma');const pending=element.applyCostume();
  element.abort.abort();for(const page of decoded)page.resolve();await pending;
  assert.equal(element.pages,original);assert.equal(element.events.length,0);
});

test('magnified gaze stays inside the glass while the head, rims and body remain fixed',async()=>{
  const {default:sharp}=await import('sharp');
  const {readFile}=await import('node:fs/promises');
  const {catalog,lensMatrix}=await import('../source/costumes/dress.mjs');
  const root=new URL('../',import.meta.url);
  const rig=JSON.parse(await readFile(new URL('source/costumes/rig.json',root)));
  const directory=stage=>new URL('.build/costumes/256/oma/'+stage+'/',root);
  const atlases=await Promise.all(['animation-v10','animation-v12'].map(async stage=>JSON.parse(await readFile(new URL('manifest.json',directory(stage))))));
  for(const [id,pose]of [['idle-floor','stand'],['idle-seat','sit'],['idle-lie','lie']]){
    const matrix=lensMatrix(rig.drawings['base/'+pose]).join(' ');
    // Lanczos3 reduction from 512 to 256 has a six-source-pixel footprint;
    // include that and the antialiased edge around the stationary glass.
    const paths=catalog.oma.optics.front.map(lens=>`<path d="${lens.outline}"/>`).join('');
    const mask=await sharp(Buffer.from(`<svg width="512" height="512"><g transform="matrix(${matrix})" fill="white" stroke="white" stroke-width="14">${paths}</g></svg>`)).resize(256).ensureAlpha().raw().toBuffer();
    let moving=0;
    for(const offset of [0,20,35]){
      const buffers=await Promise.all(atlases.map(async(atlas,i)=>{
        const frame=atlas.frames[atlas.sequences.find(s=>s.id===id).first+offset];
        return sharp(new URL(atlas.pages[frame.page],directory(i?'animation-v12':'animation-v10')).pathname).extract({left:frame.column*256,top:frame.row*256,width:256,height:256}).ensureAlpha().raw().toBuffer();
      }));
      for(let i=0;i<buffers[0].length;i+=4){
        if(buffers[0].subarray(i,i+4).equals(buffers[1].subarray(i,i+4)))continue;
        assert.ok(mask[i+3]>0,`${id} frame ${offset}: gaze escaped the glass at ${i/4%256},${Math.floor(i/4/256)}`);
        moving++;
      }
    }
    assert.ok(moving>100,id+' pupils must still move behind the strong lenses');
  }
});
