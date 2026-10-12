import { esc } from '../dom.js';
import { buildAllCards, cardsForDeck, dueCards, dueCount, newCards, topics } from '../deck.js';
import { getSrs, setSrs, getNewShownToday, incrementNewShownToday, addCustomCard, updateCustomCard, deleteCustomCard, getState } from '../flashcards.js';
import { review, isNew } from '../srs.js';
import { getSettings } from '../settings.js';
import { icons } from '../icons.js';

async function renderDecks(ctx) {
  const { level } = ctx;
  const cards = await buildAllCards(level);
  const root = document.createElement('div');
  root.className = 'page page-flashcards';
  const decks = [
    { id: 'starred', label: 'Starred' },
    { id: 'mistakes', label: 'From my mistakes' },
    { id: 'custom', label: 'My cards' },
  ].concat(topics(cards).map((t) => ({ id: `topic:${t}`, label: t })));

  root.innerHTML = `
    <h1 class="page-title">Flashcards</h1>
    <p class="page-sub">Spaced repetition decks for ${level.toUpperCase()}.</p>
    <ul class="set-list">
      ${decks.map((d) => {
        const deckCards = cardsForDeck(cards, d.id);
        const due = dueCount(level, deckCards);
        return `<li><a class="set-row" href="#/flashcards/${encodeURIComponent(d.id)}">
          <span class="set-row-main"><span class="set-title">${esc(d.label)}</span><span class="set-meta">${deckCards.length} cards</span></span>
          <span class="set-row-score">${due} due</span>
        </a></li>`;
      }).join('')}
    </ul>
    <section id="my-cards-editor" class="card"></section>
  `;
  renderMyCardsEditor(root.querySelector('#my-cards-editor'), level);
  return root;
}

function renderMyCardsEditor(container, level) {
  const state = getState(level);
  container.innerHTML = `
    <p class="card-label">My cards</p>
    <div class="custom-card-list"></div>
    <form id="add-card-form" class="add-card-form">
      <input type="text" id="new-front" class="text-input" placeholder="Front" aria-label="Card front" required>
      <input type="text" id="new-back" class="text-input" placeholder="Back" aria-label="Card back" required>
      <button type="submit" class="btn btn-secondary btn-small">${icons.plus} Add card</button>
    </form>
  `;
  const list = container.querySelector('.custom-card-list');
  function refreshList() {
    const st = getState(level);
    list.innerHTML = st.custom.map((c) => `
      <div class="custom-card-row" data-id="${esc(c.id)}">
        <span>${esc(c.front)} → ${esc(c.back)}</span>
        <button type="button" class="icon-btn delete-card-btn" aria-label="Delete card">${icons.trash}</button>
      </div>`).join('') || '<p class="empty-note">No custom cards yet.</p>';
    list.querySelectorAll('.delete-card-btn').forEach((b) => b.addEventListener('click', (e) => {
      const id = e.currentTarget.closest('.custom-card-row').dataset.id;
      deleteCustomCard(level, id);
      refreshList();
    }));
  }
  refreshList();
  container.querySelector('#add-card-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const front = container.querySelector('#new-front');
    const back = container.querySelector('#new-back');
    if (!front.value.trim() || !back.value.trim()) return;
    addCustomCard(level, front.value.trim(), back.value.trim());
    front.value = ''; back.value = '';
    refreshList();
  });
}

