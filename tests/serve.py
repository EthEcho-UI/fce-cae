#!/usr/bin/env python3
"""Serve the app under /fce-cae/ (mimicking the GitHub Pages project path) on a free port.

Usage:
  python3 tests/serve.py [--fixtures] [--port N]

Prints "Serving on http://127.0.0.1:<port>/fce-cae/" once ready, then serves forever.
--fixtures serves tests/fixtures/data/ at /fce-cae/data/ instead of the (likely empty,
during development) real output/data/ directory.
"""
import argparse
import http.server
import socket
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # output/
FIXTURES = ROOT / "tests" / "fixtures" / "data"
PREFIX = "/fce-cae"

EXTRA_MIME = {
    ".webmanifest": "application/manifest+json",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".json": "application/json",
    ".svg": "image/svg+xml",
}


def safe_join(base: Path, rel_path: str) -> Path:
    parts = [p for p in rel_path.split("/") if p not in ("", ".", "..")]
    target = base
    for p in parts:
        target = target / p
    return target


def make_handler(fixtures: bool):
    class Handler(http.server.BaseHTTPRequestHandler):
        server_version = "FceCaeTestServer/1.0"

        def _resolve(self):
            parsed = urllib.parse.urlsplit(self.path)
            p = urllib.parse.unquote(parsed.path)
            if p.startswith(PREFIX):
                p = p[len(PREFIX):] or "/"
            else:
                return None
            if fixtures and p.startswith("/data/"):
                rest = p[len("/data/"):]
                target = safe_join(FIXTURES, rest)
            else:
                target = safe_join(ROOT, p.lstrip("/"))
            if target.is_dir():
                target = target / "index.html"
            return target

        def _send_file(self, target, head_only=False):
            if target is None or not target.exists() or not target.is_file():
                self.send_response(404)
                self.send_header("Content-Type", "text/plain; charset=utf-8")
                self.end_headers()
                if not head_only:
                    self.wfile.write(b"Not found")
                return
            ext = target.suffix.lower()
            ctype = EXTRA_MIME.get(ext)
            if not ctype:
                import mimetypes
                ctype, _ = mimetypes.guess_type(str(target))
                ctype = ctype or "application/octet-stream"
            data = target.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if not head_only:
                self.wfile.write(data)

        def do_GET(self):
            self._send_file(self._resolve())

        def do_HEAD(self):
            self._send_file(self._resolve(), head_only=True)

        def log_message(self, fmt, *args):
            pass  # keep test output quiet

    return Handler


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fixtures", action="store_true")
    ap.add_argument("--port", type=int, default=0)
    args = ap.parse_args()

    if args.port:
        port = args.port
    else:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]

    handler_cls = make_handler(args.fixtures)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler_cls)
    print(f"Serving on http://127.0.0.1:{port}{PREFIX}/", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
