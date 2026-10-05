// SPDX-License-Identifier: AGPL-3.0-only
// A single distance function drives both root translation and planted feet.
export const FPS=12, STRIDE=40, DUTY=.75, SWING=1-DUTY;
export const feet=[
 {id:'near-front',x:236,y:477,phase:.75,hip:[242,397],knee:[245,440],visible:true,paw:[209,456,269,485]},
 {id:'far-front',x:149,y:466,phase:.25,hip:[145,390],knee:[149,431],visible:true,paw:[120,447,181,474]},
 {id:'near-hind',x:433,y:474,phase:0,hip:[419,396],knee:[435,432],visible:true,paw:[403,450,465,482]},
 // The far hind leg is mostly behind the barrel and near leg. Its phase is
 // tracked without a second overlapping rigid patch inside the same mesh.
 {id:'far-hind',x:379,y:442,phase:.5,hip:[377,387],knee:[376,420],visible:false,paw:[357,430,402,448]}
];
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const ease=t=>{t=clamp(t);return t*t*(3-2*t)};
export function distance(t){
 if(t<=0)return 0;
 if(t<1)return STRIDE*(t*t*t-.5*t*t*t*t);
 if(t<5)return STRIDE*(.5+t-1);
 if(t<6){const u=t-5;return STRIDE*(4.5+u-u*u*u+.5*u*u*u*u)}
 return STRIDE*5;
}
export function velocity(t){if(t<=0||t>=6)return 0;return STRIDE*(t<1?ease(t):t<5?1:1-ease(t-5));}
const linearDistance=t=>STRIDE*t, linearVelocity=()=>STRIDE;
export function pose(t,{loop=false}={}){
 const travel=loop?linearDistance:distance, speed=loop?linearVelocity:velocity,rootX=-travel(t);
 const amp=loop?1:speed(t)/STRIDE;
 const bodyY=-1.15*amp*(1-Math.cos(t*Math.PI*4));
 const pins=feet.map(foot=>{
  if(!loop&&t<0)return{...foot,dx:0,dy:0,worldX:foot.x,worldY:foot.y,contact:true};
  const q=t+foot.phase,k=Math.floor(q+1e-9),phase=q-k;
  const touchdown=k-foot.phase,takeoff=touchdown+DUTY,nextTouchdown=touchdown+1;
  const contactX=at=>!loop&&at<=0?foot.x:foot.x-travel(at)-speed(at)*DUTY/2;
  let worldX=contactX(touchdown),dy=0,contact=phase<DUTY-1e-9;
  if(!contact){const v=clamp((t-takeoff)/SWING),end=contactX(nextTouchdown),span=Math.abs(end-worldX);worldX+=(end-worldX)*ease(v);dy=-10*Math.min(1,span/STRIDE)*Math.sin(v*Math.PI)**2;}
  // A settled, zero-length recovery keeps the paw on the ground.
  if(Math.abs(dy)<1e-8&&speed(t)===0&&Math.abs(contactX(nextTouchdown)-contactX(touchdown))<1e-8)contact=true;
  return{...foot,dx:worldX-rootX-foot.x,dy,worldX,worldY:foot.y+dy,contact,touchdown,takeoff,nextTouchdown};
 });
 return{time:t,rootX,bodyY,feet:pins,speed:speed(t)};
}
export const clips=[
 {id:'walk-loop',label:'Gangschleife · Original A',frames:Array.from({length:48},(_,i)=>pose(i/FPS,{loop:true}))},
 {id:'start-stop',label:'Angehen, gehen, bremsen und stehen',frames:Array.from({length:109},(_,i)=>pose((i-12)/FPS))},
];

export function jumpPose(frame){
 const flightStart=6,flightEnd=13;
 let rootX=0,rootY=0,bodyX=0,bodyY=0,progress=0,frontLift=0,hindLift=0;
 let airborne=false;
 if(frame<flightStart){const t=frame/(flightStart-1);bodyY=t<.72?6*ease(t/.72):6-10*ease((t-.72)/.28);bodyX=-3*Math.sin(t*Math.PI);}
 else if(frame<=flightEnd){progress=(frame-flightStart)/(flightEnd-flightStart);rootX=-125*progress;rootY=-115*4*progress*(1-progress);airborne=frame<flightEnd;bodyY=-2*Math.sin(progress*Math.PI);frontLift=-7*Math.sin(progress*Math.PI)**2;hindLift=-9*Math.sin(progress*Math.PI)**2;}
 else{rootX=-125;progress=1;const t=(frame-flightEnd)/9;bodyY=t<1?7*Math.sin(t*Math.PI)*Math.exp(-t*.9):0;}
 const ps=feet.map(foot=>{const front=foot.id.endsWith('front'),dy=front?frontLift:hindLift,dx=airborne?(front?-4:3)*Math.sin(progress*Math.PI):0;return{...foot,dx,dy,contact:!airborne,worldX:rootX+foot.x+dx,worldY:rootY+foot.y+dy};});
 return{time:frame/FPS,rootX,rootY,bodyX,bodyY,feet:ps,speed:airborne?100:0,progress};
}
clips.push({id:'jump',label:'Absprung, Flug und Landung',frames:Array.from({length:30},(_,i)=>jumpPose(i))});
