#!/usr/bin/env python3
"""Validate data/<level>/*.json against docs/CONTENT_SPEC.md.

Usage: python3 tools/validate_content.py [data_dir]   (default: data/)
Exit code 0 = valid, 1 = errors (printed). Missing files are reported as warnings so the
validator can run on partial content; pass --strict to treat them as errors.
"""
import json, re, sys
from pathlib import Path

TAGS = set("""collocation phrasal-verb idiom fixed-phrase linking preposition verb-pattern tense modal
passive conditional reported-speech relative-clause article-determiner comparison quantifier
pronoun-reference word-formation-noun word-formation-adjective word-formation-adverb
word-formation-verb word-formation-negative meaning-in-context detail inference attitude-opinion
purpose-function reference main-idea text-structure cohesion""".split())
POS = {"noun", "verb", "adjective", "adverb", "phrasal verb", "idiom", "collocation", "linking word", "preposition"}

PARTS = {
    "fce": {"uoe1": "mcCloze", "uoe2": "openCloze", "uoe3": "wordFormation", "uoe4": "transformation",
            "read5": "multipleChoice", "read6": "gappedText", "read7": "multipleMatching"},
    "cae": {"uoe1": "mcCloze", "uoe2": "openCloze", "uoe3": "wordFormation", "uoe4": "transformation",
            "read5": "multipleChoice", "read6": "crossText", "read7": "gappedText", "read8": "multipleMatching"},
}
QCOUNT = {"mcCloze": 8, "openCloze": 8, "wordFormation": 8, "transformation": 6, "multipleChoice": 6,
          "gappedText": 6, "crossText": 4, "multipleMatching": 10}
GAP = re.compile(r"\{\{(\d+)\}\}")

errors, warnings = [], []
all_ids = {}


def err(where, msg):
    errors.append(f"{where}: {msg}")


def is_str(x):
    return isinstance(x, str) and x.strip() != ""


def words(text):
    return len(re.findall(r"[A-Za-z0-9'’-]+", " ".join(text) if isinstance(text, list) else text))


def check_paras(where, text):
    if not (isinstance(text, list) and text and all(isinstance(p, str) for p in text)):
        err(where, "text must be a non-empty list of strings")
        return []
    return [int(m) for p in text for m in GAP.findall(p)]


def check_q_numbers(where, qs, expected):
    ns = [q.get("n") for q in qs]
    if ns != list(range(1, len(qs) + 1)):
        err(where, f"question numbers must be 1..{len(qs)} in order, got {ns}")
    if expected is not None and len(qs) != expected:
        err(where, f"expected {expected} questions, got {len(qs)}")


def check_tag(where, q):
    if q.get("tag") not in TAGS:
        err(where, f"bad/missing tag {q.get('tag')!r}")


