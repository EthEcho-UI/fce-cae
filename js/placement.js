// Level estimate: an adaptive placement test (B1 -> C2) over a bank of grammar/vocabulary items.
// Pure logic + persistence; no DOM.
import { get, set, remove } from './store.js';

export const BLOCK_SIZE = 8;
export const PASS_MARK = 6;
export const BORDERLINE_MARK = 5;
export const START_LEVEL = 'B2';

export const SCALE = {
  B1: [140, 159], B2: [160, 179], C1: [180, 199], C2: [200, 230],
};

let bankPromise = null;
export function loadPlacement() {
  if (!bankPromise) {
    bankPromise = fetch('data/level/placement.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !Array.isArray(d.items)) return { items: [] };
        d.items.forEach((it, i) => { it.n = i + 1; });
        return d;
      })
      .catch(() => ({ items: [] }));
  }
  return bankPromise;
}

/** Next CEFR block to give, or null when the test is over. `blocks` = finished blocks
 * [{cefr, correct, total}] in order. */
export function nextLevel(blocks) {
  if (!blocks.length) return START_LEVEL;
  const last = blocks[blocks.length - 1];
  const passed = last.correct >= PASS_MARK;
  if (last.cefr === 'B2') return passed ? 'C1' : 'B1';
  if (last.cefr === 'C1') return passed ? 'C2' : null;
  return null; // B1 and C2 are the ends of the ladder
}

/** The estimate from finished blocks. `close` = the next level up was missed by one question. */
export function estimate(blocks) {
  const by = Object.fromEntries(blocks.map((b) => [b.cefr, b]));
  const passed = (c) => by[c] && by[c].correct >= PASS_MARK;
  const near = (c) => by[c] && by[c].correct === BORDERLINE_MARK;
  let level; let up = null;
  if (passed('C2')) level = 'C2';
  else if (passed('C1')) { level = 'C1'; if (near('C2')) up = 'C2'; }
  else if (passed('B2')) { level = 'B2'; if (near('C1')) up = 'C1'; }
  else if (passed('B1')) { level = 'B1'; if (near('B2')) up = 'B2'; }
  else { level = 'Below B1'; if (near('B1')) up = 'B1'; }
  return { level, close: up };
}

/** Which exam to start with for an estimated level. */
export function recommendation(level) {
  if (level === 'C1' || level === 'C2') return { exam: 'cae', text: 'C1 Advanced (CAE) is the right target.' };
  if (level === 'B2') return { exam: 'fce', text: 'B2 First (FCE) is the right target; move on to C1 Advanced (CAE) once FCE tests feel comfortable.' };
  return { exam: 'fce', text: 'Build towards B2 First (FCE): start with the exercises and vocabulary, and retake this estimate in a few weeks.' };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw one block: half grammar, half vocabulary where the bank allows, never an id in `exclude`. */
export function drawBlock(items, cefr, exclude = [], rng = Math.random) {
  const pool = items.filter((it) => it.cefr === cefr && !exclude.includes(it.id));
  const g = shuffle(pool.filter((it) => it.skill === 'grammar'), rng);
  const v = shuffle(pool.filter((it) => it.skill === 'vocabulary'), rng);
  const half = BLOCK_SIZE / 2;
  let pick = g.slice(0, half).concat(v.slice(0, half));
  if (pick.length < BLOCK_SIZE) {
    const rest = shuffle(pool.filter((it) => !pick.includes(it)), rng);
    pick = pick.concat(rest.slice(0, BLOCK_SIZE - pick.length));
  }
  return shuffle(pick, rng).map((it) => it.id);
}

/* ---- persisted in-progress state and history ---- */
const STATE_KEY = 'placement.state';
const HISTORY_KEY = 'history.placement';

export function getState() { return get(STATE_KEY, null); }
export function saveState(state) { set(STATE_KEY, state); }
export function clearState() { remove(STATE_KEY); }

export function getPlacementHistory() { return get(HISTORY_KEY, []); }
export function addPlacementResult(result) {
  const list = getPlacementHistory();
  list.unshift(Object.assign({ date: new Date().toISOString() }, result));
  set(HISTORY_KEY, list.slice(0, 50));
}
