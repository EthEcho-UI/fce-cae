import { esc, fmtDate } from '../dom.js';
import { getSettings, setLevel } from '../settings.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { tagLabel } from '../skillmap.js';
import {
  BLOCK_SIZE, SCALE, loadPlacement, nextLevel, estimate, recommendation, drawBlock,
  getState, saveState, clearState, addPlacementResult, getPlacementHistory,
} from '../placement.js';

function stripVerdict(text) { return String(text || '').replace(/^\s*(correct|incorrect)\s*:\s*/i, ''); }
function gapped(stem) { return esc(stem).replace('___', '<span class="gap-blank">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>'); }
const NOT_SURE = -1;

export async function render(ctx) {
  const bank = await loadPlacement();
  const byId = Object.fromEntries(bank.items.map((it) => [it.id, it]));
  const root = document.createElement('div');
  root.className = 'page page-level';

  if (!bank.items.length) {
    root.innerHTML = '<h1 class="page-title">Level estimate</h1><p class="empty-note">The level estimate is not available yet.</p>';
    return root;
  }

  function blockScore(block) {
    const correct = block.answers.filter((a, i) => a === byId[block.ids[i]].answer).length;
    return { cefr: block.cefr, correct, total: block.ids.length };
  }
  const isDone = (b) => b.answers.length >= b.ids.length;

  function showIntro() {
    const history = getPlacementHistory();
    root.innerHTML = `
      <h1 class="page-title">Level estimate</h1>
      <p class="page-sub">Find out roughly where your English is, from B1 to C2. About 10 minutes.</p>
      <section class="card">
        <p class="card-label">How it works</p>
        <ul class="plain-list">
          <li>You answer ${BLOCK_SIZE} questions at a time: sentences with one gap, four options each.</li>
          <li>Do well and the next block gets harder. Struggle and it gets easier. It stops by itself, after 16 to 24 questions.</li>
          <li>If you really do not know, choose &ldquo;I don&rsquo;t know&rdquo; rather than guessing. It gives a more honest result.</li>
          <li>This checks grammar and vocabulary only. It does not test reading speed, listening, writing or speaking, so treat the result as an estimate, not a Cambridge grade.</li>
        </ul>
      </section>
      <button type="button" class="btn btn-primary" id="lvl-start">Start level estimate</button>
      ${history.length ? `<section class="setup-group"><h2 class="section-heading">Previous results</h2>
        <ul class="plain-list">${history.slice(0, 5).map((h) => `<li>${fmtDate(h.date)} — ${esc(h.level)}${h.close ? ` (close to ${esc(h.close)})` : ''}</li>`).join('')}</ul></section>` : ''}
    `;
    root.querySelector('#lvl-start').addEventListener('click', () => {
      const state = { blocks: [{ cefr: 'B2', ids: drawBlock(bank.items, 'B2'), answers: [] }], finished: false };
      saveState(state);
      showQuestion(state);
    });
  }

  function showQuestion(state) {
    const block = state.blocks[state.blocks.length - 1];
    const idx = block.answers.length;
    const item = byId[block.ids[idx]];
    const stage = state.blocks.length;
    root.innerHTML = `
      <h1 class="page-title">Level estimate</h1>
      <p class="page-sub" id="lvl-progress">Stage ${stage} · question ${idx + 1} of ${block.ids.length}</p>
      <progress class="lvl-progress" max="${block.ids.length}" value="${idx}" aria-label="Progress in this stage"></progress>
      <section class="card lvl-card">
        <p class="train-context">${gapped(item.stem)}</p>
        <div class="optrow" role="group" aria-label="Options"></div>
        <button type="button" class="btn btn-ghost btn-small" id="lvl-unsure">I don&rsquo;t know</button>
      </section>
    `;
    const row = root.querySelector('.optrow');
    item.options.forEach((opt, oi) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'optbtn';
      b.textContent = `${String.fromCharCode(65 + oi)}. ${opt}`;
      b.addEventListener('click', () => answer(state, oi));
      row.appendChild(b);
    });
    root.querySelector('#lvl-unsure').addEventListener('click', () => answer(state, NOT_SURE));
  }

  function answer(state, a) {
    const block = state.blocks[state.blocks.length - 1];
    block.answers.push(a);
    if (isDone(block)) {
      const finished = state.blocks.filter(isDone).map(blockScore);
      const nl = nextLevel(finished);
      if (nl) {
        const used = state.blocks.flatMap((b) => b.ids);
        state.blocks.push({ cefr: nl, ids: drawBlock(bank.items, nl, used), answers: [] });
      } else {
        finish(state);
        return;
      }
    }
    saveState(state);
    showQuestion(state);
  }

  function finish(state) {
    const scores = state.blocks.map(blockScore);
    const est = estimate(scores);
    state.finished = true;
    state.result = { scores, level: est.level, close: est.close };
    if (!state.recorded) {
      state.recorded = true;
      recordMistakes(state);
      addPlacementResult({ level: est.level, close: est.close, scores });
    }
    saveState(state);
    showResult(state);
  }

  function recordMistakes(state) {
    const level = getSettings().level;
    for (const block of state.blocks) {
      block.ids.forEach((id, i) => {
        const it = byId[id];
        const a = block.answers[i];
        const key = mistakeKey('placement', it.n);
        if (a === it.answer) { resolveMistake(level, key); return; }
        addMistake(level, {
          part: 'level', setId: 'placement', setTitle: 'Level estimate', n: it.n, type: 'multipleChoice', tag: it.tag,
          context: it.stem.replace('___', '_____'),
          yourAnswer: a === NOT_SURE ? '' : it.options[a],
          correctAnswers: [it.options[it.answer]],
          explanation: stripVerdict(it.why[it.answer]),
          whys: it.why, source: 'level-estimate',
        });
      });
    }
  }

  function showResult(state) {
    const { scores, level, close } = state.result;
    const rec = recommendation(level);
    const range = SCALE[level];
    const all = state.blocks.flatMap((b) => b.ids.map((id, i) => ({ it: byId[id], a: b.answers[i], cefr: b.cefr })));
    const skill = (s) => {
      const part = all.filter((x) => x.it.skill === s);
      return `${part.filter((x) => x.a === x.it.answer).length}/${part.length}`;
    };
    const unsure = all.filter((x) => x.a === NOT_SURE).length;
    const sorted = all.slice().sort((x, y) => Number(x.a === x.it.answer) - Number(y.a === y.it.answer));

    root.innerHTML = `
      <h1 class="page-title">Level estimate</h1>
      <section class="card lvl-result" aria-live="polite">
        <p class="card-label">Your estimated level</p>
        <p class="lvl-big" id="lvl-level">${esc(level)}</p>
        <p class="lvl-line">${range ? `On the Cambridge English Scale that is about ${range[0]}–${range[1]}.` : 'That is below the Cambridge English Scale range for B1 (140 and above).'}
          ${close ? `You were one question short of ${esc(close)}, so you are close.` : ''}</p>
        <p class="lvl-line">${esc(rec.text)}</p>
        <p class="note-box lvl-note">Estimate only. It covers grammar and vocabulary in short sentences, and a few questions can shift the result by a level. It is not an official Cambridge grade.</p>
      </section>

      <section class="setup-group">
        <h2 class="section-heading">Stage by stage</h2>
        <ul class="plain-list lvl-stages">${scores.map((s) =>
          `<li><strong>${esc(s.cefr)}</strong>: ${s.correct}/${s.total} ${s.correct >= 6 ? '(passed)' : '(not passed)'}</li>`).join('')}</ul>
        <p class="lvl-line">Grammar ${skill('grammar')} · Vocabulary ${skill('vocabulary')}${unsure ? ` · ${unsure} marked &ldquo;I don&rsquo;t know&rdquo;` : ''}.
          Missed questions are saved in your mistakes notebook with explanations.</p>
      </section>

      <div class="exercise-actions">
        <button type="button" class="btn btn-primary" id="lvl-go">Start ${rec.exam.toUpperCase()} practice</button>
        <a class="btn btn-secondary" href="#/training">Train my weak areas</a>
        <button type="button" class="btn btn-ghost" id="lvl-retake">Retake</button>
      </div>

      <section class="setup-group">
        <h2 class="section-heading">Review</h2>
        <div class="lvl-review">${sorted.map((x) => {
          const ok = x.a === x.it.answer;
          return `<details class="card lvl-item"${ok ? '' : ' open'}>
            <summary><span class="badge ${ok ? 'badge-correct' : 'badge-incorrect'}">${ok ? 'Correct' : 'Incorrect'}</span>
              <span class="lvl-sum-text">${esc(x.it.stem.replace('___', '_____'))}</span></summary>
            <p class="feedback-line"><strong>Your answer:</strong> ${x.a === NOT_SURE ? "I don't know" : esc(x.it.options[x.a])}</p>
            ${ok ? '' : `<p class="feedback-line"><strong>Correct answer:</strong> ${esc(x.it.options[x.it.answer])}</p>`}
            <p class="feedback-line">${esc(stripVerdict(x.it.why[ok ? x.it.answer : (x.a === NOT_SURE ? x.it.answer : x.a)]))}</p>
            ${ok ? '' : `<details class="why-toggle"><summary>All four options</summary><ul>${x.it.options.map((o, oi) =>
              `<li><strong>${esc(o)}</strong> — ${esc(stripVerdict(x.it.why[oi]))}</li>`).join('')}</ul></details>`}
            <p class="feedback-line feedback-note">${esc(tagLabel(x.it.tag))} · ${esc(x.cefr)}</p>
          </details>`;
        }).join('')}</div>
      </section>
    `;
    root.querySelector('#lvl-go').addEventListener('click', () => { setLevel(rec.exam); location.hash = '#/practise'; location.reload(); });
    root.querySelector('#lvl-retake').addEventListener('click', () => { clearState(); showIntro(); window.scrollTo(0, 0); });
  }

  const saved = getState();
  if (saved && saved.finished && saved.result) showResult(saved);
  else if (saved && saved.blocks && saved.blocks.length && saved.blocks.every((b) => b.ids.every((id) => byId[id]))) showQuestion(saved);
  else showIntro();
  return root;
}
