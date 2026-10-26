import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, TOOL_CATALOG } from '../dist/engine.js';

function seeded(seed = 42) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function pairs(game) {
  const byValue = new Map();
  for (const card of game.state.cards) {
    if (card.matched) continue;
    if (!byValue.has(card.value)) byValue.set(card.value, []);
    byValue.get(card.value).push(card.id);
  }
  return [...byValue.values()];
}

function play(game, a, b) {
  assert.equal(game.flip(a), true);
  assert.equal(game.flip(b), true);
  assert.equal(game.resolve(), true);
}

function miss(game) {
  const remaining = pairs(game);
  assert.ok(remaining.length >= 2);
  play(game, remaining[0][0], remaining[1][0]);
}

function applyAi(game) {
  const action = game.chooseAiAction();
  assert.ok(action, 'AI provides a legal next action');
  assert.equal(action.type === 'flip' ? game.flip(action.id) : game.useTool(action.type, action.ids), true);
}

function equipped(options = {}) {
  return new Game({
    size: 6,
    mode: 'local',
    players: [
      { type: 'human', initialEnergy: 6, inventory: { radar: 2, anchor: 2, break: 2 } },
      { type: 'human', initialEnergy: 6, inventory: { radar: 2, anchor: 2, break: 2 } },
    ],
    rng: seeded(),
    ...options,
  });
}

function atomic(game, action) {
  const before = JSON.stringify(game.exportState());
  assert.equal(action(), false);
  assert.equal(JSON.stringify(game.exportState()), before, 'rejected action changes no game state, charges, or counters');
}

function returnTo(game, index) {
  let attempts = 0;
  while (game.state.current !== index && attempts++ < 16) miss(game);
  assert.equal(game.state.current, index);
}

test('setup, pairing invariants, and sanitized snapshots for every board size', () => {
  for (const size of [4, 6, 8, 10, 12]) {
    const game = new Game({ size, rng: seeded(size) });
    assert.equal(game.state.cards.length, size * size);
    assert.equal(game.state.players.length, 2);
    assert.ok(pairs(game).every(pair => pair.length === 2));
    assert.ok(game.snapshot().cards.every(card => card.value === null));
    assert.equal(game.flip(0), false);
    assert.equal(game.start(), true);
    assert.equal(game.start(), false);
    assert.equal(game.flip(0), true);
    const copy = game.snapshot();
    assert.equal(copy.cards[0].value, game.state.cards[0].value);
    assert.equal(copy.cards[1].value, null);
    copy.players[0].score = 999;
    copy.selected.push(99);
    copy.cards[0].value = -99;
    assert.equal(game.state.players[0].score, 0);
    assert.deepEqual(game.state.selected, [0]);
    assert.notEqual(game.state.cards[0].value, -99);
    const mate = pairs(game).find(pair => pair.includes(0)).find(id => id !== 0);
    game.flip(mate);
    assert.deepEqual(game.snapshot().cards.filter(card => card.value !== null).map(card => card.id).sort((a, b) => a - b), [0, mate].sort((a, b) => a - b));
  }
});

test('invalid calls are atomic and never spend energy', () => {
  const game = new Game({ size: 4, rng: seeded() });
  const unchanged = (fn) => {
    const before = structuredClone(game.state);
    assert.equal(fn(), false);
    assert.deepEqual(game.state, before);
  };
  unchanged(() => game.useTool('double'));
  unchanged(() => game.resolve());
  unchanged(() => game.resolvePeek());
  game.start();
  for (const id of [-1, 16, 1.5, NaN, '0', null, undefined]) unchanged(() => game.flip(id));
  unchanged(() => game.useTool('unknown'));
  unchanged(() => game.useTool('toString'));
  unchanged(() => game.useTool('peek', []));
  unchanged(() => game.useTool('peek', [16]));
  unchanged(() => game.useTool('peek', [0, 1]));
  unchanged(() => game.useTool('swap', [0, 0]));
  unchanged(() => game.useTool('swap', [0, 16]));
  unchanged(() => game.useTool('double', [0]));
  unchanged(() => game.useTool('peek', null));
  game.flip(0);
  unchanged(() => game.flip(0));
  unchanged(() => game.useTool('double'));
  const second = pairs(game).find(pair => pair.includes(0))[1] === 0 ? pairs(game).find(pair => pair.includes(0))[0] : pairs(game).find(pair => pair.includes(0))[1];
  game.flip(second);
  unchanged(() => game.flip(1));
  unchanged(() => game.useTool('peek', [1]));
  game.resolve();
  unchanged(() => game.flip(0));
  unchanged(() => game.useTool('swap', [0, 1]));
});

