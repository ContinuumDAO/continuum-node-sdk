#!/usr/bin/env python3
"""Fetch one Reddit post plus ranked reply context."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

from comment_fetch import collect_comments_flat
from reddit_client import get_reddit


def post_record(submission) -> dict:
    created = datetime.fromtimestamp(submission.created_utc, tz=timezone.utc).isoformat()
    return {
        "subreddit": str(submission.subreddit.display_name),
        "post_id": str(submission.id),
        "title": submission.title or "",
        "selftext": submission.selftext or "",
        "score": int(submission.score or 0),
        "upvote_ratio": float(submission.upvote_ratio)
        if submission.upvote_ratio is not None
        else None,
        "num_comments": int(submission.num_comments or 0),
        "created_at": created,
        "url": str(submission.url) if submission.url else "",
        "permalink": str(submission.permalink) if submission.permalink else "",
    }


def load_submission(reddit, payload: dict):
    post_id = str(payload.get("post_id") or "").strip()
    permalink = str(payload.get("permalink") or "").strip()
    if post_id:
        return reddit.submission(id=post_id)
    if permalink:
        return reddit.submission(url=permalink)
    raise RuntimeError("post_id or permalink is required")


def get_thread(payload: dict) -> dict:
    reddit = get_reddit()
    submission = load_submission(reddit, payload)
    max_comments = int(payload.get("max_comments", 200))
    max_depth = int(payload.get("max_depth", 3))
    sort = str(payload.get("sort") or "top")
    replace_more_limit = int(payload.get("replace_more_limit", 0))

    comments = collect_comments_flat(
        submission,
        max_comments=max_comments,
        max_depth=max_depth,
        replace_more_limit=replace_more_limit,
        sort=sort,
    )
    return {"post": post_record(submission), "comments": comments}


def main() -> None:
    payload = json.load(sys.stdin)
    result = get_thread(payload)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
