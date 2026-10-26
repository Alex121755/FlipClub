export const BOARD_SIZES = Object.freeze([4, 6, 8, 10, 12]);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const ENERGY_CAP = 6;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const number = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value, fallback, low, high) => clamp(Math.floor(number(value, fallback)), low, high);
const bag = value => Object.fromEntries(['radar', 'anchor', 'break'].map(id => [id, integer(value?.[id], 0, 0, 5)]));
const copy = value => structuredClone(value);

export const TOOL_CATALOG = Object.freeze([
  { id: 'peek', name: '侦察', cost: 2, cooldown: 1, target: 'card', category: 'information', description: '公开查看 1 张暗牌；对手也能记住。冷却 1 次自己的尝试。' },
  { id: 'double', name: '蓄力', cost: 3, cooldown: 2, target: 'none', category: 'burst', description: '本次配对得分 +50%，额外分数最多 75；失配则失效。冷却 2 次自己的尝试。' },
  { id: 'swap', name: '换位', cost: 2, cooldown: 1, target: 'cards2', category: 'pressure', description: '交换 2 张暗牌的位置；移动公开，已知线索随位置移动。冷却 1 次自己的尝试。' },
  { id: 'jam', name: '干扰', cost: 2, cooldown: 2, target: 'opponent', category: 'pressure', description: '禁用对手下一次尝试的道具；护盾可抵挡或解除。冷却 2 次自己的尝试。' },
  { id: 'shield', name: '护盾', cost: 2, cooldown: 2, target: 'none', category: 'defense', description: '解除干扰并抵挡 1 次干扰或虹吸；持续至自己下一次尝试结束。冷却 2 次自己的尝试。' },
  { id: 'drain', name: '虹吸', cost: 3, cooldown: 2, target: 'opponent', category: 'pressure', description: '夺取对手最多 2 点能量；被护盾抵挡时仍付出能量。冷却 2 次自己的尝试。' },
  { id: 'radar', name: '雷达', cost: 2, cooldown: 0, target: 'cards3', category: 'information', consumable: true, description: '消耗 1 个库存，公开扫描最多 3 张暗牌；对手也可观察。' },
  { id: 'anchor', name: '记忆锚', cost: 2, cooldown: 0, target: 'none', category: 'defense', consumable: true, description: '消耗 1 个库存，本轮 1 次失配可以继续；仍受每轮最多 2 次配对限制。' },
  { id: 'break', name: '破盾', cost: 1, cooldown: 0, target: 'opponent', category: 'defense', consumable: true, description: '消耗 1 个库存，移除对手的护盾；没有护盾时不能使用。' },
].map(tool => Object.freeze({ consumable: false, ...tool })));
const CATALOG = Object.fromEntries(TOOL_CATALOG.map(tool => [tool.id, tool]));

/** These same continuous formulas are displayed by campaign previews. */
export function continuousMemoryProfile(size, strength) {
  const s = clamp(number(strength, 50), 0, 100);
  return {
    memoryCapacity: Math.min(size * size, Math.max(4, Math.round(4 + (size * size - 4) * (s / 100) ** 1.7))),
    retention: clamp(0.43 + s * 0.0056, 0.5, 0.98),
  };
}

function profileFor(entry, size, difficulty, fallbackProfile) {
  const raw = entry.aiProfile ?? fallbackProfile;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const strength = clamp(number(raw.strength, 50), 0, 100);
  const computed = continuousMemoryProfile(size, strength);
  const policy = Object.fromEntries(['information', 'burst', 'defense', 'pressure'].map(category => [category, clamp(number(raw.policy?.[category], 1), 0, 10)]));
  return { strength, memoryCapacity: integer(raw.memoryCapacity, computed.memoryCapacity, 4, size * size), retention: clamp(number(raw.retention, computed.retention), 0.05, 1), policy };
}

