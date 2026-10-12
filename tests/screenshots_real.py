#!/usr/bin/env python3
"""Screenshots + horizontal-overflow checks against the REAL content in output/data/
(not the test fixtures) — serves with tests/serve.py WITHOUT --fixtures.

Captures the 5 required pages (Home, exercise-with-feedback, a reading part, flashcards,
mistakes) at 360x740 / 390x844 / 768x1024 / 1280x800, light + dark, into
tests/screenshots/real-*.png — and separately crawls EVERY gappedText set in both levels
(the part the round-1 review flagged) checking scrollWidth <= innerWidth at every size,
since that was reported as overflowing on real content specifically.

Run with the venv set up per the task:
  <venv>/bin/python tests/screenshots_real.py
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SHOTS = ROOT / "tests" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(ROOT / "tests"))
from e2e import qblock, set_answer, check_block, poll  # noqa: E402

SIZES = [(360, 740), (390, 844), (768, 1024), (1280, 800)]
THEMES = ["light", "dark"]
FAILURES = []


def load_real(level, part):
    with open(DATA / level / f"{part}.json", encoding="utf-8") as f:
        return json.load(f)


def check_overflow(page, label):
    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    if overflow > 0:
        FAILURES.append(f"{label}: horizontal overflow {overflow}px")
        print(f"[FAIL] {label}: scrollWidth exceeds innerWidth by {overflow}px")
        return False
    print(f"[ok] {label}")
    return True


def prepare_home(page):
    pass


def prepare_exercise_feedback(page):
    set_obj = load_real("fce", "uoe1")["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/uoe1/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")
    b1 = qblock(page.locator(".player-questions"), 1)
    set_answer(b1, set_obj, set_obj["questions"][0], correct=True)
    check_block(b1)


def prepare_reading_part(page):
    set_obj = load_real("fce", "read5")["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/read5/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")


def prepare_flashcards(page):
    page.evaluate("(p) => { location.hash = p; }", "/flashcards")
    poll(page, "document.querySelectorAll('.set-list a.set-row').length > 0")
    href = page.evaluate(
        """
        Array.from(document.querySelectorAll('.set-list a.set-row'))
          .find(a => !a.querySelector('.set-row-score')?.textContent.startsWith('0 '))
          ?.getAttribute('href')
        """
    )
    if href:
        page.evaluate("(h) => { location.hash = h.replace(/^#/, ''); }", href)
        poll(page, "!!document.querySelector('#flashcard')")


def prepare_mistakes(page):
    set_obj = load_real("fce", "uoe3")["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/uoe3/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")
    b1 = qblock(page.locator(".player-questions"), 1)
    set_answer(b1, set_obj, set_obj["questions"][0], correct=False)
    check_block(b1)
    page.evaluate("(p) => { location.hash = p; }", "/mistakes")
    poll(page, "document.querySelectorAll('.mistake-card').length > 0")


def prepare_gapped(level, part, set_id):
    def _prep(page):
        page.evaluate("(p) => { location.hash = p; }", f"/exercises/{part}/{set_id}")
        poll(page, "document.querySelectorAll('.qblock').length > 0")
    return _prep


PAGES = [
    ("real-home", prepare_home),
    ("real-exercise-feedback", prepare_exercise_feedback),
    ("real-reading-part", prepare_reading_part),
    ("real-flashcards", prepare_flashcards),
    ("real-mistakes", prepare_mistakes),
]


def main():
    serve_proc = subprocess.Popen(
        [sys.executable, str(ROOT / "tests" / "serve.py")],  # no --fixtures: real data
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    base = None
    start = time.time()
    while time.time() - start < 10:
        line = serve_proc.stdout.readline()
        if not line:
            continue
        m = re.search(r"(http://127\.0\.0\.1:\d+/fce-cae/)", line)
        if m:
            base = m.group(1)
            break
    if not base:
        print("ERROR: server did not start", file=sys.stderr)
        serve_proc.terminate()
        sys.exit(1)

    gapped_sets = []
    for level, part in [("fce", "read6"), ("cae", "read7")]:
        for s in load_real(level, part)["sets"]:
            gapped_sets.append((level, part, s["id"], s["title"]))

    shot_count = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            # 1) The 5 required pages, all sizes x themes.
            for name, prepare in PAGES:
                for (w, h) in SIZES:
                    for theme in THEMES:
                        context = browser.new_context(viewport={"width": w, "height": h}, color_scheme=theme)
                        page = context.new_page()
                        console_errors = []
                        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" and "favicon" not in m.text.lower() else None)
                        try:
                            page.goto(base, wait_until="load")
                            poll(page, "!!document.querySelector('#level-switch button')")
                            prepare(page)
                            time.sleep(0.2)
                            out = SHOTS / f"{name}-{w}x{h}-{theme}.png"
                            page.screenshot(path=str(out))
                            shot_count += 1
                            check_overflow(page, out.name)
                            if console_errors:
                                FAILURES.append(f"{out.name}: console errors {console_errors[:3]}")
                                print(f"[FAIL] {out.name}: console errors: {console_errors[:3]}")
                        except Exception as e:  # noqa: BLE001
                            FAILURES.append(f"{name}-{w}x{h}-{theme}: {e}")
                            print(f"[FAIL] {name}-{w}x{h}-{theme}: {e}")
                        finally:
                            context.close()

            # 2) Every real gappedText set (both levels), all sizes x themes: scrollWidth check
            #    always; a screenshot only at 390 light (one per set) to keep image count sane.
            for level, part, set_id, title in gapped_sets:
                for (w, h) in SIZES:
                    for theme in THEMES:
                        context = browser.new_context(viewport={"width": w, "height": h}, color_scheme=theme)
                        page = context.new_page()
                        try:
                            page.goto(base, wait_until="load")
                            poll(page, "!!document.querySelector('#level-switch button')")
                            if level == "cae":
                                page.click('#level-switch button:has-text("CAE")')
                                poll(page, "document.querySelector('#level-switch button.segmented-btn-active')?.textContent.trim() === 'CAE'")
                            prepare_gapped(level, part, set_id)(page)
                            time.sleep(0.2)
                            label = f"gappedText {level}/{part}/{set_id} ({title}) @ {w}x{h} {theme}"
                            check_overflow(page, label)
                            if (w, h) == (390, 844) and theme == "light":
                                out = SHOTS / f"real-gapped-{level}-{set_id}-390x844-light.png"
                                page.screenshot(path=str(out))
                                shot_count += 1
                        except Exception as e:  # noqa: BLE001
                            FAILURES.append(f"gappedText {level}/{set_id} @ {w}x{h} {theme}: {e}")
                            print(f"[FAIL] gappedText {level}/{set_id} @ {w}x{h} {theme}: {e}")
                        finally:
                            context.close()

            browser.close()
    finally:
        serve_proc.terminate()
        try:
            serve_proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            serve_proc.kill()

    print(f"\n{shot_count} screenshots captured, {len(FAILURES)} failure(s)")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
