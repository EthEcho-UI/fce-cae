import { startRouter, onRoute, go, currentPath, queryParams } from './router.js';
import { onWarning, getWarnings, requestPersistence } from './store.js';
import { getSettings, updateSettings, setLevel } from './settings.js';
import { icons } from './icons.js';
import { esc } from './dom.js';

import * as home from './views/home.js';
import * as practise from './views/practise.js';
import * as exercises from './views/exercises.js';
import * as exerciseSet from './views/exerciseSet.js';
import * as tests from './views/tests.js';
import * as evaluation from './views/evaluation.js';
import * as training from './views/training.js';
import * as levelEstimate from './views/levelEstimate.js';
import * as mistakes from './views/mistakes.js';
import * as vocab from './views/vocab.js';
import * as vocabQuiz from './views/vocabQuiz.js';
import * as flashcards from './views/flashcards.js';
import * as progress from './views/progress.js';
import * as more from './views/more.js';
import * as settingsView from './views/settings.js';
import * as importView from './views/import.js';
import * as about from './views/about.js';
import * as notFound from './views/notFound.js';

const NAV_ITEMS = [
  { path: '/', label: 'Home', icon: 'home' },
  { path: '/practise', label: 'Practise', icon: 'practise' },
  { path: '/flashcards', label: 'Cards', icon: 'cards' },
  { path: '/mistakes', label: 'Mistakes', icon: 'mistakes' },
  { path: '/more', label: 'More', icon: 'more' },
];

const ROUTES = [
  [/^\/$/, home],
  [/^\/practise$/, practise],
  [/^\/exercises\/([a-z0-9]+)$/, exercises],
  [/^\/exercises\/([a-z0-9]+)\/([^/]+)$/, exerciseSet],
  [/^\/tests$/, tests],
  [/^\/tests\/([^/]+)$/, tests],
  [/^\/evaluation$/, evaluation],
  [/^\/training$/, training],
  [/^\/level$/, levelEstimate],
  [/^\/mistakes$/, mistakes],
  [/^\/vocab$/, vocab],
  [/^\/vocab\/([^/]+)$/, vocab],
  [/^\/vocab-quiz$/, vocabQuiz],
  [/^\/flashcards$/, flashcards],
  [/^\/flashcards\/([^/]+)$/, flashcards],
  [/^\/progress$/, progress],
  [/^\/more$/, more],
  [/^\/settings$/, settingsView],
  [/^\/import$/, importView],
  [/^\/about$/, about],
];

function applyTheme() {
  const { theme, textSize } = getSettings();
  document.documentElement.setAttribute('data-theme', theme === 'system' ? '' : theme);
  document.documentElement.setAttribute('data-text-size', String(textSize));
}

function renderThemeSwitch() {
  const el = document.getElementById('theme-switch');
  const { theme } = getSettings();
  const opts = [['system', 'system', 'System theme'], ['light', 'sun', 'Light theme'], ['dark', 'moon', 'Dark theme']];
  el.innerHTML = opts.map(([val, ic, label]) => `
    <button type="button" class="theme-btn${theme === val ? ' theme-btn-active' : ''}" data-theme="${val}" aria-pressed="${theme === val}" aria-label="${esc(label)}" title="${esc(label)}">${icons[ic]}</button>
  `).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    updateSettings({ theme: b.dataset.theme });
    applyTheme();
    renderThemeSwitch();
  }));
}

function renderLevelSwitch() {
  const el = document.getElementById('level-switch');
  const { level } = getSettings();
  el.innerHTML = ['fce', 'cae'].map((lv) => `
    <button type="button" class="segmented-btn${level === lv ? ' segmented-btn-active' : ''}" data-level="${lv}" aria-pressed="${level === lv}">${lv.toUpperCase()}</button>
  `).join('');
  el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.level === level) return;
    setLevel(b.dataset.level);
    renderLevelSwitch();
    go('/');
  }));
}

function navHtml(activePath) {
  return NAV_ITEMS.map((item) => {
    const active = activePath === item.path || (item.path !== '/' && activePath.startsWith(item.path));
    return `<li><a href="#${item.path}" class="nav-link${active ? ' nav-link-active' : ''}" aria-current="${active ? 'page' : 'false'}">
      <span class="nav-icon">${icons[item.icon]}</span><span class="nav-label">${item.label}</span>
    </a></li>`;
  }).join('');
}

function renderNav(path) {
  document.getElementById('side-nav-list').innerHTML = navHtml(path);
  document.getElementById('bottom-nav-list').innerHTML = navHtml(path);
}

function matchRoute(path) {
  for (const [re, mod] of ROUTES) {
    const m = path.match(re);
    if (m) return { mod, params: m.slice(1) };
  }
  return { mod: notFound, params: [] };
}

let renderToken = 0;
async function renderRoute() {
  if (window.__fcecaeTeardown) { try { window.__fcecaeTeardown(); } catch (e) { /* ignore */ } window.__fcecaeTeardown = null; }
  const path = currentPath();
  renderNav(path);
  const app = document.getElementById('app');
  const { mod, params } = matchRoute(path);
  const myToken = ++renderToken;
  const ctx = { level: getSettings().level, params, path, navigate: go, query: queryParams() };
  try {
    const out = await mod.render(ctx);
    if (myToken !== renderToken) return; // a newer navigation happened while loading
    if (typeof out === 'string') app.innerHTML = out;
    else { app.innerHTML = ''; if (out) app.appendChild(out); }
    if (mod.afterRender) mod.afterRender(ctx, app);
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="page"><h1>Something went wrong</h1><p>${esc(e && e.message || String(e))}</p></div>`;
  }
}

function wireStorageWarnings() {
  const banner = document.getElementById('storage-warning');
  function show(msg) {
    banner.textContent = msg;
    banner.hidden = false;
  }
  onWarning(show);
  const existing = getWarnings();
  if (existing.length) show(existing[existing.length - 1].msg);
  banner.addEventListener('click', () => { banner.hidden = true; });
}

function wireServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).then((reg) => {
    function showUpdateBanner(waiting) {
      const banner = document.getElementById('update-banner');
      banner.hidden = false;
      document.getElementById('update-reload-btn').onclick = () => {
        waiting.postMessage({ type: 'SKIP_WAITING' });
      };
    }
    if (reg.waiting) showUpdateBanner(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) showUpdateBanner(nw);
      });
    });
    let refreshed = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed || !hadController) return; // first install: the page is already current
      refreshed = true;
      location.reload();
    });
  }).catch(() => { /* SW not critical to app function */ });
}

function init() {
  applyTheme();
  renderThemeSwitch();
  renderLevelSwitch();
  wireStorageWarnings();
  requestPersistence();
  onRoute(renderRoute);
  startRouter();
  wireServiceWorker();
}

init();
