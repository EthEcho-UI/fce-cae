# First & Advanced Prep

Free, offline-capable practice app for the Reading & Use of English papers of
Cambridge **B2 First (FCE)** and **C1 Advanced (CAE)**.

**Live:** https://ethecho-ui.github.io/fce-cae/

- Exercises for every Reading & Use of English part, with an explanation for every right and wrong answer
- Timed full practice tests (real part weights) and a short evaluation (level-check) test
- Mistakes notebook with retry, vocabulary lists + quiz, spaced-repetition flashcards
- Installable PWA; works offline; all progress stays in your browser
- Import your own questions as JSON — see [docs/IMPORT.md](docs/IMPORT.md)

All questions are original and written in the format of the real exam. This is independent
practice material, not affiliated with or endorsed by Cambridge University Press & Assessment.
Listening, Writing and Speaking are not covered.

## Development
Static site, no build step. `python3 tests/serve.py` serves it at `/fce-cae/`.
`python3 tools/validate_content.py --strict` checks the content; `tools/build_sw.py` refreshes
the service-worker precache list from git-tracked files (run before committing).
Source Serif 4 font: SIL Open Font License (`fonts/OFL.txt`).
