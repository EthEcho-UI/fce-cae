// Shared plumbing for the practice-test and evaluation-test runners: a pausable countdown
// timer and a multi-part paper (several sets shown one at a time with part navigation).
import { esc } from './dom.js';
import { createPlayer } from './players.js';

export class Timer {
  constructor(initialSeconds, { onTick, onWarn10, onZero } = {}) {
    this.seconds = initialSeconds;
    this.paused = true;
    this.warned10 = initialSeconds <= 600;
    this.warnedZero = initialSeconds <= 0;
    this.onTick = onTick || (() => {});
    this.onWarn10 = onWarn10 || (() => {});
    this.onZero = onZero || (() => {});
    this._interval = null;
  }

  start() {
    if (this._interval) return;
    this.paused = false;
    this._interval = setInterval(() => {
      this.seconds -= 1;
      if (!this.warned10 && this.seconds <= 600) { this.warned10 = true; this.onWarn10(); }
      if (!this.warnedZero && this.seconds <= 0) { this.warnedZero = true; this.onZero(); }
      this.onTick(this.seconds);
    }, 1000);
  }

  pause() {
    this.paused = true;
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  destroy() { this.pause(); }

  setSeconds(s) {
    this.seconds = s;
    this.warned10 = s <= 600;
    this.warnedZero = s <= 0;
  }
}

export function formatClock(totalSeconds) {
  const overtime = totalSeconds < 0;
  const s = Math.abs(totalSeconds);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return (overtime ? '+' : '') + `${m}:${String(sec).padStart(2, '0')}`;
}

/** Build one player per set, in order, with part-navigation. Returns a controller. */
export function buildPaper(sets, { mode, initialAnswersBySet, partLabelFor } = {}) {
  const root = document.createElement('div');
  root.className = 'paper';

  const nav = document.createElement('div');
  nav.className = 'paper-nav';
  nav.setAttribute('role', 'tablist');
  const panels = document.createElement('div');
  panels.className = 'paper-panels';

  const entries = sets.map((set, i) => {
    const player = createPlayer(set, {
      mode: mode || 'test',
      initialAnswers: (initialAnswersBySet && initialAnswersBySet[set.id]) || {},
      allowOverride: false,
    });
    const panel = document.createElement('div');
    panel.className = 'paper-panel';
    panel.hidden = i !== 0;
    panel.setAttribute('role', 'tabpanel');
    const h = document.createElement('h2');
    h.className = 'paper-panel-title';
    h.textContent = `${partLabelFor ? partLabelFor(set, i) : `Part ${i + 1}`} — ${set.title}`;
    panel.appendChild(h);
    panel.appendChild(player.root);
    panels.appendChild(panel);
    return { set, player, panel };
  });

  let active = 0;
  function show(i) {
    active = i;
    entries.forEach((e, idx) => { e.panel.hidden = idx !== i; });
    nav.querySelectorAll('.paper-nav-btn').forEach((b, idx) => {
      b.classList.toggle('paper-nav-btn-active', idx === i);
      b.setAttribute('aria-selected', String(idx === i));
    });
  }

  entries.forEach((e, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'paper-nav-btn';
    btn.setAttribute('role', 'tab');
    btn.textContent = partLabelFor ? partLabelFor(e.set, i) : `Part ${i + 1}`;
    btn.addEventListener('click', () => show(i));
    nav.appendChild(btn);
  });
  show(0);

  root.appendChild(nav);
  root.appendChild(panels);

  return {
    root,
    entries,
    showPart: show,
    getAllAnswers: () => {
      const out = {};
      for (const e of entries) out[e.set.id] = e.player.getAnswers();
      return out;
    },
  };
}
