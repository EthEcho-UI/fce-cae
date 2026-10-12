// Global app settings (not per-level): theme, text size, level switch, new-cards/day.
import { get, set } from './store.js';

const KEY = 'settings';

function defaults() {
  return { level: 'fce', theme: 'system', textSize: 1, newCardsPerDay: 15 };
}

export function getSettings() {
  return Object.assign(defaults(), get(KEY, {}));
}

export function updateSettings(patch) {
  const s = Object.assign(getSettings(), patch);
  set(KEY, s);
  return s;
}

export function getLevel() { return getSettings().level; }
export function setLevel(level) { return updateSettings({ level }); }

export function getContinue(level) {
  const s = getSettings();
  return (s.continueByLevel && s.continueByLevel[level]) || null;
}

export function setContinue(level, info) {
  const s = getSettings();
  const continueByLevel = Object.assign({}, s.continueByLevel, { [level]: info });
  return updateSettings({ continueByLevel });
}
