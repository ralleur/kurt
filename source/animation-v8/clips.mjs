// SPDX-License-Identifier: AGPL-3.0-only
// Exposure sheet: each entry is a complete drawing, with deliberate holds.
// No dissolves or optical inbetweens. Neutral poses are shared between clips.
import {pose,distance} from './motion.mjs';
export const FPS=12,GROUND=477,ANCHOR=258,BODY_WIDTH=427;
export const VERSION='kurt-a-refined-08';
const hold=(source,count,extra={})=>Array.from({length:count},()=>({source,...extra}));
const expose=(prefix,pairs)=>pairs.flatMap(([id,n])=>hold(typeof id==='string'?id:`${prefix}/${id}`,n));
const stand='base/stand',sit='base/sit',lie='base/lie',sleep='base/sleep';
const clips=[];
function add(id,label,support,frames,extra={}){clips.push({id,label,support,frames,...extra});}
const pet=(seated)=>expose(seated?'reactions-seat':'reactions-floor',seated?
 [[sit,3],[3,2],[4,5],[5,5],[4,5],[3,3],[sit,7]]:
 [[stand,3],[1,1],[3,3],[4,5],[3,4],[4,3],[5,4],[1,2],[stand,5]]);
add('pet-floor','Streicheln genießen · Boden','floor',pet(false),{loopStart:4,loopEnd:22});
add('pet-seat','Streicheln genießen · Sitzfläche','seat',pet(true),{loopStart:3,loopEnd:22});
for(const seated of [false,true]){
 const base=seated?sit:stand,prefix=seated?'food-seat':'food-floor';
 add(seated?'eat-seat':'eat-floor',seated?'Leckerli · Sitzfläche':'Leckerli · Boden',seated?'seat':'floor',
  expose(prefix,[[base,3],[1,3],[2,3],[3,3],[4,4],[5,2],[6,3],[7,3],[6,2],[7,2],[8,3],[9,3],...Array.from({length:8},()=>[[10,2],[11,2]]).flat(),[base,4]]),{swallow:30,tailStart:34});
}
add('wake-seat','Aufwachen und aufrichten','seat',expose('settle',[[sleep,2],[9,1],[lie,3],[7,2],[6,3],[5,3],[sit,4]]));
add('stand-floor','Anschauen · Blinzeln · Zuhören','floor',expose('reactions-floor',[[stand,6],[6,16],[stand,3],[7,18],[stand,5],[1,1],[2,2],[1,1],[stand,8]]));
const sitDown=expose('sit-inbetweens',[[stand,3],[0,1],[1,1],[2,1],[3,2],[4,2],[5,2],[6,2],[7,2],[sit,4]]);
add('sit-seat','Hinsetzen','seat',sitDown);
add('rise-seat','Aufstehen','seat',[...sitDown].reverse());
add('lie-seat','Hinlegen · wach ruhen','seat',expose('settle',[[sit,2],[5,3],[6,3],[7,3],[lie,7]]));
add('sleep-seat','Augen schließen · Schlafen','seat',[
 ...expose('settle',[[lie,2],[9,2]]),...Array.from({length:32},(_,i)=>({source:sleep,breath:Math.sin(i/31*Math.PI*2)*.006}))]);
add('yawn-seat','Gähnen','seat',expose('reactions-seat',[[sit,4],[6,3],[7,7],[8,4],[11,2],[sit,4]]));
const walk=Array.from({length:85},(_,i)=>{const t=i/FPS,p=pose(t);return{source:i===0||i===84?stand:`walk/${i}`,root:-p.rootX,travel:distance(t)/200,contacts:p.feet,contactRoot:p.rootX};});
const walkingDistance=200*104/BODY_WIDTH/1280;
add('walk-floor','Gehen · Angehen und Anhalten','floor',walk,{distance:walkingDistance});
// Retained asset ID for the existing lab selector; this is the same corrected
// gait and uses the actual current facing, including the return direction.
add('walk-back','Gehen · Rückweg','floor',walk.map(f=>({...f})),{distance:walkingDistance});
// Travel follows the sole position in the DRAWN run cels. During each diagonal
// support phase, body translation cancels the visible forepaw's displacement.
const runCurve=[0,66,100,118,126,164,199,248],runToe=[105,171,205,223,106,144,179,228];
const run=[...hold(stand,2,{travel:0}),...hold('body-actions/0',2,{travel:0}),...Array.from({length:24},(_,i)=>{
 const phase=i%8,root=Math.floor(i/8)*252+runCurve[phase];
 return{source:`run/${phase}`,travel:root/756,lift:phase===3||phase===7?.0045:0,
  drawnContact:{x:runToe[phase],y:477,root:-root,phase,planted:phase!==3&&phase!==7}};
}),...hold('body-actions/0',2,{travel:1}),...hold(stand,2,{travel:1})];
add('run-floor','Kurzer gewichtiger Trab','floor',run,{distance:756*104/BODY_WIDTH/1280});
const scoot=[...expose('settle',[[stand,2],[2,2],[sit,2]]).map(f=>({...f,travel:0})),
 ...Array.from({length:64},(_,i)=>{const phase=Math.floor(i/2)%4,root=Math.floor(i/8)*52+[0,13,17,39][phase];
  return{source:`scoot/${phase}`,travel:root/403,drawnContact:{x:[166,179,183,205][phase],y:477,root:-root,phase,planted:true,stroke:Math.floor(i/8)}};}),
 ...hold('scoot/0',2,{travel:1}),...sitDown.slice().reverse().map(f=>({...f,travel:1}))];
