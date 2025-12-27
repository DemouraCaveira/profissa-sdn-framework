from __future__ import annotations

import argparse
import datetime as dt
import itertools
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

import httpx


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run repeated GETs against the platform API and save results to a txt report.")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Base URL of the API (default: http://localhost:8000)")
    parser.add_argument("--endpoints", nargs="*", default=["health", "topologies", "flows", "metrics/definitions"], help="List of endpoints (relative paths) to cycle through.")
    parser.add_argument("--count", type=int, default=40, help="Total number of GET requests to perform (default: 40).")
    parser.add_argument("--api-key", default=None, help="Optional API key sent as X-API-Key header.")
    parser.add_argument("--output", default="api_get_report.txt", help="Path to output txt file (default: api_get_report.txt).")
    parser.add_argument("--timeout", type=float, default=5.0, help="Request timeout in seconds (default: 5.0).")
    parser.add_argument("--start-server", action="store_true", help="Start uvicorn server automatically before running requests.")
    parser.add_argument("--host", default="0.0.0.0", help="Host for uvicorn when --start-server is set (default: 0.0.0.0).")
    parser.add_argument("--port", type=int, default=8000, help="Port for uvicorn when --start-server is set (default: 8000).")
    parser.add_argument("--config-path", default=None, help="Optional PLATFORM_CONFIG_PATH to export when starting the server.")
    parser.add_argument("--wait-start", type=float, default=2.0, help="Seconds to wait after starting the server before sending requests (default: 2.0).")
    parser.add_argument("--server-log", default=None, help="If set, append uvicorn stdout/stderr to this file when starting automatically.")
    parser.add_argument("--python-bin", default=sys.executable, help="Python interpreter to use for uvicorn (default: current interpreter).")
    return parser.parse_args()


def start_server(args: argparse.Namespace) -> Optional[subprocess.Popen]:
    if not args.start_server:
        return None

    env = os.environ.copy()
    if args.api_key:
        env["API_KEY"] = args.api_key
    if args.config_path:
        env["PLATFORM_CONFIG_PATH"] = args.config_path

    cmd = [
        args.python_bin,
        "-m",
        "uvicorn",
        "platform.backend.api.app:app",
        "--host",
        args.host,
        "--port",
        str(args.port),
    ]

    log_file = None
    stdout_target = subprocess.DEVNULL
    stderr_target = subprocess.STDOUT
    if args.server_log:
        log_file = open(args.server_log, "a", encoding="utf-8")
        stdout_target = log_file
        stderr_target = log_file

    proc = subprocess.Popen(cmd, env=env, stdout=stdout_target, stderr=stderr_target)
    # Give the server a moment to come up
    time.sleep(args.wait_start)
    return proc


def main() -> None:
    args = parse_args()
    base_url: str = args.base_url.rstrip("/")
    endpoints: List[str] = args.endpoints
    count: int = args.count
    output_path = Path(args.output)

    server_proc: Optional[subprocess.Popen] = None
    try:
        server_proc = start_server(args)

        headers = {}
        if args.api_key:
            headers["X-API-Key"] = args.api_key

        now = dt.datetime.utcnow().isoformat() + "Z"
        lines: List[str] = []
        lines.append(f"API GET report generated at {now}\n")
        lines.append(f"Base URL: {base_url}")
        lines.append(f"Total requests: {count}")
        lines.append(f"Endpoints (cycled): {', '.join(endpoints)}\n")

        client = httpx.Client(headers=headers, timeout=args.timeout)
        for idx, endpoint in zip(range(1, count + 1), itertools.cycle(endpoints)):
            url = f"{base_url}/{endpoint.lstrip('/') }"
            start = dt.datetime.utcnow()
            try:
                resp = client.get(url)
                duration_ms = (dt.datetime.utcnow() - start).total_seconds() * 1000
                body_preview = resp.text
                if len(body_preview) > 800:
                    body_preview = body_preview[:800] + "... [truncated]"
                lines.append(
                    f"[{idx:02d}] {endpoint} | status={resp.status_code} | {duration_ms:.1f} ms\n{body_preview}\n"
                )
            except Exception as exc:  # noqa: BLE001
                duration_ms = (dt.datetime.utcnow() - start).total_seconds() * 1000
                lines.append(f"[{idx:02d}] {endpoint} | error after {duration_ms:.1f} ms | {exc}\n")

        output_path.write_text("\n".join(lines), encoding="utf-8")
        print(f"Report saved to {output_path.resolve()}")
    finally:
        if server_proc:
            server_proc.terminate()
            try:
                server_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server_proc.kill()


if __name__ == "__main__":
    main()
