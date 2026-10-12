#!/usr/bin/env python3
"""Captures the required screenshots (360x740, 768x1024, 1280x800 x light/dark) of Home, an
exercise with feedback, a reading part, flashcards, and mistakes, into tests/screenshots/.
Also asserts document.documentElement.scrollWidth <= innerWidth on every shot (no horizontal
scroll). Run after tests/e2e.py (or standalone) with the same venv:

  <venv>/bin/python tests/screenshots.py
"""
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tests" / "screenshots"
SHOTS.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(ROOT / "tests"))
from e2e import load_fixture, qblock, set_answer, check_block, poll  # noqa: E402

SIZES = [(360, 740), (768, 1024), (1280, 800)]
THEMES = ["light", "dark"]

FAILURES = []


def prepare_home(page):
    pass  # default home is fine


def prepare_exercise_feedback(page):
    data = load_fixture("fce", "uoe1")
    set_obj = data["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/uoe1/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")
    b1 = qblock(page.locator(".player-questions"), 1)
    set_answer(b1, set_obj, set_obj["questions"][0], correct=True)
    check_block(b1)


def prepare_reading_part(page):
    data = load_fixture("fce", "read5")
    set_obj = data["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/read5/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")


def prepare_flashcards(page):
    page.evaluate("(p) => { location.hash = p; }", "/flashcards")
    poll(page, "document.querySelectorAll('.set-list a.set-row').length > 0")
    # Pick a deck that actually has due cards (e.g. "Starred" is always empty on a fresh
    # install, and would just show the "no cards due" message instead of a flashcard).
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
    data = load_fixture("fce", "uoe3")  # wordFormation
    set_obj = data["sets"][0]
    page.evaluate("(p) => { location.hash = p; }", f"/exercises/uoe3/{set_obj['id']}")
    poll(page, "document.querySelectorAll('.qblock').length > 0")
    b1 = qblock(page.locator(".player-questions"), 1)
    set_answer(b1, set_obj, set_obj["questions"][0], correct=False)
    check_block(b1)
    page.evaluate("(p) => { location.hash = p; }", "/mistakes")
    poll(page, "document.querySelectorAll('.mistake-card').length > 0")


PAGES = [
    ("home", "/", prepare_home),
    ("exercise-feedback", "/", prepare_exercise_feedback),
    ("reading-part", "/", prepare_reading_part),
    ("flashcards", "/", prepare_flashcards),
    ("mistakes", "/", prepare_mistakes),
]


def main():
    serve_proc = subprocess.Popen(
        [sys.executable, str(ROOT / "tests" / "serve.py"), "--fixtures"],
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

    count = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            for name, path, prepare in PAGES:
                for (w, h) in SIZES:
                    for theme in THEMES:
                        context = browser.new_context(
                            viewport={"width": w, "height": h}, color_scheme=theme
                        )
                        page = context.new_page()
                        try:
                            page.goto(base, wait_until="load")
                            poll(page, "!!document.querySelector('#level-switch button')")
                            prepare(page)
                            time.sleep(0.2)
                            out = SHOTS / f"{name}-{w}x{h}-{theme}.png"
                            # Viewport-sized, not full_page: position:fixed elements (the
                            # mobile bottom nav) get duplicated by Chromium's full-page
                            # screenshot stitching, which is a capture artifact, not a real
                            # rendering bug — a plain viewport shot avoids it.
                            page.screenshot(path=str(out))
                            count += 1
                            overflow = page.evaluate(
                                "document.documentElement.scrollWidth - window.innerWidth"
                            )
                            if overflow > 0:
                                FAILURES.append(f"{out.name}: horizontal overflow {overflow}px")
                                print(f"[FAIL] {out.name}: scrollWidth exceeds innerWidth by {overflow}px")
                            else:
                                print(f"[ok] {out.name}")
                        except Exception as e:  # noqa: BLE001
                            FAILURES.append(f"{name}-{w}x{h}-{theme}: {e}")
                            print(f"[FAIL] {name}-{w}x{h}-{theme}: {e}")
                        finally:
                            context.close()
            browser.close()
    finally:
        serve_proc.terminate()
        try:
            serve_proc.wait(timeout=5)
        except Exception:  # noqa: BLE001
            serve_proc.kill()

    print(f"\n{count} screenshots captured, {len(FAILURES)} failure(s)")
    for f in FAILURES:
        print(" -", f)
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
