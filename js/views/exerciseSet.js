import { esc } from '../dom.js';
import { setsForPart, partMeta } from '../data.js';
import { createPlayer } from '../players.js';
import { recordAnswer, recordSetResult } from '../progress.js';
import { addMistake, resolveMistake, mistakeKey } from '../mistakes.js';
import { addOverride, getOverrideAnswers } from '../overrides.js';
import { setContinue } from '../settings.js';

function gapContext(text, n) {
  for (const p of text || []) {
    if (p.includes(`{{${n}}}`)) {
      return p.replace(`{{${n}}}`, '[ ___ ]').replace(/\{\{\d+\}\}/g, '…');
    }
  }
  return '';
}

function contextFor(set, q) {
  if (set.type === 'mcCloze' || set.type === 'openCloze' || set.type === 'wordFormation' || set.type === 'gappedText') {
    return gapContext(set.text, q.n);
  }
  if (set.type === 'transformation') return `${q.first} (${q.keyword})`;
  if (set.type === 'multipleChoice') return q.stem;
  if (set.type === 'crossText' || set.type === 'multipleMatching') return q.prompt;
  return '';
}

function correctAnswersDisplay(set, q, result) {
  if (set.type === 'mcCloze' || set.type === 'multipleChoice') return [result.correctText];
  if (set.type === 'openCloze' || set.type === 'wordFormation' || set.type === 'transformation') return q.answers;
  if (set.type === 'gappedText' || set.type === 'crossText' || set.type === 'multipleMatching') return [result.correctAnswer];
  return [];
}

export async function render(ctx) {
  const { level, params } = ctx;
  const [part, setId] = params;
  const meta = partMeta(level, part);
  const sets = await setsForPart(level, part);
  const set = sets.find((s) => s.id === setId);

  const root = document.createElement('div');
  root.className = 'page page-exercise-set';
  if (!set) {
    root.innerHTML = '<p>Set not found.</p>';
    return root;
  }

  setContinue(level, { part, setId, title: set.title, partLabel: meta ? meta.label : part });

  const header = document.createElement('div');
  header.innerHTML = `
    <a class="back-link" href="#/exercises/${part}">${'←'} ${meta ? esc(meta.label) : esc(part)}</a>
    <p class="part-eyebrow">${meta ? esc(meta.label.toUpperCase()) : ''}</p>
    <h1 class="page-title">${esc(set.title)}</h1>
    <p class="page-sub">${esc(set.topic || '')}${set.imported ? ' · <span class="pill pill-imported">Imported</span>' : ''}</p>
  `;
  root.appendChild(header);

  const player = createPlayer(set, {
    mode: 'practice',
    getOverrides: (n) => getOverrideAnswers(level, set.id, n),
    onOverride: (n, rawAnswer) => addOverride(level, set.id, n, rawAnswer),
    onCheck: (n, result) => {
      const q = set.questions.find((qq) => qq.n === n);
      recordAnswer(level, { part, tag: q.tag, correct: result.correct });
      if (result.correct) {
        resolveMistake(level, mistakeKey(set.id, n));
      } else {
        addMistake(level, {
          part, setId: set.id, setTitle: set.title, n, type: set.type, tag: q.tag,
          context: contextFor(set, q),
          yourAnswer: typeof result.userAnswer === 'number'
            ? (q.options ? q.options[result.userAnswer] : result.userAnswer)
            : (result.userAnswer || ''),
          correctAnswers: correctAnswersDisplay(set, q, result),
          explanation: result.explanation || result.chosenWhy || (q.why ? q.why[q.answer] : ''),
          whys: q.why || null,
          source: 'exercise',
        });
      }
    },
  });
  root.appendChild(player.root);

  const actions = document.createElement('div');
  actions.className = 'exercise-actions';
  const checkAllBtn = document.createElement('button');
  checkAllBtn.type = 'button';
  checkAllBtn.className = 'btn btn-primary';
  checkAllBtn.textContent = 'Check all';
  const summary = document.createElement('p');
  summary.className = 'exercise-summary';
  summary.setAttribute('aria-live', 'polite');
  checkAllBtn.addEventListener('click', () => {
    const results = player.revealAll();
    const total = set.questions.length;
    const correct = Object.values(results).filter((r) => r.correct).length;
    recordSetResult(level, set.id, correct, total);
    summary.textContent = `Score: ${correct} / ${total}`;
  });
  actions.appendChild(checkAllBtn);
  actions.appendChild(summary);
  root.appendChild(actions);

  return root;
}
