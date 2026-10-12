// Renders every question-type player. Pure DOM, no framework.
import { esc, announce } from './dom.js';
import { gradeQuestion, isAnswered } from './grading.js';

const LETTERS = 'ABCDEFG';
let playerCounter = 0; // every createPlayer() instance gets a unique id prefix so that
// element ids (q-N, gap-N, fb-N) never collide when several players share one page
// (the practice-test / evaluation paper mounts one player per part at once).

function gapChip(pid, n, filled) {
  const span = document.createElement('button');
  span.type = 'button';
  span.className = 'gap' + (filled ? ' gap-filled' : '');
  span.dataset.n = String(n);
  span.id = `gap-${pid}-${n}`;
  span.setAttribute('aria-label', `Gap ${n}, go to question ${n}`);
  span.textContent = filled || String(n);
  return span;
}

function renderTextParas(pid, container, paragraphs, { gapKind } = {}) {
  // Replaces {{n}} with gap chips; gapKind null => plain text (multipleChoice).
  for (const para of paragraphs) {
    const p = document.createElement('p');
    p.className = 'passage-para';
    if (!gapKind) { p.textContent = para; container.appendChild(p); continue; }
    const re = /\{\{(\d+)\}\}/g;
    let last = 0; let m;
    while ((m = re.exec(para))) {
      if (m.index > last) p.appendChild(document.createTextNode(para.slice(last, m.index)));
      p.appendChild(gapChip(pid, parseInt(m[1], 10), null));
      last = m.index + m[0].length;
    }
    p.appendChild(document.createTextNode(para.slice(last)));
    container.appendChild(p);
  }
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 900);
}

// The badge already says "Correct"/"Incorrect"; content explanations often start the same
// way ("Correct: 'take part in' is..."), which reads as a duplicated word right under the
// badge. Strip a leading "Correct:"/"Incorrect:" (any case) before displaying.
function stripVerdict(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/^\s*(correct|incorrect)\s*:\s*/i, '');
}

function badge(correct) {
  const b = document.createElement('span');
  b.className = 'badge ' + (correct ? 'badge-correct' : 'badge-incorrect');
  b.textContent = correct ? 'Correct' : 'Incorrect';
  return b;
}

function detailsToggle(label, bodyHtml) {
  const d = document.createElement('details');
  d.className = 'why-toggle';
  const s = document.createElement('summary');
  s.textContent = label;
  d.appendChild(s);
  const div = document.createElement('div');
  div.className = 'why-body';
  div.innerHTML = bodyHtml;
  d.appendChild(div);
  return d;
}

/**
 * createPlayer(set, opts)
 * opts: {
 *   mode: 'practice' | 'test'         // practice = per-question Check; test = silent collect
 *   getOverrides(n) -> string[]       // extra accepted typed answers
 *   onCheck(n, result)                // fired when a question is graded in practice mode
 *   onOverride(n, rawAnswer)          // fired when user clicks "count as correct"
 *   initialAnswers: {n: value}
 *   allowOverride: boolean (default true in practice mode)
 * }
 */
