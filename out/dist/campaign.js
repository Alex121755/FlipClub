const TOOLS = ['radar', 'anchor', 'break'];
const CATEGORIES = ['information', 'burst', 'defense', 'pressure'];
const COIN_CAP = 1_000_000_000;
const STAGE_CAP = 1_000_000;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const integer = (value, fallback, low = 0, high = COIN_CAP) => clamp(Math.floor(finite(value, fallback)), low, high);
const copy = value => structuredClone(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const round = value => Math.round(value * 100) / 100;
const chargeBag = value => Object.fromEntries(TOOLS.map(tool => [tool, integer(record(value)[tool], 0, 0, 5)]));
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(value);
const cleanName = value => typeof value === 'string' ? [...value.replace(/[\u0000-\u001f\u007f]/g, '').trim()].slice(0, 24).join('') : '';

function battleSummary(value) {
  const source = record(value);
  const players = Array.isArray(source.players) ? source.players.slice(0, 2) : [];
  return {
    size: [4, 6, 8, 10, 12].includes(source.size) ? source.size : 4,
    turns: integer(source.turns, 0), matchedPairs: integer(source.matchedPairs, 0, 0, 72),
    players: players.map((value, index) => {
      const player = record(value);
      return { name: cleanName(player.name) || (index === 0 ? '你' : '机器人'), score: integer(player.score, 0), pairs: integer(player.pairs, 0, 0, 72), attempts: integer(player.attempts, 0) };
    }),
  };
}

export const SHOP_CATALOG = Object.freeze([
  { id: 'radar', name: '战术雷达', description: '购买 1 次雷达；装配后开局扣除，使用后公开扫描最多 3 张暗牌。', price: 65, type: 'consumable', toolId: 'radar', max: 5 },
  { id: 'anchor', name: '记忆锚', description: '购买 1 次记忆锚；装配后开局扣除，使用后抵消一次失配的回合交接。', price: 70, type: 'consumable', toolId: 'anchor', max: 5 },
  { id: 'break', name: '破盾卡', description: '购买 1 次破局卡；装配后开局扣除，使用后移除对手的护盾。', price: 40, type: 'consumable', toolId: 'break', max: 5 },
  { id: 'battery', name: '储能电池', description: '永久升级：每场初始能量 +1。', price: 150, type: 'upgrade', max: 1 },
  { id: 'scout', name: '侦察镜片', description: '永久升级：每场第一次侦察的能量消耗 -1。', price: 180, type: 'upgrade', max: 1 },
  { id: 'belt', name: '战术腰带', description: '永久升级：可装配的不同消耗道具由 2 种增至 3 种。', price: 140, type: 'upgrade', max: 1 },
].map(item => Object.freeze(item)));

function newId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return `campaign-${globalThis.crypto.randomUUID()}`;
  return `campaign-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

function newLearning() {
  return {
    games: 0, playerRating: 1000, pairAccuracy: 0.4, totalSamples: 0,
    policy: Object.fromEntries(CATEGORIES.map(category => [category, { mean: 0.5, count: 0 }])),
    lastOutcome: null, lastPairAccuracy: null,
    method: '本地对局统计与探索策略；不进行神经网络训练',
  };
}

function initialState() {
  return {
    version: 1, id: newId(), battleSequence: 0,
    stage: 1, wins: 0, coins: 40, phase: 'map',
    inventory: chargeBag(), equipped: [], upgrades: { battery: 0, scout: 0, belt: 0 },
    completedStages: [], recordedBattles: [], activeBattle: null, lastBattle: null,
    learning: newLearning(),
  };
}

/** Pure local progression. Persistence and the live Game instance belong to the caller. */
export class Campaign {
  constructor() {
    this.state = initialState();
  }

  get shopUnlocked() { return this.state.wins > 0; }
  get loadoutCapacity() { return 2 + (this.state.upgrades.belt ? 1 : 0); }

  static fromState(saved) {
    const campaign = new Campaign();
    let source = saved;
    if (typeof source === 'string') {
      try { source = JSON.parse(source); } catch { return campaign; }
    }
    source = record(source);
    if (source.version !== undefined && source.version !== 1) return campaign;
    const s = campaign.state;
    s.id = validId(source.id) ? source.id : s.id;
    s.battleSequence = integer(source.battleSequence, 0);
    s.stage = integer(source.stage, 1, 1, STAGE_CAP);
    s.wins = integer(source.wins, 0);
    s.coins = integer(source.coins, 40);
    s.inventory = chargeBag(source.inventory);
    for (const key of ['battery', 'scout', 'belt']) s.upgrades[key] = integer(record(source.upgrades)[key], 0, 0, 1);
    const equipped = Array.isArray(source.equipped) ? source.equipped : [];
    s.equipped = [...new Set(equipped)].filter(tool => TOOLS.includes(tool) && s.inventory[tool] > 0).slice(0, campaign.loadoutCapacity);
    s.completedStages = Array.isArray(source.completedStages) ? [...new Set(source.completedStages.filter(stage => Number.isInteger(stage) && stage >= 1 && (stage < s.stage || stage === STAGE_CAP && s.stage === STAGE_CAP)))].sort((a, b) => a - b) : [];
    s.recordedBattles = Array.isArray(source.recordedBattles) ? [...new Set(source.recordedBattles.filter(validId))] : [];
    const learning = record(source.learning);
    s.learning.games = integer(learning.games, 0);
    s.learning.playerRating = clamp(finite(learning.playerRating, 1000), 600, 1800);
    s.learning.pairAccuracy = clamp(finite(learning.pairAccuracy, 0.4), 0, 1);
    s.learning.totalSamples = integer(learning.totalSamples, 0);
    s.learning.lastOutcome = ['win', 'loss', 'tie'].includes(learning.lastOutcome) ? learning.lastOutcome : null;
    s.learning.lastPairAccuracy = typeof learning.lastPairAccuracy === 'number' && Number.isFinite(learning.lastPairAccuracy) ? clamp(learning.lastPairAccuracy, 0, 1) : null;
    for (const category of CATEGORIES) {
      const entry = record(record(learning.policy)[category]);
      s.learning.policy[category] = { mean: clamp(finite(entry.mean, 0.5), 0, 1), count: integer(entry.count, 0) };
    }
    const active = record(source.activeBattle);
    if (source.phase === 'battle' && validId(active.battleId) && active.stage === s.stage && !s.recordedBattles.includes(active.battleId)) {
      const reserved = Object.fromEntries(TOOLS.map(tool => [tool, integer(record(active.reserved)[tool], 0, 0, 1)]));
      const profile = campaign.getStageProfile();
      s.activeBattle = { battleId: active.battleId, stage: s.stage, reserved, profile, options: campaign._optionsFor(reserved, profile, active.battleId) };
      s.phase = 'battle';
    } else {
      s.phase = source.phase === 'shop' && campaign.shopUnlocked ? 'shop' : 'map';
    }
    const last = record(source.lastBattle);
    if (validId(last.battleId) && ['win', 'loss', 'tie', 'abandoned'].includes(last.outcome)) {
      s.lastBattle = { battleId: last.battleId, stage: integer(last.stage, 1, 1, STAGE_CAP), outcome: last.outcome, reward: last.outcome === 'win' ? integer(last.reward, 0, 0, 300) : 0, summary: last.summary ? battleSummary(last.summary) : null };
    }
    return campaign;
  }

  exportState() { return copy(this.state); }
  toJSON() { return this.exportState(); }

  getStageProfile() {
    const { stage, learning } = this.state;
    const size = stage <= 3 ? 4 : stage <= 9 ? 6 : stage <= 17 ? 8 : stage <= 25 ? 10 : 12;
    const baseStrength = 18 + 78 * (1 - Math.exp(-(stage - 1) / 18));
    const adaptation = round(clamp((learning.playerRating - 1000) / 300, -2, 2) * Math.min(1, learning.games / 10));
    const strength = round(clamp(baseStrength + adaptation, 16, 96));
    const preferences = Object.fromEntries(CATEGORIES.map(category => {
      const entry = learning.policy[category];
      return [category, Math.max(0.05, entry.mean + 0.14 / Math.sqrt(entry.count + 1))];
    }));
    const total = Object.values(preferences).reduce((sum, value) => sum + value, 0);
    const policy = Object.fromEntries(CATEGORIES.map(category => [category, preferences[category] / total]));
    const rank = strength < 35 ? '初见' : strength < 50 ? '入门' : strength < 65 ? '熟练' : strength < 78 ? '高手' : strength < 88 ? '大师' : '宗师';
    const boss = stage % 5 === 0;
    return {
      stage, size, strength, baseStrength: round(baseStrength), adaptation,
      memoryCapacity: Math.min(size * size, Math.max(4, Math.round(4 + (size * size - 4) * (strength / 100) ** 1.7))),
      retention: clamp(0.43 + strength * 0.0056, 0.5, 0.98),
      rank, boss, learningGames: learning.games, policy,
      description: `${size} × ${size} 棋盘 · ${rank}${boss ? '守关者，初始能量 +1' : '对手'}。基础强度随关卡连续增长；本地对局统计带来小幅适应。`,
    };
  }

  _selectedStock() {
    return [...new Set(this.state.equipped)].filter(tool => TOOLS.includes(tool) && this.state.inventory[tool] > 0).slice(0, this.loadoutCapacity);
  }

  _optionsFor(reserved, profile, battleId = null) {
    const difficulty = profile.strength < 36 ? 'easy' : profile.strength < 70 ? 'normal' : 'hard';
    return {
      size: profile.size, mode: 'ai', difficulty, aiProfile: copy(profile),
      campaign: { stage: profile.stage, boss: profile.boss, battleId }, battleId,
      players: [
        { type: 'human', name: '你', initialEnergy: 3 + this.state.upgrades.battery, perks: { peekDiscount: Boolean(this.state.upgrades.scout) }, inventory: copy(reserved) },
        { type: 'bot', name: `${profile.boss ? '守关者' : '记忆旅人'} · ${profile.stage}`, difficulty, initialEnergy: profile.boss ? 4 : 3, perks: { peekDiscount: false }, inventory: { radar: profile.stage >= 10 ? 1 : 0, anchor: profile.stage >= 20 ? 1 : 0, break: 0 }, aiProfile: copy(profile) },
      ],
    };
  }

  /** Previewing, opening setup, and cancelling setup never consume charges. */
  getBattleOptions() {
    if (this.state.activeBattle) return copy(this.state.activeBattle.options);
    const selected = this._selectedStock();
    const reserved = Object.fromEntries(TOOLS.map(tool => [tool, selected.includes(tool) ? 1 : 0]));
    return this._optionsFor(reserved, this.getStageProfile());
  }

  startBattle() {
    const s = this.state;
    if (s.phase === 'battle' || s.activeBattle) return null;
    const selected = this._selectedStock();
    const reserved = Object.fromEntries(TOOLS.map(tool => [tool, selected.includes(tool) ? 1 : 0]));
    const profile = this.getStageProfile();
    s.battleSequence = Math.min(COIN_CAP, s.battleSequence + 1);
    const battleId = `${s.id}:${s.battleSequence}:${newId().slice(9)}`;
    const options = this._optionsFor(reserved, profile, battleId);
    for (const tool of selected) s.inventory[tool]--;
    s.equipped = selected.filter(tool => s.inventory[tool] > 0);
    s.activeBattle = { battleId, stage: s.stage, reserved, profile, options };
    s.phase = 'battle';
    return copy({ battleId, options, profile });
  }

  canPurchase(id) {
    const item = SHOP_CATALOG.find(entry => entry.id === id);
    if (!item || !this.shopUnlocked || this.state.activeBattle || this.state.phase === 'battle' || this.state.coins < item.price) return false;
    return item.type === 'consumable' ? this.state.inventory[item.toolId] < item.max : this.state.upgrades[item.id] < item.max;
  }

  purchase(id) {
    if (!this.canPurchase(id)) return false;
    const item = SHOP_CATALOG.find(entry => entry.id === id);
    this.state.coins -= item.price;
    if (item.type === 'consumable') this.state.inventory[item.toolId]++;
    else this.state.upgrades[item.id]++;
    return true;
  }

  equip(toolId) {
    const s = this.state;
    if (!TOOLS.includes(toolId) || s.activeBattle || s.phase === 'battle') return false;
    if (s.equipped.includes(toolId)) {
      s.equipped = s.equipped.filter(tool => tool !== toolId);
      return true;
    }
    if (s.inventory[toolId] < 1 || s.equipped.length >= this.loadoutCapacity) return false;
    s.equipped.push(toolId);
    return true;
  }

  openShop() {
    if (!this.shopUnlocked || this.state.activeBattle || this.state.phase === 'battle') return false;
    this.state.phase = 'shop';
    return true;
  }

  openMap() {
    if (this.state.activeBattle || this.state.phase === 'battle') return false;
    this.state.phase = 'map';
    return true;
  }

  _updatePolicy(category, reward) {
    const entry = this.state.learning.policy[category];
    const alpha = entry.count < 4 ? 0.28 : 0.12;
    entry.mean = clamp(entry.mean * (1 - alpha) + clamp(reward, 0, 1) * alpha, 0.05, 0.95);
    entry.count = Math.min(COIN_CAP, entry.count + 1);
  }

  _pairAccuracy(gameState, index) {
    const players = Array.isArray(gameState.players) ? gameState.players : [];
    const player = record(players[index]);
    const pairs = Math.max(0, finite(player.pairs, 0));
    const attempts = finite(player.attempts, finite(player.pairAttempts, finite(player.turns, NaN)));
    if (Number.isFinite(attempts) && attempts > 0) return clamp(pairs / attempts, 0, 1);
    if (Number.isFinite(player.misses)) return clamp(pairs / Math.max(1, pairs + Math.max(0, player.misses)), 0, 1);
    const estimatedAttempts = Math.max(pairs, finite(gameState.turns, 0) / Math.max(1, players.length));
    return clamp(pairs / Math.max(1, estimatedAttempts), 0, 1);
  }

  _learn(gameState, outcome, profile) {
    const learning = this.state.learning;
    const humanResult = outcome === 'win' ? 1 : outcome === 'tie' ? 0.5 : 0;
    const botResult = 1 - humanResult;
    const humanAccuracy = this._pairAccuracy(gameState, 0);
    const botAccuracy = this._pairAccuracy(gameState, 1);
    const opponentRating = 700 + profile.strength * 9;
    const expected = 1 / (1 + 10 ** ((opponentRating - learning.playerRating) / 400));
    learning.playerRating = round(clamp(learning.playerRating + 24 * (humanResult - expected) + 4 * (humanAccuracy - learning.pairAccuracy), 600, 1800));
    learning.pairAccuracy = clamp(learning.pairAccuracy * 0.8 + humanAccuracy * 0.2, 0, 1);
    learning.games = Math.min(COIN_CAP, learning.games + 1);
    learning.lastOutcome = outcome;
    learning.lastPairAccuracy = humanAccuracy;
    const aliases = { peek: 'information', radar: 'information', double: 'burst', anchor: 'defense', break: 'defense', swap: 'pressure', fog: 'pressure', freeze: 'pressure' };
    const samples = Array.isArray(gameState.learningSamples) ? gameState.learningSamples.slice(-2048) : [];
    for (const raw of samples) {
      const sample = record(raw);
      const category = sample.category ?? sample.family ?? aliases[sample.tool ?? sample.type ?? sample.action];
      if (!CATEGORIES.includes(category)) continue;
      const rawReward = finite(sample.reward, typeof sample.success === 'boolean' ? (sample.success ? 1 : 0) : NaN);
      if (!Number.isFinite(rawReward)) continue;
      const normalized = clamp(rawReward, 0, 1);
      const playerIndex = sample.playerIndex ?? sample.player;
      if (playerIndex !== 0 && playerIndex !== 1) continue;
      const botReward = playerIndex === 0 ? 1 - normalized : normalized;
      this._updatePolicy(category, botReward * 0.8 + botResult * 0.2);
      learning.totalSamples = Math.min(COIN_CAP, learning.totalSamples + 1);
    }
    // Summary statistics provide a signal even in games with no tools used.
    this._updatePolicy('information', botAccuracy * 0.7 + botResult * 0.3);
    this._updatePolicy('burst', 0.35 + botResult * 0.3);
  }

  settleBattle(battleId, gameState) {
    const s = this.state;
    const active = s.activeBattle;
    const envelope = record(gameState);
    const game = record(envelope.version === 2 ? envelope.state : envelope);
    if (!active || s.phase !== 'battle' || active.battleId !== battleId || s.recordedBattles.includes(battleId) || (game.status !== 'finished' && game.phase !== 'finished')) return false;
    if (game.battleId != null && game.battleId !== battleId) return false;
    if (game.size != null && game.size !== active.profile.size) return false;
    if (game.matchedPairs != null && game.matchedPairs !== active.profile.size ** 2 / 2) return false;
    if (!Array.isArray(game.players) || game.players.length !== 2 || game.players.some(player => !Number.isFinite(player?.score) || player.score < 0)) return false;
    const winners = game.winners ?? record(game.lastEvent).winners;
    if (!Array.isArray(winners) || winners.length < 1 || winners.length > 2 || new Set(winners).size !== winners.length || winners.some(index => index !== 0 && index !== 1)) return false;
    const best = Math.max(...game.players.map(player => player.score));
    const expectedWinners = game.players.flatMap((player, index) => player.score === best ? [index] : []);
    if (winners.length !== expectedWinners.length || expectedWinners.some(index => !winners.includes(index))) return false;
    const outcome = winners.length > 1 ? 'tie' : winners[0] === 0 ? 'win' : 'loss';
    const advanced = outcome === 'win' && !s.completedStages.includes(active.stage);
    const reward = advanced ? 90 + Math.min(210, active.stage * 10) : 0;
    const summary = battleSummary(game);
    this._learn(game, outcome, active.profile);
    s.recordedBattles.push(battleId);
    s.lastBattle = { battleId, stage: active.stage, outcome, reward, summary };
    if (advanced) {
      s.coins = Math.min(COIN_CAP, s.coins + reward);
      s.wins = Math.min(COIN_CAP, s.wins + 1);
      if (!s.completedStages.includes(active.stage)) s.completedStages.push(active.stage);
      s.stage = Math.min(STAGE_CAP, s.stage + 1);
    }
    s.activeBattle = null;
    s.phase = this.shopUnlocked ? 'shop' : 'map';
    return { accepted: true, outcome, reward, stage: s.stage, completedStage: active.stage, advanced, summary: copy(summary) };
  }

  /** An abandoned battle consumes its reserved loadout and yields no rewards or learning result. */
  abortBattle(battleId = this.state.activeBattle?.battleId) {
    const s = this.state;
    if (!s.activeBattle || s.activeBattle.battleId !== battleId || s.recordedBattles.includes(battleId)) return false;
    s.recordedBattles.push(battleId);
    s.lastBattle = { battleId, stage: s.activeBattle.stage, outcome: 'abandoned', reward: 0 };
    s.activeBattle = null;
    s.phase = this.shopUnlocked ? 'shop' : 'map';
    return true;
  }
}

export default Campaign;
