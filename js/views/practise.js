import { esc } from '../dom.js';
import { PARTS } from '../data.js';
import { icons } from '../icons.js';

export async function render(ctx) {
  const { level } = ctx;
  const root = document.createElement('div');
  root.className = 'page page-practise';
  root.innerHTML = `
    <h1 class="page-title">Practise</h1>
    <p class="page-sub">Reading &amp; Use of English, ${level.toUpperCase()}.</p>

    <section>
      <h2 class="section-heading">By part</h2>
      <ul class="part-list">
        ${PARTS[level].map((p) => `
          <li>
            <a class="part-row" href="#/exercises/${p.part}">
              <span class="part-row-main">
                <span class="part-label">${esc(p.label)}</span>
                <span class="part-blurb">${esc(p.blurb)}</span>
              </span>
              <span class="part-row-chevron">${icons.chevronRight}</span>
            </a>
          </li>`).join('')}
      </ul>
    </section>

    <section>
      <h2 class="section-heading">More practice</h2>
      <ul class="part-list">
        <li><a class="part-row" href="#/training">
          <span class="part-row-main"><span class="part-label">${icons.practise} Training</span>
            <span class="part-blurb">Short drills of single questions: grammar, vocabulary, word formation or your weak areas.</span></span>
          <span class="part-row-chevron">${icons.chevronRight}</span>
        </a></li>
        <li><a class="part-row" href="#/level">
          <span class="part-row-main"><span class="part-label">${icons.flag} Level estimate</span>
            <span class="part-blurb">An adaptive check from B1 to C2 that estimates where you are.</span></span>
          <span class="part-row-chevron">${icons.chevronRight}</span>
        </a></li>
        <li><a class="part-row" href="#/tests">
          <span class="part-row-main"><span class="part-label">${icons.clock} Full practice tests</span>
            <span class="part-blurb">A complete, timed Reading &amp; Use of English paper.</span></span>
          <span class="part-row-chevron">${icons.chevronRight}</span>
        </a></li>
        <li><a class="part-row" href="#/evaluation">
          <span class="part-row-main"><span class="part-label">${icons.flag} Evaluation test</span>
            <span class="part-blurb">A short mixed check with a level estimate.</span></span>
          <span class="part-row-chevron">${icons.chevronRight}</span>
        </a></li>
        <li><a class="part-row" href="#/vocab">
          <span class="part-row-main"><span class="part-label">${icons.search} Vocabulary &amp; quiz</span>
            <span class="part-blurb">Browse by topic, or test yourself.</span></span>
          <span class="part-row-chevron">${icons.chevronRight}</span>
        </a></li>
      </ul>
    </section>
  `;
  return root;
}
