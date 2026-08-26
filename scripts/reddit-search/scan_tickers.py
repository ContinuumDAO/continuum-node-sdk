#!/usr/bin/env python3
"""Scan Reddit subreddit listings for ticker mentions."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from comment_fetch import top_comment_snippets
from reddit_client import get_reddit, normalize_subreddit

TELEGRAM_SEARCH_DIR = Path(__file__).resolve().parent.parent / "telegram-search"
sys.path.insert(0, str(TELEGRAM_SEARCH_DIR))
from ticker_extract import config_from_dict, find_tickers_in_message


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


def post_record(submission, sort_mode: str, matched: list[str], comments: list | None = None) -> dict:
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
        "matched_tickers": matched,
    }
    if comments is not None:
        row["comments"] = comments
    return row


def listing_for_subreddit(subreddit, sort: str, time_filter: str | None, limit: int):
    if sort == "top":
        return subreddit.top(time_filter=time_filter or "month", limit=limit)
    return subreddit.new(limit=limit)


def scan_subreddits(payload: dict) -> list[dict]:
    subreddit_specs = payload.get("subreddit_specs") or []
    if not subreddit_specs:
        subreddits = payload.get("subreddits") or []
        subreddit_specs = [{"name": s} for s in subreddits]
    if not subreddit_specs:
        raise RuntimeError("subreddits must be a non-empty list")

    tickers_raw = payload.get("tickers")
    allowlist: list[str] | None
    if tickers_raw is None:
        allowlist = None
    else:
        allowlist = [str(t).strip() for t in tickers_raw if str(t).strip()]
        if not allowlist:
            allowlist = None

    detection = config_from_dict(payload.get("ticker_detection"))
    max_results = int(payload.get("max_results", 50))
    max_per_sub = int(payload.get("max_posts_per_subreddit", 100))
    default_sort = str(payload.get("default_sort") or "new")
    default_time_filter = payload.get("default_time_filter")
    since = parse_since(payload.get("since"))
    include_comments = bool(payload.get("include_comments", False))
    max_comments_per_post = int(payload.get("max_comments_per_post", 10))
    comment_sort = str(payload.get("comment_sort") or "top")
    replace_more_limit = int(payload.get("replace_more_limit", 0))

    reddit = get_reddit()
    results: list[dict] = []

    for spec in subreddit_specs:
        if len(results) >= max_results:
            break
        name = normalize_subreddit(str(spec.get("name", "")))
        if not name:
            continue
        sort = str(spec.get("sort") or default_sort)
        time_filter = spec.get("time_filter") or default_time_filter
        subreddit = reddit.subreddit(name)

        for submission in listing_for_subreddit(subreddit, sort, time_filter, max_per_sub):
            if since and datetime.fromtimestamp(submission.created_utc, tz=timezone.utc) < since:
                continue
            text = f"{submission.title or ''}\n{submission.selftext or ''}".strip()
            if not text:
                continue
            matched = find_tickers_in_message(text, allowlist, detection)
            if not matched:
                continue
            comments = None
            if include_comments:
                comments = top_comment_snippets(
                    submission,
                    max_comments=max_comments_per_post,
                    sort=comment_sort,
                    replace_more_limit=replace_more_limit,
                )
            results.append(post_record(submission, sort, matched, comments))

    effective_sort = str(subreddit_specs[0].get("sort") or default_sort) if subreddit_specs else default_sort
    if effective_sort == "top":
        results.sort(
            key=lambda row: (row.get("score") or 0, row.get("created_at") or ""),
            reverse=True,
        )
    else:
        results.sort(key=lambda row: row.get("created_at") or "", reverse=True)

    return results[:max_results]


def main() -> None:
    payload = json.load(sys.stdin)
    rows = scan_subreddits(payload)
    json.dump(rows, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
