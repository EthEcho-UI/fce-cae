// Maps content tags to the three evaluation skill groups.
const GRAMMAR = new Set(['tense', 'modal', 'passive', 'conditional', 'reported-speech', 'relative-clause',
  'article-determiner', 'comparison', 'quantifier', 'pronoun-reference', 'verb-pattern', 'preposition', 'linking']);
const VOCAB = new Set(['collocation', 'phrasal-verb', 'idiom', 'fixed-phrase', 'meaning-in-context',
  'word-formation-noun', 'word-formation-adjective', 'word-formation-adverb', 'word-formation-verb', 'word-formation-negative']);

export function skillGroup(tag) {
  if (GRAMMAR.has(tag)) return 'Grammar';
  if (VOCAB.has(tag)) return 'Vocabulary';
  return 'Reading';
}

export function tagLabel(tag) {
  return String(tag).replace(/-/g, ' ');
}
