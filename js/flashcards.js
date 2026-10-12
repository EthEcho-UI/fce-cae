// Flashcard decks: vocab-by-topic, Starred, From my mistakes, and user-created "My cards".
// SRS scheduling state is keyed by a stable card id shared across all deck kinds.
import { get, set } from './store.js';
import { newCardState } from './srs.js';

function stateKey(level) { return `flashcards.${level}`; }
function starKey(level) { return `starred.${level}`; }

function emptyState() { return { custom: [], srs: {} }; }

export function getState(level) { return Object.assign(emptyState(), get(stateKey(level), {})); }
function saveState(level, s) { set(stateKey(level), s); }

export function addCustomCard(level, front, back) {
  const s = getState(level);
  const id = `custom:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  s.custom.push({ id, front, back, createdAt: Date.now() });
  saveState(level, s);
  return id;
}

export function updateCustomCard(level, id, front, back) {
  const s = getState(level);
  const c = s.custom.find((x) => x.id === id);
  if (c) { c.front = front; c.back = back; saveState(level, s); }
}

export function deleteCustomCard(level, id) {
  const s = getState(level);
  s.custom = s.custom.filter((x) => x.id !== id);
  delete s.srs[id];
  saveState(level, s);
}

export function getSrs(level, cardId) {
  const s = getState(level);
  return s.srs[cardId] || null;
}

export function setSrs(level, cardId, srsState) {
  const s = getState(level);
  s.srs[cardId] = srsState;
  saveState(level, s);
}

export function getStarred(level) { return get(starKey(level), []); }

export function isStarred(level, wordId) { return getStarred(level).includes(wordId); }

export function toggleStar(level, wordId) {
  let list = getStarred(level);
  if (list.includes(wordId)) list = list.filter((id) => id !== wordId);
  else list = list.concat([wordId]);
  set(starKey(level), list);
  return list.includes(wordId);
}

function newShownKey(level) { return `newshown.${level}`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

export function getNewShownToday(level) {
  const rec = get(newShownKey(level), null);
  if (!rec || rec.date !== todayStr()) return 0;
  return rec.count;
}

export function incrementNewShownToday(level) {
  const today = todayStr();
  const rec = get(newShownKey(level), null);
  const count = (rec && rec.date === today ? rec.count : 0) + 1;
  set(newShownKey(level), { date: today, count });
  return count;
}
