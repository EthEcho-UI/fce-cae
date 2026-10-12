#!/usr/bin/env python3
"""End-to-end tests for First & Advanced Prep, using Playwright/Chromium against
tests/serve.py --fixtures. Run with the venv set up per tasks/B2-app.md:

  <venv>/bin/python tests/e2e.py

CSP blocks page.wait_for_function (it evaluates a compiled function in the page's main
world); we poll with page.evaluate() in a loop instead (poll() helper below).
"""
import json
import re
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "tests" / "fixtures" / "data"
RESULTS = []


def record(name, ok, detail=""):
    RESULTS.append((name, ok, detail))
    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail and not ok else ""))


def poll(page, js_expr, timeout=12.0, interval=0.2):
    """Repeatedly page.evaluate(js_expr) (awaiting promises) until truthy.

    Transient evaluate errors (e.g. "Execution context was destroyed" during a
    reload/navigation) are swallowed and retried rather than treated as a result —
    otherwise a reload mid-poll looks like a truthy success.
    """
    start = time.time()
    last_value = None
    last_error = None
    while time.time() - start < timeout:
        try:
            last_value = page.evaluate(js_expr)
            last_error = None
        except Exception as e:  # noqa: BLE001
            last_error = e
            last_value = None
        if last_value:
            return last_value
        time.sleep(interval)
    raise TimeoutError(
        f"poll timed out after {timeout}s waiting for: {js_expr!r} "
        f"(last_value={last_value!r}, last_error={last_error!r})"
    )


