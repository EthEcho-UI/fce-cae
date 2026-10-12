import { icons } from '../icons.js';

export async function render() {
  const root = document.createElement('div');
  root.className = 'page page-about';
  root.innerHTML = `
    <a class="back-link" href="#/more">${icons.arrowLeft} More</a>
    <h1 class="page-title">About</h1>
    <p>First &amp; Advanced Prep is a practice app for Cambridge B2 First (FCE) and C1 Advanced (CAE),
      Reading &amp; Use of English papers only.</p>
    <p class="disclaimer">Independent practice material. Not affiliated with or endorsed by Cambridge
      University Press &amp; Assessment. All questions are original.</p>
    <p>All scores shown (practice test marks, the evaluation level estimate) are indicative only — the
      official Cambridge English Scale conversion varies by paper and administration and is not reproduced
      here.</p>
    <p>The <strong>Level estimate</strong> checks grammar and vocabulary only (short gapped sentences, B1 to C2).
      It does not test reading speed, listening, writing or speaking, and its question bank has not been
      calibrated on real candidates, so a few questions can shift the result by a level.
      <strong>Training</strong> drills are single questions taken from the Use of English exercises.</p>
    <p>Your data (progress, mistakes, flashcards, settings, imported sets) is stored only in this browser.
      Nothing is sent to a server.</p>
    <h2 class="section-heading">How to import your own material</h2>
    <p>See <a href="docs/IMPORT.md" target="_blank" rel="noopener">docs/IMPORT.md</a> for the import format,
      or use <a href="#/import">Import &amp; data</a> to add a file directly.</p>
  `;
  return root;
}
