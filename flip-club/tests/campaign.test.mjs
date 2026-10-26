import test from 'node:test';
import assert from 'node:assert/strict';
import { Campaign, SHOP_CATALOG } from '../dist/campaign.js';
import { Game, continuousMemoryProfile } from '../dist/engine.js';

function finished(campaign, outcome = 'win', overrides = {}) {
  const size = campaign.state.activeBattle.profile.size;
  const scores = outcome === 'win' ? [625, 300] : outcome === 'loss' ? [300, 625] : [400, 400];
  return {
    status: 'finished', battleId: campaign.state.activeBattle.battleId,
    size, turns: size ** 2, matchedPairs: size ** 2 / 2,
    players: [
      { name: '你', score: scores[0], pairs: 5, attempts: 10 },
      { name: '记忆旅人', score: scores[1], pairs: 3, attempts: 9 },
    ],
    lastEvent: { winners: outcome === 'tie' ? [0, 1] : [outcome === 'win' ? 0 : 1] },
    ...overrides,
  };
}

function complete(campaign, outcome = 'win', overrides = {}) {
  const battle = campaign.startBattle();
  assert.ok(battle);
  return campaign.settleBattle(battle.battleId, finished(campaign, outcome, overrides));
}

function funded(upgrades = {}) {
  return Campaign.fromState({ version: 1, stage: 2, wins: 1, coins: 10000, completedStages: [1], upgrades });
}

function atomic(campaign, action) {
  const before = campaign.exportState();
  assert.equal(action(), false);
  assert.deepEqual(campaign.exportState(), before, 'invalid action mutates no coins, charges, learning, or progression');
}

test('a new run begins with a locked shop and no purchased advantage', () => {
  const campaign = new Campaign();
  assert.equal(campaign.state.stage, 1);
  assert.equal(campaign.state.coins, 40);
  assert.equal(campaign.shopUnlocked, false);
  assert.equal(campaign.loadoutCapacity, 2);
  assert.deepEqual(campaign.state.inventory, { radar: 0, anchor: 0, break: 0 });
  atomic(campaign, () => campaign.openShop());
  atomic(campaign, () => campaign.purchase('break'));
  assert.equal(campaign.getBattleOptions().players[0].initialEnergy, 3);
});

test('24 successive stages have different continuous strengths and progressively larger boards', () => {
  const campaign = new Campaign();
  const strengths = [], sizes = [], capacities = [], retention = [];
  for (let stage = 1; stage <= 24; stage++) {
    const profile = campaign.getStageProfile();
    assert.equal(profile.stage, stage);
    strengths.push(profile.strength); sizes.push(profile.size); capacities.push(profile.memoryCapacity); retention.push(profile.retention);
    const result = complete(campaign);
    assert.equal(result.accepted, true);
    assert.equal(result.advanced, true);
    assert.equal(result.stage, stage + 1);
  }
  assert.equal(new Set(strengths).size, 24);
  assert.ok(strengths.every((strength, i) => i === 0 || strength > strengths[i - 1]));
  assert.ok(sizes.every((size, i) => i === 0 || size >= sizes[i - 1]));
  assert.ok(capacities.every((capacity, i) => i === 0 || capacity >= capacities[i - 1]));
  assert.ok(retention.every((value, i) => i === 0 || value >= retention[i - 1]));
  assert.deepEqual([...new Set(sizes)], [4, 6, 8, 10]);
  const late = Campaign.fromState({ stage: 26 });
  assert.equal(late.getStageProfile().size, 12);
  assert.equal(campaign.state.wins, 24);
});

