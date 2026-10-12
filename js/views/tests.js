import { esc, fmtDate } from '../dom.js';
import { loadTests, findSetById, partMeta, MARKS } from '../data.js';
import { buildPaper, Timer, formatClock } from '../testEngine.js';
import { getTestState, saveTestState, clearTestState } from '../teststate.js';
import { addTestResult, getTestHistory } from '../history.js';
import { recordAnswer } from '../progress.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { gradeQuestion } from '../grading.js';

function partOfId(id) {
  const m = String(id).match(/^[a-z]+-([a-z0-9]+)-\d+$/);
  return m ? m[1] : null;
}

function gapContext(text, n) {
  for (const p of text || []) {
    if (p.includes(`{{${n}}}`)) return p.replace(`{{${n}}}`, '[ ___ ]').replace(/\{\{\d+\}\}/g, '…');
  }
  return '';
}

function contextFor(set, q) {
  if (['mcCloze', 'openCloze', 'wordFormation', 'gappedText'].includes(set.type)) return gapContext(set.text, q.n);
  if (set.type === 'transformation') return `${q.first} (${q.keyword})`;
  if (set.type === 'multipleChoice') return q.stem;
  if (set.type === 'crossText' || set.type === 'multipleMatching') return q.prompt;
  return '';
}

function correctAnswersDisplay(set, q, result) {
  if (set.type === 'mcCloze' || set.type === 'multipleChoice') return [result.correctText];
  if (set.type === 'openCloze' || set.type === 'wordFormation' || set.type === 'transformation') return q.answers;
  return [result.correctAnswer];
}

async function renderList(ctx) {
  const { level } = ctx;
  const testList = await loadTests(level);
  const history = getTestHistory(level);
  const root = document.createElement('div');
  root.className = 'page page-tests';
  root.innerHTML = `
    <h1 class="page-title">Practice tests</h1>
    <p class="page-sub">Full Reading &amp; Use of English paper, ${level === 'fce' ? '75' : '90'} minutes.</p>
    <ul class="set-list">
      ${testList.length ? testList.map((t) => {
        const last = history.find((h) => h.testId === t.id);
        return `<li>
          <a class="set-row" href="#/tests/${esc(t.id)}">
            <span class="set-row-main">
              <span class="set-title">${esc(t.title)}</span>
              <span class="set-meta">${t.minutes} min · ${t.sets.length} parts${last ? ` · last ${Math.round(last.percent)}%` : ''}</span>
            </span>
          </a>
        </li>`;
      }).join('') : '<li class="empty-note">No practice tests available yet.</li>'}
    </ul>
    ${history.length ? `<h2 class="section-heading">History</h2>
    <ul class="history-list">
      ${history.slice(0, 10).map((h) => `<li>${fmtDate(h.date)} — ${esc(h.title)}: ${h.rawScore}/${h.maxScore} (${Math.round(h.percent)}%)</li>`).join('')}
    </ul>` : ''}
  `;
  return root;
}

async function renderRunner(ctx) {
  const { level, params } = ctx;
  const testId = params[0];
  const testList = await loadTests(level);
  const test = testList.find((t) => t.id === testId);
  const root = document.createElement('div');
  root.className = 'page page-test-runner';
  if (!test) { root.innerHTML = '<p>Test not found.</p>'; return root; }

  const sets = [];
  for (const sid of test.sets) {
    const s = await findSetById(level, sid);
    if (s) sets.push(s);
  }

  const saved = getTestState(level, test.id);
  const submitted = saved && saved.submitted;

  const header = document.createElement('div');
  header.innerHTML = `
    <a class="back-link" href="#/tests">${'←'} Practice tests</a>
    <h1 class="page-title">${esc(test.title)}</h1>
  `;
  root.appendChild(header);

  if (submitted) {
    root.appendChild(renderResults(level, test, sets, saved.results));
    return root;
  }

  const timerBar = document.createElement('div');
  timerBar.className = 'timer-bar';
  const clockEl = document.createElement('span');
  clockEl.className = 'timer-clock';
  const pauseBtn = document.createElement('button');
  pauseBtn.type = 'button';
  pauseBtn.className = 'btn btn-secondary btn-small';
  const warnEl = document.createElement('span');
  warnEl.className = 'timer-warn';
  timerBar.append(clockEl, pauseBtn, warnEl);
  root.appendChild(timerBar);

  const initialAnswers = (saved && saved.answers) || {};
  const paper = buildPaper(sets, {
    mode: 'test',
    initialAnswersBySet: initialAnswers,
    partLabelFor: (set) => {
      const p = partOfId(set.id);
      const meta = p && partMeta(level, p);
      return meta ? meta.label.split('·')[0].trim() : set.title;
    },
  });
  root.appendChild(paper.root);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary submit-test-btn';
  submitBtn.textContent = 'Submit test';
  root.appendChild(submitBtn);

  const startSeconds = saved ? saved.secondsLeft : test.minutes * 60;
  const timer = new Timer(startSeconds, {
    onTick: (s) => { clockEl.textContent = formatClock(s); persist(false); },
    onWarn10: () => { warnEl.textContent = '10 minutes remaining.'; },
    onZero: () => { warnEl.textContent = "Time's up — you can continue, but you are now in overtime."; },
  });
  clockEl.textContent = formatClock(timer.seconds);
  if (timer.seconds <= 0) warnEl.textContent = "You are in overtime.";
  else if (timer.seconds <= 600) warnEl.textContent = '10 minutes remaining.';

  function persist(submittedFlag, results) {
    saveTestState(level, test.id, {
      answers: paper.getAllAnswers(),
      secondsLeft: timer.seconds,
      paused: timer.paused,
      submitted: !!submittedFlag,
      results: results || null,
    });
  }

  function setPauseLabel() { pauseBtn.textContent = timer.paused ? 'Start / resume' : 'Pause'; }
  pauseBtn.addEventListener('click', () => {
    if (timer.paused) timer.start(); else timer.pause();
    setPauseLabel();
    persist(false);
  });
  setPauseLabel();
  if (saved && !saved.paused) timer.start();

  window.__fcecaeTeardown = () => { timer.destroy(); persist(false); };

  const autosave = setInterval(() => persist(false), 4000);
  window.addEventListener('beforeunload', () => persist(false));

  submitBtn.addEventListener('click', () => {
    timer.destroy();
    clearInterval(autosave);
    window.__fcecaeTeardown = null; // already torn down; stop the stale closure re-persisting submitted:false
    const overtime = timer.seconds < 0;
    const results = gradeAndRecord(level, test, sets, paper);
    results.overtime = overtime;
    persist(true, results);
    addTestResult(level, { testId: test.id, title: test.title, rawScore: results.rawScore, maxScore: results.maxScore, percent: results.percent, byPart: results.byPart, overtime });
    ctx.navigate(`/tests/${test.id}`);
  });

  return root;
}