export function createPlayer(set, opts = {}) {
  const mode = opts.mode || 'practice';
  const pid = `p${++playerCounter}`;
  const answers = Object.assign({}, opts.initialAnswers || {});
  const checked = {}; // n -> result (once graded/revealed)
  const root = document.createElement('div');
  root.className = 'player player-' + set.type;

  const textCol = document.createElement('div');
  textCol.className = 'player-text';
  const qCol = document.createElement('div');
  qCol.className = 'player-questions';

  const hasTextPanel = ['mcCloze', 'openCloze', 'wordFormation', 'gappedText', 'multipleChoice'].includes(set.type);
  const hasSections = ['crossText', 'multipleMatching'].includes(set.type);

  function overrideAnswers(n) { return (opts.getOverrides ? opts.getOverrides(n) : []) || []; }

  function markGapFilled(n, display) {
    const g = document.getElementById(`gap-${pid}-${n}`);
    if (g) { g.textContent = display || String(n); g.classList.toggle('gap-filled', !!display); }
  }

  // gappedText only: "letter — start of option text", for the inline gap chip.
  function gappedOptionSnippet(letter, len) {
    const o = (set.options || []).find((x) => x.id === letter);
    if (!o) return letter;
    const text = o.text.length > len ? `${o.text.slice(0, len)}…` : o.text;
    return `${letter} — ${text}`;
  }

  function feedbackBlock(n, q, result) {
    const box = document.createElement('div');
    box.className = 'feedback ' + (result.correct ? 'feedback-correct' : 'feedback-incorrect');
    box.setAttribute('role', 'status');
    const head = document.createElement('div');
    head.className = 'feedback-head';
    head.appendChild(badge(result.correct));
    box.appendChild(head);

    if (set.type === 'mcCloze' || set.type === 'multipleChoice') {
      if (!result.correct) {
        const yr = document.createElement('p');
        yr.className = 'feedback-line';
        yr.innerHTML = result.userAnswer == null
          ? '<strong>Your answer:</strong> (no answer)'
          : `<strong>Your answer:</strong> ${esc(q.options[result.userAnswer])}`;
        box.appendChild(yr);
        const cr = document.createElement('p');
        cr.className = 'feedback-line';
        cr.innerHTML = `<strong>Correct answer:</strong> ${esc(result.correctText)}`;
        box.appendChild(cr);
      }
      const why = document.createElement('p');
      why.className = 'feedback-line';
      why.innerHTML = esc(stripVerdict(result.chosenWhy || q.why[q.answer]));
      box.appendChild(why);
      const items = q.options.map((o, i) => `<li><strong>${esc(o)}</strong> — ${esc(stripVerdict(q.why[i]))}</li>`).join('');
      box.appendChild(detailsToggle('Why not the others?', `<ul>${items}</ul>`));
    } else if (set.type === 'openCloze' || set.type === 'wordFormation') {
      if (!result.correct) {
        const yr = document.createElement('p');
        yr.className = 'feedback-line';
        yr.innerHTML = `<strong>Your answer:</strong> ${result.userAnswer ? esc(result.userAnswer) : '(no answer)'}`;
        box.appendChild(yr);
        const cr = document.createElement('p');
        cr.className = 'feedback-line';
        cr.innerHTML = `<strong>Correct answer${result.correctAnswers.length > 1 ? 's' : ''}:</strong> ${result.correctAnswers.map(esc).join(' / ')}`;
        box.appendChild(cr);
      }
      const ex = document.createElement('p');
      ex.className = 'feedback-line';
      ex.textContent = stripVerdict(result.explanation);
      box.appendChild(ex);
      if (result.commonWrongNote) {
        const cw = document.createElement('p');
        cw.className = 'feedback-line feedback-note';
        cw.textContent = stripVerdict(result.commonWrongNote);
        box.appendChild(cw);
      }
      if (!result.correct && mode === 'practice' && opts.allowOverride !== false) {
        box.appendChild(overrideButton(n, result.userAnswer));
      }
    } else if (set.type === 'transformation') {
      if (!result.correct) {
        const yr = document.createElement('p');
        yr.className = 'feedback-line';
        yr.innerHTML = `<strong>Your answer:</strong> ${result.userAnswer ? esc(result.userAnswer) : '(no answer)'}`;
        box.appendChild(yr);
        const cr = document.createElement('p');
        cr.className = 'feedback-line';
        cr.innerHTML = `<strong>Correct answer${result.correctAnswers.length > 1 ? 's' : ''}:</strong> ${result.correctAnswers.map(esc).join(' / ')}`;
        box.appendChild(cr);
      }
      const ex = document.createElement('p');
      ex.className = 'feedback-line';
      ex.textContent = stripVerdict(result.explanation);
      box.appendChild(ex);
      if (!result.correct && mode === 'practice' && opts.allowOverride !== false) {
        box.appendChild(overrideButton(n, result.userAnswer));
      }
    } else if (set.type === 'gappedText' || set.type === 'crossText' || set.type === 'multipleMatching') {
      if (!result.correct) {
        const yr = document.createElement('p');
        yr.className = 'feedback-line';
        yr.innerHTML = `<strong>Your answer:</strong> ${result.userAnswer ? esc(result.userAnswer) : '(no answer)'}`;
        box.appendChild(yr);
        const cr = document.createElement('p');
        cr.className = 'feedback-line';
        cr.innerHTML = `<strong>Correct answer:</strong> ${esc(result.correctAnswer)}`;
        box.appendChild(cr);
      }
      const ex = document.createElement('p');
      ex.className = 'feedback-line';
      ex.textContent = stripVerdict(result.explanation);
      box.appendChild(ex);
    }
    return box;
  }

  function overrideButton(n, rawAnswer) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost btn-small override-btn';
    btn.textContent = 'Count my answer as correct';
    btn.addEventListener('click', () => {
      if (opts.onOverride) opts.onOverride(n, rawAnswer);
      btn.disabled = true;
      btn.textContent = 'Counted as correct';
      const q = set.questions.find((qq) => qq.n === n);
      const result = checked[n];
      if (result) { result.correct = true; revealQuestion(n, true); }
    });
    return btn;
  }

  function getUserAnswer(n) { return answers[n]; }

  function graded(n) {
    const q = set.questions.find((qq) => qq.n === n);
    return gradeQuestion(set, q, answers[n], overrideAnswers(n));
  }

  function revealQuestion(n, force) {
    const q = set.questions.find((qq) => qq.n === n);
    const result = checked[n] && !force ? checked[n] : graded(n);
    checked[n] = result;
    const fbSlot = qCol.querySelector(`#fb-${pid}-${n}`);
    if (fbSlot) { fbSlot.innerHTML = ''; fbSlot.appendChild(feedbackBlock(n, q, result)); }
    const qblock = qCol.querySelector(`#q-${pid}-${n}`);
    if (qblock) qblock.classList.toggle('qblock-checked', true);
    // reflect in text gap for cloze types
    if (set.type === 'mcCloze') markGapFilled(n, result.userAnswer != null ? q.options[result.userAnswer] : null);
    if (set.type === 'gappedText') markGapFilled(n, result.userAnswer ? gappedOptionSnippet(result.userAnswer, 20) : null);
    announce(`Question ${n}: ${result.correct ? 'correct' : 'incorrect'}`);
    if (mode === 'practice' && opts.onCheck) opts.onCheck(n, result);
    updateProgressLabel();
    return result;
  }

  function updateProgressLabel() {
    const label = root.querySelector('.player-progress');
    if (!label) return;
    const total = set.questions.length;
    const done = Object.keys(answers).filter((n) => isAnswered(set.type, answers[n])).length;
    label.textContent = `${done} / ${total} answered`;
  }

  function buildOptionRow(n, q) {
    const row = document.createElement('div');
    row.className = 'optrow';
    q.options.forEach((opt, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'optbtn';
      b.textContent = `${String.fromCharCode(65 + i)}. ${opt}`;
      b.setAttribute('aria-pressed', String(answers[n] === i));
      if (answers[n] === i) b.classList.add('optbtn-selected');
      b.addEventListener('click', () => {
        answers[n] = i;
        row.querySelectorAll('.optbtn').forEach((x, xi) => {
          x.classList.toggle('optbtn-selected', xi === i);
          x.setAttribute('aria-pressed', String(xi === i));
        });
        if (set.type === 'mcCloze') markGapFilled(n, opt);
        updateProgressLabel();
      });
      row.appendChild(b);
    });
    return row;
  }

  function buildCheckRow(n) {
    const row = document.createElement('div');
    row.className = 'qactions';
    if (mode === 'practice') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary btn-small';
      btn.textContent = 'Check';
      btn.addEventListener('click', () => revealQuestion(n, true));
      row.appendChild(btn);
    }
    if (hasTextPanel) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'btn btn-ghost btn-small jump-link';
      link.textContent = '↑ text';
      link.addEventListener('click', () => jumpTo(`gap-${pid}-${n}`));
      row.appendChild(link);
    }
    return row;
  }

  function qHead(n, extra) {
    const h = document.createElement('div');
    h.className = 'qhead';
    h.innerHTML = `<span class="qnum">Q${n}</span>${extra ? ` <span class="qextra">${extra}</span>` : ''}`;
    return h;
  }

  // ---------- per-type builders ----------
  if (set.type === 'mcCloze') {
    renderTextParas(pid, textCol, set.text, { gapKind: 'mc' });
    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n));
      block.appendChild(buildOptionRow(q.n, q));
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
      const chip = () => jumpTo(`q-${pid}-${q.n}`);
      textCol.querySelectorAll(`#gap-${pid}-${q.n}`).forEach((g) => g.addEventListener('click', chip));
    }
  } else if (set.type === 'openCloze' || set.type === 'wordFormation') {
    renderTextParas(pid, textCol, set.text, { gapKind: 'input' });
    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n, set.type === 'wordFormation' ? `<span class="stem">${esc(q.stem)}</span>` : ''));
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gap-input';
      input.autocomplete = 'off';
      input.autocapitalize = 'off';
      input.spellcheck = false;
      input.setAttribute('aria-label', `Answer for question ${q.n}`);
      input.value = answers[q.n] || '';
      input.addEventListener('input', () => {
        answers[q.n] = input.value;
        markGapFilled(q.n, input.value.trim() || null);
        updateProgressLabel();
      });
      block.appendChild(input);
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
      textCol.querySelectorAll(`#gap-${pid}-${q.n}`).forEach((g) => g.addEventListener('click', () => jumpTo(`q-${pid}-${q.n}`)));
    }
  } else if (set.type === 'transformation') {
    root.classList.add('player-no-text');
    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock qblock-transform';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n));
      const first = document.createElement('p');
      first.className = 'transform-first';
      first.textContent = q.first;
      block.appendChild(first);
      const kw = document.createElement('p');
      kw.className = 'transform-keyword';
      kw.textContent = q.keyword;
      block.appendChild(kw);
      const line = document.createElement('div');
      line.className = 'transform-line';
      const before = document.createElement('span');
      before.className = 'transform-before';
      before.textContent = q.before;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gap-input transform-input';
      input.setAttribute('aria-label', `Answer for question ${q.n}`);
      input.value = answers[q.n] || '';
      input.addEventListener('input', () => { answers[q.n] = input.value; updateProgressLabel(); });
      const after = document.createElement('span');
      after.className = 'transform-after';
      after.textContent = q.after;
      line.append(before, input, after);
      block.appendChild(line);
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
    }
  } else if (set.type === 'multipleChoice') {
    if (set.intro) {
      const introP = document.createElement('p');
      introP.className = 'passage-intro';
      introP.textContent = set.intro;
      textCol.appendChild(introP);
    }
    renderTextParas(pid, textCol, set.text, {});
    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n));
      const stem = document.createElement('p');
      stem.className = 'q-stem';
      stem.textContent = q.stem;
      block.appendChild(stem);
      block.appendChild(buildOptionRow(q.n, q));
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
    }
  } else if (set.type === 'gappedText') {
    if (set.intro) {
      const introP = document.createElement('p');
      introP.className = 'passage-intro';
      introP.textContent = set.intro;
      textCol.appendChild(introP);
    }
    renderTextParas(pid, textCol, set.text, { gapKind: 'letter' });

    // Options reference lives in the QUESTION column (never buried in the sticky/scrolling
    // text column) and is a native <details> so it can be collapsed on mobile — tapping the
    // summary opens it, same as tapping a gap/question is meant to reveal the choices.
    const optsWrap = document.createElement('details');
    optsWrap.className = 'options-ref';
    optsWrap.open = true;
    const optsSummary = document.createElement('summary');
    optsSummary.className = 'options-ref-title';
    optsSummary.textContent = `Options A–${set.options[set.options.length - 1].id}`;
    optsWrap.appendChild(optsSummary);
    const optList = document.createElement('ul');
    optList.className = 'options-list';
    for (const o of set.options) {
      const li = document.createElement('li');
      li.id = `opt-${pid}-${o.id}`;
      li.innerHTML = `<strong>${o.id}</strong> ${esc(o.text)}`;
      optList.appendChild(li);
    }
    optsWrap.appendChild(optList);
    qCol.appendChild(optsWrap);

    function refreshUsedLetters() {
      const used = new Set(set.questions.map((q) => answers[q.n]).filter(Boolean));
      for (const o of set.options) {
        const li = document.getElementById(`opt-${pid}-${o.id}`);
        if (li) li.classList.toggle('option-used', used.has(o.id));
      }
      for (const q of set.questions) {
        const blk = document.getElementById(`q-${pid}-${q.n}`);
        if (!blk) continue;
        blk.querySelectorAll('.letterbtn[data-letter]').forEach((btn) => {
          const letter = btn.dataset.letter;
          btn.classList.toggle('letterbtn-used', used.has(letter) && answers[q.n] !== letter);
        });
      }
    }

    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n));
      const row = document.createElement('div');
      row.className = 'letterrow';
      const chosen = document.createElement('p');
      chosen.className = 'gapped-chosen-text';
      for (const o of set.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'letterbtn';
        b.textContent = o.id;
        b.dataset.letter = o.id;
        b.title = o.text;
        b.setAttribute('aria-pressed', String(answers[q.n] === o.id));
        if (answers[q.n] === o.id) b.classList.add('letterbtn-selected');
        b.addEventListener('click', () => {
          answers[q.n] = o.id;
          row.querySelectorAll('.letterbtn').forEach((x) => {
            x.classList.toggle('letterbtn-selected', x.dataset.letter === o.id);
            x.setAttribute('aria-pressed', String(x.dataset.letter === o.id));
          });
          chosen.textContent = `${o.id} — ${o.text}`;
          markGapFilled(q.n, gappedOptionSnippet(o.id, 20));
          refreshUsedLetters();
          updateProgressLabel();
        });
        row.appendChild(b);
      }
      block.appendChild(row);
      if (answers[q.n]) {
        chosen.textContent = gappedOptionSnippet(answers[q.n], 200);
        markGapFilled(q.n, gappedOptionSnippet(answers[q.n], 20));
      }
      block.appendChild(chosen);
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
      textCol.querySelectorAll(`#gap-${pid}-${q.n}`).forEach((g) => g.addEventListener('click', () => jumpTo(`q-${pid}-${q.n}`)));
    }
    refreshUsedLetters();
  } else if (hasSections) {
    if (set.intro) {
      const introP = document.createElement('p');
      introP.className = 'passage-intro';
      introP.textContent = set.intro;
      textCol.appendChild(introP);
    }
    for (const sec of set.sections) {
      const secEl = document.createElement('section');
      secEl.className = 'section-block';
      secEl.id = `sec-${sec.id}`;
      const h = document.createElement('h3');
      h.className = 'section-title';
      h.innerHTML = `<span class="section-letter">${sec.id}</span> ${esc(sec.title)}`;
      secEl.appendChild(h);
      for (const p of sec.text) {
        const pEl = document.createElement('p');
        pEl.className = 'passage-para';
        pEl.textContent = p;
        secEl.appendChild(pEl);
      }
      textCol.appendChild(secEl);
    }
    const letters = set.sections.map((s) => s.id);
    for (const q of set.questions) {
      const block = document.createElement('div');
      block.className = 'qblock';
      block.id = `q-${pid}-${q.n}`;
      block.appendChild(qHead(q.n));
      const prompt = document.createElement('p');
      prompt.className = 'q-stem';
      prompt.textContent = q.prompt;
      block.appendChild(prompt);
      const row = document.createElement('div');
      row.className = 'letterrow';
      for (const L of letters) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'letterbtn';
        b.textContent = L;
        b.setAttribute('aria-pressed', String(answers[q.n] === L));
        if (answers[q.n] === L) b.classList.add('letterbtn-selected');
        b.addEventListener('click', () => {
          answers[q.n] = L;
          row.querySelectorAll('.letterbtn').forEach((x) => {
            x.classList.toggle('letterbtn-selected', x.textContent === L);
            x.setAttribute('aria-pressed', String(x.textContent === L));
          });
          updateProgressLabel();
        });
        row.appendChild(b);
      }
      block.appendChild(row);
      block.appendChild(buildCheckRow(q.n));
      const fb = document.createElement('div'); fb.id = `fb-${pid}-${q.n}`; fb.className = 'fb-slot';
      block.appendChild(fb);
      qCol.appendChild(block);
    }
  }

  if (hasTextPanel || hasSections) {
    const textWrap = document.createElement('div');
    textWrap.className = 'player-text-wrap';
    textWrap.appendChild(textCol);
    root.appendChild(textWrap);
  }
  const qWrap = document.createElement('div');
  qWrap.className = 'player-questions-wrap';
  const progress = document.createElement('p');
  progress.className = 'player-progress';
  qWrap.appendChild(progress);
  qWrap.appendChild(qCol);
  root.appendChild(qWrap);
  updateProgressLabel();

  function revealAll() {
    const results = {};
    for (const q of set.questions) {
      // Already individually checked (e.g. via its own Check button) — reuse that result
      // rather than re-grading, so "Check all" doesn't double-fire onCheck/progress/mistakes
      // for questions the learner already checked one at a time.
      results[q.n] = checked[q.n] ? checked[q.n] : revealQuestion(q.n, true);
    }
    if (set.type === 'gappedText' && set.extra) {
      let note = qCol.querySelector('.extra-note');
      if (!note) {
        note = document.createElement('p');
        note.className = 'extra-note';
        qCol.appendChild(note);
      }
      note.innerHTML = `<strong>Unused option ${esc(set.extra.id)}:</strong> ${esc(set.extra.explanation)}`;
    }
    return results;
  }

  function lockAll() {
    root.querySelectorAll('input, select, button.optbtn, button.letterbtn').forEach((n) => { n.disabled = true; });
    root.querySelectorAll('.qactions .btn-primary').forEach((n) => { n.disabled = true; });
  }

  return {
    root,
    getAnswers: () => Object.assign({}, answers),
    setAnswers: (a) => { Object.assign(answers, a); },
    revealQuestion,
    revealAll,
    lockAll,
    focusQuestion: (n) => jumpTo(`q-${n}`),
    questionCount: set.questions.length,
    answeredCount: () => set.questions.filter((q) => isAnswered(set.type, answers[q.n])).length,
  };
}