test('every stage profile carries the exact numerical capabilities passed to its bot', () => {
  for (const stage of [1, 2, 5, 10, 15, 20, 25, 40, 1000]) {
    const campaign = Campaign.fromState({ stage });
    const profile = campaign.getStageProfile();
    const options = campaign.getBattleOptions();
    assert.equal(options.size, profile.size);
    assert.equal(options.players[1].aiProfile.strength, profile.strength);
    assert.equal(options.players[1].aiProfile.memoryCapacity, Math.min(profile.size ** 2, Math.max(4, Math.round(4 + (profile.size ** 2 - 4) * (profile.strength / 100) ** 1.7))));
    assert.equal(options.players[1].aiProfile.retention, profile.retention);
    assert.deepEqual({ memoryCapacity: profile.memoryCapacity, retention: profile.retention }, continuousMemoryProfile(profile.size, profile.strength));
    assert.ok(profile.retention >= .5 && profile.retention <= .98);
    assert.ok(profile.memoryCapacity >= 4 && profile.memoryCapacity <= profile.size ** 2);
    assert.ok(Math.abs(Object.values(profile.policy).reduce((a, b) => a + b, 0) - 1) < 1e-10);
    assert.equal(options.players[1].initialEnergy, stage % 5 === 0 ? 4 : 3);
  }
});

test('a first victory unlocks the shop, grants one reward, and advances one stage', () => {
  const campaign = new Campaign();
  const battle = campaign.startBattle();
  const result = campaign.settleBattle(battle.battleId, finished(campaign));
  assert.deepEqual({ outcome: result.outcome, reward: result.reward, stage: result.stage, advanced: result.advanced }, { outcome: 'win', reward: 100, stage: 2, advanced: true });
  assert.equal(campaign.state.coins, 140);
  assert.equal(campaign.shopUnlocked, true);
  assert.equal(campaign.state.phase, 'shop');
  assert.deepEqual(campaign.state.completedStages, [1]);
  assert.equal(campaign.state.learning.games, 1);
});

test('losses and ties give no coins, do not advance, and still teach the local policy', () => {
  for (const outcome of ['loss', 'tie']) {
    const campaign = new Campaign();
    const result = complete(campaign, outcome);
    assert.equal(result.outcome, outcome);
    assert.equal(result.reward, 0);
    assert.equal(result.advanced, false);
    assert.equal(campaign.state.coins, 40);
    assert.equal(campaign.state.stage, 1);
    assert.equal(campaign.state.wins, 0);
    assert.equal(campaign.shopUnlocked, false);
    assert.equal(campaign.state.learning.games, 1);
    assert.equal(campaign.state.phase, 'map');
  }
});

test('repeated settlement and replay after reload never pay or learn twice', () => {
  let campaign = new Campaign();
  const battle = campaign.startBattle();
  const game = finished(campaign);
  assert.ok(campaign.settleBattle(battle.battleId, game));
  atomic(campaign, () => campaign.settleBattle(battle.battleId, game));
  campaign = Campaign.fromState(JSON.stringify(campaign));
  atomic(campaign, () => campaign.settleBattle(battle.battleId, game));
  assert.equal(campaign.state.coins, 140);
  assert.equal(campaign.state.learning.games, 1);
});

test('unfinished, foreign, incomplete, or inconsistent results are rejected atomically', () => {
  const campaign = new Campaign();
  const battle = campaign.startBattle();
  for (const overrides of [
    { status: 'playing' }, { battleId: 'foreign' }, { size: 12 }, { matchedPairs: 1 },
    { players: [] }, { players: [{ score: NaN }, { score: 0 }] },
    { players: [{ score: -1 }, { score: 0 }] }, { lastEvent: { winners: [1] } },
    { lastEvent: { winners: [0, 0] } }, { lastEvent: { winners: [2] } },
    { lastEvent: { winners: [] } }, { winners: [0, 1] },
  ]) atomic(campaign, () => campaign.settleBattle(battle.battleId, finished(campaign, 'win', overrides)));
  atomic(campaign, () => campaign.settleBattle('wrong-id', finished(campaign)));
  assert.ok(campaign.settleBattle(battle.battleId, finished(campaign)));
});

