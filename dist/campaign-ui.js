import { Campaign, SHOP_CATALOG } from './campaign.js';
import { Game } from './engine.js';
import { icon } from './icons.js';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const names = {information:'侦察',burst:'蓄势',defense:'防御',pressure:'压制'};
const marks = {radar:'◎',anchor:'⚓',break:'↯',battery:'ϟ',scout:'◉',belt:'▱'};
const KEY = 'flip-club-campaign-v1';
export function mountCampaign(hooks) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch {}
  const campaign = Campaign.fromState(saved.campaign);
  let mode = saved.mode === 'free' ? 'free' : 'campaign';
  let view = saved.view === 'battle' ? 'battle' : 'map';
  let owned = false, freeSession = null, battleId = campaign.state.activeBattle?.battleId || campaign.state.lastBattle?.battleId || null, result = campaign.state.lastBattle || null;
  let persistedGame = saved.game || null, persistedElapsed = Number(saved.elapsed) || 0;
  let storageWarned = false;
  function restoreBattle() {
    if (!persistedGame) throw new Error('Missing battle');
    const restored = Game.fromState(persistedGame);
    const expected = campaign.state.activeBattle?.battleId || campaign.state.lastBattle?.battleId;
    if (!expected || restored.state.battleId !== expected) throw new Error('Foreign battle');
    hooks.loadGame(restored,persistedElapsed,true); owned=true; battleId=expected;
  }
  function persist() {
    if (owned) { persistedGame = hooks.getGame().exportState(); persistedElapsed = hooks.getElapsed(); }
    try { localStorage.setItem(KEY, JSON.stringify({ campaign:campaign.exportState(),mode,view,battleId,result,game:persistedGame,elapsed:persistedElapsed })); }
    catch { if (!storageWarned) { storageWarned = true; hooks.toast('浏览器存储不可用，闯关进度暂时仅保留在当前页面。'); } }
  }
  function route() {
    document.querySelectorAll('[data-play-mode]').forEach(b => {b.classList.toggle('selected', b.dataset.playMode===mode);b.setAttribute('aria-pressed',String(b.dataset.playMode===mode));});
    const hub = mode==='campaign' && view==='map';
    $('.game-setup').hidden = mode==='campaign';
    $('.arena-layout').hidden = hub;
    $('.how-it-works').hidden = hub;
    $('#campaign-hub').hidden = !hub;
    $('#campaign-battle-bar').hidden = !(mode==='campaign' && view==='battle');
    $('#campaign-wallet').hidden = mode!=='campaign';
    $('#settings-button').title = mode==='campaign' ? '回到关卡与补给' : '对局设置';
    $('#campaign-wallet').textContent = `◈ ${campaign.state.coins} 金币`;
    if (hub) renderHub();
    if (mode==='campaign' && view==='battle') {
      const stage = campaign.state.activeBattle?.stage || campaign.state.lastBattle?.stage || campaign.state.stage;
      $('#campaign-battle-bar').innerHTML = `<button data-campaign-action="map">← 关卡地图</button><span>第 ${stage} 关 <i>·</i> 连中两组后换人 <i>·</i> 每次尝试恢复能量</span><b>◈ ${campaign.state.coins}</b>`;
    }
  }
  function renderLoadout() {
    return `<div class="loadout-label"><strong>下场装配</strong><span>${campaign.state.equipped.length} / ${campaign.loadoutCapacity} 槽</span></div><div class="loadout-items">${SHOP_CATALOG.filter(i=>i.type==='consumable').map(item=>{
      const selected=campaign.state.equipped.includes(item.toolId), stock=campaign.state.inventory[item.toolId]||0;
      const disabled=!!campaign.state.activeBattle || (!selected && (!stock || campaign.state.equipped.length>=campaign.loadoutCapacity));
      return `<button data-equip="${item.toolId}" ${disabled?'disabled':''} class="${selected?'selected':''}" aria-pressed="${selected}"><span>${marks[item.id]}</span>${item.name}<small>库存 ${stock}</small>${selected?'<b>✓</b>':''}</button>`;
    }).join('')}</div><p class="loadout-note">开局时，每种已装配补给消耗 1 份，未使用不返还。无需补给也能挑战。</p>`;
  }
  function renderHub() {
    const p=campaign.getStageProfile(), s=campaign.state, active=!!s.activeBattle;
    const policy=Object.entries(p.policy||{}).sort((a,b)=>b[1]-a[1]);
    const first=Math.max(1,p.stage-2);
    $('#campaign-hub').innerHTML = `<div class="campaign-hero"><div class="chapter-card"><p class="eyebrow">THE MEMORY ASCENT / 无尽记忆之旅</p><div class="chapter-heading"><div><span class="chapter-kicker">${active?'未完成的挑战':p.boss?'守关挑战':'下一场挑战'}</span><h2>第 <em>${p.stage}</em> 关</h2></div><span class="chapter-art">${icon('bot',68)}<i>✦</i></span></div><p class="chapter-description">${esc(p.description)}</p><div class="stage-path">${Array.from({length:7},(_,i)=>{const n=first+i;return `<div class="stage-node ${n<p.stage?'complete':n===p.stage?'current':'locked'}"><span>${n<p.stage?'✓':n}</span><small>${n<p.stage?'已过关':n===p.stage?'当前':'待挑战'}</small></div>`;}).join('')}</div><div class="chapter-actions"><button class="primary-button" data-campaign-action="start">${active?'继续未完对局':`挑战第 ${p.stage} 关`} <span>↗</span></button><button class="secondary-button" data-campaign-action="shop" ${!campaign.shopUnlocked||active?'disabled':''}>${campaign.shopUnlocked?'关间补给站':'首胜后解锁商城'}</button></div><p class="chapter-footnote">胜利可得 ${90+Math.min(210,p.stage*10)} 金币 · 平局或失败可重试 · 进度自动保存</p></div><div class="opponent-dossier"><p class="eyebrow">AN OPPONENT THAT GROWS</p><div class="dossier-title"><h3>与你一起，越战越强。</h3><span>策略学习</span></div><div class="strength-number">${Number(p.strength).toFixed(1)}<small>/ 100</small></div><div class="strength-track"><i style="width:${Math.min(100,p.strength)}%"></i></div><div class="profile-metrics"><span>记忆容量<b>${p.memoryCapacity} 张</b></span><span>记忆保留<b>${Math.round(p.retention*100)}%</b></span><span>学习对局<b>${s.learning.games} 场</b></span><span>当前阶段<b>${esc(p.rank)}</b></span></div><p class="learning-copy">每一关细致提升记忆与判断。每次交手后，根据真实道具收益更新侦察、蓄力、防御与压制偏好。</p><div class="policy-bars">${policy.map(([key,value])=>`<div><span>${names[key]||key}</span><i><b style="width:${Math.max(0,Math.min(100,value*100))}%"></b></i><small>${Math.round(value*100)}%</small></div>`).join('')}</div><p class="learning-footnote">本地统计与探索策略学习 · 不读取暗牌 · 不进行神经网络训练</p></div></div><div class="campaign-bottom"><section class="loadout-panel">${renderLoadout()}</section><div class="tactics-primer"><span>✧</span><div><h3>有优势，也留得住反击。</h3><p>护盾挡干扰，破盾破防线；蓄势有上限，冷却有取舍。记忆之外，选对出手时机。</p></div></div></div>`;
  }
  function renderShop() {
    $('#shop-content').innerHTML = `<div class="shop-intro"><p>把这场胜利，变成下一场的不同打法。</p><strong>◈ ${campaign.state.coins} <small>金币</small></strong></div><div class="shop-grid">${SHOP_CATALOG.map(item=>{
      const amount=item.type==='consumable'?campaign.state.inventory[item.toolId]:campaign.state.upgrades[item.id];
      const maxed=amount>=item.max;
      return `<article class="shop-item"><div class="shop-item-top"><span>${marks[item.id]}</span><small>${item.type==='consumable'?'消耗补给':'永久升级'}</small></div><h3>${item.name}</h3><p>${esc(item.description)}</p><div class="shop-item-buy"><small>${item.type==='consumable'?`库存 ${amount}/${item.max}`:maxed?'已升级':'未拥有'}</small><button data-buy="${item.id}" ${!campaign.canPurchase(item.id)?'disabled':''}>${maxed?'已达上限':`购买 · ${item.price} ◈`}</button></div></article>`;
    }).join('')}</div><div class="shop-loadout">${renderLoadout()}</div><div class="shop-footer"><p>只使用对局金币 · 消耗道具还需在战斗中支付能量</p><button class="primary-button" data-campaign-action="shop-next">准备好了，挑战下一关 ↗</button></div>`;
  }
  function showShop() {
    if (!campaign.openShop()) {hooks.toast(campaign.shopUnlocked?'本场结束后再来补给。':'赢下第一关，解锁补给站。');return;}
    renderShop();$('#shop-dialog').showModal();persist();route();
  }
  function showHub() {
    if (mode!=='campaign') return;
    hooks.freeze();view='map';campaign.openMap();route();persist();
  }
  function start() {
    if (campaign.state.activeBattle) {
      if (!owned) {try {restoreBattle();}catch {campaign.abortBattle(campaign.state.activeBattle.battleId);persistedGame=null;}}
      if (owned) {view='battle';route();hooks.resume();persist();return;}
    }
    const battle=campaign.startBattle();if (!battle) return;
    owned=true;battleId=battle.battleId;result=null;view='battle';
    hooks.loadGame(new Game(battle.options),0,false);route();hooks.start();persist();
  }
  function switchMode(next) {
    if (next===mode) return;
    if (next==='campaign') {freeSession={game:hooks.getGame().exportState(),elapsed:hooks.getElapsed(),paused:hooks.isPaused()};hooks.freeze();mode=next;view='map';owned=false;if(campaign.state.activeBattle){try{restoreBattle();}catch{campaign.abortBattle(campaign.state.activeBattle.battleId);persistedGame=null;}}}
    else {persist();hooks.freeze();mode='free';owned=false;if(freeSession){hooks.loadGame(Game.fromState(freeSession.game),freeSession.elapsed,freeSession.paused);}else hooks.newFreeGame();}
    route();persist();
  }
  function retry() {
    const perform=()=>{if(campaign.state.activeBattle)campaign.abortBattle(campaign.state.activeBattle.battleId);result=null;owned=false;persistedGame=null;start();};
    if (campaign.state.activeBattle) hooks.confirm('放弃本局并重试？','本局已装配的补给不会返还，关卡和金币保留。',perform);else perform();
  }
  const api={
    isCampaign:()=>mode==='campaign', isBattle:()=>mode==='campaign'&&owned,
    beforeRender(game){if(mode==='campaign'&&owned&&game.state.status==='finished'&&campaign.state.activeBattle){const settled=campaign.settleBattle(battleId,game.state);if(settled?.accepted)result=settled;}},
    afterRender(){route();persist();}, showHub,retry,
    handleAction(action){if(action==='campaign-shop')showShop();else if(action==='campaign-map')showHub();else if(action==='campaign-retry')retry();else return false;return true;},
    resultOverlay(){if(mode!=='campaign'||!owned||hooks.getGame().state.status!=='finished')return null;const r=result||campaign.state.lastBattle||{};const win=r.outcome==='win';return `<div class="overlay-card campaign-result"><span class="overlay-symbol">${icon(win?'trophy':'refresh',28)}</span><h3>${win?'过关！下一站，更强的自己。':r.outcome==='tie'?'平分秋色，再试一次。':'这次失利，也是下一次的线索。'}</h3><p>${win?`获得 ${r.reward||0} 金币 · 第 ${campaign.state.stage} 关已开启`:'保留关卡与金币，重新选择你的战术'}<br>对手已学习 ${campaign.state.learning.games} 场 · 策略偏好已更新</p><div class="result-scores">${hooks.getGame().state.players.map(p=>`<span>${esc(p.name)} <b>${p.score}</b></span>`).join('')}</div><button class="primary-button" data-action="${win?'campaign-shop':'campaign-retry'}">${win?'前往补给站':'再战本关'} ↗</button><button class="plain-button small" data-action="campaign-map">返回关卡地图</button></div>`;},
  };
  document.querySelectorAll('[data-play-mode]').forEach(b=>b.addEventListener('click',()=>switchMode(b.dataset.playMode)));
  document.addEventListener('click',e=>{
    const action=e.target.closest('[data-campaign-action]')?.dataset.campaignAction;
    if(action==='start')start();else if(action==='map')showHub();else if(action==='shop')showShop();else if(action==='shop-next'){$('#shop-dialog').close();start();}
    const buy=e.target.closest('[data-buy]')?.dataset.buy;if(buy&&campaign.purchase(buy)){hooks.toast('购买成功，记得在下方装配补给。');renderShop();route();persist();}
    const equip=e.target.closest('[data-equip]')?.dataset.equip;if(equip&&campaign.equip(equip)){if($('#shop-dialog').open)renderShop();route();persist();}
  });
  $('#shop-close').addEventListener('click',()=>$('#shop-dialog').close());
  if(mode==='campaign'){
    freeSession={game:hooks.getGame().exportState(),elapsed:0,paused:false};
    if(persistedGame&&(campaign.state.activeBattle||persistedGame.state?.status==='finished')){try{restoreBattle();}catch{if(campaign.state.activeBattle)campaign.abortBattle(campaign.state.activeBattle.battleId);persistedGame=null;view='map';}}
    else {if(campaign.state.activeBattle)campaign.abortBattle(campaign.state.activeBattle.battleId);view='map';}
  }
  route();persist();return api;
}
