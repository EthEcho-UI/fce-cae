import { icons } from '../icons.js';
import { esc } from '../dom.js';
import { getSettings, updateSettings } from '../settings.js';

export async function render() {
  const s = getSettings();
  const root = document.createElement('div');
  root.className = 'page page-settings';
  root.innerHTML = `
    <a class="back-link" href="#/more">${icons.arrowLeft} More</a>
    <h1 class="page-title">Settings</h1>

    <section class="card">
      <p class="card-label">Theme</p>
      <div class="segmented" id="settings-theme" role="group" aria-label="Theme">
        ${['system', 'light', 'dark'].map((t) => `<button type="button" class="segmented-btn${s.theme === t ? ' segmented-btn-active' : ''}" data-theme="${t}" aria-pressed="${s.theme === t}">${t[0].toUpperCase()}${t.slice(1)}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <p class="card-label">Text size</p>
      <div class="segmented" id="settings-text" role="group" aria-label="Text size">
        ${[1, 2, 3].map((n) => `<button type="button" class="segmented-btn${s.textSize === n ? ' segmented-btn-active' : ''}" data-size="${n}" aria-pressed="${s.textSize === n}">${['Small', 'Medium', 'Large'][n - 1]}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <label class="card-label" for="new-cards-input">New cards per day</label>
      <input type="number" min="1" max="100" id="new-cards-input" class="text-input" value="${esc(String(s.newCardsPerDay))}">
    </section>
  `;

  root.querySelector('#settings-theme').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    updateSettings({ theme: b.dataset.theme });
    document.documentElement.setAttribute('data-theme', b.dataset.theme === 'system' ? '' : b.dataset.theme);
    root.querySelectorAll('#settings-theme button').forEach((x) => {
      x.classList.toggle('segmented-btn-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    const headerBtn = document.querySelector(`#theme-switch [data-theme="${b.dataset.theme}"]`);
    if (headerBtn) headerBtn.click();
  });
  root.querySelector('#settings-text').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const size = Number(b.dataset.size);
    updateSettings({ textSize: size });
    document.documentElement.setAttribute('data-text-size', String(size));
    root.querySelectorAll('#settings-text button').forEach((x) => {
      x.classList.toggle('segmented-btn-active', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
  });
  root.querySelector('#new-cards-input').addEventListener('change', (e) => {
    const n = Math.max(1, Math.min(100, Number(e.target.value) || 15));
    updateSettings({ newCardsPerDay: n });
    e.target.value = n;
  });

  return root;
}