test('previewing and cancelling setup do not spend equipped charges', () => {
  const campaign = funded();
  campaign.purchase('radar'); campaign.purchase('anchor');
  campaign.equip('radar'); campaign.equip('anchor');
  const before = campaign.exportState();
  for (let i = 0; i < 10; i++) {
    const options = campaign.getBattleOptions();
    assert.deepEqual(options.players[0].inventory, { radar: 1, anchor: 1, break: 0 });
    options.players[0].inventory.radar = 99;
  }
  assert.deepEqual(campaign.exportState(), before);
  campaign.openMap(); campaign.openShop();
  assert.deepEqual(campaign.state.inventory, before.inventory);
});

test('starting reserves exactly one of each equipped charge and never refunds abandoning', () => {
  const campaign = funded();
  campaign.purchase('radar'); campaign.purchase('radar'); campaign.purchase('anchor');
  campaign.equip('radar'); campaign.equip('anchor');
  const battle = campaign.startBattle();
  assert.deepEqual(campaign.state.inventory, { radar: 1, anchor: 0, break: 0 });
  assert.deepEqual(battle.options.players[0].inventory, { radar: 1, anchor: 1, break: 0 });
  assert.deepEqual(campaign.state.equipped, ['radar']);
  assert.equal(campaign.startBattle(), null);
  assert.deepEqual(campaign.state.inventory, { radar: 1, anchor: 0, break: 0 });
  const coins = campaign.state.coins;
  assert.equal(campaign.abortBattle(battle.battleId), true);
  assert.equal(campaign.state.coins, coins);
  assert.equal(campaign.state.learning.games, 0);
  assert.deepEqual(campaign.state.inventory, { radar: 1, anchor: 0, break: 0 });
  atomic(campaign, () => campaign.abortBattle(battle.battleId));
  atomic(campaign, () => campaign.settleBattle(battle.battleId, { status: 'finished' }));
});

test('a saved active battle restores the same ID and loadout without deducting again', () => {
  let campaign = funded({ scout: 1 });
  campaign.purchase('radar'); campaign.equip('radar');
  const battle = campaign.startBattle();
  const snapshot = campaign.exportState();
  campaign = Campaign.fromState(JSON.stringify(snapshot));
  assert.equal(campaign.state.phase, 'battle');
  assert.equal(campaign.state.activeBattle.battleId, battle.battleId);
  assert.deepEqual(campaign.getBattleOptions(), battle.options);
  assert.deepEqual(campaign.state.inventory, snapshot.inventory);
  assert.equal(campaign.startBattle(), null);
  assert.ok(campaign.settleBattle(battle.battleId, finished(campaign)));
  assert.equal(campaign.state.inventory.radar, 0);
});

test('shop purchases debit the catalog price once and never exceed stock limits', () => {
  const campaign = funded();
  for (const item of SHOP_CATALOG.filter(item => item.type === 'consumable')) {
    const coins = campaign.state.coins;
    for (let n = 0; n < item.max; n++) assert.equal(campaign.purchase(item.id), true);
    assert.equal(campaign.state.coins, coins - item.max * item.price);
    assert.equal(campaign.state.inventory[item.toolId], item.max);
    atomic(campaign, () => campaign.purchase(item.id));
    assert.equal(campaign.canPurchase(item.id), false);
  }
  atomic(campaign, () => campaign.purchase('toString'));
  atomic(campaign, () => campaign.purchase('unknown'));
});

test('insufficient coins never change stock, and exact-price purchases stop at zero', () => {
  const campaign = Campaign.fromState({ wins: 1, stage: 2, coins: 39 });
  atomic(campaign, () => campaign.purchase('break'));
  const exact = Campaign.fromState({ wins: 1, stage: 2, coins: 40 });
  assert.equal(exact.purchase('break'), true);
  assert.equal(exact.state.coins, 0);
  atomic(exact, () => exact.purchase('break'));
});

