import { newState, beginNext, getCandidate, tokens, activeToken, insertCharacter, backspace,
  confirmWord, addElapsed, accuracy, wpm, restoreState } from './engine.js';

const $ = id => document.getElementById(id);
const STORE = 'word-by-word.v1';
let corpus = [], state, sentence, clockStart = null, canStore = true, feedbackTimer, ready = false;
let sentenceBlocks = [], translationSpans = [];
const input = $('typing-input');

function storageNotice(message) {
  $('storage-notice').textContent = message;
  $('storage-notice').hidden = false;
}
function save() {
  if (!state || !canStore) return;
  try { localStorage.setItem(STORE, JSON.stringify(state)); }
  catch {
    canStore = false;
    $('save-label').textContent = 'Без сохранения';
    storageNotice('Хранилище браузера недоступно. Можно продолжать практику, но прогресс не сохранится после закрытия страницы.');
  }
}
function flushClock() {
  if (clockStart !== null) {
    const now = performance.now();
    addElapsed(state, now - clockStart);
    clockStart = now;
  }
}
function pause() { if (!ready) return; flushClock(); clockStart = null; clearKeys(); save(); }
function resume() {
  if (ready && !document.hidden && document.activeElement === input &&
      state.current.stage !== 'done' && currentMetrics().attempts > 0 && clockStart === null) clockStart = performance.now();
}
function currentMetrics() { return state.current.stage === 'word' ? state.current.drillMetrics : state.current.metrics; }
function focusInput() { if (state.current.stage !== 'done') { input.focus({ preventScroll: true }); input.setSelectionRange(input.value.length, input.value.length); } }
function feedback(message, mistake = true) {
  clearTimeout(feedbackTimer);
  $('feedback').textContent = message;
  $('input-area').classList.toggle('mistake', mistake);
  if (mistake) document.querySelector('.char.current')?.classList.add('error');
  feedbackTimer = setTimeout(() => {
    $('feedback').textContent = ''; $('input-area').classList.remove('mistake');
    document.querySelectorAll('.char.error').forEach(el => el.classList.remove('error'));
  }, 1600);
}
function clearFeedback() {
  clearTimeout(feedbackTimer); $('feedback').textContent = ''; $('input-area').classList.remove('mistake');
}

function buildSentence() {
  const englishTokens = tokens(sentence.en);
  $('sentence-blocks').replaceChildren(); sentenceBlocks = [];
  for (const group of sentence.groups) {
    const block = document.createElement('div'); block.className = 'word-block';
    const english = document.createElement('span'); english.className = 'block-en';
    const start = englishTokens[group.en[0]].start, end = englishTokens[group.en[1] - 1].end;
    const spoken = document.createElement('span'); spoken.className = 'sr-only';
    spoken.textContent = sentence.en.slice(start, end); english.append(spoken);
    for (let position = start; position < end; position++) {
      const char = document.createElement('span'); char.className = 'char';
      char.setAttribute('aria-hidden', 'true');
      char.textContent = sentence.en[position]; char.dataset.position = position;
      english.append(char);
    }
    const ru = document.createElement('span'); ru.className = 'block-ru'; ru.lang = 'ru'; ru.textContent = group.gloss;
    block.append(english, ru); $('sentence-blocks').append(block);
    sentenceBlocks.push({ block, group });
  }
  const russianTokens = tokens(sentence.ru);
  $('full-translation').replaceChildren(); translationSpans = [];
  russianTokens.forEach((token, i) => {
    if (i) $('full-translation').append(document.createTextNode(sentence.ru.slice(russianTokens[i - 1].end, token.start)));
    const span = document.createElement('span'); span.textContent = token.text;
    $('full-translation').append(span); translationSpans.push(span);
  });
  const sourceBox = $('current-sources'); sourceBox.replaceChildren();
  for (const [label, source] of [['Английский оригинал', sentence.source.en], ['Русский перевод', sentence.source.ru]]) {
    const p = document.createElement('p'), a = document.createElement('a');
    a.href = source.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    a.textContent = `${label} #${source.id} ↗`; p.append(a);
    if (source.author) p.append(document.createTextNode(` · ${source.author}`));
    sourceBox.append(p);
  }
}

