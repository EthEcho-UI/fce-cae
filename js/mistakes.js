// Mistakes notebook: every wrong answer, keyed by level+setId+question so repeats accumulate.
import { get, set } from './store.js';

function key(level) { return `mistakes.${level}`; }

export function mistakeKey(setId, n) { return `${setId}::${n}`; }

export function getAll(level) { return get(key(level), []); }

function save(level, list) { set(key(level), list); }

/** Add or update a mistake. `data` = { part, setId, setTitle, n, type, tag, context,
 * yourAnswer, correctAnswers, explanation, whys, source }. */
export function addMistake(level, data) {
  const list = getAll(level);
  const k = mistakeKey(data.setId, data.n);
  const now = Date.now();
  const existing = list.find((m) => m.key === k);
  if (existing) {
    existing.timesWrong += 1;
    existing.lastWrongAt = now;
    existing.resolved = false;
    existing.yourAnswer = data.yourAnswer;
    Object.assign(existing, {
      context: data.context, correctAnswers: data.correctAnswers,
      explanation: data.explanation, whys: data.whys, tag: data.tag, part: data.part,
      setTitle: data.setTitle, type: data.type, source: data.source,
    });
  } else {
    list.push(Object.assign({
      key: k, level, timesWrong: 1, firstWrongAt: now, lastWrongAt: now,
      resolved: false, learned: false,
    }, data));
  }
  save(level, list);
}

export function resolveMistake(level, k) {
  const list = getAll(level);
  const m = list.find((x) => x.key === k);
  if (m) { m.resolved = true; m.resolvedAt = Date.now(); save(level, list); }
}

export function setLearned(level, k, val) {
  const list = getAll(level);
  const m = list.find((x) => x.key === k);
  if (m) { m.learned = val; save(level, list); }
}

export function filterMistakes(level, { part, tag, search, resolved } = {}) {
  let list = getAll(level);
  if (resolved !== undefined) list = list.filter((m) => !!m.resolved === resolved);
  if (part) list = list.filter((m) => m.part === part);
  if (tag) list = list.filter((m) => m.tag === tag);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((m) => (m.context || '').toLowerCase().includes(q)
      || (m.setTitle || '').toLowerCase().includes(q)
      || (m.yourAnswer || '').toLowerCase().includes(q));
  }
  return list.sort((a, b) => b.lastWrongAt - a.lastWrongAt);
}

export function openCount(level) { return getAll(level).filter((m) => !m.resolved).length; }