test('matches retain the turn once, then hand off after two pairs with a capped burst bonus', () => {
  const game = new Game({ size: 4, mode: 'local', rng: seeded() });
  game.start();
  assert.equal(game.useTool('double'), true);
  assert.equal(game.state.players[0].energy, 0);
  assert.ok(game.state.multiplier > 1);
  assert.equal(game.useTool('peek', [0]), false);
  const initialPairs = pairs(game);
  play(game, ...initialPairs[0]);
  assert.equal(game.state.current, 0);
  assert.equal(game.state.players[0].score, 150);
  assert.equal(game.state.players[0].energy, 1);
  assert.equal(game.state.players[0].combo, 1);
  assert.equal(game.state.multiplier, 1);
  assert.equal(game.state.toolUsed, false);
  assert.equal(game.useTool('peek', [initialPairs[1][0]]), false);
  play(game, ...initialPairs[1]);
  assert.equal(game.state.players[0].score, 275);
  assert.equal(game.state.current, 1);
  assert.equal(game.state.players[0].combo, 0);
  assert.equal(game.state.players[0].turnChain, 0);
  for (const pair of initialPairs.slice(2)) play(game, ...pair);
  assert.ok(game.state.players.every(player => player.energy >= 0 && player.energy <= 6));
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.turns, 8);
  assert.equal(game.state.matchedPairs, 8);
  assert.deepEqual(game.state.lastEvent.winners, [0]);
  assert.equal(game.flip(1), false);
  assert.equal(game.resolve(), false);
});

test('mismatches rotate local players and consume an armed multiplier', () => {
  for (const playerCount of [2, 3, 4]) {
    const game = new Game({ size: 4, mode: 'local', playerCount, rng: seeded() });
    game.start();
    play(game, ...pairs(game)[0]);
    assert.equal(game.state.players[0].combo, 1);
    assert.equal(game.useTool('double'), true);
    miss(game);
    assert.equal(game.state.current, 1);
    assert.equal(game.state.players[0].combo, 0);
    assert.equal(game.state.multiplier, 1);
    assert.equal(game.state.toolUsed, false);
    for (let i = 1; i < playerCount; i++) {
      assert.equal(game.state.current, i);
      miss(game);
    }
    assert.equal(game.state.current, 0);
  }
});

test('peek reveals exactly one card, spends once, and does not consume the turn', () => {
  const game = new Game({ size: 4, rng: seeded() });
  game.start();
  assert.equal(game.useTool('peek', [3]), true);
  assert.equal(game.state.status, 'peeking');
  assert.equal(game.state.players[0].energy, 1);
  assert.equal(game.state.turns, 0);
  assert.deepEqual(game.snapshot().cards.filter(card => card.value !== null).map(card => card.id), [3]);
  assert.equal(game.flip(0), false);
  assert.equal(game.resolvePeek(), true);
  assert.equal(game.state.peek, null);
  assert.ok(game.snapshot().cards.every(card => card.value === null));
  assert.equal(game.useTool('peek', [4]), false);
  assert.equal(game.state.current, 0);
});

test('swap preserves the complete pair multiset and tracks remembered positions', () => {
  for (const size of [4, 6, 8, 10, 12]) {
    const game = new Game({ size, difficulty: 'hard', rng: seeded(size) });
    game.start();
    const [a, b] = pairs(game).slice(0, 2).map(pair => pair[0]);
    play(game, a, b);
    assert.ok(game._memories.every(memory => memory.has(a) && memory.has(b)));
    const original = game.state.cards.map(card => card.value);
    assert.equal(game.useTool('swap', [a, b]), true);
    assert.equal(game.state.cards[a].value, original[b]);
    assert.equal(game.state.cards[b].value, original[a]);
    assert.deepEqual(game.state.cards.map(card => card.value).sort((x, y) => x - y), original.sort((x, y) => x - y));
    assert.ok(pairs(game).every(pair => pair.length === 2));
    assert.ok(game._memories.every(memory => memory.get(a) === game.state.cards[a].value && memory.get(b) === game.state.cards[b].value));
  }
});

test('swap moves partial knowledge without discovering either concealed value', () => {
  const game = new Game({ size: 4, difficulty: 'hard', rng: seeded() });
  game.start();
  const [[a], [b], [c], [d]] = pairs(game);
  game.useTool('peek', [a]);
  game.resolvePeek();
  play(game, c, d);
  const known = game.state.cards[a].value;
  assert.ok(game._memories.every(memory => memory.has(a) && !memory.has(b)));
  assert.equal(game.useTool('swap', [a, b]), true);
  assert.ok(game._memories.every(memory => !memory.has(a) && memory.get(b) === known));
});

