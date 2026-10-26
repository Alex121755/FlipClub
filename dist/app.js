import { Game, TOOL_CATALOG } from './engine.js';
import { mountCampaign } from './campaign-ui.js';
import { symbol, symbolName, icon } from './icons.js';

const $ = (query) => document.querySelector(query);
const $$ = (query) => [...document.querySelectorAll(query)];
const catalog = Object.fromEntries(TOOL_CATALOG.map(tool => [tool.id, tool]));
const toolIcons = { peek:'eye',double:'double',swap:'swap',jam:'bolt',shield:'check',drain:'bolt',radar:'eye',anchor:'refresh',break:'arrow' };
let campaignController = null, pendingResetAction = null;
let saved = {};
try { saved = JSON.parse(localStorage.getItem('flip-club-settings') || '{}'); } catch {}
if (!saved || typeof saved !== 'object') saved = {};
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const difficultyLabel = { easy: '初级', normal: '标准', hard: '大师' };
function normalizeOptions(input = {}) {
  input = input && typeof input === 'object' ? input : {};
  let players = Array.isArray(input.players) && input.players.length >= 2 && input.players.length <= 8 ? input.players : input.mode === 'local'
    ? Array.from({ length: [2, 3, 4].includes(input.playerCount) ? input.playerCount : 2 }, (_, i) => ({ name: `玩家 ${i + 1}`, type: 'human' }))
    : [{ name: '玩家 1', type: 'human' }, { name: '记忆机器人', type: 'bot', difficulty: input.difficulty }];
  players = players.map((entry, i) => {
    entry = entry && typeof entry === 'object' ? entry : {};
    const type = entry.type === 'bot' ? 'bot' : 'human';
    const name = Array.from(String(entry.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()).slice(0, 16).join('') || `${type === 'bot' ? '机器人' : '玩家'} ${i + 1}`;
    return { name, type, difficulty: ['easy', 'normal', 'hard'].includes(entry.difficulty) ? entry.difficulty : 'normal' };
  });
  const mode = players.length === 2 && players[0].type === 'human' && players[1].type === 'bot' ? 'ai' : players.every(player => player.type === 'human') ? 'local' : 'custom';
  const aiStrength = ['easy', 'normal', 'hard'].includes(input.aiStrength) ? input.aiStrength : players.find(player => player.type === 'bot')?.difficulty || 'normal';
  return { size: [4, 6, 8, 10, 12].includes(input.size) ? input.size : 6, boardScale: input.boardScale === 'large' ? 'large' : 'standard', players, mode, difficulty: players[1].difficulty, aiStrength, playerCount: players.length };
}
let options = normalizeOptions(saved);
let game, paused = false, targeting = null, swapTargets = [], pending = null;
let elapsed = 0, lastTick = performance.now(), lastEventMessage = '', sound = saved.sound === true;
let audioContext, toastTimer, pendingOptions, beforeModalPaused = false, helpAutoPause = false;
let lastBoardFocus = null;
let settingsDraft = null, settingsReturnPaused = false;

const back = '<span class="tile-back"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 5 6 9-6 6-6-6Zm15 15-9 6-6-6 6-6ZM20 35l-6-9 6-6 6 6ZM5 20l9-6 6 6-6 6Z" fill="currentColor"/><circle cx="20" cy="20" r="2.2" fill="#fffdf4"/></svg></span>';
const coord = id => `${String.fromCharCode(65 + id % game.state.size)}${Math.floor(id / game.state.size) + 1}`;
const isBot = () => game.state.players[game.state.current].type === 'bot';
const humanCanAct = () => !paused && !isBot() && game.state.status === 'playing';
const active = () => !['ready', 'finished'].includes(game.state.status);
function storeSettings() { try { localStorage.setItem('flip-club-settings', JSON.stringify({ ...options, sound })); } catch {} }

function beep(type = 'flip') {
  if (!sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const notes = type === 'match' ? [523, 659, 784] : type === 'tool' ? [440, 660] : type === 'miss' ? [240, 200] : [420];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      const at = audioContext.currentTime + i * .09;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.055, at + .01); gain.gain.exponentialRampToValueAtTime(.001, at + .16);
      oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(at); oscillator.stop(at + .17);
    });
  } catch {}
}
function toast(text) {
  clearTimeout(toastTimer); $('#toast').textContent = text; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
}
function cancelScheduled() { if (pending) clearTimeout(pending.id); pending = null; }
function schedule(fn, delay) {
  cancelScheduled();
  const task = { fn, remaining: delay, due: performance.now() + delay, id: null };
  pending = task;
  if (!paused) task.id = setTimeout(() => { if (pending !== task) return; pending = null; fn(); }, delay);
}
function setPaused(value) {
  if (paused === value) return;
  updateClock();
  paused = value;
  if (pending) {
    clearTimeout(pending.id);
    if (value) pending.remaining = Math.max(0, pending.due - performance.now());
    else {
      const task = pending; task.due = performance.now() + task.remaining;
      task.id = setTimeout(() => { if (pending !== task) return; pending = null; task.fn(); }, task.remaining);
    }
  }
  lastTick = performance.now(); render();
  if (!value) drive();
}
function newGame(newOptions = options) {
  cancelScheduled(); options = normalizeOptions(newOptions); storeSettings();
  game = new Game(options); paused = false; targeting = null; swapTargets = []; lastBoardFocus = null; elapsed = 0; lastTick = performance.now();
  lastEventMessage = '棋盘就绪。今天，谁的记忆更胜一筹？';
  syncSettings(); render(); updateClock();
}
function syncSettings() {
  $$('.mode-toggle button').forEach(button => { button.classList.toggle('selected', button.dataset.mode === options.mode); button.setAttribute('aria-pressed', String(button.dataset.mode === options.mode)); });
  $('#size-select').value = options.size;
  $('#difficulty-select').value = options.difficulty;
  $('#difficulty-field').hidden = options.mode !== 'ai';
  const bots = options.players.filter(player => player.type === 'bot').length;
  const humans = options.players.length - bots;
  $('#mode-label').textContent = `${humans} 真人 · ${bots} 机器人`;
  $('#players-setup-link').textContent = `${options.players.length} 位玩家 · 编辑 ↗`;
  $('#setup-note').textContent = bots === options.players.length ? '机器人观战局' : '观察 · 记忆 · 出招';
  $('.site-shell').classList.toggle('large-board', options.boardScale === 'large');
  $('.site-shell').classList.toggle('dense-board', options.size >= 10);
  $('#scale-button').textContent = options.boardScale === 'large' ? '⤡ 标准棋盘' : '⤢ 放大棋盘';
  $('#scale-button').setAttribute('aria-pressed', String(options.boardScale === 'large'));
}
function requestReset(changes = {}) {
  const next = { ...options, ...changes };
  if (!active()) { newGame(next); return; }
  pendingOptions = next; beforeModalPaused = paused; setPaused(true);
  const changed = Object.keys(changes).length > 0;
  $('#confirm-title').textContent = changed ? '换一种玩法，重新开局？' : '重新开一局？';
  $('#confirm-copy').textContent = '当前对局的分数将清空，棋盘会重新洗牌。';
  $('#confirm-dialog').showModal();
}
function cancelReset() {
  pendingResetAction=null;pendingOptions = null; $('#confirm-dialog').close(); syncSettings();
  setPaused(beforeModalPaused);
}
function startGame() {
  if (!game.start()) return;
  lastEventMessage = `对局开始！先观察，再出招。由${game.state.players[0].name}先手。`;
  lastTick = performance.now(); beep('tool'); render();
  $('#board .tile:not(:disabled)')?.focus({ preventScroll: true });
  drive();
}

