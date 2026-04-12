#!/usr/bin/env python3
from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir():
            index = path / "index.html"
            if index.exists():
                self.path = "/" + index.name
                return super().send_head()
        if not path.exists():
            fallback = Path(self.directory or ".") / "index.html"
            if fallback.exists():
                self.path = "/index.html"
        return super().send_head()


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve SPA with history fallback.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--dir", default=".")
    args = parser.parse_args()

    directory = str(Path(args.dir).resolve())
    handler = lambda *h_args, **h_kwargs: SPAHandler(*h_args, directory=directory, **h_kwargs)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {directory} on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