/** Timer-free rules. AI observes only cards that public actions expose, never hidden values. */
export class Game {
  constructor(options = {}) {
    const size = BOARD_SIZES.includes(options.size) ? options.size : 6;
    const legacyMode = options.mode === 'local' ? 'local' : 'ai';
    const difficulty = DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'normal';
    const custom = Array.isArray(options.players) && options.players.length >= 2 && options.players.length <= 8;
    const playerCount = custom ? options.players.length : legacyMode === 'ai' ? 2 : [2, 3, 4].includes(options.playerCount) ? options.playerCount : 2;
    const players = Array.from({ length: playerCount }, (_, i) => {
      const entry = custom && options.players[i] && typeof options.players[i] === 'object' ? options.players[i] : {};
      const type = custom ? entry.type === 'bot' ? 'bot' : 'human' : legacyMode === 'ai' && i === 1 ? 'bot' : 'human';
      const fallbackName = !custom && type === 'bot' ? '记忆机器人' : `${type === 'bot' ? '机器人' : '玩家'} ${i + 1}`;
      const name = typeof entry.name === 'string' ? [...entry.name.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 16).join('') : '';
      const level = DIFFICULTIES.includes(entry.difficulty) ? entry.difficulty : difficulty;
      return {
        name: name || fallbackName, type, difficulty: level,
        aiProfile: profileFor(entry, size, level, type === 'bot' ? options.aiProfile : null),
        score: 0, energy: integer(entry.initialEnergy, 3, 0, ENERGY_CAP), pairs: 0, combo: 0, turnChain: 0, attempts: 0, misses: 0,
        cooldowns: Object.fromEntries(TOOL_CATALOG.map(tool => [tool.id, 0])),
        effects: { jammed: false, shield: false, anchor: false, shieldUntil: 0 },
        inventory: bag(entry.inventory), perks: { peekDiscount: entry.perks?.peekDiscount === true }, peekDiscountUsed: false,
        pendingTool: null,
      };
    });
    // One injected draw supplies a deterministic stream, so a saved game resumes the exact stream.
    let seed = typeof options.rng === 'function' ? Number(options.rng()) : Math.random();
    if (!Number.isFinite(seed)) seed = 0;
    this._rngState = Math.floor(clamp(seed, 0, 0.999999999999) * 4294967296) >>> 0;
    const values = Array.from({ length: size * size }, (_, i) => Math.floor(i / 2));
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(this._random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }
    this._memories = Array.from({ length: playerCount }, () => new Map());
    this.state = {
      status: 'ready', size, mode: custom ? 'custom' : legacyMode, difficulty,
      cards: values.map((value, id) => ({ id, value, matched: false })), players,
      current: 0, selected: [], peek: null, peekIds: [], multiplier: 1, toolUsed: false,
      turns: 0, matchedPairs: 0, learningSamples: [],
      battleId: typeof options.battleId === 'string' ? options.battleId : null,
      lastEvent: { type: 'ready', text: '翻开两张相同的牌，赢取分数。每轮最多连续配对两次。' },
    };
  }

  _random() {
    this._rngState = (Math.imul(1664525, this._rngState) + 1013904223) >>> 0;
    return this._rngState / 4294967296;
  }

  _observe(id) {
    const { players, cards } = this.state;
    for (const [index, memory] of this._memories.entries()) {
      const player = players[index];
      const capacity = player.aiProfile?.memoryCapacity ?? (player.difficulty === 'easy' ? 6 : player.difficulty === 'normal' ? 12 : cards.length);
      const retention = player.aiProfile?.retention ?? (player.difficulty === 'easy' ? 0.62 : 1);
      if (retention < 1 && this._random() >= retention) continue;
      memory.delete(id);
      memory.set(id, cards[id].value);
      while (memory.size > capacity) memory.delete(memory.keys().next().value);
    }
  }

  _validCard(id) { return Number.isInteger(id) && id >= 0 && id < this.state.cards.length; }
  _validOpponent(id) { return Number.isInteger(id) && id >= 0 && id < this.state.players.length && id !== this.state.current; }

