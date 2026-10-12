// Builds the unified flashcard set (vocab + mistakes + custom cards) and deck filtering.
import { loadVocab } from './data.js';
import { getAll as getAllMistakes } from './mistakes.js';
import { getState as getFcState, getStarred } from './flashcards.js';
import { getSrs, getNewShownToday } from './flashcards.js';
import { getSettings } from './settings.js';
import { isDue, isNew } from './srs.js';

export async function buildAllCards(level) {
  const vocab = await loadVocab(level);
  const starred = new Set(getStarred(level));
  const cards = vocab.map((w) => ({
    id: w.id, kind: 'vocab', topic: w.topic, starred: starred.has(w.id),
    front: { word: w.word, pos: w.pos },
    back: { definition: w.definition, example: w.example, collocations: w.collocations || [] },
  }));
  const mistakeCards = getAllMistakes(level).filter((m) => !m.resolved).map((m) => ({
    id: `mistake:${m.key}`, kind: 'mistake', topic: null,
    front: { context: m.context || m.setTitle },
    back: { answer: Array.isArray(m.correctAnswers) ? m.correctAnswers.join(' / ') : m.correctAnswers, explanation: m.explanation },
  }));
  const custom = getFcState(level).custom.map((c) => ({
    id: c.id, kind: 'custom', topic: null, front: { text: c.front }, back: { text: c.back },
  }));
  return cards.concat(mistakeCards, custom);
}

export function topics(cards) {
  return Array.from(new Set(cards.filter((c) => c.kind === 'vocab' && c.topic).map((c) => c.topic))).sort();
}

export function cardsForDeck(cards, deckId) {
  if (deckId === 'starred') return cards.filter((c) => c.starred);
  if (deckId === 'mistakes') return cards.filter((c) => c.kind === 'mistake');
  if (deckId === 'custom') return cards.filter((c) => c.kind === 'custom');
  if (deckId && deckId.startsWith('topic:')) {
    const t = deckId.slice(6);
    return cards.filter((c) => c.kind === 'vocab' && c.topic === t);
  }
  return cards;
}

export function dueCards(level, cards) {
  return cards.filter((c) => isDue(getSrs(level, c.id)));
}

export function newCards(level, cards) {
  return cards.filter((c) => isNew(getSrs(level, c.id)));
}

// Cards actually studyable today: due reviews plus new cards up to the daily new-card allowance.
export function dueCount(level, cards) {
  const due = dueCards(level, cards);
  const fresh = due.filter((c) => isNew(getSrs(level, c.id))).length;
  const allowedNew = Math.max(0, getSettings().newCardsPerDay - getNewShownToday(level));
  return due.length - fresh + Math.min(fresh, allowedNew);
}
