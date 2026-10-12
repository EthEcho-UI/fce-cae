// Client-side port of the essential rules in tools/validate_content.py, for validating
// user-imported JSON in the browser (no Python available there).

const TAGS = new Set(`collocation phrasal-verb idiom fixed-phrase linking preposition verb-pattern tense modal
passive conditional reported-speech relative-clause article-determiner comparison quantifier
pronoun-reference word-formation-noun word-formation-adjective word-formation-adverb
word-formation-verb word-formation-negative meaning-in-context detail inference attitude-opinion
purpose-function reference main-idea text-structure cohesion`.split(/\s+/));

const QCOUNT = {
  mcCloze: 8, openCloze: 8, wordFormation: 8, transformation: 6, multipleChoice: 6,
  gappedText: 6, crossText: 4, multipleMatching: 10,
};

const GAP = /\{\{(\d+)\}\}/g;

function isStr(x) { return typeof x === 'string' && x.trim() !== ''; }

function gapNumbers(text) {
  if (!Array.isArray(text) || text.length === 0 || !text.every((p) => typeof p === 'string')) return null;
  const out = [];
  for (const p of text) {
    let m;
    const re = new RegExp(GAP);
    while ((m = re.exec(p))) out.push(parseInt(m[1], 10));
  }
  return out;
}

function checkQNumbers(errs, where, qs, expected) {
  const ns = qs.map((q) => q.n);
  const want = qs.map((_, i) => i + 1);
  if (JSON.stringify(ns) !== JSON.stringify(want)) {
    errs.push(`${where}: question numbers must be 1..${qs.length} in order, got ${JSON.stringify(ns)}`);
  }
  if (expected != null && qs.length !== expected) {
    errs.push(`${where}: expected ${expected} questions, got ${qs.length}`);
  }
}

