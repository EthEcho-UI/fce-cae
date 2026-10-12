import { esc, fmtDate } from '../dom.js';
import { loadEvaluation } from '../data.js';
import { buildPaper, Timer, formatClock } from '../testEngine.js';
import { getTestState, saveTestState, clearTestState } from '../teststate.js';
import { addEvalResult, getEvalHistory } from '../history.js';
import { recordAnswer } from '../progress.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { gradeQuestion } from '../grading.js';
import { skillGroup, tagLabel } from '../skillmap.js';
import { partForType } from '../data.js';

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

function levelStatement(level, pct) {
  const name = level === 'fce' ? 'B2 First' : 'C1 Advanced';
  let line;
  if (pct >= 85) line = `comfortably above ${name} level on this evidence`;
  else if (pct >= 70) line = `around ${name} level`;
  else if (pct >= 50) line = `approaching ${name} level, with some gaps`;
  else line = `below ${name} level on this evidence — more foundational work would help`;
  return `Estimate only: this short check suggests you are ${line}. It is not an official Cambridge grading.`;
}

export async function render(ctx) {
  const { level } = ctx;
  const evalData = await loadEvaluation(level);
  const root = document.createElement('div');
  root.className = 'page page-evaluation';
  root.innerHTML = `<h1 class="page-title">Evaluation test</h1><p class="page-sub">${esc(evalData.title || 'Level check')} · ${evalData.minutes || 30} min.</p>`;

  const history = getEvalHistory(level);
  if (!evalData.sets || !evalData.sets.length) {
    const p = document.createElement('p');
    p.className = 'empty-note';
    p.textContent = 'The evaluation test is not available yet.';
    root.appendChild(p);
    return root;
  }

  const saved = getTestState(level, evalData.id);
  if (saved && saved.submitted) {
    root.appendChild(renderResults(level, evalData, saved.results, history));
    return root;
  }

  if (history.length) {
    const hist = document.createElement('div');
    hist.className = 'card';
    hist.innerHTML = `<p class="card-label">Previous attempts</p><ul class="plain-list">
      ${history.slice(0, 5).map((h) => `<li>${fmtDate(h.date)} — ${Math.round(h.percent)}%</li>`).join('')}
    </ul>`;
    root.appendChild(hist);
  }

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = history.length ? 'Retake evaluation test' : 'Start evaluation test';
  root.appendChild(startBtn);

  const runnerSlot = document.createElement('div');
  root.appendChild(runnerSlot);

  function startRunner() {
    startBtn.hidden = true;
    runnerSlot.appendChild(buildRunner(level, evalData, saved, ctx));
  }
  if (saved && !saved.submitted) startRunner();
  else startBtn.addEventListener('click', startRunner);

  return root;
}

function buildRunner(level, evalData, saved, ctx) {
  const wrap = document.createElement('div');
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
  wrap.appendChild(timerBar);

  const initialAnswers = (saved && saved.answers) || {};
  const sets = evalData.sets;
  const paper = buildPaper(sets, { mode: 'test', initialAnswersBySet: initialAnswers });
  wrap.appendChild(paper.root);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-primary submit-test-btn';
  submitBtn.textContent = 'Submit evaluation';
  wrap.appendChild(submitBtn);

  const startSeconds = saved ? saved.secondsLeft : (evalData.minutes || 30) * 60;
  const timer = new Timer(startSeconds, {
    onTick: (s) => { clockEl.textContent = formatClock(s); persist(); },
    onWarn10: () => { warnEl.textContent = '10 minutes remaining.'; },
    onZero: () => { warnEl.textContent = "Time's up — you can continue, but you are now in overtime."; },
  });
  clockEl.textContent = formatClock(timer.seconds);
  if (timer.seconds <= 0) warnEl.textContent = 'You are in overtime.';
  else if (timer.seconds <= 600) warnEl.textContent = '10 minutes remaining.';

  function persist(submittedFlag, results) {
    saveTestState(level, evalData.id, {
      answers: paper.getAllAnswers(), secondsLeft: timer.seconds, paused: timer.paused,
      submitted: !!submittedFlag, results: results || null,
    });
  }
  function setPauseLabel() { pauseBtn.textContent = timer.paused ? 'Start / resume' : 'Pause'; }
  pauseBtn.addEventListener('click', () => { if (timer.paused) timer.start(); else timer.pause(); setPauseLabel(); persist(); });
  setPauseLabel();
  if (saved && !saved.paused) timer.start();

  window.__fcecaeTeardown = () => { timer.destroy(); persist(); };
  const autosave = setInterval(() => persist(), 4000);

  submitBtn.addEventListener('click', () => {
    timer.destroy();
    clearInterval(autosave);
    window.__fcecaeTeardown = null; // already torn down; stop the stale closure re-persisting submitted:false
    const overtime = timer.seconds < 0;
    const results = gradeAndRecord(level, sets, paper);
    results.overtime = overtime;
    persist(true, results);
    addEvalResult(level, {
      id: evalData.id, score: results.correct, total: results.total, percent: results.percent,
      bySkill: results.bySkill, weakTags: results.weakTags,
    });
    ctx.navigate('/evaluation');
  });

  return wrap;
}

