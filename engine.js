export const VERSION = 1;
export const normalize = text => text.replace(/[’‘]/g, "'");
export const emptyMetrics = () => ({ attempts: 0, correct: 0, elapsedMs: 0 });
export const tokens = text => [...text.matchAll(/\S+/gu)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectCandidate(sentence, wordStats) {
  return [...sentence.candidates].sort((a, b) => {
    const x = wordStats[a.word.toLowerCase()] || { errors: 0, repetitions: 0 };
    const y = wordStats[b.word.toLowerCase()] || { errors: 0, repetitions: 0 };
    return y.errors - x.errors || x.repetitions - y.repetitions || a.token - b.token;
  })[0];
}

export function newState() {
  return { version: VERSION, level: 'all', theme: 'light', keyboard: true,
    queue: [], cycle: 0, current: null, wordStats: {}, completed: 0, repetitions: 0,
    totals: emptyMetrics(), drillTotals: emptyMetrics() };
}

export function beginNext(state, corpus, random = Math.random) {
  const eligible = corpus.filter(s => state.level === 'all' || s.level === state.level);
  if (!eligible.length) throw new Error('No sentences for this level');
  const previous = state.current?.id;
  if (!state.queue.length) {
    state.queue = shuffle(eligible.map(s => s.id), random);
    if (state.queue.length > 1 && state.queue[0] === previous) state.queue.push(state.queue.shift());
    state.cycle++;
  }
  const nextId = state.queue.shift();
  const sentence = corpus.find(s => s.id === nextId);
  if (!sentence) throw new Error('Unknown sentence');
  const candidate = selectCandidate(sentence, state.wordStats);
  state.current = { id: sentence.id, candidateToken: candidate.token, stage: 'word', repeats: 0,
    text: '', metrics: emptyMetrics(), drillMetrics: emptyMetrics() };
  return sentence;
}

export function getCandidate(state, sentence) {
  return sentence.candidates.find(c => c.token === state.current.candidateToken);
}

export function targetFor(state, sentence) {
  return state.current.stage === 'word' ? getCandidate(state, sentence).word : sentence.en;
}

export function activeToken(sentence, position) {
  const list = tokens(sentence.en);
  return Math.max(0, list.findIndex((t, i) => position < (list[i + 1]?.start ?? Infinity)));
}

function statsFor(state, word) {
  const key = word.toLowerCase();
  return state.wordStats[key] ||= { errors: 0, repetitions: 0 };
}

// Wrong characters are attempts, but never become part of the accepted text.
export function insertCharacter(state, sentence, character) {
  const current = state.current;
  if (current.stage === 'done' || [...character].length !== 1) return { ignored: true };
  const target = targetFor(state, sentence);
  if (current.text.length >= target.length) return { ignored: true };
  const metrics = current.stage === 'word' ? current.drillMetrics : current.metrics;
  const totals = current.stage === 'word' ? state.drillTotals : state.totals;
  metrics.attempts++; totals.attempts++;
  const accepted = normalize(character) === normalize(target[current.text.length]);
  if (!accepted) {
    if (current.stage === 'word') statsFor(state, getCandidate(state, sentence).word).errors++;
    else {
      const token = activeToken(sentence, current.text.length);
      const candidate = sentence.candidates.find(c => c.token === token);
      if (candidate) statsFor(state, candidate.word).errors++;
    }
    return { accepted: false, cyrillic: /[а-яё]/iu.test(character) };
  }
  current.text += target[current.text.length];
  metrics.correct++; totals.correct++;
  if (current.stage === 'sentence' && current.text === target) {
    current.stage = 'done';
    state.completed++;
  }
  return { accepted: true, complete: current.stage === 'done' };
}

export function backspace(state) {
  if (state.current.stage !== 'done') state.current.text = state.current.text.slice(0, -1);
}

export function confirmWord(state, sentence) {
  const current = state.current;
  if (current.stage !== 'word' || normalize(current.text) !== normalize(targetFor(state, sentence))) return false;
  statsFor(state, getCandidate(state, sentence).word).repetitions++;
  state.repetitions++; current.repeats++; current.text = '';
  if (current.repeats === 15) current.stage = 'sentence';
  return true;
}

export function addElapsed(state, ms) {
  if (!state.current || state.current.stage === 'done') return;
  const word = state.current.stage === 'word';
  state.current[word ? 'drillMetrics' : 'metrics'].elapsedMs += ms;
  state[word ? 'drillTotals' : 'totals'].elapsedMs += ms;
}

export function accuracy(metrics) {
  return metrics.attempts ? Math.round(metrics.correct / metrics.attempts * 100) : null;
}

export function wpm(metrics, netCharacters) {
  return metrics.elapsedMs > 0 && metrics.attempts > 0
    ? Math.round(netCharacters / 5 / (metrics.elapsedMs / 60000)) : null;
}

const finiteCount = x => Number.isFinite(x) && x >= 0;
function validMetrics(m) {
  return m && ['attempts', 'correct', 'elapsedMs'].every(k => finiteCount(m[k])) && m.correct <= m.attempts;
}

export function restoreState(raw, corpus) {
  try {
    const s = JSON.parse(raw);
    if (!s || s.version !== VERSION || !['all', 'B1', 'B2'].includes(s.level) ||
        !['light', 'dark'].includes(s.theme) || typeof s.keyboard !== 'boolean' ||
        ![s.completed, s.repetitions, s.cycle].every(finiteCount) ||
        !validMetrics(s.totals) || !validMetrics(s.drillTotals)) return null;
    const valid = new Set(corpus.filter(x => s.level === 'all' || x.level === s.level).map(x => x.id));
    if (!Array.isArray(s.queue) || s.queue.some(id => !valid.has(id)) || new Set(s.queue).size !== s.queue.length) return null;
    if (!s.wordStats || typeof s.wordStats !== 'object' || Array.isArray(s.wordStats) ||
        Object.values(s.wordStats).some(x => !x || !finiteCount(x.errors) || !finiteCount(x.repetitions))) return null;
    const c = s.current;
    const sentence = corpus.find(x => x.id === c?.id);
    if (!sentence || !valid.has(c.id) || s.queue.includes(c.id) ||
        !['word', 'sentence', 'done'].includes(c.stage) || !Number.isInteger(c.repeats) ||
        c.repeats < 0 || c.repeats > 15 || !validMetrics(c.metrics) || !validMetrics(c.drillMetrics) ||
        !getCandidate(s, sentence) || typeof c.text !== 'string') return null;
    if ((c.stage === 'word' && c.repeats >= 15) || (c.stage !== 'word' && c.repeats !== 15)) return null;
    const target = targetFor(s, sentence);
    if (!target.startsWith(c.text) || (c.stage === 'done' && c.text !== target) ||
        (c.stage === 'sentence' && c.text === target)) return null;
    return s;
  } catch { return null; }
}
