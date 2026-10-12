# How to import your own material

First & Advanced Prep can import extra practice sets that you (or anyone) write yourself. Imported
sets are stored only in your browser — they are never uploaded anywhere — and they appear in
**Practise** alongside the built-in sets, labelled "Imported".

## File format

An import file is a single JSON file shaped like this:

```json
{
  "level": "fce",
  "sets": [ { "...one set object..." } ]
}
```

- `level` must be `"fce"` or `"cae"`.
- `sets` is a non-empty array. Each entry must be in exactly one of the shapes described below —
  these are the same shapes used by the app's own bundled content, documented in full in
  `docs/CONTENT_SPEC.md`.

Every set needs these common fields:

```json
{ "id": "fce-own-01", "type": "mcCloze", "title": "...", "topic": "travel", "source": "own" }
```

`id` must be unique within your file. `type` is one of `mcCloze`, `openCloze`, `wordFormation`,
`transformation`, `multipleChoice`, `gappedText`, `crossText`, `multipleMatching`. `source` can be
anything you like (e.g. `"own"`) — bundled content always uses `"original"`.

Every question needs a `tag` naming the point it tests — see the full list in
`docs/CONTENT_SPEC.md`. If you're not sure, `meaning-in-context` is a safe default for vocabulary
items and `detail` for reading-comprehension items.

### Quick reference per type

| type | needs | question count |
|---|---|---|
| `mcCloze` | `text` (paragraphs with `{{1}}..{{n}}` gaps) + 4-option questions with `why` | 8 |
| `openCloze` | `text` with gaps + typed-answer questions (`answers`, `explanation`) | 8 |
| `wordFormation` | like `openCloze` + `stem` (uppercase) per question | 8 |
| `transformation` | no text — each question has `first`, `keyword`, `before`, `after`, `answers` | 6 |
| `multipleChoice` | `text` (no gaps) + `stem`/4 options questions | 6 |
| `gappedText` | `text` with gaps + `options` (A–G sentences/paragraphs) + `extra` | 6 |
| `crossText` | `sections` (A–D) + questions with a `prompt` and a section-letter `answer` | 4 |
| `multipleMatching` | `sections` (A–F) + 10 questions with a section-letter `answer` | 10 |

A complete, valid example using the `transformation` shape is in
[`docs/import-example.json`](import-example.json) — open **Import & data → Validate** and pick that
file to see it accepted.

## Importing

1. Open **More → Import & data**.
2. Choose your `.json` file, or paste its contents into the text box.
3. Press **Validate**. Problems are listed with the question number and a plain description — fix
   your file and validate again.
4. Once it's accepted you'll see a count of sets/questions found. Press **Save** to add them.
5. Your imported sets now appear in **Practise** under their matching part, and can be deleted again
   from **Import & data**.

## Limits

- Imported sets live only in this browser (this device, this browser profile). **Backup** (in
  **Import & data**) includes them, so you can move them to another browser by restoring the backup
  there.
- The exact structural rules (gap numbering, option counts, answer formats) are the same ones
  `tools/validate_content.py` checks for the app's own content — the in-app validator enforces the
  same essential rules.
