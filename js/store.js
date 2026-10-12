// Storage layer: all keys are prefixed `fcecae.`. Handles corrupt-JSON recovery and quota errors.
export const PREFIX = 'fcecae.';

const warnings = [];
let warnListener = null;

export function onWarning(fn) { warnListener = fn; }

function warn(msg) {
  warnings.push({ msg, at: Date.now() });
  if (warnListener) warnListener(msg);
}

export function getWarnings() { return warnings.slice(); }

function k(key) { return PREFIX + key; }

/** Read a JSON value. Returns `fallback` if missing. If present but unparsable,
 * backs up the raw value under fcecae.backup.<key>.<timestamp> and warns, then
 * returns `fallback` (never silently overwrites the corrupt value). */
export function get(key, fallback) {
  let raw;
  try {
    raw = localStorage.getItem(k(key));
  } catch (e) {
    warn(`Could not read saved data for "${key}" (storage unavailable).`);
    return fallback;
  }
  if (raw === null || raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const ts = Date.now();
    try {
      localStorage.setItem(k(`backup.${key}.${ts}`), raw);
    } catch (e2) { /* can't even back up; still warn */ }
    warn(`Saved data for "${key}" was corrupted and could not be read. A backup of the raw value was kept as "fcecae.backup.${key}.${ts}". Using defaults instead.`);
    return fallback;
  }
}

/** Write a JSON value. Returns true on success. On quota errors, warns and returns false
 * without throwing — callers should surface this to the user. */
export function set(key, value) {
  try {
    localStorage.setItem(k(key), JSON.stringify(value));
    return true;
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      warn('Storage is full — this change could not be saved. Try freeing space (Settings → Reset data, or delete some imported sets/flashcards).');
    } else {
      warn(`Could not save "${key}": ${e && e.message ? e.message : e}`);
    }
    return false;
  }
}

export function remove(key) {
  try { localStorage.removeItem(k(key)); } catch (e) { /* ignore */ }
}

/** All *our* keys (fcecae.*), full key names including prefix. */
function ownKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (name && name.startsWith(PREFIX)) out.push(name);
    }
  } catch (e) { /* ignore */ }
  return out;
}

/** Download-ready backup object of all fcecae.* data (raw strings, so restore is lossless
 * even if some entries were already corrupted backups). */
export function backupAll() {
  const data = {};
  for (const full of ownKeys()) {
    try { data[full] = localStorage.getItem(full); } catch (e) { /* skip */ }
  }
  return { app: 'fcecae', version: 1, exportedAt: new Date().toISOString(), data };
}

/** Restore from a backupAll()-shaped object. Only ever writes fcecae.* keys. Returns
 * {ok, count, error}. */
export function restoreAll(obj) {
  if (!obj || typeof obj !== 'object' || !obj.data || typeof obj.data !== 'object') {
    return { ok: false, count: 0, error: 'This file is not a valid First & Advanced Prep backup.' };
  }
  let count = 0;
  for (const [key, val] of Object.entries(obj.data)) {
    if (!key.startsWith(PREFIX)) continue; // never touch foreign keys
    if (typeof val !== 'string') continue;
    try { localStorage.setItem(key, val); count++; } catch (e) { /* skip this one */ }
  }
  return { ok: true, count };
}

/** Remove only our own keys. Never touches other apps' localStorage/caches. */
export function resetAll() {
  for (const full of ownKeys()) {
    try { localStorage.removeItem(full); } catch (e) { /* ignore */ }
  }
}

export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch (e) { /* non-fatal */ }
}
