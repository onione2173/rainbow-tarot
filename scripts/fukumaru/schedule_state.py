"""
Daily posting schedule state for the Fukumaru (@fukumaru_tarot) pipeline.

Persisted to marketing/state/fukumaru-schedule.json and committed back to the
repo by the GitHub Actions workflow after each run, so the schedule survives
across hourly cron invocations (each of which is a fresh checkout).

All wall-clock logic uses Asia/Seoul (KST) per the persona's operating policy.
"""
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_PATH = REPO_ROOT / "marketing" / "state" / "fukumaru-schedule.json"

# Daily minimum per persona-guide.md ("하루 최소 3개"). The evening bonus check
# can raise target_count above this for the rest of the day.
DAILY_MIN_POSTS = 3

# Spread target post times across roughly 07:00-23:00 KST.
WINDOW_START_MIN = 7 * 60
WINDOW_END_MIN = 23 * 60

# Evening bonus check only runs from this KST hour onward, once per day.
BONUS_CHECK_HOUR = 21
# The bonus post (if triggered) is scheduled this many minutes from "now".
BONUS_OFFSET_MIN_RANGE = (30, 60)


def today_str(now: datetime = None) -> str:
    now = now or datetime.now(KST)
    return now.strftime("%Y-%m-%d")


def _minutes_to_hhmm(total_minutes: int) -> str:
    total_minutes = max(0, min(24 * 60 - 1, total_minutes))
    h, m = divmod(total_minutes, 60)
    return f"{h:02d}:{m:02d}"


def _hhmm_to_datetime(hhmm: str, reference: datetime) -> datetime:
    h, m = (int(x) for x in hhmm.split(":"))
    return reference.replace(hour=h, minute=m, second=0, microsecond=0)


def generate_target_times(count: int) -> list:
    """Spread `count` random times across the posting window, non-clustered,
    by picking one random time inside each of `count` equal-width buckets."""
    if count <= 0:
        return []
    window = WINDOW_END_MIN - WINDOW_START_MIN
    bucket = window / count
    times_min = []
    for i in range(count):
        lo = WINDOW_START_MIN + i * bucket
        hi = WINDOW_START_MIN + (i + 1) * bucket
        times_min.append(int(random.uniform(lo, hi)))
    times_min.sort()
    return [_minutes_to_hhmm(t) for t in times_min]


def _default_state(date_str: str) -> dict:
    return {
        "date": date_str,
        "target_count": DAILY_MIN_POSTS,
        "target_times": generate_target_times(DAILY_MIN_POSTS),
        "posts_done_today": 0,
        "bonus_evaluated": False,
        "posted_today": [],
    }


def load_state() -> dict:
    if not STATE_PATH.exists():
        return _default_state(today_str())
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        print(f"[schedule_state] Could not read state file ({e}), starting fresh.")
        return _default_state(today_str())
    # Defensive defaults in case the schema grows over time.
    data.setdefault("posted_today", [])
    data.setdefault("bonus_evaluated", False)
    data.setdefault("posts_done_today", 0)
    data.setdefault("target_times", [])
    data.setdefault("target_count", DAILY_MIN_POSTS)
    return data


def save_state(state: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def ensure_today(state: dict, now: datetime = None) -> dict:
    """Reset the schedule if the stored date isn't today (KST)."""
    now = now or datetime.now(KST)
    current = today_str(now)
    if state.get("date") != current:
        return _default_state(current)
    return state


def is_time_to_post(state: dict, now: datetime = None) -> bool:
    """True if there's an unconsumed target time at or before `now`.

    target_times are consumed in order as posts happen: posts_done_today acts
    as the index of the next unconsumed slot.
    """
    now = now or datetime.now(KST)
    times = state.get("target_times", [])
    done = state.get("posts_done_today", 0)
    if done >= len(times):
        return False
    next_target = _hhmm_to_datetime(times[done], now)
    return now >= next_target


def maybe_apply_evening_bonus(state: dict, engagement_check_fn, now: datetime = None) -> dict:
    """Once per day, from BONUS_CHECK_HOUR KST onward, check for positive
    engagement and if found, add one more post slot for later today.

    `engagement_check_fn` is a zero-arg callable returning bool (kept as an
    injected dependency so this module doesn't need to know about the X API).
    Sets bonus_evaluated = True regardless of outcome so it only runs once/day.
    """
    now = now or datetime.now(KST)
    if state.get("bonus_evaluated"):
        return state
    if now.hour < BONUS_CHECK_HOUR:
        return state

    try:
        good_engagement = bool(engagement_check_fn())
    except Exception as e:
        print(f"[schedule_state] Evening engagement check failed, treating as no signal: {e}")
        good_engagement = False

    if good_engagement:
        offset = random.randint(*BONUS_OFFSET_MIN_RANGE)
        bonus_dt = now + timedelta(minutes=offset)
        bonus_time = bonus_dt.strftime("%H:%M")
        times = state.setdefault("target_times", [])
        times.append(bonus_time)
        times.sort()
        # target_count is derived from the final slot count, not
        # posts_done_today+1 -- if a bonus fires before all of today's
        # regular slots have been consumed yet (possible since the bonus
        # check window can start at 21:00 while a regular slot is still
        # later in the evening), posts_done_today+1 would undercount.
        state["target_count"] = len(times)
        print(f"[schedule_state] Evening bonus triggered: added slot {bonus_time} KST "
              f"(target_count now {state['target_count']}).")
    else:
        print("[schedule_state] Evening bonus check: no positive engagement signal, no bonus slot added.")

    state["bonus_evaluated"] = True
    return state
