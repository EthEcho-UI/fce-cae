import { esc } from '../dom.js';
import { validateImport } from '../validate.js';
import { getImportedSets, addImportedSets, deleteImportedSet } from '../data.js';
import { backupAll, restoreAll, resetAll } from '../store.js';
import { icons } from '../icons.js';

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export async function render(ctx) {
  const { level } = ctx;
  const root = document.createElement('div');
  root.className = 'page page-import';
  root.innerHTML = `
    <a class="back-link" href="#/more">${icons.arrowLeft} More</a>
    <h1 class="page-title">Import &amp; data</h1>

    <section class="card">
      <p class="card-label">Import a set file</p>
      <p>JSON shaped <code>{"level": "fce"|"cae", "sets": [...]}</code>. See
        <a href="docs/IMPORT.md" target="_blank" rel="noopener">How to import</a> for the format and an
        <a href="docs/import-example.json" target="_blank" rel="noopener">example file</a>.</p>
      <input type="file" id="import-file" accept="application/json,.json" aria-label="Choose a JSON file to import">
      <p class="or-sep">or paste JSON</p>
      <textarea id="import-paste" class="text-input textarea-input" rows="6" placeholder="Paste JSON here"></textarea>
      <button type="button" id="validate-btn" class="btn btn-secondary">Validate</button>
      <div id="import-result"></div>
    </section>

    <section class="card">
      <p class="card-label">Imported sets (${level.toUpperCase()})</p>
      <div id="imported-list"></div>
    </section>

    <section class="card">
      <p class="card-label">Backup &amp; restore</p>
      <button type="button" id="backup-btn" class="btn btn-secondary">${icons.download} Download backup</button>
      <p class="or-sep">Restore from a backup file</p>
      <input type="file" id="restore-file" accept="application/json,.json" aria-label="Choose a backup file to restore">
    </section>

    <section class="card">
      <p class="card-label">Reset</p>
      <p>Removes all First &amp; Advanced Prep data from this browser (progress, mistakes, flashcards,
        imported sets, settings). Data from other apps on this origin is never touched.</p>
      <button type="button" id="reset-btn" class="btn btn-danger">Reset all data</button>
    </section>
  `;

  function refreshImportedList() {
    const sets = getImportedSets(level);
    const el = root.querySelector('#imported-list');
    el.innerHTML = sets.length ? sets.map((s) => `
      <div class="custom-card-row" data-id="${esc(s.id)}">
        <span>${esc(s.title)} <span class="set-meta">(${esc(s.type)})</span></span>
        <button type="button" class="icon-btn delete-set-btn" aria-label="Delete imported set">${icons.trash}</button>
      </div>`).join('') : '<p class="empty-note">No imported sets for this level.</p>';
    el.querySelectorAll('.delete-set-btn').forEach((b) => b.addEventListener('click', (e) => {
      const id = e.currentTarget.closest('.custom-card-row').dataset.id;
      deleteImportedSet(level, id);
      refreshImportedList();
    }));
  }
  refreshImportedList();

  let pendingObj = null;
  async function doValidate() {
    const resultEl = root.querySelector('#import-result');
    let text = root.querySelector('#import-paste').value.trim();
    const file = root.querySelector('#import-file').files[0];
    if (file) text = await readFile(file);
    if (!text) { resultEl.innerHTML = '<p class="feedback-incorrect-text">Choose a file or paste JSON first.</p>'; return; }
    let obj;
    try { obj = JSON.parse(text); } catch (e) {
      resultEl.innerHTML = `<p class="feedback-incorrect-text">Not valid JSON: ${esc(e.message)}</p>`;
      return;
    }
    const result = validateImport(obj);
    if (!result.ok) {
      resultEl.innerHTML = `<p class="feedback-incorrect-text">${result.errors.length} problem(s) found:</p>
        <ul class="plain-list">${result.errors.slice(0, 30).map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`;
      pendingObj = null;
      return;
    }
    pendingObj = obj;
    resultEl.innerHTML = `
      <p class="feedback-correct-text">Looks good: ${result.counts.sets} set(s), ${result.counts.questions} question(s)
        (${Object.entries(result.counts.byType).map(([t, n]) => `${t}: ${n}`).join(', ')}).</p>
      <button type="button" id="save-import-btn" class="btn btn-primary">Save to ${esc(obj.level).toUpperCase()}</button>
    `;
    root.querySelector('#save-import-btn').addEventListener('click', () => {
      addImportedSets(obj.level, obj.sets);
      resultEl.innerHTML = '<p class="feedback-correct-text">Imported.</p>';
      if (obj.level === level) refreshImportedList();
      pendingObj = null;
    });
  }
  root.querySelector('#validate-btn').addEventListener('click', doValidate);

  root.querySelector('#backup-btn').addEventListener('click', () => {
    downloadJson(`fcecae-backup-${new Date().toISOString().slice(0, 10)}.json`, backupAll());
  });

  root.querySelector('#restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await readFile(file);
    let obj;
    try { obj = JSON.parse(text); } catch (err) { alert('Not a valid JSON file.'); return; }
    if (!confirm('Restore will overwrite your current progress, mistakes, flashcards and settings with the backup. Continue?')) return;
    const res = restoreAll(obj);
    if (!res.ok) { alert(res.error); return; }
    alert(`Restored ${res.count} item(s). The page will reload.`);
    location.reload();
  });

  root.querySelector('#reset-btn').addEventListener('click', () => {
    if (!confirm('This removes all First & Advanced Prep data from this browser. This cannot be undone. Continue?')) return;
    resetAll();
    location.reload();
  });

  return root;
}
