import { esc } from '../dom.js';
import { loadVocab } from '../data.js';
import { isStarred, toggleStar } from '../flashcards.js';
import { icons } from '../icons.js';

function highlightWord(example, word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped.split(' ').join('\\s+')}\\w*)`, 'i');
  const m = example.match(re);
  if (!m) return esc(example);
  const idx = m.index;
  return `${esc(example.slice(0, idx))}<mark>${esc(m[0])}</mark>${esc(example.slice(idx + m[0].length))}`;
}

async function renderDetail(ctx, words) {
  const { level } = ctx;
  const word = words.find((w) => w.id === ctx.params[0]);
  const root = document.createElement('div');
  root.className = 'page page-vocab-detail';
  if (!word) { root.innerHTML = '<p>Word not found.</p>'; return root; }
  const starred = isStarred(level, word.id);
  root.innerHTML = `
    <a class="back-link" href="#/vocab">${icons.arrowLeft} Vocabulary</a>
    <div class="word-detail-head">
      <h1 class="page-title">${esc(word.word)}</h1>
      <button type="button" id="star-btn" class="icon-btn" aria-pressed="${starred}" aria-label="Star this word">${starred ? icons.star : icons.starOutline}</button>
    </div>
    <p class="word-pos">${esc(word.pos)} · ${esc(word.topic)}</p>
    <p class="word-definition">${esc(word.definition)}</p>
    <p class="word-example">${highlightWord(word.example, word.word)}</p>
    ${word.collocations && word.collocations.length ? `
      <h2 class="section-heading">Collocations</h2>
      <ul class="plain-list">${word.collocations.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
  `;
  root.querySelector('#star-btn').addEventListener('click', (e) => {
    const now = toggleStar(level, word.id);
    e.currentTarget.innerHTML = now ? icons.star : icons.starOutline;
    e.currentTarget.setAttribute('aria-pressed', String(now));
  });
  return root;
}

async function renderBrowse(ctx, words) {
  const { level } = ctx;
  const root = document.createElement('div');
  root.className = 'page page-vocab';
  const topics = Array.from(new Set(words.map((w) => w.topic))).sort();
  const poses = Array.from(new Set(words.map((w) => w.pos))).sort();
  root.innerHTML = `
    <h1 class="page-title">Vocabulary</h1>
    <p class="page-sub">${words.length} words · ${level.toUpperCase()}</p>
    <a class="link-card link-card-inline" href="#/vocab-quiz">${icons.flag}<span>Vocabulary quiz</span></a>
    <div class="filter-row">
      <input type="search" id="vocab-search" class="text-input" placeholder="Search words…" aria-label="Search vocabulary">
      <select id="vocab-topic" class="select-input" aria-label="Filter by topic">
        <option value="">All topics</option>
        ${topics.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}
      </select>
      <select id="vocab-pos" class="select-input" aria-label="Filter by part of speech">
        <option value="">All parts of speech</option>
        ${poses.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}
      </select>
    </div>
    <ul id="vocab-list" class="vocab-list"></ul>
  `;

  function refresh() {
    const q = root.querySelector('#vocab-search').value.toLowerCase();
    const topic = root.querySelector('#vocab-topic').value;
    const pos = root.querySelector('#vocab-pos').value;
    const filtered = words.filter((w) => (!topic || w.topic === topic) && (!pos || w.pos === pos)
      && (!q || w.word.toLowerCase().includes(q) || w.definition.toLowerCase().includes(q)));
    const list = root.querySelector('#vocab-list');
    list.innerHTML = filtered.map((w) => `
      <li><a class="vocab-row" href="#/vocab/${esc(w.id)}">
        <span class="vocab-word">${esc(w.word)}${isStarred(level, w.id) ? ' ' + icons.star : ''}</span>
        <span class="vocab-pos-tag">${esc(w.pos)}</span>
      </a></li>
    `).join('') || '<li class="empty-note">No words match.</li>';
  }
  root.querySelector('#vocab-search').addEventListener('input', refresh);
  root.querySelector('#vocab-topic').addEventListener('change', refresh);
  root.querySelector('#vocab-pos').addEventListener('change', refresh);
  refresh();
  return root;
}

export async function render(ctx) {
  const words = await loadVocab(ctx.level);
  if (ctx.params.length) return renderDetail(ctx, words);
  return renderBrowse(ctx, words);
}
