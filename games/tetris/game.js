"use strict";
/* ================================================================
 * 俄罗斯方块在线对战 — 纯 JS 客户端
 * SSE 接收事件 + HTTP POST 发送动作
 * ================================================================ */

/* ---- Constants ---- */
const COLS=10, ROWS=20, HIDDEN=2, TOTAL=ROWS+HIDDEN;
const CELL=30, OPP_CELL=12;
const PIECES={
  I:{c:"#00f0f0",s:[[1,1,1,1]]},
  O:{c:"#f0f000",s:[[1,1],[1,1]]},
  T:{c:"#a000f0",s:[[0,1,0],[1,1,1]]},
  S:{c:"#00f000",s:[[0,1,1],[1,1,0]]},
  Z:{c:"#f00000",s:[[1,1,0],[0,1,1]]},
  J:{c:"#0000f0",s:[[1,0,0],[1,1,1]]},
  L:{c:"#f0a000",s:[[0,0,1],[1,1,1]]}
};
const TYPES=Object.keys(PIECES);
/* SRS wall kick data (simplified: try offsets) */
const KICKS=[{x:0,y:0},{x:-1,y:0},{x:1,y:0},{x:0,y:-1},{x:-2,y:0},{x:2,y:0}];

/* ---- State ---- */
let G={
  board:[], cur:null, next:null, hold:null, canHold:true,
  score:0, lines:0, level:1, over:false, paused:false,
  bag:[], dropTimer:0, dropInterval:1000, lastTime:0,
  flashRows:[], flashTimer:0, running:false
};
let NET={pid:null, room:null, es:null, opponentName:"", playing:false};
let myCanvas,myCtx,oppCanvas,oppCtx,nextCanvas,nextCtx,holdCanvas,holdCtx;
let animId=null;

/* ---- Audio ---- */
const AC=window.AudioContext||window.webkitAudioContext; let ac=null;
function tone(f,d,t,v){try{if(!ac)ac=new AC();const o=ac.createOscillator(),g=ac.createGain();o.type=t||"sine";o.frequency.value=f;g.gain.setValueAtTime(v||.2,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+d);o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+d);}catch(e){}}
function sfxLock(){tone(180,.08,"square",.15)}
function sfxClear(){[523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.15,"triangle",.25),i*60))}
function sfxGarbage(){tone(120,.2,"sawtooth",.2)}
function sfxOver(){[400,300,200,100].forEach((f,i)=>setTimeout(()=>tone(f,.3,"sine",.25),i*150))}
function sfxWin(){[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>tone(f,.2,"triangle",.3),i*100))}

/* ---- Bag randomizer ---- */
function refillBag(){let b=[...TYPES];for(let i=b.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[b[i],b[j]]=[b[j],b[i]];}G.bag.push(...b);}
function nextType(){if(G.bag.length<2)refillBag();return G.bag.shift();}
function makePiece(t){const p=PIECES[t];return{t,shape:p.s.map(r=>[...r]),color:p.c,x:Math.floor((COLS-p.s[0].length)/2),y:0};}

/* ---- Rotate ---- */
function rotateShape(s,dir){
  const R=s.length,C=s[0].length;
  const n=Array.from({length:C},()=>Array(R).fill(0));
  for(let r=0;r<R;r++)for(let c=0;c<C;c++){
    if(dir>0)n[c][R-1-r]=s[r][c];else n[C-1-c][r]=s[r][c];
  }
  return n;
}

/* ---- Init board ---- */
function initBoard(){G.board=Array.from({length:TOTAL},()=>Array(COLS).fill(0));}

/* ---- Collision ---- */
function collide(shape,px,py){
  for(let r=0;r<shape.length;r++)for(let c=0;c<shape[r].length;c++){
    if(!shape[r][c])continue;
    const bx=px+c,by=py+r;
    if(bx<0||bx>=COLS||by>=TOTAL)return true;
    if(by>=0&&G.board[by][bx])return true;
  }
  return false;
}

/* ---- Merge ---- */
function merge(){
  const s=G.cur.shape;
  for(let r=0;r<s.length;r++)for(let c=0;c<s[r].length;c++){
    if(s[r][c]){
      const by=G.cur.y+r,bx=G.cur.x+c;
      if(by>=0&&by<TOTAL&&bx>=0&&bx<COLS)G.board[by][bx]=G.cur.color;
    }
  }
}

