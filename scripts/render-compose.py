#!/usr/bin/env python3
"""Draw the website's copy of quickstart-compose.yml from the file itself.

The block on fossstudio.org was marked up by hand, span by span, with
nothing checking it still matched the file people download. It drifted:
the file learned to publish ports while the page still showed host
networking, so everybody pasting from the site got the old stack. A page
that claims to be a file has to be made from that file.

Run it after any change to quickstart-compose.yml; render-compose-test
fails if you forget.
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPOSE = ROOT / "quickstart-compose.yml"
PAGE = ROOT / "docs" / "index.html"
OPEN, CLOSE = '<pre id="composeSrc">', "</pre>"

# The values a person must replace. There are none left: the domain, the
# login and the secrets are all settings inside the studio now, so the
# paste is the paste. The set stays because the renderer still colors
# whatever is in it, and the next thing that has to be edited by hand
# goes here rather than being marked up by eye.
CHANGE_ME = set()


def span(cls, text):
    return f'<span class="{cls}">{html.escape(text, quote=False)}</span>'


def render(line):
    if not line.strip():
        return ""
    if line.lstrip().startswith("#"):
        return span("c", line)

    # key: value, with an optional trailing comment
    m = re.match(r"^(\s*)([A-Za-z0-9_.-]+):(\s*)(.*)$", line)
    if not m:
        return html.escape(line, quote=False)
    indent, key, gap, rest = m.groups()

    comment = ""
    c = re.search(r"(\s+#.*)$", rest)
    if c:
        comment = c.group(1)
        rest = rest[: c.start()]

    out = indent + span("k", key + ":") + gap
    if rest:
        cls = "hl" if key in CHANGE_ME else ("a" if rest.startswith(("&", "*")) else "v")
        out += span(cls, rest)
    if comment:
        out += span("c", comment)
    return out


def main():
    body = "\n".join(render(l) for l in COMPOSE.read_text().rstrip("\n").split("\n"))
    page = PAGE.read_text()
    start = page.index(OPEN) + len(OPEN)
    end = page.index(CLOSE, start)
    fresh = page[:start] + body + "\n" + page[end:]
    if "--check" in sys.argv:
        if fresh != page:
            print("docs/index.html is behind quickstart-compose.yml: run scripts/render-compose.py")
            return 1
        return 0
    PAGE.write_text(fresh)
    print(f"rendered {len(body.splitlines())} lines into docs/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
