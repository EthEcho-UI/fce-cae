// Answer normalisation for typed answers (openCloze, wordFormation, transformation).

export function basicNormalize(s) {
  if (typeof s !== 'string') return '';
  let t = s.trim();
  t = t.replace(/[‘’ʼ]/g, "'"); // curly -> straight apostrophes
  t = t.toLowerCase();
  t = t.replace(/\s+/g, ' ');
  t = t.replace(/[.,!?;:]+$/g, '');
  return t.trim();
}

// contracted -> possible full-form expansions
const CONTRACTIONS = [
  ["don't", ["do not"]], ["doesn't", ["does not"]], ["didn't", ["did not"]],
  ["won't", ["will not"]], ["wouldn't", ["would not"]], ["can't", ["cannot", "can not"]],
  ["couldn't", ["could not"]], ["shouldn't", ["should not"]], ["mustn't", ["must not"]],
  ["isn't", ["is not"]], ["aren't", ["are not"]], ["wasn't", ["was not"]], ["weren't", ["were not"]],
  ["haven't", ["have not"]], ["hasn't", ["has not"]], ["hadn't", ["had not"]],
  ["i'm", ["i am"]], ["you're", ["you are"]], ["he's", ["he is"]], ["she's", ["she is"]],
  ["it's", ["it is"]], ["we're", ["we are"]], ["they're", ["they are"]], ["that's", ["that is"]],
  ["i've", ["i have"]], ["you've", ["you have"]], ["we've", ["we have"]], ["they've", ["they have"]],
  ["i'll", ["i will"]], ["you'll", ["you will"]], ["he'll", ["he will"]], ["she'll", ["she will"]],
  ["we'll", ["we will"]], ["they'll", ["they will"]], ["it'll", ["it will"]],
  ["i'd", ["i would", "i had"]], ["you'd", ["you would", "you had"]], ["he'd", ["he would", "he had"]],
  ["she'd", ["she would", "she had"]], ["we'd", ["we would", "we had"]], ["they'd", ["they would", "they had"]],
  ["let's", ["let us"]],
];

/** Return the set of strings equivalent to `s` under contraction expansion/contraction
 * (applied once per occurrence; answers are short so this is sufficient). */
export function contractionVariants(s) {
  const variants = new Set([s]);
  for (const [c, exps] of CONTRACTIONS) {
    if (s.includes(c)) for (const exp of exps) variants.add(s.split(c).join(exp));
  }
  for (const [c, exps] of CONTRACTIONS) {
    for (const exp of exps) if (s.includes(exp)) variants.add(s.split(exp).join(c));
  }
  return variants;
}

/** Does `userRaw` match any of `answers` (array of acceptable strings)?
 * `withContractions` enables the contraction-equivalence check (transformation only). */
export function matchesAny(userRaw, answers, withContractions) {
  const u = basicNormalize(userRaw);
  if (!u) return false;
  const uVariants = withContractions ? contractionVariants(u) : new Set([u]);
  for (const a of answers || []) {
    const an = basicNormalize(a);
    if (u === an) return true;
    if (withContractions) {
      const aVariants = contractionVariants(an);
      for (const v of uVariants) if (aVariants.has(v)) return true;
    }
  }
  return false;
}