test('two loadout slots force a choice; buying a belt permanently unlocks the third', () => {
  const campaign = funded();
  for (const tool of ['radar', 'anchor', 'break']) campaign.purchase(tool);
  assert.equal(campaign.equip('radar'), true);
  assert.equal(campaign.equip('anchor'), true);
  atomic(campaign, () => campaign.equip('break'));
  assert.equal(campaign.purchase('belt'), true);
  assert.equal(campaign.loadoutCapacity, 3);
  assert.equal(campaign.equip('break'), true);
  assert.deepEqual(campaign.state.equipped, ['radar', 'anchor', 'break']);
  atomic(campaign, () => campaign.purchase('belt'));
  assert.equal(campaign.equip('anchor'), true);
  assert.deepEqual(campaign.state.equipped, ['radar', 'break']);
  atomic(campaign, () => campaign.equip('missing'));
});

test('permanent upgrades survive replay and change the human next battle options', () => {
  let campaign = funded();
  const initialCoins = campaign.state.coins;
  assert.equal(campaign.purchase('battery'), true);
  assert.equal(campaign.purchase('scout'), true);
  campaign = Campaign.fromState(JSON.stringify(campaign));
  const options = campaign.getBattleOptions();
  assert.equal(options.players[0].initialEnergy, 4);
  assert.equal(options.players[0].perks.peekDiscount, true);
  assert.equal(options.players[1].perks.peekDiscount, false);
  assert.equal(campaign.state.coins, initialCoins - 150 - 180);
  atomic(campaign, () => campaign.purchase('battery'));
  atomic(campaign, () => campaign.purchase('scout'));
  complete(campaign, 'loss');
  assert.equal(campaign.getBattleOptions().players[0].initialEnergy, 4);
});

test('no shop or loadout mutation is permitted during a live battle', () => {
  const campaign = funded();
  campaign.purchase('radar');
  campaign.startBattle();
  atomic(campaign, () => campaign.purchase('break'));
  atomic(campaign, () => campaign.equip('radar'));
  atomic(campaign, () => campaign.openShop());
  atomic(campaign, () => campaign.openMap());
  atomic(campaign, () => campaign.abortBattle('foreign'));
  assert.equal(campaign.canPurchase('battery'), false);
});

test('actual bounded tool outcomes change the next bot policy instead of only counters', () => {
  const campaign = new Campaign();
  const before = campaign.getStageProfile().policy;
  const samples = Array.from({ length: 20 }, () => [
    { player: 1, family: 'defense', tool: 'shield', reward: 1 },
    { player: 1, family: 'pressure', tool: 'jam', reward: 0 },
  ]).flat();
  complete(campaign, 'loss', { learningSamples: samples });
  const after = campaign.getStageProfile().policy;
  assert.ok(after.defense > before.defense);
  assert.ok(after.pressure < before.pressure);
  assert.ok(after.defense > after.pressure * 3);
  assert.equal(campaign.state.learning.totalSamples, 40);
  const restored = Campaign.fromState(JSON.stringify(campaign));
  assert.deepEqual(restored.getBattleOptions().players[1].aiProfile.policy, after);
});

test('zero rewards represent failure and human successes are inverse opponent signals', () => {
  const botFailure = new Campaign(), humanSuccess = new Campaign();
  complete(botFailure, 'tie', { learningSamples: [{ player: 1, family: 'pressure', reward: 0 }] });
  complete(humanSuccess, 'tie', { learningSamples: [{ player: 0, family: 'pressure', reward: 1 }] });
  assert.equal(botFailure.state.learning.policy.pressure.mean, humanSuccess.state.learning.policy.pressure.mean);
  assert.ok(botFailure.state.learning.policy.pressure.mean < .5);
});

test('malformed learning samples cannot poison the policy or its normalization', () => {
  const campaign = new Campaign();
  complete(campaign, 'tie', { learningSamples: [null, {}, { player: 9, family: 'pressure', reward: 1 }, { player: 1, family: 'unknown', reward: 1 }, { player: 1, family: 'defense', reward: NaN }, { player: 1, family: 'defense', reward: Infinity }] });
  assert.equal(campaign.state.learning.totalSamples, 0);
  const policy = campaign.getStageProfile().policy;
  assert.ok(Object.values(policy).every(Number.isFinite));
  assert.ok(Math.abs(Object.values(policy).reduce((a, b) => a + b, 0) - 1) < 1e-10);
});