/* ---- Clear lines ---- */
function clearLines(){
  let cleared=0;
  G.flashRows=[];
  for(let r=TOTAL-1;r>=0;r--){
    if(G.board[r].every(v=>v!==0)){
      G.board.splice(r,1);
      G.board.unshift(Array(COLS).fill(0));
      cleared++;r++; // recheck same row
    }
  }
  if(cleared>0){
    G.lines+=cleared;
    G.score+=[0,100,300,500,800][cleared]*G.level;
    G.level=Math.floor(G.lines/10)+1;
    G.dropInterval=Math.max(100,1000-(G.level-1)*80);
    sfxClear();
    // Send garbage: 2 lines→1, 3→2, 4→4
    const garbage=[0,0,1,2,4][cleared];
    if(garbage>0&&NET.playing){
      net.post("garbage",{lines:garbage});
    }
    net.post("update",{score:G.score,lines:G.lines});
  }
  return cleared;
}

/* ---- Add garbage ---- */
function addGarbage(n){
  for(let i=0;i<n;i++){
    G.board.shift(); // remove top row
    const row=Array(COLS).fill("#555");
    row[Math.floor(Math.random()*COLS)]=0;
    G.board.push(row);
  }
  sfxGarbage();
  // Check if collision with current piece
  if(G.cur&&collide(G.cur.shape,G.cur.x,G.cur.y)){
    G.cur.y--;
    if(collide(G.cur.shape,G.cur.x,G.cur.y)){gameOver();}
  }
}

/* ---- Spawn ---- */
function spawn(){
  if(!G.next)G.next=makePiece(nextType());
  G.cur=G.next;
  G.next=makePiece(nextType());
  G.canHold=true;
  if(collide(G.cur.shape,G.cur.x,G.cur.y)){gameOver();return;}
  renderNext();
}

/* ---- Hold ---- */
function doHold(){
  if(!G.canHold||!G.cur)return;
  const tmp=G.hold;
  G.hold=G.cur.t;
  if(tmp){G.cur=makePiece(tmp);}else{spawn();}
  G.canHold=false;
  renderHold();
}

/* ---- Movement ---- */
function tryMove(dx,dy){
  if(!G.cur)return false;
  if(!collide(G.cur.shape,G.cur.x+dx,G.cur.y+dy)){G.cur.x+=dx;G.cur.y+=dy;return true;}
  return false;
}
function tryRotate(dir){
  if(!G.cur||G.cur.t==="O")return;
  const rotated=rotateShape(G.cur.shape,dir);
  for(const k of KICKS){
    if(!collide(rotated,G.cur.x+k.x,G.cur.y+k.y)){
      G.cur.shape=rotated;G.cur.x+=k.x;G.cur.y+=k.y;return;
    }
  }
}
function hardDrop(){
  if(!G.cur)return;
  while(tryMove(0,1));
  lockPiece();
}
function lockPiece(){
  merge();sfxLock();
  const cleared=clearLines();
  spawn();
}

/* ---- Game over ---- */
function gameOver(){
  G.over=true;G.running=false;sfxOver();
  if(NET.playing){net.post("gameover",{});}
  const el=document.getElementById("go-title");
  el.textContent="💀 游戏结束";
  el.style.color="#f85149";
  document.getElementById("game-over-overlay").classList.remove("hidden");
}

function winGame(){
  G.running=false;sfxWin();
  const el=document.getElementById("go-title");
  el.textContent="🎉 你赢了！";
  el.style.color="#3fb950";
  document.getElementById("game-over-overlay").classList.remove("hidden");
}

/* ---- Gravity / game tick ---- */
function gameTick(){
  if(!G.running||G.paused||G.over)return;
  const now=performance.now();
  const dt=now-(G.lastTime||now);
  G.lastTime=now;
  G.dropTimer+=dt;
  if(G.dropTimer>=G.dropInterval){
    G.dropTimer=0;
    if(!tryMove(0,1)){lockPiece();}
  }
  // Flash animation timer
  if(G.flashTimer>0)G.flashTimer-=dt;
}

/* ---- Render ---- */
function drawCell(ctx,x,y,size,color){
  ctx.fillStyle=color;
  ctx.fillRect(x*size,y*size,size-1,size-1);
  ctx.fillStyle="rgba(255,255,255,.2)";
  ctx.fillRect(x*size,y*size,size-1,3);
  ctx.fillStyle="rgba(0,0,0,.2)";
  ctx.fillRect(x*size,(y+1)*size-4,size-1,3);
}

