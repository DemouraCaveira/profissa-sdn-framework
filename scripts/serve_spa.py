#!/usr/bin/env python3
from __future__ import annotations

import argparse
import socket
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Backend to proxy /api/* requests to
PROXY_TARGET_HOST = "127.0.0.1"
PROXY_TARGET_PORT = 8000


class SPAHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def _proxy_to_backend(self):
        """Forward the request using a raw socket (supports SSE streaming)."""
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else b""

        parsed = urllib.parse.urlparse(self.path)
        upstream_path = parsed.path
        if parsed.query:
            upstream_path += "?" + parsed.query

        request_lines = [
            f"{self.command} {upstream_path} HTTP/1.1",
            f"Host: {PROXY_TARGET_HOST}:{PROXY_TARGET_PORT}",
        ]
        for k, v in self.headers.items():
            if k.lower() in ("host", "connection", "proxy-connection"):
                continue
            request_lines.append(f"{k}: {v}")
        request_lines.extend(["Connection: close", "", ""])
        raw_request = "\r\n".join(request_lines).encode() + body

        try:
            sock = socket.create_connection((PROXY_TARGET_HOST, PROXY_TARGET_PORT), timeout=10)
        except Exception as exc:
            self.send_error(502, f"Bad Gateway: {exc}")
            return

        try:
            sock.sendall(raw_request)

            response_buf = b""
            while b"\r\n\r\n" not in response_buf:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response_buf += chunk

            header_part, _, body_start = response_buf.partition(b"\r\n\r\n")
            lines = header_part.decode("utf-8", errors="replace").split("\r\n")
            try:
                status_code = int(lines[0].split(" ", 2)[1])
            except (IndexError, ValueError):
                status_code = 502

            self.send_response(status_code)
            skip = {"transfer-encoding", "connection"}
            for line in lines[1:]:
                if ": " in line:
                    k, _, v = line.partition(": ")
                    if k.lower() not in skip:
                        self.send_header(k, v)
            self.end_headers()

            if body_start:
                self.wfile.write(body_start)
                self.wfile.flush()

            sock.settimeout(None)
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            pass
        finally:
            sock.close()

    def do_GET(self):
        if self.path.startswith("/api"):
            self._proxy_to_backend()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api"):
            self._proxy_to_backend()
        else:
            self.send_error(405)

    def do_PUT(self):
        if self.path.startswith("/api"):
            self._proxy_to_backend()
        else:
            self.send_error(405)

    def do_DELETE(self):
        if self.path.startswith("/api"):
            self._proxy_to_backend()
        else:
            self.send_error(405)

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

    def log_message(self, fmt, *args):
        pass


def main():
    global PROXY_TARGET_HOST, PROXY_TARGET_PORT

    parser = argparse.ArgumentParser(description="Serve SPA with history fallback and API proxy.")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--dir", default=".")
    parser.add_argument("--backend-host", default=PROXY_TARGET_HOST)
    parser.add_argument("--backend-port", type=int, default=PROXY_TARGET_PORT)
    args = parser.parse_args()

    PROXY_TARGET_HOST = args.backend_host
    PROXY_TARGET_PORT = args.backend_port

    directory = str(Path(args.dir).resolve())
    handler = lambda *h, **kw: SPAHandler(*h, directory=directory, **kw)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Serving {directory} on http://{args.host}:{args.port}")
    print(f"Proxying /api/* -> http://{PROXY_TARGET_HOST}:{PROXY_TARGET_PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