  start() {
    if (this.state.status !== 'ready') return false;
    this.state.status = 'playing';
    this.state.lastEvent = { type: 'start', text: `${this.state.players[this.state.current].name}，请翻牌。` };
    return true;
  }

  flip(id) {
    const s = this.state;
    if (s.status !== 'playing' || !this._validCard(id) || s.cards[id].matched || s.selected.includes(id)) return false;
    s.selected.push(id);
    this._observe(id);
    s.lastEvent = { type: 'flip', text: '记住这张牌的位置。', id, player: s.current };
    if (s.selected.length === 2) s.status = 'resolving';
    return true;
  }

  _finishToolSample(playerIndex, match, anchored) {
    const player = this.state.players[playerIndex], pending = player.pendingTool;
    if (!pending) return;
    const reward = pending.reward ?? (pending.family === 'burst' ? Number(match) : pending.family === 'information' ? match ? 1 : 0.15 : anchored ? 1 : match ? 0.65 : 0.35);
    this.state.learningSamples.push({ player: playerIndex, family: pending.family, tool: pending.tool, reward: clamp(reward, 0, 1) });
    player.pendingTool = null;
  }

  resolve() {
    const s = this.state;
    if (s.status !== 'resolving' || s.selected.length !== 2) return false;
    const [first, second] = s.selected, index = s.current, player = s.players[index];
    const match = s.cards[first].value === s.cards[second].value;
    const anchored = !match && player.effects.anchor;
    player.attempts++;
    player.energy = Math.min(ENERGY_CAP, player.energy + 1);
    player.effects.jammed = false;
    for (const id of Object.keys(player.cooldowns)) player.cooldowns[id] = Math.max(0, player.cooldowns[id] - 1);
    if (player.effects.shield && player.attempts >= player.effects.shieldUntil) player.effects.shield = false;
    if (match) {
      s.cards[first].matched = s.cards[second].matched = true;
      const base = 100 + 25 * Math.min(1, player.combo);
      const gained = base + (s.multiplier > 1 ? Math.min(75, Math.round(base * 0.5)) : 0);
      player.score += gained; player.pairs++; player.combo++; player.turnChain++; s.matchedPairs++;
      for (const memory of this._memories) { memory.delete(first); memory.delete(second); }
      const handoff = player.turnChain >= 2;
      if (handoff) { player.combo = 0; player.turnChain = 0; player.effects.anchor = false; s.current = (index + 1) % s.players.length; }
      s.lastEvent = { type: 'match', text: `${player.name}配对成功，+${gained} 分！${handoff ? `两次配对后，轮到${s.players[s.current].name}。` : '继续翻牌。'}`, player: index, next: s.current, score: gained, ids: [first, second], combo: handoff ? 2 : player.combo, handoff };
    } else {
      player.misses++; player.combo = 0;
      if (anchored) { player.effects.anchor = false; }
      else { player.turnChain = 0; s.current = (index + 1) % s.players.length; }
      s.lastEvent = { type: 'miss', text: anchored ? `${player.name}的记忆锚生效，失配后再试一次。` : `没有配对。轮到${s.players[s.current].name}。`, player: index, next: s.current, ids: [first, second], anchored: Boolean(anchored) };
    }
    this._finishToolSample(index, match, anchored);
    s.selected = []; s.multiplier = 1; s.toolUsed = false; s.turns++;
    s.status = s.matchedPairs === s.cards.length / 2 ? 'finished' : 'playing';
    if (s.status === 'finished') {
      const best = Math.max(...s.players.map(p => p.score));
      const winners = s.players.flatMap((p, i) => p.score === best ? [i] : []);
      s.lastEvent = { ...s.lastEvent, type: 'finish', winners, text: winners.length > 1 ? '平局！每一次记忆都很精彩。' : `${s.players[winners[0]].name}获胜！`, finalMatchScore: s.lastEvent.score };
    }
    return true;
  }

