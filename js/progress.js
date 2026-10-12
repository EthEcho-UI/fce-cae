// Per-level progress: questions answered/correct per part & per skill tag, active-day streak.
import { get, set } from './store.js';

function key(level) { return `progress.${level}`; }

function empty() {
  return { answered: {}, correct: {}, bySkillTotal: {}, bySkillCorrect: {}, bestScore: {}, activeDays: [] };
}

export function getProgress(level) {
  return Object.assign(empty(), get(key(level), {}));
}

function bump(obj, k, n) { obj[k] = (obj[k] || 0) + n; }

export function markActiveToday(level) {
  const p = getProgress(level);
  const t = new Date().toISOString().slice(0, 10);
  if (!p.activeDays.includes(t)) {
    p.activeDays.push(t);
    p.activeDays = p.activeDays.slice(-400);
    set(key(level), p);
  }
}

/** Record one answered question. */
export function recordAnswer(level, { part, tag, correct }) {
  const p = getProgress(level);
  bump(p.answered, part, 1);
  if (correct) bump(p.correct, part, 1);
  if (tag) {
    bump(p.bySkillTotal, tag, 1);
    if (correct) bump(p.bySkillCorrect, tag, 1);
  }
  set(key(level), p);
  markActiveToday(level);
}

/** Record a finished set's score, keeping the best attempt. */
export function recordSetResult(level, setId, correct, total) {
  const p = getProgress(level);
  const prev = p.bestScore[setId];
  if (!prev || correct / total > prev.correct / prev.total) {
    p.bestScore[setId] = { correct, total };
  }
  set(key(level), p);
}

export function bestScore(level, setId) {
  return getProgress(level).bestScore[setId] || null;
}

export function accuracyByPart(level) {
  const p = getProgress(level);
  const out = {};
  for (const part of Object.keys(p.answered)) {
    out[part] = { answered: p.answered[part], correct: p.correct[part] || 0 };
  }
  return out;
}

export function accuracyBySkill(level) {
  const p = getProgress(level);
  const out = {};
  for (const tag of Object.keys(p.bySkillTotal)) {
    out[tag] = { total: p.bySkillTotal[tag], correct: p.bySkillCorrect[tag] || 0 };
  }
  return out;
}

export function totalAnswered(level) {
  const p = getProgress(level);
  return Object.values(p.answered).reduce((a, b) => a + b, 0);
}

/** Current streak of consecutive active days, counting today or yesterday as the anchor. */
export function streak(level) {
  const p = getProgress(level);
  const days = new Set(p.activeDays);
  let n = 0;
  let d = new Date();
  // if today isn't active yet, the streak still "counts" through yesterday
  if (!days.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
