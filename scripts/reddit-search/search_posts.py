#!/usr/bin/env python3
"""Search Reddit subreddits by query (PRAW)."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from comment_fetch import top_comment_snippets
from reddit_client import get_reddit, normalize_subreddit

TELEGRAM_SEARCH_DIR = Path(__file__).resolve().parent.parent / "telegram-search"
sys.path.insert(0, str(TELEGRAM_SEARCH_DIR))


def parse_since(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = raw.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def post_record(submission, sort_mode: str, comments: list | None = None) -> dict:
    created = datetime.fromtimestamp(submission.created_utc, tz=timezone.utc).isoformat()
    row = {
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
        "sort": sort_mode,
    }
    if comments is not None:
        row["comments"] = comments
    return row


def search_posts(payload: dict) -> list[dict]:
    query = str(payload.get("query", "")).strip()
    if not query:
        raise RuntimeError("query is required")

    subreddits = payload.get("subreddits") or []
    if not subreddits:
        raise RuntimeError("subreddits must be a non-empty list")

    max_results = int(payload.get("max_results", 50))
    max_per_sub = int(payload.get("max_posts_per_subreddit", 100))
    sort = str(payload.get("sort") or "relevance")
    time_filter = payload.get("time_filter")
    since = parse_since(payload.get("since"))
    include_comments = bool(payload.get("include_comments", False))
    max_comments_per_post = int(payload.get("max_comments_per_post", 10))
    comment_sort = str(payload.get("comment_sort") or "top")
    replace_more_limit = int(payload.get("replace_more_limit", 0))

    reddit = get_reddit()
    results: list[dict] = []

    for sub_name in subreddits:
        if len(results) >= max_results:
            break
        subreddit = reddit.subreddit(normalize_subreddit(str(sub_name)))
        search_kwargs: dict = {"limit": min(max_per_sub, max_results - len(results))}
        if sort:
            search_kwargs["sort"] = sort
        if time_filter:
            search_kwargs["time_filter"] = str(time_filter)

        for submission in subreddit.search(query, **search_kwargs):
            if since and datetime.fromtimestamp(submission.created_utc, tz=timezone.utc) < since:
                continue
            comments = None
            if include_comments:
                comments = top_comment_snippets(
                    submission,
                    max_comments=max_comments_per_post,
                    sort=comment_sort,
                    replace_more_limit=replace_more_limit,
                )
            results.append(post_record(submission, sort, comments))
            if len(results) >= max_results:
                break

    if sort == "top":
        results.sort(
            key=lambda row: (row.get("score") or 0, row.get("created_at") or ""),
            reverse=True,
        )
    else:
        results.sort(key=lambda row: row.get("created_at") or "", reverse=True)

    return results[:max_results]


def main() -> None:
    payload = json.load(sys.stdin)
    rows = search_posts(payload)
    json.dump(rows, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
