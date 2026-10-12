import { esc } from '../dom.js';
import { loadVocab } from '../data.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { recordAnswer } from '../progress.js';
import { basicNormalize } from '../normalize.js';

const QUIZ_LENGTH = 10;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function blankExample(word, example) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped.split(' ').join('\\s+')}\\w*`, 'i');
  return example.replace(re, '_____');
}

function buildQuestions(words) {
  const pool = shuffle(words).slice(0, QUIZ_LENGTH);
  return pool.map((w, i) => {
    const kind = i % 2 === 0 ? 'choose' : 'gapfill';
    if (kind === 'choose') {
      const distractors = shuffle(words.filter((x) => x.id !== w.id)).slice(0, 3);
      const options = shuffle([w, ...distractors]);
      return { kind, word: w, options };
    }
    return { kind, word: w };
  });
}

export async function render(ctx) {
  const { level } = ctx;
  const words = await loadVocab(level);
  const root = document.createElement('div');
  root.className = 'page page-vocab-quiz';
  if (words.length < 4) {
    root.innerHTML = '<h1 class="page-title">Vocabulary quiz</h1><p class="empty-note">Not enough vocabulary yet to run a quiz.</p>';
    return root;
  }
  const questions = buildQuestions(words);
  let idx = 0;
  let correctCount = 0;

  const header = document.createElement('div');
  header.innerHTML = '<h1 class="page-title">Vocabulary quiz</h1>';
  root.appendChild(header);
  const progress = document.createElement('p');
  progress.className = 'player-progress';
  root.appendChild(progress);
  const slot = document.createElement('div');
  root.appendChild(slot);

  function renderQuestion() {
    if (idx >= questions.length) {
      slot.innerHTML = '';
      const summary = document.createElement('div');
      summary.className = 'card results-summary';
      summary.innerHTML = `<p class="results-score">${correctCount} / ${questions.length}</p>
        <p class="results-pct">${Math.round((correctCount / questions.length) * 100)}%</p>`;
      const retake = document.createElement('button');
      retake.type = 'button';
      retake.className = 'btn btn-secondary';
      retake.textContent = 'New quiz';
      retake.addEventListener('click', () => ctx.navigate('/vocab-quiz'));
      slot.appendChild(summary);
      slot.appendChild(retake);
      progress.textContent = 'Finished';
      return;
    }
    progress.textContent = `Question ${idx + 1} / ${questions.length}`;
    const q = questions[idx];
    slot.innerHTML = '';
    const block = document.createElement('div');
    block.className = 'qblock';
    let getAnswer;
    if (q.kind === 'choose') {
      block.innerHTML = `<p class="q-stem">Which word matches this definition?</p><p class="mistake-explanation">${esc(q.word.definition)}</p>`;
      const row = document.createElement('div');
      row.className = 'optrow';
      let chosen = null;
      q.options.forEach((opt) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'optbtn';
        b.textContent = opt.word;
        b.addEventListener('click', () => {
          chosen = opt;
          row.querySelectorAll('.optbtn').forEach((x) => x.classList.toggle('optbtn-selected', x === b));
        });
        row.appendChild(b);
      });
      block.appendChild(row);
      getAnswer = () => chosen;
    } else {
      block.innerHTML = `<p class="q-stem">Fill the gap with the missing word.</p><p class="passage-para">${esc(blankExample(q.word.word, q.word.example))}</p>`;
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gap-input';
      input.setAttribute('aria-label', 'Your answer');
      block.appendChild(input);
      getAnswer = () => input.value;
    }
    const checkBtn = document.createElement('button');
    checkBtn.type = 'button';
    checkBtn.className = 'btn btn-primary btn-small';
    checkBtn.textContent = 'Check';
    const fb = document.createElement('div');
    fb.className = 'fb-slot';
    block.appendChild(checkBtn);
    block.appendChild(fb);
    slot.appendChild(block);

    checkBtn.addEventListener('click', () => {
      const ans = getAnswer();
      const correct = q.kind === 'choose'
        ? (ans && ans.id === q.word.id)
        : (ans && basicNormalize(ans) === basicNormalize(q.word.word));
      checkBtn.disabled = true;
      if (q.kind !== 'choose') { /* input stays, just disable check */ }
      recordAnswer(level, { part: 'vocab', tag: 'meaning-in-context', correct });
      const mKey = mistakeKey(`vocab-${q.kind}`, q.word.id);
      if (correct) {
        correctCount += 1;
        resolveMistake(level, mKey);
        fb.innerHTML = `<p class="feedback-line feedback-correct-text">Correct.</p>`;
      } else {
        addMistake(level, {
          part: 'vocab', setId: `vocab-${q.kind}`, setTitle: 'Vocabulary quiz', n: q.word.id, type: 'vocab', tag: 'meaning-in-context',
          context: q.kind === 'choose' ? q.word.definition : blankExample(q.word.word, q.word.example),
          yourAnswer: q.kind === 'choose' ? (ans ? ans.word : '') : (ans || ''),
          correctAnswers: [q.word.word], explanation: q.word.definition, whys: null, source: 'vocab',
        });
        fb.innerHTML = `<p class="feedback-line feedback-incorrect-text">Incorrect — the word is <strong>${esc(q.word.word)}</strong>.</p>`;
      }
      const nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'btn btn-secondary btn-small';
      nextBtn.textContent = idx + 1 < questions.length ? 'Next' : 'See results';
      nextBtn.addEventListener('click', () => { idx += 1; renderQuestion(); });
      fb.appendChild(nextBtn);
    });
  }

  renderQuestion();
  return root;
}