function render(){
  myCtx.clearRect(0,0,myCanvas.width,myCanvas.height);
  // Grid
  myCtx.strokeStyle="#21262d";myCtx.lineWidth=1;
  for(let c=0;c<=COLS;c++){myCtx.beginPath();myCtx.moveTo(c*CELL,0);myCtx.lineTo(c*CELL,ROWS*CELL);myCtx.stroke();}
  for(let r=0;r<=ROWS;r++){myCtx.beginPath();myCtx.moveTo(0,r*CELL);myCtx.lineTo(COLS*CELL,r*CELL);myCtx.stroke();}
  // Locked blocks
  for(let r=HIDDEN;r<TOTAL;r++)for(let c=0;c<COLS;c++){
    if(G.board[r][c])drawCell(myCtx,c,r-HIDDEN,CELL,G.board[r][c]);
  }
  // Ghost + current
  if(G.cur&&!G.over){
    let gy=G.cur.y;while(!collide(G.cur.shape,G.cur.x,gy+1))gy++;
    myCtx.globalAlpha=.15;
    for(let r=0;r<G.cur.shape.length;r++)for(let c=0;c<G.cur.shape[r].length;c++){
      if(G.cur.shape[r][c])drawCell(myCtx,G.cur.x+c,gy+r-HIDDEN,CELL,G.cur.color);
    }
    myCtx.globalAlpha=1;
    for(let r=0;r<G.cur.shape.length;r++)for(let c=0;c<G.cur.shape[r].length;c++){
      if(G.cur.shape[r][c]&&G.cur.y+r>=HIDDEN)drawCell(myCtx,G.cur.x+c,G.cur.y+r-HIDDEN,CELL,G.cur.color);
    }
  }
  // Opponent
  renderOpp();
}

function renderOpp(){
  oppCtx.clearRect(0,0,oppCanvas.width,oppCanvas.height);
  oppCtx.strokeStyle="#21262d";
  for(let c=0;c<=COLS;c++){oppCtx.beginPath();oppCtx.moveTo(c*OPP_CELL,0);oppCtx.lineTo(c*OPP_CELL,ROWS*OPP_CELL);oppCtx.stroke();}
  for(let r=0;r<=ROWS;r++){oppCtx.beginPath();oppCtx.moveTo(0,r*OPP_CELL);oppCtx.lineTo(COLS*OPP_CELL,r*OPP_CELL);oppCtx.stroke();}
}

function renderOppBoard(cells){
  oppCtx.clearRect(0,0,oppCanvas.width,oppCanvas.height);
  if(!cells)return;
  for(let r=0;r<ROWS&&r<cells.length;r++)for(let c=0;c<COLS&&c<cells[r].length;c++){
    if(cells[r][c])drawCell(oppCtx,c,r,OPP_CELL,cells[r][c]);
  }
}

function renderMini(ctx,canvas,type){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(!type)return;
  const p=PIECES[type],s=p.s,sz=20;
  const ox=(canvas.width-s[0].length*sz)/2,oy=(canvas.height-s.length*sz)/2;
  for(let r=0;r<s.length;r++)for(let c=0;c<s[r].length;c++){
    if(s[r][c]){
      ctx.fillStyle=p.c;
      ctx.fillRect(ox+c*sz,oy+r*sz,sz-1,sz-1);
      ctx.fillStyle="rgba(255,255,255,.2)";
      ctx.fillRect(ox+c*sz,oy+r*sz,sz-1,3);
    }
  }
}
function renderNext(){renderMini(nextCtx,nextCanvas,G.next?G.next.t:null);}
function renderHold(){renderMini(holdCtx,holdCanvas,G.hold);}

