#!/usr/bin/env python3
"""
Entry point for the Fukumaru (@fukumaru_tarot) autonomous X posting pipeline.

Run hourly via GitHub Actions (.github/workflows/fukumaru-post.yml), fully
independent of any laptop or chat session staying alive. Each run:

  1. Loads/resets the daily schedule state (schedule_state.py).
  2. Skips (exit 0) if no target time has been reached yet.
  3. Skips (exit 0), without touching any counters, if X API keys aren't
     configured yet -- so nothing is lost/skipped once they're added later.
  4. Otherwise posts the next queue item (best-effort image, JP text only,
     never the KR translation), marks it posted, updates state.
  5. Runs the once-a-day evening engagement bonus check.
  6. Prints a clear summary line (the only feedback channel -- this becomes
     the GitHub Actions log).

Secrets are never printed.
"""
import sys
import traceback
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))

import gemini_image  # noqa: E402
import queue_parser  # noqa: E402
import schedule_state  # noqa: E402
import x_client  # noqa: E402

KST = ZoneInfo("Asia/Seoul")

REPO_ROOT = Path(__file__).resolve().parents[2]
QUEUE_FILE = REPO_ROOT / "marketing" / "fukumaru-queue-ja.md"
REFERENCE_IMAGE = REPO_ROOT / "marketing" / "assets" / "fukumaru-reference.png"


def main() -> int:
    now = datetime.now(KST)
    state = schedule_state.load_state()
    state = schedule_state.ensure_today(state, now=now)

    summary = []

    if not schedule_state.is_time_to_post(state, now=now):
        summary.append(
            f"Not time to post yet (now={now.strftime('%H:%M')} KST, "
            f"posts_done_today={state['posts_done_today']}/{len(state['target_times'])}, "
            f"target_times={state['target_times']})."
        )

    elif not x_client.is_configured():
        next_item = queue_parser.load_next_item(QUEUE_FILE)
        item_desc = f"#{next_item.number}" if next_item else "none available"
        summary.append(
            f"X API keys not configured yet -- skipping post (would have posted item {item_desc}). "
            "No counters advanced; will pick this back up once keys are added."
        )

    else:
        next_item = queue_parser.load_next_item(QUEUE_FILE)
        if next_item is None:
            summary.append("No unposted queue items available (excluding reserve #22). Nothing to post.")
        else:
            summary.append(f"Posting item #{next_item.number}.")

            image_bytes = None
            try:
                image_bytes = gemini_image.generate_image(next_item.jp_text, str(REFERENCE_IMAGE))
            except Exception as e:
                print(f"[post_next] Image generation failed, falling back to text-only: {e}")

            media_id = None
            if image_bytes:
                try:
                    media_id = x_client.upload_media(image_bytes)
                except Exception as e:
                    print(f"[post_next] Media upload failed, falling back to text-only: {e}")

            # Never post the KR line -- only next_item.jp_text.
            post_id, post_url = x_client.create_post(next_item.jp_text, media_id=media_id)

            posted_at_str = now.strftime("%Y-%m-%d %H:%M")
            queue_parser.mark_posted(QUEUE_FILE, next_item.number, post_url, posted_at_str)

            state["posts_done_today"] = state.get("posts_done_today", 0) + 1
            state.setdefault("posted_today", []).append(
                {
                    "item_number": next_item.number,
                    "post_id": post_id,
                    "posted_at": now.isoformat(),
                }
            )
            summary.append(
                f"SUCCESS -- posted item #{next_item.number} as {post_url} "
                f"(image={'yes' if media_id else 'no'})."
            )

    def engagement_check() -> bool:
        ids = [p["post_id"] for p in state.get("posted_today", [])]
        return x_client.has_positive_engagement(ids)

    bonus_already_evaluated = state.get("bonus_evaluated", False)
    state = schedule_state.maybe_apply_evening_bonus(state, engagement_check, now=now)
    if not bonus_already_evaluated and state.get("bonus_evaluated"):
        summary.append(
            f"Evening bonus evaluated -- target_count={state['target_count']}, "
            f"target_times={state['target_times']}."
        )

    schedule_state.save_state(state)

    print("=" * 70)
    print(f"[post_next] {now.isoformat()} -- " + " | ".join(summary))
    print(
        f"[post_next] posts_done_today={state['posts_done_today']}/{len(state['target_times'])} "
        f"target_count={state['target_count']} bonus_evaluated={state['bonus_evaluated']}"
    )
    print("=" * 70)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        print("[post_next] FATAL ERROR:")
        traceback.print_exc()
        sys.exit(1)
