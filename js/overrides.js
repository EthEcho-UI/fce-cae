// "Count my answer as correct" overrides for typed-answer question types.
import { get, set } from './store.js';
import { resolveMistake, mistakeKey } from './mistakes.js';
import { basicNormalize } from './normalize.js';

function key(level) { return `overrides.${level}`; }

export function getOverrides(level) { return get(key(level), {}); }

export function getOverrideAnswers(level, setId, n) {
  const all = getOverrides(level);
  return all[mistakeKey(setId, n)] || [];
}

export function addOverride(level, setId, n, rawAnswer) {
  const all = getOverrides(level);
  const k = mistakeKey(setId, n);
  const norm = basicNormalize(rawAnswer);
  all[k] = Array.from(new Set((all[k] || []).concat([norm])));
  set(key(level), all);
  resolveMistake(level, k);
}