function renderTyping() {
  const current = state.current;
  input.value = current.text;
  input.setSelectionRange(current.text.length, current.text.length);
  if (current.stage === 'word') return;
  const active = activeToken(sentence, current.text.length);
  const activeWord = tokens(sentence.en)[active];
  const selectedRu = new Set();
  for (const { block, group } of sentenceBlocks) {
    const isActive = current.stage !== 'done' && active >= group.en[0] && active < group.en[1];
    block.classList.toggle('active', isActive);
    if (isActive) group.ru.forEach(i => selectedRu.add(i));
    block.querySelectorAll('.char').forEach(char => {
      const position = Number(char.dataset.position);
      char.classList.toggle('correct', position < current.text.length);
      char.classList.toggle('current', position === current.text.length && current.stage !== 'done');
      char.classList.toggle('typing-word', current.stage !== 'done' && position >= activeWord.start && position < activeWord.end);
      char.classList.remove('error');
    });
  }
  translationSpans.forEach((el, i) => {
    const marked = selectedRu.has(i);
    if ((el.tagName === 'MARK') !== marked) {
      const replacement = document.createElement(marked ? 'mark' : 'span');
      replacement.textContent = el.textContent; el.replaceWith(replacement); translationSpans[i] = replacement;
    }
  });
}

function renderMetrics() {
  const c = state.current, speed = wpm(c.metrics, c.stage === 'word' ? 0 : c.text.length);
  $('wpm').textContent = speed ?? '—'; $('accuracy').textContent = accuracy(c.metrics) ?? '—';
  $('completed-count').textContent = state.completed; $('word-count').textContent = state.repetitions;
}
function render() {
  const c = state.current, isWord = c.stage === 'word', isDone = c.stage === 'done';
  const candidate = getCandidate(state, sentence);
  document.documentElement.dataset.theme = state.theme;
  $('theme-toggle').setAttribute('aria-label', `Включить ${state.theme === 'light' ? 'тёмную' : 'светлую'} тему`);
  $('level').value = state.level;
  $('corpus-count').textContent = `${corpus.filter(s => state.level === 'all' || s.level === state.level).length} фраз`;
  $('sentence-level').textContent = sentence.level;
  $('step-word').classList.toggle('active', isWord); $('step-word').classList.toggle('finished', !isWord);
  $('step-sentence').classList.toggle('active', !isWord);
  $('exercise-kicker').textContent = isWord ? 'ЗНАКОМСТВО СО СЛОВОМ' : isDone ? 'ПРЕДЛОЖЕНИЕ ГОТОВО' : 'ПЕЧАТАЙТЕ И СЛЕДИТЕ ЗА ПЕРЕВОДОМ';
  $('repeat-counter').hidden = !isWord;
  $('repeat-counter').replaceChildren(document.createTextNode(`${c.repeats} `));
  const total = document.createElement('span'); total.textContent = '/ 15'; $('repeat-counter').append(total);
  $('word-panel').hidden = !isWord; $('sentence-panel').hidden = isWord;
  $('word-target').textContent = candidate.word; $('word-translation').textContent = candidate.gloss;
  $('repeat-dots').replaceChildren();
  for (let i = 0; i < 15; i++) {
    const dot = document.createElement('span'); dot.className = `repeat-dot${i < c.repeats ? ' done' : i === c.repeats ? ' current' : ''}`;
    $('repeat-dots').append(dot);
  }
  $('repeat-dots').setAttribute('aria-label', `${c.repeats} из 15 повторений`);
  $('input-area').hidden = isDone; $('completion').hidden = !isDone;
  $('input-label').textContent = isWord ? 'Введите слово и нажмите Enter' : 'Напечатайте предложение целиком';
  input.placeholder = isWord ? 'Начните печатать…' : 'Каждое слово — чуть ближе к английскому…';
  $('enter-hint').hidden = !isWord;
  $('input-hint').textContent = isWord ? 'Смотрите на слово, а не на клавиши' : 'Ошибочный символ не вводится · Backspace — исправить';
  $('phase-hint').replaceChildren(document.createTextNode(isWord ? '01 / 02' : '02 / 02'));
  const phase = document.createElement('span'); phase.textContent = isWord ? 'Слово перед предложением' : 'Печать с пониманием'; $('phase-hint').append(phase);
  $('keyboard').hidden = !state.keyboard; $('keyboard-tip').hidden = !state.keyboard;
  $('keyboard-toggle').textContent = state.keyboard ? 'Скрыть клавиатуру ⌃' : 'Показать клавиатуру ⌄';
  $('keyboard-toggle').setAttribute('aria-expanded', String(state.keyboard));
  if (isDone) $('completion-summary').textContent = `${wpm(c.metrics, c.text.length) ?? 0} слов/мин · ${accuracy(c.metrics) ?? 100}% точности. Слово «${candidate.word}» повторено 15 раз.`;
  renderTyping(); renderMetrics();
}

