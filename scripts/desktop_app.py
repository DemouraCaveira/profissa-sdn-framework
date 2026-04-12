#!/usr/bin/env python3
"""
NetOps Studio — Desktop launcher.

Starts the FastAPI backend and (optionally) the SPA frontend, then opens
a pywebview window.  Works when invoked from a terminal or a desktop icon.

Log file: /tmp/profissa_app.log
"""
from __future__ import annotations

import argparse
import atexit
import logging
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen
import socket

# ── logging setup ─────────────────────────────────────────────────────────────
LOG_FILE = "/tmp/profissa_app.log"
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("profissa")

ROOT = Path(__file__).resolve().parents[1]


# ── helpers ───────────────────────────────────────────────────────────────────

def _show_error(title: str, message: str) -> None:
    """Show an error dialog using tkinter (stdlib) and also log it."""
    log.error("%s: %s", title, message)
    try:
        import tkinter as tk
        import tkinter.messagebox as mb
        root = tk.Tk()
        root.withdraw()
        mb.showerror(title, message)
        root.destroy()
    except Exception:
        print(f"ERROR — {title}: {message}", file=sys.stderr)


def _wait_http(url: str, timeout_sec: float = 15.0) -> None:
    deadline = time.time() + timeout_sec
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception as exc:
            last_error = exc
            time.sleep(0.3)
    raise RuntimeError(f"Timeout waiting for {url}: {last_error}")


def _port_open(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return True
    except Exception:
        return False


def _start_backend(port: int) -> subprocess.Popen:
    env = os.environ.copy()
    env.setdefault(
        "PLATFORM_CONFIG_PATH",
        str(ROOT / "platform" / "experiments" / "platform_config.json"),
    )
    env.setdefault("REAL_COLLECTION", "1")
    env.setdefault("AUTO_COLLECT_INTERVAL", "5")
    env["PYTHONPATH"] = str(ROOT)
    cmd = [
        sys.executable, "-m", "uvicorn",
        "platform.backend.api.app:app",
        "--host", "127.0.0.1",
        "--port", str(port),
    ]
    log.info("Starting backend: %s", " ".join(cmd))
    return subprocess.Popen(cmd, cwd=str(ROOT), env=env)


def _start_frontend(port: int) -> subprocess.Popen:
    frontend_dist = ROOT / "platform" / "frontend" / "dist"
    cmd = [
        sys.executable,
        str(ROOT / "scripts" / "serve_spa.py"),
        "--dir", str(frontend_dist),
        "--host", "127.0.0.1",
        "--port", str(port),
    ]
    log.info("Starting frontend: %s", " ".join(cmd))
    return subprocess.Popen(cmd, cwd=str(ROOT))


# ── main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="NetOps Studio Desktop App")
    parser.add_argument("--backend-port", type=int, default=8000)
    parser.add_argument("--frontend-port", type=int, default=5173)
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Start services and exit after health check (smoke test mode)",
    )
    args = parser.parse_args()

    log.info("Profissa desktop app starting. ROOT=%s", ROOT)

    backend: subprocess.Popen | None = None
    frontend: subprocess.Popen | None = None

    if not _port_open("127.0.0.1", args.backend_port):
        try:
            backend = _start_backend(args.backend_port)
        except Exception as exc:
            _show_error("Profissa — Backend Error", f"Could not start backend:\n{exc}")
            sys.exit(1)
    else:
        log.info("Backend already running on port %d", args.backend_port)

    if not _port_open("127.0.0.1", args.frontend_port):
        try:
            frontend = _start_frontend(args.frontend_port)
        except Exception as exc:
            _show_error("Profissa — Frontend Error", f"Could not start frontend:\n{exc}")
            sys.exit(1)
    else:
        log.info("Frontend already running on port %d", args.frontend_port)

    def _shutdown() -> None:
        log.info("Shutting down services …")
        for proc in (frontend, backend):
            if proc is None:
                continue
            try:
                proc.terminate()
            except Exception:
                pass
        time.sleep(0.5)
        for proc in (frontend, backend):
            if proc is None:
                continue
            try:
                if proc.poll() is None:
                    proc.kill()
            except Exception:
                pass

    atexit.register(_shutdown)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))

    try:
        log.info("Waiting for backend …")
        _wait_http(f"http://127.0.0.1:{args.backend_port}/health", timeout_sec=20)
        log.info("Backend ready ✔")
    except RuntimeError as exc:
        _show_error("Profissa — Startup Error", f"Backend did not start in time:\n{exc}\n\nCheck log: {LOG_FILE}")
        sys.exit(1)

    try:
        log.info("Waiting for frontend …")
        _wait_http(f"http://127.0.0.1:{args.frontend_port}/", timeout_sec=15)
        log.info("Frontend ready ✔")
    except RuntimeError as exc:
        _show_error("Profissa — Startup Error", f"Frontend did not start in time:\n{exc}\n\nCheck log: {LOG_FILE}")
        sys.exit(1)

    if args.headless:
        log.info("--headless mode: services up, exiting.")
        return

    # ── open webview window ───────────────────────────────────────────────────
    try:
        import webview  # type: ignore[import]
    except Exception as exc:
        _show_error(
            "Profissa — Missing Dependency",
            f"pywebview is not installed.\n\nRun the installer:\n  bash {ROOT}/desktop/install.sh\n\nError: {exc}",
        )
        sys.exit(1)

    log.info("Opening webview window …")
    try:
        webview.create_window(
            "NetOps Studio",
            f"http://127.0.0.1:{args.frontend_port}",
            width=1280,
            height=800,
            resizable=True,
        )
        webview.start(debug=False)
    except Exception as exc:
        _show_error(
            "Profissa — Window Error",
            f"Could not open application window:\n{exc}\n\n"
            f"The platform is still running at:\n"
            f"  http://127.0.0.1:{args.frontend_port}\n\n"
            f"Open that URL in your browser.\n\nLog: {LOG_FILE}",
        )
        log.info("Browser fallback mode — Ctrl-C to quit.")
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
