import { esc, fmtDate } from '../dom.js';
import { accuracyByPart, accuracyBySkill, totalAnswered, streak } from '../progress.js';
import { getTestHistory, getEvalHistory } from '../history.js';
import { partMeta } from '../data.js';
import { tagLabel } from '../skillmap.js';

function bar(correct, total) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return `<div class="bar-row">
    <div class="bar-track"><div class="bar-fill" data-pct="${pct}"></div></div>
    <span class="bar-label">${correct}/${total} (${pct}%)</span>
  </div>`;
}

function applyBarWidths(root) {
  root.querySelectorAll('.bar-fill[data-pct]').forEach((el) => {
    el.style.width = `${el.dataset.pct}%`;
  });
}

export async function render(ctx) {
  const { level } = ctx;
  const byPart = accuracyByPart(level);
  const bySkill = accuracyBySkill(level);
  const testHist = getTestHistory(level);
  const evalHist = getEvalHistory(level);

  const root = document.createElement('div');
  root.className = 'page page-progress';
  root.innerHTML = `
    <h1 class="page-title">Progress</h1>
    <section class="stat-row">
      <div class="stat-tile"><span class="stat-num">${totalAnswered(level)}</span><span class="stat-label">questions answered</span></div>
      <div class="stat-tile"><span class="stat-num">${streak(level)}</span><span class="stat-label">day streak</span></div>
    </section>

    <h2 class="section-heading">Accuracy by part</h2>
    ${Object.keys(byPart).length ? Object.entries(byPart).map(([part, v]) => {
      const meta = partMeta(level, part);
      return `<p class="bar-title">${esc(meta ? meta.label : part)}</p>${bar(v.correct, v.answered)}`;
    }).join('') : '<p class="empty-note">Answer some questions to see your accuracy.</p>'}

    <h2 class="section-heading">Accuracy by skill</h2>
    ${Object.keys(bySkill).length ? Object.entries(bySkill).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total)
      .map(([tag, v]) => `<p class="bar-title">${esc(tagLabel(tag))}</p>${bar(v.correct, v.total)}`).join('')
      : '<p class="empty-note">No skill data yet.</p>'}

    <h2 class="section-heading">Practice test history</h2>
    ${testHist.length ? `<ul class="history-list">${testHist.map((h) => `<li>${fmtDate(h.date)} — ${esc(h.title)}: ${h.rawScore}/${h.maxScore} (${Math.round(h.percent)}%)${h.overtime ? ' · overtime' : ''}</li>`).join('')}</ul>` : '<p class="empty-note">No practice tests taken yet.</p>'}

    <h2 class="section-heading">Evaluation history</h2>
    ${evalHist.length ? `<ul class="history-list">${evalHist.map((h) => `<li>${fmtDate(h.date)} — ${h.score}/${h.total} (${Math.round(h.percent)}%)</li>`).join('')}</ul>` : '<p class="empty-note">No evaluation attempts yet.</p>'}
  `;
  applyBarWidths(root);
  return root;
}