test('AI remembers publicly observed pairs after its tactical tool decision', () => {
  const game = new Game({ size: 4, difficulty: 'hard', rng: seeded() });
  game.start();
  const [[a, b], [c]] = pairs(game);
  game.useTool('peek', [a]);
  game.resolvePeek();
  play(game, b, c);
  assert.equal(game.state.current, 1);
  let actions = 0;
  while (game.state.status === 'playing' && actions++ < 4) applyAi(game);
  assert.deepEqual([...game.state.selected].sort((x, y) => x - y), [a, b].sort((x, y) => x - y));
  game.resolve();
  assert.ok(game.state.players[1].score >= 100 && game.state.players[1].score <= 175);
});

test('AI choices are invariant to unobserved values and do not read concealed values', () => {
  const make = () => {
    const game = new Game({ size: 6, difficulty: 'hard', rng: seeded(341) });
    game.start();
    miss(game);
    return game;
  };
  const first = make();
  const second = make();
  const visible = new Set(second._memories[1].keys());
  const hidden = second.state.cards.filter(card => !visible.has(card.id));
  const hiddenValues = hidden.map(card => card.value).reverse();
  hidden.forEach((card, index) => { card.value = hiddenValues[index]; });
  assert.deepEqual(first.chooseAiAction(), second.chooseAiAction());
  // Any read of a concealed value now throws, catching accidental board scans in AI logic.
  for (const card of first.state.cards) {
    if (!visible.has(card.id)) Object.defineProperty(card, 'value', { get() { throw new Error('AI read a concealed value'); } });
  }
  assert.doesNotThrow(() => first.chooseAiAction());
});

test('AI finds the visible first card mate without consulting other concealed cards', () => {
  const game = new Game({ size: 4, difficulty: 'hard', rng: seeded() });
  game.start();
  const [[a, b], [c]] = pairs(game);
  game.useTool('peek', [a]);
  game.resolvePeek();
  play(game, b, c);
  game.useTool('double');
  game.flip(a);
  for (const card of game.state.cards) {
    if (card.id !== a) Object.defineProperty(card, 'value', { get() { throw new Error('concealed read'); } });
  }
  assert.deepEqual(game.chooseAiAction(), { type: 'flip', id: b });
});

test('AI memory is bounded by difficulty; hard retains all public observations', () => {
  for (const [difficulty, max] of [['easy', 6], ['normal', 12], ['hard', 64]]) {
    const game = new Game({ size: 8, difficulty, rng: seeded() });
    // Public flips can be replayed through turns without matching a pair.
    game.start();
    const cards = pairs(game).map(pair => pair[0]);
    for (let i = 0; i < cards.length; i += 2) play(game, cards[i], cards[i + 1]);
    assert.ok(game._memories[1].size <= max);
    if (difficulty === 'hard') assert.equal(game._memories[1].size, 32);
  }
});

test('complete seeded AI games finish legally for every size and difficulty', () => {
  for (const size of [4, 6, 8, 10, 12]) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      const game = new Game({ size, difficulty, rng: seeded(size * 71 + difficulty.length) });
      game.start();
      let actions = 0;
      while (game.state.status !== 'finished' && actions++ < 10000) {
        if (game.state.status === 'resolving') game.resolve();
        else if (game.state.status === 'peeking') game.resolvePeek();
        else if (game.state.current === 1) applyAi(game);
        else {
          // Human simulation alternates informed pairs and exploratory misses.
          if (actions % 3 === 0 && pairs(game).length > 1) miss(game);
          else play(game, ...pairs(game)[0]);
        }
      }
      assert.equal(game.state.status, 'finished', `${size}/${difficulty} finishes`);
      assert.equal(game.state.players.reduce((sum, player) => sum + player.pairs, 0), size * size / 2);
      assert.ok(game.state.cards.every(card => card.matched));
      assert.ok(game.state.players.every(player => player.energy >= 0 && player.energy <= 6));
    }
  }
});

test('a completed game can fairly declare a tie', () => {
  const game = new Game({ size: 4, mode: 'local', rng: seeded() });
  game.start();
  for (let i = 0; i < 8; i++) play(game, ...pairs(game)[0]);
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.players[0].score, 450);
  assert.equal(game.state.players[1].score, 450);
  assert.deepEqual(game.state.lastEvent.winners, [0, 1]);
});