function gradeAndRecord(level, sets, paper) {
  const bySkill = {}; // tag -> {correct,total}
  let correct = 0; let total = 0;
  const perSetResults = {};
  for (const entry of paper.entries) {
    const set = entry.set;
    const results = {};
    for (const q of set.questions) {
      const userAnswer = entry.player.getAnswers()[q.n];
      const result = gradeQuestion(set, q, userAnswer, []);
      results[q.n] = result;
      total += 1;
      if (!bySkill[q.tag]) bySkill[q.tag] = { correct: 0, total: 0 };
      bySkill[q.tag].total += 1;
      if (result.correct) {
        correct += 1;
        bySkill[q.tag].correct += 1;
        resolveMistake(level, mistakeKey(set.id, q.n));
      } else {
        addMistake(level, {
          part: 'eval', setId: set.id, setTitle: set.title, n: q.n, type: set.type, tag: q.tag,
          context: contextFor(set, q),
          yourAnswer: typeof result.userAnswer === 'number' ? (q.options ? q.options[result.userAnswer] : result.userAnswer) : (result.userAnswer || ''),
          correctAnswers: correctAnswersDisplay(set, q, result),
          explanation: result.explanation || result.chosenWhy || (q.why ? q.why[q.answer] : ''),
          whys: q.why || null,
          source: 'evaluation',
        });
      }
      recordAnswer(level, { part: 'eval', tag: q.tag, correct: result.correct });
    }
    perSetResults[set.id] = results;
    entry.player.revealAll();
    entry.player.lockAll();
  }
  const weakTags = Object.entries(bySkill)
    .map(([tag, v]) => ({ tag, acc: v.correct / v.total, total: v.total }))
    .filter((t) => t.total >= 1 && t.acc < 0.6)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 6)
    .map((t) => t.tag);
  return { correct, total, percent: total ? (correct / total) * 100 : 0, bySkill, weakTags, perSetResults };
}

function tagToPart(level, tag) {
  if (tag.startsWith('word-formation')) return partForType(level, 'wordFormation');
  if (['collocation', 'phrasal-verb', 'idiom', 'fixed-phrase', 'preposition', 'linking', 'verb-pattern', 'meaning-in-context'].includes(tag)) {
    return partForType(level, 'mcCloze');
  }
  if (['tense', 'modal', 'passive', 'conditional', 'reported-speech', 'relative-clause', 'article-determiner', 'comparison', 'quantifier', 'pronoun-reference'].includes(tag)) {
    return partForType(level, 'openCloze');
  }
  return partForType(level, 'multipleChoice');
}

function renderResults(level, evalData, results, history) {
  const wrap = document.createElement('div');
  const pct = Math.round(results.percent);
  const groups = { Grammar: { correct: 0, total: 0 }, Vocabulary: { correct: 0, total: 0 }, Reading: { correct: 0, total: 0 } };
  for (const [tag, v] of Object.entries(results.bySkill)) {
    const g = skillGroup(tag);
    groups[g].correct += v.correct;
    groups[g].total += v.total;
  }
  wrap.innerHTML = `
    <section class="card results-summary">
      <p class="results-score">${results.correct} / ${results.total}</p>
      <p class="results-pct">${pct}%</p>
      ${results.overtime ? '<p class="pill pill-overtime">Finished in overtime</p>' : ''}
      <h2 class="section-heading">Per-skill breakdown</h2>
      <ul class="plain-list">
        ${Object.entries(groups).filter(([, v]) => v.total).map(([g, v]) => `<li>${g}: ${v.correct}/${v.total} (${Math.round((v.correct / v.total) * 100)}%)</li>`).join('')}
      </ul>
      <h2 class="section-heading">Weakest areas</h2>
      ${results.weakTags.length ? `<ul class="plain-list">
        ${results.weakTags.map((tag) => {
          const part = tagToPart(level, tag);
          return `<li>${esc(tagLabel(tag))}${part ? ` — <a href="#/exercises/${part.part}">practise ${esc(part.label)}</a>` : ''}</li>`;
        }).join('')}
      </ul>` : '<p>No clear weak areas from this attempt.</p>'}
      <p class="band-note">${levelStatement(level, pct)}</p>
    </section>
    <button type="button" id="retake-btn" class="btn btn-secondary">Retake</button>
  `;
  wrap.querySelector('#retake-btn').addEventListener('click', () => {
    clearTestState(level, evalData.id);
    location.reload();
  });
  return wrap;
}