function cardFrontHtml(card) {
  if (card.kind === 'vocab') return `<p class="flash-word">${esc(card.front.word)}</p><p class="flash-pos">${esc(card.front.pos)}</p>`;
  if (card.kind === 'mistake') return `<p class="flash-context">${esc(card.front.context)}</p>`;
  return `<p class="flash-context">${esc(card.front.text)}</p>`;
}
function cardBackHtml(card) {
  if (card.kind === 'vocab') {
    return `<p class="word-definition">${esc(card.back.definition)}</p><p class="word-example">${esc(card.back.example)}</p>
      ${card.back.collocations.length ? `<ul class="plain-list">${card.back.collocations.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;
  }
  if (card.kind === 'mistake') return `<p class="word-definition">${esc(card.back.answer)}</p><p class="mistake-explanation">${esc(card.back.explanation || '')}</p>`;
  return `<p class="word-definition">${esc(card.back.text)}</p>`;
}

async function renderStudy(ctx) {
  const { level, params } = ctx;
  const deckId = decodeURIComponent(params[0]);
  const all = await buildAllCards(level);
  const deckCards = cardsForDeck(all, deckId);
  const { newCardsPerDay } = getSettings();
  const shownToday = getNewShownToday(level);
  const allowedNew = Math.max(0, newCardsPerDay - shownToday);
  const due = dueCards(level, deckCards);
  const newOnes = due.filter((c) => isNew(getSrs(level, c.id)));
  const reviews = due.filter((c) => !isNew(getSrs(level, c.id)));
  const queue = reviews.concat(newOnes.slice(0, allowedNew));

  const root = document.createElement('div');
  root.className = 'page page-flashcard-study';
  root.innerHTML = `<a class="back-link" href="#/flashcards">${icons.arrowLeft} Decks</a><h1 class="page-title">Study</h1>`;
  const slot = document.createElement('div');
  root.appendChild(slot);

  let idx = 0;
  let flipped = false;
  let doneCount = 0;

  function renderCard() {
    flipped = false;
    if (idx >= queue.length) {
      slot.innerHTML = `<p class="empty-note">No more cards due in this deck right now. ${doneCount} reviewed.</p>`;
      document.removeEventListener('keydown', onKey);
      return;
    }
    const card = queue[idx];
    slot.innerHTML = `
      <p class="player-progress">${idx + 1} / ${queue.length}</p>
      <div class="flashcard" id="flashcard" tabindex="0" role="button" aria-label="Flip card">
        <div class="flashcard-face flashcard-front">${cardFrontHtml(card)}</div>
        <div class="flashcard-face flashcard-back" hidden>${cardBackHtml(card)}</div>
      </div>
      <p class="flashcard-hint">Tap the card or press Space to flip. Then rate 1–4.</p>
      <div class="rate-row" hidden>
        <button type="button" class="btn btn-rate" data-r="1">Again<span>1</span></button>
        <button type="button" class="btn btn-rate" data-r="2">Hard<span>2</span></button>
        <button type="button" class="btn btn-rate" data-r="3">Good<span>3</span></button>
        <button type="button" class="btn btn-rate" data-r="4">Easy<span>4</span></button>
      </div>
    `;
    const cardEl = slot.querySelector('#flashcard');
    const rateRow = slot.querySelector('.rate-row');
    function flip() {
      flipped = !flipped;
      slot.querySelector('.flashcard-front').hidden = flipped;
      slot.querySelector('.flashcard-back').hidden = !flipped;
      rateRow.hidden = !flipped;
    }
    cardEl.addEventListener('click', flip);
    cardEl.addEventListener('keydown', (e) => { if (e.key === ' ') { e.preventDefault(); flip(); } });
    rateRow.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => rate(Number(b.dataset.r))));
  }

  function rate(r) {
    const card = queue[idx];
    const wasNew = isNew(getSrs(level, card.id));
    const next = review(getSrs(level, card.id), r);
    setSrs(level, card.id, next);
    if (wasNew) incrementNewShownToday(level);
    doneCount += 1;
    idx += 1;
    renderCard();
  }

  function onKey(e) {
    if (idx >= queue.length) return;
    if (e.key === ' ') { e.preventDefault(); slot.querySelector('#flashcard').click(); }
    if (['1', '2', '3', '4'].includes(e.key) && flipped) rate(Number(e.key));
  }
  document.addEventListener('keydown', onKey);
  window.__fcecaeTeardown = () => document.removeEventListener('keydown', onKey);

  renderCard();
  return root;
}

export async function render(ctx) {
  if (ctx.params.length) return renderStudy(ctx);
  return renderDecks(ctx);
}
