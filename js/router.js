// Minimal hash router. All app URLs are of the form #/path/segments.
let listeners = [];

export function currentPath() {
  const h = location.hash || '#/';
  const body = h.replace(/^#/, '') || '/';
  const i = body.indexOf('?');
  return (i >= 0 ? body.slice(0, i) : body) || '/';
}

export function queryParams() {
  const h = location.hash || '#/';
  const i = h.indexOf('?');
  if (i < 0) return {};
  return Object.fromEntries(new URLSearchParams(h.slice(i + 1)));
}

export function parts() {
  return currentPath().split('/').filter(Boolean);
}

export function go(path) {
  if (location.hash === `#${path}`) {
    // same hash: still re-render (e.g. re-entering a player)
    dispatch();
  } else {
    location.hash = `#${path}`;
  }
}

export function replace(path) {
  const url = new URL(location.href);
  url.hash = `#${path}`;
  history.replaceState(null, '', url);
  dispatch();
}

function dispatch() {
  for (const fn of listeners) fn(currentPath(), parts());
}

export function onRoute(fn) {
  listeners.push(fn);
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  if (!location.hash) location.hash = '#/';
  dispatch();
}