  toolAvailability(type) {
    const s = this.state, tool = Object.hasOwn(CATALOG, type) ? CATALOG[type] : null, player = s.players[s.current];
    if (!tool) return { available: false, reason: '未知道具', cost: 0 };
    const cost = tool.cost - (type === 'peek' && player.perks.peekDiscount && !player.peekDiscountUsed ? 1 : 0);
    let reason = '';
    if (s.status !== 'playing') reason = '请等待当前动画或开始对局';
    else if (s.selected.length) reason = '请在翻开第一张牌之前使用';
    else if (s.toolUsed) reason = '每次尝试限用 1 件道具';
    else if (player.effects.jammed && type !== 'shield') reason = '受到干扰，可使用护盾解除';
    else if (player.cooldowns[type] > 0) reason = `冷却中：还需 ${player.cooldowns[type]} 次自己的尝试`;
    else if (tool.consumable && !player.inventory[type]) reason = '库存不足，请在闯关商城购买并装配';
    else if (player.energy < cost) reason = '能量不足；配对或失配均恢复 1 点';
    else if (type === 'break' && !s.players.some((p, i) => i !== s.current && p.effects.shield)) reason = '没有可破除的对手护盾';
    else if (type === 'drain' && !s.players.some((p, i) => i !== s.current && p.energy > 0)) reason = '对手没有可夺取的能量';
    else if (type === 'shield' && player.effects.shield && !player.effects.jammed) reason = '护盾已经生效';
    else if (type === 'anchor' && player.effects.anchor) reason = '记忆锚已经生效';
    else if (type === 'jam' && !s.players.some((p, i) => i !== s.current && !p.effects.jammed)) reason = '对手已经受到干扰';
    return { available: !reason, reason, cost };
  }

  canUseTool(type, ids = []) {
    if (!this.toolAvailability(type).available || !Array.isArray(ids)) return false;
    const tool = CATALOG[type], s = this.state;
    if (tool.target === 'none') return ids.length === 0;
    if (tool.target === 'opponent') {
      if (ids.length !== 1 || !this._validOpponent(ids[0])) return false;
      const target = s.players[ids[0]];
      return type === 'break' ? target.effects.shield : type === 'drain' ? target.energy > 0 : !target.effects.jammed;
    }
    const countValid = tool.target === 'card' ? ids.length === 1 : tool.target === 'cards2' ? ids.length === 2 : ids.length >= 1 && ids.length <= 3;
    return countValid && new Set(ids).size === ids.length && ids.every(id => this._validCard(id) && !s.cards[id].matched);
  }

  _shieldBlocked(target) {
    if (!target.effects.shield) return false;
    target.effects.shield = false;
    const index = this.state.players.indexOf(target);
    if (target.pendingTool?.tool === 'shield') target.pendingTool.reward = 1;
    else {
      const sample = this.state.learningSamples.findLast(sample => sample.player === index && sample.tool === 'shield');
      if (sample) sample.reward = 1;
    }
    return true;
  }

