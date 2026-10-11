# Content spec (v1)

All exam content lives in `data/<level>/` where `<level>` is `fce` (B2 First) or `cae` (C1 Advanced).
Every file is UTF-8 JSON. `tools/validate_content.py` enforces this spec; content must pass it.

## Copyright rule
All texts and questions are **original**. Model the *format, length, difficulty and the kind of
point tested* on Cambridge past papers, but never copy or closely paraphrase a real Cambridge text,
question or answer key. Use British English spelling.

## Files per level

| file | `type` of each set | FCE part | CAE part |
|---|---|---|---|
| `uoe1.json` | `mcCloze` | R&UoE Part 1 (8 gaps) | Part 1 (8 gaps) |
| `uoe2.json` | `openCloze` | Part 2 (8 gaps) | Part 2 (8 gaps) |
| `uoe3.json` | `wordFormation` | Part 3 (8 gaps) | Part 3 (8 gaps) |
| `uoe4.json` | `transformation` | Part 4 (6 items) | Part 4 (6 items) |
| `read5.json` | `multipleChoice` | Part 5 (6 q) | Part 5 (6 q) |
| `read6.json` | `gappedText` (FCE) / `crossText` (CAE) | Part 6 (6 gaps, 7 sentences) | Part 6 (4 q, 4 texts A–D) |
| `read7.json` | `multipleMatching` (FCE) / `gappedText` (CAE) | Part 7 (10 q) | Part 7 (6 gaps, 7 paragraphs) |
| `read8.json` | — (CAE only) `multipleMatching` | — | Part 8 (10 q) |
| `vocab.json` | vocabulary list (see below) | | |
| `tests.json` | full practice tests (see below) | | |
| `evaluation.json` | evaluation test (see below) | | |

Each part file is `{"level": "fce", "part": "uoe1", "sets": [ ... ]}`.

## Common set fields
```json
{
  "id": "fce-uoe1-01",          // <level>-<part>-<2 digits>, unique across the app
  "type": "mcCloze",
  "title": "The return of the night train",
  "topic": "travel",             // short lowercase topic label
  "source": "original"           // always "original" for bundled content
}
```

Gaps inside texts are written `{{n}}` where `n` is the question number **within the set, starting at 1**.
Paragraphs are arrays of strings. Explanations are 1–3 sentences, plain text, written for a learner:
say *why*, naming the rule/collocation/meaning, not just "B is correct".

`tag` (required on every question) is one of:
`collocation, phrasal-verb, idiom, fixed-phrase, linking, preposition, verb-pattern, tense, modal,
passive, conditional, reported-speech, relative-clause, article-determiner, comparison, quantifier,
pronoun-reference, word-formation-noun, word-formation-adjective, word-formation-adverb,
word-formation-verb, word-formation-negative, meaning-in-context, detail, inference, attitude-opinion,
purpose-function, reference, main-idea, text-structure, cohesion`

## mcCloze (UoE 1)
```json
{ ...common, "type": "mcCloze",
  "text": ["Paragraph with {{1}} gap ...", "..."],
  "questions": [
    { "n": 1, "options": ["take", "make", "do", "have"], "answer": 0,
      "why": ["Correct: 'take part in' is a fixed collocation.",
              "'make part' is not a collocation.",
              "...", "..."],
      "tag": "collocation" }
  ] }
```
`answer` = index 0–3. `why` has exactly 4 entries aligned with `options`: the correct one explains
why it is right, each other one explains why it is wrong *in this gap*.

## openCloze (UoE 2)
```json
{ ...common, "type": "openCloze", "text": [...],
  "questions": [
    { "n": 1, "answers": ["which", "that"], "explanation": "...", "tag": "relative-clause",
      "commonWrong": { "what": "'what' cannot follow a noun ..." } } ] }
```
`answers`: every acceptable answer, single word, lowercase. `commonWrong` optional (0–3 entries).

## wordFormation (UoE 3)
Question also has `"stem": "COMPETE"` (uppercase). `answers` lowercase, one word (hyphenated ok).
Text shows the stem at the end of the gap's line in the app; do **not** put it in the text.