add('scoot-floor','Po auf dem Boden reiben','floor',scoot,{distance:403*104/BODY_WIDTH/1280});
for(const id of ['jump-up','jump-down','jump-seat']){
 const sourceSupport=id==='jump-up'?'floor':'seat',targetSupport=id==='jump-down'?'floor':'seat';
 const frames=expose('body-actions',[[stand,2],[0,3],[1,2],[2,6],[3,5],[4,3],[stand,3]]).map((f,i)=>{
  const progress=Math.max(0,Math.min(1,(i-5)/13));
  return{...f,progress,lift:i>=5&&i<=18?.08*Math.sin(progress*Math.PI):0,support:i<5?sourceSupport:i<18?'air':targetSupport};
 });
 add(id,{'jump-up':'Auf die Sitzfläche springen','jump-down':'Auf den Boden zurückspringen','jump-seat':'Zwischen Sitzflächen springen'}[id],'air',frames);
}
add('vomit-floor','Zu viele Leckerli · kurze Comic-Reaktion','floor',
 expose('body-actions',[[stand,3],[5,5],[6,3],[5,2],[6,3],[5,2],[6,10],[7,4],[stand,10]]),{deposit:27,waste:'vomit'});
clips.at(-1).frames.forEach((f,i)=>{if(i>=21&&i<27){const t=(i-21)/5;f.falling={kind:'vomit',x:.24+.14*t,y:-.065*(1-t*t),width:.075+.075*t,height:.08+.02*Math.sin(t*Math.PI)};}});
add('poop-floor','Ein kleines Häufchen','floor',expose('body-actions',[[stand,3],[0,4],[8,6],[9,9],[8,9],[0,4],[stand,7]]),{deposit:28,waste:'poop'});
clips.at(-1).frames.forEach((f,i)=>{if(i>=22&&i<28){const t=(i-22)/5;f.falling={kind:'poop',x:-.40+.08*t,y:-.27*(1-t*t),width:.09,height:.10};}});
for(const support of ['floor','seat']){
 const frames=expose('turn',[[stand,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],[7,2],[stand,2]])
  .map((f,i)=>({...f,flip:i>=9&&f.source!==stand,facing:i<9?-1:1}));
 add('turn-'+support,'Wenden · '+(support==='floor'?'Boden':'Sitzfläche'),support,frames);
}
export const repertoire=clips;
export function study(){
 const frames=[];const pick=id=>clips.find(c=>c.id===id).frames;
 const floor={x:.305,y:.635,width:104/1280,support:'floor'},end={...floor,x:floor.x+walkingDistance};
 const seat={x:.41,y:.497,width:68/1280,support:'seat'};
 const append=(id,entries,placement)=>entries.forEach((f,i)=>frames.push({...f,...placement(f,i),clip:id,label:clips.find(c=>c.id===id).label}));
 append('stand-floor',pick('stand-floor').slice(0,12),()=>floor);
 const walkCount=180-12-24-sitDown.length-pick('pet-seat').length-18-17;
 append('walk-floor',Array.from({length:walkCount},(_,i)=>pick('walk-floor')[Math.round(i*84/(walkCount-1))]),f=>({...floor,x:floor.x+walkingDistance*(f.travel??0)}));
 append('jump-up',pick('jump-up'),f=>({x:end.x+(seat.x-end.x)*f.progress,y:end.y+(seat.y-end.y)*f.progress,
  width:end.width+(seat.width-end.width)*(f.progress*f.progress*(3-2*f.progress)),support:f.support}));
 append('sit-seat',pick('sit-seat'),()=>seat);
 append('pet-seat',pick('pet-seat'),()=>seat);
 append('lie-seat',pick('lie-seat'),()=>seat);
 append('sleep-seat',pick('sleep-seat').slice(0,17),()=>seat);
 if(frames.length!==180)throw Error(`Study length ${frames.length}`);
 return frames;
}