  useTool(type, ids = []) {
    if (!this.canUseTool(type, ids)) return false;
    const s = this.state, player = s.players[s.current], tool = CATALOG[type];
    player.energy -= this.toolAvailability(type).cost;
    player.cooldowns[type] = tool.cooldown + 1;
    if (tool.consumable) player.inventory[type]--;
    if (type === 'peek') player.peekDiscountUsed = true;
    s.toolUsed = true;
    player.pendingTool = { tool: type, family: tool.category, reward: null };
    let text;
    if (type === 'peek' || type === 'radar') {
      s.peekIds = [...ids]; s.peek = ids[0]; s.status = 'peeking';
      ids.forEach(id => this._observe(id));
      text = `${player.name}使用${tool.name}：公开查看 ${ids.length} 张牌，双方都能观察。`;
    } else if (type === 'swap') {
      const [a, b] = ids;
      [s.cards[a].value, s.cards[b].value] = [s.cards[b].value, s.cards[a].value];
      for (const memory of this._memories) {
        const entries = [...memory]; memory.clear();
        for (const [id, value] of entries) memory.set(id === a ? b : id === b ? a : id, value);
      }
      player.pendingTool.reward = 0.35;
      text = '两张牌的位置已公开交换；已知线索随位置移动。';
    } else if (type === 'double') { s.multiplier = 1.5; text = '蓄力生效：本次配对得分 +50%，额外分数上限 75。'; }
    else if (type === 'shield') {
      player.pendingTool.reward = player.effects.jammed ? 1 : null;
      player.effects.jammed = false; player.effects.shield = true; player.effects.shieldUntil = player.attempts + 2;
      text = `${player.name}获得护盾并解除干扰。`;
    } else if (type === 'anchor') { player.effects.anchor = true; text = '记忆锚已就位：本轮一次失配可以再试。'; }
    else {
      const target = s.players[ids[0]];
      if (type === 'break') { target.effects.shield = false; player.pendingTool.reward = 1; text = `${target.name}的护盾被破除。`; }
      else if (this._shieldBlocked(target)) { player.pendingTool.reward = 0; text = `${target.name}的护盾抵挡了${tool.name}。`; }
      else if (type === 'jam') { target.effects.jammed = true; player.pendingTool.reward = 0.7; text = `${target.name}下一次尝试受到干扰，护盾可以解除。`; }
      else {
        const drained = Math.min(2, target.energy, ENERGY_CAP - player.energy);
        target.energy -= drained; player.energy += drained; player.pendingTool.reward = drained / 2;
        text = `${player.name}从${target.name}夺取 ${drained} 点能量。`;
      }
    }
    s.lastEvent = { type, text, ids: [...ids], id: ids[0], player: s.current };
    return true;
  }

  resolvePeek() {
    if (this.state.status !== 'peeking') return false;
    this.state.peek = null; this.state.peekIds = []; this.state.status = 'playing';
    return true;
  }

  /** Concealed values are excluded from the public render view. */
  snapshot() {
    const result = copy(this.state), visible = new Set([...result.selected, ...result.peekIds]);
    for (const card of result.cards) if (!card.matched && !visible.has(card.id)) card.value = null;
    return result;
  }

  /** Versioned local persistence includes observations and PRNG state; never send this to an opponent. */
  exportState() { return { version: 2, state: copy(this.state), memories: this._memories.map(memory => [...memory]), rngState: this._rngState }; }

