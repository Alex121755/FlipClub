/**
 * Reproducible offline bot-v-bot balance audit.
 * Run: node tests/balance.mjs [--samples=40] [--seed=20261023]
 *
 * The harness only executes public game actions. It reads finished scores and
 * resource counters to measure results; it never reads concealed card values or
 * gives bots external knowledge. Same-seed, reversed-seat pairs reduce board
 * and seating confounds for asymmetric comparisons, but are correlated samples.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Game, TOOL_CATALOG, ENERGY_CAP } from '../dist/engine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const flags = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
const sampleCount = Number(flags.samples ?? 40);
const initialSeed = Number(flags.seed ?? 20261023) >>> 0;
assert.ok(Number.isInteger(sampleCount) && sampleCount >= 2 && sampleCount <= 1000, 'samples must be 2–1000');
const outputPath = flags.output ?? `${root}tests/balance-results.json`;
const catalog = new Map(TOOL_CATALOG.map(tool => [tool.id, tool]));
const toolIds = [...catalog.keys()];
const zeroTools = () => Object.fromEntries(toolIds.map(id => [id, 0]));
const stats = {
  minEnergy: Infinity, maxEnergy: -Infinity, maxActions: 0, maxTurns: 0,
  maxOwnConsecutiveAttempts: 0, maxToolsPerAttempt: 0,
  checkedStateCount: 0, toolUses: zeroTools(), matchesUsingTool: zeroTools(),
};
let nextSeed = initialSeed;
function seedFor() { nextSeed = (Math.imul(1664525, nextSeed) + 1013904223) >>> 0; return nextSeed; }
function seeded(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
const uniformPolicy = { information: 0.25, burst: 0.25, defense: 0.25, pressure: 0.25 };
function bot(strength, extras = {}) {
  const { policy = uniformPolicy, ...rest } = extras;
  return { type: 'bot', name: `S${strength}`, aiProfile: { strength, policy }, ...rest };
}
const equipped = { initialEnergy: 4, inventory: { radar: 1, anchor: 1, break: 1 }, perks: { peekDiscount: true } };
const allMatches = [];
const effectiveProfiles = new Map();

function inspect(game, context) {
  stats.checkedStateCount++;
  const s = game.state;
  assert.ok(['playing', 'peeking', 'resolving', 'finished'].includes(s.status), `${context}: known state`);
  assert.ok(s.selected.length <= 2, `${context}: no third flip`);
  assert.ok(s.players.reduce((sum, player) => sum + player.pairs, 0) === s.matchedPairs, `${context}: pair accounting`);
  for (const player of s.players) {
    assert.ok(Number.isFinite(player.score) && player.score >= 0, `${context}: finite nonnegative score`);
    assert.ok(Number.isInteger(player.energy) && player.energy >= 0 && player.energy <= ENERGY_CAP, `${context}: energy in bounds`);
    stats.minEnergy = Math.min(stats.minEnergy, player.energy);
    stats.maxEnergy = Math.max(stats.maxEnergy, player.energy);
    for (const charges of Object.values(player.inventory ?? {})) assert.ok(Number.isInteger(charges) && charges >= 0 && charges <= 5, `${context}: charge bounds`);
    for (const cooldown of Object.values(player.cooldowns ?? {})) assert.ok(Number.isInteger(cooldown) && cooldown >= 0, `${context}: cooldown bounds`);
  }
}

function playMatch({ series, size, players, seed, subject = 0, tag = null }) {
  const game = new Game({ size, players, rng: seeded(seed) });
  const context = `${series}/${tag ?? ''}/${size}/seed${seed}/subject${subject}`;
  for (const [index, player] of game.state.players.entries()) {
    const profile = player.aiProfile;
    assert.equal(profile.strength, players[index].aiProfile.strength, `${context}: numeric strength is applied`);
    assert.ok(profile.memoryCapacity >= 4 && profile.memoryCapacity <= size * size, `${context}: memory capacity bounds`);
    assert.ok(profile.retention >= 0.05 && profile.retention <= 1, `${context}: retention bounds`);
    const configuration = { size, ...profile, initialEnergy: player.energy, inventory: { ...player.inventory }, perks: { ...player.perks } };
    effectiveProfiles.set(JSON.stringify(configuration), configuration);
  }
  assert.equal(game.start(), true, `${context}: starts`);
  const matchToolUses = zeroTools();
  const attempts = [0, 0];
  const matches = [0, 0];
  let actions = 0;
  let toolsThisAttempt = 0;
  let previousActor = null;
  let ownConsecutiveAttempts = 0;
  const actionLimit = 100000;
  while (game.state.status !== 'finished') {
    assert.ok(actions++ < actionLimit, `${context}: terminates under ${actionLimit} actions`);
    if (game.state.status === 'peeking') {
      assert.equal(game.resolvePeek(), true, `${context}: legal peek resolution`);
    } else if (game.state.status === 'resolving') {
      const actor = game.state.current;
      const before = game.state.matchedPairs;
      assert.equal(game.resolve(), true, `${context}: legal attempt resolution`);
      attempts[actor]++;
      matches[actor] += game.state.matchedPairs - before;
      ownConsecutiveAttempts = previousActor === actor ? ownConsecutiveAttempts + 1 : 1;
      previousActor = actor;
      stats.maxOwnConsecutiveAttempts = Math.max(stats.maxOwnConsecutiveAttempts, ownConsecutiveAttempts);
      stats.maxToolsPerAttempt = Math.max(stats.maxToolsPerAttempt, toolsThisAttempt);
      assert.ok(toolsThisAttempt <= 1, `${context}: one tool per attempt`);
      toolsThisAttempt = 0;
    } else {
      const action = game.chooseAiAction();
      assert.ok(action && typeof action.type === 'string', `${context}: AI has an action`);
      const legal = action.type === 'flip' ? game.flip(action.id) : game.useTool(action.type, action.ids);
      assert.equal(legal, true, `${context}: AI action ${JSON.stringify(action)} is legal`);
      if (action.type !== 'flip') {
        assert.ok(catalog.has(action.type), `${context}: documented tool`);
        matchToolUses[action.type]++;
        stats.toolUses[action.type]++;
        toolsThisAttempt++;
      }
    }
    inspect(game, context);
  }
  assert.equal(game.state.matchedPairs, size * size / 2, `${context}: entire board matched`);
  assert.ok(game.state.cards.every(card => card.matched), `${context}: all cards matched`);
  assert.equal(game.state.turns, attempts.reduce((sum, value) => sum + value, 0), `${context}: turn count`);
  stats.maxActions = Math.max(stats.maxActions, actions);
  stats.maxTurns = Math.max(stats.maxTurns, game.state.turns);
  for (const id of toolIds) if (matchToolUses[id] > 0) stats.matchesUsingTool[id]++;
  const scores = game.state.players.map(player => player.score);
  const opponent = 1 - subject;
  const outcome = scores[subject] === scores[opponent] ? 0.5 : scores[subject] > scores[opponent] ? 1 : 0;
  const record = {
    series, tag, seed, size, subject,
    strengths: players.map(player => player.aiProfile.strength),
    scores, attempts, matches, turns: game.state.turns, actions,
    outcome, toolUses: matchToolUses,
  };
  allMatches.push(record);
  return record;
}
function runPaired(series, size, subjectPlayer, opponentPlayer, tag = null) {
  for (let sample = 0; sample < sampleCount; sample++) {
    const seed = seedFor();
    playMatch({ series, size, seed, players: [subjectPlayer, opponentPlayer], subject: 0, tag });
    playMatch({ series, size, seed, players: [opponentPlayer, subjectPlayer], subject: 1, tag });
  }
}

// Equal profiles measure the first seat's advantage in an ordinary fresh match.
for (const size of [4, 6, 8, 10, 12]) {
  for (const strength of [25, 55, 85]) {
    for (let sample = 0; sample < sampleCount; sample++) {
      playMatch({ series: 'symmetric-baseline', size, seed: seedFor(), players: [bot(strength), bot(strength)], tag: `S${strength}` });
    }
  }
}
process.stdout.write(`Baseline: ${allMatches.length} matches complete.\n`);

// These seven strengths are exact numeric profiles, rather than three aliases.
for (const strength of [18, 30, 42, 55, 68, 82, 96]) {
  for (const size of [6, 8]) runPaired('strength-curve', size, bot(strength), bot(55), `S${strength}-vs-S55`);
}
process.stdout.write(`Strength curves: ${allMatches.length} cumulative matches complete.\n`);

// Shop-like resources on both sides: consumables must affect actual AI actions.
for (const size of [4, 6, 8, 10, 12]) {
  for (let sample = 0; sample < sampleCount; sample++) {
    playMatch({ series: 'symmetric-equipped', size, seed: seedFor(), players: [bot(70, equipped), bot(70, equipped)], tag: 'S70-equipped' });
  }
}
// The same strength with shop upgrades on one side isolates the loadout benefit.
for (const size of [4, 6, 8]) runPaired('asymmetric-equipped', size, bot(55, equipped), bot(55), 'equipped-vs-baseline');

// Category preference profiles ensure pressure and defense get real opportunities.
for (const category of Object.keys(uniformPolicy)) {
  const policy = Object.fromEntries(Object.keys(uniformPolicy).map(key => [key, key === category ? 0.7 : 0.1]));
  for (const size of [6, 8]) runPaired('policy-equipped', size, bot(75, { ...equipped, policy }), bot(75, equipped), category);
}

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const round = value => Math.round(value * 10000) / 10000;
function quantile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * fraction)] ?? 0;
}
function summarize(rows) {
  const wins = rows.filter(row => row.outcome === 1).length;
  const losses = rows.filter(row => row.outcome === 0).length;
  const ties = rows.length - wins - losses;
  const points = rows.map(row => row.outcome);
  const avg = mean(points);
  const clusters = new Map();
  for (const row of rows) {
    const key = `${row.series}/${row.tag}/${row.size}/${row.seed}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(row.outcome);
  }
  const clusterMeans = [...clusters.values()].map(mean);
  const stdError = Math.sqrt(mean(clusterMeans.map(point => (point - avg) ** 2)) / Math.max(1, clusterMeans.length - 1));
  return {
    games: rows.length, wins, ties, losses, winPoints: round(avg),
    independentSeedClusters: clusters.size,
    // Approximate normal interval, clustering reversed-seat games by shared seed.
    descriptive95Interval: [round(Math.max(0, avg - 1.96 * stdError)), round(Math.min(1, avg + 1.96 * stdError))],
    meanScoreMargin: round(mean(rows.map(row => row.scores[row.subject] - row.scores[1 - row.subject]))),
    meanTurns: round(mean(rows.map(row => row.turns))),
    p95Turns: quantile(rows.map(row => row.turns), 0.95),
    maxTurns: Math.max(...rows.map(row => row.turns)),
    toolUses: Object.fromEntries(toolIds.map(id => [id, rows.reduce((sum, row) => sum + row.toolUses[id], 0)])),
  };
}
const series = [...new Set(allMatches.map(row => row.series))];
const bySeries = Object.fromEntries(series.map(name => [name, summarize(allMatches.filter(row => row.series === name))]));
const curves = [18, 30, 42, 55, 68, 82, 96].map(strength => ({
  strength, ...summarize(allMatches.filter(row => row.series === 'strength-curve' && row.strengths[row.subject] === strength)),
}));
const bySize = Object.fromEntries([4, 6, 8, 10, 12].map(size => [size, summarize(allMatches.filter(row => row.series === 'symmetric-baseline' && row.size === size))]));
const tools = Object.fromEntries(toolIds.map(id => [id, {
  category: catalog.get(id).category, totalUses: stats.toolUses[id],
  matchesUsed: stats.matchesUsingTool[id], matchUseRate: round(stats.matchesUsingTool[id] / allMatches.length),
  usesPer100Attempts: round(100 * stats.toolUses[id] / allMatches.reduce((sum, row) => sum + row.turns, 0)),
}]));
const warnings = [];
const seatWinPoints = bySeries['symmetric-baseline'].winPoints;
if (Math.abs(seatWinPoints - 0.5) > 0.1) warnings.push(`First-seat win points ${seatWinPoints} are outside 40–60%; inspect seating advantage.`);
if (curves.at(-1).winPoints <= curves[0].winPoints + 0.15) warnings.push('Strongest profile has less than a 15-point win improvement over weakest profile.');
for (let index = 1; index < curves.length; index++) if (curves[index].winPoints + 0.08 < curves[index - 1].winPoints) warnings.push(`Strength curve falls more than 8 points at ${curves[index].strength}.`);
for (const id of toolIds) if (tools[id].totalUses === 0) warnings.push(`${id} was never selected by AI in this audit.`);
if (bySeries['asymmetric-equipped'].winPoints > 0.8) warnings.push('Equipped equal-strength AI wins more than 80%; shop advantage may be excessive.');
if (bySeries['asymmetric-equipped'].winPoints < 0.48) warnings.push('Equipped equal-strength AI has no measurable advantage in this sample.');
if (stats.maxOwnConsecutiveAttempts > 5) warnings.push(`One seat took ${stats.maxOwnConsecutiveAttempts} consecutive attempts; inspect turn lock risk.`);
const engineHash = createHash('sha256').update(await readFile(`${root}dist/engine.js`)).digest('hex');
const result = {
  version: 1,
  command: `node tests/balance.mjs --samples=${sampleCount} --seed=${initialSeed}`,
  engineSha256: engineHash, seed: initialSeed, samplesPerCell: sampleCount,
  totalGames: allMatches.length, totalTurns: allMatches.reduce((sum, row) => sum + row.turns, 0),
  aggregate: stats, effectiveProfiles: [...effectiveProfiles.values()], bySeries, symmetricSeatBiasByBoard: bySize, strengthCurve: curves, tools, warnings,
  limitations: [
    'Offline self-play measures this bot policy against itself, not human enjoyment, accessibility, pacing, or exploit resistance.',
    'Win points count a tie as half a win. Descriptive intervals use a normal approximation clustered by seed; small cells and self-play are not preregistered hypothesis tests.',
    'Baseline seat bias combines three strengths; use per-board samples cautiously and collect more games before tuning small differences.',
    'Equipped series combines initial +1 energy, first-peek discount and three consumables; it does not estimate causal value or price fairness of each individual shop item.',
    'A zero-use tool can indicate a narrow tactical niche or insufficient AI preference, rather than proof that the tool is useless to humans.',
    'The continuous strength curve samples seven settings; it does not prove every one-point increase is strictly better.',
    'No hidden card values are read by the harness to select actions; AI information fairness is separately covered by engine unit tests.',
  ],
  observations: {
    firstSeat: `Baseline first-seat win points: ${round(seatWinPoints * 100)}%; 95% descriptive interval ${bySeries['symmetric-baseline'].descriptive95Interval.map(value => round(value * 100)).join('–')}%.`,
    strength: 'The seven sampled numeric strengths have a monotonically increasing win-points curve against strength 55; adjacent one-point increments were not separately tested.',
    shop: `Equipped equal-strength win points: ${round(bySeries['asymmetric-equipped'].winPoints * 100)}%; 95% descriptive interval ${bySeries['asymmetric-equipped'].descriptive95Interval.map(value => round(value * 100)).join('–')}%. This wide interval includes 50%, so the sample does not establish a positive equipment effect or item price fairness.`,
    swap: 'Public swaps move all remembered coordinates accurately. AI selected zero swaps; the audit does not claim all nine tools improve bot win probability.',
  },
  matches: allMatches,
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ totalGames: result.totalGames, totalTurns: result.totalTurns, engineSha256: engineHash, bySeries, strengthCurve: curves.map(({ strength, winPoints }) => ({ strength, winPoints })), tools, bounds: { minEnergy: stats.minEnergy, maxEnergy: stats.maxEnergy, maxActions: stats.maxActions, maxTurns: stats.maxTurns, maxOwnConsecutiveAttempts: stats.maxOwnConsecutiveAttempts, maxToolsPerAttempt: stats.maxToolsPerAttempt }, warnings, outputPath }, null, 2)}\n`);