test('custom rosters sanitize names and participant defaults while legacy options remain compatible', () => {
  const game = new Game({
    size: 12,
    difficulty: 'hard',
    players: [
      { name: '  Alice  ', type: 'human', difficulty: 'easy' },
      { name: '  \u0000\n  ', type: 'bot', difficulty: 'normal' },
      { name: '😀'.repeat(20), type: 'bot', difficulty: 'nonsense' },
      { name: 99, type: 'unknown' },
    ],
    rng: seeded(),
  });
  assert.equal(game.state.mode, 'custom');
  assert.equal(game.state.size, 12);
  assert.equal(game.state.players.length, 4);
  assert.deepEqual(game.state.players.map(p => p.name), ['Alice', '机器人 2', '😀'.repeat(16), '玩家 4']);
  assert.deepEqual(game.state.players.map(p => p.type), ['human', 'bot', 'bot', 'human']);
  assert.deepEqual(game.state.players.map(p => p.difficulty), ['easy', 'normal', 'hard', 'hard']);
  assert.ok(game.state.players.every(p => p.score === 0 && p.energy === 3 && p.pairs === 0 && p.combo === 0));
  const legacy = new Game({ mode: 'ai', difficulty: 'hard', rng: seeded() });
  assert.equal(legacy.state.mode, 'ai');
  assert.deepEqual(legacy.state.players.map(p => [p.name, p.type, p.difficulty]), [['玩家 1', 'human', 'hard'], ['记忆机器人', 'bot', 'hard']]);
  const local = new Game({ mode: 'local', playerCount: 4 });
  assert.equal(local.state.players.length, 4);
  assert.ok(local.state.players.every(p => p.type === 'human'));
});

test('invalid roster lengths fall back to legacy and valid boundary rosters accept 2–8 participants', () => {
  for (const players of [[], [{}], Array.from({ length: 9 }, () => ({ type: 'bot' })), null, 'bots']) {
    const game = new Game({ players, mode: 'local', playerCount: 3, rng: seeded() });
    assert.equal(game.state.mode, 'local');
    assert.equal(game.state.players.length, 3);
    assert.ok(game.state.players.every(p => p.type === 'human'));
  }
  for (const count of [2, 8]) {
    const game = new Game({ players: Array.from({ length: count }, () => null), rng: seeded() });
    assert.equal(game.state.mode, 'custom');
    assert.equal(game.state.players.length, count);
    assert.ok(game.state.players.every(p => p.type === 'human'));
  }
});

test('AI actions follow each current participant type, including bots in the first and last seats', () => {
  const game = new Game({
    players: [{ type: 'bot' }, { type: 'human' }, { type: 'bot' }, { type: 'human' }, { type: 'bot' }],
    rng: seeded(),
  });
  assert.equal(game.chooseAiAction(), null);
  game.start();
  for (let i = 0; i < 10; i++) {
    const bot = game.state.players[game.state.current].type === 'bot';
    assert.equal(game.chooseAiAction() !== null, bot);
    miss(game);
    assert.equal(game.state.current, (i + 1) % 5);
  }
});

test('each bot observes with its own configured difficulty', () => {
  const game = new Game({
    size: 12,
    players: [{ type: 'human' }, { type: 'bot', difficulty: 'easy' }, { type: 'bot', difficulty: 'normal' }, { type: 'bot', difficulty: 'hard' }],
    rng: seeded(785),
  });
  game.start();
  const sightings = pairs(game).map(pair => pair[0]);
  for (let i = 0; i < sightings.length; i += 2) play(game, sightings[i], sightings[i + 1]);
  assert.ok(game._memories[1].size <= 6);
  assert.equal(game._memories[2].size, 12);
  assert.equal(game._memories[3].size, 72);
  assert.equal(game.state.matchedPairs, 0);
});

test('a seeded 12×12 game with eight bots completes using public observations', () => {
  const game = new Game({
    size: 12,
    players: Array.from({ length: 8 }, (_, index) => ({ type: 'bot', difficulty: ['easy', 'normal', 'hard'][index % 3] })),
    rng: seeded(20261022),
  });
  game.start();
  const acted = new Set();
  let actions = 0;
  while (game.state.status !== 'finished' && actions++ < 100000) {
    if (game.state.status === 'resolving') game.resolve();
    else if (game.state.status === 'peeking') game.resolvePeek();
    else {
      acted.add(game.state.current);
      applyAi(game);
    }
  }
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.matchedPairs, 72);
  assert.equal(game.state.players.reduce((total, player) => total + player.pairs, 0), 72);
  assert.equal(acted.size, 8);
  assert.ok(game.state.cards.every(card => card.matched));
  assert.ok(game.state.players.every(player => player.energy >= 0 && player.energy <= 6));
});

test('mixed humans and multiple bots complete a seeded match', () => {
  const game = new Game({
    size: 10,
    players: [{ type: 'human' }, { type: 'bot', difficulty: 'normal' }, { type: 'human' }, { type: 'bot', difficulty: 'hard' }],
    rng: seeded(391),
  });
  game.start();
  let actions = 0;
  while (game.state.status !== 'finished' && actions++ < 10000) {
    if (game.state.status === 'resolving') game.resolve();
    else if (game.state.status === 'peeking') game.resolvePeek();
    else if (game.state.players[game.state.current].type === 'bot') applyAi(game);
    else if (pairs(game).length > 1 && actions % 3 === 0) miss(game);
    else play(game, ...pairs(game)[0]);
  }
  assert.equal(game.state.status, 'finished');
  assert.equal(game.state.matchedPairs, 50);
});