function render() {
  campaignController?.beforeRender(game);
  const s = game.snapshot(), currentPlayer = s.players[s.current];
  const focused = document.activeElement?.dataset.card;
  if (focused !== undefined) lastBoardFocus = focused;
  document.documentElement.style.setProperty('--size', s.size);
  const board = $('#board');
  board.classList.toggle('paused', paused);
  board.setAttribute('aria-label', `${s.size}乘${s.size}翻牌棋盘`);
  $('#coordinates').innerHTML = Array.from({ length: s.size }, (_, i) => `<span>${String.fromCharCode(65 + i)}</span>`).join('');
  const demo = new Map([[s.size + 1, 5], [s.size + s.size - 2, 2], [s.size * (s.size - 2) + 1, 3], [s.size * (s.size - 2) + s.size - 2, 5]]);
  board.innerHTML = s.cards.map(card => {
    const preview = s.status === 'ready' && demo.has(card.id);
    const visible = card.value !== null;
    const value = preview ? demo.get(card.id) : card.value;
    const classes = ['tile', card.matched ? 'matched' : visible || preview ? 'face-up' : '', targeting && !card.matched ? 'targeting' : '', swapTargets.includes(card.id) ? 'swap-selected' : '', (s.peekIds || [s.peek]).includes(card.id) ? 'peeked' : ''].filter(Boolean).join(' ');
    const disabled = !humanCanAct() || card.matched || s.selected.includes(card.id);
    const name = `${coord(card.id)}，${card.matched ? '已配对：' + symbolName(value) : visible ? symbolName(value) : '未翻开'}`;
    return `<button class="${classes}" data-card="${card.id}" aria-label="${name}" aria-pressed="${s.selected.includes(card.id) || swapTargets.includes(card.id)}" ${disabled ? 'disabled' : ''}><span class="tile-corner">${coord(card.id)}</span>${visible || preview ? symbol(value) : back}</button>`;
  }).join('');
  $('#pairs-count').textContent = s.matchedPairs;
  $('#pairs-total').textContent = s.cards.length / 2;
  $('#attempt-count').textContent = `${s.turns} 次尝试`;
  const indicator = $('#turn-indicator');
  indicator.className = `turn-indicator ${active() ? isBot() ? 'bot-turn' : 'active' : ''}`;
  let status = s.status === 'ready' ? '棋盘就绪，等你出招' : s.status === 'finished' ? '本局已结束 · 好记忆，好对局' : paused ? '对局已暂停' : targeting === 'peek' ? '透视：选择一张暗牌' : targeting === 'swap' ? `换位：已选 ${swapTargets.length}/2 张` : targeting === 'radar' ? `雷达：已选 ${swapTargets.length}/3 张` : catalog[targeting]?.target === 'opponent' ? '选择右侧玩家作为目标' : s.status === 'peeking' ? `${currentPlayer.name}正在透视 · 公开信息` : s.status === 'resolving' ? '看看，这两张能否配对…' : `${currentPlayer.name} · ${isBot() ? '正在思考' : s.selected.length ? '再翻一张' : '请翻牌'}`;
  if (s.multiplier > 1 && s.status === 'playing' && !paused) status += ' · 蓄力 +50%';
  indicator.innerHTML = '<i></i><span></span>';
  indicator.querySelector('span').textContent = status;
  renderOverlay(s); renderPlayers(s); renderTools(s);
  if (humanCanAct() && lastBoardFocus !== null && (focused !== undefined || document.activeElement === document.body)) {
    const same = board.querySelector(`[data-card="${lastBoardFocus}"]:not(:disabled)`);
    const next = board.querySelector(`[data-card="${Number(lastBoardFocus) + 1}"]:not(:disabled)`) || board.querySelector('.tile:not(:disabled)');
    (same || next)?.focus({ preventScroll: true });
  }
  if (s.status === 'finished') $('#board-overlay [data-action="again"]')?.focus({ preventScroll: true });
  $('#activity-message').textContent = lastEventMessage;
  $('#pause-button').disabled = !active();
  $('#pause-button').innerHTML = `${icon(paused ? 'play' : 'pause', 12)} ${paused ? '继续' : '暂停'}`;
  updateSoundButton();
  $('#tip-title').textContent = targeting ? targeting === 'peek' ? '看清一张，再走两步。' : '挪一个位置，也能改一段记忆。' : s.multiplier > 1 ? '蓄力已就位，也要留得住反击。' : '记得住，是本事。会出招，更是。';
  $('#tip-copy').textContent = targeting ? '点击棋盘选择目标，再次点击道具可取消；选牌完成前不扣能量。' : s.multiplier > 1 ? '本次配对 +50%，额外分数最多 75；失配失效。' : '干扰限制道具，护盾可以反制；能量与冷却决定出手时机。';
  const bots = s.players.filter(p => p.type === 'bot').length;
  $('#mode-label').textContent = `${s.players.length-bots} 真人 · ${bots} 机器人`;
  $('.site-shell').classList.toggle('dense-board', s.size >= 10);
  updateBoardOverflow(); campaignController?.afterRender();
}
function renderPlayers(s) {
  $('#player-cards').classList.toggle('many-players', s.players.length > 4);
  $('#player-cards').innerHTML = s.players.map((player, index) => {
    const current = s.current === index && s.status !== 'finished';
    const bot = player.type === 'bot';
    const caption = player.aiProfile ? `强度 ${player.aiProfile.strength.toFixed(1)} · 记忆 ${player.aiProfile.memoryCapacity} 张` : s.status === 'ready' ? bot ? ({ easy: '会偶尔忘记的轻松对手', normal: '能记住 12 个位置的对手', hard: '记住所有公开信息的对手' })[player.difficulty] : '你的下一张，好运正好' : s.status === 'finished' ? '本局得分' : current ? paused ? '暂停中，稍事休息' : bot ? '只依据已翻开的牌决策' : '轮到你了，下一步由你' : '观察对手，也记住线索';
    return `<div class="player-card ${current ? 'current' : ''} ${catalog[targeting]?.target === 'opponent' && index !== s.current ? 'opponent-target' : ''}" data-opponent="${index}" ${catalog[targeting]?.target === 'opponent' && index !== s.current ? `role="button" tabindex="0" aria-label="对${escapeHtml(player.name)}使用${catalog[targeting].name}"` : ''}>${player.combo > 1 && current ? `<span class="combo-badge">${player.combo} 连击！</span>` : ''}<div class="player-top"><div class="avatar">${bot ? icon('bot', 21) : ['✳', '✦', '◈', '✿'][index % 4]}</div><div class="player-identity"><div class="player-name"><span title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><small>${bot ? player.aiProfile ? '学习型' : difficultyLabel[player.difficulty] : '真人'}</small></div><p class="player-caption">${caption}</p></div><div class="player-score"><div class="score-number">${player.score}</div><small>POINTS</small></div></div><div class="player-meta">P${index + 1}<div class="energy-pips" aria-label="${player.energy}点能量，共6点">${Array.from({ length: 6 }, (_, i) => `<i class="${i < player.energy ? 'filled' : ''}"></i>`).join('')}</div><span>${player.energy}/6</span><span class="pair-meta">已配对 ${player.pairs} 组</span></div><div class="effect-tags">${player.effects?.shield ? '<span>◈ 护盾</span>' : ''}${player.effects?.jammed ? '<span class="jammed">↯ 被干扰</span>' : ''}${player.effects?.anchor ? '<span>⚓ 记忆锚</span>' : ''}${current ? `<span>连续配对 ${player.turnChain || 0}/2</span>` : ''}</div></div>`;
  }).join('');
}
function renderTools(s) {
  const player=s.players[s.current];
  const tools=TOOL_CATALOG.filter(tool=>!tool.consumable || player.inventory?.[tool.id]>0);
  $('#tool-list').classList.add('combat-tools');
  $('#tool-list').innerHTML=tools.map(tool=>{
    const availability=game.toolAvailability(tool.id);
    const disabled=!humanCanAct()||!availability.available;
    const reason=player.cooldowns?.[tool.id]>0?`冷却 ${player.cooldowns[tool.id]} 次`:tool.consumable?`补给 ${player.inventory[tool.id]} 次`:tool.cooldown?`冷却 ${tool.cooldown} 次`:'即时';
    return `<button class="tool ${targeting===tool.id?'selected':''}" data-tool="${tool.id}" ${disabled?'disabled':''} aria-pressed="${targeting===tool.id}" aria-label="${tool.name}，消耗${availability.cost}能量" title="${escapeHtml(availability.reason||tool.description)}"><span class="tool-symbol">${icon(toolIcons[tool.id],18)}</span><span><strong>${tool.name}</strong><span class="tool-description">${tool.description.split('。')[0]}</span><small class="cooldown-label">${reason}</small></span><span class="tool-cost">ϟ${availability.cost}</span></button>`;
  }).join('');
  const help=$('#tool-help');help.classList.toggle('selecting',!!targeting);
  if(targeting==='radar') help.innerHTML=`已选 ${swapTargets.length}/3 张 · <button id="confirm-target" ${!swapTargets.length?'disabled':''}>确认扫描</button> · 再点雷达取消`;
  else help.textContent=targeting ? catalog[targeting].target==='opponent'?'点击玩家面板选择目标；再点道具取消。':`请选择${targeting==='swap'?'两张':'一张'}暗牌；选牌完成前不扣能量。` : player.effects?.jammed?'受到干扰：本次只能用护盾解围，或直接翻牌。':s.toolUsed?'本次道具已使用，继续翻牌。':'每次尝试限用一种；护盾可以反制干扰和虹吸。';
}
function renderOverlay(s) {
  const overlay = $('#board-overlay');
  const campaignResult=campaignController?.resultOverlay();
  if(campaignResult){overlay.classList.add('visible');overlay.innerHTML=campaignResult;return;}
  overlay.classList.toggle('visible', s.status === 'ready' || s.status === 'finished' || paused);
  if (s.status === 'ready') {
    const bots = s.players.filter(player => player.type === 'bot').length;
    overlay.innerHTML = `<div class="overlay-card"><span class="overlay-symbol">✳</span><h3>翻开你的主场。</h3><p>${s.size} × ${s.size} 棋盘 · ${s.cards.length / 2} 组记忆挑战<br>${s.players.length - bots} 位真人 · ${bots} 位机器人，一起过过招</p><button class="primary-button" data-action="start">${bots === s.players.length ? '开始观战' : '开始对局'} <span>↗</span></button></div>`;
  } else if (s.status === 'finished') {
    const winners = s.lastEvent.winners || [];
    const headline = winners.length > 1 ? '旗鼓相当，精彩平局！' : `${s.players[winners[0]].name}，本局胜出！`;
    overlay.innerHTML = `<div class="overlay-card result"><span class="overlay-symbol">${icon('trophy', 30)}</span><h3>${escapeHtml(headline)}</h3><p>${s.turns} 次尝试 · 用时 ${formatTime(elapsed)}<br>记忆留在脑海，下一局又是新局面。</p><div class="result-scores">${s.players.map(p => `<span>${escapeHtml(p.name)} <b>${p.score}</b></span>`).join('')}</div><button class="primary-button" data-action="again">再来一局 <span>↗</span></button></div>`;
  } else if (paused) {
    overlay.innerHTML = `<div class="overlay-card"><span class="overlay-symbol">Ⅱ</span><h3>歇一会儿，灵感再来。</h3><p>棋盘和分数都在，准备好了再继续。</p><button class="primary-button" data-action="resume">继续对局 <span>↗</span></button></div>`;
  } else overlay.innerHTML = '';
}