  static fromState(saved) {
    if (typeof saved === 'string') saved = JSON.parse(saved);
    const fail = () => { throw new TypeError('Invalid saved game'); };
    if (!saved || saved.version !== 2 || !saved.state || !Number.isInteger(saved.rngState) || saved.rngState < 0 || saved.rngState > 4294967295) fail();
    const s = copy(saved.state), validNum = (v, high = 1e12) => Number.isInteger(v) && v >= 0 && v <= high;
    if (!BOARD_SIZES.includes(s.size) || !['ready', 'playing', 'resolving', 'peeking', 'finished'].includes(s.status) || !Array.isArray(s.players) || s.players.length < 2 || s.players.length > 8 || !Array.isArray(s.cards) || s.cards.length !== s.size * s.size) fail();
    if (!validNum(s.current, s.players.length - 1) || !validNum(s.turns) || !validNum(s.matchedPairs, s.cards.length / 2) || typeof s.toolUsed !== 'boolean' || ![1, 1.5].includes(s.multiplier) || !Array.isArray(s.learningSamples) || !s.lastEvent || typeof s.lastEvent.text !== 'string') fail();
    const counts = new Map(), matched = new Map();
    s.cards.forEach((card, id) => {
      if (card.id !== id || !validNum(card.value, s.cards.length / 2 - 1) || typeof card.matched !== 'boolean') fail();
      counts.set(card.value, (counts.get(card.value) || 0) + 1);
      if (card.matched) matched.set(card.value, (matched.get(card.value) || 0) + 1);
    });
    if (counts.size !== s.cards.length / 2 || [...counts.values()].some(count => count !== 2) || [...matched.values()].some(count => count !== 2) || matched.size !== s.matchedPairs) fail();
    const validCards = ids => Array.isArray(ids) && new Set(ids).size === ids.length && ids.every(id => validNum(id, s.cards.length - 1) && !s.cards[id].matched);
    if (!validCards(s.selected) || s.selected.length > 2 || !validCards(s.peekIds) || s.peekIds.length > 3 || s.peek !== (s.peekIds[0] ?? null)) fail();
    if ((s.status === 'resolving') !== (s.selected.length === 2) || (s.status === 'peeking') !== (s.peekIds.length > 0) || s.status === 'peeking' && s.selected.length || ['ready', 'finished'].includes(s.status) && s.selected.length) fail();
    if ((s.status === 'finished') !== (s.matchedPairs === s.cards.length / 2)) fail();
    s.players.forEach(player => {
      if (typeof player.name !== 'string' || !player.name || [...player.name].length > 16 || !['bot', 'human'].includes(player.type) || !DIFFICULTIES.includes(player.difficulty)) fail();
      for (const field of ['score', 'pairs', 'combo', 'turnChain', 'attempts', 'misses']) if (!validNum(player[field])) fail();
      if (!validNum(player.energy, ENERGY_CAP) || player.combo > 1 || player.turnChain > 1 || player.attempts !== player.pairs + player.misses) fail();
      if (!player.effects || !['jammed', 'shield', 'anchor'].every(field => typeof player.effects[field] === 'boolean') || !validNum(player.effects.shieldUntil)) fail();
      if (!player.cooldowns || TOOL_CATALOG.some(tool => !validNum(player.cooldowns[tool.id], tool.cooldown + 1)) || !player.inventory || ['radar', 'anchor', 'break'].some(id => !validNum(player.inventory[id], 5))) fail();
      if (!player.perks || typeof player.perks.peekDiscount !== 'boolean' || typeof player.peekDiscountUsed !== 'boolean') fail();
      if (player.aiProfile !== null) {
        const p = player.aiProfile;
        if (!p || !Number.isFinite(p.strength) || p.strength < 0 || p.strength > 100 || !validNum(p.memoryCapacity, s.cards.length) || p.memoryCapacity < 4 || !Number.isFinite(p.retention) || p.retention < 0.05 || p.retention > 1 || !p.policy || ['information', 'burst', 'defense', 'pressure'].some(id => !Number.isFinite(p.policy[id]) || p.policy[id] < 0 || p.policy[id] > 10)) fail();
      }
      if (player.pendingTool !== null && (!player.pendingTool || !Object.hasOwn(CATALOG, player.pendingTool.tool) || player.pendingTool.family !== CATALOG[player.pendingTool.tool].category || player.pendingTool.reward !== null && (!Number.isFinite(player.pendingTool.reward) || player.pendingTool.reward < 0 || player.pendingTool.reward > 1))) fail();
    });
    if (s.players.reduce((sum, p) => sum + p.pairs, 0) !== s.matchedPairs || s.players.reduce((sum, p) => sum + p.attempts, 0) !== s.turns) fail();
    if (s.learningSamples.some(sample => !sample || !validNum(sample.player, s.players.length - 1) || !Object.hasOwn(CATALOG, sample.tool) || sample.family !== CATALOG[sample.tool].category || !Number.isFinite(sample.reward) || sample.reward < 0 || sample.reward > 1)) fail();
    if (!Array.isArray(saved.memories) || saved.memories.length !== s.players.length) fail();
    const memories = saved.memories.map(entries => {
      if (!Array.isArray(entries) || entries.length > s.cards.length) fail();
      const memory = new Map();
      for (const entry of entries) {
        if (!Array.isArray(entry) || entry.length !== 2 || !validNum(entry[0], s.cards.length - 1) || s.cards[entry[0]].matched || entry[1] !== s.cards[entry[0]].value || memory.has(entry[0])) fail();
        memory.set(...entry);
      }
      return memory;
    });
    if (s.status === 'finished') {
      const best = Math.max(...s.players.map(p => p.score)), winners = s.players.flatMap((p, i) => p.score === best ? [i] : []);
      if (JSON.stringify(s.lastEvent.winners) !== JSON.stringify(winners)) fail();
    }
    const game = Object.create(Game.prototype); game.state = s; game._memories = memories; game._rngState = saved.rngState;
    return game;
  }