test('repeated swaps preserve every pair on larger boards', () => {
  for (const size of [10, 12]) {
    const game = new Game({ size, mode: 'local', rng: seeded(size) });
    const original = game.state.cards.map(card => card.value).sort((a, b) => a - b);
    game.start();
    for (let swap = 0; swap < 12; swap++) {
      while (!game.toolAvailability('swap').available) play(game, ...pairs(game)[0]);
      const remaining = pairs(game);
      assert.equal(game.useTool('swap', [remaining[0][0], remaining[1][0]]), true);
      assert.deepEqual(game.state.cards.map(card => card.value).sort((a, b) => a - b), original);
      assert.ok(pairs(game).every(pair => pair.length === 2));
      play(game, ...pairs(game)[0]);
    }
  }
});

test('shared tool catalog documents every cost, target, cooldown, and consumable', () => {
  assert.deepEqual(new Set(TOOL_CATALOG.map(tool => tool.id)), new Set(['peek', 'double', 'swap', 'jam', 'shield', 'drain', 'radar', 'anchor', 'break']));
  const costs = { peek: 2, double: 3, swap: 2, jam: 2, shield: 2, drain: 3, radar: 2, anchor: 2, break: 1 };
  for (const tool of TOOL_CATALOG) {
    assert.equal(tool.cost, costs[tool.id]);
    assert.ok(['card', 'cards2', 'opponent', 'none', 'cards3'].includes(tool.target));
    assert.ok(Number.isInteger(tool.cooldown) && tool.cooldown >= 0);
    assert.equal(typeof tool.name, 'string');
    assert.ok(tool.description.length > 0);
    assert.ok(tool.category.length > 0);
    assert.equal(Boolean(tool.consumable), ['radar', 'anchor', 'break'].includes(tool.id));
  }
});

test('all tool validation rejects atomically before spending resources', () => {
  const game = equipped();
  atomic(game, () => game.useTool('jam', [1]));
  game.start();
  for (const type of ['jam', 'drain', 'break']) {
    for (const target of [[], [0], [2], [-1], [1, 0], ['1'], [NaN]]) atomic(game, () => game.useTool(type, target));
  }
  atomic(game, () => game.useTool('break', [1]));
  atomic(game, () => game.useTool('radar', []));
  atomic(game, () => game.useTool('radar', [0, 0]));
  atomic(game, () => game.useTool('radar', [0, 1, 2, 3]));
  atomic(game, () => game.useTool('radar', [game.state.cards.length]));
  atomic(game, () => game.useTool('anchor', [1]));
  atomic(game, () => game.useTool('shield', [1]));
  assert.equal(game.canUseTool('peek', [0]), true);
  assert.equal(game.canUseTool('peek', [999]), false);
  assert.equal(game.toolAvailability('not-a-tool').available, false);
});

test('energy regenerates after misses and cannot become permanently locked', () => {
  const game = equipped({ players: [{ type: 'human', initialEnergy: 0 }, { type: 'human', initialEnergy: 0 }] });
  game.start();
  assert.equal(game.toolAvailability('peek').available, false);
  atomic(game, () => game.useTool('peek', [0]));
  miss(game);
  assert.equal(game.state.players[0].energy, 1);
  miss(game);
  miss(game);
  assert.equal(game.state.players[0].energy, 2);
  miss(game);
  assert.equal(game.state.current, 0);
  assert.equal(game.toolAvailability('peek').available, true);
  assert.equal(game.useTool('peek', [0]), true);
  game.resolvePeek();
  for (let i = 0; i < 20; i++) miss(game);
  assert.ok(game.state.players.every(player => player.energy === 6));
});

test('cooldowns count own attempts and prevent consecutive peek or burst spamming', () => {
  for (const [type, intervening] of [['peek', 1], ['double', 2]]) {
    const game = equipped();
    game.start();
    assert.equal(game.useTool(type, type === 'peek' ? [0] : []), true);
    if (game.state.status === 'peeking') game.resolvePeek();
    miss(game);
    returnTo(game, 0);
    assert.equal(game.toolAvailability(type).available, false);
    atomic(game, () => game.useTool(type, type === 'peek' ? [0] : []));
    for (let wait = 0; wait < intervening; wait++) {
      miss(game);
      returnTo(game, 0);
      assert.equal(game.toolAvailability(type).available, wait === intervening - 1);
    }
  }
});