def load_fixture(level, part):
    with open(FIXTURES / level / f"{part}.json", encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Browser / context helpers
# ---------------------------------------------------------------------------

class Ctx:
    """One isolated browser context + page, with console/CSP error collection."""

    def __init__(self, browser, base_url):
        self.base_url = base_url
        self.context = browser.new_context(viewport={"width": 1280, "height": 900})
        self.context.add_init_script(
            "window.__cspViolations = []; document.addEventListener('securitypolicyviolation',"
            " (e) => { window.__cspViolations.push(e.violatedDirective + ': ' + e.blockedURI); });"
        )
        self.errors = []
        self.page = self.context.new_page()
        self.page.on("console", self._on_console)
        self.page.on("pageerror", lambda exc: self.errors.append(f"pageerror: {exc}"))
        self.page.on("dialog", lambda d: d.accept())  # auto-accept confirm()/alert() by default

    def _on_console(self, msg):
        if msg.type == "error" and "favicon" not in msg.text.lower():
            self.errors.append(f"console: {msg.text}")

    def goto_home(self):
        self.page.goto(self.base_url, wait_until="load")
        poll(self.page, "!!document.querySelector('#level-switch button')")

    def goto_hash(self, path):
        self.page.evaluate("(p) => { location.hash = p; }", path)
        time.sleep(0.15)

    def set_level(self, level):
        label = "FCE" if level == "fce" else "CAE"
        self.page.click(f'#level-switch button:has-text("{label}")')
        poll(
            self.page,
            f"document.querySelector('#level-switch button.segmented-btn-active')"
            f"?.textContent.trim() === '{label}'",
        )

    def close(self):
        self.context.close()

    def check_clean(self, name_prefix):
        csp = self.page.evaluate("window.__cspViolations || []") if not self.page.is_closed() else []
        problems = list(self.errors) + [f"CSP: {v}" for v in csp]
        record(f"{name_prefix}: no console errors / CSP violations", len(problems) == 0, "; ".join(problems[:5]))


# ---------------------------------------------------------------------------
# Player interaction helpers (positional, so they don't depend on generated ids)
# ---------------------------------------------------------------------------

def qblock(scope_locator, n):
    return scope_locator.locator(".qblock").nth(n - 1)


def set_answer(block, set_obj, q, correct):
    t = set_obj["type"]
    if t in ("mcCloze", "multipleChoice"):
        idx = q["answer"] if correct else (q["answer"] + 1) % len(q["options"])
        block.locator(".optbtn").nth(idx).click()
    elif t in ("openCloze", "wordFormation"):
        val = q["answers"][0] if correct else "zzzqqnotarealword"
        block.locator(".gap-input").fill(val)
    elif t == "transformation":
        val = q["answers"][0] if correct else "totally incorrect answer here"
        block.locator(".gap-input").fill(val)
    elif t == "gappedText":
        # Round-1 review: the bare <select> was replaced with a letter-chip row (same
        # pattern as crossText/multipleMatching) with always-visible option text.
        letter = q["answer"] if correct else next(o["id"] for o in set_obj["options"] if o["id"] != q["answer"])
        block.locator(".letterbtn", has_text=re.compile(rf"^{re.escape(letter)}$")).click()
    elif t in ("crossText", "multipleMatching"):
        ids = [s["id"] for s in set_obj["sections"]]
        letter = q["answer"] if correct else next(x for x in ids if x != q["answer"])
        block.locator(".letterbtn", has_text=re.compile(rf"^{re.escape(letter)}$")).click()
    else:
        raise ValueError(f"unknown type {t}")


def check_block(block):
    block.locator(".qactions button.btn-primary").click()
    fb = block.locator(".feedback")
    fb.wait_for(state="visible", timeout=5000)
    return fb


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_level_switch_persists(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        default_level = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.settings') || '{}').level")
        record("level switch: default level is fce", default_level in (None, "fce"))
        ctx.set_level("cae")
        ctx.page.reload(wait_until="load")
        poll(ctx.page, "!!document.querySelector('#level-switch button')")
        active = ctx.page.evaluate(
            "document.querySelector('#level-switch button.segmented-btn-active')?.textContent.trim()"
        )
        record("level switch: persists CAE across reload", active == "CAE", f"got {active!r}")
        ctx.check_clean("level switch")
    except Exception as e:  # noqa: BLE001
        record("level switch persists", False, str(e))
    finally:
        ctx.close()


FCE_PARTS = ["uoe1", "uoe2", "uoe3", "uoe4", "read5", "read6", "read7"]


def test_player_types_fce(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        for part in FCE_PARTS:
            data = load_fixture("fce", part)
            set_obj = data["sets"][0]
            ctx.goto_hash(f"/exercises/{part}/{set_obj['id']}")
            poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
            scope = ctx.page.locator(".player-questions")
            q1 = set_obj["questions"][0]
            b1 = qblock(scope, 1)
            set_answer(b1, set_obj, q1, correct=True)
            fb1 = check_block(b1)
            cls1 = fb1.get_attribute("class") or ""
            text1 = fb1.inner_text()
            record(f"player[{part}]: correct feedback shown", "feedback-correct" in cls1 and len(text1.strip()) > 0,
                   f"class={cls1!r}")

            if len(set_obj["questions"]) > 1:
                q2 = set_obj["questions"][1]
                b2 = qblock(scope, 2)
                set_answer(b2, set_obj, q2, correct=False)
                fb2 = check_block(b2)
                cls2 = fb2.get_attribute("class") or ""
                text2 = fb2.inner_text()
                record(f"player[{part}]: incorrect feedback with explanation",
                       "feedback-incorrect" in cls2 and len(text2.strip()) > 0, f"class={cls2!r}")
        ctx.check_clean("player types (fce)")
    except Exception as e:  # noqa: BLE001
        record("player types (fce)", False, str(e))
    finally:
        ctx.close()


def test_player_type_cae_crosstext(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("cae")
        data = load_fixture("cae", "read6")
        set_obj = data["sets"][0]
        assert set_obj["type"] == "crossText"
        ctx.goto_hash(f"/exercises/read6/{set_obj['id']}")
        poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
        scope = ctx.page.locator(".player-questions")
        q1 = set_obj["questions"][0]
        b1 = qblock(scope, 1)
        set_answer(b1, set_obj, q1, correct=True)
        fb1 = check_block(b1)
        record("player[cae crossText]: correct feedback", "feedback-correct" in (fb1.get_attribute("class") or ""))
        if len(set_obj["questions"]) > 1:
            q2 = set_obj["questions"][1]
            b2 = qblock(scope, 2)
            set_answer(b2, set_obj, q2, correct=False)
            fb2 = check_block(b2)
            record("player[cae crossText]: incorrect feedback", "feedback-incorrect" in (fb2.get_attribute("class") or ""))
        ctx.check_clean("player type (cae crossText)")
    except Exception as e:  # noqa: BLE001
        record("player type (cae crossText)", False, str(e))
    finally:
        ctx.close()


def test_override_and_mistakes(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        data = load_fixture("fce", "uoe2")  # openCloze
        set_obj = data["sets"][0]
        ctx.goto_hash(f"/exercises/uoe2/{set_obj['id']}")
        poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
        scope = ctx.page.locator(".player-questions")
        q1 = set_obj["questions"][0]
        b1 = qblock(scope, 1)
        set_answer(b1, set_obj, q1, correct=False)
        fb1 = check_block(b1)
        override_btn = b1.locator(".override-btn")
        has_override = override_btn.count() > 0
        record("override: button appears on incorrect typed answer", has_override)
        if has_override:
            override_btn.click()
            time.sleep(0.2)
            new_cls = b1.locator(".feedback").get_attribute("class") or ""
            record("override: marks the question correct", "feedback-correct" in new_cls, f"class={new_cls!r}")
            overrides = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.overrides.fce') || '{}')")
            record("override: persisted to storage", len(overrides) > 0, json.dumps(overrides))

        # mistake notebook: cause a second, distinct wrong answer and check it shows up
        data5 = load_fixture("fce", "read5")
        set5 = data5["sets"][0]
        ctx.goto_hash(f"/exercises/read5/{set5['id']}")
        poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
        scope5 = ctx.page.locator(".player-questions")
        q = set5["questions"][0]
        b = qblock(scope5, 1)
        set_answer(b, set5, q, correct=False)
        check_block(b)

        ctx.goto_hash("/mistakes")
        poll(ctx.page, "document.querySelectorAll('.mistake-card').length > 0")
        cards = ctx.page.locator(".mistake-card")
        record("mistakes: wrong answer appears in notebook", cards.count() > 0, f"count={cards.count()}")

        card = cards.first
        retry_btn = card.locator("button", has_text="Retry")
        if retry_btn.count() > 0:
            retry_btn.click()
            retry_slot = card.locator(".mistake-retry-slot")
            poll_expr = "document.querySelector('.mistake-card .mistake-retry-slot')?.children.length > 0"
            poll(ctx.page, poll_expr)
            # Answer correctly: for multipleChoice (read5) click the right option letter
            opts = retry_slot.locator(".optbtn")
            if opts.count() > 0:
                opts.nth(q["answer"]).click()
            else:
                gi = retry_slot.locator(".gap-input")
                if gi.count() > 0:
                    gi.fill(q.get("answers", [""])[0] if "answers" in q else "")
            retry_slot.locator("button", has_text="Check").click()
            resolved_text = poll(
                ctx.page,
                "document.querySelector('.mistake-card .mistake-retry-slot')?.textContent.includes('resolved')",
            )
            record("mistakes: retry resolves the mistake", bool(resolved_text))
        else:
            record("mistakes: retry resolves the mistake", False, "no Retry button found")
        ctx.check_clean("override/mistakes")
    except Exception as e:  # noqa: BLE001
        record("override + mistakes flow", False, str(e))
    finally:
        ctx.close()


def test_flashcards(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        ctx.goto_hash("/flashcards")
        poll(ctx.page, "document.querySelectorAll('.set-list a.set-row').length > 0")
        rows = ctx.page.locator(".set-list a.set-row")
        target_href = None
        for i in range(rows.count()):
            row = rows.nth(i)
            meta = row.locator(".set-row-score").inner_text()
            if not meta.startswith("0 "):
                target_href = row.get_attribute("href")
                break
        record("flashcards: a deck with due cards exists", target_href is not None)
        if target_href:
            ctx.page.evaluate("(h) => { location.hash = h.replace(/^#/, ''); }", target_href)
            poll(ctx.page, "!!document.querySelector('#flashcard')")
            ctx.page.click("#flashcard")
            poll(ctx.page, "document.querySelector('.rate-row')?.hidden === false")
            ctx.page.click('.rate-row button[data-r="3"]')
            time.sleep(0.2)
            srs = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.flashcards.fce') || '{}').srs || {}")
            record("flashcards: rating schedules a due date", len(srs) > 0, json.dumps(srs)[:200])
        ctx.check_clean("flashcards")
    except Exception as e:  # noqa: BLE001
        record("flashcards flip + rate", False, str(e))
    finally:
        ctx.close()


def test_vocab_quiz(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        ctx.goto_hash("/vocab-quiz")
        poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
        block = ctx.page.locator(".qblock").first
        definition = block.locator(".mistake-explanation").inner_text()
        with open(FIXTURES / "fce" / "vocab.json", encoding="utf-8") as f:
            vocab = json.load(f)["words"]
        match = next((w for w in vocab if w["definition"] == definition), None)
        record("vocab quiz: question renders with a known definition", match is not None, definition[:80])
        if match:
            opt = block.locator(".optbtn", has_text=re.compile(rf"^{re.escape(match['word'])}$"))
            if opt.count() == 0:
                opt = block.locator(".optbtn", has_text=match["word"])
            opt.first.click()
            block.locator("button", has_text="Check").click()
            poll(ctx.page, "document.querySelector('.qblock .fb-slot')?.textContent.length > 0")
            fb_text = block.locator(".fb-slot").inner_text()
            record("vocab quiz: check shows feedback", "Correct" in fb_text or "correct" in fb_text, fb_text[:120])
            next_btn = block.locator("button", has_text=re.compile("Next|See results"))
            if next_btn.count() > 0:
                next_btn.first.click()
                poll(ctx.page, "document.querySelector('.player-progress')?.textContent.includes('2')")
        ctx.check_clean("vocab quiz")
    except Exception as e:  # noqa: BLE001
        record("vocab quiz", False, str(e))
    finally:
        ctx.close()


def test_practice_test(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        with open(FIXTURES / "fce" / "tests.json", encoding="utf-8") as f:
            tests_data = json.load(f)
        test_meta = tests_data["tests"][0]
        test_id = test_meta["id"]
        first_set_id = test_meta["sets"][0]
        first_part = re.match(r"^[a-z]+-([a-z0-9]+)-\d+$", first_set_id).group(1)
        first_set = load_fixture("fce", first_part)["sets"][0]
        assert first_set["id"] == first_set_id, "fixture/tests.json set id mismatch"

        ctx.goto_hash(f"/tests/{test_id}")
        poll(ctx.page, "!!document.querySelector('.timer-clock')")
        ctx.page.click('button:has-text("Start / resume")')
        time.sleep(0.3)

        panel = ctx.page.locator(".paper-panel:not([hidden]) .player-questions")
        b1 = qblock(panel, 1)
        q1 = first_set["questions"][0]
        set_answer(b1, first_set, q1, correct=True)

        time.sleep(2.5)  # let >=2 autosave ticks happen
        seconds_before_reload = ctx.page.evaluate(
            f"JSON.parse(localStorage.getItem('fcecae.teststate.fce.{test_id}') || '{{}}').secondsLeft"
        )
        record("practice test: autosave recorded a countdown", isinstance(seconds_before_reload, int)
               and seconds_before_reload < test_meta["minutes"] * 60, f"seconds={seconds_before_reload}")

        ctx.page.reload(wait_until="load")
        poll(ctx.page, "!!document.querySelector('.timer-clock')")
        panel2 = ctx.page.locator(".paper-panel:not([hidden]) .player-questions")
        b1b = qblock(panel2, 1)
        still_answered = True
        t = first_set["type"]
        try:
            if t in ("mcCloze", "multipleChoice"):
                still_answered = "optbtn-selected" in (b1b.locator(".optbtn").nth(q1["answer"]).get_attribute("class") or "")
            elif t in ("openCloze", "wordFormation", "transformation"):
                still_answered = b1b.locator(".gap-input").input_value() == q1.get("answers", [""])[0]
            elif t == "gappedText":
                still_answered = b1b.locator("select").input_value() == q1["answer"]
        except Exception:
            still_answered = False
        record("practice test: reload resumes saved answers", still_answered)

        ctx.page.click('button:has-text("Submit test")')
        poll(ctx.page, "!!document.querySelector('.results-score')")
        score_text = ctx.page.locator(".results-score").inner_text()
        record("practice test: submit shows weighted score", bool(re.match(r"\d+\s*/\s*\d+", score_text)), score_text)

        history = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.history.tests.fce') || '[]')")
        record("practice test: result saved to history", len(history) >= 1)
        ctx.check_clean("practice test")
    except Exception as e:  # noqa: BLE001
        record("practice test flow", False, str(e))
    finally:
        ctx.close()


def test_evaluation(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        with open(FIXTURES / "fce" / "evaluation.json", encoding="utf-8") as f:
            eval_data = json.load(f)
        if not eval_data.get("sets"):
            record("evaluation test flow", False, "no sets in evaluation fixture")
            return
        first_set = eval_data["sets"][0]

        ctx.goto_hash("/evaluation")
        poll(ctx.page, "!!document.querySelector('button')")
        start_btn = ctx.page.locator("button", has_text=re.compile("Start|Retake"))
        start_btn.first.click()
        poll(ctx.page, "!!document.querySelector('.timer-clock')")
        ctx.page.click('button:has-text("Start / resume")')
        time.sleep(0.3)

        panel = ctx.page.locator(".paper-panel:not([hidden]) .player-questions")
        b1 = qblock(panel, 1)
        q1 = first_set["questions"][0]
        set_answer(b1, first_set, q1, correct=True)

        ctx.page.click('button:has-text("Submit evaluation")')
        poll(ctx.page, "!!document.querySelector('.results-score')")
        score_text = ctx.page.locator(".results-score").inner_text()
        record("evaluation: submit shows score", bool(re.match(r"\d+\s*/\s*\d+", score_text)), score_text)
        band = ctx.page.locator(".band-note").inner_text()
        record("evaluation: shows an indicative, flagged-as-estimate level statement",
               "stimate" in band, band[:120])
        ctx.check_clean("evaluation")
    except Exception as e:  # noqa: BLE001
        record("evaluation test flow", False, str(e))
    finally:
        ctx.close()


def test_import(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        ctx.goto_hash("/import")
        poll(ctx.page, "!!document.querySelector('#import-paste')")

        example = (ROOT / "docs" / "import-example.json").read_text(encoding="utf-8")
        ctx.page.fill("#import-paste", example)
        ctx.page.click("#validate-btn")
        poll(ctx.page, "document.querySelector('#import-result')?.textContent.length > 0")
        result_text = ctx.page.locator("#import-result").inner_text()
        record("import: valid file validates successfully", "Looks good" in result_text, result_text[:150])
        save_btn = ctx.page.locator("#save-import-btn")
        if save_btn.count() > 0:
            save_btn.click()
            poll(ctx.page, "document.querySelector('#import-result')?.textContent.includes('Imported')")
            imported = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.imported.fce') || '[]')")
            record("import: saved set appears in storage", any(s.get("id") == "fce-own-01" for s in imported))

        ctx.page.fill("#import-paste", "{not valid json")
        ctx.page.click("#validate-btn")
        poll(ctx.page, "document.querySelector('#import-result')?.textContent.length > 0")
        bad_text = ctx.page.locator("#import-result").inner_text()
        record("import: invalid JSON is rejected with a message", "valid JSON" in bad_text or "Not valid" in bad_text,
               bad_text[:150])

        ctx.page.fill("#import-paste", json.dumps({"level": "fce", "sets": [{"id": "x", "type": "mcCloze"}]}))
        ctx.page.click("#validate-btn")
        poll(ctx.page, "document.querySelector('#import-result')?.textContent.length > 0")
        schema_bad_text = ctx.page.locator("#import-result").inner_text()
        record("import: schema-invalid content is rejected with details",
               "problem" in schema_bad_text.lower(), schema_bad_text[:200])
        ctx.check_clean("import")
    except Exception as e:  # noqa: BLE001
        record("import valid+invalid JSON", False, str(e))
    finally:
        ctx.close()


def test_backup_restore(browser, base, tmp_path):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        ctx.set_level("fce")
        # create a little bit of real state first
        data = load_fixture("fce", "uoe1")
        set_obj = data["sets"][0]
        ctx.goto_hash(f"/exercises/uoe1/{set_obj['id']}")
        poll(ctx.page, "document.querySelectorAll('.qblock').length > 0")
        b1 = qblock(ctx.page.locator(".player-questions"), 1)
        set_answer(b1, set_obj, set_obj["questions"][0], correct=True)
        check_block(b1)

        ctx.goto_hash("/import")
        poll(ctx.page, "!!document.querySelector('#backup-btn')")
        with ctx.page.expect_download() as dl_info:
            ctx.page.click("#backup-btn")
        download = dl_info.value
        backup_path = tmp_path / "backup.json"
        download.save_as(str(backup_path))
        backup_obj = json.loads(backup_path.read_text(encoding="utf-8"))
        has_progress = any(k.startswith("fcecae.progress.") for k in backup_obj.get("data", {}))
        record("backup: download contains fcecae.* progress data", has_progress, list(backup_obj.get("data", {}).keys())[:5])

        # wipe local storage, then restore from the backup file
        ctx.page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('fcecae.')).forEach(k=>localStorage.removeItem(k))")
        # #level-switch is static header chrome present even pre-reload, so poll()ing for it
        # would race the actual navigation — wait for the real reload event instead.
        with ctx.page.expect_navigation(timeout=10000):
            ctx.page.set_input_files("#restore-file", str(backup_path))
        poll(ctx.page, "!!document.querySelector('#level-switch button')", timeout=10)
        restored_progress = ctx.page.evaluate("JSON.parse(localStorage.getItem('fcecae.progress.fce') || 'null')")
        record("restore: progress data restored after reload", restored_progress is not None)
        ctx.check_clean("backup/restore")
    except Exception as e:  # noqa: BLE001
        record("backup + restore", False, str(e))
    finally:
        ctx.close()


def test_reset_only_own_keys(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        active = poll(
            ctx.page,
            "navigator.serviceWorker.getRegistration('./').then(r => !!(r && r.active && r.active.state === 'activated'))",
            timeout=20,
        )
        record("reset: service worker reaches 'activated'", bool(active))

        ctx.page.evaluate("localStorage.setItem('docket.x', '1')")
        ctx.page.evaluate(
            "caches.open('docket-shell-1').then(c => c.put('/fce-cae/foreign.txt', new Response('hi')))"
        )
        ctx.page.evaluate("localStorage.setItem('fcecae.settings', JSON.stringify({level:'fce', theme:'system', textSize:2, newCardsPerDay:15}))")

        foreign_key_before = ctx.page.evaluate("localStorage.getItem('docket.x')")
        foreign_cache_before = ctx.page.evaluate("caches.keys().then(ks => ks.includes('docket-shell-1'))")
        record("reset: foreign key/cache present before reset", foreign_key_before == "1" and foreign_cache_before)

        ctx.goto_hash("/import")
        poll(ctx.page, "!!document.querySelector('#reset-btn')")
        with ctx.page.expect_navigation(timeout=10000):
            ctx.page.click("#reset-btn")  # dialog auto-accepted by Ctx
        poll(ctx.page, "!!document.querySelector('#level-switch button')", timeout=10)  # reloaded

        foreign_key_after = ctx.page.evaluate("localStorage.getItem('docket.x')")
        foreign_cache_after = ctx.page.evaluate("caches.keys().then(ks => ks.includes('docket-shell-1'))")
        record("reset: foreign localStorage key survives", foreign_key_after == "1")
        record("reset: foreign cache survives", bool(foreign_cache_after))

        remaining_fcecae = ctx.page.evaluate(
            "Object.keys(localStorage).filter(k => k.startsWith('fcecae.')).length"
        )
        record("reset: removes fcecae.* keys", remaining_fcecae == 0, f"remaining={remaining_fcecae}")
        ctx.check_clean("reset")
    except Exception as e:  # noqa: BLE001
        record("reset removes only fcecae.*", False, str(e))
    finally:
        ctx.close()


def test_offline_reload(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        poll(
            ctx.page,
            "navigator.serviceWorker.getRegistration('./').then(r => !!(r && r.active && r.active.state === 'activated'))",
            timeout=20,
        )
        ctx.page.reload(wait_until="load")  # this load should now be SW-controlled
        poll(ctx.page, "!!navigator.serviceWorker.controller", timeout=10)

        ctx.context.set_offline(True)
        try:
            ctx.page.reload(wait_until="load", timeout=8000)
            brand = ctx.page.locator(".brand-name")
            brand.wait_for(state="visible", timeout=8000)
            record("offline: reload still renders the app shell", brand.count() > 0)
        except Exception as e:  # noqa: BLE001
            record("offline: reload still renders the app shell", False, f"timed out / errored: {e}")
        finally:
            ctx.context.set_offline(False)
        ctx.check_clean("offline reload")
    except Exception as e:  # noqa: BLE001
        record("offline reload after SW install", False, str(e))
    finally:
        ctx.close()


def start_server(fixtures, port=0):
    args = [sys.executable, str(ROOT / "tests" / "serve.py")]
    if fixtures:
        args.append("--fixtures")
    if port:
        args += ["--port", str(port)]
    proc = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    base = None
    start = time.time()
    while time.time() - start < 10:
        line = proc.stdout.readline()
        if not line:
            continue
        print("[serve]", line.strip())
        m = re.search(r"(http://127\.0\.0\.1:\d+/fce-cae/)", line)
        if m:
            base = m.group(1)
            break
    if not base:
        print("ERROR: server did not print its URL in time", file=sys.stderr)
        proc.terminate()
        sys.exit(1)
    return proc, base


def stop_server(proc):
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except Exception:  # noqa: BLE001
        proc.kill()


REAL_DATA = ROOT / "data"


def test_real_data_no_overflow(browser, real_base):
    """Round-1 review: every real gappedText set overflowed at 390px. Crawl every real
    gappedText set (both levels) at a phone width and assert no horizontal overflow."""
    sizes = [(360, 740), (390, 844)]
    for level, part in [("fce", "read6"), ("cae", "read7")]:
        path = REAL_DATA / level / f"{part}.json"
        if not path.exists():
            record(f"real data: {level}/{part}.json present", False, "missing — skipped overflow crawl")
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for s in data.get("sets", []):
            for (w, h) in sizes:
                context = browser.new_context(viewport={"width": w, "height": h})
                page = context.new_page()
                try:
                    page.goto(real_base, wait_until="load")
                    poll(page, "!!document.querySelector('#level-switch button')")
                    if level == "cae":
                        page.click('#level-switch button:has-text("CAE")')
                        poll(page, "document.querySelector('#level-switch button.segmented-btn-active')?.textContent.trim() === 'CAE'")
                    page.evaluate("(p) => { location.hash = p; }", f"/exercises/{part}/{s['id']}")
                    poll(page, "document.querySelectorAll('.qblock').length > 0")
                    overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                    record(f"real gappedText {level}/{s['id']} @ {w}x{h}: no horizontal overflow",
                           overflow <= 0, f"overflow={overflow}px")
                except Exception as e:  # noqa: BLE001
                    record(f"real gappedText {level}/{s['id']} @ {w}x{h}", False, str(e))
                finally:
                    context.close()


# ---------------------------------------------------------------------------
# Training drills and level estimate (run against REAL data: the pool and bank are real)
# ---------------------------------------------------------------------------

def norm_ws(t):
    return " ".join(t.split())


def answer_map(page, level="fce"):
    rows = page.evaluate(
        """async (level) => {
          const t = await import('./js/training.js');
          const pool = await t.buildPool(level);
          return pool.map((it) => ({
            ctx: it.type === 'transformation' ? it.q.first : it.context,
            type: it.type,
            ans: it.type === 'mcCloze' ? it.q.options[it.q.answer] : it.q.answers[0],
          }));
        }""",
        level,
    )
    return {norm_ws(r["ctx"]): r for r in rows}


def answer_cards(page, amap, wrong=()):
    """Answer every .train-card from the answer map; indexes in `wrong` get a wrong answer."""
    cards = page.locator(".train-card")
    for i in range(cards.count()):
        card = cards.nth(i)
        entry = amap[norm_ws(card.locator(".train-context").inner_text())]
        if entry["type"] == "mcCloze":
            opts = card.locator(".optbtn")
            texts = [norm_ws(opts.nth(k).inner_text())[3:] for k in range(opts.count())]
            right = texts.index(entry["ans"])
            opts.nth((right + 1) % len(texts) if i in wrong else right).click()
        else:
            card.locator("input").fill("zzzqqnotaword" if i in wrong else entry["ans"])


def test_training(browser, base):
    ctx = Ctx(browser, base)
    page = ctx.page
    try:
        ctx.goto_home()
        ctx.goto_hash("/training")
        poll(page, "!!document.querySelector('[data-focus]')")
        record("training: six focus options on the setup page", page.locator("[data-focus]").count() == 6,
               str(page.locator("[data-focus]").count()))
        record("training: weak-areas focus is disabled until there is history",
               page.locator('[data-focus="weak"]').is_disabled())
        record("training: linked from Practise and Home",
               'href="#/training"' in page.evaluate("fetch('js/views/practise.js').then(r => r.text())")
               and 'href="#/training"' in page.evaluate("fetch('js/views/home.js').then(r => r.text())"))

        amap = answer_map(page)
        pool_n = page.evaluate("import('./js/training.js').then(t => t.buildPool('fce')).then(p => p.length)")
        record("training: pool is built from real UoE content", pool_n >= 100, f"pool={pool_n}")
        gaps_ok = page.evaluate(
            """import('./js/training.js').then((t) => t.buildPool('fce')).then((pool) => pool.filter(
              (it) => it.type !== 'transformation' && (!it.context.includes('_____') || /\\{\\{/.test(it.context))).length)"""
        )
        record("training: every drill sentence has exactly its own gap and no raw markers", gaps_ok == 0, f"bad={gaps_ok}")

        # --- drill 1: blank submit -> everything wrong, saved to the notebook
        page.click('[data-length="10"]')
        page.click("#train-start")
        poll(page, "document.querySelectorAll('.train-card').length === 10")
        record("training: a 10-question drill renders 10 cards", True)
        page.click(".submit-training-btn")
        poll(page, "!!document.querySelector('#train-score')")
        record("training: blank submit scores 0 / 10", norm_ws(page.locator("#train-score").inner_text()) == "0 / 10")
        record("training: feedback shown on every card", page.locator(".train-card .feedback-incorrect").count() == 10)
        mistakes = page.evaluate("JSON.parse(localStorage.getItem('fcecae.mistakes.fce') || '[]')")
        record("training: wrong answers saved with explanation + source",
               len(mistakes) == 10 and all(m["source"] == "training" and m["explanation"] and m["context"] for m in mistakes),
               f"n={len(mistakes)}")

        # --- drill 2 via Train again: answer 8 right, 2 wrong
        page.click("#train-again")
        poll(page, "document.querySelectorAll('.train-card').length === 10 && !document.querySelector('#train-score')")
        answer_cards(page, amap, wrong={0, 1})
        record("training: answered counter updates", "10 of 10" in page.locator(".timer-clock").inner_text())
        page.click(".submit-training-btn")
        poll(page, "!!document.querySelector('#train-score')")
        score = norm_ws(page.locator("#train-score").inner_text())
        record("training: 8 right + 2 wrong scores 8 / 10", score == "8 / 10", score)

        # override: typed wrong answer can be counted
        typed_wrong = page.locator(".train-card .feedback-incorrect .override-btn")
        if typed_wrong.count():
            typed_wrong.first.click()
            record("training: 'count my answer as correct' raises the score",
                   norm_ws(page.locator("#train-score").inner_text()) == "9 / 10")
        else:
            record("training: override button available on a typed miss", True, "both misses were multiple choice")

        # --- progress / weak focus after history exists
        ctx.goto_hash("/")
        ctx.goto_hash("/training")
        poll(page, "!!document.querySelector('[data-focus]')")
        record("training: weak-areas focus unlocks once there are open mistakes",
               not page.locator('[data-focus="weak"]').is_disabled())
        record("training: recent drills listed", page.locator(".plain-list li").count() >= 2)

        # --- focused drill + timer
        page.click('[data-focus="wordFormation"]')
        page.click('[data-length="15"]')
        page.check("#train-timed")
        page.click("#train-start")
        poll(page, "document.querySelectorAll('.train-card').length > 0")
        n_cards = page.locator(".train-card").count()
        stems = page.locator(".train-card .transform-keyword").count()
        record("training: word-formation focus gives only word-formation cards (15 asked)",
               n_cards == 15 and stems == 15, f"cards={n_cards} stems={stems}")
        clock = page.locator(".timer-warn").inner_text()
        record("training: timed mode shows a countdown (15 min)", re.match(r"1[45]:\d\d", clock) is not None, clock)

        # --- layout at phone width
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(0.2)
        overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
        record("training: no horizontal overflow at 390px", overflow <= 0, f"overflow={overflow}")
        ctx.check_clean("training")
    except Exception as e:  # noqa: BLE001
        record("training flow", False, str(e))
    finally:
        ctx.close()


def test_training_logic(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        res = ctx.page.evaluate(
            """async () => {
              const t = await import('./js/training.js');
              const mk = (id, n) => ({ key: id + '::' + n, setId: id, tag: 'x' });
              const pool = []; for (let s = 0; s < 4; s++) for (let n = 1; n <= 8; n++) pool.push(mk('s' + s, n));
              const out = {};
              const first = t.pickItems(pool, 10, {});
              out.size = first.length;
              out.unique = new Set(first.map((i) => i.key)).size;
              out.capped = t.pickItems(pool.slice(0, 3), 10, {}).length;
              // 20 'seen right' vs 12 unseen: unseen should dominate a 10-draw on average
              const seen = {}; pool.slice(0, 20).forEach((i) => { seen[i.key] = { r: 1 }; });
              let unseen = 0; for (let k = 0; k < 200; k++) unseen += t.pickItems(pool, 10, seen).filter((i) => !seen[i.key]).length;
              out.unseenShare = unseen / 2000;
              const seenWrong = {}; pool.slice(0, 16).forEach((i) => { seenWrong[i.key] = { r: 0 }; });
              const seenRight = {}; pool.slice(0, 16).forEach((i) => { seenRight[i.key] = { r: 1 }; });
              let w = 0, r = 0;
              for (let k = 0; k < 200; k++) {
                w += t.pickItems(pool, 6, Object.assign({}, seenWrong, Object.fromEntries(pool.slice(16).map((i) => [i.key, { r: 1 }])))).filter((i) => seenWrong[i.key]).length;
                r += t.pickItems(pool, 6, Object.assign({}, seenRight, Object.fromEntries(pool.slice(16).map((i) => [i.key, { r: 0 }])))).filter((i) => seenRight[i.key]).length;
              }
              out.wrongPreferred = w > r;
              out.timeLimit = t.timeLimitSeconds([{ type: 'mcCloze' }, { type: 'transformation' }]);
              out.ctx = t.gapContext({ type: 'openCloze', text: ['First one here. The thing {{1}} we saw was odd, said {{2}} guide.'],
                questions: [{ n: 1, answers: ['that'], tag: 'relative-clause' }, { n: 2, answers: ['the'], tag: 'article-determiner' }] }, 1);
              return out;
            }"""
        )
        record("training logic: picks the requested number, no duplicates", res["size"] == 10 and res["unique"] == 10, str(res))
        record("training logic: small pool is not over-drawn", res["capped"] == 3)
        record("training logic: unseen questions are favoured over answered-correctly ones", res["unseenShare"] > 0.4, f"{res['unseenShare']:.2f}")
        record("training logic: previously-wrong questions are favoured over previously-right ones", res["wrongPreferred"])
        record("training logic: time limit = 60s + 120s for transformation", res["timeLimit"] == 180)
        record("training logic: gap sentence includes lead-in and fills other gaps",
               res["ctx"] == "First one here. The thing _____ we saw was odd, said the guide.", res["ctx"])
    except Exception as e:  # noqa: BLE001
        record("training logic", False, str(e))
    finally:
        ctx.close()


LEVEL_LOGIC_JS = """async () => {
  const p = await import('./js/placement.js');
  const bank = await p.loadPlacement();
  const B = (cefr, correct) => ({ cefr, correct, total: 8 });
  const out = {};
  out.next = [
    p.nextLevel([]), p.nextLevel([B('B2', 6)]), p.nextLevel([B('B2', 5)]),
    p.nextLevel([B('B2', 6), B('C1', 6)]), p.nextLevel([B('B2', 6), B('C1', 5)]),
    p.nextLevel([B('B2', 6), B('C1', 6), B('C2', 8)]), p.nextLevel([B('B2', 2), B('B1', 8)]),
  ];
  const e = (...b) => { const r = p.estimate(b); return r.level + (r.close ? '~' + r.close : ''); };
  out.est = [
    e(B('B2', 8), B('C1', 7), B('C2', 6)), e(B('B2', 8), B('C1', 7), B('C2', 5)), e(B('B2', 7), B('C1', 5)),
    e(B('B2', 7), B('C1', 2)), e(B('B2', 3), B('B1', 7)), e(B('B2', 5), B('B1', 6)), e(B('B2', 3), B('B1', 5)), e(B('B2', 2), B('B1', 2)),
  ];
  const ids = p.drawBlock(bank.items, 'C1');
  const items = ids.map((id) => bank.items.find((i) => i.id === id));
  out.block = { n: ids.length, unique: new Set(ids).size, allC1: items.every((i) => i.cefr === 'C1'),
    grammar: items.filter((i) => i.skill === 'grammar').length };
  const again = p.drawBlock(bank.items, 'C1', ids);
  out.exclude = again.length === 4 && again.every((id) => !ids.includes(id));
  out.bank = ['B1', 'B2', 'C1', 'C2'].map((c) => bank.items.filter((i) => i.cefr === c).length);
  out.scale = p.SCALE;
  out.rec = [p.recommendation('B2').exam, p.recommendation('C1').exam, p.recommendation('Below B1').exam];
  return out;
}"""


def test_level_logic(browser, base):
    ctx = Ctx(browser, base)
    try:
        ctx.goto_home()
        r = ctx.page.evaluate(LEVEL_LOGIC_JS)
        record("level logic: ladder routes B2 -> C1/B1 and stops at the ends",
               r["next"] == ["B2", "C1", "B1", "C2", None, None, None], str(r["next"]))
        record("level logic: estimates, borderline flags and 'Below B1'",
               r["est"] == ["C2", "C1~C2", "B2~C1", "B2", "B1", "B1~B2", "Below B1~B1", "Below B1"], str(r["est"]))
        record("level logic: a block is 8 unique items of one level, half grammar",
               r["block"] == {"n": 8, "unique": 8, "allC1": True, "grammar": 4}, str(r["block"]))
        record("level logic: a second draw avoids already-used items", r["exclude"])
        record("level logic: bank has at least 10 items per level", all(n >= 10 for n in r["bank"]), str(r["bank"]))
        record("level logic: Cambridge English Scale ranges (B1 140-159 ... C2 200-230)",
               r["scale"] == {"B1": [140, 159], "B2": [160, 179], "C1": [180, 199], "C2": [200, 230]})
        record("level logic: recommended exam", r["rec"] == ["fce", "cae", "fce"], str(r["rec"]))
    except Exception as e:  # noqa: BLE001
        record("level logic", False, str(e))
    finally:
        ctx.close()


def bank_by_stem(page):
    items = page.evaluate("import('./js/placement.js').then(p => p.loadPlacement()).then(b => b.items)")
    return {norm_ws(i["stem"].replace("___", "")): i for i in items}


def run_level(page, by_stem, mode):
    """Answer the whole estimate. mode: 'all-right' | 'unsure'. Returns number of questions asked."""
    asked = 0
    while True:
        poll(page, "!!document.querySelector('.lvl-card') || !!document.querySelector('#lvl-level')")
        if page.locator("#lvl-level").count():
            return asked
        stem = norm_ws(page.locator(".lvl-card .train-context").inner_text())
        asked += 1
        if mode == "unsure":
            page.click("#lvl-unsure")
        else:
            page.locator(".lvl-card .optbtn").nth(by_stem[stem]["answer"]).click()
        time.sleep(0.05)


def test_level_estimate(browser, base):
    ctx = Ctx(browser, base)
    page = ctx.page
    try:
        ctx.goto_home()
        ctx.goto_hash("/level")
        poll(page, "!!document.querySelector('#lvl-start')")
        record("level: intro explains grammar/vocabulary-only scope",
               "grammar and vocabulary only" in page.locator(".page-level").inner_text())
        by_stem = bank_by_stem(page)

        # resume after reload
        page.click("#lvl-start")
        poll(page, "!!document.querySelector('.lvl-card')")
        for _ in range(3):
            page.click("#lvl-unsure")
            time.sleep(0.05)
        page.reload(wait_until="load")
        poll(page, "!!document.querySelector('#lvl-progress')")
        record("level: resumes at question 4 after a reload", "question 4 of 8" in page.locator("#lvl-progress").inner_text(),
               page.locator("#lvl-progress").inner_text())

        # weak path: never sure -> B2 fail, B1 fail -> Below B1 after 16 questions
        asked = 1 + run_level(page, by_stem, "unsure")
        # first 3 + the one currently shown were answered inside run_level; recompute from state
        state = page.evaluate("JSON.parse(localStorage.getItem('fcecae.placement.state'))")
        total = sum(len(b["answers"]) for b in state["blocks"])
        record("level: all 'I don't know' ends after 16 questions at 'Below B1'",
               total == 16 and page.locator("#lvl-level").inner_text() == "Below B1",
               f"total={total} level={page.locator('#lvl-level').inner_text()}")
        record("level: below-B1 text does not claim a scale range", "below the Cambridge English Scale range" in page.locator(".lvl-result").inner_text())
        mistakes = page.evaluate("JSON.parse(localStorage.getItem('fcecae.mistakes.fce') || '[]')")
        record("level: missed items saved to the notebook with explanations",
               len(mistakes) == 16 and all(m["source"] == "level-estimate" and m["explanation"] for m in mistakes), f"n={len(mistakes)}")
        record("level: review lists all questions, misses open",
               page.locator(".lvl-item").count() == 16 and page.locator(".lvl-item[open]").count() == 16)

        # mistakes notebook can retry a level-estimate miss
        ctx.goto_hash("/mistakes")
        poll(page, "!!document.querySelector('.mistake-card')")
        page.locator(".mistake-card button:has-text('Retry')").first.click()
        poll(page, "!!document.querySelector('.mistake-retry-slot .optbtn')")
        record("level: a level-estimate mistake can be retried from the notebook",
               page.locator(".mistake-retry-slot .optbtn").count() == 4)

        # strong path
        ctx.goto_hash("/level")
        poll(page, "!!document.querySelector('#lvl-retake')")
        page.click("#lvl-retake")
        poll(page, "!!document.querySelector('#lvl-start')")
        page.click("#lvl-start")
        asked = run_level(page, by_stem, "all-right")
        record("level: all correct climbs B2 -> C1 -> C2 in 24 questions and reports C2",
               asked == 24 and page.locator("#lvl-level").inner_text() == "C2", f"asked={asked}")
        txt = page.locator(".lvl-result").inner_text()
        record("level: C2 result shows the 200–230 scale range and an estimate-only disclaimer",
               "200–230" in txt and "Estimate only" in txt)
        open_after = page.evaluate("JSON.parse(localStorage.getItem('fcecae.mistakes.fce') || '[]').filter(m => !m.resolved).length")
        record("level: all-correct run resolves earlier mistakes it re-asks (some of the 16 cleared)",
               open_after < 16, f"open={open_after}")
        hist = page.evaluate("JSON.parse(localStorage.getItem('fcecae.history.placement') || '[]')")
        record("level: results are kept in history", [h["level"] for h in hist] == ["C2", "Below B1"], str([h["level"] for h in hist]))

        # CTA switches the exam level
        page.click("#lvl-go")
        poll(page, "!!document.querySelector('#level-switch')")
        poll(page, "document.querySelector('#level-switch button.segmented-btn-active')?.textContent.trim() === 'CAE'")
        record("level: recommendation button switches to CAE", True)

        # phone layout, question + result
        page.set_viewport_size({"width": 390, "height": 844})
        ctx.goto_hash("/level")
        poll(page, "!!document.querySelector('#lvl-level')")
        record("level: result has no horizontal overflow at 390px",
               page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
        page.click("#lvl-retake")
        poll(page, "!!document.querySelector('#lvl-start')")
        page.click("#lvl-start")
        poll(page, "!!document.querySelector('.lvl-card')")
        record("level: question has no horizontal overflow at 390px",
               page.evaluate("document.documentElement.scrollWidth - window.innerWidth") <= 0)
        ctx.check_clean("level estimate")
    except Exception as e:  # noqa: BLE001
        record("level estimate flow", False, str(e))
    finally:
        ctx.close()


def main():
    import argparse
    import tempfile

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args()

    print("Building sw.js from the working tree (--from-fs, test-only mode)...")
    subprocess.run([sys.executable, str(ROOT / "tools" / "build_sw.py"), "--from-fs"], cwd=ROOT, check=True)

    serve_proc, base = start_server(fixtures=True, port=args.port)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        with sync_playwright() as p:
            browser = p.chromium.launch()
            try:
                try:
                    test_level_switch_persists(browser, base)
                    test_player_types_fce(browser, base)
                    test_player_type_cae_crosstext(browser, base)
                    test_override_and_mistakes(browser, base)
                    test_flashcards(browser, base)
                    test_vocab_quiz(browser, base)
                    test_practice_test(browser, base)
                    test_evaluation(browser, base)
                    test_import(browser, base)
                    test_backup_restore(browser, base, tmp_path)
                    test_reset_only_own_keys(browser, base)
                    test_offline_reload(browser, base)
                finally:
                    stop_server(serve_proc)

                # Round-1 review: re-run the overflow check against REAL content
                # (output/data/), not just the fixtures — serve.py without --fixtures.
                real_proc, real_base = start_server(fixtures=False)
                try:
                    test_real_data_no_overflow(browser, real_base)
                    test_training_logic(browser, real_base)
                    test_training(browser, real_base)
                    test_level_logic(browser, real_base)
                    test_level_estimate(browser, real_base)
                finally:
                    stop_server(real_proc)
            finally:
                browser.close()

    passed = sum(1 for _, ok, _ in RESULTS if ok)
    failed = sum(1 for _, ok, _ in RESULTS if not ok)
    print(f"\n{passed} passed, {failed} failed, {len(RESULTS)} total")
    if failed:
        print("\nFailed checks:")
        for name, ok, detail in RESULTS:
            if not ok:
                print(f"  - {name}: {detail}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