test('skill adaptation remains bounded, varies smoothly, and is persisted', () => {
  const strong = Campaign.fromState({ stage: 12, learning: { games: 100, playerRating: 1800 } });
  const weak = Campaign.fromState({ stage: 12, learning: { games: 100, playerRating: 600 } });
  assert.ok(strong.getStageProfile().strength > weak.getStageProfile().strength);
  assert.ok(strong.getStageProfile().adaptation <= 2);
  assert.ok(weak.getStageProfile().adaptation >= -2);
  const campaign = new Campaign();
  complete(campaign, 'win');
  assert.equal(campaign.state.learning.lastOutcome, 'win');
  assert.equal(campaign.state.learning.lastPairAccuracy, .5);
  assert.notEqual(campaign.state.learning.playerRating, 1000);
  assert.deepEqual(Campaign.fromState(JSON.stringify(campaign)).state.learning, campaign.state.learning);
});

test('saved results retain bounded scores and names for the result screen after reload', () => {
  let campaign = new Campaign();
  const result = complete(campaign);
  assert.equal(result.summary.players[0].score, 625);
  result.summary.players[0].score = 9999;
  assert.equal(campaign.state.lastBattle.summary.players[0].score, 625);
  campaign = Campaign.fromState(JSON.stringify(campaign));
  assert.equal(campaign.state.lastBattle.summary.players[0].score, 625);
  assert.equal(campaign.state.lastBattle.summary.players[1].name, '记忆旅人');
  assert.equal(campaign.state.lastBattle.summary.turns, 16);
});

test('all returned objects are defensive copies', () => {
  const campaign = funded();
  const state = campaign.exportState();
  state.coins = 0; state.learning.policy.pressure.mean = NaN;
  assert.equal(campaign.state.coins, 10000);
  assert.equal(campaign.state.learning.policy.pressure.mean, .5);
  const battle = campaign.startBattle();
  battle.profile.strength = 0;
  battle.options.players[0].initialEnergy = 99;
  assert.notEqual(campaign.state.activeBattle.profile.strength, 0);
  assert.equal(campaign.getBattleOptions().players[0].initialEnergy, 3);
});

test('invalid and unsupported save payloads recover to a safe playable campaign', () => {
  for (const saved of [null, undefined, true, [], 'bad json', '{', '{"version":999}']) {
    const campaign = Campaign.fromState(saved);
    assert.equal(campaign.state.stage, 1);
    assert.equal(campaign.state.phase, 'map');
    assert.equal(campaign.state.coins, 40);
    assert.ok(campaign.startBattle());
  }
});

test('corrupt save fields are bounded and impossible stock, upgrades, and phases are cleaned', () => {
  const campaign = Campaign.fromState({
    id: '<script>', stage: -10, coins: -20, wins: Infinity, battleSequence: NaN, phase: 'shop',
    inventory: { radar: -1, anchor: 99, break: NaN, cheat: 999 },
    equipped: ['anchor', 'anchor', 'radar', 'missing'], upgrades: { battery: 99, scout: -1, belt: 'yes' },
    completedStages: [1, 2, -1, '3'], recordedBattles: ['valid-id', 'valid-id', '<bad>'],
    learning: { playerRating: Infinity, pairAccuracy: -100, policy: { pressure: { mean: NaN, count: -3 } } },
  });
  assert.equal(campaign.state.stage, 1);
  assert.equal(campaign.state.coins, 0);
  assert.equal(campaign.state.wins, 0);
  assert.equal(campaign.state.phase, 'map');
  assert.deepEqual(campaign.state.inventory, { radar: 0, anchor: 5, break: 0 });
  assert.deepEqual(campaign.state.equipped, ['anchor']);
  assert.deepEqual(campaign.state.upgrades, { battery: 1, scout: 0, belt: 0 });
  assert.deepEqual(campaign.state.completedStages, []);
  assert.deepEqual(campaign.state.recordedBattles, ['valid-id']);
  assert.equal(campaign.state.learning.policy.pressure.mean, .5);
  assert.equal(campaign.state.learning.playerRating, 1000);
});