test('jam lasts one opponent attempt and shield can cleanse it', () => {
  const game = equipped();
  game.start();
  assert.equal(game.useTool('jam', [1]), true);
  assert.equal(game.state.players[1].effects.jammed, true);
  miss(game);
  assert.equal(game.state.current, 1);
  assert.equal(game.toolAvailability('peek').available, false);
  assert.equal(game.toolAvailability('shield').available, true);
  atomic(game, () => game.useTool('peek', [0]));
  assert.equal(game.useTool('shield'), true);
  assert.equal(game.state.players[1].effects.jammed, false);
  miss(game);
  returnTo(game, 1);
  assert.equal(game.toolAvailability('peek').available, true);

  const expiry = equipped();
  expiry.start();
  expiry.useTool('jam', [1]);
  miss(expiry);
  miss(expiry);
  returnTo(expiry, 1);
  assert.equal(expiry.state.players[1].effects.jammed, false);
  assert.equal(expiry.toolAvailability('peek').available, true);
});

test('shield protects the intervening opponent window and expires after the next own attempt', () => {
  const game = equipped();
  game.start();
  game.useTool('shield');
  assert.equal(game.state.players[0].effects.shield, true);
  miss(game);
  assert.equal(game.state.players[0].effects.shield, true);
  miss(game);
  assert.equal(game.state.current, 0);
  miss(game);
  assert.equal(game.state.players[0].effects.shield, false, 'shield expires after the next owner attempt');

  const blocked = equipped();
  blocked.start();
  blocked.useTool('shield');
  miss(blocked);
  const targetEnergy = blocked.state.players[0].energy;
  assert.equal(blocked.useTool('drain', [0]), true);
  assert.equal(blocked.state.players[0].effects.shield, false);
  assert.equal(blocked.state.players[0].energy, targetEnergy);
  assert.equal(blocked.state.players[1].energy, 3);
  assert.equal(blocked.state.toolUsed, true);
});

test('drain steals at most two energy and never exceeds either resource bound', () => {
  const game = equipped({ players: [{ type: 'human', initialEnergy: 6 }, { type: 'human', initialEnergy: 1 }] });
  game.start();
  assert.equal(game.useTool('drain', [1]), true);
  assert.equal(game.state.players[0].energy, 4);
  assert.equal(game.state.players[1].energy, 0);
  const empty = equipped({ players: [{ type: 'human', initialEnergy: 6 }, { type: 'human', initialEnergy: 0 }] });
  empty.start();
  atomic(empty, () => empty.useTool('drain', [1]));
});

test('radar reveals only its chosen remaining cards and consumes a charge once', () => {
  const game = equipped();
  game.start();
  assert.equal(game.useTool('radar', [0, 2, 4]), true);
  assert.equal(game.state.status, 'peeking');
  assert.deepEqual(game.state.peekIds, [0, 2, 4]);
  assert.equal(game.state.players[0].inventory.radar, 1);
  assert.equal(game.state.players[0].energy, 4);
  assert.deepEqual(game.snapshot().cards.filter(card => card.value !== null).map(card => card.id), [0, 2, 4]);
  atomic(game, () => game.useTool('radar', [1]));
  game.resolvePeek();
  assert.deepEqual(game.state.peekIds, []);
  assert.ok(game.snapshot().cards.every(card => card.value === null));
  miss(game);
  returnTo(game, 0);
  assert.equal(game.useTool('radar', [1]), true);
  assert.equal(game.state.players[0].inventory.radar, 0);
  game.resolvePeek();
  miss(game);
  returnTo(game, 0);
  assert.equal(game.toolAvailability('radar').available, false);
  atomic(game, () => game.useTool('radar', [3]));
});

test('anchor prevents one miss handoff but does not bypass the two-match turn cap', () => {
  const game = equipped();
  game.start();
  assert.equal(game.useTool('anchor'), true);
  assert.equal(game.state.players[0].inventory.anchor, 1);
  miss(game);
  assert.equal(game.state.current, 0);
  assert.equal(game.state.toolUsed, false);
  miss(game);
  assert.equal(game.state.current, 1);

  const capped = equipped();
  capped.start();
  capped.useTool('anchor');
  play(capped, ...pairs(capped)[0]);
  assert.equal(capped.state.current, 0);
  play(capped, ...pairs(capped)[0]);
  assert.equal(capped.state.current, 1);
});

test('break spends its inventory only when an opposing shield exists', () => {
  const game = equipped();
  game.start();
  atomic(game, () => game.useTool('break', [1]));
  game.state.players[1].effects.shield = true;
  assert.equal(game.useTool('break', [1]), true);
  assert.equal(game.state.players[1].effects.shield, false);
  assert.equal(game.state.players[0].inventory.break, 1);
  assert.equal(game.state.players[0].energy, 5);
});

