export const COLS=10,ROWS=20,MATCH_S=90;
export const COLORS=[null,{c:'#19b6e8',l:'#66d9f7',d:'#0b84b0'},{c:'#f7c32b',l:'#ffe580',d:'#c0900c'},{c:'#9a55d8',l:'#c68ff2',d:'#6b30a8'},{c:'#3dbb4e',l:'#7fe08b',d:'#238a33'},{c:'#e43d3d',l:'#ff8080',d:'#a62222'},{c:'#3d7bea',l:'#85adf7',d:'#2350b3'},{c:'#f08a24',l:'#ffb766',d:'#b3600d'},{c:'#8692a6',l:'#b9c2d2',d:'#566172'}];
const SHAPES=[[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],[[1,1],[1,1]],[[0,1,0],[1,1,1],[0,0,0]],[[0,1,1],[1,1,0],[0,0,0]],[[1,1,0],[0,1,1],[0,0,0]],[[1,0,0],[1,1,1],[0,0,0]],[[0,0,1],[1,1,1],[0,0,0]]];
export function cells(piece){let matrix=SHAPES[piece.type];for(let n=0;n<piece.rotation;n++)matrix=matrix[0].map((_,x)=>matrix.map(row=>row[x]).reverse());const out=[];matrix.forEach((row,y)=>row.forEach((v,x)=>{if(v)out.push([x+piece.x,y+piece.y]);}));return out;}
function random(seed){return()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
export class Board{
 constructor(seed,bot=null,emit=()=>{}){this.rng=random(seed);this.garbageRng=random(seed^0x5bd1e995);this.bot=bot;this.emit=emit;this.grid=Array.from({length:ROWS},()=>Array(COLS).fill(0));this.queue=[];this.score=0;this.lines=0;this.level=1;this.lives=1;this.dead=false;this.state='play';this.incoming=0;this.rev=0;this.age=0;this.fall=0;this.ground=0;this.lockResets=0;this.botTime=0;this.held=null;this.holdUsed=false;this.fill();this.spawn();}
 fill(){while(this.queue.length<8){const bag=[0,1,2,3,4,5,6];for(let i=6;i>0;i--){const j=Math.floor(this.rng()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}this.queue.push(...bag);}}
 fits(piece){return cells(piece).every(([x,y])=>x>=0&&x<COLS&&y<ROWS&&(y<0||!this.grid[y][x]));}
 spawn(type){this.fill();const nextType=type??this.queue.shift();this.piece={type:nextType,rotation:0,x:3,y:nextType===0?-1:0};this.fall=this.ground=this.lockResets=this.botTime=0;if(!this.fits(this.piece))this.die();this.rev++;if(this.bot&&!this.dead)this.plan();}
 die(){if(this.dead)return;this.dead=true;this.lives=0;this.state='ko';this.rev++;this.emit('ko');}
 move(dx,dy=0){if(this.dead)return false;const p={...this.piece,x:this.piece.x+dx,y:this.piece.y+dy};if(!this.fits(p))return false;this.piece=p;if(dy===0&&this.ground>0&&this.lockResets<15){this.ground=0;this.lockResets++;}this.rev++;return true;}
 rotate(direction=1){if(this.dead)return false;if(this.piece.type===1)return false;for(const dx of [0,-1,1,-2,2])for(const dy of [0,-1]){const p={...this.piece,rotation:(this.piece.rotation+direction+4)%4,x:this.piece.x+dx,y:this.piece.y+dy};if(this.fits(p)){this.piece=p;if(this.ground>0&&this.lockResets<15){this.ground=0;this.lockResets++;}this.rev++;return true;}}return false;}
 hold(){if(this.dead||this.holdUsed)return;const old=this.held;this.held=this.piece.type;this.spawn(old??undefined);this.holdUsed=true;}
 hardDrop(){if(this.dead)return;let distance=0;while(this.move(0,1))distance++;this.score+=distance*2;this.lock();}
 receive(n){if(!this.dead&&Number.isInteger(n)&&n>0){this.incoming=Math.min(12,this.incoming+n);this.emit('warn');}}
 lock(){if(this.dead)return;for(const[x,y]of cells(this.piece)){if(y<0){this.die();return;}this.grid[y][x]=this.piece.type+1;}
 const remaining=this.grid.filter(row=>row.some(v=>!v));const cleared=ROWS-remaining.length;
 this.grid=[...Array.from({length:cleared},()=>Array(COLS).fill(0)),...remaining];
 if(cleared){this.lines+=cleared;this.score+=[0,100,300,500,800][cleared]*this.level;this.level=1+Math.floor(this.lines/10);this.emit('clear');let attack=[0,0,1,2,4][cleared];const cancel=Math.min(attack,this.incoming);attack-=cancel;this.incoming-=cancel;if(attack)this.emit('attack',attack);}else this.emit('brick',0);
 if(this.incoming){const n=this.incoming;this.incoming=0;for(let i=0;i<n;i++){if(this.grid.shift().some(Boolean)){this.die();return;}const hole=Math.floor(this.garbageRng()*COLS);this.grid.push(Array.from({length:COLS},(_,x)=>x===hole?0:8));}}
 this.holdUsed=false;this.spawn();this.rev++;}
 plan(){let best=null;for(let rotation=0;rotation<4;rotation++)for(let x=-3;x<COLS;x++){
  const p={...this.piece,rotation,x,y:0};if(!this.fits(p))continue;while(this.fits({...p,y:p.y+1}))p.y++;
  const grid=this.grid.map(row=>row.slice());for(const[cx,cy]of cells(p))if(cy>=0)grid[cy][cx]=1;
  let holes=0;const heights=[];for(let cx=0;cx<COLS;cx++){let seen=false,h=0;for(let y=0;y<ROWS;y++){if(grid[y][cx]){if(!seen)h=ROWS-y;seen=true;}else if(seen)holes++;}heights.push(h);}
  const lines=grid.filter(row=>row.every(Boolean)).length;const bump=heights.slice(1).reduce((n,h,i)=>n+Math.abs(h-heights[i]),0);
  const value=holes*10+heights.reduce((n,h)=>n+h,0)*.5+bump*.8-lines*8;
  if(!best||value<best.value)best={value,p};
 }if(best)this.piece={...best.p,y:0};}
 update(dt){if(this.dead)return;this.age+=dt;const interval=Math.max(.06,Math.pow(.8-(this.level-1)*.007,this.level-1));this.fall+=dt;
  if(this.bot){this.botTime+=dt;if(this.botTime>this.bot.delay){this.hardDrop();return;}}
  while(this.fall>=interval&&!this.dead){this.fall-=interval;if(!this.move(0,1))break;}
  if(!this.fits({...this.piece,y:this.piece.y+1})){this.ground+=dt;if(this.ground>=.5)this.lock();}else this.ground=0;
 }
 snapshot(){return{grid:this.grid.flat().join(''),piece:{...this.piece},score:this.score,lines:this.lines,dead:this.dead,incoming:this.incoming,held:this.held,next:this.queue.slice(0,3)};}
}
export function decodeSnapshot(data){if(!data||typeof data.grid!=='string'||!/^[0-8]{200}$/.test(data.grid)||!Number.isSafeInteger(data.score)||data.score<0||!Number.isInteger(data.lines)||data.lines<0||data.lines>10000)return null;const p=data.piece;if(!p||!Number.isInteger(p.type)||p.type<0||p.type>6||!Number.isInteger(p.rotation)||p.rotation<0||p.rotation>3||!Number.isInteger(p.x)||p.x< -4||p.x>10||!Number.isInteger(p.y)||p.y< -4||p.y>20)return null;return{grid:Array.from({length:ROWS},(_,i)=>data.grid.slice(i*COLS,(i+1)*COLS).split('').map(Number)),piece:{type:p.type,rotation:p.rotation,x:p.x,y:p.y},score:data.score,lines:data.lines,dead:!!data.dead,lives:data.dead?0:1,state:data.dead?'ko':'play',incoming:Math.min(12,Math.max(0,data.incoming|0)),held:Number.isInteger(data.held)&&data.held>=0&&data.held<7?data.held:null,next:Array.isArray(data.next)?data.next.filter(n=>Number.isInteger(n)&&n>=0&&n<7).slice(0,3):[]};}