  /** Chooses from public observations and public resources only; profiles change memory and decisions continuously. */
  chooseAiAction() {
    const s = this.state, player = s.players[s.current];
    if (player.type !== 'bot' || s.status !== 'playing') return null;
    const memory = this._memories[s.current];
    const available = s.cards.filter(card => !card.matched && !s.selected.includes(card.id)).map(card => card.id);
    if (!available.length) return null;
    const pick = ids => ids[Math.floor(this._random() * ids.length)], unknown = available.filter(id => !memory.has(id));
    const precision = player.aiProfile ? 0.55 + player.aiProfile.strength * 0.0045 : 1;
    if (s.selected.length === 1) {
      const visibleValue = s.cards[s.selected[0]].value;
      const mate = available.find(id => memory.has(id) && memory.get(id) === visibleValue);
      return { type: 'flip', id: mate !== undefined && this._random() < precision ? mate : pick(unknown.length ? unknown : available) };
    }
    const seen = new Map(); let knownPair = null;
    for (const id of available) {
      if (!memory.has(id)) continue;
      const value = memory.get(id);
      if (seen.has(value)) { knownPair = [seen.get(value), id]; break; }
      seen.set(value, id);
    }
    const options = [], add = (type, ids, weight) => { if (weight > 0 && this.canUseTool(type, ids)) options.push({ action: ids.length ? { type, ids } : { type }, weight }); };
    const policy = player.aiProfile?.policy ?? { information: 1, burst: 1, defense: 0.7, pressure: 0.8 };
    if (player.effects.jammed) add('shield', [], 10);
    if (knownPair) add('double', [], policy.burst * 8);
    if (!knownPair) {
      if (unknown.length) { add('peek', [pick(unknown)], policy.information * 3); add('radar', unknown.slice(0, 3), policy.information * 5); }
      add('anchor', [], policy.defense * 0.9);
      if (!player.effects.shield && s.players.some((p, i) => i !== s.current && p.energy >= 4)) add('shield', [], policy.defense * 0.6);
      const opponents = s.players.map((p, i) => ({ ...p, index: i })).filter(p => p.index !== s.current).sort((a, b) => b.score - a.score || b.energy - a.energy);
      const target = opponents[0];
      if (target.effects.shield) add('break', [target.index], policy.defense * 1.4);
      else {
        if (target.energy >= 3) add('drain', [target.index], policy.pressure * (player.energy <= 4 ? 2 : 0.7));
        if (target.energy >= 2) add('jam', [target.index], policy.pressure * 1.3);
      }
      if (!unknown.length && available.length >= 2) add('swap', available.slice(0, 2), policy.pressure * 0.08);
    }
    if (options.length) {
      // Keeping energy and simply flipping is also a legal option, avoiding forced tool spam.
      const total = options.reduce((sum, entry) => sum + entry.weight, 0), draw = this._random() * (total + (knownPair ? 0.6 : 1));
      let cursor = 0;
      for (const entry of options) { cursor += entry.weight; if (draw < cursor) return entry.action; }
    }
    if (knownPair && this._random() < precision) return { type: 'flip', id: knownPair[0] };
    return { type: 'flip', id: pick(unknown.length ? unknown : available) };
  }
}
export default Game;
