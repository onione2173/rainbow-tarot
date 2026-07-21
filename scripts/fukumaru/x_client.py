"""
Thin wrapper around the X (Twitter) API v2 (+ v1.1 media upload) for the
Fukumaru posting pipeline.

Auth: OAuth1.0a user context, via requests-oauthlib. This requires four
secrets: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET.
These are NOT yet configured as of this pipeline's initial build -- every
public function here must be safe to call (or, better, not be called) when
they're missing. Callers should always check is_configured() first.

Never log the values of these env vars.
"""
import os

import requests
from requests_oauthlib import OAuth1

X_API_KEY = os.environ.get("X_API_KEY", "")
X_API_SECRET = os.environ.get("X_API_SECRET", "")
X_ACCESS_TOKEN = os.environ.get("X_ACCESS_TOKEN", "")
X_ACCESS_TOKEN_SECRET = os.environ.get("X_ACCESS_TOKEN_SECRET", "")

MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json"
TWEETS_URL = "https://api.twitter.com/2/tweets"

ACCOUNT_HANDLE = "fukumaru_tarot"

REQUEST_TIMEOUT = 30


def is_configured() -> bool:
    return bool(X_API_KEY and X_API_SECRET and X_ACCESS_TOKEN and X_ACCESS_TOKEN_SECRET)


def _auth() -> OAuth1:
    return OAuth1(X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)


def upload_media(image_bytes: bytes) -> str:
    """Upload an image via the v1.1 media/upload endpoint, return media_id."""
    resp = requests.post(
        MEDIA_UPLOAD_URL,
        auth=_auth(),
        files={"media": image_bytes},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()["media_id_string"]


def create_post(text: str, media_id: str = None) -> tuple:
    """Create a tweet via v2 POST /2/tweets. Returns (post_id, post_url)."""
    payload = {"text": text}
    if media_id:
        payload["media"] = {"media_ids": [media_id]}

    resp = requests.post(
        TWEETS_URL,
        auth=_auth(),
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    post_id = resp.json()["data"]["id"]
    post_url = f"https://x.com/{ACCOUNT_HANDLE}/status/{post_id}"
    return post_id, post_url


def get_recent_own_posts_metrics(post_ids: list) -> list:
    """Look up public metrics for a list of our own post IDs (e.g. today's
    posted_today ids from the schedule state). Returns a list of
    {post_id, likes, replies, reposts} dicts."""
    if not post_ids:
        return []

    resp = requests.get(
        TWEETS_URL,
        auth=_auth(),
        params={"ids": ",".join(post_ids), "tweet.fields": "public_metrics"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get("data", [])

    results = []
    for item in data:
        metrics = item.get("public_metrics", {})
        results.append(
            {
                "post_id": item["id"],
                "likes": metrics.get("like_count", 0),
                "replies": metrics.get("reply_count", 0),
                "reposts": metrics.get("retweet_count", 0),
            }
        )
    return results


def has_positive_engagement(post_ids: list) -> bool:
    """True if any of today's posts has at least one like/reply/repost.
    Used for the evening bonus-post check. Never raises -- returns False on
    any error (missing config, API failure, etc.) so the caller can treat it
    as "no signal" rather than crashing the pipeline."""
    if not is_configured() or not post_ids:
        return False
    try:
        metrics = get_recent_own_posts_metrics(post_ids)
    except Exception as e:
        print(f"[x_client] Engagement lookup failed, treating as no signal: {e}")
        return False
    return any((m["likes"] + m["replies"] + m["reposts"]) > 0 for m in metrics)
