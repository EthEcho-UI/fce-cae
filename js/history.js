// Practice-test and evaluation-test history, per level.
import { get, set } from './store.js';

function testKey(level) { return `history.tests.${level}`; }
function evalKey(level) { return `history.eval.${level}`; }

export function getTestHistory(level) { return get(testKey(level), []); }
export function addTestResult(level, result) {
  const list = getTestHistory(level);
  list.unshift(Object.assign({ date: new Date().toISOString() }, result));
  set(testKey(level), list.slice(0, 100));
}

export function getEvalHistory(level) { return get(evalKey(level), []); }
export function addEvalResult(level, result) {
  const list = getEvalHistory(level);
  list.unshift(Object.assign({ date: new Date().toISOString() }, result));
  set(evalKey(level), list.slice(0, 100));
}
