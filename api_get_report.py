#Caso de uso
#PYTHONPATH=$(pwd) .venv/bin/python api_get_report.py \
#  --start-server \
#  --host 0.0.0.0 --port 8000 \
#  --config-path platform/experiments/platform_config.json \
#  --count 5 \
#  --collect-mode real \
#  --dump-raw \
#  --wait-ready 10 \
#  --server-log uvicorn.log \
#  --output api_get_report.txt

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
    parser.add_argument("--collect-mode", choices=["real", "synthetic"], default="real", help="Use /metrics/collect with this mode before each GET (default: real).")
    parser.add_argument("--no-collect", action="store_true", help="Disable automatic POST /metrics/collect calls.")
    parser.add_argument("--dump-raw", action="store_true", help="Append /metrics/export for each layer to the report (simplified extração).")
    parser.add_argument(
        "--layers",
        nargs="*",
        default=["physical", "link", "network", "transport", "application", "control", "dataplane"],
        help="Layers to export when --dump-raw is enabled.",
    )
    parser.add_argument("--raw-lines", type=int, default=200, help="Max lines per layer when dumping raw (default: 200).")
    parser.add_argument("--api-key", default=None, help="Optional API key sent as X-API-Key header.")
    parser.add_argument("--output", default="api_get_report.txt", help="Path to output txt file (default: api_get_report.txt).")
    parser.add_argument("--timeout", type=float, default=5.0, help="Request timeout in seconds (default: 5.0).")
    parser.add_argument("--start-server", action="store_true", help="Start uvicorn server automatically before running requests.")
    parser.add_argument("--host", default="0.0.0.0", help="Host for uvicorn when --start-server is set (default: 0.0.0.0).")
    parser.add_argument("--port", type=int, default=8000, help="Port for uvicorn when --start-server is set (default: 8000).")
    parser.add_argument("--config-path", default=None, help="Optional PLATFORM_CONFIG_PATH to export when starting the server.")
    parser.add_argument("--wait-start", type=float, default=2.0, help="Seconds to wait after starting the server before sending requests (default: 2.0).")
    parser.add_argument("--wait-ready", type=float, default=10.0, help="Max seconds to wait for /health when starting the server (default: 10.0).")
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
    # Enable real collection by default when requested
    if args.collect_mode == "real":
        env.setdefault("REAL_COLLECTION", "1")

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


def wait_for_health(client: httpx.Client, base_url: str, timeout: float, interval: float = 0.5) -> bool:
    end = time.time() + timeout
    url = f"{base_url}/health"
    while time.time() < end:
        try:
            resp = client.get(url)
            if resp.status_code == 200:
                return True
        except Exception:
            pass
        time.sleep(interval)
    return False


def main() -> None:
    args = parse_args()
    base_url: str = args.base_url.rstrip("/")
    endpoints: List[str] = args.endpoints
    count: int = args.count
    collect_enabled: bool = not args.no_collect
    collect_mode: str = args.collect_mode
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
        lines.append(f"Endpoints (cycled): {', '.join(endpoints)}")
        lines.append(f"Collect enabled: {collect_enabled} | mode: {collect_mode}")
        if args.dump_raw:
            lines.append(f"Dump raw: True | layers: {', '.join(args.layers)} | raw-lines: {args.raw_lines}\n")
        else:
            lines.append("")

        client = httpx.Client(headers=headers, timeout=args.timeout)

        # If we started the server, wait for /health to be ready
        if server_proc:
            ready = wait_for_health(client, base_url, args.wait_ready)
            lines.append(f"Server ready: {ready} (waited up to {args.wait_ready}s)\n")
            if not ready:
                output_path.write_text("\n".join(lines), encoding="utf-8")
                print("Server did not become ready; see report for details.")
                return
        for idx, endpoint in zip(range(1, count + 1), itertools.cycle(endpoints)):
            # Fire a collect before each GET, so JSONLs are populated
            if collect_enabled:
                collect_url = f"{base_url}/metrics/collect?mode={collect_mode}"
                try:
                    c_resp = client.post(collect_url)
                    lines.append(f"[collect {idx:02d}] mode={collect_mode} status={c_resp.status_code}\n")
                except Exception as exc:  # noqa: BLE001
                    lines.append(f"[collect {idx:02d}] mode={collect_mode} error={exc}\n")

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

        # Optionally dump raw exports per layer (simple extraction for researcher)
        if args.dump_raw:
            for layer in args.layers:
                export_url = f"{base_url}/metrics/export?layer={layer}"
                try:
                    resp = client.get(export_url)
                    body = resp.text
                    body_lines = body.splitlines()
                    if len(body_lines) > args.raw_lines:
                        body_lines = body_lines[-args.raw_lines :]
                        body = "\n".join(body_lines)
                        body += f"\n...[truncated to last {args.raw_lines} lines]"
                    lines.append(f"\n[raw export] layer={layer} status={resp.status_code}\n{body}\n")
                except Exception as exc:  # noqa: BLE001
                    lines.append(f"\n[raw export] layer={layer} error={exc}\n")

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
