// SPDX-License-Identifier: AGPL-3.0-only
// Runtime-style texture deformation of one immutable drawing. No generated
// inbetweens, recoloring, replacement face or optical crossfades.
import {feet} from './motion.mjs';
const W=512, STEP=8;
const U=(x,y)=>{const r=x*x+y*y;return r<1e-15?0:r*Math.log(r)};
function solve(matrix,values){
 const n=values.length,a=matrix.map((row,i)=>[...row,values[i]]);
 for(let j=0;j<n;j++){
  let pivot=j;for(let i=j+1;i<n;i++)if(Math.abs(a[i][j])>Math.abs(a[pivot][j]))pivot=i;
  [a[pivot],a[j]]=[a[j],a[pivot]];const d=a[j][j];if(Math.abs(d)<1e-12)throw Error('Singular control cage');
  for(let k=j;k<=n;k++)a[j][k]/=d;
  for(let i=0;i<n;i++){if(i===j)continue;const f=a[i][j];for(let k=j;k<=n;k++)a[i][k]-=f*a[j][k];}
 }
 return a.map(row=>row[n]);
}
function ik(foot,dx,dy,bodyY,bodyX=0){
 const h=[foot.hip[0]+bodyX,foot.hip[1]+bodyY],end=[foot.x+dx,foot.y+dy];
 const a=Math.hypot(foot.knee[0]-foot.hip[0],foot.knee[1]-foot.hip[1]);
 const b=Math.hypot(foot.x-foot.knee[0],foot.y-foot.knee[1]);
 const vx=end[0]-h[0],vy=end[1]-h[1],rawD=Math.hypot(vx,vy),d=Math.min(a+b-.001,Math.max(Math.abs(a-b)+.001,rawD));
 const along=(a*a-b*b+d*d)/(2*d),side=Math.sqrt(Math.max(0,a*a-along*along));
 const ux=vx/rawD,uy=vy/rawD;
 const sign=(foot.knee[0]-foot.hip[0])*((foot.y-foot.hip[1]))-(foot.knee[1]-foot.hip[1])*(foot.x-foot.hip[0])>=0?1:-1;
 return [h[0]+along*ux+sign*side*uy,h[1]+along*uy-sign*side*ux];
}
function controlPoints(pose){
 const controls=[],add=(x,y,dx=pose.bodyX??0,dy=pose.bodyY)=>controls.push({x,y,dx,dy});
 // Torso and head landmarks stay tied to the original drawing.
 for(const [x,y]of [[0,0],[256,0],[512,0],[0,256],[512,256],[0,512],[512,512],
 [70,190],[150,150],[245,185],[52,265],[160,265],[300,245],[86,345],[188,349],[292,323],
 [335,277],[401,277],[456,354],[338,374],[175,387],[315,425],[348,448],
 [185,416],[305,450],[371,417],[472,406]])add(x,y);
 for(const foot of pose.feet.filter(f=>f.visible)){
  const [kx,ky]=ik(foot,foot.dx,foot.dy,pose.bodyY,pose.bodyX??0);
  add(...foot.hip);add(foot.knee[0],foot.knee[1],kx-foot.knee[0],ky-foot.knee[1]);
  const [left,top,right,bottom]=foot.paw;
  for(const [x,y]of [[left,top],[right,top],[left,bottom],[right,bottom],[foot.x,foot.y],[foot.x,top]])add(x,y,foot.dx,foot.dy);
 }
 return controls;
}
function interpolator(controls){
 const ps=controls.map(p=>({...p,x:p.x/W,y:p.y/W})),n=ps.length;
 const a=ps.map(p=>[...ps.map(q=>U(p.x-q.x,p.y-q.y)),1,p.x,p.y]);
 a.push([...ps.map(()=>1),0,0,0],[...ps.map(p=>p.x),0,0,0],[...ps.map(p=>p.y),0,0,0]);
 const wx=solve(a,[...ps.map(p=>p.dx),0,0,0]),wy=solve(a,[...ps.map(p=>p.dy),0,0,0]);
 return(x,y)=>{const xx=x/W,yy=y/W;let dx=wx[n]+wx[n+1]*xx+wx[n+2]*yy,dy=wy[n]+wy[n+1]*xx+wy[n+2]*yy;for(let i=0;i<n;i++){const u=U(xx-ps[i].x,yy-ps[i].y);dx+=wx[i]*u;dy+=wy[i]*u}return{x:x+dx,y:y+dy};};
}
export function geometry(pose){
 const controls=controlPoints(pose),warp=interpolator(controls),vertices=[];
 const count=W/STEP+1;
 for(let y=0;y<=W;y+=STEP)for(let x=0;x<=W;x+=STEP){
  // The complete face and cap retain the reference drawing rigidly. No
  // interpolation is allowed to alter eyes, muzzle or head proportions.
  const paw=pose.feet.find(f=>f.visible&&x>=f.paw[0]&&x<=f.paw[2]&&y>=f.paw[1]&&y<=f.paw[3]);
  const p=paw?{x:x+paw.dx,y:y+paw.dy}:x<321&&y<365?{x:x+(pose.bodyX??0),y:y+pose.bodyY}:warp(x,y);
  vertices.push({sx:x,sy:y,x:p.x,y:p.y});
 }
 const triangles=[];
 for(let y=0;y<count-1;y++)for(let x=0;x<count-1;x++){const a=y*count+x,b=a+1,c=a+count,d=c+1;triangles.push([a,b,c],[b,d,c]);}
 return{vertices,triangles,controls};
}
export function render(texture,pose){
 const mesh=geometry(pose),out=Buffer.alloc(W*W*4);let minArea=Infinity,folds=0;
 for(const ids of mesh.triangles){const [a,b,c]=ids.map(i=>mesh.vertices[i]);
  const d=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);minArea=Math.min(minArea,d/(STEP*STEP));if(d<=0){folds++;continue;}
  const left=Math.max(0,Math.floor(Math.min(a.x,b.x,c.x))),right=Math.min(W-1,Math.ceil(Math.max(a.x,b.x,c.x))),top=Math.max(0,Math.floor(Math.min(a.y,b.y,c.y))),bottom=Math.min(W-1,Math.ceil(Math.max(a.y,b.y,c.y)));
  for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
   const xx=x+.5-a.x,yy=y+.5-a.y;
   const v=(xx*(c.y-a.y)-yy*(c.x-a.x))/d,w=((b.x-a.x)*yy-(b.y-a.y)*xx)/d,u=1-v-w;
   if(v<-.000001||w<-.000001||u<-.000001)continue;
   const sx=Math.max(0,Math.min(W-1,u*a.sx+v*b.sx+w*c.sx-.5)),sy=Math.max(0,Math.min(W-1,u*a.sy+v*b.sy+w*c.sy-.5));
   const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
   const samples=[[x0,y0,(1-fx)*(1-fy)],[Math.min(W-1,x0+1),y0,fx*(1-fy)],[x0,Math.min(W-1,y0+1),(1-fx)*fy],[Math.min(W-1,x0+1),Math.min(W-1,y0+1),fx*fy]];
   let alpha=0,r=0,g=0,bl=0;for(const [px,py,weight]of samples){const at=(py*W+px)*4,aa=texture[at+3]*weight;alpha+=aa;r+=texture[at]*aa;g+=texture[at+1]*aa;bl+=texture[at+2]*aa;}
   const o=(y*W+x)*4;if(alpha>0){out[o]=Math.round(r/alpha);out[o+1]=Math.round(g/alpha);out[o+2]=Math.round(bl/alpha);out[o+3]=Math.round(alpha)}
  }
 }
 return{data:out,mesh,minArea,folds};
}