def check_set(s, level, part, strict_count=True):
    sid = s.get("id", "?")
    where = f"{level}/{part}/{sid}"
    for f in ("id", "type", "title", "topic", "source"):
        if not is_str(s.get(f)):
            err(where, f"missing field {f}")
    if sid in all_ids:
        err(where, f"duplicate id (also in {all_ids[sid]})")
    all_ids[sid] = where
    t = s.get("type")
    if t not in QCOUNT:
        err(where, f"unknown type {t!r}")
        return
    qs = s.get("questions")
    if not isinstance(qs, list) or not qs:
        err(where, "questions missing")
        return
    check_q_numbers(where, qs, QCOUNT[t] if strict_count else None)
    for q in qs:
        qw = f"{where} q{q.get('n')}"
        check_tag(qw, q)

    if t in ("mcCloze", "openCloze", "wordFormation"):
        gaps = check_paras(where, s.get("text"))
        if sorted(gaps) != list(range(1, len(qs) + 1)) or gaps != sorted(gaps):
            err(where, f"gaps in text {gaps} don't match questions 1..{len(qs)} in order")

    if t in ("mcCloze", "multipleChoice"):
        for q in qs:
            qw = f"{where} q{q.get('n')}"
            o, w, a = q.get("options"), q.get("why"), q.get("answer")
            if not (isinstance(o, list) and len(o) == 4 and all(is_str(x) for x in o)):
                err(qw, "options must be 4 non-empty strings")
            elif len(set(x.strip().lower() for x in o)) != 4:
                err(qw, "duplicate options")
            if not (isinstance(w, list) and len(w) == 4 and all(is_str(x) for x in w)):
                err(qw, "why must be 4 non-empty strings")
            if a not in (0, 1, 2, 3):
                err(qw, "answer must be 0-3")
            if t == "multipleChoice" and not is_str(q.get("stem")):
                err(qw, "missing stem")
    if t == "multipleChoice" and part != "eval":
        check_paras(where, s.get("text"))
        lo, hi = (500, 760) if level == "fce" else (600, 900)
        n = words(s.get("text", []))
        if not lo <= n <= hi:
            err(where, f"text has {n} words, expected {lo}-{hi}")

    if t in ("openCloze", "wordFormation"):
        for q in qs:
            qw = f"{where} q{q.get('n')}"
            ans = q.get("answers")
            if not (isinstance(ans, list) and ans and all(is_str(x) for x in ans)):
                err(qw, "answers must be a non-empty list of strings")
                continue
            for x in ans:
                if x != x.lower() or " " in x.strip():
                    err(qw, f"answer {x!r} must be one lowercase word")
            if not is_str(q.get("explanation")):
                err(qw, "missing explanation")
            cw = q.get("commonWrong", {})
            if not isinstance(cw, dict) or any(k in ans for k in cw):
                err(qw, "commonWrong must be a dict whose keys are not correct answers")
            if t == "wordFormation":
                stem = q.get("stem")
                if not (is_str(stem) and stem == stem.upper()):
                    err(qw, "stem must be uppercase")
                elif any(stem.lower() == x for x in ans):
                    err(qw, "answer equals the stem unchanged")

    if t == "transformation":
        for q in qs:
            qw = f"{where} q{q.get('n')}"
            for f in ("first", "keyword", "after", "explanation"):
                if not is_str(q.get(f)):
                    err(qw, f"missing {f}")
            if not isinstance(q.get("before"), str):
                err(qw, "missing before (may be empty string)")
            kw = (q.get("keyword") or "").lower()
            for x in q.get("answers") or []:
                toks = x.replace("'", " ' ").replace("’", " ' ").split()
                n = len([w for w in x.replace("n't", " not").replace("'", " '").split()])
                if x != x.lower():
                    err(qw, f"answer {x!r} must be lowercase")
                expand = lambda s: s.replace("’", "'").replace("can't", "can not").replace("won't", "will not").replace("n't", " not")
                if kw not in x.replace("’", "'").split() and expand(kw) not in expand(x):
                    err(qw, f"answer {x!r} does not contain keyword {kw!r}")
                if not 2 <= n <= 5:
                    err(qw, f"answer {x!r} has {n} words (2-5)")
            if not q.get("answers"):
                err(qw, "answers missing")

    if t == "gappedText":
        gaps = check_paras(where, s.get("text"))
        if gaps != list(range(1, len(qs) + 1)):
            err(where, f"gaps {gaps} don't match questions")
        opts = s.get("options") or []
        ids = [o.get("id") for o in opts]
        if ids != list("ABCDEFG")[:len(qs) + 1] or not all(is_str(o.get("text")) for o in opts):
            err(where, f"options must be A..{'ABCDEFG'[len(qs)]} with text, got {ids}")
        used = [q.get("answer") for q in qs]
        if len(set(used)) != len(used) or not set(used) <= set(ids):
            err(where, f"answers must be distinct option letters, got {used}")
        extra = s.get("extra") or {}
        unused = sorted(set(ids) - set(used))
        if [extra.get("id")] != unused or not is_str(extra.get("explanation")):
            err(where, f"extra.id must be the unused letter {unused} with an explanation")
        for q in qs:
            if not is_str(q.get("explanation")):
                err(f"{where} q{q.get('n')}", "missing explanation")
        if level == "cae":
            for p in s.get("text", []):
                if GAP.search(p) and p.strip() != GAP.search(p).group(0):
                    err(where, "CAE gapped text: each gap must be its own paragraph '{{n}}'")

    if t in ("crossText", "multipleMatching"):
        secs = s.get("sections") or []
        ids = [x.get("id") for x in secs]
        want = 4 if t == "crossText" else None
        if want and len(secs) != want:
            err(where, "crossText needs 4 sections")
        if not 4 <= len(secs) <= 6 or ids != list("ABCDEF")[:len(secs)]:
            err(where, f"sections must be A.. in order (4-6), got {ids}")
        for x in secs:
            if not is_str(x.get("title")):
                err(where, f"section {x.get('id')} missing title")
            check_paras(f"{where} sec {x.get('id')}", x.get("text"))
        for q in qs:
            qw = f"{where} q{q.get('n')}"
            if q.get("answer") not in ids:
                err(qw, f"answer {q.get('answer')!r} not a section id")
            if not is_str(q.get("prompt")) or not is_str(q.get("explanation")):
                err(qw, "missing prompt/explanation")
        if t == "multipleMatching" and len(set(q.get("answer") for q in qs)) < len(secs):
            err(where, "every section should be the answer at least once")