function typeCharacter(character) {
  if (!ready || state.current.stage === 'done') return;
  flushClock(); if (clockStart === null) clockStart = performance.now();
  const result = insertCharacter(state, sentence, character);
  if (result.accepted) {
    clearFeedback(); renderTyping(); renderMetrics();
    if (result.complete) { clockStart = null; render(); $('next').focus({ preventScroll: true }); }
  } else if (!result.ignored) feedback(result.cyrillic ? 'Переключите раскладку на английскую' : 'Не тот символ. Попробуйте ещё раз.');
  renderMetrics(); save();
}
function enter() {
  if (state.current.stage === 'done') { next(); return; }
  if (state.current.stage !== 'word') return;
  flushClock();
  if (confirmWord(state, sentence)) {
    clearFeedback(); clockStart = null; render(); save(); focusInput();
  } else feedback('Сначала напечатайте слово целиком.');
}
function next() {
  pause(); sentence = beginNext(state, corpus); buildSentence(); clearFeedback(); render(); save(); focusInput();
}

input.addEventListener('beforeinput', event => {
  if (!ready) return;
  if (!event.cancelable) return; // Process these once, in the mobile input fallback.
  event.preventDefault();
  if (event.inputType === 'deleteContentBackward') { backspace(state); clearFeedback(); renderTyping(); save(); return; }
  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') { enter(); return; }
  if (event.inputType === 'insertText' && event.data && [...event.data].length === 1) typeCharacter(event.data);
  else if (event.inputType.startsWith('insert')) feedback('Печатайте по одному символу — без вставки и автозамены.');
});
// Fallback for mobile keyboards whose beforeinput is absent or not cancelable.
input.addEventListener('input', () => {
  if (!ready) return;
  const before = state.current.text, after = input.value;
  if (after === before) return;
  if (after.startsWith(before) && [...after.slice(before.length)].length === 1) typeCharacter(after.slice(before.length));
  else if (after === before.slice(0, -1)) backspace(state);
  else feedback('Вставка и автозамена не засчитываются.');
  renderTyping(); save();
});
input.addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); if (!event.repeat) enter(); }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Delete'].includes(event.key)) event.preventDefault();
});
input.addEventListener('paste', event => { event.preventDefault(); feedback('Вставка не засчитывается — напечатайте текст самостоятельно.'); });
input.addEventListener('drop', event => { event.preventDefault(); feedback('Перетаскивание текста не засчитывается.'); });
input.addEventListener('cut', event => event.preventDefault());
input.addEventListener('click', () => input.setSelectionRange(input.value.length, input.value.length));
input.addEventListener('focus', resume); input.addEventListener('blur', pause);
window.addEventListener('blur', pause); window.addEventListener('focus', resume);
document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
window.addEventListener('pagehide', pause);