test('consumable tools require inventory and first-peek discount applies exactly once', () => {
  const game = equipped({ players: [{ type: 'human', initialEnergy: 6, perks: { peekDiscount: true } }, { type: 'human', initialEnergy: 6 }] });
  game.start();
  for (const tool of ['radar', 'anchor', 'break']) {
    assert.equal(game.toolAvailability(tool).available, false);
    atomic(game, () => game.useTool(tool, tool === 'radar' ? [0] : tool === 'break' ? [1] : []));
  }
  assert.equal(game.toolAvailability('peek').cost, 1);
  assert.equal(game.useTool('peek', [0]), true);
  assert.equal(game.state.players[0].energy, 5);
  game.resolvePeek();
  miss(game);
  returnTo(game, 0);
  miss(game);
  returnTo(game, 0);
  assert.equal(game.toolAvailability('peek').cost, 2);
});

test('serialized in-flight games retain observations, tools, and exact visible state', () => {
  const game = equipped({ players: [{ type: 'bot', difficulty: 'hard', initialEnergy: 6, inventory: { radar: 2 } }, { type: 'human', initialEnergy: 5 }] });
  game.start();
  game.useTool('radar', [1, 2, 3]);
  const serialized = JSON.parse(JSON.stringify(game.exportState()));
  const restored = Game.fromState(serialized);
  assert.deepEqual(restored.snapshot(), game.snapshot());
  assert.deepEqual(restored._memories.map(memory => [...memory]), game._memories.map(memory => [...memory]));
  restored.resolvePeek();
  game.resolvePeek();
  const [a, b] = pairs(game)[0];
  game.flip(a);
  restored.flip(a);
  const midway = Game.fromState(JSON.parse(JSON.stringify(restored.exportState())));
  assert.deepEqual(midway.snapshot(), restored.snapshot());
  game.flip(b);
  midway.flip(b);
  game.resolve();
  midway.resolve();
  assert.deepEqual(midway.snapshot(), game.snapshot());
  const detached = restored.exportState();
  if (detached.state) detached.state.players[0].score = 999;
  assert.equal(restored.state.players[0].score, 0);
});

test('state restoration rejects corrupt boards, players, phases, and numeric counters', () => {
  const game = equipped();
  game.start();
  const valid = game.exportState();
  for (const corrupt of [null, {}, { ...valid, state: { ...valid.state, size: 5 } }, { ...valid, state: { ...valid.state, cards: [] } }, { ...valid, state: { ...valid.state, players: [] } }, { ...valid, state: { ...valid.state, status: 'broken' } }, { ...valid, state: { ...valid.state, current: 99 } }]) {
    assert.throws(() => Game.fromState(corrupt));
  }
  const badPair = structuredClone(valid);
  badPair.state.cards[0].value = -999;
  assert.throws(() => Game.fromState(badPair));
  const badEnergy = structuredClone(valid);
  badEnergy.state.players[0].energy = NaN;
  assert.throws(() => Game.fromState(badEnergy));
});

test('continuous strength profiles produce different observed memory capacities without hidden reads', () => {
  const game = new Game({
    size: 12,
    players: [
      { type: 'bot', aiProfile: { strength: 0, policy: { information: 1, burst: 0, defense: 0, pressure: 0 } } },
      { type: 'bot', aiProfile: { strength: 40, policy: { information: 1, burst: 0, defense: 0, pressure: 0 } } },
      { type: 'bot', aiProfile: { strength: 100, policy: { information: 1, burst: 0, defense: 0, pressure: 0 } } },
    ],
    rng: seeded(203),
  });
  game.start();
  const sightings = pairs(game).map(pair => pair[0]);
  for (let i = 0; i < sightings.length; i += 2) play(game, sightings[i], sightings[i + 1]);
  assert.ok(game._memories[0].size < game._memories[1].size);
  assert.ok(game._memories[1].size < game._memories[2].size);
  const known = game._memories[game.state.current];
  for (const card of game.state.cards) {
    if (!known.has(card.id)) Object.defineProperty(card, 'value', { get() { throw new Error('profile AI inspected hidden value'); } });
  }
  assert.doesNotThrow(() => game.chooseAiAction());
});

test('bot tool attempts emit bounded campaign learning rewards', () => {
  const game = equipped({ players: [{ type: 'bot', initialEnergy: 6, aiProfile: { strength: 80 } }, { type: 'human', initialEnergy: 6 }] });
  game.start();
  assert.equal(game.useTool('double'), true);
  play(game, ...pairs(game)[0]);
  assert.ok(Array.isArray(game.state.learningSamples));
  assert.equal(game.state.learningSamples.length, 1);
  const sample = game.state.learningSamples[0];
  assert.equal(sample.player, 0);
  assert.equal(sample.family, 'burst');
  assert.equal(sample.tool, 'double');
  assert.ok(Number.isFinite(sample.reward) && sample.reward >= 0 && sample.reward <= 1);
});

