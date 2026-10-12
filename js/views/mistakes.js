import { esc } from '../dom.js';
import { filterMistakes, resolveMistake, setLearned, openCount } from '../mistakes.js';
import { findSetById, PARTS } from '../data.js';
import { gradeQuestion } from '../grading.js';
import { recordAnswer } from '../progress.js';
import { addCustomCard } from '../flashcards.js';
import { tagLabel } from '../skillmap.js';

function allTags(level) {
  const tags = new Set();
  for (const m of filterMistakes(level, {})) if (m.tag) tags.add(m.tag);
  return Array.from(tags).sort();
}

export async function render(ctx) {
  const { level, query } = ctx;
  const root = document.createElement('div');
  root.className = 'page page-mistakes';
  root.innerHTML = `
    <h1 class="page-title">Mistakes notebook</h1>
    <p class="page-sub">${openCount(level)} open · every wrong answer you've had, with context and explanations.</p>
    <div class="tabs" role="tablist">
      <button type="button" class="tab-btn tab-btn-active" data-tab="open" role="tab" aria-selected="true">Open</button>
      <button type="button" class="tab-btn" data-tab="resolved" role="tab" aria-selected="false">Resolved</button>
    </div>
    <div class="filter-row">
      <input type="search" id="mistake-search" class="text-input" placeholder="Search mistakes…" aria-label="Search mistakes">
      <select id="mistake-part" class="select-input" aria-label="Filter by part">
        <option value="">All parts</option>
        ${PARTS[level].map((p) => `<option value="${p.part}">${esc(p.label)}</option>`).join('')}
      </select>
      <select id="mistake-tag" class="select-input" aria-label="Filter by tag">
        <option value="">All tags</option>
        ${allTags(level).map((t) => `<option value="${t}">${esc(tagLabel(t))}</option>`).join('')}
      </select>
    </div>
    <div id="mistake-list" class="mistake-list"></div>
  `;

  let activeTab = 'open';
  if (query && query.tag) root.querySelector('#mistake-tag').value = query.tag;
  if (query && query.part) root.querySelector('#mistake-part').value = query.part;

  function currentFilters() {
    return {
      resolved: activeTab === 'resolved',
      part: root.querySelector('#mistake-part').value || undefined,
      tag: root.querySelector('#mistake-tag').value || undefined,
      search: root.querySelector('#mistake-search').value || undefined,
    };
  }

  async function refresh() {
    const list = filterMistakes(level, currentFilters());
    const listEl = root.querySelector('#mistake-list');
    listEl.innerHTML = '';
    if (!list.length) {
      listEl.innerHTML = '<p class="empty-note">Nothing here.</p>';
      return;
    }
    for (const m of list) listEl.appendChild(renderMistakeCard(level, m, refresh));
  }

  root.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
    activeTab = b.dataset.tab;
    root.querySelectorAll('.tab-btn').forEach((x) => {
      x.classList.toggle('tab-btn-active', x === b);
      x.setAttribute('aria-selected', String(x === b));
    });
    refresh();
  }));
  root.querySelector('#mistake-search').addEventListener('input', refresh);
  root.querySelector('#mistake-part').addEventListener('change', refresh);
  root.querySelector('#mistake-tag').addEventListener('change', refresh);

  await refresh();
  return root;
}

function renderMistakeCard(level, m, onChange) {
  const card = document.createElement('article');
  card.className = 'card mistake-card';
  const correctList = Array.isArray(m.correctAnswers) ? m.correctAnswers.join(' / ') : m.correctAnswers;
  card.innerHTML = `
    <p class="card-label">${esc(m.setTitle || m.part)} · Q${m.n} · ${esc(tagLabel(m.tag))} · wrong ${m.timesWrong}×</p>
    <p class="mistake-context">${esc(m.context)}</p>
    <p class="mistake-line"><strong>Your answer:</strong> ${esc(m.yourAnswer || '(no answer)')}</p>
    <p class="mistake-line"><strong>Correct:</strong> ${esc(correctList)}</p>
    <p class="mistake-explanation">${esc(m.explanation || '')}</p>
    <div class="mistake-actions"></div>
    <div class="mistake-retry-slot"></div>
  `;
  const actions = card.querySelector('.mistake-actions');

  if (!m.resolved) {
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'btn btn-secondary btn-small';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', async () => {
      const slot = card.querySelector('.mistake-retry-slot');
      slot.innerHTML = '';
      slot.appendChild(await buildRetry(level, m, onChange));
    });
    actions.appendChild(retryBtn);
  }

  const learnBtn = document.createElement('button');
  learnBtn.type = 'button';
  learnBtn.className = 'btn btn-ghost btn-small';
  learnBtn.textContent = m.learned ? 'Learned ✓' : 'Mark as learned';
  learnBtn.addEventListener('click', () => { setLearned(level, m.key, !m.learned); onChange(); });
  actions.appendChild(learnBtn);

  const cardBtn = document.createElement('button');
  cardBtn.type = 'button';
  cardBtn.className = 'btn btn-ghost btn-small';
  cardBtn.textContent = 'Add to flashcards';
  cardBtn.addEventListener('click', () => {
    addCustomCard(level, m.context, `${correctList}${m.explanation ? ' — ' + m.explanation : ''}`);
    cardBtn.textContent = 'Added ✓';
    cardBtn.disabled = true;
  });
  actions.appendChild(cardBtn);

  return card;
}

async function buildRetry(level, m, onChange) {
  const wrap = document.createElement('div');
  const set = await findSetById(level, m.setId);
  const q = set && set.questions.find((qq) => qq.n === m.n);
  if (!set || !q) { wrap.textContent = 'This set is no longer available.'; return wrap; }

  const type = set.type;
  let getAnswer = () => '';
  if (type === 'mcCloze' || type === 'multipleChoice') {
    const row = document.createElement('div');
    row.className = 'optrow';
    let chosen = null;
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'optbtn';
      b.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
      b.addEventListener('click', () => {
        chosen = i;
        row.querySelectorAll('.optbtn').forEach((x, xi) => x.classList.toggle('optbtn-selected', xi === i));
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    getAnswer = () => chosen;
  } else if (type === 'gappedText' || type === 'crossText' || type === 'multipleMatching') {
    const letters = type === 'gappedText' ? (set.options || []).map((o) => o.id) : (set.sections || []).map((s) => s.id);
    const row = document.createElement('div');
    row.className = 'letterrow';
    let chosen = null;
    letters.forEach((L) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'letterbtn';
      b.textContent = L;
      b.addEventListener('click', () => { chosen = L; row.querySelectorAll('.letterbtn').forEach((x) => x.classList.toggle('letterbtn-selected', x.textContent === L)); });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    getAnswer = () => chosen;
  } else {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gap-input';
    wrap.appendChild(input);
    getAnswer = () => input.value;
  }

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'btn btn-primary btn-small';
  checkBtn.textContent = 'Check';
  const fb = document.createElement('p');
  fb.className = 'feedback-line';
  checkBtn.addEventListener('click', () => {
    const result = gradeQuestion(set, q, getAnswer(), []);
    recordAnswer(level, { part: m.part, tag: q.tag, correct: result.correct });
    if (result.correct) {
      resolveMistake(level, m.key);
      fb.textContent = 'Correct — resolved.';
      fb.className = 'feedback-line feedback-correct-text';
      setTimeout(onChange, 600);
    } else {
      fb.textContent = 'Still incorrect — try again later.';
      fb.className = 'feedback-line feedback-incorrect-text';
    }
  });
  wrap.appendChild(checkBtn);
  wrap.appendChild(fb);
  return wrap;
}
