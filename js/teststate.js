// Autosave for in-progress practice tests & the evaluation test (so a reload resumes).
import { get, set, remove } from './store.js';

function key(level, id) { return `teststate.${level}.${id}`; }

export function getTestState(level, id) {
  return get(key(level, id), null);
}

export function saveTestState(level, id, state) {
  set(key(level, id), state);
}

export function clearTestState(level, id) {
  remove(key(level, id));
}
