import test from 'node:test';
import assert from 'node:assert/strict';
import { mountCampaign } from '../dist/campaign-ui.js';
import { Campaign } from '../dist/campaign.js';
import { Game } from '../dist/engine.js';

const KEY = 'flip-club-campaign-v1';

/** Minimal DOM ports; Game and Campaign remain the production implementations.
 * Hooks deliberately render synchronously, matching app.js and exercising reentrant saves.
 */
function harness(t, saved = {}) {
  const previous = Object.fromEntries(['document', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  t.after(() => {
    for (const key of Object.keys(previous)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  });
  const storage = new Map([[KEY, JSON.stringify(saved)]]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const nodes = new Map(), documentListeners = new Map();
  function node(selector) {
    if (!nodes.has(selector)) {
      const events = new Map(), classes = new Set();
      nodes.set(selector, {
        hidden: false, title: '', textContent: '', innerHTML: '', open: false, dataset: {},
        classList: { toggle(name, state) { if (state) classes.add(name); else classes.delete(name); } },
        setAttribute() {}, addEventListener(type, listener) { events.set(type, listener); },
        showModal() { this.open = true; }, close() { this.open = false; },
        dispatch(type, event = {}) { events.get(type)?.(event); },
      });
    }
    return nodes.get(selector);
  }
  const modes = ['campaign', 'free'].map(mode => { const button = node(`mode:${mode}`); button.dataset.playMode = mode; return button; });
  globalThis.document = {
    querySelector: node, querySelectorAll: selector => selector === '[data-play-mode]' ? modes : [],
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  let game = new Game({ rng: () => .35 }), paused = false, elapsed = 0, api;
  const render = () => { api?.beforeRender(game); api?.afterRender(); };
  const setPaused = value => { if (paused !== value) { paused = value; render(); } };
  const hooks = {
    getGame: () => game, getElapsed: () => elapsed, isPaused: () => paused,
    freeze: () => setPaused(true), resume: () => setPaused(false),
    loadGame(instance, time = 0, pause = true) { game = instance; elapsed = time; paused = pause; render(); },
    start() { if (game.start()) render(); },
    newFreeGame() { game = new Game(); paused = false; elapsed = 0; render(); },
    toast() {}, confirm(title, copy, action) { action(); },
  };
  api = mountCampaign(hooks);
  render(); // app.js renders once after mountCampaign returns its controller.
  return {
    get game() { return game; }, get paused() { return paused; }, get api() { return api; }, render, node,
    saved: () => JSON.parse(storage.get(KEY)),
    mode: value => node(`mode:${value}`).dispatch('click'),
    action(value) { documentListeners.get('click')({ target: { closest: selector => selector === '[data-campaign-action]' ? { dataset: { campaignAction: value } } : null } }); },
  };
}

function startedCampaign() {
  const campaign = new Campaign();
  const battle = campaign.startBattle();
  const game = new Game({ ...battle.options, rng: () => .425 });
  game.start();
  return { campaign, battle, game };
}

function completeGame(game) {
  assert.equal(game.useTool('double'), true);
  const pairs = new Map();
  for (const card of game.state.cards) {
    if (!pairs.has(card.value)) pairs.set(card.value, []);
    pairs.get(card.value).push(card.id);
  }
  for (const [a, b] of pairs.values()) {
    assert.equal(game.flip(a), true); assert.equal(game.flip(b), true); assert.equal(game.resolve(), true);
  }
  assert.equal(game.state.status, 'finished');
  assert.deepEqual(game.state.lastEvent.winners, [0]);
}

test('missing saved game in free mode abandons the lost battle and permits a new challenge', t => {
  const campaign = Campaign.fromState({ stage: 2, wins: 1, coins: 200, inventory: { radar: 1 }, equipped: ['radar'] });
  const battle = campaign.startBattle();
  const h = harness(t, { campaign: campaign.exportState(), mode: 'free', view: 'map', battleId: battle.battleId, game: null });
  h.mode('campaign');
  const repaired = h.saved();
  assert.equal(repaired.campaign.activeBattle, null);
  assert.equal(repaired.campaign.lastBattle.outcome, 'abandoned');
  assert.equal(repaired.campaign.coins, 200);
  assert.equal(repaired.campaign.inventory.radar, 0, 'reserved stock cannot be refunded by losing a save');
  assert.equal(repaired.view, 'map');
  assert.equal(h.node('#campaign-hub').innerHTML.includes('继续未完对局'), false);
  h.action('start');
  assert.equal(h.game.state.status, 'playing');
  assert.notEqual(h.game.state.battleId, battle.battleId);
  assert.equal(h.saved().campaign.activeBattle.battleId, h.game.state.battleId);
  assert.equal(h.saved().view, 'battle');
});

test('a stale UI battle ID cannot prevent a valid restored victory from settling exactly once', t => {
  const { campaign, battle, game } = startedCampaign();
  completeGame(game);
  const h = harness(t, { campaign: campaign.exportState(), mode: 'campaign', view: 'battle', battleId: 'stale-ui-id', result: { outcome: 'loss', reward: 0 }, game: game.exportState() });
  const settled = h.saved();
  assert.equal(settled.battleId, battle.battleId);
  assert.equal(settled.campaign.activeBattle, null);
  assert.equal(settled.campaign.stage, 2);
  assert.equal(settled.campaign.wins, 1);
  assert.equal(settled.campaign.coins, 140);
  assert.equal(settled.campaign.learning.games, 1);
  assert.equal(settled.result.outcome, 'win');
  assert.equal(settled.result.reward, 100);
  assert.ok(h.api.resultOverlay().includes('获得 100 金币'));
  for (let i = 0; i < 8; i++) h.render();
  assert.equal(h.saved().campaign.coins, 140);
  assert.equal(h.saved().campaign.learning.games, 1);
  assert.deepEqual(h.saved().campaign.recordedBattles, [battle.battleId]);
});

test('a valid mid-scan save restores the exact observations, resumes, and spends no extra energy', t => {
  const { campaign, battle, game } = startedCampaign();
  assert.equal(game.useTool('peek', [0]), true);
  const exported = game.exportState();
  const h = harness(t, { campaign: campaign.exportState(), mode: 'campaign', view: 'battle', battleId: null, elapsed: 1234, game: exported });
  assert.deepEqual(h.game.exportState(), exported);
  assert.equal(h.paused, true);
  assert.equal(h.game.state.status, 'peeking');
  assert.equal(h.game.state.players[0].energy, 1);
  assert.equal(h.saved().elapsed, 1234);
  h.action('start');
  assert.equal(h.paused, false);
  assert.equal(h.game.state.status, 'peeking');
  assert.equal(h.game.resolvePeek(), true);
  h.render();
  assert.equal(h.game.resolvePeek(), false);
  assert.equal(h.game.state.players[0].energy, 1);
  assert.equal(h.saved().campaign.activeBattle.battleId, battle.battleId);
  assert.equal(h.saved().campaign.coins, 40);
  assert.equal(h.saved().campaign.learning.games, 0);
});

test('a valid resolving save resumes the same pair and cannot apply its score twice', t => {
  const { campaign, battle, game } = startedCampaign();
  const first = game.state.cards[0], mate = game.state.cards.find(card => card.id !== first.id && card.value === first.value);
  game.flip(first.id); game.flip(mate.id);
  const h = harness(t, { campaign: campaign.exportState(), mode: 'campaign', view: 'battle', battleId: battle.battleId, game: game.exportState() });
  assert.equal(h.game.state.status, 'resolving');
  assert.deepEqual(h.game.state.selected, [first.id, mate.id]);
  h.action('start');
  assert.equal(h.game.resolve(), true); h.render();
  assert.equal(h.game.resolve(), false);
  assert.equal(h.game.state.players[0].score, 100);
  assert.equal(h.saved().game.state.matchedPairs, 1);
  assert.equal(h.saved().game.state.turns, 1);
  assert.equal(h.saved().campaign.coins, 40);
});

test('a foreign saved game is rejected before loading and cannot earn or consume more resources', t => {
  const { campaign, battle } = startedCampaign();
  const foreign = new Game({ battleId: 'foreign-battle', size: 12 });
  foreign.start();
  const h = harness(t, { campaign: campaign.exportState(), mode: 'campaign', view: 'battle', battleId: battle.battleId, game: foreign.exportState() });
  const repaired = h.saved();
  assert.equal(repaired.campaign.activeBattle, null);
  assert.equal(repaired.campaign.lastBattle.battleId, battle.battleId);
  assert.equal(repaired.campaign.lastBattle.outcome, 'abandoned');
  assert.equal(repaired.campaign.coins, 40);
  assert.equal(repaired.campaign.learning.games, 0);
  assert.notEqual(h.game.state.battleId, 'foreign-battle');
  assert.equal(repaired.game, null);
  assert.equal(repaired.view, 'map');
  h.action('start');
  assert.equal(h.game.state.status, 'playing');
  assert.notEqual(h.game.state.battleId, battle.battleId);
});

test('mode changes preserve both in-flight games despite synchronous render and persist hooks', t => {
  const h = harness(t, { mode: 'free' });
  h.game.start(); h.game.flip(0); h.render();
  const originalFree = h.game.exportState();
  h.mode('campaign'); h.action('start');
  const campaignId = h.game.state.battleId;
  assert.equal(h.game.useTool('peek', [0]), true); h.render();
  const campaignSave = h.game.exportState();
  h.mode('free');
  assert.deepEqual(h.game.exportState(), originalFree);
  assert.equal(h.paused, false);
  assert.deepEqual(h.saved().game, campaignSave, 'rendering a free game cannot overwrite the campaign game');
  h.mode('campaign');
  assert.deepEqual(h.game.exportState(), campaignSave);
  assert.equal(h.paused, true);
  assert.equal(h.saved().campaign.activeBattle.battleId, campaignId);
  h.action('start');
  assert.equal(h.game.state.status, 'peeking');
  assert.equal(h.paused, false);
  assert.equal(h.saved().campaign.learning.games, 0);
});