GRAMMAR_TAGS = set("tense modal passive conditional reported-speech relative-clause article-determiner comparison quantifier pronoun-reference verb-pattern preposition linking".split())
VOCAB_TAGS = set("collocation phrasal-verb idiom fixed-phrase meaning-in-context".split())


def check_placement(root, strict):
    """data/level/placement.json: the level-estimate item bank (12 per CEFR level)."""
    p = root / "level" / "placement.json"
    if not p.exists():
        (errors if strict else warnings).append(f"missing {p}")
        return
    d = load(p)
    if d is None:
        return
    items = d.get("items") or []
    ids = set()
    by_level = {}
    for it in items:
        iid = it.get("id", "?")
        w = f"{p} {iid}"
        if iid in ids:
            err(w, "duplicate id")
        ids.add(iid)
        c = it.get("cefr")
        if c not in ("B1", "B2", "C1", "C2"):
            err(w, f"bad cefr {c!r}")
            continue
        if not re.fullmatch(rf"{c.lower()}-\d\d", str(iid)):
            err(w, f"id must be {c.lower()}-NN")
        by_level.setdefault(c, []).append(it)
        stem, opts, ans, why = it.get("stem"), it.get("options"), it.get("answer"), it.get("why")
        if not is_str(stem) or stem.count("___") != 1:
            err(w, "stem needs exactly one ___ gap")
        elif len(stem.split()) > 32:
            err(w, "stem too long (>32 words)")
        if not (isinstance(opts, list) and len(opts) == 4 and all(is_str(o) for o in opts) and len(set(o.lower() for o in opts)) == 4):
            err(w, "options must be 4 distinct non-empty strings")
            continue
        if ans not in (0, 1, 2, 3):
            err(w, "answer must be 0-3")
            continue
        if not (isinstance(why, list) and len(why) == 4 and all(is_str(x) for x in why)):
            err(w, "why must be 4 strings")
        elif not why[ans].lower().startswith("correct"):
            err(w, "the why for the correct option must start with 'Correct:'")
        if it.get("skill") not in ("grammar", "vocabulary"):
            err(w, "skill must be grammar or vocabulary")
        tag = it.get("tag")
        if tag not in TAGS:
            err(w, f"bad tag {tag!r}")
        elif (it.get("skill") == "grammar") != (tag in GRAMMAR_TAGS) or (it.get("skill") == "vocabulary") != (tag in VOCAB_TAGS):
            err(w, f"tag {tag!r} does not fit skill {it.get('skill')!r}")
    for c in ("B1", "B2", "C1", "C2"):
        lv = by_level.get(c, [])
        if len(lv) != 12:
            err(str(p), f"{c}: {len(lv)} items (need 12)")
            continue
        sk = [sum(i.get("skill") == s for i in lv) for s in ("grammar", "vocabulary")]
        if sk != [6, 6]:
            err(str(p), f"{c}: grammar/vocabulary split {sk} (need 6/6)")
        tags = {}
        for i in lv:
            tags[i.get("tag")] = tags.get(i.get("tag"), 0) + 1
        if max(tags.values()) > 3:
            err(str(p), f"{c}: a tag is used more than 3 times {tags}")
        good = [i for i in lv if i.get("answer") in (0, 1, 2, 3) and isinstance(i.get("options"), list) and len(i["options"]) == 4]
        pos = [i["answer"] for i in good]
        if any(pos.count(k) > 5 for k in range(4)):
            err(str(p), f"{c}: an answer position is used more than 5 times of 12 {[pos.count(k) for k in range(4)]}")
        if any(pos[k] == pos[k + 1] == pos[k + 2] for k in range(len(pos) - 2)):
            err(str(p), f"{c}: same answer position 3 times in a row")
        longest = sum(len(i["options"][i["answer"]]) > max(len(o) for k, o in enumerate(i["options"]) if k != i["answer"]) for i in good)
        if longest > 0.4 * len(good):
            err(str(p), f"{c}: correct option is the longest in {longest}/{len(good)} items (max 40%)")
    allpos = [i["answer"] for lv in by_level.values() for i in lv if i.get("answer") in (0, 1, 2, 3)]
    if len(allpos) == 48:
        for k in range(4):
            share = allpos.count(k) / 48
            if not 0.15 <= share <= 0.35:
                err(str(p), f"answer position {'ABCD'[k]} share {share:.0%} (need 15-35%)")


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        err(str(path), f"cannot parse JSON: {e}")
        return None


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    strict = "--strict" in sys.argv
    root = Path(args[0] if args else "data")
    for level, parts in PARTS.items():
        sets_by_id = {}
        for part, typ in parts.items():
            p = root / level / f"{part}.json"
            if not p.exists():
                (errors if strict else warnings).append(f"missing {p}")
                continue
            d = load(p)
            if d is None:
                continue
            if d.get("level") != level or d.get("part") != part:
                err(str(p), "level/part header mismatch")
            for s in d.get("sets") or []:
                if s.get("type") != typ:
                    err(str(p), f"set {s.get('id')} has type {s.get('type')}, expected {typ}")
                if not str(s.get("id", "")).startswith(f"{level}-{part}-"):
                    err(str(p), f"set id {s.get('id')} must start with {level}-{part}-")
                check_set(s, level, part)
                sets_by_id[s.get("id")] = s
            if not d.get("sets"):
                err(str(p), "no sets")
            if typ in ("mcCloze", "multipleChoice"):
                mc = [q for s in d.get("sets") or [] for q in s.get("questions") or []
                      if q.get("answer") in (0, 1, 2, 3) and isinstance(q.get("options"), list) and len(q["options"]) == 4]
                if len(mc) >= 8:
                    pos = [sum(q["answer"] == i for q in mc) for i in range(4)]
                    if max(pos) > 0.45 * len(mc) or min(pos) < 0.1 * len(mc):
                        err(str(p), f"answer positions unbalanced {pos} (test-wise learners can guess)")
                    longest = sum(len(q["options"][q["answer"]]) == max(len(o) for o in q["options"]) for q in mc)
                    if typ == "multipleChoice" and longest > 0.4 * len(mc):
                        err(str(p), f"correct option is the longest in {longest}/{len(mc)} questions (max 40%)")

        p = root / level / "vocab.json"
        if p.exists() and (d := load(p)) is not None:
            ws = d.get("words") or []
            if len(ws) < 150:
                (errors if strict else warnings).append(f"{p}: only {len(ws)} words (<150)")
            seen = set()
            for w in ws:
                wid = w.get("id", "?")
                for f in ("id", "word", "pos", "definition", "example", "topic"):
                    if not is_str(w.get(f)):
                        err(f"{p} {wid}", f"missing {f}")
                if w.get("pos") not in POS:
                    err(f"{p} {wid}", f"bad pos {w.get('pos')!r}")
                key = (w.get("word") or "").lower()
                if key in seen:
                    err(f"{p} {wid}", f"duplicate word {key!r}")
                seen.add(key)
                if wid in all_ids:
                    err(f"{p} {wid}", "duplicate id")
                all_ids[wid] = str(p)
                first = key.split()[0][:4] if key else ""
                if first and first not in (w.get("example") or "").lower():
                    err(f"{p} {wid}", "example does not contain the word")
        elif not p.exists():
            (errors if strict else warnings).append(f"missing {p}")

        p = root / level / "tests.json"
        if p.exists() and (d := load(p)) is not None:
            used = set()
            for t in d.get("tests") or []:
                for sid in t.get("sets") or []:
                    if sid not in sets_by_id:
                        err(f"{p} {t.get('id')}", f"unknown set {sid}")
                    if sid in used:
                        err(f"{p} {t.get('id')}", f"set {sid} used twice")
                    used.add(sid)
                want = [f"{level}-{part}-" for part in parts]
                got = [str(x)[: len(w)] for x, w in zip(t.get("sets") or [], want)]
                if got != want:
                    err(f"{p} {t.get('id')}", "sets must list one set per part, in part order")
                if t.get("minutes") != (75 if level == "fce" else 90):
                    err(f"{p} {t.get('id')}", "wrong minutes")
        elif not p.exists():
            (errors if strict else warnings).append(f"missing {p}")

        p = root / level / "evaluation.json"
        if p.exists() and (d := load(p)) is not None:
            n = 0
            for s in d.get("sets") or []:
                if not str(s.get("id", "")).startswith(f"{level}-eval-"):
                    err(str(p), f"eval set id {s.get('id')} must start with {level}-eval-")
                check_set(s, level, "eval", strict_count=False)
                n += len(s.get("questions") or [])
            if not 20 <= n <= 45:
                err(str(p), f"evaluation has {n} questions (20-45)")
        elif not p.exists():
            (errors if strict else warnings).append(f"missing {p}")

    check_placement(root, strict)

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{len(errors)} error(s), {len(warnings)} warning(s), {len(all_ids)} ids")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
