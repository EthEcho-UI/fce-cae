import { icons } from '../icons.js';

export async function render() {
  const root = document.createElement('div');
  root.className = 'page page-more';
  root.innerHTML = `
    <h1 class="page-title">More</h1>
    <ul class="part-list">
      <li><a class="part-row" href="#/progress"><span class="part-row-main"><span class="part-label">Progress</span></span><span class="part-row-chevron">${icons.chevronRight}</span></a></li>
      <li><a class="part-row" href="#/vocab"><span class="part-row-main"><span class="part-label">Vocabulary library</span></span><span class="part-row-chevron">${icons.chevronRight}</span></a></li>
      <li><a class="part-row" href="#/settings"><span class="part-row-main"><span class="part-label">Settings</span></span><span class="part-row-chevron">${icons.chevronRight}</span></a></li>
      <li><a class="part-row" href="#/import"><span class="part-row-main"><span class="part-label">Import &amp; data</span></span><span class="part-row-chevron">${icons.chevronRight}</span></a></li>
      <li><a class="part-row" href="#/about"><span class="part-row-main"><span class="part-label">About</span></span><span class="part-row-chevron">${icons.chevronRight}</span></a></li>
    </ul>
  `;
  return root;
}
