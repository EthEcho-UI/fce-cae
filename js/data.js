// Loading & merging exam content: bundled data/<level>/*.json plus user-imported sets.
import { get, set } from './store.js';

export const PARTS = {
  fce: [
    { part: 'uoe1', type: 'mcCloze', label: 'Part 1 · Multiple-choice cloze', questions: 8,
      blurb: 'Choose the best word (A–D) for each of 8 gaps — grammar and vocabulary in context.' },
    { part: 'uoe2', type: 'openCloze', label: 'Part 2 · Open cloze', questions: 8,
      blurb: 'Fill 8 gaps with one word each — no options given.' },
    { part: 'uoe3', type: 'wordFormation', label: 'Part 3 · Word formation', questions: 8,
      blurb: 'Form the right word from a given stem to fill 8 gaps.' },
    { part: 'uoe4', type: 'transformation', label: 'Part 4 · Key word transformation', questions: 6,
      blurb: 'Complete the second sentence using the key word so it means the same as the first.' },
    { part: 'read5', type: 'multipleChoice', label: 'Part 5 · Multiple choice', questions: 6,
      blurb: 'Multiple-choice comprehension questions on one long text.' },
    { part: 'read6', type: 'gappedText', label: 'Part 6 · Gapped text', questions: 6,
      blurb: 'Put the missing sentences back into the gaps in the text.' },
    { part: 'read7', type: 'multipleMatching', label: 'Part 7 · Multiple matching', questions: 10,
      blurb: 'Match 10 questions to the section of text where the answer is found.' },
  ],
  cae: [
    { part: 'uoe1', type: 'mcCloze', label: 'Part 1 · Multiple-choice cloze', questions: 8,
      blurb: 'Choose the best word (A–D) for each of 8 gaps — grammar and vocabulary in context.' },
    { part: 'uoe2', type: 'openCloze', label: 'Part 2 · Open cloze', questions: 8,
      blurb: 'Fill 8 gaps with one word each — no options given.' },
    { part: 'uoe3', type: 'wordFormation', label: 'Part 3 · Word formation', questions: 8,
      blurb: 'Form the right word from a given stem to fill 8 gaps.' },
    { part: 'uoe4', type: 'transformation', label: 'Part 4 · Key word transformation', questions: 6,
      blurb: 'Complete the second sentence using the key word so it means the same as the first.' },
    { part: 'read5', type: 'multipleChoice', label: 'Part 5 · Multiple choice', questions: 6,
      blurb: 'Multiple-choice comprehension questions on one long text.' },
    { part: 'read6', type: 'crossText', label: 'Part 6 · Cross-text multiple matching', questions: 4,
      blurb: 'Match opinions and attitudes across four short texts on the same topic.' },
    { part: 'read7', type: 'gappedText', label: 'Part 7 · Gapped text', questions: 6,
      blurb: 'Put the missing paragraphs back into the text.' },
    { part: 'read8', type: 'multipleMatching', label: 'Part 8 · Multiple matching', questions: 10,
      blurb: 'Match 10 questions to the section of a long text where the answer is found.' },
  ],
};

export const MARKS = {
  fce: { uoe1: 1, uoe2: 1, uoe3: 1, uoe4: 2, read5: 2, read6: 2, read7: 1 },
  cae: { uoe1: 1, uoe2: 1, uoe3: 1, uoe4: 2, read5: 2, read6: 2, read7: 2, read8: 1 },
};

export function partMeta(level, part) {
  return (PARTS[level] || []).find((p) => p.part === part);
}

export function partForType(level, type) {
  return (PARTS[level] || []).find((p) => p.type === type);
}

const cache = new Map();

async function fetchJson(path) {
  if (cache.has(path)) return cache.get(path);
  let result = null;
  try {
    const res = await fetch(path, { cache: 'no-cache' });
    if (res.ok) result = await res.json();
  } catch (e) { /* offline / missing: treated as absent */ }
  cache.set(path, result);
  return result;
}

export async function loadPartFile(level, part) {
  const d = await fetchJson(`data/${level}/${part}.json`);
  return d && Array.isArray(d.sets) ? d.sets : [];
}

export async function loadVocab(level) {
  const d = await fetchJson(`data/${level}/vocab.json`);
  return d && Array.isArray(d.words) ? d.words : [];
}

export async function loadTests(level) {
  const d = await fetchJson(`data/${level}/tests.json`);
  return d && Array.isArray(d.tests) ? d.tests : [];
}

export async function loadEvaluation(level) {
  const d = await fetchJson(`data/${level}/evaluation.json`);
  return d && Array.isArray(d.sets) ? d : { level, id: `${level}-eval`, title: 'Level check', minutes: 30, sets: [] };
}

export function getImportedSets(level) {
  return get(`imported.${level}`, []);
}

export function saveImportedSets(level, sets) {
  set(`imported.${level}`, sets);
}

export function deleteImportedSet(level, id) {
  const sets = getImportedSets(level).filter((s) => s.id !== id);
  saveImportedSets(level, sets);
}

export function addImportedSets(level, newSets) {
  const existing = getImportedSets(level);
  const ids = new Set(existing.map((s) => s.id));
  const merged = existing.slice();
  for (const s of newSets) {
    if (ids.has(s.id)) continue; // skip dupes silently; UI already previews counts
    merged.push(Object.assign({}, s, { imported: true }));
    ids.add(s.id);
  }
  saveImportedSets(level, merged);
  return merged;
}

/** All sets (bundled + imported) belonging to one part, each tagged with .imported true/false. */
export async function setsForPart(level, part) {
  const meta = partMeta(level, part);
  const bundled = (await loadPartFile(level, part)).map((s) => Object.assign({}, s, { imported: false }));
  const imported = getImportedSets(level).filter((s) => s.type === (meta && meta.type)).map((s) => Object.assign({}, s, { imported: true }));
  return bundled.concat(imported);
}

export async function findSetById(level, id) {
  for (const p of PARTS[level] || []) {
    const sets = await setsForPart(level, p.part);
    const found = sets.find((s) => s.id === id);
    if (found) return found;
  }
  const evalData = await loadEvaluation(level);
  const found = (evalData.sets || []).find((s) => s.id === id);
  if (found) return found;
  return null;
}

export function clearCache() { cache.clear(); }
