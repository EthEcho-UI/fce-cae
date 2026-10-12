import { esc } from '../dom.js';
import { getContinue } from '../settings.js';
import { openCount } from '../mistakes.js';
import { buildAllCards, dueCount } from '../deck.js';
import { streak, totalAnswered } from '../progress.js';
import { PARTS } from '../data.js';
import { icons } from '../icons.js';

export async function render(ctx) {
  const { level } = ctx;
  const cont = getContinue(level);
  const mistakeCount = openCount(level);
  const cards = await buildAllCards(level);
  const due = dueCount(level, cards);
  const activeStreak = streak(level);
  const answered = totalAnswered(level);

  const root = document.createElement('div');
  root.className = 'page page-home';
  root.innerHTML = `
    <section class="hero">
      <p class="hero-eyebrow">${level.toUpperCase()} · ${level === 'fce' ? 'B2 First' : 'C1 Advanced'}</p>
      <h1 class="hero-title">Reading &amp; Use of English practice</h1>
      <p class="hero-sub">${answered ? `${answered} questions answered so far. ` : ''}${activeStreak > 0 ? `${activeStreak}-day streak.` : 'Start a set to begin your streak.'}</p>
    </section>

    ${cont ? `
    <section class="card continue-card">
      <p class="card-label">Continue where you left off</p>
      <a class="continue-link" href="#/exercises/${esc(cont.part)}/${esc(cont.setId)}">
        <span class="continue-title">${esc(cont.title)}</span>
        <span class="continue-meta">${esc(cont.partLabel || '')}</span>
      </a>
    </section>` : ''}

    <section class="stat-row">
      <a class="stat-tile" href="#/flashcards">
        <span class="stat-num">${due}</span>
        <span class="stat-label">flashcards due</span>
      </a>
      <a class="stat-tile" href="#/mistakes">
        <span class="stat-num">${mistakeCount}</span>
        <span class="stat-label">open mistakes</span>
      </a>
    </section>

    <section class="quick-links">
      <h2 class="section-heading">Quick links</h2>
      <ul class="quick-link-list">
        <li><a class="quick-link" href="#/practise">${icons.practise}Exercises</a></li>
        <li><a class="quick-link" href="#/tests">${icons.clock}Practice tests</a></li>
        <li><a class="quick-link" href="#/evaluation">${icons.flag}Evaluation test</a></li>
        <li><a class="quick-link" href="#/vocab">${icons.search}Vocabulary</a></li>
        <li><a class="quick-link" href="#/flashcards">${icons.cards}Flashcards</a></li>
        <li><a class="quick-link" href="#/progress">${icons.home}Progress</a></li>
      </ul>
    </section>

    <section class="parts-overview">
      <h2 class="section-heading">${level.toUpperCase()} parts covered</h2>
      <ul class="plain-list">
        ${PARTS[level].map((p) => `<li>${esc(p.label)}</li>`).join('')}
      </ul>
    </section>

    <p class="note-box">This app covers Reading &amp; Use of English only — Listening, Writing and Speaking
      are not covered.</p>
  `;
  return root;
}
