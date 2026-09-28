'use strict';
(()=>{
const $ = id => document.getElementById(id);
const canvas = $('town'), ctx = canvas.getContext('2d');
const T = 16, W = 76, H = 54;
const terrain = document.createElement('canvas'); terrain.width = W*T; terrain.height = H*T;
const g = terrain.getContext('2d'); g.imageSmoothingEnabled = false;
const blocked = new Set(), rooms = [], diary = [];
let sheet, chars, selected = 0, following = false, paused = false, speed = 1, elapsed = 0, last = 0;
let camera = {x:0,y:0,z:1}, state = null;
const roles = ['router','explorer','architect','builder','tester','reviewer','release','knowledge'];
const names = ['Robin','Scout','Arden','Blake','Tess','Reese','Skye','Kit'];
const titles = ['Router','Explorer','Architect','Builder','Tester','Reviewer','Release','Knowledge'];
const purposes = ['Coordinates the crew and its shared missions.','Explores the project and gathers evidence.','Designs how the pieces fit together.','Builds scoped changes to the project.','Checks behavior and records test results.','Reviews correctness and quality.','Checks release readiness and deployment evidence.','Organizes the crew’s decisions and documentation.'];
const agents = roles.map((id,i)=>({id,name:names[i],title:titles[i],x:34+i,y:27,path:[],wait:i*2,trip:0,activity:'Taking in the town',speech:'Good morning!',sprite:i%6+5,work:null}));
function imageAt(url){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Could not load '+url));im.src=url;});}
function tile(c,r,x,y,target=g){target.drawImage(sheet,c*17,r*17,16,16,x*T,y*T,T,T);}
function rect(color,x,y,w,h){g.fillStyle=color;g.fillRect(x*T,y*T,w*T,h*T);}
function prop(c,r,x,y,solid=true){tile(c,r,x,y);if(solid)blocked.add(y*W+x);}
function text(label,x,y){g.font='bold 9px monospace';const w=g.measureText(label).width;g.fillStyle='#fff6d8';g.fillRect(x*T-w/2-5,y*T-10,w+10,14);g.strokeStyle='#6a734b';g.strokeRect(x*T-w/2-5,y*T-10,w+10,14);g.fillStyle='#475436';g.fillText(label,x*T-w/2,y*T);}
function tree(x,y){rect('#638e4b',x+.2,y+1.1,1.6,.7);tile(15,10,x,y);tile(15,11,x,y+1);blocked.add(y*W+x);blocked.add((y+1)*W+x);}
function building(x,y,w,h,label,kind){
  rect('#789950',x+.3,y+.5,w,h);rect('#756f57',x,y,w,h);rect('#ebdfb9',x+.2,y+.2,w-.4,h-.4);
  for(let yy=y+1;yy<y+h-1;yy++)for(let xx=x+1;xx<x+w-1;xx++){rect(kind==='cafe'?'#dfbe85':kind==='home'?'#d8cdab':'#ddcfaa',xx,yy,1,1);g.fillStyle='#a78c6540';g.fillRect(xx*T,yy*T+7,16,1);g.fillRect(xx*T,yy*T+15,16,1);g.fillRect(xx*T+(yy%2?3:11),yy*T,1,8);}
  for(let xx=x;xx<x+w;xx++){tile(33,12,xx,y);blocked.add(y*W+xx);tile(33,12,xx,y+h-1);blocked.add((y+h-1)*W+xx);}
  for(let yy=y;yy<y+h;yy++){tile(33,12,x,yy);tile(33,12,x+w-1,yy);blocked.add(yy*W+x);blocked.add(yy*W+x+w-1);}
  const door=x+Math.floor(w/2);blocked.delete((y+h-1)*W+door);rect('#c2a16b',door,y+h-1,1,2);text(label,x+w/2,y-.6);
  rooms.push({x:door,y:y+h-2,label,kind});
  // Furnishings from the downloaded atlas. All large furniture blocks navigation.
  for(let xx=x+2;xx<x+w-2;xx+=3){prop(43,13,xx,y+1);prop(43,14,xx,y+2);}
  rect(kind==='cafe'?'#be775e':kind==='home'?'#95ad8a':'#88a8ac',x+2,y+4,w-4,h-7);
  for(let yy=y+4;yy<y+h-2;yy+=3)for(let xx=x+2;xx<x+w-2;xx+=4){prop(16,0,xx,yy);prop(17,0,xx+1,yy);prop(19,2,xx,yy+1);}
  prop(28,9,x+1,y+h-2);prop(28,9,x+w-2,y+h-2);
  if(kind==='home'){prop(15,3,x+2,y+3);prop(15,4,x+2,y+4);}
  // Keep a continuous aisle from the entrance to the back of each room.
  for(let yy=y+3;yy<y+h-1;yy++){blocked.delete(yy*W+door);rect('#ddcfaa',door,yy,1,1);g.fillStyle='#a78c6540';g.fillRect(door*T,yy*T+7,16,1);g.fillRect(door*T,yy*T+15,16,1);}
}
function makeMap(){
  rect('#a8cc76',0,0,W,H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){if((x*17+y*31)%23===0){g.fillStyle='#8db860';g.fillRect(x*T+4,y*T+7,2,3);g.fillRect(x*T+7,y*T+5,2,4);}if((x*43+y*17)%137===0)tile(26,9,x,y);}
  // Connected town paths, a central square, and stepping stones to each doorway.
  rect('#ddcfa1',3,25,69,4);rect('#ddcfa1',34,4,4,46);rect('#ddcfa1',4,44,66,3);rect('#ddcfa1',4,5,65,3);
  rect('#eadcad',29,23,14,10);
  for(let y=6;y<48;y++)for(let x=34;x<38;x++){if((x+y)%3===0){g.fillStyle='#c9bd90';g.fillRect(x*T+3,y*T+5,6,2);}}
  building(6,10,13,12,'THE MORNING CAFE','cafe');building(23,10,12,12,'ROUTER HOUSE','work');building(41,10,12,12,'DESIGN STUDIO','work');building(58,10,13,12,'BUILDERS WORKSHOP','work');
  building(6,33,13,10,'MEMORY LIBRARY','work');building(23,34,11,9,'CREW COTTAGE','home');building(43,34,12,9,'PROOF LAB','work');building(60,34,11,9,'REVIEW HOUSE','work');
  for(const room of rooms){for(let y=room.y+2;y< (room.y<25?25:45);y++)tile(5,1,room.x,y);}
  // Pond and garden north of the square.
  for(let y=1;y<5;y++)for(let x=44;x<55;x++){tile(1,1,x,y);blocked.add(y*W+x);}
  for(let x=3;x<73;x+=2){tree(x,0);tree(x,51);}for(let y=3;y<50;y+=3){tree(0,y);tree(74,y);}
  for(const [x,y] of [[3,11],[20,13],[20,18],[38,14],[55,12],[55,18],[2,33],[20,35],[38,36],[56,35],[72,36],[9,47],[15,48],[45,48],[62,48]])tree(x,y);
  for(let x=5;x<29;x+=2){prop(13,6,x,30);prop(0,6,x,31,false);}for(let x=43;x<70;x+=2){prop(13,6,x,30);prop(1,7,x,31,false);}
  for(const [x,y] of [[31,25],[40,25],[31,30],[40,30]]){prop(16,0,x,y);prop(18,2,x,y+1,false);}
  text('COMMONS & COFFEE',36,32);text('WILLOW WALK',15,49);text('RESEARCH GARDEN',57,49);
  agents.forEach((a,i)=>{const room=rooms[homeRooms[a.id]];a.x=room.x;a.y=room.y;a.activity='Enjoying '+room.label.toLowerCase();a.wait=5+i*2;});
}
function pathfind(sx,sy,tx,ty){
  const start=Math.round(sy)*W+Math.round(sx),goal=ty*W+tx;
  if(blocked.has(goal))return [];
  const queue=[start],prev=new Map([[start,-1]]);
  for(let i=0;i<queue.length;i++){const p=queue[i];if(p===goal)break;const x=p%W,y=Math.floor(p/W);for(const [nx,ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const n=ny*W+nx;if(nx<1||nx>=W-1||ny<1||ny>=H-1||blocked.has(n)||prev.has(n))continue;prev.set(n,p);queue.push(n);}}
  if(!prev.has(goal))return [];const result=[];for(let p=goal;p!==start;p=prev.get(p))result.unshift({x:p%W,y:Math.floor(p/W)});return result;
}
const destinations=[...Array.from({length:8},(_,i)=>({room:i})),{x:36,y:29,label:'the commons'},{x:16,y:46,label:'Willow Walk'},{x:54,y:46,label:'the garden'}];
function time(){const m=(540+Math.floor(elapsed*2))%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');}
function entry(a,message){}
function chooseTrip(a,i){const dest=destinations[(i+a.trip*3)%destinations.length];const d=dest.room!==undefined?rooms[dest.room]:dest;a.path=pathfind(a.x,a.y,d.x,d.y);a.trip++;a.activity='Walking to '+d.label.toLowerCase();a.destination=d.label;a.speech=dest.room===0?'Coffee, anyone?':dest.room===4?'A little reading.':'Off to '+d.label.toLowerCase();if(!a.path.length)a.wait=4;}
function tick(dt){elapsed+=dt;for(const [i,a] of agents.entries()){if(a.path.length){const p=a.path[0],dx=p.x-a.x,dy=p.y-a.y,dist=Math.hypot(dx,dy),step=dt*2.2;if(dist<=step){a.x=p.x;a.y=p.y;a.path.shift();if(!a.path.length){a.wait=9+i%4*2;a.activity=a.work?a.work.text:'Ambient · at '+a.destination.toLowerCase();a.speech=a.destination.includes('CAFE')?'Let’s catch up.':a.destination.includes('LIBRARY')?'Found a good book.':'Taking a moment.';entry(a,'arrived at '+a.destination.toLowerCase()+'.');}}else{a.x+=dx/dist*step;a.y+=dy/dist*step;}}else if(!a.work){a.wait-=dt;if(a.wait<=0)chooseTrip(a,i);}}}
function character(target,a,x,y,scale=1){target.imageSmoothingEnabled=false;target.drawImage(chars,0,a.sprite*17,16,16,x,y,16*scale,16*scale);}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#94bf6a';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.setTransform(camera.z,0,0,camera.z,camera.x,camera.y);ctx.imageSmoothingEnabled=false;ctx.drawImage(terrain,0,0);
  for(const [i,a] of [...agents.entries()].sort((a,b)=>a[1].y-b[1].y)){const x=a.x*T,y=a.y*T;ctx.fillStyle='#3a58384d';ctx.beginPath();ctx.ellipse(x+8,y+15,7,3,0,0,Math.PI*2);ctx.fill();if(i===selected){ctx.strokeStyle='#fffad9';ctx.lineWidth=1.5;ctx.strokeRect(x-2,y-2,20,21);}character(ctx,a,x,y-(a.path.length?Math.sin(elapsed*12)*1.1:0));if(i===selected||!a.path.length){const s=i===selected?a.name+': '+(a.work?'Working…':a.speech):a.name;ctx.font='8px monospace';const w=ctx.measureText(s).width;ctx.fillStyle='#fffdf1';ctx.fillRect(x+8-w/2-4,y-18,w+8,13);ctx.strokeStyle='#62764f';ctx.lineWidth=.8;ctx.strokeRect(x+8-w/2-4,y-18,w+8,13);ctx.fillStyle='#374a30';ctx.fillText(s,x+8-w/2,y-9);}}
}
function fit(){camera.z=Math.min(canvas.width/terrain.width,canvas.height/terrain.height)*.97;camera.x=(canvas.width-terrain.width*camera.z)/2;camera.y=(canvas.height-terrain.height*camera.z)/2;following=false;}
function resize(){canvas.width=$('viewport').clientWidth;canvas.height=$('viewport').clientHeight;fit();}
function details(){const a=agents[selected];$('name').textContent=a.name+' · '+a.title;$('purpose').textContent=purposes[selected];$('routine').textContent=a.work?a.work.text:'Ambient · '+a.activity;document.querySelectorAll('.resident').forEach((b,i)=>{b.classList.toggle('active',i===selected);b.classList.toggle('working',!!agents[i].work);});}
function roster(){for(const [i,a] of agents.entries()){const b=document.createElement('button');b.className='resident';b.setAttribute('aria-label','Select '+a.name+', '+a.title);const face=document.createElement('canvas');face.width=16;face.height=20;character(face.getContext('2d'),a,0,2);const label=document.createElement('span');label.textContent=a.name;const sub=document.createElement('small');sub.textContent=a.title;label.append(sub);b.append(face,label);b.onclick=()=>{selected=i;details();};$('residents').append(b);}}
function zoom(factor,x=canvas.width/2,y=canvas.height/2){const z=Math.max(.35,Math.min(4,camera.z*factor));camera.x=x-(x-camera.x)*z/camera.z;camera.y=y-(y-camera.y)*z/camera.z;camera.z=z;}
let drag=null;
canvas.onpointerdown=e=>{following=false;drag={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY};canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(drag){camera.x+=e.clientX-drag.x;camera.y+=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;}};
canvas.onpointerup=e=>{if(drag&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<5){const r=canvas.getBoundingClientRect(),x=(e.clientX-r.left-camera.x)/camera.z/T,y=(e.clientY-r.top-camera.y)/camera.z/T;const i=agents.findIndex(a=>Math.hypot(a.x+.5-x,a.y+.5-y)<1.4);if(i>=0){selected=i;details();}}drag=null;};canvas.onpointercancel=()=>drag=null;
canvas.addEventListener('wheel',e=>{e.preventDefault();const r=canvas.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top);},{passive:false});
$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Resume':'Pause';};$('fit').onclick=fit;$('in').onclick=()=>zoom(1.2);$('out').onclick=()=>zoom(1/1.2);window.addEventListener('resize',resize);
function frame(now){const dt=Math.min((now-last)/1000,.05);last=now;if(!paused)tick(dt*speed);if(following){const a=agents[selected];camera.x=canvas.width/2-(a.x+.5)*T*camera.z;camera.y=canvas.height/2-(a.y+.5)*T*camera.z;}draw();details();requestAnimationFrame(frame);}
const homeRooms={router:1,explorer:4,architect:2,builder:3,tester:6,reviewer:7,release:7,knowledge:4};
window.world={
activity(event){const a=agents.find(a=>a.id===event.role)||agents[0];selected=agents.indexOf(a);if(event.status==='working'){for(const other of agents){if(other!==a)other.work=null;}a.work={text:event.text||'Working on your mission'};const room=rooms[homeRooms[a.id]];if(room){a.path=pathfind(a.x,a.y,room.x,room.y);a.destination=room.label;}}else{a.work=null;a.wait=5;a.activity=event.status==='failed'?'Last action failed':'Last action finished';}details();},
done(){for(const a of agents){a.work=null;a.wait=4;}details();},
fit:resize
};
window.worldDiagnostics=()=>({assetsLoaded:!!sheet&&!!chars,rooms:rooms.length,agents:agents.length,reachable:rooms.length===8&&rooms.every(r=>pathfind(36,27,r.x,r.y).length>0),activeRoles:agents.filter(a=>a.work).map(a=>a.id),noPageOverflow:document.documentElement.scrollHeight<=innerHeight,canvasVisible:canvas.width>0&&canvas.height>0});
async function init(){try{[sheet,chars]=await Promise.all([imageAt('assets/terrain.png'),imageAt('assets/characters.png')]);makeMap();roster();resize();$('loading').hidden=true;requestAnimationFrame(frame);}catch(e){$('loading').textContent=e.message;}}
init();
})();