/* ---- Network ---- */
const net={
  async post(action,data){
    try{
      const r=await fetch(`/api/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pid:NET.pid,...data})});
      return r.json();
    }catch(e){console.warn("POST error",action,e);return{};}
  },
  connect(pid){
    if(NET.es)NET.es.close();
    NET.es=new EventSource(`/api/events?pid=${pid}`);
    NET.es.onmessage=e=>{
      try{handleMsg(JSON.parse(e.data));}catch(err){console.warn("SSE parse error",err);}
    };
    NET.es.onerror=()=>{console.log("SSE reconnecting...");};
  },
  close(){if(NET.es){NET.es.close();NET.es=null;}}
};

function handleMsg(m){
  switch(m.type){
    case "opponent_joined":
      NET.opponentName=m.name;
      document.getElementById("opp-name").textContent=m.name;
      document.getElementById("waiting-status").textContent="✅ 对手已加入！";
      setTimeout(()=>{net.post("ready",{});},500);
      break;
    case "joined":
      NET.opponentName=m.opponent;
      document.getElementById("opp-name").textContent=m.opponent;
      net.post("ready",{});
      break;
    case "countdown":
      showCountdown(m.n);
      break;
    case "start":
      hideCountdown();startPlaying();
      break;
    case "garbage":
      addGarbage(m.lines);
      showMsg(`⚠️ ${m.sender||"对手"} 发送了 ${m.lines} 行垃圾！`);
      break;
    case "opponent_update":
      document.getElementById("opp-score").textContent=m.score;
      document.getElementById("opp-lines").textContent=m.lines;
      break;
    case "opponent_gameover":
      winGame();
      break;
    case "opponent_left":
      if(NET.playing||G.running){
        G.running=false;
        document.getElementById("game-msg").textContent="⚠️ 对手已断线";
        setTimeout(()=>{resetToLobby();},2000);
      }
      break;
    case "restart_request":
      showMsg("🔄 对手请求重新开始");
      break;
  }
}

/* ---- Screens ---- */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  document.getElementById("screen-"+id).classList.add("active");
}

function showCountdown(n){
  const ov=document.getElementById("countdown-overlay");
  ov.classList.remove("hidden");
  document.getElementById("countdown-num").textContent=n;
}
function hideCountdown(){
  document.getElementById("countdown-overlay").classList.add("hidden");
}

function showMsg(txt){
  const el=document.getElementById("game-msg");
  el.textContent=txt;
  setTimeout(()=>{if(el.textContent===txt)el.textContent="";},2000);
}

/* ---- Start playing ---- */
function startPlaying(){
  NET.playing=true;
  G.over=false;G.paused=false;G.running=true;
  initBoard();
  G.bag=[];refillBag();
  G.next=null;G.hold=null;G.canHold=true;
  G.score=0;G.lines=0;G.level=1;G.dropInterval=1000;G.dropTimer=0;G.lastTime=0;
  document.getElementById("my-score").textContent="0";
  document.getElementById("my-lines").textContent="0";
  document.getElementById("my-level").textContent="1";
  document.getElementById("game-over-overlay").classList.add("hidden");
  document.getElementById("game-msg").textContent="";
  spawn();
  if(!animId){loop();}
}

function resetToLobby(){
  G.running=false;NET.playing=false;
  if(animId){cancelAnimationFrame(animId);animId=null;}
  net.close();
  NET.pid=null;NET.room=null;NET.opponentName="";
  showScreen("lobby");
}

/* ---- Main loop ---- */
function loop(){
  gameTick();
  render();
  animId=requestAnimationFrame(loop);
}

/* ---- Input ---- */
document.addEventListener("keydown",e=>{
  if(!G.running||G.paused||G.over)return;
  switch(e.key){
    case "ArrowLeft":tryMove(-1,0);break;
    case "ArrowRight":tryMove(1,0);break;
    case "ArrowDown":if(tryMove(0,1))G.score+=1;document.getElementById("my-score").textContent=G.score;break;
    case "ArrowUp":case "x":case "X":tryRotate(1);break;
    case "z":case "Z":tryRotate(-1);break;
    case " ":e.preventDefault();hardDrop();G.score+=2;document.getElementById("my-score").textContent=G.score;break;
    case "c":case "C":doHold();break;
    case "p":case "P":
      G.paused=!G.paused;
      document.getElementById("pause-overlay").classList.toggle("hidden",!G.paused);
      break;
  }
});

/* ---- Lobby buttons ---- */
document.addEventListener("DOMContentLoaded",()=>{
  myCanvas=document.getElementById("my-canvas");myCtx=myCanvas.getContext("2d");
  oppCanvas=document.getElementById("opp-canvas");oppCtx=oppCanvas.getContext("2d");
  nextCanvas=document.getElementById("next-canvas");nextCtx=nextCanvas.getContext("2d");
  holdCanvas=document.getElementById("hold-canvas");holdCtx=holdCanvas.getContext("2d");

  document.getElementById("btn-create").addEventListener("click",async()=>{
    const name=document.getElementById("inp-name").value.trim()||"玩家1";
    const r=await fetch("/api/create",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
    const d=await r.json();
    if(d.ok){
      NET.pid=d.pid;NET.room=d.room;
      document.getElementById("room-code-display").textContent=d.room;
      showScreen("waiting");
      net.connect(d.pid);
    }else{
      document.getElementById("lobby-status").textContent=d.err||"创建失败";
    }
  });

  document.getElementById("btn-join").addEventListener("click",async()=>{
    const name=document.getElementById("inp-name").value.trim()||"玩家2";
    const room=document.getElementById("inp-room").value.trim().toUpperCase();
    if(!room||room.length!==6){document.getElementById("lobby-status").textContent="请输入6位房间码";return;}
    const r=await fetch("/api/join",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({room,name})});
    const d=await r.json();
    if(d.ok){
      NET.pid=d.pid;NET.room=d.room;NET.opponentName=d.opponent;
      showScreen("game");
      document.getElementById("opp-name").textContent=d.opponent;
      net.connect(d.pid);
    }else{
      document.getElementById("lobby-status").textContent=d.err||"加入失败";
    }
  });

  document.getElementById("btn-cancel").addEventListener("click",()=>{resetToLobby();});
  document.getElementById("btn-restart").addEventListener("click",()=>{
    document.getElementById("game-over-overlay").classList.add("hidden");
    net.post("restart",{});
  });
  document.getElementById("btn-exit").addEventListener("click",()=>{resetToLobby();});

  // Enter key on room input
  document.getElementById("inp-room").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("btn-join").click();});
});
