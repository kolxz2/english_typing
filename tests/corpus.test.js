import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newState, beginNext, getCandidate, insertCharacter, confirmWord, restoreState, tokens } from '../engine.js';

const corpus = JSON.parse(readFileSync(new URL('../data/sentences.json', import.meta.url))).sentences;

test('all 200 real sentences complete with 15 repetitions and survive checkpoint restoration', () => {
  const state = newState();
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const sentence = beginNext(state, corpus);
    assert.ok(!seen.has(sentence.id)); seen.add(sentence.id);
    const candidate = getCandidate(state, sentence);
    for (let j = 0; j < 15; j++) {
      for (const ch of candidate.word) assert.equal(insertCharacter(state, sentence, ch).accepted, true);
      assert.equal(confirmWord(state, sentence), true);
    }
    for (const ch of sentence.en) assert.equal(insertCharacter(state, sentence, ch).accepted, true);
    assert.equal(state.current.stage, 'done');
    assert.deepEqual(restoreState(JSON.stringify(state), corpus), state);
  }
  assert.equal(state.completed, 200); assert.equal(state.repetitions, 3000);
});

test('alignment covers every English token in order and every Russian token', () => {
  for (const s of corpus) {
    const en = tokens(s.en), ru = tokens(s.ru);
    assert.deepEqual(s.groups.flatMap(g => Array.from({length:g.en[1]-g.en[0]}, (_,i)=>g.en[0]+i)), en.map((_,i)=>i));
    assert.equal(new Set(s.groups.flatMap(g => g.ru)).size, ru.length);
    for (const c of s.candidates) assert.equal(en[c.token].text.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g,''), c.word);
  }
});