## transformation (UoE 4)
```json
{ ...common, "type": "transformation",
  "questions": [
    { "n": 1, "first": "I regret not studying harder at school.",
      "keyword": "WISH",
      "before": "I", "after": "harder at school.",
      "answers": ["wish i had studied", "wish that i had studied"],
      "explanation": "...", "tag": "conditional" } ] }
```
Each answer: 2–5 words, lowercase, must contain the keyword (lowercase, the word itself unchanged),
contractions count as two words (write both full and contracted forms if both acceptable).

## multipleChoice (Reading 5)
```json
{ ...common, "type": "multipleChoice", "intro": "You are going to read ...",
  "text": ["para", "para"],
  "questions": [ { "n": 1, "stem": "What does the writer suggest about ...?",
      "options": ["...", "...", "...", "..."], "answer": 2, "why": [4 strings], "tag": "inference" } ] }
```
FCE text ≈ 550–700 words, CAE ≈ 650–800 words. Questions follow text order.

## gappedText (FCE Reading 6 / CAE Reading 7)
```json
{ ...common, "type": "gappedText", "intro": "...",
  "text": ["para with {{1}} ...", "..."],
  "options": [ {"id": "A", "text": "..."}, ... 7 options A–G ],
  "questions": [ { "n": 1, "answer": "C", "explanation": "clue words linking back/forward", "tag": "cohesion" } ],
  "extra": { "id": "F", "explanation": "why F fits nowhere" } }
```
FCE: options are single sentences, gaps sit inside paragraphs. CAE: options are whole paragraphs
(40–90 words) and each gap is its own paragraph entry `"{{n}}"`. 6 questions, 7 options, each answer
letter used once, `extra.id` is the one unused letter.

## crossText (CAE Reading 6)
```json
{ ...common, "type": "crossText", "intro": "...",
  "sections": [ {"id": "A", "title": "Reviewer A", "text": ["para", "para"]}, ... A–D ],
  "questions": [ { "n": 1, "prompt": "Which reviewer has a different opinion from the others on ...?",
      "answer": "B", "explanation": "...", "tag": "attitude-opinion" } ] }
```
4 sections ≈ 120–160 words each; 4 questions.

## multipleMatching (FCE Reading 7 / CAE Reading 8)
Same shape as crossText (`"type": "multipleMatching"`), 4–6 sections (A–F), 10 questions. Each
question's explanation quotes/points to the matching phrase. Letters may repeat.

## vocab.json
```json
{ "level": "fce", "words": [
  { "id": "fce-v-001", "word": "take up", "pos": "phrasal verb",
    "definition": "to start doing a new hobby or activity",
    "example": "She took up the cello when she retired.",
    "collocations": ["take up a hobby", "take up running"],
    "topic": "free time" } ] }
```
`pos` ∈ noun, verb, adjective, adverb, phrasal verb, idiom, collocation, linking word, preposition.
`example` must contain the word/phrase (any inflected form) so the app can make a gap-fill.
≥150 entries per level; CAE entries are genuinely C1 (not FCE repeats).

## tests.json
```json
{ "level": "fce", "tests": [
  { "id": "fce-test-1", "title": "Practice Test 1", "minutes": 75,
    "sets": ["fce-uoe1-01", "fce-uoe2-01", "fce-uoe3-01", "fce-uoe4-01", "fce-read5-01", "fce-read6-01", "fce-read7-01"] } ] }
```
FCE 75 min, CAE 90 min. Sets referenced must exist and each set is used by at most one test.

## evaluation.json
```json
{ "level": "fce", "id": "fce-eval", "title": "Level check", "minutes": 30,
  "sets": [ ...full set objects of any types above, ids "fce-eval-01" ... ] }
```
Short mixed test (≈ 30 questions) covering grammar, vocabulary and reading; independent of the part files.

## Import format (user content)
Users may import a JSON file `{"level": "fce"|"cae", "sets": [...]}` with sets in exactly the shapes
above (`source` may be anything, e.g. "own"). Imported sets live only in that browser.
