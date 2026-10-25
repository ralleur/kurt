// SPDX-License-Identifier: AGPL-3.0-only
// Attach once to each registered cel, BEFORE the existing deformation rig.
import sharp from 'sharp';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {atlasDirectory, costume} from '../shared/build-profile.mjs';
const directory = new URL('./', import.meta.url);
export const catalog = JSON.parse(readFileSync(new URL('catalog.json', directory)));
const rig = JSON.parse(readFileSync(new URL('rig.json', directory)));
if (costume && !Object.hasOwn(catalog, costume)) throw Error(`Unknown Kurt costume: ${costume}`);
const cache = new Map();
async function artworkPart(part) {
  if (typeof part === 'string') return readFileSync(new URL(part, directory), 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const [left,top,width,height] = part.crop, [x,y,w,h] = part.place;
  const pixels = await sharp(new URL(part.file, directory).pathname).extract({left,top,width,height}).png().toBuffer();
  return `<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none" href="data:image/png;base64,${pixels.toString('base64')}"/>`;
}
const parts = costume ? Object.fromEntries(await Promise.all(Object.entries(catalog[costume].parts).map(async ([key, part]) => [key, await artworkPart(part)]))) : {};
const svg = content => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${content}</svg>`);
export function headMatrix(fit) {
  if (fit.headTransform) return fit.headTransform;
  const [x1,y1,x2,y2] = fit.eyes.map(v => v * 512 / rig.coordinateSize);
  const mirror = fit.mirror ? -1 : 1;
  const dx = (x2-x1)*mirror, dy = y2-y1, denominator = 71*71+24*24;
  const a = (dx*71+dy*24)/denominator, b = mirror*(dy*71-dx*24)/denominator;
  return [a*mirror,b*mirror,-b,a,x1-a*120*mirror+b*220,y1-b*120*mirror-a*220];
}
const applyMatrix = (m,x,y) => [m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export function crownMatrix(fit) {
  if (!fit.crown) return headMatrix(fit);
  const [u1,v1,u2,v2]=rig.crownReference,[x1,y1,x2,y2]=fit.crown.map(v=>v*512/rig.coordinateSize);
  const mirror=fit.mirror?-1:1,ux=(u2-u1)*mirror,uy=v2-v1,dx=x2-x1,dy=y2-y1,den=ux*ux+uy*uy;
  const a=(dx*ux+dy*uy)/den,b=(dy*ux-dx*uy)/den;
  return [a*mirror,b*mirror,-b,a,x1-a*mirror*u1+b*v1,y1-b*mirror*u1-a*v1];
}
export function lensMatrix(fit) {
  const m = [...(fit.eyewearTransform ?? headMatrix(fit))];
  if (fit.view === 'profile' && fit.profileEye) {
    m[4] += (fit.profileEye[0]-fit.eyes[0])*512/rig.coordinateSize;
    m[5] += (fit.profileEye[1]-fit.eyes[1])*512/rig.coordinateSize;
  }
  return m;
}
// Resample the actual expression behind each lens. The rim and everything
// outside the glass stay fixed; closed lids and moving pupils share the lens.
export async function refractEyes(input,fit,optics=costume && catalog[costume].optics) {
  if (!optics || fit.view === 'back') return input;
  const original=await sharp(input).ensureAlpha().raw().toBuffer(),output=Buffer.from(original);
  const m=lensMatrix(fit),[a,b,c,d,e,f]=m,det=a*d-b*c;
  if (Math.abs(det)<1e-8) throw Error('Degenerate glasses registration');
  const lenses=fit.view==='profile'?optics.profile:optics.front;
  for(const {center:[cx,cy],outline} of lenses) {
    const mask=await sharp(svg(`<g transform="matrix(${m.join(' ')})"><path fill="white" d="${outline}"/></g>`)).ensureAlpha().raw().toBuffer();
    for(let y=0;y<512;y++)for(let x=0;x<512;x++){
      const i=(y*512+x)*4,weight=mask[i+3]/255;
      if(!weight || !original[i+3])continue;
      const u=(d*(x-e)-c*(y-f))/det,v=(-b*(x-e)+a*(y-f))/det;
      const [sx,sy]=applyMatrix(m,cx+(u-cx)/optics.magnification,cy+(v-cy)/optics.magnification);
      const xx=Math.floor(sx),yy=Math.floor(sy),fx=sx-xx,fy=sy-yy;
      const samples=[[xx,yy,(1-fx)*(1-fy)],[xx+1,yy,fx*(1-fy)],[xx,yy+1,(1-fx)*fy],[xx+1,yy+1,fx*fy]];
      for(let channel=0;channel<3;channel++){
        const value=samples.reduce((sum,[px,py,w])=>sum+original[(Math.max(0,Math.min(511,py))*512+Math.max(0,Math.min(511,px)))*4+channel]*w,0);
        output[i+channel]=Math.round(original[i+channel]*(1-weight)+value*weight);
      }
    }
  }
  return sharp(output,{raw:{width:512,height:512,channels:4}}).png().toBuffer();
}
// The ring tail is behind the torso in side views. Follow the ink boundary
// between the two instead of restoring an oval of bare body around the tail.
function protectTail(mask, raw, fit) {
  if (!fit.tail || fit.view === 'back') return;
  const [cx,cy,rx,ry] = fit.tail.map(v => v*512/rig.coordinateSize);
  const left=Math.max(0,Math.floor(cx-rx-12)),right=Math.min(511,Math.ceil(cx+rx+12));
  const top=Math.max(0,Math.floor(cy-ry-12)),bottom=Math.min(511,Math.ceil(cy+ry+12));
  const side = fit.tail[1] > fit.body[1] + (fit.body[3]-fit.body[1])*.6;
  const ink=(x,y)=>{const i=(y*512+x)*4;return raw[i+3]>150&&raw[i]<130&&raw[i+1]<100&&raw[i+2]<85;};
  if (side) {
    for(let y=top;y<=bottom;y++) {
      let edge=-1;
      for(let x=left;x<=right;x++) if(ink(x,y)){edge=x;break;}
      if(edge<0)continue;
      for(let x=Math.max(left,edge-1);x<=right;x++)mask[(y*512+x)*4+3]=255;
    }
  } else {
    for(let x=left;x<=right;x++) {
      let edge=-1;
      for(let y=top;y<=bottom;y++)if(ink(x,y))edge=y;
      if(edge<0)continue;
      for(let y=top;y<=Math.min(bottom,edge+1);y++)mask[(y*512+x)*4+3]=255;
    }
  }
}
export async function dress(source, input) {
  if (!costume) return input;
  const key = source + ':' + createHash('sha256').update(input).digest('hex');
  if (cache.has(key)) return cache.get(key);
  const fit = rig.drawings[source];
  if (!fit) throw Error(`Missing costume registration: ${source}`);
  const matrix = headMatrix(fit).join(' ');
  const [left,top,right,bottom] = fit.body.map(v => v * 512 / rig.coordinateSize);
  const bodyTransform = `translate(${left} ${top}) scale(${(right-left)/355} ${(bottom-top)/187}) translate(-115 -252)`;
  const raw = await sharp(input).ensureAlpha().raw().toBuffer();
  // Preserve the original muzzle, ears, eyes and paws in front of the cloth.
  const headShape = fit.view === 'back'
    ? '<ellipse cx="180" cy="180" rx="109" ry="76"/>'
    : fit.view === 'profile' && fit.bodyView === 'back'
      ? '<path d="M85 182 Q110 127 196 148 Q281 159 296 223 Q292 272 235 300 Q200 309 185 332 Q145 348 90 320 Q40 292 62 239 Z"/>'
      : '<path d="M85 182 Q110 127 196 148 Q281 159 296 223 Q308 291 244 327 Q168 368 90 320 Q40 292 62 239 Z"/>';
  const protectedParts = [fit.view === 'back' ? fit.tail : null, ...(fit.paws ?? [])].filter(Boolean).map(([x,y,rx,ry]) =>
    `<ellipse fill="white" cx="${x*512/rig.coordinateSize}" cy="${y*512/rig.coordinateSize}" rx="${rx*512/rig.coordinateSize}" ry="${ry*512/rig.coordinateSize}"/>`).join('');
  const foregroundHead = fit.headContour
    ? `<g fill="white" transform="scale(${512/rig.coordinateSize})"><path d="${fit.headContour}"/></g>`
    : `<g fill="white" transform="matrix(${matrix})">${headShape}</g>`;
  const headMask = await sharp(svg(`${foregroundHead}${protectedParts}<g fill="white" transform="scale(${512/rig.coordinateSize})">${(fit.pawContours ?? []).map(path => `<path d="${path}"/>`).join('')}</g>`)).ensureAlpha().raw().toBuffer();
  protectTail(headMask, raw, fit);
  const back = (fit.bodyView || fit.view) === 'back';
  // The collar is clipped to the garment, so a lowered head cannot leave a
  // detached triangle on a paw. Sleeve hems are drawn, not a straight crop.
  const garment = sharp(svg(`<defs><clipPath id="torso"><path d="M0 230H512V512H0Z"/></clipPath></defs><g transform="${bodyTransform}" clip-path="url(#torso)">${back ? parts.bodyBack : parts.body}</g>`));
  const details = [
    ...(!back ? [{input: svg(`<g transform="matrix(${matrix})">${parts.neck}</g>`), blend: 'atop'}] : []),
    ...(fit.cuffs ? [{input: svg(`<g transform="scale(${512/rig.coordinateSize})" fill="none" stroke="#566b73" stroke-width="3.5" stroke-linecap="round">${fit.cuffs.map(path => `<path d="${path}"/>`).join('')}</g>`), blend: 'atop'}] : [])
  ];
  const cloth = await garment.composite(details).ensureAlpha().raw().toBuffer();
  for (let i=0;i<raw.length;i+=4) {
    const ink = raw[i]<120 && raw[i+1]<95 && raw[i+2]<85;
    cloth[i+3] = Math.round(cloth[i+3] * raw[i+3]/255 * (1-headMask[i+3]/255) * (ink ? 0 : 1));
  }
  const head = fit.view === 'back' ? parts.headBack : fit.view==='profile' ? (parts.headProfile ?? parts.head) : parts.head;
  const wigMatrix=crownMatrix(fit).join(' ');
  // Fur from the actual near ear occludes the wig, rather than a curl being
  // pasted over its root. Restrict restoration to the ear's dark painted fur.
  const earShape=fit.earContours
    ? `<g transform="scale(${512/rig.coordinateSize})">${fit.earContours.map(path=>`<path d="${path}"/>`).join('')}</g>`
    : `<g transform="matrix(${matrix})"><path d="M247 185 Q281 166 316 207 L333 252 L302 292 L246 292Z"/></g>`;
  const earRegion=await sharp(svg(`<g fill="white">${earShape}</g>`)).ensureAlpha().raw().toBuffer();
  const ear=Buffer.from(raw);
  for(let i=0;i<raw.length;i+=4)ear[i+3]=Math.round(raw[i+3]*earRegion[i+3]/255*(raw[i]<170&&raw[i+1]<125&&raw[i+2]<100?1:0));
  let eyes = fit.view === 'back' ? '' : parts.eyes;
  if (fit.view === 'profile') eyes = parts.eyesProfile;
  const lensesMatrix = lensMatrix(fit).join(' ');
  const result = await sharp(await refractEyes(input,fit)).composite([
    {input: cloth, raw: {width:512,height:512,channels:4}},
    {input: svg(`<g transform="matrix(${wigMatrix})">${head}</g>`)},
    {input: ear,raw:{width:512,height:512,channels:4}},
    {input: svg(`<g transform="matrix(${lensesMatrix})">${eyes}</g>`)}
  ]).png().toBuffer();
  cache.set(key, result);
  return result;
}
export async function readDrawing(source, path) {
  // Walk garments have already followed the same mesh as the original paws.
  if (costume && source.startsWith('walk/')) return readFile(atlasDirectory('walk') + source.split('/')[1] + '.png');
  return dress(source, await readFile(path));
}
