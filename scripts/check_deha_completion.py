#!/usr/bin/env python3
import re
import sys
from pathlib import Path


SEPARATOR = "──────────────────────────────────────────────────"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_deha_completion.py <deha-output-file>", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"file not found: {path}", file=sys.stderr)
        return 2

    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    for i, line in enumerate(lines):
        if line.strip() != SEPARATOR:
            continue

        window = lines[max(0, i - 6):i]
        saw_tool_output = any(
            "→" in item or "read_file(" in item or "grep(" in item or "run_shell(" in item
            for item in window
        )
        saw_nonempty_deha = any(re.match(r"^DEHA:\s*\S+", item) for item in window)

        if saw_tool_output and not saw_nonempty_deha:
            print("INCOMPLETE")
            print("tool output exists but no assistant completion text before separator")
            return 1

    print("COMPLETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