function selectTool(type) {
  if(!humanCanAct()||!game.toolAvailability(type).available)return;
  if(targeting===type){targeting=null;swapTargets=[];render();return;}
  targeting=null;swapTargets=[];
  if(catalog[type].target==='none'){execute({type});return;}
  targeting=type;render();
  if(catalog[type].target!=='opponent')$('#board .tile:not(:disabled)')?.focus({preventScroll:true});
}
function clickCard(id) {
  if(!humanCanAct())return;
  if(targeting && catalog[targeting].target==='opponent')return;
  if(targeting==='peek'){targeting=null;execute({type:'peek',ids:[id]});return;}
  if(targeting==='swap'||targeting==='radar'){
    if(swapTargets.includes(id)){swapTargets=swapTargets.filter(i=>i!==id);render();return;}
    swapTargets.push(id);
    const max=targeting==='swap'?2:Math.min(3,game.state.cards.filter(c=>!c.matched).length);
    if(swapTargets.length<max){render();return;}
    confirmTargets();return;
  }
  execute({type:'flip',id});
}
function confirmTargets(){const type=targeting,ids=[...swapTargets];if(!ids.length)return;targeting=null;swapTargets=[];execute({type,ids});}
function resolveAttempt(){
  updateClock();game.resolve();const event=game.state.lastEvent;
  const hit=event.type==='match'||event.type==='finish';lastEventMessage=event.text;beep(hit?'match':'miss');
  if(hit)toast(`配对成功！+${event.score||event.finalMatchScore} 分${event.handoff?' · 轮到对手':''}`);
  render();if(game.state.status==='finished')celebrate();else drive();
}
function resolveScan(){game.resolvePeek();lastEventMessage='扫描结束，公开的线索也是对手的机会。';render();drive();}
function execute(action){
  if(paused)return;
  if(action.type==='flip'){
    if(!game.flip(action.id))return;beep();
    const card=game.snapshot().cards[action.id];
    lastEventMessage=`${game.state.players[game.state.current].name}翻开 ${coord(action.id)}：${symbolName(card.value)}。`;
  }else{
    if(!game.useTool(action.type,action.ids||[])){toast('目标无效，能量和补给未消耗。');render();return;}
    beep('tool');lastEventMessage=game.state.lastEvent.text;
    if(game.state.status!=='peeking')toast(lastEventMessage);
  }
  render();scheduleState();
}
function scheduleState(){
  if(game.state.status==='resolving')schedule(resolveAttempt,1000);
  else if(game.state.status==='peeking')schedule(resolveScan,1800);
  else drive();
}
function drive(){
  if(paused||pending||!isBot()||game.state.status!=='playing')return;
  schedule(()=>{const action=game.chooseAiAction();if(action)execute(action);},game.state.selected.length?750:850);
}
function loadGame(instance,time=0,pause=true){
  if(!(instance instanceof Game))throw new Error('Invalid game');
  cancelScheduled();game=instance;elapsed=Math.max(0,Number(time)||0);paused=pause;targeting=null;swapTargets=[];lastBoardFocus=null;lastTick=performance.now();lastEventMessage=game.state.lastEvent.text;render();scheduleState();
}
function celebrate() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < 28; i++) {
    const piece = document.createElement('i'); piece.className = 'confetti';
    piece.style.cssText = `left:${15 + Math.random() * 70}%;background:${['#e79a68', '#a8b783', '#beb0ce', '#dfc98e'][i % 4]};--drift:${(Math.random() - .5) * 200}px;animation-delay:${Math.random() * .6}s;transform:rotate(${Math.random() * 180}deg)`;
    document.body.appendChild(piece); setTimeout(() => piece.remove(), 3500);
  }
}
function formatTime(ms) { const seconds = Math.floor(ms / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function updateClock() {
  const now = performance.now();
  if (game && active() && !paused) elapsed += now - lastTick;
  lastTick = now; $('#game-clock').textContent = formatTime(elapsed);
}
function updateSoundButton() {
  const button = $('#sound-button'); button.innerHTML = icon(sound ? 'sound' : 'soundOff', 16);
  button.setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); button.setAttribute('title', sound ? '关闭音效' : '开启音效'); button.setAttribute('aria-pressed', String(sound));
}
function updateBoardOverflow() {
  const scroller = $('.board-scroll');
  $('#board-scroll-hint').hidden = scroller.scrollWidth <= scroller.clientWidth + 2;
}
function gameConfiguration(config) { return JSON.stringify({ size: config.size, players: config.players }); }
function openSettings() {
  if(campaignController?.isCampaign()){campaignController.showHub();return;}
  settingsReturnPaused = paused;
  if (active() && !paused) setPaused(true);
  settingsDraft = structuredClone(options);
  renderSettings(); $('#settings-dialog').showModal();
}
function closeSettings() { $('#settings-dialog').close(); }
function renderSettings() {
  $$('#settings-dialog [data-size]').forEach(button => {
    const selected = Number(button.dataset.size) === settingsDraft.size;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $$('#settings-dialog [data-scale]').forEach(button => {
    const selected = button.dataset.scale === settingsDraft.boardScale;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  renderRoster(); renderStrength(); updateSettingsNotice();
}
function renderStrength() {
  const bots = settingsDraft.players.filter(player => player.type === 'bot');
  const mixed = bots.some(player => player.difficulty !== bots[0].difficulty);
  if (bots.length && !mixed) settingsDraft.aiStrength = bots[0].difficulty;
  const strength = bots.length && !mixed ? bots[0].difficulty : settingsDraft.aiStrength;
  $$('#settings-dialog [data-strength]').forEach(button => {
    const selected = !mixed && button.dataset.strength === strength;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  $('#ai-strength-note').textContent = mixed ? '当前为混合强度；点击上方选项可统一设置。所有机器人只依据公开信息决策。' : '机器人会使用道具，只依据公开信息决策；新增机器人沿用所选强度。';
}
function renderRoster() {
  $('#roster-count').textContent = `${settingsDraft.players.length} / 8`;
  $('#roster-list').innerHTML = settingsDraft.players.map((player, i) => `<div class="roster-row" data-player-index="${i}"><span class="roster-seat">P${i + 1}</span><label class="roster-name"><span class="sr-only">玩家 ${i + 1} 昵称</span><input data-field="name" type="text" value="${escapeHtml(player.name)}" maxlength="16" placeholder="玩家昵称" autocomplete="off"></label><label class="roster-type"><span class="sr-only">玩家 ${i + 1} 类型</span><select data-field="type"><option value="human" ${player.type === 'human' ? 'selected' : ''}>真人</option><option value="bot" ${player.type === 'bot' ? 'selected' : ''}>机器人</option></select></label><label class="roster-difficulty"><span class="sr-only">玩家 ${i + 1} AI 强度</span>${player.type === 'bot' ? `<select data-field="difficulty">${Object.entries(difficultyLabel).map(([value, label]) => `<option value="${value}" ${player.difficulty === value ? 'selected' : ''}>${label}</option>`).join('')}</select>` : '<span class="human-player-note">同屏操作</span>'}</label><button type="button" class="remove-player" data-remove="${i}" ${settingsDraft.players.length <= 2 ? 'disabled' : ''} aria-label="移除玩家 ${i + 1}" title="移除玩家">${icon('close', 13)}</button></div>`).join('');
  $('#add-human').disabled = $('#add-bot').disabled = settingsDraft.players.length >= 8;
}
function updateSettingsNotice() {
  const changed = gameConfiguration(normalizeOptions(settingsDraft)) !== gameConfiguration(options);
  const restart = active() && changed;
  $('#settings-notice').textContent = restart ? '棋盘或玩家变更会重新开局，当前分数将清空。' : active() ? '只修改显示大小会保留当前棋盘、分数和回合。' : '保存后应用于新对局；设置会保留在此浏览器。';
  $('#settings-notice').classList.toggle('restart-notice', restart);
  $('#settings-apply').innerHTML = `${restart ? '保存并重新开局' : '保存设置'} <span>↗</span>`;
}
function addPlayer(type) {
  if (!settingsDraft || settingsDraft.players.length >= 8) return;
  const prefix = type === 'bot' ? '机器人' : '玩家';
  let number = 1;
  while (settingsDraft.players.some(player => player.name === `${prefix} ${number}`)) number++;
  settingsDraft.players.push({ name: `${prefix} ${number}`, type, difficulty: settingsDraft.aiStrength });
  renderRoster(); renderStrength(); updateSettingsNotice();
  $('#roster-list .roster-row:last-child input').focus();
}
function applySettings() {
  const next = normalizeOptions(settingsDraft);
  const changed = gameConfiguration(next) !== gameConfiguration(options);
  if (changed) {
    newGame(next); closeSettings(); toast('设置已保存，新的对局准备好了。');
  } else {
    options = next; storeSettings(); syncSettings(); closeSettings(); render(); toast('设置已保存。');
  }
}
function openHelp() { helpAutoPause = active() && !paused; if (helpAutoPause) setPaused(true); $('#help-dialog').showModal(); }
function closeHelp() { $('#help-dialog').close(); }

$$('.mode-toggle button').forEach(button => {
  const mode = button.dataset.mode;
  button.innerHTML = `${icon(mode === 'ai' ? 'bot' : mode === 'local' ? 'users' : 'settings', 15)} ${{ ai: '人机对战', local: '好友同屏', custom: '自由组局' }[mode]}`;
  button.addEventListener('click', () => {
    if (mode === 'custom') { openSettings(); return; }
    if (mode !== options.mode) requestReset({ players: mode === 'ai' ? [{ name: '玩家 1', type: 'human' }, { name: '记忆机器人', type: 'bot', difficulty: options.difficulty }] : [{ name: '玩家 1', type: 'human' }, { name: '玩家 2', type: 'human' }] });
  });
});
$('#restart-button').innerHTML = `${icon('refresh', 12)} 新的对局`;
$('#help-dialog .modal-close').innerHTML = icon('close', 14);
$('#settings-button').innerHTML = `${icon('settings', 15)} <span>对局设置</span>`;
$('#settings-close').innerHTML = icon('close', 14);
$('#size-select').addEventListener('change', event => requestReset({ size: Number(event.target.value) }));
$('#difficulty-select').addEventListener('change', event => requestReset({ players: options.players.map(player => player.type === 'bot' ? { ...player, difficulty: event.target.value } : player) }));
$('#settings-button').addEventListener('click', openSettings);
$('#players-setup-link').addEventListener('click', openSettings);
$('#settings-close').addEventListener('click', closeSettings);
$('#settings-cancel').addEventListener('click', closeSettings);
$('#settings-dialog').addEventListener('close', () => { settingsDraft = null; if (active()) setPaused(settingsReturnPaused); });
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); applySettings(); });
$('#settings-dialog').addEventListener('click', event => {
  const size = event.target.closest('[data-size]'), scale = event.target.closest('[data-scale]'), strength = event.target.closest('[data-strength]');
  if (size) { settingsDraft.size = Number(size.dataset.size); renderSettings(); }
  if (scale) { settingsDraft.boardScale = scale.dataset.scale; renderSettings(); }
  if (strength) {
    settingsDraft.aiStrength = strength.dataset.strength;
    settingsDraft.players.forEach(player => { if (player.type === 'bot') player.difficulty = settingsDraft.aiStrength; });
    renderSettings();
  }
});
$('#roster-list').addEventListener('input', event => {
  if (event.target.dataset.field !== 'name') return;
  const index = Number(event.target.closest('[data-player-index]').dataset.playerIndex);
  settingsDraft.players[index].name = event.target.value; updateSettingsNotice();
});
$('#roster-list').addEventListener('change', event => {
  const field = event.target.dataset.field;
  if (field !== 'type' && field !== 'difficulty') return;
  const index = Number(event.target.closest('[data-player-index]').dataset.playerIndex);
  settingsDraft.players[index][field] = event.target.value;
  if (field === 'type' && event.target.value === 'bot') settingsDraft.players[index].difficulty = settingsDraft.aiStrength;
  renderRoster(); renderStrength(); updateSettingsNotice();
  $(`#roster-list [data-player-index="${index}"] [data-field="${field}"]`)?.focus();
});
$('#roster-list').addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (!remove || settingsDraft.players.length <= 2) return;
  const index = Number(remove.dataset.remove);
  settingsDraft.players.splice(index, 1); renderRoster(); renderStrength(); updateSettingsNotice();
  $(`#roster-list [data-player-index="${Math.min(index, settingsDraft.players.length - 1)}"] input`)?.focus();
});
$('#add-human').addEventListener('click', () => addPlayer('human'));
$('#add-bot').addEventListener('click', () => addPlayer('bot'));
$('#scale-button').addEventListener('click', () => {
  options.boardScale = options.boardScale === 'large' ? 'standard' : 'large';
  storeSettings(); syncSettings(); render();
  toast(options.boardScale === 'large' ? '棋盘已放大，空间不足时可左右滑动。' : '已恢复标准棋盘。');
});
$('#restart-button').addEventListener('click', () => campaignController?.isCampaign()?campaignController.retry():requestReset());
$('#pause-button').addEventListener('click', () => setPaused(!paused));
$('#sound-button').addEventListener('click', () => { sound = !sound; storeSettings(); updateSoundButton(); if (sound) beep('match'); toast(sound ? '音效已开启' : '音效已关闭'); });
$('#board').addEventListener('click', event => { const tile = event.target.closest('[data-card]'); if (tile) clickCard(Number(tile.dataset.card)); });
$('#board').addEventListener('focusin', event => { const tile = event.target.closest('[data-card]'); if (tile) lastBoardFocus = tile.dataset.card; });
$('#tool-list').addEventListener('click', event => { const tool = event.target.closest('[data-tool]'); if (tool && !tool.disabled) selectTool(tool.dataset.tool); });
$('#board-overlay').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if(campaignController?.handleAction(action))return;
  if (action === 'start') startGame(); else if (action === 'resume') setPaused(false); else if (action === 'again') { newGame(); startGame(); }
});
$('#board').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const id = Number(event.target.closest('[data-card]')?.dataset.card);
  if (!Number.isInteger(id)) return;
  event.preventDefault(); const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -game.state.size, ArrowDown: game.state.size }[event.key];
  let next = id + delta;
  while (next >= 0 && next < game.state.cards.length) {
    const tile = $(`[data-card="${next}"]`); if (tile && !tile.disabled) { tile.focus(); return; } next += delta;
  }
});
$('#help-button').addEventListener('click', openHelp); $('#rules-link').addEventListener('click', openHelp);
$('#help-done').addEventListener('click', closeHelp); $('#help-dialog .modal-close').addEventListener('click', closeHelp);
$('#help-dialog').addEventListener('close', () => { if (helpAutoPause) { helpAutoPause = false; setPaused(false); } });
$('#confirm-cancel').addEventListener('click', cancelReset);
$('#confirm-dialog').addEventListener('cancel', event => { event.preventDefault(); cancelReset(); });
$('#confirm-ok').addEventListener('click', () => { if(pendingResetAction){const action=pendingResetAction;pendingResetAction=null;$('#confirm-dialog').close();action();return;} const next = pendingOptions; pendingOptions = null; $('#confirm-dialog').close(); newGame(next || options); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && targeting && !$('#help-dialog').open && !$('#confirm-dialog').open && !$('#settings-dialog').open) { targeting = null; swapTargets = []; render(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && active() && !paused) setPaused(true); });
window.addEventListener('resize', updateBoardOverflow);
newGame();
campaignController=mountCampaign({getGame:()=>game,getElapsed:()=>elapsed,isPaused:()=>paused,freeze:()=>setPaused(true),resume:()=>setPaused(false),loadGame,start:startGame,newFreeGame:()=>newGame(options),toast,
  confirm(title,copy,action){beforeModalPaused=paused;setPaused(true);pendingResetAction=action;$('#confirm-title').textContent=title;$('#confirm-copy').textContent=copy;$('#confirm-dialog').showModal();}
});
$('#player-cards').addEventListener('click',event=>{const card=event.target.closest('[data-opponent]');if(!card||!targeting||catalog[targeting].target!=='opponent'||!humanCanAct())return;const id=Number(card.dataset.opponent),type=targeting;if(id===game.state.current)return;targeting=null;execute({type,ids:[id]});});
$('#player-cards').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){const card=event.target.closest('[role="button"]');if(card){event.preventDefault();card.click();}}});
$('#tool-help').addEventListener('click',event=>{if(event.target.closest('#confirm-target'))confirmTargets();});
render();setInterval(updateClock,250);
