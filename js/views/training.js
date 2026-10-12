import { esc, fmtDate } from '../dom.js';
import { PARTS } from '../data.js';
import { Timer, formatClock } from '../testEngine.js';
import { gradeQuestion, isAnswered } from '../grading.js';
import { recordAnswer } from '../progress.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { addOverride, getOverrideAnswers } from '../overrides.js';
import { tagLabel } from '../skillmap.js';
import {
  FOCUSES, LENGTHS, MIN_WEAK_POOL, buildPool, filterPool, pickItems, getSeen, recordSeen,
  timeLimitSeconds, addTrainingResult, getTrainingHistory,
} from '../training.js';

function stripVerdict(text) { return String(text || '').replace(/^\s*(correct|incorrect)\s*:\s*/i, ''); }
function partLabel(level, part) { return (PARTS[level].find((p) => p.part === part) || {}).label || part; }
function focusLabel(id) { return (FOCUSES.find((f) => f.id === id) || {}).label || id; }

export async function render(ctx) {
  const { level } = ctx;
  const pool = await buildPool(level);
  const root = document.createElement('div');
  root.className = 'page page-training';
  const prefs = { focus: 'mixed', length: 10, timed: false };

  const weakPool = filterPool(pool, 'weak', level);
  const weakOk = weakPool.length >= MIN_WEAK_POOL;

  function showSetup() {
    window.__fcecaeTeardown = null;
    const history = getTrainingHistory(level);
    root.innerHTML = `
      <h1 class="page-title">Training</h1>
      <p class="page-sub">Short drills of single questions from the Use of English exercises, ${level.toUpperCase()}.
        New and previously missed questions come up first, and every wrong answer goes into your mistakes notebook.</p>

      <section class="setup-group">
        <h2 class="section-heading">Focus</h2>
        <div class="choice-grid" role="radiogroup" aria-label="Focus">
          ${FOCUSES.map((f) => {
            const disabled = f.id === 'weak' && !weakOk;
            return `<button type="button" class="choice${prefs.focus === f.id ? ' choice-active' : ''}" role="radio"
              aria-checked="${prefs.focus === f.id}" data-focus="${f.id}"${disabled ? ' disabled' : ''}>
              <span class="choice-title">${esc(f.label)}</span>
              <span class="choice-blurb">${esc(disabled ? 'Answer a few more questions first — this needs some history.' : f.blurb)}</span>
            </button>`;
          }).join('')}
        </div>
      </section>

      <section class="setup-group">
        <h2 class="section-heading">Length</h2>
        <div class="choice-row" role="radiogroup" aria-label="Number of questions">
          ${LENGTHS.map((n) => `<button type="button" class="choice choice-short${prefs.length === n ? ' choice-active' : ''}" role="radio"
            aria-checked="${prefs.length === n}" data-length="${n}"><span class="choice-title">${n} questions</span></button>`).join('')}
        </div>
        <label class="check-row"><input type="checkbox" id="train-timed"${prefs.timed ? ' checked' : ''}>
          <span>Timed (about a minute per question, two for key word transformations)</span></label>
      </section>

      <button type="button" class="btn btn-primary" id="train-start">Start training</button>
      <p class="empty-note" id="train-msg" hidden></p>

      ${history.length ? `<section class="setup-group">
        <h2 class="section-heading">Recent drills</h2>
        <ul class="plain-list">${history.slice(0, 5).map((h) =>
          `<li>${fmtDate(h.date)} — ${esc(focusLabel(h.focus))}: ${h.correct}/${h.total} (${Math.round(h.percent)}%)</li>`).join('')}</ul>
      </section>` : ''}
    `;
    root.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => { prefs.focus = b.dataset.focus; showSetup(); }));
    root.querySelectorAll('[data-length]').forEach((b) => b.addEventListener('click', () => { prefs.length = Number(b.dataset.length); showSetup(); }));
    root.querySelector('#train-timed').addEventListener('change', (e) => { prefs.timed = e.target.checked; });
    root.querySelector('#train-start').addEventListener('click', () => {
      const msg = root.querySelector('#train-msg');
      const available = filterPool(pool, prefs.focus, level);
      if (!available.length) {
        msg.hidden = false;
        msg.textContent = 'There are no questions for this focus yet.';
        return;
      }
      const items = pickItems(available, prefs.length, getSeen(level));
      startDrill(items);
    });
  }

  function startDrill(items) {
    root.innerHTML = '';
    const answers = items.map(() => null);
    const results = items.map(() => null);
    let submitted = false;
    let timer = null;

    const bar = document.createElement('div');
    bar.className = 'timer-bar';
    const countEl = document.createElement('span');
    countEl.className = 'timer-clock';
    const clockEl = document.createElement('span');
    clockEl.className = 'timer-warn';
    bar.append(countEl, clockEl);
    root.appendChild(bar);

    const title = document.createElement('h1');
    title.className = 'page-title';
    title.textContent = `Training · ${focusLabel(prefs.focus)}`;
    root.insertBefore(title, bar);

    const summarySlot = document.createElement('div');
    root.appendChild(summarySlot);

    const cards = items.map((it, i) => buildCard(level, it, i, answers, updateCount));
    const list = document.createElement('div');
    list.className = 'train-list';
    cards.forEach((c) => list.appendChild(c.el));
    root.appendChild(list);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn-primary submit-training-btn';
    submitBtn.textContent = 'Check my answers';
    root.appendChild(submitBtn);

    function updateCount() {
      const n = answers.filter((a, i) => isAnswered(items[i].type, a)).length;
      countEl.textContent = submitted ? '' : `${n} of ${items.length} answered`;
    }
    updateCount();

    if (prefs.timed) {
      timer = new Timer(timeLimitSeconds(items), {
        onTick: (s) => { clockEl.textContent = formatClock(s); },
        onZero: () => { clockEl.textContent = "Time's up — you can keep going, but you are over the limit."; },
      });
      clockEl.textContent = formatClock(timer.seconds);
      timer.start();
      window.__fcecaeTeardown = () => timer.destroy();
    }

    submitBtn.addEventListener('click', () => {
      if (submitted) return;
      submitted = true;
      const overtime = timer ? timer.seconds < 0 : false;
      if (timer) timer.destroy();
      window.__fcecaeTeardown = null;
      submitBtn.hidden = true;
      bar.hidden = true;
      items.forEach((it, i) => {
        const r = gradeQuestion(it.set, it.q, answers[i], getOverrideAnswers(level, it.setId, it.n));
        results[i] = r;
        cards[i].lock();
        record(it, r);
        cards[i].showFeedback(r, (raw) => counted(i, raw));
      });
      const correct = results.filter((r) => r.correct).length;
      addTrainingResult(level, {
        focus: prefs.focus, correct, total: items.length, percent: (correct / items.length) * 100, overtime,
      });
      renderSummary(overtime);
      window.scrollTo(0, 0);
    });

    function record(it, r) {
      recordAnswer(level, { part: it.part, tag: it.tag, correct: r.correct });
      recordSeen(level, it.key, r.correct);
      if (r.correct) { resolveMistake(level, mistakeKey(it.setId, it.n)); return; }
      addMistake(level, {
        part: it.part, setId: it.setId, setTitle: it.setTitle, n: it.n, type: it.type, tag: it.tag,
        context: contextText(it),
        yourAnswer: userAnswerText(it, r),
        correctAnswers: correctAnswerList(it, r),
        explanation: stripVerdict(r.explanation || r.chosenWhy || (it.q.why ? it.q.why[it.q.answer] : '')),
        whys: it.q.why || null,
        source: 'training',
      });
    }

    function counted(i, raw) {
      const it = items[i];
      addOverride(level, it.setId, it.n, raw);
      results[i].correct = true;
      recordSeen(level, it.key, true);
      renderSummary(false);
    }

    function renderSummary() {
      const correct = results.filter((r) => r && r.correct).length;
      const pct = Math.round((correct / items.length) * 100);
      const byTag = {};
      results.forEach((r, i) => {
        const t = items[i].tag;
        byTag[t] = byTag[t] || { c: 0, n: 0 };
        byTag[t].n += 1;
        if (r.correct) byTag[t].c += 1;
      });
      const missed = Object.entries(byTag).filter(([, v]) => v.c < v.n).sort((a, b) => (a[1].c / a[1].n) - (b[1].c / b[1].n));
      summarySlot.innerHTML = `
        <section class="card train-summary" aria-live="polite">
          <p class="card-label">Result</p>
          <p class="train-score"><span id="train-score">${correct} / ${items.length}</span> <span class="train-pct">${pct}%</span></p>
          ${missed.length ? `<p class="train-missed">To work on: ${missed.slice(0, 4).map(([t, v]) => `${esc(tagLabel(t))} (${v.c}/${v.n})`).join(', ')}.</p>`
            : '<p class="train-missed">No mistakes in this drill.</p>'}
          <div class="exercise-actions">
            <button type="button" class="btn btn-primary" id="train-again">Train again</button>
            <button type="button" class="btn btn-secondary" id="train-change">Change focus</button>
            <a class="btn btn-ghost" href="#/mistakes">Mistakes notebook</a>
          </div>
        </section>`;
      summarySlot.querySelector('#train-again').addEventListener('click', () => {
        const available = filterPool(pool, prefs.focus, level);
        startDrill(pickItems(available, prefs.length, getSeen(level)));
        window.scrollTo(0, 0);
      });
      summarySlot.querySelector('#train-change').addEventListener('click', () => { showSetup(); window.scrollTo(0, 0); });
    }
  }

  showSetup();
  return root;
}