function gradeAndRecord(level, test, sets, paper) {
  const byPartMap = {};
  let rawScore = 0;
  let maxScore = 0;
  const perSetResults = {};
  for (const entry of paper.entries) {
    const set = entry.set;
    const part = partOfId(set.id) || set.type;
    const weight = (MARKS[level] && MARKS[level][part]) || 1;
    if (!byPartMap[part]) byPartMap[part] = { part, correct: 0, total: 0, marks: 0, maxMarks: 0 };
    const results = {};
    for (const q of set.questions) {
      const userAnswer = entry.player.getAnswers()[q.n];
      const result = gradeQuestion(set, q, userAnswer, []);
      results[q.n] = result;
      byPartMap[part].total += 1;
      byPartMap[part].maxMarks += weight;
      maxScore += weight;
      if (result.correct) {
        byPartMap[part].correct += 1;
        byPartMap[part].marks += weight;
        rawScore += weight;
        resolveMistake(level, mistakeKey(set.id, q.n));
      } else {
        addMistake(level, {
          part, setId: set.id, setTitle: set.title, n: q.n, type: set.type, tag: q.tag,
          context: contextFor(set, q),
          yourAnswer: typeof result.userAnswer === 'number' ? (q.options ? q.options[result.userAnswer] : result.userAnswer) : (result.userAnswer || ''),
          correctAnswers: correctAnswersDisplay(set, q, result),
          explanation: result.explanation || result.chosenWhy || (q.why ? q.why[q.answer] : ''),
          whys: q.why || null,
          source: 'test',
        });
      }
      recordAnswer(level, { part, tag: q.tag, correct: result.correct });
    }
    perSetResults[set.id] = results;
    entry.player.revealAll();
    entry.player.lockAll();
  }
  return {
    rawScore, maxScore, percent: maxScore ? (rawScore / maxScore) * 100 : 0,
    byPart: Object.values(byPartMap), perSetResults,
  };
}

function renderResults(level, test, sets, results) {
  const wrap = document.createElement('div');
  wrap.className = 'results-block';
  const pct = Math.round(results.percent);
  wrap.innerHTML = `
    <section class="card results-summary">
      <p class="results-score">${results.rawScore} / ${results.maxScore}</p>
      <p class="results-pct">${pct}%</p>
      ${results.overtime ? '<p class="pill pill-overtime">Finished in overtime</p>' : ''}
      <p class="band-note">≈60% is roughly the pass mark for this kind of paper, but the official Cambridge
        English Scale conversion varies by paper and administration — this is only an estimate, not a
        certified grade.</p>
      <h2 class="section-heading">By part</h2>
      <ul class="plain-list">
        ${results.byPart.map((p) => `<li>${esc(partMeta(level, p.part)?.label || p.part)}: ${p.correct}/${p.total} correct (${p.marks}/${p.maxMarks} marks)</li>`).join('')}
      </ul>
    </section>
  `;
  const retakeBtn = document.createElement('button');
  retakeBtn.type = 'button';
  retakeBtn.className = 'btn btn-secondary';
  retakeBtn.textContent = 'Retake';
  retakeBtn.addEventListener('click', () => {
    clearTestState(level, test.id);
    location.reload();
  });
  wrap.appendChild(retakeBtn);
  const reviewTitle = document.createElement('h2');
  reviewTitle.className = 'section-heading';
  reviewTitle.textContent = 'Full review';
  wrap.appendChild(reviewTitle);

  const initialAnswersBySet = {};
  for (const set of sets) {
    const saved = results.perSetResults && results.perSetResults[set.id];
    if (!saved) continue;
    const ans = {};
    for (const q of set.questions) if (saved[q.n]) ans[q.n] = saved[q.n].userAnswer;
    initialAnswersBySet[set.id] = ans;
  }
  const paper = buildPaper(sets, {
    mode: 'review',
    initialAnswersBySet,
    partLabelFor: (set, i) => `Part ${i + 1}`,
  });
  wrap.appendChild(paper.root);
  for (const entry of paper.entries) {
    entry.player.revealAll();
    entry.player.lockAll();
  }
  return wrap;
}

export async function render(ctx) {
  if (ctx.params.length === 0) return renderList(ctx);
  return renderRunner(ctx);
}