test('recorded or wrong-stage active battle saves cannot resurrect a payout', () => {
  const original = new Campaign();
  const battle = original.startBattle();
  const state = original.exportState();
  for (const modified of [{ ...state, recordedBattles: [battle.battleId] }, { ...state, stage: 2 }]) {
    const campaign = Campaign.fromState(modified);
    assert.equal(campaign.state.activeBattle, null);
    assert.equal(campaign.state.phase, 'map');
    atomic(campaign, () => campaign.settleBattle(battle.battleId, { status: 'finished' }));
  }
});

test('late campaign rewards and coin totals stay bounded without cap-stage farming', () => {
  const campaign = Campaign.fromState({ stage: 1000000, wins: 1, coins: 999999990 });
  const first = complete(campaign);
  assert.equal(first.reward, 300);
  assert.equal(campaign.state.coins, 1000000000);
  const restored = Campaign.fromState(JSON.stringify(campaign));
  const second = complete(restored);
  assert.equal(second.reward, 0);
  assert.equal(second.advanced, false);
  assert.equal(restored.state.coins, 1000000000);
});

test('repeated battle IDs remain unique even on the same stage after losses or abandonments', () => {
  let campaign = new Campaign();
  const ids = [];
  for (let i = 0; i < 30; i++) {
    const battle = campaign.startBattle();
    ids.push(battle.battleId);
    if (i % 2) campaign.abortBattle();
    else campaign.settleBattle(battle.battleId, finished(campaign, 'loss'));
    campaign = Campaign.fromState(JSON.stringify(campaign));
  }
  assert.equal(new Set(ids).size, 30);
  assert.equal(campaign.state.stage, 1);
  assert.equal(campaign.state.coins, 40);
  assert.equal(campaign.state.learning.games, 15);
});

test('a real battle, including engine-generated tool samples, settles from an exported save', () => {
  const campaign = new Campaign();
  const battle = campaign.startBattle();
  const game = new Game({ ...battle.options, rng: () => .4261 });
  game.start();
  let steps = 0;
  while (game.state.status !== 'finished' && steps++ < 2000) {
    if (game.state.status === 'resolving') { game.resolve(); continue; }
    if (game.state.status === 'peeking') { game.resolvePeek(); continue; }
    if (game.state.players[game.state.current].type === 'bot') {
      const action = game.chooseAiAction();
      assert.ok(action);
      assert.equal(action.type === 'flip' ? game.flip(action.id) : game.useTool(action.type, action.ids), true);
      continue;
    }
    // An informed human is represented here by selecting genuine pairs from the test fixture.
    if (!game.state.selected.length && game.canUseTool('double')) { game.useTool('double'); continue; }
    const first = game.state.selected[0];
    const card = first === undefined ? game.state.cards.find(card => !card.matched) : game.state.cards.find(card => !card.matched && card.id !== first && card.value === game.state.cards[first].value);
    assert.ok(card);
    assert.equal(game.flip(card.id), true);
  }
  assert.equal(game.state.status, 'finished');
  assert.ok(game.state.learningSamples.length > 0);
  const result = campaign.settleBattle(battle.battleId, game.exportState());
  assert.equal(result.accepted, true);
  assert.equal(campaign.state.learning.games, 1);
  assert.equal(campaign.state.learning.totalSamples, game.state.learningSamples.length);
  assert.equal(result.summary.turns, game.state.turns);
  const next = new Game(campaign.getBattleOptions());
  assert.deepEqual(next.state.players[1].aiProfile.policy, campaign.getStageProfile().policy);
});
