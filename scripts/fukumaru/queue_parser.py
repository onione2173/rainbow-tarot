"""
Parses and updates marketing/fukumaru-queue-ja.md, the Fukumaru content queue.

File structure (see marketing/fukumaru-queue-ja.md for the real thing):

    ## Day 1

    ## [ ] 1. <korean description, for humans only>
    JP: <actual post text -- this is the only thing that ever gets posted>
    KR: <korean translation, for human review only -- NEVER post this>

    ---

    ## 예비 포스트 (...)

    ## [ ] 22. FAQ ...
    JP: ...
    KR: ...

Item 22 lives under the "예비 포스트" (reserve/FAQ) heading and is manual-
trigger-only -- it must never be picked by automatic sequential selection.
"""
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

ITEM_RE = re.compile(r"^## \[( |x)\] (\d+)\.\s*(.*)$")
DAY_HEADING_RE = re.compile(r"^## Day \d+\b")
JP_RE = re.compile(r"^JP:\s*(.*)$")
KR_RE = re.compile(r"^KR:\s*(.*)$")


@dataclass
class QueueItem:
    number: int
    jp_text: Optional[str]
    checked: bool
    in_reserve: bool
    header_line_idx: int


def _iter_items(lines):
    """Yield a QueueItem for every '## [ ]'/'## [x]' entry in the file,
    tracking whether we're currently inside the reserve/FAQ section (any
    non-"Day N" '## ' heading turns reserve mode on until the next Day
    heading)."""
    in_reserve = False
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.startswith("## "):
            m = ITEM_RE.match(line)
            if m:
                checked = m.group(1) == "x"
                number = int(m.group(2))
                jp_text = None
                j = i + 1
                while j < n and not lines[j].startswith("## "):
                    jm = JP_RE.match(lines[j])
                    if jm:
                        jp_text = jm.group(1).strip()
                    j += 1
                yield QueueItem(
                    number=number,
                    jp_text=jp_text,
                    checked=checked,
                    in_reserve=in_reserve,
                    header_line_idx=i,
                )
                i = j
                continue
            else:
                # Some other '## ' heading. "Day N" headings mean we're back
                # in the normal sequential section; anything else (e.g. the
                # "예비 포스트" heading) means reserve/manual-only items follow.
                in_reserve = not bool(DAY_HEADING_RE.match(line))
        i += 1


def find_next_item(md_text: str) -> Optional[QueueItem]:
    """Return the lowest-numbered unchecked, non-reserve item, or None."""
    lines = md_text.splitlines()
    candidates = [
        it
        for it in _iter_items(lines)
        if not it.checked and not it.in_reserve and it.jp_text
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda it: it.number)


def load_next_item(file_path) -> Optional[QueueItem]:
    text = Path(file_path).read_text(encoding="utf-8")
    return find_next_item(text)


def mark_posted(file_path, item_number: int, post_url: str, posted_at_str: str) -> None:
    """Flip '## [ ] N.' to '## [x] N.' and insert a POSTED: line right after
    that item's KR: line (falls back to right after the header if no KR: line
    is found, though every real item has one)."""
    path = Path(file_path)
    lines = path.read_text(encoding="utf-8").splitlines()
    header_re = re.compile(rf"^## \[ \] {item_number}\.")

    for i, line in enumerate(lines):
        if header_re.match(line):
            lines[i] = re.sub(r"^## \[ \]", "## [x]", line)

            j = i + 1
            insert_at = None
            while j < len(lines) and not lines[j].startswith("## "):
                if KR_RE.match(lines[j]):
                    insert_at = j + 1
                    break
                j += 1
            if insert_at is None:
                insert_at = i + 1

            posted_line = f"POSTED: {posted_at_str} KST — {post_url}"
            lines.insert(insert_at, posted_line)
            break
    else:
        raise ValueError(f"queue item {item_number} not found (or already marked posted)")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