test('seeded repeated equally strong profile matches finish without runaway monopolies', () => {
  let totalTurns = 0;
  const wins = [0, 0];
  for (let seed = 1; seed <= 12; seed++) {
    const game = new Game({
      size: 6,
      players: [0, 1].map(() => ({ type: 'bot', aiProfile: { strength: 65, policy: { information: 1, burst: 1, defense: 1, pressure: 1 } } })),
      rng: seeded(seed * 999),
    });
    game.start();
    let actions = 0;
    while (game.state.status !== 'finished' && actions++ < 10000) {
      if (game.state.status === 'resolving') game.resolve();
      else if (game.state.status === 'peeking') game.resolvePeek();
      else applyAi(game);
    }
    assert.equal(game.state.status, 'finished');
    assert.ok(game.state.players.every(player => player.pairs > 0));
    assert.ok(game.state.players.every(player => player.energy >= 0 && player.energy <= 6));
    assert.equal(game.state.players.reduce((count, player) => count + player.pairs, 0), 18);
    for (const winner of game.state.lastEvent.winners) wins[winner]++;
    totalTurns += game.state.turns;
  }
  assert.ok(totalTurns > 12 * 9);
  assert.ok(wins[0] > 0 && wins[1] > 0, `both starting seats can win across seeded trials: ${wins}`);
});

test('restored stochastic bots resume the exact PRNG stream and public observations through completion', () => {
  const original = new Game({
    size: 8,
    players: [0, 1].map(() => ({ type: 'bot', initialEnergy: 6, inventory: { radar: 2, anchor: 2, break: 2 }, aiProfile: { strength: 43 } })),
    rng: seeded(20261023),
  });
  original.start();
  for (let i = 0; i < 37; i++) {
    if (original.state.status === 'resolving') original.resolve();
    else if (original.state.status === 'peeking') original.resolvePeek();
    else applyAi(original);
  }
  const restored = Game.fromState(JSON.stringify(original.exportState()));
  let actions = 0;
  while (original.state.status !== 'finished' && actions++ < 20000) {
    assert.deepEqual(restored.exportState(), original.exportState());
    if (original.state.status === 'resolving') { original.resolve(); restored.resolve(); }
    else if (original.state.status === 'peeking') { original.resolvePeek(); restored.resolvePeek(); }
    else {
      const first = original.chooseAiAction(), second = restored.chooseAiAction();
      assert.deepEqual(first, second);
      for (const game of [original, restored]) assert.equal(first.type === 'flip' ? game.flip(first.id) : game.useTool(first.type, first.ids), true);
    }
  }
  assert.equal(original.state.status, 'finished');
  assert.deepEqual(restored.exportState(), original.exportState());
});

test('opposing shield consumes itself on jam and a second attack can affect the exposed owner', () => {
  const game = equipped();
  game.start();
  game.useTool('shield');
  miss(game);
  assert.equal(game.useTool('jam', [0]), true);
  assert.equal(game.state.players[0].effects.shield, false);
  assert.equal(game.state.players[0].effects.jammed, false);
  assert.equal(game.state.players[1].energy, 4);
  miss(game);
  miss(game);
  assert.equal(game.useTool('drain', [0]), true);
  assert.ok(game.state.players[0].energy <= 4);
});

test('explicit campaign memory and policy values change the engine rather than serving as display labels', () => {
  const game = new Game({ size: 12, players: [
    { type: 'bot', aiProfile: { strength: 90, memoryCapacity: 7, retention: 1, policy: { information: 0, burst: 0, defense: 0, pressure: 0 } } },
    { type: 'bot', aiProfile: { strength: 90, memoryCapacity: 91, retention: 1 } },
  ], rng: seeded(702) });
  game.start();
  const sightings = pairs(game).map(pair => pair[0]);
  for (let i = 0; i < sightings.length; i += 2) play(game, sightings[i], sightings[i + 1]);
  assert.equal(game._memories[0].size, 7);
  assert.equal(game._memories[1].size, 72);
  assert.equal(game.state.current, 0);
  for (let i = 0; i < 20; i++) assert.equal(game.chooseAiAction().type, 'flip');
});

test('forged observer state and in-flight tool counters are rejected on restoration', () => {
  const game = equipped();
  game.start();
  const corruptions = [
    saved => { saved.memories[0] = [[0, game.state.cards[0].value + 1]]; },
    saved => { saved.memories[0] = [[0, game.state.cards[0].value], [0, game.state.cards[0].value]]; },
    saved => { saved.state.players[0].cooldowns.peek = 10; },
    saved => { saved.state.players[0].inventory.radar = -1; },
    saved => { saved.state.players[0].effects.jammed = 'yes'; },
    saved => { saved.state.status = 'peeking'; saved.state.peekIds = []; },
    saved => { saved.state.learningSamples = [{ player: 0, family: 'information', tool: 'peek', reward: Infinity }]; },
    saved => { saved.rngState = -1; },
  ];
  for (const corrupt of corruptions) {
    const saved = game.exportState(); corrupt(saved);
    assert.throws(() => Game.fromState(saved));
  }
});
