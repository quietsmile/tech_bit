(function(){
'use strict';
const $=id=>document.getElementById(id);
const els={
 setup:$('setup'),game:$('game'),result:$('result'),playerSetup:$('playerSetup'),playerCount:$('playerCount'),durationInput:$('durationInput'),startBtn:$('startBtn'),
 battleCanvas:$('battleCanvas'),wheelCanvas:$('wheelCanvas'),battleMsg:$('battleMsg'),timeLeft:$('timeLeft'),waveNum:$('waveNum'),totalKills:$('totalKills'),escaped:$('escaped'),
 modeLabel:$('modeLabel'),
 playerTabs:$('playerTabs'),controlledName:$('controlledName'),coins:$('coins'),level:$('level'),unitCount:$('unitCount'),kills:$('kills'),damage:$('damage'),
 spinBtn:$('spinBtn'),upgradeBtn:$('upgradeBtn'),inventory:$('inventory'),ranking:$('ranking'),pauseBtn:$('pauseBtn'),
 tenBtn:$('tenBtn'),tenResult:$('tenResult'),tenList:$('tenList'),tenClose:$('tenClose'),
 probabilityLegend:$('probabilityLegend'),
 placingName:$('placingName'),
 result:$('result'),champion:$('champion'),finalRanking:$('finalRanking'),restartBtn:$('restartBtn'),resultHome:$('resultHome')
};
const COLORS=['#38bdf8','#f472b6','#4ade80','#facc15'];
let players=[],battle=null,wheel=null,selected=0,running=false,paused=false,timeLeft=180,lastTs=null,wheelBusy=false,resultShown=false,debugLoops=0;
let networkMode=false,networkSeat=-1,networkArena=null,lastNetworkRoster=null,lastNetworkDuration=180;
let lastNetworkMode='pk';
const aiTimers=new Map();
let lastInventoryKey='';
let placingIndex=null;

function buildSetup(){
 els.playerSetup.innerHTML='';
 const n=Number(els.playerCount.value);
 for(let i=0;i<n;i++){
  const row=document.createElement('div');row.className='setup-row';
  row.innerHTML=`<input data-name maxlength="12" value="玩家${i+1}"><select data-type><option value="human">人类</option><option value="ai" ${i?'selected':''}>AI</option></select>`;
  els.playerSetup.appendChild(row);
 }
}
function makePlayer(i,type='human'){
 return {idx:i,name:$('.setup-row [data-name]',undefined)?.value||'',type,color:COLORS[i],lane:i,coins:CONFIG.startCoins,level:1,
   score:0,kills:0,damage:0,inventory:[],deployed:0,spins:0,aiCd:1+Math.random()};
}
function startGame(options={}){
 const mode=options.mode==='coop'?'coop':'pk';
 if(options.players&&options.players.length){
  networkMode=true;networkSeat=Number(options.seat)||0;
  lastNetworkRoster=options.players.slice();
  lastNetworkDuration=Math.max(60,Math.min(600,Number(options.duration)||180));
  lastNetworkMode=mode;
  players=options.players.map((item,i)=>{
   const p=makePlayer(i,'human');
   p.name=item.name||`玩家${i+1}`;
   p.seat=Number(item.seat);
   return p;
  });
  selected=Math.max(0,players.findIndex(p=>p.seat===networkSeat));
  }else{
  networkMode=false;networkSeat=-1;
  lastNetworkMode=mode;
  const rows=[...els.playerSetup.querySelectorAll('.setup-row')];
  players=rows.map((row,i)=>{const p=makePlayer(i,'human');p.name=row.querySelector('[data-name]').value.trim()||`玩家${i+1}`;return p;});
  timeLeft=Math.max(60,Math.min(600,Number(els.durationInput.value)||180));
 }
 timeLeft=Math.max(60,Math.min(600,Number(options.duration)||lastNetworkDuration));
 running=true;paused=false;resultShown=false;wheelBusy=false;
 if(!networkMode)selected=0;
 lastInventoryKey='';
 SFX.resume();
 battle=new Battle(els.battleCanvas,{
  onWave:(n,boss)=>{els.waveNum.textContent=n;$('battleMsg').textContent=boss?'BOSS 波来袭！':`第 ${n} 波野怪`;setTimeout(()=>{if(running)$('battleMsg').textContent='';},1800);},
  onKill:(monster,player)=>{player.kills++;player.coins+=monster.reward;render();}
 });
 wheel=new Wheel(els.wheelCanvas,{probabilities:CONFIG.tierProb[0]});
 players.forEach(p=>{p.deployed=0;const aiTimers2=undefined;});
 els.setup.classList.add('hidden');els.result.classList.add('hidden');els.game.classList.remove('hidden');
 renderTabs();renderProbabilityLegend();render();updateHUD();
}
function controlled(){return players[selected];}
function renderTabs(){
 els.playerTabs.innerHTML='';
 players.forEach((p,i)=>{
  const btn=document.createElement('button');btn.className='player-tab'+(i===selected?' active':'');btn.type='button';
  btn.textContent=`${p.name}${p.type==='ai'?' · AI':''}${networkMode&&i===selected?' · 我':''}`;
  if(!networkMode)btn.onclick=()=>{selected=i;renderTabs();renderProbabilityLegend();render();};
  else btn.disabled=true;
  els.playerTabs.appendChild(btn);
 });
}
function autoPlaceReward(p,item,index,rewardIndex){
 const column=rewardIndex%8;
 const row=Math.floor(rewardIndex/8);
 const x=130+column*95+(Math.random()*26-13);
 const y=100+row*72+(Math.random()*24-12);
 return placeItem(p,index,x,y);
}
function placeItem(p,index,x,y){
 const item=p.inventory[index];if(!item)return false;
 const point=battle.clampUnit(x,y);
 if(item.unit){
  battle.moveUnit(item.unit,point.x,point.y);
 }else{
  item.unit=battle.addUnit(p,item,point.x,point.y);
  item.deployed=true;p.deployed++;
 }
 placingIndex=null;renderInventory();
 return true;
}
function spin(p){
 return spinCount(p,1);
}
function spinTen(p){return spinCount(p,10);}
function spinCount(p,count){
 count=Math.max(1,Math.min(10,Math.floor(count)||1));
 const cost=CONFIG.spinCost*count;
 if(!running||paused||wheelBusy||p.coins<cost)return false;
 p.coins-=cost;p.spins+=count;wheelBusy=true;
 const rewards=Array.from({length:count},()=>drawOne(p));
 const bestTier=Math.max(...rewards.map(item=>item.tier));
 wheel.spin(bestTier,count>1?3800:3400,()=>{
  wheelBusy=false;finishRewards(p,rewards);
  if(count>1)showTenResult(p,rewards);
  else $('battleMsg').textContent=`${p.name} 抽中【${CONFIG.tierNames[rewards[0].tier]}】${rewards[0].name}`;
 });
 return true;
}
function drawOne(p){
 const tier=pickTier(p.level), base=pickItem(tier);
 return {...base,id:'draw-'+p.idx+'-'+p.spins+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),tier,tierName:CONFIG.tierNames[tier]};
}
function finishRewards(p,rewards){
 rewards.forEach((item,rewardIndex)=>{
  p.inventory.push(item);
  autoPlaceReward(p,item,p.inventory.length-1,rewardIndex);
 });
 p.coins=Math.round(p.coins);SFX.coin();SFX.levelUp();
 renderInventory();render();
}
function showTenResult(p,rewards){
 els.tenResult.classList.remove('hidden');
 els.tenResult.classList.toggle('tier-3',rewards.some(item=>item.tier>=3));
 els.tenList.innerHTML=rewards.map(item=>`
  <div><span class="tier-name" style="color:${CONFIG.tierColors[item.tier]}">${CONFIG.tierNames[item.tier]}</span><span>${item.name}</span></div>
 `).join('');
}
function upgrade(p){
 const cost=CONFIG.levelUpCost(p.level);
 if(!running||paused||p.level>=CONFIG.maxLevel||p.coins<cost)return false;
 p.coins-=cost;p.level++;if(wheel)wheel.setProbabilities(CONFIG.tierProb[p.level-1]);SFX.levelUp();render();renderProbabilityLegend();return true;
}
function renderProbabilityLegend(){
 const player=controlled();
 const level=player?player.level:1;
 const probabilities=CONFIG.tierProb[Math.min(Math.max(level,1),CONFIG.maxLevel)-1];
 els.probabilityLegend.innerHTML=CONFIG.tierNames.map((name,index)=>{
  const percent=Math.round(probabilities[index]*1000)/10;
  return `<div class="${index>=2?'rare':''}"><span style="color:${CONFIG.tierColors[index]}">●</span> ${name} · ${percent}%</div>`;
 }).join('');
}
function renderInventory(){
 const p=controlled();if(!p)return;
 const invKey=p.idx+':'+JSON.stringify(p.inventory.map(item=>[item.name,item.tier,item.sell,item.kind,item.deployed,!!item.unit]));
 if(invKey!==lastInventoryKey){
  lastInventoryKey=invKey;
  els.inventory.innerHTML=p.inventory.map((item,index)=>`
   <div>
    <span>${CONFIG.tierColors[item.tier]}● ${item.name}${item.unit?' · ⚔️':''}</span>
    <span class="inventory-actions">
     <button data-place="${index}">${item.unit?'移动':'放置'}</button>
     <button data-i="${index}">卖</button>
    </span>
   </div>`).join('');
 }
}
function sellItem(p,index){
 const item=p.inventory[index];if(!item)return;
 if(item.unit)battle.removeUnit(item.unit);
 p.inventory.splice(index,1);p.coins+=item.sell;
 p.deployed=Math.max(0,p.deployed-1);
 SFX.coin();renderInventory();render();
}
function canvasPoint(event){
 const rect=els.battleCanvas.getBoundingClientRect();
 return {
  x:(event.clientX-rect.left)*els.battleCanvas.width/rect.width,
  y:(event.clientY-rect.top)*els.battleCanvas.height/rect.height
 };
}
function updateAI(p,dt){
 if(p.type!=='ai')return;
 p.aiCd-=dt;if(p.aiCd>0||wheelBusy)return;
 p.aiCd=.8+Math.random()*1.2;
 const cost=CONFIG.levelUpCost(p.level);
 if(p.level<CONFIG.maxLevel&&p.coins>=cost+CONFIG.spinCost+30){upgrade(p);return;}
 if(p.coins>=CONFIG.spinCost){spin(p);return;}
 if(p.inventory.length&&p.coins<CONFIG.spinCost){const cheap=[...p.inventory].sort((a,b)=>a.sell-b.sell)[0];sellItem(p,p.inventory.indexOf(cheap));}
}
function loop(ts){
 if(lastTs==null)lastTs=ts;
 let dt=Math.min(.05,(ts-lastTs)/1000);lastTs=ts;
 if(running&&!paused&&!wheel&&false){}
 if(running&&!paused){
 if(wheel)wheel.update(dt);
  battle.update(dt);timeLeft=Math.max(0,timeLeft-dt);
  players.forEach(p=>updateAI(p,dt));
  updateHUD();render();
  if(timeLeft<=0)endGame();
 }else if(wheel){wheel.update(0);}
}
function updateHUD(){
 els.timeLeft.textContent=Math.ceil(timeLeft);els.waveNum.textContent=battle?battle.wave:0;
 els.totalKills.textContent=battle?battle.totalKills:0;els.escaped.textContent=battle?battle.escaped:0;
 const p=controlled();if(!p)return;
 p.score=Math.round(p.kills*100+p.damage);
 els.controlledName.textContent=`${p.name}${p.type==='ai'?' · AI':''}`;
 els.coins.textContent=Math.round(p.coins);els.level.textContent=p.level;
 els.unitCount.textContent=battle?battle.unitsOf(p).length:0;els.kills.textContent=p.kills;els.damage.textContent=Math.round(p.damage);
 els.spinBtn.disabled=!!(wheelBusy||!running||paused||p.coins<CONFIG.spinCost);
 els.tenBtn.disabled=!!(wheelBusy||!running||paused||p.coins<CONFIG.spinCost*10);
 els.upgradeBtn.disabled=!!(wheelBusy||!running||paused||p.level>=CONFIG.maxLevel||p.coins<CONFIG.levelUpCost(p.level));
 els.spinBtn.textContent=wheelBusy?'🎰 转盘旋转中…':`🎰 抽奖（${CONFIG.spinCost}金）`;
 els.tenBtn.textContent=wheelBusy?'🌟 10连抽旋转中…':`🌟 10连抽（${CONFIG.spinCost*10}金）`;
 els.upgradeBtn.textContent=p.level>=CONFIG.maxLevel?'⬆️ 奖池已满级':`⬆️ 升级奖池（${CONFIG.levelUpCost(p.level)}金）`;
 const remote=new Map();
 if(networkMode&&networkArena&&typeof networkArena.players==='function'){
  networkArena.players().forEach(item=>remote.set(Number(item.seat),item.progress||{}));
 }
 const sorted=players.map(p=>{
  const progress=networkMode?remote.get(p.seat)||{}:{};
  const isSelf=!networkMode||p.seat===networkSeat;
  return {
   name:p.name,
   kills:isSelf?p.kills:Math.max(0,Number(progress.kills)||0),
   damage:isSelf?p.damage:Math.max(0,Number(progress.damage)||0)
  };
 }).sort((a,b)=>b.damage-a.damage||b.kills-a.kills);
 els.modeLabel.textContent=lastNetworkMode==='coop'?'合作':'PK';
 els.ranking.innerHTML=sorted.map((p,i)=>`<li>${i+1}. ${p.name} · 总伤害 ${Math.round(p.damage)} · ${p.kills}杀</li>`).join('');
}
function render(){if(battle)battle.render();if(wheel)wheel.draw();}
function endGame(){
 if(resultShown)return;
 resultShown=true;running=false;wheelBusy=false;SFX.gameEnd();
 els.game.classList.add('hidden');els.result.classList.remove('hidden');
 const showResult=()=>{
  const remote=new Map();
  if(networkMode&&networkArena&&typeof networkArena.players==='function'){
   networkArena.players().forEach(item=>remote.set(Number(item.seat),item.progress||{}));
  }
  players.forEach(p=>{
   if(!networkMode||p.seat===networkSeat)return;
   const progress=remote.get(p.seat)||{};
   p.kills=Math.max(0,Number(progress.kills)||0);
   p.damage=Math.max(0,Number(progress.damage)||0);
   p.score=Math.max(0,Number(progress.score)||0);
  });
  const sorted=[...players].sort((a,b)=>b.damage-a.damage||b.kills-a.kills);
  if(lastNetworkMode==='coop'){
   const success=(battle?battle.totalKills:0)>=(battle?battle.escaped:0);
   els.champion.textContent=success
    ?`🤝 合作防守成功！总击杀 ${battle?battle.totalKills:0}，逃脱 ${battle?battle.escaped:0}`
    :`😮 合作防守失败！总击杀 ${battle?battle.totalKills:0}，逃脱 ${battle?battle.escaped:0}`;
  }else{
   const champion=sorted[0];
   els.champion.textContent=`🏆 ${champion.name} 获得称号：野怪终结者`;
   try{localStorage.setItem('lottery_tower_champion',champion.name);}catch(e){}
  }
  els.finalRanking.innerHTML=sorted.map((p,i)=>`<li>${i+1}. ${p.name} — 总伤害 ${Math.round(p.damage)} / ${p.kills}杀 / ${p.score}分</li>`).join('');
 };
 const finalize=async()=>{
  try{
   if(networkArena&&networkArena.pushProgress)await networkArena.pushProgress();
   if(networkArena&&networkArena.refresh)await networkArena.refresh();
  }catch(e){}
  showResult();
 };
 finalize();
}
buildSetup();
 els.tenBtn.addEventListener('click',()=>spinTen(controlled()));
 els.tenClose.addEventListener('click',()=>els.tenResult.classList.add('hidden'));
els.inventory.addEventListener('click',event=>{
 const place=event.target.closest('button[data-place]');
 if(place){
  placingIndex=Number(place.dataset.place);
  renderInventory();
  $('battleMsg').textContent='点击战场位置放置炮塔';
  return;
 }
 const sell=event.target.closest('button[data-i]');
 if(sell) sellItem(controlled(),Number(sell.dataset.i));
});
els.battleCanvas.addEventListener('click',event=>{
 const point=canvasPoint(event);
 const unit=battle.unitAt(point.x,point.y,controlled());
 if(!unit){
  if(placingIndex!=null)placeItem(controlled(),placingIndex,point.x,point.y);
  return;
 }
 if(unit.owner!==controlled())return;
 const index=controlled().inventory.findIndex(item=>item.unit===unit);
 if(index>=0)placingIndex=index;
 renderInventory();
});
els.spinBtn.addEventListener('click',()=>spin(controlled()));
els.upgradeBtn.addEventListener('click',()=>upgrade(controlled()));
els.pauseBtn.addEventListener('click',()=>{if(!battle)return;paused=!paused;els.pauseBtn.textContent=paused?'继续':'暂停';});
els.restartBtn.addEventListener('click',()=>{
 els.result.classList.add('hidden');
 if(lastNetworkRoster)startGame({players:lastNetworkRoster,seat:networkSeat,duration:lastNetworkDuration,mode:lastNetworkMode});
 else startGame();
});
els.resultHome.addEventListener('click',()=>location.href='../index.html');
setInterval(()=>{loop(performance.now());},16);

 networkArena=ChallengeArena.create({
 gameId:'lottery-td',
 gameName:'抽奖塔防大作战',
 allowRename:false,
 randomName(){
  const heads=['闪电','旋风','彩虹','开心','无敌','勇敢','飞毛腿','神秘','暖暖','超级','小小','威武'];
  const tails=['小老虎','小飞龙','猎豹','小熊猫','企鹅','小狮子','海豚','小飞侠','星星','小恐龙','奥特曼','小蜜蜂'];
  const head=heads[Math.floor(Math.random()*heads.length)];
  const tail=tails[Math.floor(Math.random()*tails.length)];
  return (head+(head.endsWith('小')&&tail.startsWith('小')?tail.slice(1):tail)).slice(0,14);
 },
 autoJoin:true,
 renderLobbySettings(container,state,isHost){
  container.innerHTML=`
   <div class="arena-setting">
    <label>对战模式</label>
    <select id="tdLobbyMode">
     <option value="pk" ${lastNetworkMode==='pk'?'selected':''}>PK模式 · 比个人伤害</option>
     <option value="coop" ${lastNetworkMode==='coop'?'selected':''}>合作模式 · 共同防守</option>
    </select>
   </div>
   <div class="arena-setting">
    <label>对局时长（秒）</label>
    <input id="tdLobbyDuration" type="number" min="60" max="600" step="30" value="${lastNetworkDuration}">
    <div class="arena-setting-note">所有玩家均为真人；人数满足后自动开始。</div>
   </div>`;
  const input=container.querySelector('#tdLobbyDuration');
  input.addEventListener('change',()=>{lastNetworkDuration=Math.max(60,Math.min(600,Number(input.value)||180));});
  const mode=container.querySelector('#tdLobbyMode');
  mode.addEventListener('change',()=>{lastNetworkMode=mode.value==='coop'?'coop':'pk';});
 },
 getTargetConfig(){return {duration:lastNetworkDuration,mode:lastNetworkMode};},
 onBegin(data){
  const source=(data.state&&data.state.players?data.state.players:[]).filter(p=>p.connected);
  const target=(data.state&&data.state.targetPlayers)||source.length;
  const roster=source.slice(0,target).map((p,i)=>({name:p.name,seat:p.seat}));
  if(!roster.some(p=>p.seat===data.seat))roster.push({name:data.name,seat:data.seat});
  startGame({
   players:roster,seat:data.seat,
   duration:data.state&&data.state.config&&data.state.config.duration,
   mode:data.state&&data.state.config&&data.state.config.mode
  });
 },
 getProgress(){
  const p=controlled();
  return {
   status:running?'playing':'finished',score:Math.round(p?p.score:0),
   level:p?p.level:1,kills:p?p.kills:0,damage:Math.round(p?p.damage:0),mode:lastNetworkMode
  };
 },
 onRestart(){
  if(lastNetworkRoster)startGame({players:lastNetworkRoster,seat:networkSeat,duration:lastNetworkDuration,mode:lastNetworkMode});
 }
});

window.LotteryTD={get players(){return players},get battle(){return battle},get wheel(){return wheel},get debugLoops(){return debugLoops},get running(){return running},get paused(){return paused},get timeLeft(){return timeLeft},get battleTime(){return battle?battle.time:0},get anim(){return wheel&&wheel._anim?{t:wheel._anim.t,dur:wheel._anim.dur}:null},get wheelCounts(){return {hasUpdate:!!Wheel.prototype.update,updateSource:Wheel.prototype.update?Wheel.prototype.update.toString().slice(0,240):null,countType:typeof Wheel.updateCount,updates:Wheel.updateCount,ctor:Wheel.name}}};
})();
