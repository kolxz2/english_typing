import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, beginNext, insertCharacter, confirmWord, backspace, activeToken,
  restoreState, accuracy, wpm, addElapsed, selectCandidate } from '../engine.js';

const sentence = { id: '1', en: "We haven't decided yet.", ru: 'Мы ещё не решили.', level: 'B1',
  candidates: [{ token: 2, word: 'decided', gloss: 'решили' }, { token: 3, word: 'yet', gloss: 'ещё' }] };
const corpus = [sentence, { ...sentence, id: '2', level: 'B2' }, { ...sentence, id: '3' }];
function setup() { const state = newState(); beginNext(state, [sentence]); return state; }
function type(state, text) { for (const char of text) insertCharacter(state, sentence, char); }
function drill(state) { for (let i = 0; i < 15; i++) { type(state, 'decided'); assert.equal(confirmWord(state, sentence), true); } }

test('15 full repetitions, never advance on wrong or partial input', () => {
  const state = setup();
  assert.equal(insertCharacter(state, sentence, 'x').accepted, false);
  assert.equal(state.current.text, '');
  assert.equal(confirmWord(state, sentence), false);
  type(state, 'dec'); assert.equal(confirmWord(state, sentence), false);
  type(state, 'ided'); confirmWord(state, sentence);
  assert.equal(state.current.repeats, 1); assert.equal(state.current.text, '');
  for (let i = 1; i < 14; i++) { type(state, 'decided'); confirmWord(state, sentence); }
  assert.equal(state.current.stage, 'word'); assert.equal(state.current.repeats, 14);
  type(state, 'decided'); confirmWord(state, sentence);
  assert.equal(state.current.stage, 'sentence'); assert.equal(state.repetitions, 15);
  assert.equal(state.current.metrics.attempts, 0);
  assert.equal(state.current.drillMetrics.attempts, 106);
});
test('reject mistakes, count them, allow backspace, and accept curly apostrophe', () => {
  const state = setup(); drill(state);
  assert.equal(insertCharacter(state, sentence, 'Ц').cyrillic, true);
  type(state, 'We haven’t decided ye'); backspace(state); type(state, 'et.');
  assert.equal(state.current.text, sentence.en); assert.equal(state.current.stage, 'done');
  assert.equal(state.completed, 1); insertCharacter(state, sentence, '.');
  assert.equal(state.completed, 1); assert.ok(accuracy(state.current.metrics) < 100);
  assert.equal(state.current.drillMetrics.correct, 105);
});
test('case and punctuation are required', () => {
  const state = setup(); drill(state);
  assert.equal(insertCharacter(state, sentence, 'w').accepted, false);
  type(state, sentence.en.slice(0, -1)); assert.equal(state.current.stage, 'sentence');
  type(state, '.'); assert.equal(state.current.stage, 'done');
});
test('word boundaries retain preceding word until space is entered', () => {
  assert.equal(activeToken(sentence, 0), 0); assert.equal(activeToken(sentence, 2), 0);
  assert.equal(activeToken(sentence, 3), 1); assert.equal(activeToken(sentence, 9), 1);
  assert.equal(activeToken(sentence, 10), 1); assert.equal(activeToken(sentence, 11), 2);
});
test('queue exhausts each level before repeating; no adjacent cycle repeat', () => {
  const state = newState(), seen = [];
  for (let i = 0; i < 3; i++) seen.push(beginNext(state, corpus, () => .5).id);
  assert.equal(new Set(seen).size, 3);
  assert.notEqual(beginNext(state, corpus, () => .5).id, seen[2]);
  state.level = 'B2'; state.queue = [];
  assert.equal(beginNext(state, corpus).level, 'B2');
});
test('selection prefers mistakes, then fewer repetitions', () => {
  assert.equal(selectCandidate(sentence, { decided: { errors: 0, repetitions: 15 } }).word, 'yet');
  assert.equal(selectCandidate(sentence, { decided: { errors: 2, repetitions: 30 } }).word, 'decided');
});
test('restores accepted text, stage, count and queue; rejects damaged storage', () => {
  const state = setup(); type(state, 'de');
  assert.deepEqual(restoreState(JSON.stringify(state), [sentence]), state);
  state.current.text = 'wrong'; assert.equal(restoreState(JSON.stringify(state), [sentence]), null);
  assert.equal(restoreState('{broken', corpus), null);
  const other = setup(); other.current.repeats = 15;
  assert.equal(restoreState(JSON.stringify(other), [sentence]), null);
});
test('metrics separate warmup from sentences and use net typed characters', () => {
  const state = setup(); type(state, 'd'); addElapsed(state, 2000);
  assert.equal(state.drillTotals.elapsedMs, 2000); assert.equal(state.totals.elapsedMs, 0);
  type(state, 'ecided'); confirmWord(state, sentence);
  for (let i = 1; i < 15; i++) { type(state, 'decided'); confirmWord(state, sentence); }
  type(state, 'We '); addElapsed(state, 6000);
  assert.equal(wpm(state.current.metrics, state.current.text.length), 6);
  assert.equal(accuracy(state.current.metrics), 100);
  backspace(state); assert.equal(wpm(state.current.metrics, state.current.text.length), 4);
  assert.equal(state.drillTotals.elapsedMs, 2000);
});
