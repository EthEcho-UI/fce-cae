// Training drills: short mixed quizzes generated from the Use of English question pool.
// Pure logic (no DOM) so it can be tested directly.
import { get, set } from './store.js';
import { setsForPart } from './data.js';
import { skillGroup } from './skillmap.js';
import { accuracyBySkill } from './progress.js';
import { getAll as getMistakes } from './mistakes.js';

const DRILL_PARTS = ['uoe1', 'uoe2', 'uoe3', 'uoe4'];

export const FOCUSES = [
  { id: 'mixed', label: 'Mixed', blurb: 'All four Use of English task types.' },
  { id: 'grammar', label: 'Grammar', blurb: 'Tenses, modals, conditionals, linking and more.' },
  { id: 'vocabulary', label: 'Vocabulary', blurb: 'Collocations, phrasal verbs, idioms, word formation.' },
  { id: 'wordFormation', label: 'Word formation', blurb: 'Build the right word from a stem.' },
  { id: 'transformation', label: 'Key word transformations', blurb: 'Rewrite a sentence using the key word.' },
  { id: 'weak', label: 'My weak areas', blurb: 'Targets the skills you get wrong most often.' },
];

export const LENGTHS = [10, 15, 20];
export const MIN_WEAK_POOL = 5;

function seenKey(level) { return `training.seen.${level}`; }
export function getSeen(level) { return get(seenKey(level), {}); }
export function recordSeen(level, key, correct) {
  const seen = getSeen(level);
  seen[key] = { r: correct ? 1 : 0, t: Date.now() };
  set(seenKey(level), seen);
}

function historyKey(level) { return `history.training.${level}`; }
export function getTrainingHistory(level) { return get(historyKey(level), []); }
export function addTrainingResult(level, result) {
  const list = getTrainingHistory(level);
  list.unshift(Object.assign({ date: new Date().toISOString() }, result));
  set(historyKey(level), list.slice(0, 100));
}

function splitSentences(par) {
  return par.split(/(?<=[.!?]["'”’)]?)\s+(?=["'“‘(]?[A-Z{])/);
}

function gapFiller(setObj) {
  return (m) => {
    const q = setObj.questions.find((x) => x.n === Number(m));
    if (!q) return '…';
    if (setObj.type === 'mcCloze') return q.options[q.answer];
    return (q.answers && q.answers[0]) || '…';
  };
}

/** The sentence holding gap `n` (with other gaps filled in). Pronoun/linking/short sentences
 * get the preceding sentence as lead-in so the item stays answerable out of context. */
export function gapContext(setObj, n) {
  const fill = gapFiller(setObj);
  const marker = `{{${n}}}`;
  for (const par of setObj.text || []) {
    if (!par.includes(marker)) continue;
    const sents = splitSentences(par);
    const i = sents.findIndex((s) => s.includes(marker));
    if (i < 0) continue;
    const q = setObj.questions.find((x) => x.n === n);
    const short = sents[i].split(/\s+/).length < 9;
    const needsLead = short || ['linking', 'pronoun-reference', 'tense'].includes(q && q.tag) || setObj.type === 'openCloze';
    const take = needsLead && i > 0 ? [sents[i - 1], sents[i]] : [sents[i]];
    return take.join(' ')
      .replace(marker, '_____')
      .replace(/\{\{(\d+)\}\}/g, (_, m) => fill(m));
  }
  return '';
}

export async function buildPool(level) {
  const pool = [];
  for (const part of DRILL_PARTS) {
    for (const s of await setsForPart(level, part)) {
      for (const q of s.questions || []) {
        pool.push({
          key: `${s.id}::${q.n}`, setId: s.id, setTitle: s.title, n: q.n, part, type: s.type,
          tag: q.tag, skill: skillGroup(q.tag),
          context: s.type === 'transformation' ? '' : gapContext(s, q.n),
          set: s, q,
        });
      }
    }
  }
  return pool;
}

export function weakTags(level) {
  const acc = accuracyBySkill(level);
  const tags = new Set();
  for (const [tag, v] of Object.entries(acc)) if (v.total >= 3 && v.correct / v.total < 0.7) tags.add(tag);
  for (const m of getMistakes(level)) if (!m.resolved && m.tag) tags.add(m.tag);
  return tags;
}

export function filterPool(pool, focus, level) {
  if (focus === 'grammar') return pool.filter((it) => it.skill === 'Grammar');
  if (focus === 'vocabulary') return pool.filter((it) => it.skill === 'Vocabulary');
  if (focus === 'wordFormation') return pool.filter((it) => it.type === 'wordFormation');
  if (focus === 'transformation') return pool.filter((it) => it.type === 'transformation');
  if (focus === 'weak') {
    const tags = weakTags(level);
    return pool.filter((it) => tags.has(it.tag));
  }
  return pool;
}

/** Weighted sample without replacement: unseen > previously wrong > previously right;
 * items from a set already picked are slightly less likely, for variety. */
export function pickItems(pool, count, seen, rng = Math.random) {
  const cand = pool.map((it) => {
    const s = seen[it.key];
    return { it, w: !s ? 3 : (s.r === 0 ? 2.5 : 0.6) };
  });
  const out = [];
  while (out.length < count && cand.length) {
    const total = cand.reduce((a, x) => a + x.w, 0);
    let r = rng() * total;
    let i = 0;
    for (; i < cand.length - 1; i++) { r -= cand[i].w; if (r <= 0) break; }
    const [{ it }] = cand.splice(i, 1);
    out.push(it);
    for (const x of cand) if (x.it.setId === it.setId) x.w *= 0.7;
  }
  return out;
}

/** About one minute per question, two for key word transformations. */
export function timeLimitSeconds(items) {
  return items.reduce((a, it) => a + (it.type === 'transformation' ? 120 : 60), 0);
}