function checkSet(errs, s, level) {
  const sid = s.id || '?';
  const where = `${level}/${sid}`;
  for (const f of ['id', 'type', 'title', 'topic', 'source']) {
    if (!isStr(s[f])) errs.push(`${where}: missing field "${f}"`);
  }
  const t = s.type;
  if (!(t in QCOUNT)) { errs.push(`${where}: unknown type "${t}"`); return; }
  const qs = s.questions;
  if (!Array.isArray(qs) || qs.length === 0) { errs.push(`${where}: questions missing`); return; }
  checkQNumbers(errs, where, qs, QCOUNT[t]);
  for (const q of qs) {
    const qw = `${where} q${q.n}`;
    if (!TAGS.has(q.tag)) errs.push(`${qw}: bad/missing tag "${q.tag}"`);
  }

  if (['mcCloze', 'openCloze', 'wordFormation'].includes(t)) {
    const gaps = gapNumbers(s.text);
    if (gaps === null) { errs.push(`${where}: text must be a non-empty list of strings`); }
    else {
      const sorted = gaps.slice().sort((a, b) => a - b);
      const want = qs.map((_, i) => i + 1);
      if (JSON.stringify(sorted) !== JSON.stringify(want) || JSON.stringify(gaps) !== JSON.stringify(sorted)) {
        errs.push(`${where}: gaps in text ${JSON.stringify(gaps)} don't match questions 1..${qs.length} in order`);
      }
    }
  }

  if (['mcCloze', 'multipleChoice'].includes(t)) {
    for (const q of qs) {
      const qw = `${where} q${q.n}`;
      const o = q.options, w = q.why, a = q.answer;
      if (!(Array.isArray(o) && o.length === 4 && o.every(isStr))) errs.push(`${qw}: options must be 4 non-empty strings`);
      else if (new Set(o.map((x) => x.trim().toLowerCase())).size !== 4) errs.push(`${qw}: duplicate options`);
      if (!(Array.isArray(w) && w.length === 4 && w.every(isStr))) errs.push(`${qw}: why must be 4 non-empty strings`);
      if (![0, 1, 2, 3].includes(a)) errs.push(`${qw}: answer must be 0-3`);
      if (t === 'multipleChoice' && !isStr(q.stem)) errs.push(`${qw}: missing stem`);
    }
  }

  if (['openCloze', 'wordFormation'].includes(t)) {
    for (const q of qs) {
      const qw = `${where} q${q.n}`;
      const ans = q.answers;
      if (!(Array.isArray(ans) && ans.length && ans.every(isStr))) { errs.push(`${qw}: answers must be a non-empty list of strings`); continue; }
      for (const x of ans) if (x !== x.toLowerCase() || x.trim().includes(' ')) errs.push(`${qw}: answer "${x}" must be one lowercase word`);
      if (!isStr(q.explanation)) errs.push(`${qw}: missing explanation`);
      if (t === 'wordFormation') {
        const stem = q.stem;
        if (!(isStr(stem) && stem === stem.toUpperCase())) errs.push(`${qw}: stem must be uppercase`);
        else if (ans.some((x) => stem.toLowerCase() === x)) errs.push(`${qw}: answer equals the stem unchanged`);
      }
    }
  }

  if (t === 'transformation') {
    for (const q of qs) {
      const qw = `${where} q${q.n}`;
      for (const f of ['first', 'keyword', 'after', 'explanation']) if (!isStr(q[f])) errs.push(`${qw}: missing ${f}`);
      if (typeof q.before !== 'string') errs.push(`${qw}: missing before (may be empty string)`);
      const kw = (q.keyword || '').toLowerCase();
      const answers = q.answers || [];
      if (!answers.length) errs.push(`${qw}: answers missing`);
      for (const x of answers) {
        if (x !== x.toLowerCase()) errs.push(`${qw}: answer "${x}" must be lowercase`);
        const n = x.replace(/n't/g, ' not').replace(/'/g, " '").split(/\s+/).filter(Boolean).length;
        if (!x.replace(/’/g, "'").split(/\s+/).includes(kw)) errs.push(`${qw}: answer "${x}" does not contain keyword "${kw}"`);
        if (!(n >= 2 && n <= 5)) errs.push(`${qw}: answer "${x}" has ${n} words (2-5)`);
      }
    }
  }

  if (t === 'gappedText') {
    const gaps = gapNumbers(s.text);
    if (gaps === null) errs.push(`${where}: text must be a non-empty list of strings`);
    else if (JSON.stringify(gaps) !== JSON.stringify(qs.map((_, i) => i + 1))) {
      errs.push(`${where}: gaps ${JSON.stringify(gaps)} don't match questions`);
    }
    const opts = s.options || [];
    const ids = opts.map((o) => o.id);
    const wantIds = 'ABCDEFG'.slice(0, qs.length + 1).split('');
    if (JSON.stringify(ids) !== JSON.stringify(wantIds) || !opts.every((o) => isStr(o.text))) {
      errs.push(`${where}: options must be A..${wantIds[wantIds.length - 1]} with text, got ${JSON.stringify(ids)}`);
    }
    const used = qs.map((q) => q.answer);
    if (new Set(used).size !== used.length || !used.every((u) => ids.includes(u))) {
      errs.push(`${where}: answers must be distinct option letters, got ${JSON.stringify(used)}`);
    }
    const extra = s.extra || {};
    const unused = ids.filter((i) => !used.includes(i)).sort();
    if (!(unused.length === 1 && extra.id === unused[0]) || !isStr(extra.explanation)) {
      errs.push(`${where}: extra.id must be the unused letter ${JSON.stringify(unused)} with an explanation`);
    }
    for (const q of qs) if (!isStr(q.explanation)) errs.push(`${where} q${q.n}: missing explanation`);
  }

  if (['crossText', 'multipleMatching'].includes(t)) {
    const secs = s.sections || [];
    const ids = secs.map((x) => x.id);
    if (t === 'crossText' && secs.length !== 4) errs.push(`${where}: crossText needs 4 sections`);
    const wantIds = 'ABCDEF'.slice(0, secs.length).split('');
    if (!(secs.length >= 4 && secs.length <= 6) || JSON.stringify(ids) !== JSON.stringify(wantIds)) {
      errs.push(`${where}: sections must be A.. in order (4-6), got ${JSON.stringify(ids)}`);
    }
    for (const x of secs) {
      if (!isStr(x.title)) errs.push(`${where}: section ${x.id} missing title`);
      if (gapNumbers(x.text) === null) errs.push(`${where} sec ${x.id}: text must be a non-empty list of strings`);
    }
    for (const q of qs) {
      const qw = `${where} q${q.n}`;
      if (!ids.includes(q.answer)) errs.push(`${qw}: answer "${q.answer}" not a section id`);
      if (!isStr(q.prompt) || !isStr(q.explanation)) errs.push(`${qw}: missing prompt/explanation`);
    }
    if (t === 'multipleMatching' && new Set(qs.map((q) => q.answer)).size < secs.length) {
      errs.push(`${where}: every section should be the answer at least once`);
    }
  }
}

/** Validate an import file shaped {level, sets:[...]}. Returns
 * {ok, errors: string[], counts: {sets, questions, byType: {type: count}}} */
export function validateImport(obj) {
  const errors = [];
  if (!obj || typeof obj !== 'object') return { ok: false, errors: ['Not a JSON object.'], counts: null };
  if (!['fce', 'cae'].includes(obj.level)) errors.push('"level" must be "fce" or "cae".');
  if (!Array.isArray(obj.sets) || obj.sets.length === 0) {
    errors.push('"sets" must be a non-empty array.');
    return { ok: false, errors, counts: null };
  }
  const ids = new Set();
  let questions = 0;
  const byType = {};
  for (const s of obj.sets) {
    if (s && typeof s === 'object' && isStr(s.id)) {
      if (ids.has(s.id)) errors.push(`Duplicate set id "${s.id}" in this file.`);
      ids.add(s.id);
    }
    checkSet(errors, s || {}, obj.level || '?');
    if (s && Array.isArray(s.questions)) questions += s.questions.length;
    if (s && s.type) byType[s.type] = (byType[s.type] || 0) + 1;
  }
  return { ok: errors.length === 0, errors, counts: { sets: obj.sets.length, questions, byType } };
}