const keyboardRows = [
  [['Backquote','`'], ...'1234567890'.split('').map(x => ['Digit'+x,x]), ['Minus','-'],['Equal','='],['Backspace','⌫','wide']],
  [['Tab','Tab','wide'], ...'QWERTYUIOP'.split('').map(x => ['Key'+x,x]),['BracketLeft','['],['BracketRight',']'],['Backslash','\\']],
  [['CapsLock','Caps','wider'], ...'ASDFGHJKL'.split('').map(x => ['Key'+x,x]),['Semicolon',';'],['Quote',"'"],['Enter','Enter','wider']],
  [['ShiftLeft','Shift','wider'], ...'ZXCVBNM'.split('').map(x => ['Key'+x,x]),['Comma',','],['Period','.'],['Slash','/'],['ShiftRight','Shift','wider']],
  [['ControlLeft','Ctrl','wide'],['MetaLeft','Win'],['AltLeft','Alt'],['Space','пробел','space'],['AltRight','Alt'],['MetaRight','Win'],['ControlRight','Ctrl','wide']]
];
const keys = new Map();
for (const row of keyboardRows) {
  const el = document.createElement('div'); el.className = 'key-row';
  for (const [code, label, width = ''] of row) {
    const key = document.createElement('span'); key.className = `key ${width}${['KeyF','KeyJ'].includes(code) ? ' home' : ''}`;
    key.textContent = label; el.append(key); keys.set(code, key);
  }
  $('keyboard').append(el);
}
function clearKeys() { keys.forEach(key => key.classList.remove('pressed')); }
document.addEventListener('keydown', event => {
  keys.get(event.code)?.classList.add('pressed');
  if (ready && state.current.stage === 'done' && event.key === 'Enter' && !event.repeat &&
      !$('sources-dialog').open && (document.activeElement === document.body || document.activeElement === $('next'))) {
    event.preventDefault(); next();
  }
});
document.addEventListener('keyup', event => keys.get(event.code)?.classList.remove('pressed'));
$('next').addEventListener('click', next);
$('keyboard-toggle').addEventListener('click', () => { state.keyboard = !state.keyboard; render(); save(); });
$('theme-toggle').addEventListener('click', () => {
  if (!ready) return;
  state.theme = state.theme === 'light' ? 'dark' : 'light'; render(); save();
});
$('level').addEventListener('change', () => {
  pause(); state.level = $('level').value; state.queue = []; next();
});
$('sources-open').addEventListener('click', () => { pause(); $('sources-dialog').showModal(); });
$('sources-close').addEventListener('click', () => $('sources-dialog').close());
$('sources-dialog').addEventListener('click', event => { if (event.target === $('sources-dialog')) {
  const bounds = event.target.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) event.target.close();
} });
$('retry').addEventListener('click', load);

async function load() {
  $('loading').hidden = false; $('load-error').hidden = true;
  try {
    const response = await fetch(new URL('./data/sentences.json', import.meta.url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.version !== 1 || !Array.isArray(data.sentences) || !data.sentences.length) throw new Error('Invalid corpus');
    corpus = data.sentences;
    let raw = null;
    try { raw = localStorage.getItem(STORE); }
    catch { canStore = false; storageNotice('Хранилище браузера недоступно. Прогресс этой практики не сохранится после закрытия страницы.'); }
    state = restoreState(raw, corpus);
    if (!state) {
      if (raw) storageNotice('Сохранение устарело или повреждено. Начата новая практика.');
      state = newState();
      state.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      sentence = beginNext(state, corpus);
    } else sentence = corpus.find(s => s.id === state.current.id);
    ready = true; buildSentence(); render(); save();
    if (!canStore) $('save-label').textContent = 'Без сохранения';
    $('loading').hidden = true; $('trainer').hidden = false;
  } catch (error) {
    console.error('Loading corpus:', error); $('loading').hidden = true; $('load-error').hidden = false;
  }
}
setInterval(() => { if (ready && clockStart !== null) { flushClock(); renderMetrics(); save(); } }, 1000);
load();
