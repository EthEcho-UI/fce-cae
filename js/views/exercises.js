import { esc } from '../dom.js';
import { setsForPart, partMeta } from '../data.js';
import { bestScore } from '../progress.js';
import { icons } from '../icons.js';

export async function render(ctx) {
  const { level, params } = ctx;
  const part = params[0];
  const meta = partMeta(level, part);
  if (!meta) {
    const el = document.createElement('div');
    el.className = 'page';
    el.innerHTML = '<p>Unknown part.</p>';
    return el;
  }
  const sets = await setsForPart(level, part);

  const root = document.createElement('div');
  root.className = 'page page-exercises';
  root.innerHTML = `
    <a class="back-link" href="#/practise">${icons.arrowLeft} Practise</a>
    <h1 class="page-title">${esc(meta.label)}</h1>
    <p class="page-sub">${esc(meta.blurb)} · ${meta.questions} questions · about ${Math.max(5, Math.round(meta.questions * 1.2))} min.</p>
    <button type="button" id="random-set-btn" class="btn btn-secondary">Random unfinished set</button>
    <ul class="set-list">
      ${sets.length ? sets.map((s) => {
        const score = bestScore(level, s.id);
        return `
        <li>
          <a class="set-row" href="#/exercises/${part}/${esc(s.id)}">
            <span class="set-row-main">
              <span class="set-title">${esc(s.title)}${s.imported ? ' <span class="pill pill-imported">Imported</span>' : ''}</span>
              <span class="set-meta">${esc(s.topic || '')}</span>
            </span>
            <span class="set-row-score">${score ? `${score.correct}/${score.total}` : '—'}</span>
          </a>
        </li>`;
      }).join('') : '<li class="empty-note">No sets available yet for this part.</li>'}
    </ul>
  `;
  const btn = root.querySelector('#random-set-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      if (!sets.length) return;
      const unfinished = sets.filter((s) => {
        const sc = bestScore(level, s.id);
        return !sc || sc.correct < sc.total;
      });
      const pool = unfinished.length ? unfinished : sets;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      ctx.navigate(`/exercises/${part}/${pick.id}`);
    });
  }
  return root;
}