function contextText(it) {
  if (it.type === 'transformation') return `${it.q.first} (${it.q.keyword})`;
  return it.context;
}

function userAnswerText(it, r) {
  if (it.type === 'mcCloze') return typeof r.userAnswer === 'number' ? it.q.options[r.userAnswer] : '';
  return r.userAnswer || '';
}

function correctAnswerList(it, r) {
  if (it.type === 'mcCloze') return [r.correctText];
  return it.q.answers;
}

function buildCard(level, it, i, answers, onChange) {
  const el = document.createElement('article');
  el.className = 'card train-card';
  const q = it.q;
  let controls;
  let lockFn;

  const head = `<p class="card-label">Question ${i + 1} · ${esc(partLabel(level, it.part).replace(/^Part \d · /, ''))}</p>`;
  if (it.type === 'mcCloze') {
    el.innerHTML = `${head}<p class="train-context">${esc(it.context)}</p><div class="optgrid" role="radiogroup"></div>`;
    controls = el.querySelector('.optgrid');
    q.options.forEach((opt, oi) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'optbtn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.textContent = `${String.fromCharCode(65 + oi)}. ${opt}`;
      b.addEventListener('click', () => {
        answers[i] = oi;
        controls.querySelectorAll('.optbtn').forEach((x, xi) => {
          x.classList.toggle('optbtn-selected', xi === oi);
          x.setAttribute('aria-checked', String(xi === oi));
        });
        onChange();
      });
      controls.appendChild(b);
    });
    lockFn = () => controls.querySelectorAll('.optbtn').forEach((b) => { b.disabled = true; });
  } else if (it.type === 'transformation') {
    el.innerHTML = `${head}
      <p class="train-context">${esc(q.first)}</p>
      <p class="transform-keyword">${esc(q.keyword)}</p>
      <div class="transform-line">${q.before ? `<span>${esc(q.before)}</span>` : ''}
        <input type="text" class="gap-input transform-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer for question ${i + 1}">
        ${q.after ? `<span>${esc(q.after)}</span>` : ''}</div>`;
    controls = el.querySelector('input');
    controls.addEventListener('input', () => { answers[i] = controls.value; onChange(); });
    lockFn = () => { controls.disabled = true; };
  } else {
    const stem = it.type === 'wordFormation' ? `<p class="transform-keyword">${esc(q.stem)}</p>` : '';
    el.innerHTML = `${head}<p class="train-context">${esc(it.context)}</p>${stem}
      <input type="text" class="gap-input" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Your answer for question ${i + 1}">`;
    controls = el.querySelector('input');
    controls.addEventListener('input', () => { answers[i] = controls.value; onChange(); });
    lockFn = () => { controls.disabled = true; };
  }

  const fbSlot = document.createElement('div');
  fbSlot.className = 'fb-slot';
  el.appendChild(fbSlot);

  return {
    el,
    lock: lockFn,
    showFeedback(r, onOverride) {
      const box = document.createElement('div');
      box.className = `feedback ${r.correct ? 'feedback-correct' : 'feedback-incorrect'}`;
      box.setAttribute('role', 'status');
      box.innerHTML = `<div class="feedback-head"><span class="badge ${r.correct ? 'badge-correct' : 'badge-incorrect'}">${r.correct ? 'Correct' : 'Incorrect'}</span>
        <span class="train-tag">${esc(tagLabel(it.tag))}</span></div>`;
      const add = (html, cls) => {
        const p = document.createElement('p');
        p.className = cls || 'feedback-line';
        p.innerHTML = html;
        box.appendChild(p);
        return p;
      };
      if (it.type === 'mcCloze') {
        if (!r.correct) {
          add(`<strong>Your answer:</strong> ${r.userAnswer == null ? '(no answer)' : esc(q.options[r.userAnswer])}`);
          add(`<strong>Correct answer:</strong> ${esc(r.correctText)}`);
        }
        add(esc(stripVerdict(r.chosenWhy || q.why[q.answer])));
        const d = document.createElement('details');
        d.className = 'why-toggle';
        d.innerHTML = `<summary>Why not the others?</summary><ul>${q.options.map((o, oi) =>
          `<li><strong>${esc(o)}</strong> — ${esc(stripVerdict(q.why[oi]))}</li>`).join('')}</ul>`;
        box.appendChild(d);
      } else {
        if (!r.correct) {
          add(`<strong>Your answer:</strong> ${r.userAnswer ? esc(r.userAnswer) : '(no answer)'}`);
          add(`<strong>Correct answer${r.correctAnswers.length > 1 ? 's' : ''}:</strong> ${r.correctAnswers.map(esc).join(' / ')}`);
        }
        add(esc(stripVerdict(r.explanation)));
        if (r.commonWrongNote) add(esc(stripVerdict(r.commonWrongNote)), 'feedback-line feedback-note');
        if (!r.correct && r.userAnswer) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn btn-ghost btn-small override-btn';
          btn.textContent = 'Count my answer as correct';
          btn.addEventListener('click', () => {
            onOverride(r.userAnswer);
            btn.disabled = true;
            btn.textContent = 'Counted as correct';
            box.className = 'feedback feedback-correct';
            const badge = box.querySelector('.badge');
            badge.className = 'badge badge-correct';
            badge.textContent = 'Correct';
          });
          box.appendChild(btn);
        }
      }
      fbSlot.appendChild(box);
    },
  };
}
